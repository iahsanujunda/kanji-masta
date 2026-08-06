package com.kanjimasta.internal

import com.kanjimasta.support.*

import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.photo.PhotoFailureCode
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.quiz.DistractorTrigger
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.QuizType
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import java.util.UUID
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class InternalIntegrationTest : com.kanjimasta.support.PersistenceTest() {

    @Test
    fun `stale reconciler terminalizes quiz job and attempt`() = testApplication {
        val kanjiId = UUID.randomUUID()
        val jobId = UUID.randomUUID()
        TestDatabase.db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, "停")
            set(it.onyomi, listOf("テイ"))
            set(it.kunyomi, emptyList())
            set(it.meanings, listOf("stop"))
        }
        TestDatabase.db.insert(QuizGenerationJobTable) {
            set(it.id, jobId)
            set(it.userId, "stale-user")
            set(it.kanjiId, kanjiId)
            set(it.status, JobStatus.PROCESSING)
            set(it.updatedAt, Instant.now().minus(26, ChronoUnit.HOURS))
        }
        TestDatabase.db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "quiz_generation")
            set(it.jobId, jobId)
            set(it.attemptNumber, 1)
            set(it.status, "processing")
            set(it.trigger, "initial")
            set(it.createdBy, "system")
        }
        application { testModule(TestDatabase.db) }

        val response = jsonClient().post("/api/internal/cron/cleanup-photo-sessions") {
            header("X-Internal-Key", "test-internal-key")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val jobStatus = TestDatabase.db.from(QuizGenerationJobTable)
            .select(QuizGenerationJobTable.status)
            .where { QuizGenerationJobTable.id eq jobId }
            .map { it[QuizGenerationJobTable.status] }
            .single()
        val attemptStatus = TestDatabase.db.from(JobAttemptTable)
            .select(JobAttemptTable.status, JobAttemptTable.failureCode)
            .where { JobAttemptTable.jobId eq jobId }
            .map { it[JobAttemptTable.status] to it[JobAttemptTable.failureCode] }
            .single()
        assertEquals(JobStatus.FAILED, jobStatus)
        assertEquals("failed" to PhotoFailureCode.TIMED_OUT, attemptStatus)
    }

    @Test
    fun `POST internal photo-result updates session and records cost`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        // Create a photo session
        val sessionId = UUID.randomUUID().toString()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString(sessionId))
            set(it.userId, "internal-test-user")
            set(it.imageUrl, "https://example.com/test.jpg")
            set(it.status, "FAILED")
            set(it.failureCode, PhotoFailureCode.DISPATCH_FAILED)
        }

        try {
            val response = client.post("/api/internal/photo-result") {
                header("X-Internal-Key", "test-internal-key")
                contentType(ContentType.Application.Json)
                setBody("""{"sessionId":"$sessionId","userId":"internal-test-user","enrichedKanji":"[{\"character\":\"日\"}]","costMicrodollars":5000}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            val duplicate = client.post("/api/internal/photo-result") {
                header("X-Internal-Key", "test-internal-key")
                contentType(ContentType.Application.Json)
                setBody("""{"sessionId":"$sessionId","userId":"internal-test-user","enrichedKanji":"[{\"character\":\"月\"}]","costMicrodollars":9000}""")
            }
            assertEquals(HttpStatusCode.OK, duplicate.status)

            // The first terminal callback wins, so a retried job cannot duplicate cost.
            val session = TestDatabase.db.from(PhotoSessionTable)
                .select()
                .where { PhotoSessionTable.id eq UUID.fromString(sessionId) }
                .map {
                    listOf(
                        it[PhotoSessionTable.rawAiResponse],
                        it[PhotoSessionTable.costMicrodollars],
                        it[PhotoSessionTable.status],
                        it[PhotoSessionTable.failureCode],
                    )
                }
                .first()
            assertEquals("[{\"character\":\"日\"}]", session[0])
            assertEquals(5000L, session[1])
            assertEquals("DONE", session[2])
            assertEquals(null, session[3])

            // Verify user_cost was created
            val costCount = TestDatabase.db.from(UserCostTable)
                .select()
                .where { (UserCostTable.operationId eq UUID.fromString(sessionId)) and (UserCostTable.operationType eq "PHOTO_ANALYSIS") }
                .totalRecordsInAllPages
            assertEquals(1, costCount)
        } finally {
            TestDatabase.db.delete(UserCostTable) { it.operationId eq UUID.fromString(sessionId) }
            TestDatabase.db.delete(PhotoSessionTable) { it.id eq UUID.fromString(sessionId) }
        }
    }

    @Test
    fun `POST internal empty photo-result marks session failed with provided code`() = testApplication {
        application { testModule(TestDatabase.db) }
        val sessionId = UUID.randomUUID()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, sessionId)
            set(it.userId, "internal-test-user")
            set(it.imageUrl, "https://example.com/failed.jpg")
        }
        TestDatabase.db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "photo_analysis")
            set(it.jobId, sessionId)
            set(it.attemptNumber, 1)
            set(it.status, "processing")
            set(it.trigger, "initial")
            set(it.createdBy, "system")
        }

        val response = jsonClient().post("/api/internal/photo-result") {
            header("X-Internal-Key", "test-internal-key")
            contentType(ContentType.Application.Json)
            setBody(
                """{"sessionId":"$sessionId","userId":"internal-test-user","enrichedKanji":"[]","costMicrodollars":0,"failureCode":"provider_failed"}""",
            )
        }
        assertEquals(HttpStatusCode.OK, response.status)

        val failed = TestDatabase.db.from(PhotoSessionTable)
            .select(PhotoSessionTable.status, PhotoSessionTable.failureCode)
            .where { PhotoSessionTable.id eq sessionId }
            .map { it[PhotoSessionTable.status] to it[PhotoSessionTable.failureCode] }
            .first()
        assertEquals("FAILED", failed.first)
        assertEquals("provider_failed", failed.second)
        val attempt = TestDatabase.db.from(JobAttemptTable)
            .select(JobAttemptTable.status, JobAttemptTable.failureCode)
            .where { JobAttemptTable.jobId eq sessionId }
            .map { it[JobAttemptTable.status] to it[JobAttemptTable.failureCode] }
            .single()
        assertEquals("failed", attempt.first)
        assertEquals("provider_failed", attempt.second)
    }

    @Test
    fun `POST internal quiz-result inserts quizzes and updates job`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        // Seed kanji + word + job
        val kanjiId = TestDatabase.db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id)
            .limit(1)
            .map { it[KanjiMasterTable.id]!! }
            .firstOrNull() ?: return@testApplication

        val wordId = UUID.randomUUID()
        TestDatabase.db.insert(WordMasterTable) {
            set(it.id, wordId)
            set(it.word, "内部テスト")
            set(it.reading, "ないぶてすと")
            set(it.meanings, listOf("internal test"))
            set(it.kanjiIds, listOf(kanjiId.toString()))
        }

        val jobId = UUID.randomUUID()
        TestDatabase.db.insert(QuizGenerationJobTable) {
            set(it.id, jobId)
            set(it.userId, "internal-test-user")
            set(it.kanjiId, kanjiId)
            set(it.wordMasterId, wordId)
            set(it.status, JobStatus.PROCESSING)
        }

        try {
            val response = client.post("/api/internal/quiz-result") {
                header("X-Internal-Key", "test-internal-key")
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("jobId", jobId.toString())
                    put("userId", "internal-test-user")
                    put("status", "DONE")
                    put("costMicrodollars", 8000)
                    put("operationType", "QUIZ_GENERATION")
                    putJsonArray("quizzes") {
                        addJsonObject {
                            put("kanjiId", kanjiId.toString())
                            put("wordMasterId", wordId.toString())
                            put("quizType", "MEANING_RECALL")
                            put("prompt", "What does this mean?")
                            put("target", "内部テスト")
                            put("answer", "internal test")
                            putJsonArray("distractors") { add("wrong1"); add("wrong2"); add("wrong3") }
                        }
                    }
                }.toString())
            }
            assertEquals(HttpStatusCode.OK, response.status)

            // Verify job status updated
            val jobStatus = TestDatabase.db.from(QuizGenerationJobTable)
                .select(QuizGenerationJobTable.status, QuizGenerationJobTable.costMicrodollars)
                .where { QuizGenerationJobTable.id eq jobId }
                .map { it[QuizGenerationJobTable.status] to it[QuizGenerationJobTable.costMicrodollars] }
                .first()
            assertEquals(JobStatus.DONE, jobStatus.first)
            assertEquals(8000L, jobStatus.second)

            // Verify quiz was inserted
            val quizCount = TestDatabase.db.from(QuizBankTable)
                .select()
                .where { QuizBankTable.wordId eq wordId }
                .totalRecordsInAllPages
            assertTrue(quizCount >= 1, "Should have inserted at least 1 quiz")
        } finally {
            TestDatabase.db.delete(QuizDistractorTable) {
                it.quizId inList TestDatabase.db.from(QuizBankTable).select(QuizBankTable.id).where { QuizBankTable.wordId eq wordId }.map { r -> r[QuizBankTable.id]!! }
            }
            TestDatabase.db.delete(QuizBankTable) { it.wordId eq wordId }
            TestDatabase.db.delete(UserCostTable) { it.operationId eq jobId }
            TestDatabase.db.delete(QuizGenerationJobTable) { it.id eq jobId }
            TestDatabase.db.delete(WordMasterTable) { it.id eq wordId }
        }
    }

    @Test
    fun `POST internal job-status updates status`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        val kanjiId = TestDatabase.db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id)
            .limit(1)
            .map { it[KanjiMasterTable.id]!! }
            .firstOrNull() ?: return@testApplication

        val jobId = UUID.randomUUID()
        TestDatabase.db.insert(QuizGenerationJobTable) {
            set(it.id, jobId)
            set(it.userId, "internal-test-user")
            set(it.kanjiId, kanjiId)
            set(it.status, JobStatus.PENDING)
        }

        try {
            val response = client.post("/api/internal/job-status") {
                header("X-Internal-Key", "test-internal-key")
                contentType(ContentType.Application.Json)
                setBody("""{"jobId":"${jobId}","status":"PROCESSING","incrementAttempts":false}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            val status = TestDatabase.db.from(QuizGenerationJobTable)
                .select(QuizGenerationJobTable.status)
                .where { QuizGenerationJobTable.id eq jobId }
                .map { it[QuizGenerationJobTable.status] }
                .first()
            assertEquals(JobStatus.PROCESSING, status)
        } finally {
            TestDatabase.db.delete(QuizGenerationJobTable) { it.id eq jobId }
        }
    }

    @Test
    fun `POST internal endpoint without key returns 401`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        val response = client.post("/api/internal/photo-result") {
            header("X-Internal-Key", "wrong-key")
            contentType(ContentType.Application.Json)
            setBody("""{"sessionId":"fake","userId":"fake","enrichedKanji":"[]","costMicrodollars":0}""")
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
