package com.kanjimasta

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class QuizIntegrationTest {

    @Test
    fun `GET quiz slot returns empty quizzes for new user`() = testApplication {
        application { testModule(TestDatabase.db) }
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
        // Should return OK with default response (quiz not found case)
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("remaining"))
        assertTrue(body.containsKey("correct"))
    }
}
