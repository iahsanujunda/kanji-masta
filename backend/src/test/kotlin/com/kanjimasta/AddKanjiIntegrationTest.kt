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

class AddKanjiIntegrationTest {

    private fun cleanupTestUser(db: org.ktorm.database.Database, userId: String) {
        db.useConnection { conn ->
            conn.createStatement().execute("DELETE FROM user_words WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM quiz_generation_job WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM user_kanji WHERE user_id = '$userId'")
        }
    }

    /**
     * Seeds a kanji in kanji_master with WordMaster and global QuizBank entries.
     * Returns the kanjiMasterId.
     */
    private fun seedKanjiWithWordsAndQuizzes(
        db: org.ktorm.database.Database,
        char: String,
        meaning: String,
    ): UUID {
        val kanjiId = db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id)
            .where { KanjiMasterTable.character eq char }
            .map { it[KanjiMasterTable.id]!! }
            .firstOrNull()
            ?: UUID.randomUUID().also { id ->
                db.insert(KanjiMasterTable) {
                    set(it.id, id)
                    set(it.character, char)
                    set(it.onyomi, listOf("テスト"))
                    set(it.kunyomi, emptyList())
                    set(it.meanings, listOf(meaning))
                    set(it.frequency, 10)
                    set(it.jlpt, 5)
                }
            }

        // Create WordMaster linked to this kanji
        val wordText = "${char}語"
        val wordId = db.from(WordMasterTable)
            .select(WordMasterTable.id)
            .where { WordMasterTable.word eq wordText }
            .map { it[WordMasterTable.id]!! }
            .firstOrNull()
            ?: UUID.randomUUID().also { id ->
                db.insert(WordMasterTable) {
                    set(it.id, id)
                    set(it.word, wordText)
                    set(it.reading, "よみ")
                    set(it.meanings, listOf("$meaning word"))
                    set(it.kanjiIds, listOf(kanjiId.toString()))
                }
            }

        // Create global quiz (user_id = NULL) for that word
        val hasQuiz = db.from(QuizBankTable)
            .select(QuizBankTable.id)
            .where { (QuizBankTable.wordId eq wordId) and QuizBankTable.userId.isNull() }
            .totalRecordsInAllPages > 0
        if (!hasQuiz) {
            db.insert(QuizBankTable) {
                set(it.kanjiId, kanjiId)
                set(it.wordId, wordId)
                set(it.quizType, QuizType.MEANING_RECALL)
                set(it.prompt, "What does $wordText mean?")
                set(it.target, wordText)
                set(it.answer, "$meaning word")
                set(it.explanation, "It means $meaning word")
            }
        }

        return kanjiId
    }

    /**
     * Seeds a kanji in kanji_master with NO WordMaster or QuizBank entries.
     * Returns the kanjiMasterId.
     */
    private fun seedKanjiWithoutWords(
        db: org.ktorm.database.Database,
        char: String,
        meaning: String,
    ): UUID {
        return db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id)
            .where { KanjiMasterTable.character eq char }
            .map { it[KanjiMasterTable.id]!! }
            .firstOrNull()
            ?: UUID.randomUUID().also { id ->
                db.insert(KanjiMasterTable) {
                    set(it.id, id)
                    set(it.character, char)
                    set(it.onyomi, listOf("テスト"))
                    set(it.kunyomi, emptyList())
                    set(it.meanings, listOf(meaning))
                    set(it.frequency, 99)
                    set(it.jlpt, 4)
                }
            }
    }

    // =========================================================================
    // Test 1: Kanji with existing WordMaster + QuizBank → reuses them, no LLM
    // =========================================================================

    @Test
    fun `POST kanji add with existing words and quizzes reuses them without enqueueing jobs`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiId = seedKanjiWithWordsAndQuizzes(TestDatabase.db, "光", "light")

        try {
            val client = jsonClient()
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[{"kanjiMasterId":"$kanjiId","status":"learning"}]}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            // Wait for async processWordsForKanji to complete
            Thread.sleep(500)

            // Verify user_kanji was created
            val userKanjiCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where { (UserKanjiTable.userId eq TEST_USER_ID) and (UserKanjiTable.kanjiId eq kanjiId) }
                .totalRecordsInAllPages
            assertEquals(1, userKanjiCount, "user_kanji should be created")

            // Verify UserWords was created (linked to existing WordMaster)
            val userWordsCount = TestDatabase.db.from(UserWordsTable)
                .select()
                .where { UserWordsTable.userId eq TEST_USER_ID }
                .totalRecordsInAllPages
            assertTrue(userWordsCount >= 1, "user_words should be created from existing WordMaster")

            // Verify NO quiz generation job was enqueued (existing global quizzes should be reused)
            val jobCount = TestDatabase.db.from(QuizGenerationJobTable)
                .select()
                .where { (QuizGenerationJobTable.userId eq TEST_USER_ID) and (QuizGenerationJobTable.kanjiId eq kanjiId) }
                .totalRecordsInAllPages
            assertEquals(0, jobCount, "No quiz generation job should be enqueued when global quizzes exist")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test 2: Kanji with no words → enqueues quiz generation job (LLM needed)
    // =========================================================================

    @Test
    fun `POST kanji add without existing words enqueues quiz generation job`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiId = seedKanjiWithoutWords(TestDatabase.db, "鬼", "demon")

        try {
            val client = jsonClient()
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[{"kanjiMasterId":"$kanjiId","status":"learning"}]}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            // Wait for async processWordsForKanji to complete
            Thread.sleep(500)

            // Verify user_kanji was created
            val userKanjiCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where { (UserKanjiTable.userId eq TEST_USER_ID) and (UserKanjiTable.kanjiId eq kanjiId) }
                .totalRecordsInAllPages
            assertEquals(1, userKanjiCount, "user_kanji should be created")

            // Verify a quiz generation job WAS enqueued (no words → LLM needed)
            val jobs = TestDatabase.db.from(QuizGenerationJobTable)
                .select()
                .where { (QuizGenerationJobTable.userId eq TEST_USER_ID) and (QuizGenerationJobTable.kanjiId eq kanjiId) }
                .map {
                    it[QuizGenerationJobTable.status] to it[QuizGenerationJobTable.wordMasterId]
                }
            assertTrue(jobs.isNotEmpty(), "Quiz generation job should be enqueued when no words exist")

            // The job should have wordMasterId = null (AI worker will generate words + quizzes together)
            val (status, wordMasterId) = jobs.first()
            assertEquals(JobStatus.PENDING, status, "Job should be PENDING")
            assertEquals(null, wordMasterId, "wordMasterId should be null — AI worker generates words and quizzes together")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test 3: Global quizzes are reusable across users
    // (Verified via InternalIntegrationTest — quiz-result inserts with user_id=NULL)
    // Here we verify that a second user adding the same kanji reuses existing
    // global quizzes and does NOT enqueue a new job.
    // =========================================================================

    @Test
    fun `POST kanji add by second user reuses global quizzes from first user`() = testApplication {
        application { testModule(TestDatabase.db) }

        // Use a different user ID to simulate a second user
        val secondUserId = "second-test-user"
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        cleanupTestUser(TestDatabase.db, secondUserId)

        val kanjiId = seedKanjiWithWordsAndQuizzes(TestDatabase.db, "星", "star")

        try {
            val client = jsonClient()

            // First user adds the kanji
            val resp1 = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[{"kanjiMasterId":"$kanjiId","status":"learning"}]}""")
            }
            assertEquals(HttpStatusCode.OK, resp1.status)
            Thread.sleep(500)

            // Verify first user got no job enqueued (global quizzes exist)
            val jobs1 = TestDatabase.db.from(QuizGenerationJobTable)
                .select()
                .where { (QuizGenerationJobTable.userId eq TEST_USER_ID) and (QuizGenerationJobTable.kanjiId eq kanjiId) }
                .totalRecordsInAllPages
            assertEquals(0, jobs1, "First user should not enqueue job when global quizzes exist")

            // Now simulate second user adding the same kanji directly via repository
            // (We can't change the auth user in the test harness, so verify at DB level)
            val kanjiRepo = com.kanjimasta.modules.kanji.KanjiRepository(TestDatabase.db)
            kanjiRepo.insertUserKanji(secondUserId, kanjiId.toString(), "learning", null)

            // Check if global quizzes exist for the word
            val wordId = TestDatabase.db.from(WordMasterTable)
                .select(WordMasterTable.id)
                .where { WordMasterTable.word eq "星語" }
                .map { it[WordMasterTable.id]!! }
                .first()

            val hasGlobal = kanjiRepo.hasGlobalQuizzes(wordId.toString())
            assertTrue(hasGlobal, "Global quizzes should exist and be reusable by second user")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
            cleanupTestUser(TestDatabase.db, secondUserId)
        }
    }

    // =========================================================================
    // Curriculum endpoints
    // =========================================================================

    @Test
    fun `GET curriculum returns JLPT levels with progress`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/kanji/curriculum") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("curriculums"))
        val curriculums = body["curriculums"]!!.jsonArray
        assertTrue(curriculums.isNotEmpty(), "Should return at least one JLPT level")

        // Each item should have required fields
        val first = curriculums.first().jsonObject
        assertTrue(first.containsKey("jlpt"))
        assertTrue(first.containsKey("title"))
        assertTrue(first.containsKey("total"))
        assertTrue(first.containsKey("planted"))
        assertTrue(first["total"]!!.jsonPrimitive.int > 0, "Total should be > 0")
    }

    @Test
    fun `GET curriculum detail returns kanji with user status`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/kanji/curriculum/5") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("kanji"))
        assertTrue(body.containsKey("jlpt"))
        assertTrue(body.containsKey("title"))
        assertEquals(5, body["jlpt"]!!.jsonPrimitive.int)

        val kanji = body["kanji"]!!.jsonArray
        assertTrue(kanji.isNotEmpty(), "JLPT 5 should have kanji")

        // Each kanji should have required fields
        val first = kanji.first().jsonObject
        assertTrue(first.containsKey("kanjiMasterId"))
        assertTrue(first.containsKey("character"))
        assertTrue(first.containsKey("meanings"))
        assertTrue(first.containsKey("userStatus"))

        // userStatus should be one of: new, learning, mastered
        val status = first["userStatus"]!!.jsonPrimitive.content
        assertTrue(status in listOf("new", "learning", "mastered"), "Invalid userStatus: $status")
    }

    @Test
    fun `GET curriculum detail with invalid jlpt returns 400`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/kanji/curriculum/abc") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    // =========================================================================
    // Test: FAMILIAR status → familiarity=5, currentTier=FILL_IN_THE_BLANK
    // =========================================================================

    @Test
    fun `POST kanji add with familiar status sets familiarity 5 and fill-in-the-blank tier`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiId = seedKanjiWithWordsAndQuizzes(TestDatabase.db, "月", "moon")

        try {
            val client = jsonClient()
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[{"kanjiMasterId":"$kanjiId","status":"familiar"}]}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            val userKanji = TestDatabase.db.from(UserKanjiTable)
                .select(UserKanjiTable.familiarity, UserKanjiTable.currentTier)
                .where { (UserKanjiTable.userId eq TEST_USER_ID) and (UserKanjiTable.kanjiId eq kanjiId) }
                .map { it[UserKanjiTable.familiarity]!! to it[UserKanjiTable.currentTier]!! }
                .first()

            assertEquals(5, userKanji.first, "FAMILIAR kanji should have familiarity=5")
            assertEquals(QuizType.FILL_IN_THE_BLANK, userKanji.second, "FAMILIAR kanji should have FILL_IN_THE_BLANK tier")

            // Familiar kanji do not enter the quiz pipeline
            val jobCount = TestDatabase.db.from(QuizGenerationJobTable)
                .select()
                .where { (QuizGenerationJobTable.userId eq TEST_USER_ID) and (QuizGenerationJobTable.kanjiId eq kanjiId) }
                .totalRecordsInAllPages
            assertEquals(0, jobCount, "FAMILIAR kanji should not enqueue quiz generation jobs")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test: LEARNING status → familiarity=0, currentTier=MEANING_RECALL
    // =========================================================================

    @Test
    fun `POST kanji add with learning status sets familiarity 0 and meaning-recall tier`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiId = seedKanjiWithWordsAndQuizzes(TestDatabase.db, "火", "fire")

        try {
            val client = jsonClient()
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[{"kanjiMasterId":"$kanjiId","status":"learning"}]}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            Thread.sleep(500)

            val userKanji = TestDatabase.db.from(UserKanjiTable)
                .select(UserKanjiTable.familiarity, UserKanjiTable.currentTier)
                .where { (UserKanjiTable.userId eq TEST_USER_ID) and (UserKanjiTable.kanjiId eq kanjiId) }
                .map { it[UserKanjiTable.familiarity]!! to it[UserKanjiTable.currentTier]!! }
                .first()

            assertEquals(0, userKanji.first, "LEARNING kanji should have familiarity=0")
            assertEquals(QuizType.MEANING_RECALL, userKanji.second, "LEARNING kanji should have MEANING_RECALL tier")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test: LEARNING limit — reject more than 5 learning kanji in one batch
    // =========================================================================

    @Test
    fun `POST kanji add with more than 5 learning kanji returns 400`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiChars = listOf("亜", "哀", "愛", "悪", "握", "圧")
        val kanjiIds = kanjiChars.map { seedKanjiWithoutWords(TestDatabase.db, it, "meaning-$it") }

        try {
            val client = jsonClient()
            val selections = kanjiIds.joinToString(",") { """{"kanjiMasterId":"$it","status":"learning"}""" }
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[$selections]}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)

            // No user_kanji rows should have been inserted
            val insertedCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where { (UserKanjiTable.userId eq TEST_USER_ID) and (UserKanjiTable.kanjiId inList kanjiIds) }
                .totalRecordsInAllPages
            assertEquals(0, insertedCount, "No kanji should be inserted when batch exceeds limit")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test: Batch of exactly 5 LEARNING kanji succeeds
    // =========================================================================

    @Test
    fun `POST kanji add with exactly 5 learning kanji succeeds`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiChars = listOf("案", "以", "衣", "位", "囲")
        val kanjiIds = kanjiChars.map { seedKanjiWithoutWords(TestDatabase.db, it, "meaning-$it") }

        try {
            val client = jsonClient()
            val selections = kanjiIds.joinToString(",") { """{"kanjiMasterId":"$it","status":"learning"}""" }
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[$selections]}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            Thread.sleep(500)

            val insertedCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where { (UserKanjiTable.userId eq TEST_USER_ID) and (UserKanjiTable.kanjiId inList kanjiIds) }
                .totalRecordsInAllPages
            assertEquals(5, insertedCount, "All 5 learning kanji should be inserted")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test: FAMILIAR submissions are not limited by the 5-kanji cap
    // =========================================================================

    @Test
    fun `POST kanji add with 6 familiar kanji succeeds — no cap on familiar`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val kanjiChars = listOf("医", "域", "育", "一", "壱", "逸")
        val kanjiIds = kanjiChars.map { seedKanjiWithWordsAndQuizzes(TestDatabase.db, it, "meaning-$it") }

        try {
            val client = jsonClient()
            val selections = kanjiIds.joinToString(",") { """{"kanjiMasterId":"$it","status":"familiar"}""" }
            val response = client.post("/api/kanji/add") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[$selections]}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)

            val insertedCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where {
                    (UserKanjiTable.userId eq TEST_USER_ID) and
                    (UserKanjiTable.kanjiId inList kanjiIds) and
                    (UserKanjiTable.familiarity eq 5)
                }
                .totalRecordsInAllPages
            assertEquals(6, insertedCount, "All 6 familiar kanji should be inserted with familiarity=5")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }
}
