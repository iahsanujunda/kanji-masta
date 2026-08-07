package com.kanjimasta.ai

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
                  {"id":"text/model","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":["response_format","reasoning"],"reasoning":{"supported_efforts":["high","medium","low"]}}
                ]}""",
            )
        }
        val client = OpenRouterCatalogClient(HttpClient(engine), "secret", "https://openrouter.test")

        val result = client.validate(
            mapOf(
                "photo_analysis" to ModelSelection("vision/model", "medium"),
                "translation" to ModelSelection("text/model", "low"),
                "quiz_generation" to ModelSelection("text/model", "high"),
                "word_discovery" to ModelSelection("text/model", "medium"),
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
                "photo_analysis" to ModelSelection("no-medium/model", "medium"),
                "translation" to ModelSelection("valid/model", "medium"),
                "quiz_generation" to ModelSelection("valid/model", "high"),
                "word_discovery" to ModelSelection("valid/model", "low"),
            ),
        )

        assertEquals(listOf("valid/model", "no-medium/model"), models.map { it.id })
        assertEquals(ModelValidationResult(false, "unsupported_reasoning"), rejected)
    }

    @Test
    fun `catalog exposes each structured model and validates its selected reasoning effort`() = runBlocking {
        val engine = MockEngine {
            respondOk(
                """{"data":[
                  {"id":"deepseek/deepseek-v4-flash-0731","name":"DeepSeek V4 Flash","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":["structured_outputs","reasoning"],"reasoning":{"supported_efforts":["max","high","low"]}},
                  {"id":"medium/model","name":"Medium Model","architecture":{"input_modalities":["text","image"],"output_modalities":["text"]},"supported_parameters":["structured_outputs","reasoning"],"reasoning":{"supported_efforts":["high","medium","low"]}}
                ]}""",
            )
        }
        val client = OpenRouterCatalogClient(HttpClient(engine), "secret", "https://openrouter.test")

        val quizModels = client.search("quiz_generation", "deepseek")
        val translationModels = client.search("translation", "deepseek")
        val validation = client.validate(
            mapOf(
                "photo_analysis" to ModelSelection("medium/model", "medium"),
                "translation" to ModelSelection("medium/model", "low"),
                "quiz_generation" to ModelSelection("deepseek/deepseek-v4-flash-0731", "high"),
                "word_discovery" to ModelSelection("medium/model", "medium"),
            ),
        )

        assertEquals(listOf("deepseek/deepseek-v4-flash-0731"), quizModels.map { it.id })
        assertEquals(listOf("deepseek/deepseek-v4-flash-0731"), translationModels.map { it.id })
        assertTrue(validation.valid)
    }
}
