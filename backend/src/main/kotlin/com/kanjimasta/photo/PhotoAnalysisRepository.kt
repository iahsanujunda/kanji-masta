package com.kanjimasta.photo

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.photo.PhotoFailureCode
import com.kanjimasta.photo.PhotoSessionStatus
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.kanji.UserKanjiTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.LockingMode
import org.ktorm.support.postgresql.LockingWait
import org.ktorm.support.postgresql.insertOrUpdate
import org.ktorm.support.postgresql.locking
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class PhotoAnalysisClaim(
    val sessionId: UUID,
    val userId: String,
    val imageUrl: String,
    val attemptId: UUID,
    val claimToken: UUID,
    val modelConfigVersion: Long?,
    val modelId: String,
)

data class KanjiReference(
    val id: UUID,
    val character: String,
    val onyomi: List<String>,
    val kunyomi: List<String>,
    val meanings: List<String>,
    val frequency: Int?,
)

class PhotoAnalysisRepository(
    private val db: Database,
    private val modelConfigs: AiModelConfigRepository = AiModelConfigRepository(db),
) {
    fun translationModel(): String = modelConfigs.requireActive().translationModel

    fun recordProviderCost(claim: PhotoAnalysisClaim, cost: Long) {
        db.useTransaction { recordCost(claim, cost) }
    }

    fun claim(
        sessionId: UUID,
        taskAttempt: Int,
        claimedBy: String,
        leaseSeconds: Long,
    ): PhotoAnalysisClaim? = db.useTransaction {
        val session = db.from(PhotoSessionTable)
            .select(
                PhotoSessionTable.id,
                PhotoSessionTable.userId,
                PhotoSessionTable.imageUrl,
                PhotoSessionTable.status,
                PhotoSessionTable.attempts,
            )
            .where { PhotoSessionTable.id eq sessionId }
            .locking(LockingMode.FOR_UPDATE)
            .map { row ->
                SessionSnapshot(
                    id = row[PhotoSessionTable.id]!!,
                    userId = row[PhotoSessionTable.userId].orEmpty(),
                    imageUrl = row[PhotoSessionTable.imageUrl].orEmpty(),
                    status = row[PhotoSessionTable.status].orEmpty(),
                    attempts = row[PhotoSessionTable.attempts] ?: 0,
                )
            }
            .firstOrNull() ?: return@useTransaction null

        if (session.status in TERMINAL_PHOTO_STATUSES) return@useTransaction null

        var attempt = latestAttempt(sessionId, lock = true)
        if (attempt?.status == "processing") {
            val platformRetry = taskAttempt > 0 && attempt.claimedBy == claimedBy
            val leaseExpired = attempt.leaseUntil?.isBefore(Instant.now()) == true
            if (!platformRetry && !leaseExpired) return@useTransaction null
            terminalizeExpired(attempt.id)
            attempt = createAttempt(
                jobId = sessionId,
                attemptNumber = attempt.attemptNumber + 1,
                trigger = if (platformRetry) "platform_retry" else "reconciler",
                modelConfigVersion = attempt.modelConfigVersion,
                modelId = attempt.modelId,
            )
        } else if (attempt != null && attempt.status != "pending") {
            return@useTransaction null
        } else if (attempt == null) {
            val config = modelConfigs.getActive()
            attempt = createAttempt(
                jobId = sessionId,
                attemptNumber = session.attempts.coerceAtLeast(0) + 1,
                trigger = "reconciler",
                modelConfigVersion = config?.version,
                modelId = config?.photoAnalysisModel,
            )
        }

        val fallbackConfig = if (attempt.modelId == null) modelConfigs.requireActive() else null
        val modelId = attempt.modelId ?: fallbackConfig!!.photoAnalysisModel
        val modelConfigVersion = attempt.modelConfigVersion ?: fallbackConfig?.version
        val token = UUID.randomUUID()
        val now = Instant.now()
        val claimed = db.update(JobAttemptTable) {
            set(it.status, "processing")
            set(it.startedAt, now)
            set(it.claimToken, token)
            set(it.leaseUntil, now.plusSeconds(leaseSeconds))
            set(it.claimedBy, claimedBy)
            set(it.modelConfigVersion, modelConfigVersion)
            set(it.modelId, modelId)
            where { (it.id eq attempt.id) and (it.status eq "pending") }
        }
        if (claimed != 1) return@useTransaction null

        db.update(PhotoSessionTable) {
            set(it.status, PhotoSessionStatus.PROCESSING.name)
            set(it.failureCode, null)
            set(it.attempts, attempt.attemptNumber)
            where { it.id eq sessionId }
        }
        db.update(PhotoSessionTaskTable) {
            set(it.status, "PROCESSING")
            set(it.claimedBy, claimedBy)
            set(it.leaseUntil, now.plusSeconds(leaseSeconds))
            where {
                (it.photoSessionId eq sessionId) and
                    (it.taskType eq "VISUAL_ANALYSIS") and
                    (it.pipelineVersion eq 2)
            }
        }
        PhotoAnalysisClaim(
            sessionId = sessionId,
            userId = session.userId,
            imageUrl = session.imageUrl,
            attemptId = attempt.id,
            claimToken = token,
            modelConfigVersion = modelConfigVersion,
            modelId = modelId,
        )
    }

    fun knownKanji(userId: String): List<String> = db.from(UserKanjiTable)
        .innerJoin(KanjiMasterTable, on = UserKanjiTable.kanjiId eq KanjiMasterTable.id)
        .select(KanjiMasterTable.character)
        .where { UserKanjiTable.userId eq userId }
        .mapNotNull { it[KanjiMasterTable.character] }

    fun lookupKanji(characters: List<String>): Map<String, KanjiReference> {
        if (characters.isEmpty()) return emptyMap()
        return db.from(KanjiMasterTable)
            .select()
            .where { KanjiMasterTable.character inList characters.distinct() }
            .map { row ->
                KanjiReference(
                    id = row[KanjiMasterTable.id]!!,
                    character = row[KanjiMasterTable.character].orEmpty(),
                    onyomi = row[KanjiMasterTable.onyomi].orEmpty(),
                    kunyomi = row[KanjiMasterTable.kunyomi].orEmpty(),
                    meanings = row[KanjiMasterTable.meanings].orEmpty(),
                    frequency = row[KanjiMasterTable.frequency],
                )
            }
            .associateBy { it.character }
    }

    fun markTranslationProcessing(claim: PhotoAnalysisClaim) {
        db.useTransaction {
            if (!ownsActiveClaim(claim)) return@useTransaction
            db.update(PhotoSessionTaskTable) {
                set(it.status, "DONE")
                set(it.finishedAt, Instant.now())
                where {
                    (it.photoSessionId eq claim.sessionId) and
                        (it.taskType eq "VISUAL_ANALYSIS") and
                        (it.pipelineVersion eq 2)
                }
            }
            db.update(PhotoSessionTaskTable) {
                set(it.status, "PROCESSING")
                where {
                    (it.photoSessionId eq claim.sessionId) and
                        (it.taskType eq "TRANSLATION") and
                        (it.pipelineVersion eq 2)
                }
            }
        }
    }

    fun complete(
        claim: PhotoAnalysisClaim,
        fullText: String,
        translation: String,
        enrichedJson: String,
        costMicrodollars: Long,
    ): Boolean =
        db.useTransaction {
            recordCost(claim, costMicrodollars)
            if (!ownsActiveClaim(claim)) return@useTransaction false
            val hasResult = fullText.isNotBlank() && translation.isNotBlank()
            if (hasResult) publishKanji(claim.sessionId, enrichedJson)
            val activeKanji = db.from(PhotoSessionKanjiTable)
                .select(PhotoSessionKanjiTable.kanjiMasterId)
                .where {
                    (PhotoSessionKanjiTable.photoSessionId eq claim.sessionId) and
                        PhotoSessionKanjiTable.excludedAt.isNull()
                }
                .mapNotNull { it[PhotoSessionKanjiTable.kanjiMasterId] }
            val familiarKanji = if (activeKanji.isEmpty()) 0 else db.from(UserKanjiTable)
                .select(UserKanjiTable.kanjiId)
                .where {
                    (UserKanjiTable.userId eq claim.userId) and
                        (UserKanjiTable.kanjiId inList activeKanji) and
                        (UserKanjiTable.familiarity greaterEq 5)
                }
                .totalRecordsInAllPages
            val capturedCoverage = if (activeKanji.isEmpty()) null else familiarKanji.toFloat() / activeKanji.size
            db.update(PhotoSessionTable) {
                set(it.rawAiResponse, enrichedJson)
                set(it.status, if (hasResult) PhotoSessionStatus.DONE.name else PhotoSessionStatus.FAILED.name)
                set(it.processingStatus, if (hasResult) "READY" else "NEEDS_ATTENTION")
                set(it.fullText, fullText)
                set(it.translation, translation)
                set(it.translationLanguage, "en")
                set(it.readyAt, if (hasResult) Instant.now() else null)
                set(it.capturedKanjiCoverage, capturedCoverage)
                set(it.failureCode, if (hasResult) null else PhotoFailureCode.INVALID_RESPONSE)
                set(it.costMicrodollars, costMicrodollars)
                where { it.id eq claim.sessionId }
            }
            db.update(PhotoSessionTaskTable) {
                set(it.status, if (hasResult) "DONE" else "FAILED")
                set(it.finishedAt, Instant.now())
                where {
                    (it.photoSessionId eq claim.sessionId) and
                        (it.taskType eq "TRANSLATION") and
                        (it.pipelineVersion eq 2)
                }
            }
            terminalize(claim, if (hasResult) "done" else "failed", if (hasResult) null else PhotoFailureCode.INVALID_RESPONSE)
            hasResult
        }

    fun fail(claim: PhotoAnalysisClaim, failureCode: String, costMicrodollars: Long = 0): Boolean =
        db.useTransaction {
            recordCost(claim, costMicrodollars)
            if (!ownsActiveClaim(claim)) return@useTransaction false
            db.update(PhotoSessionTable) {
                set(it.status, PhotoSessionStatus.FAILED.name)
                set(it.processingStatus, "NEEDS_ATTENTION")
                set(it.failureCode, failureCode)
                if (costMicrodollars > 0) set(it.costMicrodollars, costMicrodollars)
                where { it.id eq claim.sessionId }
            }
            db.update(PhotoSessionTaskTable) {
                set(it.status, "FAILED")
                set(it.failureCode, failureCode)
                set(it.finishedAt, Instant.now())
                where {
                    (it.photoSessionId eq claim.sessionId) and
                        (it.status inList listOf("PENDING", "PROCESSING", "BLOCKED"))
                }
            }
            terminalize(claim, "failed", failureCode)
            true
        }

    private fun recordCost(claim: PhotoAnalysisClaim, cost: Long) {
        if (cost <= 0 || claim.userId.isBlank()) return
        db.insertOrUpdate(UserCostTable) {
            set(it.id, UUID.randomUUID())
            set(it.userId, claim.userId)
            set(it.operationType, "PHOTO_ANALYSIS")
            set(it.operationId, claim.sessionId)
            set(it.jobAttemptId, claim.attemptId)
            set(it.costMicrodollars, cost)
            onConflict(it.jobAttemptId) {
                set(it.costMicrodollars, cost)
            }
        }
    }

    private fun publishKanji(sessionId: UUID, enrichedJson: String) {
        db.delete(PhotoSessionKanjiTable) { it.photoSessionId eq sessionId }
        val seen = mutableSetOf<UUID>()
        Json.parseToJsonElement(enrichedJson).jsonArray.forEachIndexed { index, element ->
            val item = element.jsonObject
            val kanjiId = item["kanjiMasterId"]?.jsonPrimitive?.contentOrNull
                ?.let { value -> runCatching { UUID.fromString(value) }.getOrNull() }
                ?: return@forEachIndexed
            if (!seen.add(kanjiId)) return@forEachIndexed
            db.insert(PhotoSessionKanjiTable) {
                set(it.photoSessionId, sessionId)
                set(it.kanjiMasterId, kanjiId)
                set(it.firstSeenOrder, index)
                set(it.recommendationRank, item["recommendationRank"]?.jsonPrimitive?.intOrNull ?: index)
                set(it.whyUseful, item["whyUseful"]?.jsonPrimitive?.contentOrNull.orEmpty())
                set(it.pipelineVersion, 2)
            }
        }
    }

    private fun ownsActiveClaim(claim: PhotoAnalysisClaim): Boolean = db.from(JobAttemptTable)
        .select(JobAttemptTable.id)
        .where {
            (JobAttemptTable.id eq claim.attemptId) and
                (JobAttemptTable.status eq "processing") and
                (JobAttemptTable.claimToken eq claim.claimToken)
        }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun terminalize(claim: PhotoAnalysisClaim, status: String, failureCode: String?) {
        db.update(JobAttemptTable) {
            set(it.status, status)
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            where {
                (it.id eq claim.attemptId) and
                    (it.status eq "processing") and
                    (it.claimToken eq claim.claimToken)
            }
        }
    }

    private fun latestAttempt(jobId: UUID, lock: Boolean): AttemptSnapshot? {
        var query = db.from(JobAttemptTable)
            .select()
            .where {
                (JobAttemptTable.jobType eq "photo_analysis") and
                    (JobAttemptTable.jobId eq jobId)
            }
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .limit(1)
        if (lock) query = query.locking(LockingMode.FOR_UPDATE, wait = LockingWait.WAIT)
        return query.map { row ->
            AttemptSnapshot(
                id = row[JobAttemptTable.id]!!,
                attemptNumber = row[JobAttemptTable.attemptNumber] ?: 0,
                status = row[JobAttemptTable.status].orEmpty(),
                modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                modelId = row[JobAttemptTable.modelId],
                leaseUntil = row[JobAttemptTable.leaseUntil],
                claimedBy = row[JobAttemptTable.claimedBy],
            )
        }.firstOrNull()
    }

    private fun createAttempt(
        jobId: UUID,
        attemptNumber: Int,
        trigger: String,
        modelConfigVersion: Long?,
        modelId: String?,
    ): AttemptSnapshot {
        val id = UUID.randomUUID()
        db.insert(JobAttemptTable) {
            set(it.id, id)
            set(it.jobType, "photo_analysis")
            set(it.jobId, jobId)
            set(it.attemptNumber, attemptNumber)
            set(it.status, "pending")
            set(it.trigger, trigger)
            set(it.modelConfigVersion, modelConfigVersion)
            set(it.modelId, modelId)
            set(it.createdBy, "system")
        }
        return AttemptSnapshot(id, attemptNumber, "pending", modelConfigVersion, modelId, null, null)
    }

    private fun terminalizeExpired(attemptId: UUID) {
        db.update(JobAttemptTable) {
            set(it.status, "failed")
            set(it.failureCode, "lease_expired")
            set(it.finishedAt, Instant.now())
            where { (it.id eq attemptId) and (it.status eq "processing") }
        }
    }

    private data class SessionSnapshot(
        val id: UUID,
        val userId: String,
        val imageUrl: String,
        val status: String,
        val attempts: Int,
    )

    private data class AttemptSnapshot(
        val id: UUID,
        val attemptNumber: Int,
        val status: String,
        val modelConfigVersion: Long?,
        val modelId: String?,
        val leaseUntil: Instant?,
        val claimedBy: String?,
    )

    private companion object {
        val TERMINAL_PHOTO_STATUSES = setOf("DONE", "INGESTED", "FAILED", "ERROR")
    }
}
