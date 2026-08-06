package com.kanjimasta

import com.kanjimasta.db.*
import io.ktor.client.request.*
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.AfterTest
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class QuizIntegrationTest : com.kanjimasta.support.PersistenceTest() {
    @AfterTest
    fun cleanupSeededUser() {
        clean(TestDatabase.db)
    }

    private fun clean(db: Database) {
        db.delete(QuizServeTable) { it.userId eq TEST_USER_ID }
        db.delete(QuizSlotTable) { it.userId eq TEST_USER_ID }
        db.delete(UserWordsTable) { it.userId eq TEST_USER_ID }
    }

    private fun seed(db: Database) {
        val prefix = UUID.randomUUID().toString().take(8)
        repeat(6) { index ->
            val kanjiId = UUID.randomUUID()
            val wordMasterId = UUID.randomUUID()
            val userWordId = UUID.randomUUID()
            val quizId = UUID.randomUUID()
            db.insert(KanjiMasterTable) {
                set(it.id, kanjiId)
                set(it.character, "字$prefix$index")
                set(it.onyomi, listOf("よみ"))
                set(it.kunyomi, emptyList())
                set(it.meanings, listOf("kanji-$index"))
            }
            db.insert(WordMasterTable) {
                set(it.id, wordMasterId)
                set(it.word, "単語$prefix$index")
                set(it.reading, "たんご$index")
                set(it.meanings, listOf("meaning-$index"))
                set(it.kanjiIds, listOf(kanjiId.toString()))
            }
            db.insert(UserWordsTable) {
                set(it.id, userWordId)
                set(it.userId, TEST_USER_ID)
                set(it.wordMasterId, wordMasterId)
                set(it.kanjiIds, listOf(kanjiId.toString()))
                set(it.source, WordSource.PHOTO)
                set(it.familiarity, 0)
                set(it.currentTier, QuizType.MEANING_RECALL)
                if (index > 0) {
                    set(it.introducedAt, Instant.now().minus(5, ChronoUnit.DAYS))
                    set(it.nextReview, Instant.now().minus(1, ChronoUnit.DAYS))
                }
            }
            db.insert(QuizBankTable) {
                set(it.id, quizId)
                set(it.kanjiId, kanjiId)
                set(it.wordId, wordMasterId)
                set(it.quizType, QuizType.MEANING_RECALL)
                set(it.prompt, "単語$prefix$index")
                set(it.target, "単語$prefix$index")
                set(it.answer, "meaning-$index")
                set(it.explanation, "Explanation $index")
            }
            db.insert(QuizDistractorTable) {
                set(it.quizId, quizId)
                set(it.distractors, listOf("wrong-a", "wrong-b", "wrong-c"))
                set(it.generation, 1)
                set(it.trigger, DistractorTrigger.INITIAL)
                set(it.familiarityAtGeneration, 0)
            }
        }
    }

    private suspend fun start(client: io.ktor.client.HttpClient): JsonObject {
        val response = client.post("/api/quiz/session/start") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        return Json.parseToJsonElement(response.bodyAsText()).jsonObject["session"]!!.jsonObject
    }

    private suspend fun acknowledge(client: io.ktor.client.HttpClient, session: JsonObject, submissionId: UUID): HttpResponse {
        val card = session["currentCard"]!!.jsonObject
        return client.post("/api/quiz/session/${session["slotId"]!!.jsonPrimitive.content}/introduction") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"cardId":"${card["cardId"]!!.jsonPrimitive.content}","submissionId":"$submissionId","expectedVersion":${session["version"]!!.jsonPrimitive.int}}""")
        }
    }

    @Test
    fun `start creates one materialized server-authoritative session and resumes it`() = testApplication {
        application { testModule(TestDatabase.db) }
        clean(TestDatabase.db)
        seed(TestDatabase.db)
        val client = jsonClient()

        val first = start(client)
        val second = start(client)

        assertEquals(first["slotId"], second["slotId"])
        assertEquals("ACTIVE", first["status"]!!.jsonPrimitive.content)
        assertEquals("INTRODUCTION", first["currentCard"]!!.jsonObject["cardType"]!!.jsonPrimitive.content)
        assertEquals(5, first["progress"]!!.jsonObject["allowance"]!!.jsonPrimitive.int)
        assertEquals(6, TestDatabase.db.from(QuizSessionCardTable).select(count()).map { it.getInt(1) }.first())
    }

    @Test
    fun `introduction acknowledgement is idempotent`() = testApplication {
        application { testModule(TestDatabase.db) }
        clean(TestDatabase.db)
        seed(TestDatabase.db)
        val client = jsonClient()
        val session = start(client)
        val submissionId = UUID.randomUUID()

        val first = acknowledge(client, session, submissionId)
        val second = acknowledge(client, session, submissionId)

        assertEquals(HttpStatusCode.OK, first.status)
        assertEquals(HttpStatusCode.OK, second.status)
        val firstVersion = Json.parseToJsonElement(first.bodyAsText()).jsonObject["session"]!!.jsonObject["version"]!!.jsonPrimitive.int
        val secondVersion = Json.parseToJsonElement(second.bodyAsText()).jsonObject["session"]!!.jsonObject["version"]!!.jsonPrimitive.int
        assertEquals(1, firstVersion)
        assertEquals(firstVersion, secondVersion)
        assertTrue(first.bodyAsText().contains("INTRODUCED"))
    }

    @Test
    fun `stale unrelated command returns authoritative conflict snapshot`() = testApplication {
        application { testModule(TestDatabase.db) }
        clean(TestDatabase.db)
        seed(TestDatabase.db)
        val client = jsonClient()
        val initial = start(client)
        val acknowledged = acknowledge(client, initial, UUID.randomUUID())
        val latest = Json.parseToJsonElement(acknowledged.bodyAsText()).jsonObject["session"]!!.jsonObject
        val card = latest["currentCard"]!!.jsonObject

        val response = client.post("/api/quiz/session/${latest["slotId"]!!.jsonPrimitive.content}/answer") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"cardId":"${card["cardId"]!!.jsonPrimitive.content}","submissionId":"${UUID.randomUUID()}","expectedVersion":0,"answer":"anything"}""")
        }

        assertEquals(HttpStatusCode.Conflict, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("SESSION_ADVANCED", body["code"]!!.jsonPrimitive.content)
        assertEquals(1, body["session"]!!.jsonObject["version"]!!.jsonPrimitive.int)
    }

    @Test
    fun `wrong learning step one gets neutral feedback and inserts step two`() = testApplication {
        application { testModule(TestDatabase.db) }
        clean(TestDatabase.db)
        seed(TestDatabase.db)
        val client = jsonClient()
        var session = start(client)
        val acknowledgement = acknowledge(client, session, UUID.randomUUID())
        session = Json.parseToJsonElement(acknowledgement.bodyAsText()).jsonObject["session"]!!.jsonObject

        repeat(2) {
            val card = session["currentCard"]!!.jsonObject
            val word = card["word"]!!.jsonPrimitive.content
            val answer = "meaning-${word.takeLast(1)}"
            val response = client.post("/api/quiz/session/${session["slotId"]!!.jsonPrimitive.content}/answer") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"cardId":"${card["cardId"]!!.jsonPrimitive.content}","submissionId":"${UUID.randomUUID()}","expectedVersion":${session["version"]!!.jsonPrimitive.int},"answer":"$answer"}""")
            }
            session = Json.parseToJsonElement(response.bodyAsText()).jsonObject["session"]!!.jsonObject
        }
        val learningCard = session["currentCard"]!!.jsonObject
        assertEquals(1, learningCard["learningStep"]!!.jsonPrimitive.int)
        val response = client.post("/api/quiz/session/${session["slotId"]!!.jsonPrimitive.content}/answer") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"cardId":"${learningCard["cardId"]!!.jsonPrimitive.content}","submissionId":"${UUID.randomUUID()}","expectedVersion":${session["version"]!!.jsonPrimitive.int},"answer":"wrong"}""")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("NOT_YET", body["feedback"]!!.jsonObject["type"]!!.jsonPrimitive.content)
        val stepTwo = TestDatabase.db.from(QuizSessionCardTable).select(count())
            .where { QuizSessionCardTable.learningStep eq 2 }.map { it.getInt(1) }.first()
        assertEquals(1, stepTwo)
        assertNotNull(body["feedback"]!!.jsonObject["correctAnswer"])
    }

    @Test
    fun `new word reaches familiarity one in the same session`() = testApplication {
        application { testModule(TestDatabase.db) }
        clean(TestDatabase.db)
        seed(TestDatabase.db)
        val client = jsonClient()
        var session = start(client)
        val acknowledgement = acknowledge(client, session, UUID.randomUUID())
        session = Json.parseToJsonElement(acknowledgement.bodyAsText()).jsonObject["session"]!!.jsonObject

        repeat(2) {
            val card = session["currentCard"]!!.jsonObject
            val answer = "meaning-${card["word"]!!.jsonPrimitive.content.takeLast(1)}"
            val response = client.post("/api/quiz/session/${session["slotId"]!!.jsonPrimitive.content}/answer") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"cardId":"${card["cardId"]!!.jsonPrimitive.content}","submissionId":"${UUID.randomUUID()}","expectedVersion":${session["version"]!!.jsonPrimitive.int},"answer":"$answer"}""")
            }
            session = Json.parseToJsonElement(response.bodyAsText()).jsonObject["session"]!!.jsonObject
        }

        val learningCard = session["currentCard"]!!.jsonObject
        val correctAnswer = "meaning-${learningCard["word"]!!.jsonPrimitive.content.takeLast(1)}"
        val response = client.post("/api/quiz/session/${session["slotId"]!!.jsonPrimitive.content}/answer") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"cardId":"${learningCard["cardId"]!!.jsonPrimitive.content}","submissionId":"${UUID.randomUUID()}","expectedVersion":${session["version"]!!.jsonPrimitive.int},"answer":"$correctAnswer"}""")
        }

        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("LEARNED", body["feedback"]!!.jsonObject["type"]!!.jsonPrimitive.content)
        val familiarity = TestDatabase.db.from(UserWordsTable).select(UserWordsTable.familiarity)
            .where { UserWordsTable.id eq UUID.fromString(learningCard["wordId"]!!.jsonPrimitive.content) }
            .map { it[UserWordsTable.familiarity] }.first()
        assertEquals(1, familiarity)
    }
}
