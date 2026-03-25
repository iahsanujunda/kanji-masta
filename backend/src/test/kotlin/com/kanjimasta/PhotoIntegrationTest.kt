package com.kanjimasta

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PhotoIntegrationTest {

    @Test
    fun `POST photo analyze creates session`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.post("/api/photo/analyze") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"imageUrl": "https://storage.example.com/photos/test.jpg"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("sessionId"), "Response should contain sessionId")
        assertEquals("processing", body["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun `GET photo session returns processing status`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        // Create a session first
        val createResp = client.post("/api/photo/analyze") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"imageUrl": "https://storage.example.com/photos/test2.jpg"}""")
        }
        val sessionId = Json.parseToJsonElement(createResp.bodyAsText())
            .jsonObject["sessionId"]?.jsonPrimitive?.content ?: error("no sessionId")

        // Poll for result
        val pollResp = client.get("/api/photo/session/$sessionId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, pollResp.status)
        val body = Json.parseToJsonElement(pollResp.bodyAsText()).jsonObject
        assertEquals(sessionId, body["sessionId"]?.jsonPrimitive?.content)
        assertEquals("processing", body["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun `GET photo session with missing id returns 400`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/photo/session/") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        // Route won't match without an ID, returns 404
        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
