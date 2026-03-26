package com.kanjimasta

import com.kanjimasta.core.db.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class InternalIntegrationTest {

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
        }

        try {
            val response = client.post("/api/internal/photo-result") {
                header("X-Internal-Key", "test-internal-key")
                contentType(ContentType.Application.Json)
                setBody("""{"sessionId":"$sessionId","userId":"internal-test-user","enrichedKanji":"[{\"character\":\"日\"}]","costMicrodollars":5000}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            // Verify photo_session was updated
            val session = TestDatabase.db.from(PhotoSessionTable)
                .select()
                .where { PhotoSessionTable.id eq UUID.fromString(sessionId) }
                .map { it[PhotoSessionTable.rawAiResponse] to it[PhotoSessionTable.costMicrodollars] }
                .first()
            assertEquals("[{\"character\":\"日\"}]", session.first)
            assertEquals(5000L, session.second)

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
