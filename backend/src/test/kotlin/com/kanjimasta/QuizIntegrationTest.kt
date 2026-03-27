package com.kanjimasta

import com.kanjimasta.core.db.*
import com.kanjimasta.modules.quiz.QuizItem
import com.kanjimasta.modules.quiz.selectDiverseQuizzes
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

private fun makeQuizItem(kanjiId: String) = QuizItem(
    id = UUID.randomUUID().toString(),
    quizType = "MEANING_RECALL",
    word = "test",
    wordReading = "テスト",
    prompt = "What does this mean?",
    target = "test",
    answer = "test",
    options = listOf("test", "a", "b", "c"),
    wordFamiliarity = 0,
    currentTier = "MEANING_RECALL",
    kanjiId = kanjiId,
)

// Must match TEST_USER_ID from ApplicationTest.kt — the test auth always returns this user
private const val QUIZ_TEST_USER = TEST_USER_ID

class QuizIntegrationTest {

    /**
     * Seeds kanji → word_master → user_words → quiz_bank for testing quiz slot.
     * Creates [wordCount] words per kanji, each with a MEANING_RECALL quiz.
     * Returns the kanji IDs created.
     */
    private fun seedQuizData(
        db: org.ktorm.database.Database,
        userId: String,
        kanjiChars: List<Triple<String, String, String>>, // (char, onyomi, meaning)
        wordsPerKanji: Int = 3,
    ): List<UUID> {
        val kanjiIds = mutableListOf<UUID>()

        for ((char, on, meaning) in kanjiChars) {
            // Find or create kanji_master
            val kanjiId = db.from(KanjiMasterTable)
                .select(KanjiMasterTable.id)
                .where { KanjiMasterTable.character eq char }
                .map { it[KanjiMasterTable.id]!! }
                .firstOrNull()
                ?: UUID.randomUUID().also { id ->
                    db.insert(KanjiMasterTable) {
                        set(it.id, id)
                        set(it.character, char)
                        set(it.onyomi, listOf(on))
                        set(it.kunyomi, emptyList())
                        set(it.meanings, listOf(meaning))
                        set(it.frequency, 10)
                        set(it.jlpt, 5)
                    }
                }
            kanjiIds.add(kanjiId)

            for (i in 1..wordsPerKanji) {
                val wordText = "${char}語$i"  // e.g. 火語1, 火語2
                val wordId = db.from(WordMasterTable)
                    .select(WordMasterTable.id)
                    .where { WordMasterTable.word eq wordText }
                    .map { it[WordMasterTable.id]!! }
                    .firstOrNull()
                    ?: UUID.randomUUID().also { id ->
                        db.insert(WordMasterTable) {
                            set(it.id, id)
                            set(it.word, wordText)
                            set(it.reading, "よみ$i")
                            set(it.meanings, listOf("$meaning word $i"))
                            set(it.kanjiIds, listOf(kanjiId.toString()))
                        }
                    }

                // user_words (skip if exists)
                val existingUserWord = db.from(UserWordsTable)
                    .select(UserWordsTable.id)
                    .where { (UserWordsTable.userId eq userId) and (UserWordsTable.wordMasterId eq wordId) }
                    .map { it[UserWordsTable.id] }
                    .firstOrNull()
                if (existingUserWord == null) {
                    db.insert(UserWordsTable) {
                        set(it.userId, userId)
                        set(it.wordMasterId, wordId)
                        set(it.kanjiIds, listOf(kanjiId.toString()))
                        set(it.source, WordSource.PHOTO)
                        set(it.familiarity, 0)
                        set(it.currentTier, QuizType.MEANING_RECALL)
                    }
                }

                // quiz_bank (skip if exists)
                val existingQuiz = db.from(QuizBankTable)
                    .select(QuizBankTable.id)
                    .where { (QuizBankTable.wordId eq wordId) and (QuizBankTable.quizType eq QuizType.MEANING_RECALL) }
                    .map { it[QuizBankTable.id] }
                    .firstOrNull()
                if (existingQuiz == null) {
                    val quizId = UUID.randomUUID()
                    db.insert(QuizBankTable) {
                        set(it.id, quizId)
                        set(it.kanjiId, kanjiId)
                        set(it.wordId, wordId)
                        set(it.quizType, QuizType.MEANING_RECALL)
                        set(it.prompt, "What does $wordText mean?")
                        set(it.target, wordText)
                        set(it.answer, "$meaning word $i")
                        set(it.explanation, "It means $meaning word $i")
                    }
                    // Add a distractor set so quiz selection works fully
                    db.insert(QuizDistractorTable) {
                        set(it.quizId, quizId)
                        set(it.distractors, listOf("wrong1", "wrong2", "wrong3"))
                        set(it.generation, 1)
                        set(it.trigger, DistractorTrigger.INITIAL)
                        set(it.familiarityAtGeneration, 0)
                    }
                }
            }
        }
        return kanjiIds
    }

    private fun cleanupTestUser(db: org.ktorm.database.Database, userId: String) {
        db.useConnection { conn ->
            conn.createStatement().execute("DELETE FROM quiz_serve WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM quiz_slot WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM user_words WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM user_kanji WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM user_settings WHERE user_id = '$userId'")
        }
    }

    // ==================== Existing tests ====================

    @Test
    fun `GET quiz slot returns empty quizzes for new user`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        val client = jsonClient()
        val response = client.get("/api/quiz/slot") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("quizzes"))
        assertTrue(body.containsKey("remaining"))
        val quizzes = body["quizzes"]?.jsonArray ?: error("missing quizzes")
        assertTrue(quizzes.isEmpty(), "New user should have no quizzes")
    }

    @Test
    fun `POST quiz result with invalid quiz ID returns gracefully`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.post("/api/quiz/result") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"quizId": "00000000-0000-0000-0000-000000000000", "correct": true}""")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("remaining"))
        assertTrue(body.containsKey("correct"))
    }

    @Test
    fun `GET quiz slot remaining matches quiz count`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/quiz/slot") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val quizzes = body["quizzes"]!!.jsonArray
        val remaining = body["remaining"]!!.jsonPrimitive.int
        assertEquals(quizzes.size, remaining)
    }

    // ==================== selectDiverseQuizzes unit tests ====================

    @Test
    fun `selectDiverseQuizzes respects limit and diversity`() {
        val quizzes = listOf(
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "B"),
            makeQuizItem(kanjiId = "B"),
            makeQuizItem(kanjiId = "C"),
        )
        val result = selectDiverseQuizzes(quizzes, limit = 4, maxPerKanji = 2)
        assertEquals(4, result.size)
        assertTrue(result.count { it.kanjiId == "A" } <= 2)
    }

    @Test
    fun `selectDiverseQuizzes returns empty for empty input`() {
        val result = selectDiverseQuizzes(emptyList(), limit = 5)
        assertEquals(0, result.size)
    }

    @Test
    fun `selectDiverseQuizzes caps single kanji to maxPerKanji`() {
        val quizzes = List(10) { makeQuizItem(kanjiId = "A") }
        val result = selectDiverseQuizzes(quizzes, limit = 10, maxPerKanji = 2)
        assertEquals(2, result.size)
    }

    @Test
    fun `selectDiverseQuizzes returns all when under limit and diverse`() {
        val quizzes = listOf(
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "B"),
            makeQuizItem(kanjiId = "C"),
        )
        val result = selectDiverseQuizzes(quizzes, limit = 5, maxPerKanji = 2)
        assertEquals(3, result.size)
    }

    @Test
    fun `selectDiverseQuizzes respects limit even when all diverse`() {
        val quizzes = listOf(
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "B"),
            makeQuizItem(kanjiId = "C"),
            makeQuizItem(kanjiId = "D"),
            makeQuizItem(kanjiId = "E"),
        )
        val result = selectDiverseQuizzes(quizzes, limit = 3, maxPerKanji = 2)
        assertEquals(3, result.size)
    }

    @Test
    fun `selectDiverseQuizzes preserves input order`() {
        val quizzes = listOf(
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "B"),
            makeQuizItem(kanjiId = "A"),
            makeQuizItem(kanjiId = "C"),
            makeQuizItem(kanjiId = "A"), // 3rd A — should be skipped
        )
        val result = selectDiverseQuizzes(quizzes, limit = 5, maxPerKanji = 2)
        assertEquals(4, result.size)
        assertEquals("A", result[0].kanjiId)
        assertEquals("B", result[1].kanjiId)
        assertEquals("A", result[2].kanjiId)
        assertEquals("C", result[3].kanjiId)
    }

    // ==================== Integration tests with seeded data ====================

    @Test
    fun `GET quiz slot returns quizzes when user has words`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        try {
            seedQuizData(
                TestDatabase.db,
                QUIZ_TEST_USER,
                listOf(
                    Triple("雨", "ウ", "rain"),
                    Triple("風", "フウ", "wind"),
                ),
                wordsPerKanji = 2,
            )

            val client = jsonClient()
            val response = client.get("/api/quiz/slot") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val quizzes = body["quizzes"]!!.jsonArray
            val remaining = body["remaining"]!!.jsonPrimitive.int

            assertTrue(quizzes.isNotEmpty(), "User with words should get quizzes")
            assertEquals(quizzes.size, remaining, "remaining must match quiz count")
        } finally {
            cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        }
    }

    @Test
    fun `GET quiz slot enforces kanji diversity`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        try {
            // Seed 1 kanji with 5 words — more than maxPerKanji(2)
            seedQuizData(
                TestDatabase.db,
                QUIZ_TEST_USER,
                listOf(Triple("空", "クウ", "sky")),
                wordsPerKanji = 5,
            )

            val client = jsonClient()
            val response = client.get("/api/quiz/slot") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val quizzes = body["quizzes"]!!.jsonArray

            // With only 1 kanji, diversity caps at maxPerKanji = 2
            assertTrue(quizzes.size <= 2, "Single kanji should produce at most 2 quizzes, got ${quizzes.size}")
        } finally {
            cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        }
    }

    @Test
    fun `GET quiz slot fills allowance with diverse kanji`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        try {
            // Seed 4 kanji × 3 words each = 12 words, allowance defaults to 5
            seedQuizData(
                TestDatabase.db,
                QUIZ_TEST_USER,
                listOf(
                    Triple("山", "サン", "mountain"),
                    Triple("川", "セン", "river"),
                    Triple("田", "デン", "field"),
                    Triple("森", "シン", "forest"),
                ),
                wordsPerKanji = 3,
            )

            val client = jsonClient()
            val response = client.get("/api/quiz/slot") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val quizzes = body["quizzes"]!!.jsonArray
            val remaining = body["remaining"]!!.jsonPrimitive.int

            // Default allowance is 5; with 4 kanji × 3 words (8 after diversity) we should fill exactly 5
            assertEquals(5, quizzes.size, "Should fill default allowance of 5")
            assertEquals(quizzes.size, remaining)

            // Check diversity: no kanji should appear more than 2 times
            val kanjiCounts = quizzes.map { it.jsonObject["kanjiId"]!!.jsonPrimitive.content }
                .groupingBy { it }.eachCount()
            for ((kanjiId, count) in kanjiCounts) {
                assertTrue(count <= 2, "Kanji $kanjiId appeared $count times, max is 2")
            }
        } finally {
            cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        }
    }

    @Test
    fun `GET quiz slot fills full allowance when enough diverse kanji with words exist`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        try {
            // Seed 5 kanji × 2 words each = 10 words with quizzes
            // With allowance=5 and maxPerKanji=2, this should always produce 5 quizzes
            // Previously with 2x overfetch this could return fewer due to insufficient word selection
            seedQuizData(
                TestDatabase.db,
                QUIZ_TEST_USER,
                listOf(
                    Triple("泳", "エイ", "swim"),
                    Triple("波", "ハ", "wave"),
                    Triple("海", "カイ", "sea"),
                    Triple("湖", "コ", "lake"),
                    Triple("池", "チ", "pond"),
                ),
                wordsPerKanji = 2,
            )

            val client = jsonClient()
            val response = client.get("/api/quiz/slot") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val quizzes = body["quizzes"]!!.jsonArray

            // Should fill the full default allowance of 5
            assertEquals(5, quizzes.size, "Should fill full allowance when enough diverse words exist")
        } finally {
            cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        }
    }

    @Test
    fun `GET quiz slot fills allowance of 8 with enough kanji`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        try {
            // Seed 8 kanji × 2 words each = 16 words
            seedQuizData(
                TestDatabase.db,
                QUIZ_TEST_USER,
                listOf(
                    Triple("鳥", "チョウ", "bird"),
                    Triple("馬", "バ", "horse"),
                    Triple("犬", "ケン", "dog"),
                    Triple("猫", "ビョウ", "cat"),
                    Triple("虫", "チュウ", "insect"),
                    Triple("羊", "ヨウ", "sheep"),
                    Triple("牛", "ギュウ", "cow"),
                    Triple("豚", "トン", "pig"),
                ),
                wordsPerKanji = 2,
            )

            val client = jsonClient()

            // Trigger app initialization with a dummy request first
            client.get("/health")

            // NOW override allowance to 8 (after testModule seeded allowance=5)
            com.kanjimasta.modules.settings.SettingsRepository(TestDatabase.db).upsertSettings(QUIZ_TEST_USER, 8, 6)

            val response = client.get("/api/quiz/slot") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val quizzes = body["quizzes"]!!.jsonArray

            assertEquals(8, quizzes.size, "Should fill allowance of 8 when 8 kanji × 2 words exist")
        } finally {
            cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        }
    }

    @Test
    fun `GET quiz slot remaining matches quiz count with seeded data`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        try {
            seedQuizData(
                TestDatabase.db,
                QUIZ_TEST_USER,
                listOf(
                    Triple("花", "カ", "flower"),
                    Triple("草", "ソウ", "grass"),
                ),
                wordsPerKanji = 2,
            )

            val client = jsonClient()
            val response = client.get("/api/quiz/slot") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val quizzes = body["quizzes"]!!.jsonArray
            val remaining = body["remaining"]!!.jsonPrimitive.int
            assertEquals(quizzes.size, remaining, "remaining must always match quiz array size")
        } finally {
            cleanupTestUser(TestDatabase.db, QUIZ_TEST_USER)
        }
    }
}