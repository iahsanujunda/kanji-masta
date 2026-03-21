package com.kanjimasta

import com.kanjimasta.plugins.configureRouting
import com.kanjimasta.plugins.configureSerialization
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

class ApplicationTest {

    @Test
    fun `health endpoint returns ok`() = testApplication {
        application {
            configureSerialization()
            configureRouting()
        }

        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertContains(response.bodyAsText(), "ok")
    }

    @Test
    fun `unknown route returns 404`() = testApplication {
        application {
            configureSerialization()
            configureRouting()
        }

        val response = client.get("/nonexistent")
        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}