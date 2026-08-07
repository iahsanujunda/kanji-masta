package com.kanjimasta.ai

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OpenRouterClientTest {
    @Test
    fun `image completion uses requested database model and records provider cost`() = runBlocking {
        var requestBody = ""
        var authorization = ""
        val http = HttpClient(MockEngine { request ->
            requestBody = (request.body as TextContent).text
            authorization = request.headers[HttpHeaders.Authorization].orEmpty()
            respond(
                """{"model":"actual/model","choices":[{"message":{"content":"[{\"character\":\"日\"}]"}}],"usage":{"cost":"0.012345"}}""",
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val client = OpenRouterClient(
            httpClient = http,
            apiKey = "test-key",
            baseUrl = "https://openrouter.test",
            siteUrl = "https://shuukanhq.com",
        )

        val result = client.analyzeImage("find kanji", "image".encodeToByteArray(), "image/jpeg", "vision/model")

        assertEquals("Bearer test-key", authorization)
        assertEquals(12_345, result.costMicrodollars)
        assertEquals("actual/model", result.model)
        assertEquals("日", result.data.single().jsonObject["character"]?.jsonPrimitive?.content)
        val body = Json.parseToJsonElement(requestBody).jsonObject
        assertEquals("vision/model", body["model"]?.jsonPrimitive?.content)
        val content = body["messages"]!!.jsonArray.single().jsonObject["content"]!!.jsonArray
        assertEquals("data:image/jpeg;base64,aW1hZ2U=", content[1].jsonObject["image_url"]!!.jsonObject["url"]?.jsonPrimitive?.content)
    }

    @Test
    fun `non-array completion is rejected`() = runBlocking {
        val http = HttpClient(MockEngine {
            respond("""{"choices":[{"message":{"content":"{\"value\":1}"}}]}""")
        })
        val client = OpenRouterClient(http, "test-key")

        val error = assertFailsWith<AiProviderException> {
            client.completeText("prompt", "text/model")
        }
        assertEquals(AiProviderFailure.INVALID_RESPONSE, error.failure)
    }

    @Test
    fun `transient responses honor retry-after and retry at most twice`() = runBlocking {
        var calls = 0
        val http = HttpClient(MockEngine {
            calls++
            when (calls) {
                1 -> respond(
                    "temporarily unavailable",
                    HttpStatusCode.ServiceUnavailable,
                    headersOf(HttpHeaders.RetryAfter, "0"),
                )
                2 -> respond(
                    "rate limited",
                    HttpStatusCode.TooManyRequests,
                    headersOf(HttpHeaders.RetryAfter, "0"),
                )
                else -> respond("""{"choices":[{"message":{"content":"[]"}}]}""")
            }
        })
        val client = OpenRouterClient(http, "test-key")

        client.completeText("prompt", "text/model")

        assertEquals(3, calls)
    }

    @Test
    fun `final transient response exposes status and generation id`() = runBlocking {
        var calls = 0
        val http = HttpClient(MockEngine {
            calls++
            respond(
                "still unavailable",
                HttpStatusCode.ServiceUnavailable,
                headersOf(
                    HttpHeaders.RetryAfter to listOf("0"),
                    "X-Generation-Id" to listOf("generation-123"),
                ),
            )
        })
        val client = OpenRouterClient(http, "test-key")

        val error = assertFailsWith<AiProviderException> {
            client.completeText("prompt", "text/model")
        }

        assertEquals(3, calls)
        assertEquals(AiProviderFailure.HTTP, error.failure)
        assertEquals(503, error.statusCode)
        assertEquals("generation-123", error.generationId)
    }

    @Test
    fun `request timeout is classified explicitly and is not retried`() = runBlocking {
        var calls = 0
        val http = HttpClient(MockEngine { request ->
            calls++
            throw HttpRequestTimeoutException(request)
        })
        val client = OpenRouterClient(http, "test-key")

        val error = assertFailsWith<AiProviderException> {
            client.completeText("prompt", "text/model")
        }

        assertEquals(1, calls)
        assertEquals(AiProviderFailure.TIMEOUT, error.failure)
    }
}
