package com.kanjimasta.core.ai

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondOk
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OpenRouterCatalogClientTest {
    @Test
    fun `catalog is cached and filtered for photo capability`() = runBlocking {
        val requests = mutableListOf<HttpRequestData>()
        val engine = MockEngine { request ->
            requests += request
            respond(
                content = """{
                  "data": [
                    {
                      "id": "vision/usable",
                      "canonical_slug": "vision/usable",
                      "name": "Usable Vision",
                      "context_length": 64000,
                      "architecture": {
                        "input_modalities": ["text", "image"],
                        "output_modalities": ["text"]
                      },
                      "supported_parameters": ["structured_outputs"],
                      "pricing": {"prompt": "0.1", "completion": "0.2"}
                    },
                    {
                      "id": "text/only",
                      "canonical_slug": "text/only",
                      "name": "Text Only",
                      "architecture": {
                        "input_modalities": ["text"],
                        "output_modalities": ["text"]
                      },
                      "supported_parameters": ["structured_outputs"]
                    }
                  ]
                }""".trimIndent(),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = OpenRouterCatalogClient(HttpClient(engine), "secret", "https://openrouter.test")

        val first = client.search("photo_analysis", "usable")
        val second = client.search("photo_analysis", null)

        assertEquals(listOf("vision/usable"), first.map { it.id })
        assertEquals(listOf("vision/usable"), second.map { it.id })
        assertEquals(1, requests.size)
        assertEquals("Bearer secret", requests.single().headers[HttpHeaders.Authorization])
        assertEquals("/api/v1/models/user", requests.single().url.encodedPath)
    }

    @Test
    fun `provider failures use a bounded error`() = runBlocking {
        val client = OpenRouterCatalogClient(
            HttpClient(MockEngine { respond("credential details", HttpStatusCode.Unauthorized) }),
            "secret",
            "https://openrouter.test",
        )

        val error = runCatching { client.search("quiz_generation", null) }.exceptionOrNull()

        assertTrue(error is ModelCatalogException)
        assertEquals("catalog_unavailable", error?.message)
        assertTrue(error.toString().contains("credential details").not())
    }

    @Test
    fun `validation smoke tests every workload contract`() = runBlocking {
        var smokeRequests = 0
        val engine = MockEngine { request ->
            if (request.url.encodedPath == "/api/v1/models/user") {
                respondOk(
                    """{"data":[
                      {"id":"vision/model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["structured_outputs"]},
                      {"id":"text/model","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":["structured_outputs"]}
                    ]}""",
                )
            } else {
                smokeRequests += 1
                respondOk("""{"choices":[{"message":{"content":"[]"}}]}""")
            }
        }
        val client = OpenRouterCatalogClient(HttpClient(engine), "secret", "https://openrouter.test")

        val result = client.validate(
            mapOf(
                "photo_analysis" to "vision/model",
                "quiz_generation" to "text/model",
                "word_discovery" to "text/model",
            ),
        )

        assertTrue(result.valid)
        assertEquals(3, smokeRequests)
    }
}
