package com.kanjimasta.modules.worker

import com.kanjimasta.core.ai.AiModelConfigRepository
import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.LockingMode
import org.ktorm.support.postgresql.LockingWait
import org.ktorm.support.postgresql.insertOrUpdate
import org.ktorm.support.postgresql.locking
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

data class QuizGenerationClaim(
    val jobId: UUID,
    val userId: String,
    val kanjiId: UUID,
    val kanjiCharacter: String,
    val wordMasterId: UUID?,
    val word: String?,
    val reading: String?,
    val meanings: List<String>,
    val quizId: UUID?,
    val jobType: JobType,
    val trigger: String,
    val attemptId: UUID,
    val claimToken: UUID,
    val modelConfigVersion: Long?,
    val modelId: String,
)

data class GeneratedQuiz(
    val quizType: QuizType,
    val prompt: String,
    val target: String,
    val answer: String,
    val furigana: String?,
    val explanation: String?,
    val distractors: List<String>,
)

data class QuizRegenerationContext(
    val quizId: UUID,
    val userId: String,
    val kanjiId: UUID,
    val familiarity: Int,
    val quizType: QuizType,
    val prompt: String,
    val answer: String,
    val previousDistractors: List<List<String>>,
    val nextGeneration: Int,
)

class QuizGenerationRepository(
    private val db: Database,
    private val modelConfigs: AiModelConfigRepository = AiModelConfigRepository(db),
) {
    fun recordProviderCost(claim: QuizGenerationClaim, cost: Long) {
        db.useTransaction { recordCost(claim, cost) }
    }

    fun claimNext(claimedBy: String, leaseSeconds: Long): QuizGenerationClaim? = db.useTransaction {
        reconcileOneExpiredLease()

        val job = db.from(QuizGenerationJobTable)
            .innerJoin(KanjiMasterTable, on = QuizGenerationJobTable.kanjiId eq KanjiMasterTable.id)
            .leftJoin(WordMasterTable, on = QuizGenerationJobTable.wordMasterId eq WordMasterTable.id)
            .select(
                QuizGenerationJobTable.id,
                QuizGenerationJobTable.userId,
                QuizGenerationJobTable.kanjiId,
                QuizGenerationJobTable.wordMasterId,
                QuizGenerationJobTable.quizId,
                QuizGenerationJobTable.jobType,
                QuizGenerationJobTable.trigger,
                QuizGenerationJobTable.attempts,
                KanjiMasterTable.character,
                WordMasterTable.word,
                WordMasterTable.reading,
                WordMasterTable.meanings,
            )
            .where { QuizGenerationJobTable.status eq JobStatus.PENDING }
            .orderBy(QuizGenerationJobTable.createdAt.asc(), QuizGenerationJobTable.id.asc())
            .limit(1)
            .locking(
                mode = LockingMode.FOR_UPDATE,
                tables = listOf(QuizGenerationJobTable),
                wait = LockingWait.SKIP_LOCKED,
            )
            .map { row ->
                JobSnapshot(
                    id = row[QuizGenerationJobTable.id]!!,
                    userId = row[QuizGenerationJobTable.userId].orEmpty(),
                    kanjiId = row[QuizGenerationJobTable.kanjiId]!!,
                    kanjiCharacter = row[KanjiMasterTable.character].orEmpty(),
                    wordMasterId = row[QuizGenerationJobTable.wordMasterId],
                    word = row[WordMasterTable.word],
                    reading = row[WordMasterTable.reading],
                    meanings = row[WordMasterTable.meanings].orEmpty(),
                    quizId = row[QuizGenerationJobTable.quizId],
                    jobType = row[QuizGenerationJobTable.jobType] ?: JobType.INITIAL,
                    trigger = row[QuizGenerationJobTable.trigger] ?: "initial",
                    attempts = row[QuizGenerationJobTable.attempts] ?: 0,
                )
            }
            .firstOrNull() ?: return@useTransaction null

        var attempt = latestAttempt(job.id, lock = true)
        if (attempt?.status == "processing") return@useTransaction null
        if (attempt == null || attempt.status != "pending") {
            val config = modelConfigs.getActive()
            attempt = createAttempt(
                jobId = job.id,
                attemptNumber = maxOf(job.attempts, attempt?.attemptNumber ?: 0) + 1,
                trigger = "reconciler",
                modelConfigVersion = config?.version,
                modelId = config?.quizGenerationModel,
            )
        }

        val fallbackConfig = if (attempt.modelId == null) modelConfigs.requireActive() else null
        val modelId = attempt.modelId ?: fallbackConfig!!.quizGenerationModel
        val modelConfigVersion = attempt.modelConfigVersion ?: fallbackConfig?.version
        val token = UUID.randomUUID()
        val now = Instant.now()
        val attemptUpdated = db.update(JobAttemptTable) {
            set(it.status, "processing")
            set(it.startedAt, now)
            set(it.claimToken, token)
            set(it.leaseUntil, now.plusSeconds(leaseSeconds))
            set(it.claimedBy, claimedBy)
            set(it.modelConfigVersion, modelConfigVersion)
            set(it.modelId, modelId)
            where { (it.id eq attempt.id) and (it.status eq "pending") }
        }
        if (attemptUpdated != 1) return@useTransaction null
        val sourceUpdated = db.update(QuizGenerationJobTable) {
            set(it.status, JobStatus.PROCESSING)
            set(it.attempts, attempt.attemptNumber)
            where { (it.id eq job.id) and (it.status eq JobStatus.PENDING) }
        }
        if (sourceUpdated != 1) return@useTransaction null

        QuizGenerationClaim(
            jobId = job.id,
            userId = job.userId,
            kanjiId = job.kanjiId,
            kanjiCharacter = job.kanjiCharacter,
            wordMasterId = job.wordMasterId,
            word = job.word,
            reading = job.reading,
            meanings = job.meanings,
            quizId = job.quizId,
            jobType = job.jobType,
            trigger = job.trigger,
            attemptId = attempt.id,
            claimToken = token,
            modelConfigVersion = modelConfigVersion,
            modelId = modelId,
        )
    }

    fun completeInitial(claim: QuizGenerationClaim, quizzes: List<GeneratedQuiz>, cost: Long): Boolean =
        db.useTransaction {
            recordCost(claim, cost)
            if (!ownsActiveClaim(claim)) return@useTransaction false
            val wordMasterId = claim.wordMasterId ?: return@useTransaction failOwned(claim, "source_missing", cost)

            quizzes.forEachIndexed { index, quiz ->
                val quizId = stableUuid("quiz:${claim.attemptId}:$index")
                db.insertOrUpdate(QuizBankTable) {
                    set(it.id, quizId)
                    set(it.kanjiId, claim.kanjiId)
                    set(it.wordId, wordMasterId)
                    set(it.quizType, quiz.quizType)
                    set(it.prompt, quiz.prompt)
                    set(it.target, quiz.target)
                    set(it.answer, quiz.answer)
                    set(it.furigana, quiz.furigana)
                    set(it.explanation, quiz.explanation)
                    set(it.sourceAttemptId, claim.attemptId)
                    set(it.sourceItemIndex, index)
                    onConflict(it.id) {
                        set(it.sourceAttemptId, claim.attemptId)
                    }
                }
                if (quiz.distractors.isNotEmpty()) {
                    db.insertOrUpdate(QuizDistractorTable) {
                        set(it.id, stableUuid("distractor:${claim.attemptId}:$index"))
                        set(it.quizId, quizId)
                        set(it.distractors, quiz.distractors)
                        set(it.generation, 1)
                        set(it.trigger, DistractorTrigger.INITIAL)
                        set(it.familiarityAtGeneration, 0)
                        onConflict(it.id) {
                            set(it.distractors, quiz.distractors)
                        }
                    }
                }
            }
            finishOwned(claim, JobStatus.DONE, null, cost)
        }

    fun regenerationContext(claim: QuizGenerationClaim): QuizRegenerationContext? {
        val quizId = claim.quizId ?: return null
        val quiz = db.from(QuizBankTable)
            .select(
                QuizBankTable.id,
                QuizBankTable.userId,
                QuizBankTable.kanjiId,
                QuizBankTable.quizType,
                QuizBankTable.prompt,
                QuizBankTable.answer,
            )
            .where { QuizBankTable.id eq quizId }
            .map { row ->
                QuizSnapshot(
                    id = row[QuizBankTable.id]!!,
                    userId = row[QuizBankTable.userId] ?: claim.userId,
                    kanjiId = row[QuizBankTable.kanjiId]!!,
                    quizType = row[QuizBankTable.quizType]!!,
                    prompt = row[QuizBankTable.prompt].orEmpty(),
                    answer = row[QuizBankTable.answer].orEmpty(),
                )
            }
            .firstOrNull() ?: return null
        val sets = db.from(QuizDistractorTable)
            .select(QuizDistractorTable.distractors, QuizDistractorTable.generation)
            .where { QuizDistractorTable.quizId eq quizId }
            .orderBy(QuizDistractorTable.generation.desc())
            .map { row ->
                (row[QuizDistractorTable.generation] ?: 0) to row[QuizDistractorTable.distractors].orEmpty()
            }
        val familiarity = db.from(UserKanjiTable)
            .select(UserKanjiTable.familiarity)
            .where {
                (UserKanjiTable.userId eq quiz.userId) and
                    (UserKanjiTable.kanjiId eq quiz.kanjiId)
            }
            .limit(1)
            .map { it[UserKanjiTable.familiarity] ?: 0 }
            .firstOrNull() ?: 0
        return QuizRegenerationContext(
            quizId = quiz.id,
            userId = quiz.userId,
            kanjiId = quiz.kanjiId,
            familiarity = familiarity,
            quizType = quiz.quizType,
            prompt = quiz.prompt,
            answer = quiz.answer,
            previousDistractors = sets.map { it.second },
            nextGeneration = (sets.maxOfOrNull { it.first } ?: 0) + 1,
        )
    }

    fun completeRegeneration(
        claim: QuizGenerationClaim,
        context: QuizRegenerationContext,
        distractors: List<String>,
        cost: Long,
    ): Boolean = db.useTransaction {
        recordCost(claim, cost)
        if (!ownsActiveClaim(claim)) return@useTransaction false
        db.insertOrUpdate(QuizDistractorTable) {
            set(it.id, stableUuid("regen:${claim.attemptId}"))
            set(it.quizId, context.quizId)
            set(it.userId, context.userId)
            set(it.distractors, distractors)
            set(it.generation, context.nextGeneration)
            set(it.trigger, if (claim.trigger == "milestone") DistractorTrigger.MILESTONE else DistractorTrigger.SERVE_COUNT)
            set(it.familiarityAtGeneration, context.familiarity)
            onConflict(it.id) { set(it.distractors, distractors) }
        }
        finishOwned(claim, JobStatus.DONE, null, cost)
    }

    fun fail(claim: QuizGenerationClaim, failureCode: String, cost: Long = 0): Boolean = db.useTransaction {
        recordCost(claim, cost)
        failOwned(claim, failureCode, cost)
    }

    fun enqueueEligibleRegenerations(limit: Int = 1000): Int = db.useTransaction {
        val candidates = db.from(QuizBankTable)
            .select(QuizBankTable.id, QuizBankTable.userId, QuizBankTable.kanjiId, QuizBankTable.servedCount)
            .where { QuizBankTable.servedCount greater 0 }
            .limit(limit)
            .map { row ->
                RegenCandidate(
                    quizId = row[QuizBankTable.id]!!,
                    userId = row[QuizBankTable.userId],
                    kanjiId = row[QuizBankTable.kanjiId]!!,
                    servedCount = row[QuizBankTable.servedCount] ?: 0,
                )
            }
        var enqueued = 0
        candidates.forEach { candidate ->
            val userId = candidate.userId ?: return@forEach
            if (candidate.servedCount < 10) return@forEach
            db.from(QuizDistractorTable)
                .select(QuizDistractorTable.servedAt)
                .where { QuizDistractorTable.quizId eq candidate.quizId }
                .orderBy(QuizDistractorTable.generation.desc())
                .limit(1)
                .map { it[QuizDistractorTable.servedAt] }
                .firstOrNull() ?: return@forEach
            val alreadyQueued = db.from(QuizGenerationJobTable)
                .select(QuizGenerationJobTable.id)
                .where {
                    (QuizGenerationJobTable.quizId eq candidate.quizId) and
                        (QuizGenerationJobTable.status inList listOf(JobStatus.PENDING, JobStatus.PROCESSING))
                }
                .limit(1)
                .map { true }
                .firstOrNull() == true
            if (alreadyQueued) return@forEach
            insertJobWithAttempt(userId, candidate.kanjiId, candidate.quizId)
            enqueued++
        }
        enqueued
    }

    private fun insertJobWithAttempt(userId: String, kanjiId: UUID, quizId: UUID) {
        val jobId = UUID.randomUUID()
        db.insert(QuizGenerationJobTable) {
            set(it.id, jobId)
            set(it.userId, userId)
            set(it.kanjiId, kanjiId)
            set(it.quizId, quizId)
            set(it.jobType, JobType.REGEN)
            set(it.trigger, "serve_count")
        }
        val config = modelConfigs.getActive()
        createAttempt(jobId, 1, "initial", config?.version, config?.quizGenerationModel)
    }

    private fun reconcileOneExpiredLease() {
        val expired = db.from(JobAttemptTable)
            .select(JobAttemptTable.id, JobAttemptTable.jobId, JobAttemptTable.attemptNumber,
                JobAttemptTable.modelConfigVersion, JobAttemptTable.modelId)
            .where {
                (JobAttemptTable.jobType eq "quiz_generation") and
                    (JobAttemptTable.status eq "processing") and
                    (JobAttemptTable.leaseUntil less Instant.now())
            }
            .orderBy(JobAttemptTable.leaseUntil.asc())
            .limit(1)
            .locking(LockingMode.FOR_UPDATE, wait = LockingWait.SKIP_LOCKED)
            .map { row ->
                AttemptSnapshot(
                    id = row[JobAttemptTable.id]!!,
                    attemptNumber = row[JobAttemptTable.attemptNumber] ?: 0,
                    status = "processing",
                    modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                    modelId = row[JobAttemptTable.modelId],
                    leaseUntil = null,
                    jobId = row[JobAttemptTable.jobId]!!,
                )
            }
            .firstOrNull() ?: return
        db.update(JobAttemptTable) {
            set(it.status, "failed")
            set(it.failureCode, "lease_expired")
            set(it.finishedAt, Instant.now())
            where { (it.id eq expired.id) and (it.status eq "processing") }
        }
        createAttempt(
            expired.jobId,
            expired.attemptNumber + 1,
            "reconciler",
            expired.modelConfigVersion,
            expired.modelId,
        )
        db.update(QuizGenerationJobTable) {
            set(it.status, JobStatus.PENDING)
            where { (it.id eq expired.jobId) and (it.status eq JobStatus.PROCESSING) }
        }
    }

    private fun recordCost(claim: QuizGenerationClaim, cost: Long) {
        if (cost <= 0 || claim.userId.isBlank()) return
        db.insertOrUpdate(UserCostTable) {
            set(it.id, UUID.randomUUID())
            set(it.userId, claim.userId)
            set(it.operationType, if (claim.jobType == JobType.REGEN) "QUIZ_REGEN" else "QUIZ_GENERATION")
            set(it.operationId, claim.jobId)
            set(it.jobAttemptId, claim.attemptId)
            set(it.costMicrodollars, cost)
            onConflict(it.jobAttemptId) { set(it.costMicrodollars, cost) }
        }
    }

    private fun failOwned(claim: QuizGenerationClaim, failureCode: String, cost: Long): Boolean {
        if (!ownsActiveClaim(claim)) return false
        return finishOwned(claim, JobStatus.FAILED, failureCode, cost)
    }

    private fun finishOwned(
        claim: QuizGenerationClaim,
        status: JobStatus,
        failureCode: String?,
        cost: Long,
    ): Boolean {
        val terminalized = db.update(JobAttemptTable) {
            set(it.status, status.name.lowercase())
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            where {
                (it.id eq claim.attemptId) and
                    (it.status eq "processing") and
                    (it.claimToken eq claim.claimToken)
            }
        }
        if (terminalized != 1) return false
        db.update(QuizGenerationJobTable) {
            set(it.status, status)
            if (cost > 0) set(it.costMicrodollars, cost)
            where { it.id eq claim.jobId }
        }
        return true
    }

    private fun ownsActiveClaim(claim: QuizGenerationClaim): Boolean = db.from(JobAttemptTable)
        .select(JobAttemptTable.id)
        .where {
            (JobAttemptTable.id eq claim.attemptId) and
                (JobAttemptTable.status eq "processing") and
                (JobAttemptTable.claimToken eq claim.claimToken)
        }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun latestAttempt(jobId: UUID, lock: Boolean): AttemptSnapshot? {
        var query = db.from(JobAttemptTable)
            .select()
            .where {
                (JobAttemptTable.jobType eq "quiz_generation") and
                    (JobAttemptTable.jobId eq jobId)
            }
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .limit(1)
        if (lock) query = query.locking(LockingMode.FOR_UPDATE)
        return query.map { row ->
            AttemptSnapshot(
                id = row[JobAttemptTable.id]!!,
                attemptNumber = row[JobAttemptTable.attemptNumber] ?: 0,
                status = row[JobAttemptTable.status].orEmpty(),
                modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                modelId = row[JobAttemptTable.modelId],
                leaseUntil = row[JobAttemptTable.leaseUntil],
                jobId = jobId,
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
            set(it.jobType, "quiz_generation")
            set(it.jobId, jobId)
            set(it.attemptNumber, attemptNumber)
            set(it.status, "pending")
            set(it.trigger, trigger)
            set(it.modelConfigVersion, modelConfigVersion)
            set(it.modelId, modelId)
            set(it.createdBy, "system")
        }
        return AttemptSnapshot(id, attemptNumber, "pending", modelConfigVersion, modelId, null, jobId)
    }

    private fun stableUuid(value: String): UUID =
        UUID.nameUUIDFromBytes(value.toByteArray(StandardCharsets.UTF_8))

    private data class JobSnapshot(
        val id: UUID,
        val userId: String,
        val kanjiId: UUID,
        val kanjiCharacter: String,
        val wordMasterId: UUID?,
        val word: String?,
        val reading: String?,
        val meanings: List<String>,
        val quizId: UUID?,
        val jobType: JobType,
        val trigger: String,
        val attempts: Int,
    )

    private data class AttemptSnapshot(
        val id: UUID,
        val attemptNumber: Int,
        val status: String,
        val modelConfigVersion: Long?,
        val modelId: String?,
        val leaseUntil: Instant?,
        val jobId: UUID,
    )

    private data class QuizSnapshot(
        val id: UUID,
        val userId: String,
        val kanjiId: UUID,
        val quizType: QuizType,
        val prompt: String,
        val answer: String,
    )

    private data class RegenCandidate(
        val quizId: UUID,
        val userId: String?,
        val kanjiId: UUID,
        val servedCount: Int,
    )
}
