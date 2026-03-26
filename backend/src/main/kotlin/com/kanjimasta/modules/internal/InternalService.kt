package com.kanjimasta.modules.internal

import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.slf4j.LoggerFactory
import java.util.UUID

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.internal.InternalService")

class InternalService(private val db: Database) {

    fun handlePhotoResult(request: PhotoResultRequest) {
        db.useTransaction {
            // 1. Update photo_session
            db.update(PhotoSessionTable) {
                set(it.rawAiResponse, request.enrichedKanji)
                set(it.costMicrodollars, request.costMicrodollars)
                where { it.id eq UUID.fromString(request.sessionId) }
            }

            // 2. Record cost
            if (request.costMicrodollars > 0 && request.userId.isNotBlank()) {
                db.insert(UserCostTable) {
                    set(it.userId, request.userId)
                    set(it.operationType, "PHOTO_ANALYSIS")
                    set(it.operationId, UUID.fromString(request.sessionId))
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
        logger.info("Job status updated: job={} status={}", request.jobId, request.status)
    }
}
