package com.kanjimasta.modules.internal

import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.slf4j.LoggerFactory
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.internal.InternalService")

class InternalService(private val db: Database) {

    fun handlePhotoResult(request: PhotoResultRequest) {
        db.useTransaction {
            val sessionId = UUID.fromString(request.sessionId)
            val session = db.from(PhotoSessionTable)
                .select(PhotoSessionTable.status, PhotoSessionTable.userId)
                .where { PhotoSessionTable.id eq sessionId }
                .map { row -> row[PhotoSessionTable.status] to row[PhotoSessionTable.userId] }
                .firstOrNull()
                ?: error("Photo session not found")
            require(session.second == request.userId) { "Photo result user does not own session" }
            if (session.first == PhotoSessionStatus.DONE.name) {
                logger.info("Ignoring duplicate photo result for completed session={}", request.sessionId)
                return@useTransaction
            }

            // 1. Update photo_session
            val hasResult = request.enrichedKanji.isNotBlank() && request.enrichedKanji != "[]"
            val status = if (hasResult) PhotoSessionStatus.DONE else PhotoSessionStatus.FAILED
            db.update(PhotoSessionTable) {
                set(it.rawAiResponse, request.enrichedKanji)
                set(it.status, status.name)
                set(it.failureCode, if (hasResult) null else request.failureCode ?: PhotoFailureCode.INVALID_RESPONSE)
                set(it.costMicrodollars, request.costMicrodollars)
                where { it.id eq sessionId }
            }
            terminalizeAttempt(
                jobType = "photo_analysis",
                jobId = sessionId,
                status = if (hasResult) "done" else "failed",
                failureCode = if (hasResult) null else request.failureCode ?: PhotoFailureCode.INVALID_RESPONSE,
            )

            // 2. Record cost
            if (request.costMicrodollars > 0 && request.userId.isNotBlank()) {
                db.insert(UserCostTable) {
                    set(it.userId, request.userId)
                    set(it.operationType, "PHOTO_ANALYSIS")
                    set(it.operationId, sessionId)
                    set(it.costMicrodollars, request.costMicrodollars)
                }
            }

            logger.info("Photo result saved: session={} cost={}", request.sessionId, request.costMicrodollars)
        }
    }

    fun handleQuizResult(request: QuizResultRequest) {
        db.useTransaction {
            // 1. Insert quizzes + distractors
            for (quiz in request.quizzes) {
                val quizId = UUID.randomUUID()
                db.insert(QuizBankTable) {
                    set(it.id, quizId)
                    set(it.kanjiId, UUID.fromString(quiz.kanjiId))
                    set(it.wordId, UUID.fromString(quiz.wordMasterId))
                    set(it.quizType, QuizType.valueOf(quiz.quizType))
                    set(it.prompt, quiz.prompt)
                    set(it.target, quiz.target)
                    set(it.answer, quiz.answer)
                    set(it.furigana, quiz.furigana)
                    set(it.explanation, quiz.explanation)
                }

                if (quiz.distractors.isNotEmpty()) {
                    db.insert(QuizDistractorTable) {
                        set(it.quizId, quizId)
                        set(it.distractors, quiz.distractors)
                        set(it.generation, 1)
                        set(it.trigger, DistractorTrigger.INITIAL)
                        set(it.familiarityAtGeneration, 0)
                    }
                }
            }

            // 2. Update job status + cost
            val jobId = UUID.fromString(request.jobId)
            db.update(QuizGenerationJobTable) {
                set(it.status, JobStatus.valueOf(request.status))
                if (request.costMicrodollars > 0) {
                    set(it.costMicrodollars, request.costMicrodollars)
                }
                where { it.id eq jobId }
            }
            terminalizeAttempt(
                jobType = "quiz_generation",
                jobId = jobId,
                status = request.status.lowercase(),
                failureCode = if (request.status == "FAILED") "provider_failed" else null,
            )

            // 3. Record cost
            if (request.costMicrodollars > 0 && request.userId.isNotBlank()) {
                db.insert(UserCostTable) {
                    set(it.userId, request.userId)
                    set(it.operationType, request.operationType)
                    set(it.operationId, jobId)
                    set(it.costMicrodollars, request.costMicrodollars)
                }
            }

            logger.info("Quiz result saved: job={} status={} quizzes={} cost={}",
                request.jobId, request.status, request.quizzes.size, request.costMicrodollars)
        }
    }

    fun cleanupStalePhotoSessions(): Int {
        // Photo analysis runs as a Cloud Run Job with a 24-hour task timeout.
        val cutoff = Instant.now().minus(25, ChronoUnit.HOURS)
        return db.useTransaction {
            val staleIds = db.from(PhotoSessionTable)
                .select(PhotoSessionTable.id)
                .where { (PhotoSessionTable.status eq "PROCESSING") and (PhotoSessionTable.updatedAt less cutoff) }
                .mapNotNull { it[PhotoSessionTable.id] }
            val staleQuizIds = db.from(QuizGenerationJobTable)
                .select(QuizGenerationJobTable.id)
                .where {
                    (QuizGenerationJobTable.status inList listOf(JobStatus.PENDING, JobStatus.PROCESSING)) and
                        (QuizGenerationJobTable.updatedAt less cutoff)
                }
                .mapNotNull { it[QuizGenerationJobTable.id] }
            val photoUpdated = if (staleIds.isEmpty()) 0 else db.update(PhotoSessionTable) {
                set(it.status, PhotoSessionStatus.FAILED.name)
                set(it.failureCode, PhotoFailureCode.TIMED_OUT)
                where {
                    (it.id inList staleIds) and (it.status eq "PROCESSING") and (it.updatedAt less cutoff)
                }
            }
            val quizUpdated = if (staleQuizIds.isEmpty()) 0 else db.update(QuizGenerationJobTable) {
                set(it.status, JobStatus.FAILED)
                where {
                    (it.id inList staleQuizIds) and
                        (it.status inList listOf(JobStatus.PENDING, JobStatus.PROCESSING)) and
                        (it.updatedAt less cutoff)
                }
            }
            staleIds.forEach { id ->
                terminalizeAttempt("photo_analysis", id, "failed", PhotoFailureCode.TIMED_OUT)
            }
            staleQuizIds.forEach { id ->
                terminalizeAttempt("quiz_generation", id, "failed", PhotoFailureCode.TIMED_OUT)
            }
            photoUpdated + quizUpdated
        }
    }

    fun handleJobStatus(request: JobStatusRequest) {
        val jobId = UUID.fromString(request.jobId)
        if (request.incrementAttempts) {
            db.update(QuizGenerationJobTable) {
                set(it.status, JobStatus.valueOf(request.status))
                set(it.attempts, it.attempts + 1)
                where { it.id eq jobId }
            }
        } else {
            db.update(QuizGenerationJobTable) {
                set(it.status, JobStatus.valueOf(request.status))
                where { it.id eq jobId }
            }
        }
        if (request.status in setOf("DONE", "FAILED")) {
            terminalizeAttempt(
                "quiz_generation",
                jobId,
                request.status.lowercase(),
                if (request.status == "FAILED") "provider_failed" else null,
            )
        } else if (request.status == "PROCESSING") {
            val activeId = latestActiveAttemptId("quiz_generation", jobId)
            if (activeId != null) {
                db.update(JobAttemptTable) {
                    set(it.status, "processing")
                    set(it.startedAt, Instant.now())
                    where { (it.id eq activeId) and (it.status eq "pending") }
                }
            }
        }
        logger.info("Job status updated: job={} status={}", request.jobId, request.status)
    }

    private fun terminalizeAttempt(jobType: String, jobId: UUID, status: String, failureCode: String?) {
        val activeId = latestActiveAttemptId(jobType, jobId) ?: return
        db.update(JobAttemptTable) {
            set(it.status, status)
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            where { (it.id eq activeId) and (it.status inList listOf("pending", "processing")) }
        }
    }

    private fun latestActiveAttemptId(jobType: String, jobId: UUID): UUID? =
        db.from(JobAttemptTable)
            .select(JobAttemptTable.id)
            .where {
                (JobAttemptTable.jobType eq jobType) and
                    (JobAttemptTable.jobId eq jobId) and
                    (JobAttemptTable.status inList listOf("pending", "processing"))
            }
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .limit(1)
            .map { it[JobAttemptTable.id] }
            .firstOrNull()
}
