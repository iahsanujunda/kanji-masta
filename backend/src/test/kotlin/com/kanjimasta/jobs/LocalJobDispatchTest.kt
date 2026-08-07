package com.kanjimasta.jobs

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.contentType
import io.ktor.http.headersOf
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LocalJobDispatchTest {
    @Test
    fun `client dispatches the role environment and key across HTTP`() = runBlocking {
        var path = ""
        var key = ""
        var sessionId = ""
        val http = HttpClient(MockEngine { request ->
            path = request.url.encodedPath
            key = request.headers[LOCAL_JOB_KEY_HEADER].orEmpty()
            sessionId = Json.parseToJsonElement((request.body as TextContent).text)
                .jsonObject["environment"]!!.jsonObject["CAPTURE_TASK_ID"]!!.jsonPrimitive.content
            respond(
                content = "{}",
                status = HttpStatusCode.Accepted,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })

        val accepted = LocalJobDispatcher(http, "http://job-dispatcher:8081", "photo-job", "secret")
            .dispatch(mapOf("CAPTURE_TASK_ID" to "11f9968e-a307-4495-a7f7-14d13169e10d"))

        assertTrue(accepted)
        assertEquals("/v1/jobs/photo-job", path)
        assertEquals("secret", key)
        assertEquals("11f9968e-a307-4495-a7f7-14d13169e10d", sessionId)
        http.close()
    }

    @Test
    fun `client reports a dispatch failure when no worker process starts`() = runBlocking {
        val http = HttpClient(MockEngine {
            respond("job_start_failed", HttpStatusCode.ServiceUnavailable)
        })

        assertFalse(LocalJobDispatcher(http, "http://job-dispatcher:8081", "quiz-job", "secret")
            .dispatch(emptyMap()))
        http.close()
    }

    @Test
    fun `dispatcher accepts only authenticated validated jobs before launching`() = testApplication {
        var launchedRole = ""
        var launchedEnvironment = emptyMap<String, String>()
        application {
            localJobProcessModule("secret", LocalJobProcessLauncher { role, environment ->
                launchedRole = role
                launchedEnvironment = environment
                4242
            })
        }

        val response = client.post("/v1/jobs/photo-job") {
            header(LOCAL_JOB_KEY_HEADER, "secret")
            contentType(ContentType.Application.Json)
            setBody("""{"environment":{"CAPTURE_TASK_ID":"11f9968e-a307-4495-a7f7-14d13169e10d"}}""")
        }

        assertEquals(HttpStatusCode.Accepted, response.status)
        assertEquals("photo-job", launchedRole)
        assertEquals("11f9968e-a307-4495-a7f7-14d13169e10d", launchedEnvironment["CAPTURE_TASK_ID"])
    }

    @Test
    fun `dispatcher exposes process start failure instead of acknowledging it`() = testApplication {
        application {
            localJobProcessModule("secret", LocalJobProcessLauncher { _, _ -> error("worker unavailable") })
        }

        val response = client.post("/v1/jobs/quiz-job") {
            header(LOCAL_JOB_KEY_HEADER, "secret")
            contentType(ContentType.Application.Json)
            setBody("""{"environment":{}}""")
        }

        assertEquals(HttpStatusCode.ServiceUnavailable, response.status)
    }
}
