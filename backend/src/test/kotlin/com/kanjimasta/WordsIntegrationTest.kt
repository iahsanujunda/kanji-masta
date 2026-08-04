package com.kanjimasta

import com.kanjimasta.core.db.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WordsIntegrationTest : com.kanjimasta.support.PersistenceTest() {
    @BeforeTest
    @AfterTest
    fun cleanWords() {
        TestDatabase.db.delete(UserWordsTable) { it.userId eq TEST_USER_ID }
    }

    private fun seedWord(familiarity: Int, introduced: Boolean, failures: Int = 0): UUID {
        val kanjiId = UUID.randomUUID()
        val wordMasterId = UUID.randomUUID()
        val userWordId = UUID.randomUUID()
        val suffix = userWordId.toString().take(6)
        TestDatabase.db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, "辞$suffix")
            set(it.onyomi, listOf("ジ"))
            set(it.kunyomi, emptyList())
            set(it.meanings, listOf("dictionary"))
        }
        TestDatabase.db.insert(WordMasterTable) {
            set(it.id, wordMasterId)
            set(it.word, "辞書$suffix")
            set(it.reading, "じしょ")
            set(it.meanings, listOf("dictionary"))
            set(it.kanjiIds, listOf(kanjiId.toString()))
        }
        TestDatabase.db.insert(UserWordsTable) {
            set(it.id, userWordId)
            set(it.userId, TEST_USER_ID)
            set(it.wordMasterId, wordMasterId)
            set(it.kanjiIds, listOf(kanjiId.toString()))
            set(it.source, WordSource.PHOTO)
            set(it.familiarity, familiarity)
            set(it.currentTier, if (familiarity >= 5) QuizType.FILL_IN_THE_BLANK else QuizType.MEANING_RECALL)
            set(it.consecutiveFailures, failures)
            if (introduced) set(it.introducedAt, Instant.now())
        }
        TestDatabase.db.insert(QuizBankTable) {
            set(it.kanjiId, kanjiId)
            set(it.wordId, wordMasterId)
            set(it.quizType, QuizType.BOLD_WORD_MEANING)
            set(it.prompt, "この辞書を使います。")
            set(it.target, "辞書")
            set(it.answer, "dictionary")
            set(it.explanation, "A simple example sentence.")
        }
        return userWordId
    }

    @Test
    fun `GET words list returns empty for new user`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/words/list") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals(0, body["total"]?.jsonPrimitive?.int)
        assertTrue(body["words"]?.jsonArray?.isEmpty() == true)
        assertEquals(false, body["hasMore"]?.jsonPrimitive?.boolean)
    }

    @Test
    fun `GET words list supports search query`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/words/list?q=test&offset=0&limit=10") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("words"))
        assertTrue(body.containsKey("total"))
    }

    @Test
    fun `GET words list derives state and filters before pagination`() = testApplication {
        application { testModule(TestDatabase.db) }
        seedWord(familiarity = 0, introduced = false)
        seedWord(familiarity = 5, introduced = true)
        val client = jsonClient()

        val response = client.get("/api/words/list?state=MASTERED&offset=0&limit=1") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals(1, body["total"]!!.jsonPrimitive.int)
        assertEquals("MASTERED", body["words"]!!.jsonArray.single().jsonObject["learningState"]!!.jsonPrimitive.content)
    }

    @Test
    fun `GET word reference is read only and includes stable study content`() = testApplication {
        application { testModule(TestDatabase.db) }
        val wordId = seedWord(familiarity = 0, introduced = false)
        val client = jsonClient()

        val response = client.get("/api/words/$wordId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("WAITING_TO_LEARN", body["learningState"]!!.jsonPrimitive.content)
        assertEquals("dictionary", body["kanjiBreakdown"]!!.jsonArray.single().jsonObject["meaning"]!!.jsonPrimitive.content)
        assertEquals("この辞書を使います。", body["exampleSentence"]!!.jsonPrimitive.content)
        val introducedAt = TestDatabase.db.from(UserWordsTable).select(UserWordsTable.introducedAt)
            .where { UserWordsTable.id eq wordId }.map { it[UserWordsTable.introducedAt] }.first()
        assertEquals(null, introducedAt)
    }
}
