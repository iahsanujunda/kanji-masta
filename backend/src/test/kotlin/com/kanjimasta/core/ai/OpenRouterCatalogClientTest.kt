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
                      "supported_parameters": ["structured_outputs", "reasoning"],
                      "reasoning": {"supported_efforts": ["high", "medium", "low"]},
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
                      "supported_parameters": ["structured_outputs", "reasoning"],
                      "reasoning": {"supported_efforts": ["high", "medium", "low"]}
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
    fun `validation uses catalog metadata without completion requests`() = runBlocking {
        val requests = mutableListOf<HttpRequestData>()
        val engine = MockEngine { request ->
            requests += request
            respondOk(
                """{"data":[
                  {"id":"vision/model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["structured_outputs","reasoning"],"reasoning":{"supported_efforts":["high","medium","low"]}},
                  {"id":"text/model","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":["response_format","reasoning"],"reasoning":{"supports_max_tokens":true}}
                ]}""",
            )
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
        assertEquals(listOf("/api/v1/models/user"), requests.map { it.url.encodedPath })
    }

    @Test
    fun `catalog rejects models missing required documented capability`() = runBlocking {
        val engine = MockEngine {
            respondOk(
                """{"data":[
                  {"id":"valid/model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["structured_outputs","reasoning"],"reasoning":{"supported_efforts":["high","medium","low"]}},
                  {"id":"no-image/model","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":["structured_outputs","reasoning"],"reasoning":{"supported_efforts":["medium"]}},
                  {"id":"no-structured/model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["reasoning"],"reasoning":{"supported_efforts":["medium"]}},
                  {"id":"no-reasoning/model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["structured_outputs"]},
                  {"id":"no-medium/model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["structured_outputs","reasoning"],"reasoning":{"supported_efforts":["high","low"]}}
                ]}""",
            )
        }
        val client = OpenRouterCatalogClient(HttpClient(engine), "secret", "https://openrouter.test")

        val models = client.search("photo_analysis", null)
        val rejected = client.validate(
            mapOf(
                "photo_analysis" to "no-medium/model",
                "quiz_generation" to "valid/model",
                "word_discovery" to "valid/model",
            ),
        )

        assertEquals(listOf("valid/model"), models.map { it.id })
        assertEquals(ModelValidationResult(false, "unsupported_model"), rejected)
    }
}
