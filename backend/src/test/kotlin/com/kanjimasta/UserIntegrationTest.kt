package com.kanjimasta

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class UserIntegrationTest {

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
}
