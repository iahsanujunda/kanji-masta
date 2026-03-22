package com.kanjimasta

import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

class ApplicationTest {

    @Test
    fun `health endpoint returns ok`() = testApplication {
        application {
            configureSerialization()
            install(Authentication) {
                provider("firebase") {
                    authenticate { context ->
                        context.principal(object : Principal {})
                    }
                }
            }
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
            install(Authentication) {
                provider("firebase") {
                    authenticate { context ->
                        context.principal(object : Principal {})
                    }
                }
            }
            configureRouting()
        }

        val response = client.get("/nonexistent")
        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
