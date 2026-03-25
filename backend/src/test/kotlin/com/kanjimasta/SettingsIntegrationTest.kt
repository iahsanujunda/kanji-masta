package com.kanjimasta

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SettingsIntegrationTest {

    @Test
    fun `GET settings returns valid response`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/settings") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("quizAllowancePerSlot"))
        assertTrue(body.containsKey("slotDurationHours"))
        assertTrue(body["quizAllowancePerSlot"]?.jsonPrimitive?.int!! > 0)
        assertTrue(body["slotDurationHours"]?.jsonPrimitive?.int!! > 0)
    }

    @Test
    fun `PUT settings updates and GET returns updated values`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        // Update settings
        val putResponse = client.put("/api/settings") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"quizAllowancePerSlot": 12, "slotDurationHours": 3}""")
        }
        assertEquals(HttpStatusCode.OK, putResponse.status)

        // Verify persistence
        val getResponse = client.get("/api/settings") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val body = Json.parseToJsonElement(getResponse.bodyAsText()).jsonObject
        assertEquals(12, body["quizAllowancePerSlot"]?.jsonPrimitive?.int)
        assertEquals(3, body["slotDurationHours"]?.jsonPrimitive?.int)
    }
}
