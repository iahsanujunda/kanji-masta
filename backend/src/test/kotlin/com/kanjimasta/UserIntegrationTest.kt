package com.kanjimasta

import com.kanjimasta.core.db.KanjiMasterTable
import com.kanjimasta.core.db.QuizType
import com.kanjimasta.core.db.UserKanjiStatus
import com.kanjimasta.core.db.UserKanjiTable
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.insert
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class UserIntegrationTest : com.kanjimasta.support.PersistenceTest() {

    @Test
    fun `GET user summary returns valid response`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/user/summary") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("kanjiLearning"))
        assertTrue(body.containsKey("kanjiFamiliar"))
        assertTrue(body.containsKey("wordCount"))
        assertTrue(body.containsKey("streak"))
        assertTrue(body.containsKey("slotRemaining"))
        assertTrue(body.containsKey("slotTotal"))
        // Counts should be non-negative
        assertTrue(body["kanjiLearning"]?.jsonPrimitive?.int!! >= 0)
        assertTrue(body["kanjiFamiliar"]?.jsonPrimitive?.int!! >= 0)
        assertTrue(body["wordCount"]?.jsonPrimitive?.int!! >= 0)
        assertTrue(body["streak"]?.jsonPrimitive?.int!! >= 0)
    }

    @Test
    fun `GET user summary treats an existing collection as completed onboarding`() = testApplication {
        application { testModule(TestDatabase.db) }
        val kanjiId = UUID.randomUUID()
        TestDatabase.db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, "習")
            set(it.onyomi, listOf("シュウ"))
            set(it.kunyomi, listOf("ならう"))
            set(it.meanings, listOf("learn"))
            set(it.frequency, 100)
            set(it.jlpt, 5)
        }
        TestDatabase.db.insert(UserKanjiTable) {
            set(it.id, UUID.randomUUID())
            set(it.userId, TEST_USER_ID)
            set(it.kanjiId, kanjiId)
            set(it.status, UserKanjiStatus.LEARNING)
            set(it.familiarity, 0)
            set(it.currentTier, QuizType.MEANING_RECALL)
        }

        val response = jsonClient().get("/api/user/summary") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals(1, body["kanjiLearning"]?.jsonPrimitive?.int)
        assertEquals(true, body["onboardingComplete"]?.jsonPrimitive?.boolean)
    }
}
