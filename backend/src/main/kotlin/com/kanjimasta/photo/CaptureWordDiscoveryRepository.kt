package com.kanjimasta.photo

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserWordsTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.kanji.WordSource
import com.kanjimasta.kanji.UserKanjiTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.generation.JobType
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.LockingMode
import org.ktorm.support.postgresql.LockingWait
import org.ktorm.support.postgresql.insertOrUpdate
import org.ktorm.support.postgresql.insertOrUpdateReturning
import org.ktorm.support.postgresql.locking
import java.time.Instant
import java.util.UUID

data class CaptureWordDiscoveryEnqueue(
    val taskId: UUID,
    val status: String,
    val created: Boolean,
)

data class CaptureWordDiscoveryClaim(
    val taskId: UUID,
    val sessionId: UUID,
    val userId: String,
    val fullText: String,
    val pipelineVersion: Int,
    val attemptId: UUID,
    val claimToken: UUID,
    val modelId: String,
    val reasoningEffort: String,
)

data class CapturedWordPublication(
    val id: UUID,
    val surfaceText: String,
    val lemma: String,
    val normalizedLemma: String,
    val reading: String,
    val normalizedReading: String,
    val meaning: String,
    val firstSeenOrder: Int,
    val kanjiIds: List<UUID>,
)

sealed interface CaptureWordDiscoveryEnqueueResult {
    data object NotFound : CaptureWordDiscoveryEnqueueResult
    data object Locked : CaptureWordDiscoveryEnqueueResult
    data class Accepted(val value: CaptureWordDiscoveryEnqueue) : CaptureWordDiscoveryEnqueueResult
}

sealed interface CaptureWordDecisionResult {
    data object NotFound : CaptureWordDecisionResult
    data object Invalid : CaptureWordDecisionResult
    data class Accepted(val added: Int, val quizDispatchRequired: Boolean) : CaptureWordDecisionResult
}

class CaptureWordDiscoveryRepository(
    private val db: Database,
    private val modelConfigs: AiModelConfigRepository = AiModelConfigRepository(db),
) {
    fun enqueue(userId: String, sessionId: UUID): CaptureWordDiscoveryEnqueueResult = db.useTransaction {
        val capture = db.from(PhotoSessionTable)
            .select(
                PhotoSessionTable.id,
                PhotoSessionTable.status,
                PhotoSessionTable.processingStatus,
                PhotoSessionTable.pipelineVersion,
                PhotoSessionTable.fullText,
            )
            .where { (PhotoSessionTable.id eq sessionId) and (PhotoSessionTable.userId eq userId) }
            .locking(LockingMode.FOR_UPDATE)
            .map { row ->
                CaptureEligibility(
                    status = row[PhotoSessionTable.status].orEmpty(),
                    processingStatus = row[PhotoSessionTable.processingStatus].orEmpty(),
                    pipelineVersion = row[PhotoSessionTable.pipelineVersion] ?: 2,
                    fullText = row[PhotoSessionTable.fullText],
                )
            }
            .firstOrNull() ?: return@useTransaction CaptureWordDiscoveryEnqueueResult.NotFound

        if (!capture.isReady || capture.fullText.isNullOrBlank() || !kanjiGateSatisfied(sessionId, userId)) {
            return@useTransaction CaptureWordDiscoveryEnqueueResult.Locked
        }

        val existing = db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.status)
            .where {
                (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                    (PhotoSessionTaskTable.taskType eq TASK_TYPE) and
                    (PhotoSessionTaskTable.pipelineVersion eq capture.pipelineVersion)
            }
            .map { row ->
                CaptureWordDiscoveryEnqueue(
                    taskId = row[PhotoSessionTaskTable.id]!!,
                    status = row[PhotoSessionTaskTable.status].orEmpty(),
                    created = false,
                )
            }
            .firstOrNull()
        if (existing != null) {
            if (existing.status == "FAILED") {
                val latest = latestAttempt(existing.taskId)
                    ?: return@useTransaction CaptureWordDiscoveryEnqueueResult.Accepted(existing)
                db.insert(JobAttemptTable) {
                    set(it.id, UUID.randomUUID())
                    set(it.jobType, JOB_TYPE)
                    set(it.jobId, existing.taskId)
                    set(it.attemptNumber, latest.attemptNumber + 1)
                    set(it.status, "pending")
                    set(it.trigger, "platform_retry")
                    set(it.modelConfigVersion, latest.modelConfigVersion)
                    set(it.modelId, latest.modelId)
                    set(it.createdBy, userId)
                }
                db.update(PhotoSessionTaskTable) {
                    set(it.status, "PENDING")
                    set(it.failureCode, null)
                    set(it.finishedAt, null)
                    set(it.claimedBy, null)
                    set(it.leaseUntil, null)
                    where { it.id eq existing.taskId }
                }
                return@useTransaction CaptureWordDiscoveryEnqueueResult.Accepted(
                    existing.copy(status = "PENDING", created = true),
                )
            }
            return@useTransaction CaptureWordDiscoveryEnqueueResult.Accepted(existing)
        }

        val taskId = UUID.randomUUID()
        db.insert(PhotoSessionTaskTable) {
            set(it.id, taskId)
            set(it.photoSessionId, sessionId)
            set(it.taskType, TASK_TYPE)
            set(it.status, "PENDING")
            set(it.requiredForReady, false)
            set(it.pipelineVersion, capture.pipelineVersion)
        }
        val config = modelConfigs.getActive()
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, JOB_TYPE)
            set(it.jobId, taskId)
            set(it.attemptNumber, 1)
            set(it.status, "pending")
            set(it.trigger, "initial")
            set(it.modelConfigVersion, config?.version)
            set(it.modelId, config?.wordDiscoveryModel)
            set(it.createdBy, "system")
        }
        CaptureWordDiscoveryEnqueueResult.Accepted(
            CaptureWordDiscoveryEnqueue(taskId, "PENDING", created = true),
        )
    }

    private fun kanjiGateSatisfied(sessionId: UUID, userId: String): Boolean {
        val activeIds = db.from(PhotoSessionKanjiTable)
            .select(PhotoSessionKanjiTable.kanjiMasterId)
            .where {
                (PhotoSessionKanjiTable.photoSessionId eq sessionId) and
                    PhotoSessionKanjiTable.excludedAt.isNull()
            }
            .mapNotNull { it[PhotoSessionKanjiTable.kanjiMasterId] }
        if (activeIds.isEmpty()) return true
        val familiar = db.from(UserKanjiTable)
            .select(UserKanjiTable.kanjiId)
            .where {
                (UserKanjiTable.userId eq userId) and
                    (UserKanjiTable.kanjiId inList activeIds) and
                    (UserKanjiTable.familiarity greaterEq 5)
            }
            .totalRecordsInAllPages
        return familiar == activeIds.size
    }

    fun claim(taskId: UUID, claimedBy: String, leaseSeconds: Long): CaptureWordDiscoveryClaim? = db.useTransaction {
        val task = db.from(PhotoSessionTaskTable)
            .innerJoin(PhotoSessionTable, on = PhotoSessionTaskTable.photoSessionId eq PhotoSessionTable.id)
            .select(
                PhotoSessionTaskTable.id,
                PhotoSessionTaskTable.photoSessionId,
                PhotoSessionTaskTable.status,
                PhotoSessionTaskTable.pipelineVersion,
                PhotoSessionTable.userId,
                PhotoSessionTable.fullText,
            )
            .where {
                (PhotoSessionTaskTable.id eq taskId) and
                    (PhotoSessionTaskTable.taskType eq TASK_TYPE)
            }
            .locking(LockingMode.FOR_UPDATE, tables = listOf(PhotoSessionTaskTable), wait = LockingWait.WAIT)
            .map { row ->
                ClaimableTask(
                    sessionId = row[PhotoSessionTaskTable.photoSessionId]!!,
                    status = row[PhotoSessionTaskTable.status].orEmpty(),
                    pipelineVersion = row[PhotoSessionTaskTable.pipelineVersion] ?: 2,
                    userId = row[PhotoSessionTable.userId].orEmpty(),
                    fullText = row[PhotoSessionTable.fullText].orEmpty(),
                )
            }
            .firstOrNull() ?: return@useTransaction null
        if (task.status != "PENDING" || task.fullText.isBlank()) return@useTransaction null

        val attempt = db.from(JobAttemptTable)
            .select()
            .where {
                (JobAttemptTable.jobType eq JOB_TYPE) and
                    (JobAttemptTable.jobId eq taskId)
            }
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .limit(1)
            .locking(LockingMode.FOR_UPDATE, wait = LockingWait.WAIT)
            .map { row ->
                Attempt(
                    id = row[JobAttemptTable.id]!!,
                    status = row[JobAttemptTable.status].orEmpty(),
                    modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                    modelId = row[JobAttemptTable.modelId],
                )
            }
            .firstOrNull() ?: return@useTransaction null
        if (attempt.status != "pending") return@useTransaction null
        val resolvedConfig = attempt.modelConfigVersion?.let(modelConfigs::get) ?: modelConfigs.requireActive()
        val modelId = attempt.modelId ?: resolvedConfig.wordDiscoveryModel
        val token = UUID.randomUUID()
        val now = Instant.now()
        val attemptUpdated = db.update(JobAttemptTable) {
            set(it.status, "processing")
            set(it.startedAt, now)
            set(it.claimToken, token)
            set(it.leaseUntil, now.plusSeconds(leaseSeconds))
            set(it.claimedBy, claimedBy)
            set(it.modelId, modelId)
            where { (it.id eq attempt.id) and (it.status eq "pending") }
        }
        if (attemptUpdated != 1) return@useTransaction null
        val taskUpdated = db.update(PhotoSessionTaskTable) {
            set(it.status, "PROCESSING")
            set(it.claimedBy, claimedBy)
            set(it.leaseUntil, now.plusSeconds(leaseSeconds))
            where { (it.id eq taskId) and (it.status eq "PENDING") }
        }
        if (taskUpdated != 1) return@useTransaction null
        CaptureWordDiscoveryClaim(
            taskId = taskId,
            sessionId = task.sessionId,
            userId = task.userId,
            fullText = task.fullText,
            pipelineVersion = task.pipelineVersion,
            attemptId = attempt.id,
            claimToken = token,
            modelId = modelId,
            reasoningEffort = resolvedConfig.wordDiscoveryReasoning,
        )
    }

    fun lookupKanjiIds(characters: List<String>): Map<String, UUID> {
        if (characters.isEmpty()) return emptyMap()
        return db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id, KanjiMasterTable.character)
            .where { KanjiMasterTable.character inList characters.distinct() }
            .map { row -> row[KanjiMasterTable.character].orEmpty() to row[KanjiMasterTable.id]!! }
            .toMap()
    }

    fun readState(
        userId: String,
        sessionId: UUID,
        pipelineVersion: Int,
        eligible: Boolean,
    ): CaptureWordDiscovery {
        val task = db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.status, PhotoSessionTaskTable.failureCode)
            .where {
                (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                    (PhotoSessionTaskTable.taskType eq TASK_TYPE) and
                    (PhotoSessionTaskTable.pipelineVersion eq pipelineVersion)
            }
            .map { row -> row[PhotoSessionTaskTable.status].orEmpty() to row[PhotoSessionTaskTable.failureCode] }
            .firstOrNull()
        val status = when {
            !eligible -> "LOCKED"
            task == null -> "NOT_STARTED"
            else -> task.first
        }
        val candidates = if (task?.first == "DONE") readCandidates(userId, sessionId, pipelineVersion) else emptyList()
        return CaptureWordDiscovery(
            eligible = eligible,
            status = status,
            failureCode = task?.second,
            newCount = candidates.count { it.learningState == "NEW" },
            learningCount = candidates.count { it.learningState == "LEARNING" },
            familiarCount = candidates.count { it.learningState == "FAMILIAR" },
            candidates = candidates,
        )
    }

    private fun readCandidates(userId: String, sessionId: UUID, pipelineVersion: Int): List<CaptureWordCandidate> =
        db.from(PhotoSessionWordTable)
            .leftJoin(WordMasterTable, on = PhotoSessionWordTable.wordMasterId eq WordMasterTable.id)
            .leftJoin(
                UserWordsTable,
                on = (UserWordsTable.wordMasterId eq WordMasterTable.id) and (UserWordsTable.userId eq userId),
            )
            .select(
                PhotoSessionWordTable.id,
                PhotoSessionWordTable.surfaceText,
                PhotoSessionWordTable.lemma,
                PhotoSessionWordTable.reading,
                PhotoSessionWordTable.meaning,
                PhotoSessionWordTable.kanjiIds,
                UserWordsTable.familiarity,
                UserWordsTable.id,
            )
            .where {
                (PhotoSessionWordTable.photoSessionId eq sessionId) and
                    (PhotoSessionWordTable.pipelineVersion eq pipelineVersion)
            }
            .orderBy(
                PhotoSessionWordTable.firstSeenOrder.asc(),
                PhotoSessionWordTable.normalizedLemma.asc(),
                PhotoSessionWordTable.normalizedReading.asc(),
                PhotoSessionWordTable.id.asc(),
            )
            .map { row ->
                val familiarity = row[UserWordsTable.familiarity]
                val state = when {
                    row[UserWordsTable.id] == null -> "NEW"
                    (familiarity ?: 0) >= 5 -> "FAMILIAR"
                    else -> "LEARNING"
                }
                CaptureWordCandidate(
                    candidateId = row[PhotoSessionWordTable.id]!!.toString(),
                    surfaceText = row[PhotoSessionWordTable.surfaceText].orEmpty(),
                    lemma = row[PhotoSessionWordTable.lemma].orEmpty(),
                    reading = row[PhotoSessionWordTable.reading].orEmpty(),
                    meaning = row[PhotoSessionWordTable.meaning].orEmpty(),
                    kanjiMasterIds = row[PhotoSessionWordTable.kanjiIds].orEmpty(),
                    learningState = state,
                    familiarity = familiarity,
                )
            }

    fun acceptWords(userId: String, sessionId: UUID, candidateIds: Set<UUID>): CaptureWordDecisionResult =
        db.useTransaction {
            val capture = db.from(PhotoSessionTable)
                .select(PhotoSessionTable.pipelineVersion)
                .where { (PhotoSessionTable.id eq sessionId) and (PhotoSessionTable.userId eq userId) }
                .locking(LockingMode.FOR_UPDATE)
                .map { it[PhotoSessionTable.pipelineVersion] ?: 2 }
                .firstOrNull() ?: return@useTransaction CaptureWordDecisionResult.NotFound
            val taskDone = db.from(PhotoSessionTaskTable)
                .select(PhotoSessionTaskTable.id)
                .where {
                    (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                        (PhotoSessionTaskTable.taskType eq TASK_TYPE) and
                        (PhotoSessionTaskTable.pipelineVersion eq capture) and
                        (PhotoSessionTaskTable.status eq "DONE")
                }
                .limit(1)
                .map { true }
                .firstOrNull() == true
            if (!taskDone) return@useTransaction CaptureWordDecisionResult.Invalid
            if (candidateIds.isEmpty()) return@useTransaction CaptureWordDecisionResult.Accepted(0, false)

            val words = db.from(PhotoSessionWordTable)
                .select()
                .where {
                    (PhotoSessionWordTable.photoSessionId eq sessionId) and
                        (PhotoSessionWordTable.pipelineVersion eq capture) and
                        (PhotoSessionWordTable.id inList candidateIds.toList())
                }
                .map { row ->
                    CandidateRow(
                        id = row[PhotoSessionWordTable.id]!!,
                        surfaceText = row[PhotoSessionWordTable.surfaceText].orEmpty(),
                        lemma = row[PhotoSessionWordTable.lemma].orEmpty(),
                        normalizedLemma = row[PhotoSessionWordTable.normalizedLemma].orEmpty(),
                        reading = row[PhotoSessionWordTable.reading].orEmpty(),
                        normalizedReading = row[PhotoSessionWordTable.normalizedReading].orEmpty(),
                        meaning = row[PhotoSessionWordTable.meaning].orEmpty(),
                        kanjiIds = row[PhotoSessionWordTable.kanjiIds].orEmpty().map(UUID::fromString),
                    )
                }
            if (words.map { it.id }.toSet() != candidateIds) return@useTransaction CaptureWordDecisionResult.Invalid

            var added = 0
            var quizDispatchRequired = false
            words.forEach { word ->
                val wordMasterId = resolveWordMaster(word)
                linkAllCapturedOccurrences(word, wordMasterId)
                if (hasUserWord(userId, wordMasterId)) return@forEach
                db.insertOrUpdate(UserWordsTable) {
                    set(it.id, UUID.randomUUID())
                    set(it.userId, userId)
                    set(it.wordMasterId, wordMasterId)
                    set(it.kanjiIds, word.kanjiIds.map(UUID::toString))
                    set(it.source, WordSource.DISCOVERY)
                    set(it.unlocked, true)
                    onConflict(it.userId, it.wordMasterId) { set(it.unlocked, true) }
                }
                added++
                if (!hasGlobalQuizzes(wordMasterId) && !hasQuizJob(userId, wordMasterId)) {
                    enqueueQuiz(userId, word, wordMasterId)
                    quizDispatchRequired = true
                }
            }
            CaptureWordDecisionResult.Accepted(added, quizDispatchRequired)
        }

    private fun resolveWordMaster(word: CandidateRow): UUID =
        db.insertOrUpdateReturning(WordMasterTable, WordMasterTable.id) {
            val id = UUID.randomUUID()
            set(it.id, id)
            set(it.word, word.lemma)
            set(it.reading, word.reading)
            set(it.normalizedLemma, word.normalizedLemma)
            set(it.normalizedReading, word.normalizedReading)
            set(it.meanings, listOf(word.meaning))
            set(it.kanjiIds, word.kanjiIds.map(UUID::toString))
            onConflict(it.normalizedLemma, it.normalizedReading) {
                set(it.normalizedLemma, word.normalizedLemma)
            }
        } ?: error("Word identity upsert did not return an id")

    private fun linkAllCapturedOccurrences(word: CandidateRow, wordMasterId: UUID) {
        db.update(PhotoSessionWordTable) {
            set(it.wordMasterId, wordMasterId)
            where {
                (it.normalizedLemma eq word.normalizedLemma) and
                    (it.normalizedReading eq word.normalizedReading) and
                    it.wordMasterId.isNull()
            }
        }
    }

    private fun hasUserWord(userId: String, wordMasterId: UUID): Boolean = db.from(UserWordsTable)
        .select(UserWordsTable.id)
        .where { (UserWordsTable.userId eq userId) and (UserWordsTable.wordMasterId eq wordMasterId) }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun hasGlobalQuizzes(wordMasterId: UUID): Boolean = db.from(QuizBankTable)
        .select(QuizBankTable.id)
        .where { (QuizBankTable.wordId eq wordMasterId) and QuizBankTable.userId.isNull() }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun hasQuizJob(userId: String, wordMasterId: UUID): Boolean = db.from(QuizGenerationJobTable)
        .select(QuizGenerationJobTable.id)
        .where {
            (QuizGenerationJobTable.userId eq userId) and
                (QuizGenerationJobTable.wordMasterId eq wordMasterId)
        }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun enqueueQuiz(userId: String, word: CandidateRow, wordMasterId: UUID) {
        val anchor = word.kanjiIds.firstOrNull() ?: return
        val jobId = UUID.randomUUID()
        db.insert(QuizGenerationJobTable) {
            set(it.id, jobId)
            set(it.userId, userId)
            set(it.kanjiId, anchor)
            set(it.wordMasterId, wordMasterId)
            set(it.jobType, JobType.INITIAL)
            set(it.trigger, JOB_TYPE)
        }
        val config = modelConfigs.getActive()
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "quiz_generation")
            set(it.jobId, jobId)
            set(it.attemptNumber, 1)
            set(it.status, "pending")
            set(it.trigger, "initial")
            set(it.modelConfigVersion, config?.version)
            set(it.modelId, config?.quizGenerationModel)
            set(it.createdBy, "system")
        }
    }

    fun complete(
        claim: CaptureWordDiscoveryClaim,
        words: List<CapturedWordPublication>,
        costMicrodollars: Long,
    ): Boolean = db.useTransaction {
        recordCost(claim, costMicrodollars)
        if (!ownsActiveClaim(claim)) return@useTransaction false
        words.forEach { word ->
            val existingWordMasterId = db.from(WordMasterTable)
                .select(WordMasterTable.id)
                .where {
                    (WordMasterTable.normalizedLemma eq word.normalizedLemma) and
                        (WordMasterTable.normalizedReading eq word.normalizedReading)
                }
                .limit(1)
                .map { it[WordMasterTable.id] }
                .firstOrNull()
            db.insert(PhotoSessionWordTable) {
                set(it.id, word.id)
                set(it.photoSessionId, claim.sessionId)
                set(it.surfaceText, word.surfaceText)
                set(it.lemma, word.lemma)
                set(it.normalizedLemma, word.normalizedLemma)
                set(it.reading, word.reading)
                set(it.normalizedReading, word.normalizedReading)
                set(it.meaning, word.meaning)
                set(it.firstSeenOrder, word.firstSeenOrder)
                set(it.kanjiIds, word.kanjiIds.map(UUID::toString))
                if (existingWordMasterId != null) set(it.wordMasterId, existingWordMasterId)
                set(it.pipelineVersion, claim.pipelineVersion)
            }
        }
        val now = Instant.now()
        db.update(PhotoSessionTaskTable) {
            set(it.status, "DONE")
            set(it.finishedAt, now)
            set(it.leaseUntil, null)
            where { (it.id eq claim.taskId) and (it.status eq "PROCESSING") }
        }
        db.update(JobAttemptTable) {
            set(it.status, "done")
            set(it.finishedAt, now)
            where {
                (it.id eq claim.attemptId) and
                    (it.status eq "processing") and
                    (it.claimToken eq claim.claimToken)
            }
        }
        touchCapture(claim.sessionId)
        true
    }

    fun fail(claim: CaptureWordDiscoveryClaim, failureCode: String, costMicrodollars: Long = 0): Boolean =
        db.useTransaction {
            recordCost(claim, costMicrodollars)
            if (!ownsActiveClaim(claim)) return@useTransaction false
            val now = Instant.now()
            db.update(PhotoSessionTaskTable) {
                set(it.status, "FAILED")
                set(it.failureCode, failureCode)
                set(it.finishedAt, now)
                set(it.leaseUntil, null)
                where { (it.id eq claim.taskId) and (it.status eq "PROCESSING") }
            }
            db.update(JobAttemptTable) {
                set(it.status, "failed")
                set(it.failureCode, failureCode)
                set(it.finishedAt, now)
                where {
                    (it.id eq claim.attemptId) and
                        (it.status eq "processing") and
                        (it.claimToken eq claim.claimToken)
                }
            }
            touchCapture(claim.sessionId)
            true
        }

    fun activityState(sessionId: UUID, pipelineVersion: Int): Pair<String, String>? =
        db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.taskType, PhotoSessionTaskTable.status)
            .where {
                (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                    (PhotoSessionTaskTable.taskType eq TASK_TYPE) and
                    (PhotoSessionTaskTable.pipelineVersion eq pipelineVersion)
            }
            .map { row -> row[PhotoSessionTaskTable.taskType].orEmpty() to row[PhotoSessionTaskTable.status].orEmpty() }
            .firstOrNull()

    fun pendingTaskIds(limit: Int): List<UUID> {
        require(limit in 1..100)
        return db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.id)
            .where {
                (PhotoSessionTaskTable.taskType eq TASK_TYPE) and
                    (PhotoSessionTaskTable.status eq "PENDING")
            }
            .orderBy(PhotoSessionTaskTable.createdAt.asc(), PhotoSessionTaskTable.id.asc())
            .limit(limit)
            .mapNotNull { it[PhotoSessionTaskTable.id] }
    }

    private fun ownsActiveClaim(claim: CaptureWordDiscoveryClaim): Boolean = db.from(JobAttemptTable)
        .select(JobAttemptTable.id)
        .where {
            (JobAttemptTable.id eq claim.attemptId) and
                (JobAttemptTable.status eq "processing") and
                (JobAttemptTable.claimToken eq claim.claimToken)
        }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun recordCost(claim: CaptureWordDiscoveryClaim, cost: Long) {
        if (cost <= 0) return
        db.insertOrUpdate(UserCostTable) {
            set(it.id, UUID.randomUUID())
            set(it.userId, claim.userId)
            set(it.operationType, "CAPTURE_WORD_DISCOVERY")
            set(it.operationId, claim.taskId)
            set(it.jobAttemptId, claim.attemptId)
            set(it.costMicrodollars, cost)
            onConflict(it.jobAttemptId) { set(it.costMicrodollars, cost) }
        }
    }

    private fun latestAttempt(taskId: UUID): RetryAttempt? = db.from(JobAttemptTable)
        .select(
            JobAttemptTable.attemptNumber,
            JobAttemptTable.modelConfigVersion,
            JobAttemptTable.modelId,
        )
        .where { (JobAttemptTable.jobType eq JOB_TYPE) and (JobAttemptTable.jobId eq taskId) }
        .orderBy(JobAttemptTable.attemptNumber.desc())
        .limit(1)
        .map { row ->
            RetryAttempt(
                attemptNumber = row[JobAttemptTable.attemptNumber] ?: 0,
                modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                modelId = row[JobAttemptTable.modelId],
            )
        }
        .firstOrNull()

    private fun touchCapture(sessionId: UUID) {
        db.update(PhotoSessionTable) {
            set(it.updatedAt, Instant.now())
            where { it.id eq sessionId }
        }
    }

    private data class CaptureEligibility(
        val status: String,
        val processingStatus: String,
        val pipelineVersion: Int,
        val fullText: String?,
    ) {
        val isReady: Boolean get() = processingStatus == "READY" || status in setOf("DONE", "INGESTED")
    }

    private data class ClaimableTask(
        val sessionId: UUID,
        val status: String,
        val pipelineVersion: Int,
        val userId: String,
        val fullText: String,
    )

    private data class Attempt(
        val id: UUID,
        val status: String,
        val modelConfigVersion: Long?,
        val modelId: String?,
    )

    private data class RetryAttempt(
        val attemptNumber: Int,
        val modelConfigVersion: Long?,
        val modelId: String?,
    )

    private data class CandidateRow(
        val id: UUID,
        val surfaceText: String,
        val lemma: String,
        val normalizedLemma: String,
        val reading: String,
        val normalizedReading: String,
        val meaning: String,
        val kanjiIds: List<UUID>,
    )

    companion object {
        const val TASK_TYPE = "CAPTURE_WORD_DISCOVERY"
        const val JOB_TYPE = "capture_word_discovery"
    }
}
