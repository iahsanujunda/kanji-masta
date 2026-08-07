package com.kanjimasta.photo

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.ai.ActiveAiModelConfig
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
    val taskId: UUID,
    val taskType: String,
    val sessionId: UUID,
    val userId: String,
    val imageUrl: String,
    val storagePath: String?,
    val attemptId: UUID,
    val claimToken: UUID,
    val modelConfigVersion: Long?,
    val modelId: String,
    val fullText: String?,
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
    fun pendingRequiredTaskForSession(sessionId: UUID): UUID? = db.from(PhotoSessionTaskTable)
        .select(PhotoSessionTaskTable.id)
        .where {
            (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                (PhotoSessionTaskTable.requiredForReady eq true) and
                (PhotoSessionTaskTable.status inList listOf("PENDING", "PROCESSING"))
        }
        .orderBy(PhotoSessionTaskTable.createdAt.asc())
        .limit(1)
        .map { it[PhotoSessionTaskTable.id] }
        .firstOrNull()

    fun recordProviderCost(claim: PhotoAnalysisClaim, cost: Long) {
        db.useTransaction { recordCost(claim, cost) }
    }

    fun claim(
        taskId: UUID,
        taskAttempt: Int,
        claimedBy: String,
        leaseSeconds: Long,
    ): PhotoAnalysisClaim? = db.useTransaction {
        val task = db.from(PhotoSessionTaskTable)
            .innerJoin(PhotoSessionTable, on = PhotoSessionTaskTable.photoSessionId eq PhotoSessionTable.id)
            .select(
                PhotoSessionTaskTable.id,
                PhotoSessionTaskTable.taskType,
                PhotoSessionTaskTable.status,
                PhotoSessionTaskTable.pipelineVersion,
                PhotoSessionTable.id,
                PhotoSessionTable.userId,
                PhotoSessionTable.imageUrl,
                PhotoSessionTable.storagePath,
                PhotoSessionTable.status,
                PhotoSessionTable.attempts,
                PhotoSessionTable.fullText,
            )
            .where { PhotoSessionTaskTable.id eq taskId }
            .locking(LockingMode.FOR_UPDATE)
            .map { row ->
                TaskSnapshot(
                    id = row[PhotoSessionTaskTable.id]!!,
                    type = row[PhotoSessionTaskTable.taskType].orEmpty(),
                    status = row[PhotoSessionTaskTable.status].orEmpty(),
                    pipelineVersion = row[PhotoSessionTaskTable.pipelineVersion] ?: 2,
                    sessionId = row[PhotoSessionTable.id]!!,
                    userId = row[PhotoSessionTable.userId].orEmpty(),
                    imageUrl = row[PhotoSessionTable.imageUrl].orEmpty(),
                    storagePath = row[PhotoSessionTable.storagePath],
                    sessionStatus = row[PhotoSessionTable.status].orEmpty(),
                    sessionAttempts = row[PhotoSessionTable.attempts] ?: 0,
                    fullText = row[PhotoSessionTable.fullText],
                )
            }
            .firstOrNull() ?: return@useTransaction null

        require(task.type in REQUIRED_TASK_TYPES) { "Unsupported required capture task '${task.type}'" }
        if (task.status in TERMINAL_TASK_STATUSES || task.status == "BLOCKED") return@useTransaction null
        if (task.sessionStatus in setOf("DONE", "INGESTED")) return@useTransaction null

        var attempt = latestAttempt(taskId, lock = true)
        if (attempt?.status == "processing") {
            val platformRetry = taskAttempt > 0 && attempt.claimedBy == claimedBy
            val leaseExpired = attempt.leaseUntil?.isBefore(Instant.now()) == true
            if (!platformRetry && !leaseExpired) return@useTransaction null
            terminalizeExpired(attempt.id)
            attempt = createAttempt(
                sessionId = task.sessionId,
                taskId = task.id,
                attemptNumber = nextAttemptNumber(task.sessionId),
                trigger = if (platformRetry) "platform_retry" else "reconciler",
                modelConfigVersion = attempt.modelConfigVersion,
                modelId = attempt.modelId,
            )
        } else if (attempt != null && attempt.status != "pending") {
            return@useTransaction null
        } else if (attempt == null) {
            val config = modelConfigs.requireActive()
            attempt = createAttempt(
                sessionId = task.sessionId,
                taskId = task.id,
                attemptNumber = nextAttemptNumber(task.sessionId),
                trigger = "reconciler",
                modelConfigVersion = config.version,
                modelId = modelFor(task.type, config),
            )
        }

        val fallbackConfig = if (attempt.modelId == null) modelConfigs.requireActive() else null
        val modelId = attempt.modelId ?: modelFor(task.type, fallbackConfig!!)
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
            set(it.processingStatus, "PROCESSING")
            set(it.failureCode, null)
            set(it.attempts, attempt.attemptNumber)
            where { it.id eq task.sessionId }
        }
        db.update(PhotoSessionTaskTable) {
            set(it.status, "PROCESSING")
            set(it.claimedBy, claimedBy)
            set(it.leaseUntil, now.plusSeconds(leaseSeconds))
            set(it.failureCode, null)
            where {
                (it.id eq task.id) and (it.status eq "PENDING")
            }
        }
        PhotoAnalysisClaim(
            taskId = task.id,
            taskType = task.type,
            sessionId = task.sessionId,
            userId = task.userId,
            imageUrl = task.imageUrl,
            storagePath = task.storagePath,
            attemptId = attempt.id,
            claimToken = token,
            modelConfigVersion = modelConfigVersion,
            modelId = modelId,
            fullText = task.fullText,
        )
    }

    fun renewLease(claim: PhotoAnalysisClaim, leaseSeconds: Long): Boolean = db.useTransaction {
        val leaseUntil = Instant.now().plusSeconds(leaseSeconds)
        val renewed = db.update(JobAttemptTable) {
            set(it.leaseUntil, leaseUntil)
            where {
                (it.id eq claim.attemptId) and
                    (it.status eq "processing") and
                    (it.claimToken eq claim.claimToken)
            }
        }
        if (renewed != 1) return@useTransaction false
        db.update(PhotoSessionTaskTable) {
            set(it.leaseUntil, leaseUntil)
            where {
                (it.id eq claim.taskId) and
                    (it.status eq "PROCESSING")
            }
        }
        true
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

    fun completeVisual(
        claim: PhotoAnalysisClaim,
        fullText: String,
        enrichedJson: String,
        costMicrodollars: Long,
    ): UUID? = db.useTransaction {
            require(claim.taskType == "VISUAL_ANALYSIS") { "Visual completion requires a visual claim" }
            recordCost(claim, costMicrodollars)
            if (!ownsActiveClaim(claim) || fullText.isBlank()) return@useTransaction null
            publishKanji(claim.sessionId, enrichedJson)
            db.update(PhotoSessionTable) {
                set(it.rawAiResponse, enrichedJson)
                set(it.fullText, fullText)
                set(it.costMicrodollars, sessionCost(claim.sessionId) + costMicrodollars)
                where { it.id eq claim.sessionId }
            }
            completeTask(claim)
            terminalize(claim, "done", null)

            val translationTask = db.from(PhotoSessionTaskTable)
                .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.status)
                .where {
                    (PhotoSessionTaskTable.photoSessionId eq claim.sessionId) and
                        (PhotoSessionTaskTable.taskType eq "TRANSLATION") and
                        (PhotoSessionTaskTable.pipelineVersion eq 2)
                }
                .locking(LockingMode.FOR_UPDATE)
                .map { it[PhotoSessionTaskTable.id]!! to it[PhotoSessionTaskTable.status].orEmpty() }
                .firstOrNull() ?: return@useTransaction null
            if (translationTask.second == "DONE") return@useTransaction null
            if (translationTask.second !in setOf("PENDING", "PROCESSING")) {
                db.update(PhotoSessionTaskTable) {
                    set(it.status, "PENDING")
                    set(it.failureCode, null)
                    set(it.finishedAt, null)
                    set(it.claimedBy, null)
                    set(it.leaseUntil, null)
                    where { it.id eq translationTask.first }
                }
            }
            if (latestAttempt(translationTask.first, lock = true)?.status !in setOf("pending", "processing")) {
                val config = modelConfigs.requireActive()
                createAttempt(
                    sessionId = claim.sessionId,
                    taskId = translationTask.first,
                    attemptNumber = nextAttemptNumber(claim.sessionId),
                    trigger = "initial",
                    modelConfigVersion = config.version,
                    modelId = config.translationModel,
                )
            }
            syncSessionAttemptCount(claim.sessionId)
            translationTask.first
        }

    fun completeTranslation(
        claim: PhotoAnalysisClaim,
        translation: String,
        costMicrodollars: Long,
    ): Boolean = db.useTransaction {
            require(claim.taskType == "TRANSLATION") { "Translation completion requires a translation claim" }
            recordCost(claim, costMicrodollars)
            if (!ownsActiveClaim(claim)) return@useTransaction false
            val hasResult = !claim.fullText.isNullOrBlank() && translation.isNotBlank()
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
                set(it.status, if (hasResult) PhotoSessionStatus.DONE.name else PhotoSessionStatus.FAILED.name)
                set(it.processingStatus, if (hasResult) "READY" else "NEEDS_ATTENTION")
                set(it.translation, translation)
                set(it.translationLanguage, "en")
                set(it.readyAt, if (hasResult) Instant.now() else null)
                set(it.capturedKanjiCoverage, capturedCoverage)
                set(it.failureCode, if (hasResult) null else PhotoFailureCode.INVALID_RESPONSE)
                set(it.costMicrodollars, sessionCost(claim.sessionId) + costMicrodollars)
                where { it.id eq claim.sessionId }
            }
            if (hasResult) completeTask(claim) else failTask(claim, PhotoFailureCode.INVALID_RESPONSE)
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
                if (costMicrodollars > 0) set(it.costMicrodollars, sessionCost(claim.sessionId) + costMicrodollars)
                where { it.id eq claim.sessionId }
            }
            failTask(claim, failureCode)
            terminalize(claim, "failed", failureCode)
            true
        }

    fun pendingTranslationForVisual(visualTaskId: UUID): UUID? = db.useTransaction {
        val visual = db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.photoSessionId, PhotoSessionTaskTable.pipelineVersion)
            .where {
                (PhotoSessionTaskTable.id eq visualTaskId) and
                    (PhotoSessionTaskTable.taskType eq "VISUAL_ANALYSIS") and
                    (PhotoSessionTaskTable.status eq "DONE")
            }
            .map { it[PhotoSessionTaskTable.photoSessionId]!! to (it[PhotoSessionTaskTable.pipelineVersion] ?: 2) }
            .firstOrNull() ?: return@useTransaction null
        val translation = db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.status, PhotoSessionTaskTable.failureCode)
            .where {
                (PhotoSessionTaskTable.photoSessionId eq visual.first) and
                    (PhotoSessionTaskTable.pipelineVersion eq visual.second) and
                    (PhotoSessionTaskTable.taskType eq "TRANSLATION")
            }
            .limit(1)
            .locking(LockingMode.FOR_UPDATE)
            .map {
                Triple(
                    it[PhotoSessionTaskTable.id]!!,
                    it[PhotoSessionTaskTable.status].orEmpty(),
                    it[PhotoSessionTaskTable.failureCode],
                )
            }
            .firstOrNull() ?: return@useTransaction null
        if (translation.second == "PENDING") return@useTransaction translation.first
        if (translation.second != "FAILED" || translation.third != PhotoFailureCode.DISPATCH_FAILED) {
            return@useTransaction null
        }

        val config = modelConfigs.requireActive()
        db.update(PhotoSessionTaskTable) {
            set(it.status, "PENDING")
            set(it.failureCode, null)
            set(it.finishedAt, null)
            set(it.claimedBy, null)
            set(it.leaseUntil, null)
            where { it.id eq translation.first }
        }
        createAttempt(
            sessionId = visual.first,
            taskId = translation.first,
            attemptNumber = nextAttemptNumber(visual.first),
            trigger = "platform_retry",
            modelConfigVersion = config.version,
            modelId = config.translationModel,
        )
        db.update(PhotoSessionTable) {
            set(it.status, PhotoSessionStatus.PROCESSING.name)
            set(it.processingStatus, "PROCESSING")
            set(it.failureCode, null)
            where { it.id eq visual.first }
        }
        syncSessionAttemptCount(visual.first)
        translation.first
    }

    fun markDispatchFailed(taskId: UUID): Boolean = db.useTransaction {
        val task = db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.photoSessionId)
            .where { (PhotoSessionTaskTable.id eq taskId) and (PhotoSessionTaskTable.status eq "PENDING") }
            .locking(LockingMode.FOR_UPDATE)
            .map { it[PhotoSessionTaskTable.photoSessionId] }
            .firstOrNull() ?: return@useTransaction false
        db.update(PhotoSessionTaskTable) {
            set(it.status, "FAILED")
            set(it.failureCode, PhotoFailureCode.DISPATCH_FAILED)
            set(it.finishedAt, Instant.now())
            where { (it.id eq taskId) and (it.status eq "PENDING") }
        }
        db.update(JobAttemptTable) {
            set(it.status, "failed")
            set(it.failureCode, PhotoFailureCode.DISPATCH_FAILED)
            set(it.finishedAt, Instant.now())
            where {
                (it.taskId eq taskId) and (it.status eq "pending")
            }
        }
        db.update(PhotoSessionTable) {
            set(it.status, PhotoSessionStatus.FAILED.name)
            set(it.processingStatus, "NEEDS_ATTENTION")
            set(it.failureCode, PhotoFailureCode.DISPATCH_FAILED)
            where { (it.id eq task) and (it.status eq PhotoSessionStatus.PROCESSING.name) }
        }
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

    private fun completeTask(claim: PhotoAnalysisClaim) {
        db.update(PhotoSessionTaskTable) {
            set(it.status, "DONE")
            set(it.failureCode, null)
            set(it.finishedAt, Instant.now())
            set(it.leaseUntil, null)
            where { (it.id eq claim.taskId) and (it.status eq "PROCESSING") }
        }
    }

    private fun failTask(claim: PhotoAnalysisClaim, failureCode: String) {
        db.update(PhotoSessionTaskTable) {
            set(it.status, "FAILED")
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            set(it.leaseUntil, null)
            where { (it.id eq claim.taskId) and (it.status eq "PROCESSING") }
        }
    }

    private fun sessionCost(sessionId: UUID): Long = db.from(PhotoSessionTable)
        .select(PhotoSessionTable.costMicrodollars)
        .where { PhotoSessionTable.id eq sessionId }
        .map { it[PhotoSessionTable.costMicrodollars] ?: 0L }
        .firstOrNull() ?: 0L

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

    private fun latestAttempt(taskId: UUID, lock: Boolean): AttemptSnapshot? {
        var query = db.from(JobAttemptTable)
            .select()
            .where {
                (JobAttemptTable.jobType eq "photo_analysis") and
                    (JobAttemptTable.taskId eq taskId)
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
        sessionId: UUID,
        taskId: UUID,
        attemptNumber: Int,
        trigger: String,
        modelConfigVersion: Long?,
        modelId: String?,
    ): AttemptSnapshot {
        val id = UUID.randomUUID()
        db.insert(JobAttemptTable) {
            set(it.id, id)
            set(it.jobType, "photo_analysis")
            set(it.jobId, sessionId)
            set(it.taskId, taskId)
            set(it.attemptNumber, attemptNumber)
            set(it.status, "pending")
            set(it.trigger, trigger)
            set(it.modelConfigVersion, modelConfigVersion)
            set(it.modelId, modelId)
            set(it.createdBy, "system")
        }
        return AttemptSnapshot(id, attemptNumber, "pending", modelConfigVersion, modelId, null, null)
    }

    private fun nextAttemptNumber(sessionId: UUID): Int {
        val latest = max(JobAttemptTable.attemptNumber).aliased("latest_photo_attempt")
        return (db.from(JobAttemptTable)
            .select(latest)
            .where { (JobAttemptTable.jobType eq "photo_analysis") and (JobAttemptTable.jobId eq sessionId) }
            .map { it[latest] }
            .firstOrNull() ?: 0) + 1
    }

    private fun syncSessionAttemptCount(sessionId: UUID) {
        db.update(PhotoSessionTable) {
            set(it.attempts, nextAttemptNumber(sessionId) - 1)
            where { it.id eq sessionId }
        }
    }

    private fun modelFor(taskType: String, config: ActiveAiModelConfig): String = when (taskType) {
        "VISUAL_ANALYSIS" -> config.photoAnalysisModel
        "TRANSLATION" -> config.translationModel
        else -> error("Unsupported required capture task '$taskType'")
    }

    private fun terminalizeExpired(attemptId: UUID) {
        db.update(JobAttemptTable) {
            set(it.status, "failed")
            set(it.failureCode, "lease_expired")
            set(it.finishedAt, Instant.now())
            where { (it.id eq attemptId) and (it.status eq "processing") }
        }
    }

    private data class TaskSnapshot(
        val id: UUID,
        val type: String,
        val status: String,
        val pipelineVersion: Int,
        val sessionId: UUID,
        val userId: String,
        val imageUrl: String,
        val storagePath: String?,
        val sessionStatus: String,
        val sessionAttempts: Int,
        val fullText: String?,
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
        val REQUIRED_TASK_TYPES = setOf("VISUAL_ANALYSIS", "TRANSLATION")
        val TERMINAL_TASK_STATUSES = setOf("DONE", "FAILED")
    }
}
