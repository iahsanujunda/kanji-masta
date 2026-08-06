package com.kanjimasta.core.ai

import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Base64

class OpenRouterClient(
    private val httpClient: HttpClient,
    private val apiKey: String,
    private val baseUrl: String = "https://openrouter.ai",
    private val siteUrl: String = "",
    private val appName: String = "Kanji Masta",
    reasoningEffort: String = "medium",
) {
    private val reasoningEffort = reasoningEffort.trim().lowercase().ifEmpty { "medium" }

    init {
        require(this.reasoningEffort in REASONING_EFFORTS) {
            "Unsupported OpenRouter reasoning effort '$reasoningEffort'"
        }
    }

    suspend fun analyzeImage(prompt: String, imageBytes: ByteArray, contentType: String, model: String): AiResult {
        val encoded = Base64.getEncoder().encodeToString(imageBytes)
        val content = buildJsonArray {
            add(buildJsonObject {
                put("type", "text")
                put("text", prompt)
            })
            add(buildJsonObject {
                put("type", "image_url")
                putJsonObject("image_url") {
                    put("url", "data:$contentType;base64,$encoded")
                }
            })
        }
        return complete(content, model)
    }

    suspend fun completeText(prompt: String, model: String): AiResult =
        complete(kotlinx.serialization.json.JsonPrimitive(prompt), model)

    private suspend fun complete(content: JsonElement, model: String): AiResult {
        if (apiKey.isBlank()) throw AiProviderException("OPENROUTER_API_KEY is not configured")
        if (model.isBlank()) throw AiProviderException("An active database model configuration is required")

        val response = try {
            httpClient.post(completionsUrl()) {
                contentType(ContentType.Application.Json)
                bearerAuth(apiKey)
                if (siteUrl.isNotBlank()) header(HttpHeaders.Referrer, siteUrl)
                if (appName.isNotBlank()) header("X-OpenRouter-Title", appName)
                setBody(buildJsonObject {
                    put("model", model)
                    putJsonArray("messages") {
                        add(buildJsonObject {
                            put("role", "user")
                            put("content", content)
                        })
                    }
                    putJsonObject("reasoning") { put("effort", reasoningEffort) }
                }.toString())
            }
        } catch (error: Exception) {
            throw AiProviderException("OpenRouter request failed", error)
        }
        if (!response.status.isSuccess()) {
            throw AiProviderException("OpenRouter returned HTTP ${response.status.value}: ${response.bodyAsText().take(500)}")
        }

        val payload = try {
            Json.parseToJsonElement(response.bodyAsText()).jsonObject
        } catch (error: Exception) {
            throw AiProviderException("OpenRouter response was not valid JSON", error)
        }
        val messageContent = payload["choices"]?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("message")?.jsonObject?.get("content")
            ?: throw AiProviderException("OpenRouter response did not contain message content")
        val text = extractText(messageContent)
        val data = try {
            Json.parseToJsonElement(text).jsonArray
        } catch (error: Exception) {
            throw AiProviderException("OpenRouter response must be a JSON array", error)
        }
        return AiResult(
            data = data,
            costMicrodollars = costMicrodollars(payload["usage"]),
            model = payload["model"]?.jsonPrimitive?.contentOrNull ?: model,
        )
    }

    private fun extractText(content: JsonElement): String = when (content) {
        is kotlinx.serialization.json.JsonPrimitive ->
            content.contentOrNull ?: throw AiProviderException("OpenRouter message content was not text")
        is JsonArray -> content.mapNotNull { part ->
            (part as? JsonObject)
                ?.takeIf { it["type"]?.jsonPrimitive?.contentOrNull == "text" }
                ?.get("text")?.jsonPrimitive?.contentOrNull
        }.joinToString("").ifBlank { throw AiProviderException("OpenRouter message content was not text") }
        else -> throw AiProviderException("OpenRouter message content was not text")
    }

    private fun costMicrodollars(usage: JsonElement?): Long {
        val raw = (usage as? JsonObject)?.get("cost")?.jsonPrimitive?.contentOrNull ?: return 0
        return try {
            BigDecimal(raw).multiply(MICRODOLLARS).setScale(0, RoundingMode.HALF_UP).longValueExact()
        } catch (error: Exception) {
            throw AiProviderException("OpenRouter returned an invalid usage cost", error)
        }
    }

    private fun completionsUrl(): String {
        val root = baseUrl.trimEnd('/')
        return if (root.endsWith("/api/v1")) "$root/chat/completions" else "$root/api/v1/chat/completions"
    }

    private companion object {
        val MICRODOLLARS = BigDecimal("1000000")
        val REASONING_EFFORTS = setOf("max", "xhigh", "high", "medium", "low", "minimal", "none")
    }
}
