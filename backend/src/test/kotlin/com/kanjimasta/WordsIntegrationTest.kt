package com.kanjimasta

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WordsIntegrationTest {

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
}
