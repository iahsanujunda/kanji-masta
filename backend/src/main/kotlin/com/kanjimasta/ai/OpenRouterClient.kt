package com.kanjimasta.ai

import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
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
import java.time.Duration
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Base64
import org.slf4j.LoggerFactory

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

    suspend fun analyzeImage(
        prompt: String,
        imageBytes: ByteArray,
        contentType: String,
        model: String,
        reasoningEffort: String = this.reasoningEffort,
    ): AiResult {
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
        return complete(content, model, reasoningEffort)
    }

    suspend fun completeText(prompt: String, model: String, reasoningEffort: String = this.reasoningEffort): AiResult =
        complete(kotlinx.serialization.json.JsonPrimitive(prompt), model, reasoningEffort)

    private suspend fun complete(content: JsonElement, model: String, reasoningEffort: String): AiResult {
        if (apiKey.isBlank()) throw AiProviderException(
            "OPENROUTER_API_KEY is not configured",
            failure = AiProviderFailure.CONFIGURATION,
        )
        if (model.isBlank()) throw AiProviderException(
            "An active database model configuration is required",
            failure = AiProviderFailure.CONFIGURATION,
        )
        require(reasoningEffort in REASONING_EFFORTS) {
            "Unsupported OpenRouter reasoning effort '$reasoningEffort'"
        }

        val requestBody = buildJsonObject {
            put("model", model)
            putJsonArray("messages") {
                add(buildJsonObject {
                    put("role", "user")
                    put("content", content)
                })
            }
            putJsonObject("reasoning") { put("effort", reasoningEffort) }
        }.toString()
        var transientRetries = 0
        val response = run {
            while (true) {
                val candidate = try {
                    httpClient.post(completionsUrl()) {
                        contentType(ContentType.Application.Json)
                        bearerAuth(apiKey)
                        if (siteUrl.isNotBlank()) header(HttpHeaders.Referrer, siteUrl)
                        if (appName.isNotBlank()) header("X-OpenRouter-Title", appName)
                        setBody(requestBody)
                    }
                } catch (error: HttpRequestTimeoutException) {
                    throw AiProviderException(
                        "OpenRouter request timed out",
                        cause = error,
                        failure = AiProviderFailure.TIMEOUT,
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    throw AiProviderException("OpenRouter request failed", error)
                }
                if (candidate.status.value !in TRANSIENT_HTTP_STATUSES || transientRetries >= MAX_TRANSIENT_RETRIES) {
                    return@run candidate
                }
                transientRetries++
                val delayMillis = retryDelayMillis(candidate.headers[HttpHeaders.RetryAfter])
                logger.warn(
                    "OpenRouter returned transient HTTP {} for model={}; retry {}/{} in {}ms generationId={}",
                    candidate.status.value,
                    model,
                    transientRetries,
                    MAX_TRANSIENT_RETRIES,
                    delayMillis,
                    candidate.headers[GENERATION_ID_HEADER],
                )
                candidate.bodyAsText()
                delay(delayMillis)
            }
            error("OpenRouter retry loop terminated unexpectedly")
        }
        val generationId = response.headers[GENERATION_ID_HEADER]
        if (!response.status.isSuccess()) {
            throw AiProviderException(
                "OpenRouter returned HTTP ${response.status.value}: ${response.bodyAsText().take(500)}",
                failure = AiProviderFailure.HTTP,
                statusCode = response.status.value,
                generationId = generationId,
            )
        }

        val payload = try {
            Json.parseToJsonElement(response.bodyAsText()).jsonObject
        } catch (error: Exception) {
            throw AiProviderException(
                "OpenRouter response was not valid JSON",
                cause = error,
                failure = AiProviderFailure.INVALID_RESPONSE,
                generationId = generationId,
            )
        }
        val providerCostMicrodollars = costMicrodollars(payload["usage"], generationId)
        val messageContent = payload["choices"]?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("message")?.jsonObject?.get("content")
            ?: throw AiProviderException(
                "OpenRouter response did not contain message content",
                failure = AiProviderFailure.INVALID_RESPONSE,
                generationId = generationId,
                costMicrodollars = providerCostMicrodollars,
            )
        val text = normalizeJsonText(extractText(messageContent, generationId, providerCostMicrodollars))
        val data = try {
            Json.parseToJsonElement(text).jsonArray
        } catch (error: Exception) {
            throw AiProviderException(
                "OpenRouter response must be a JSON array",
                cause = error,
                failure = AiProviderFailure.INVALID_RESPONSE,
                generationId = generationId,
                costMicrodollars = providerCostMicrodollars,
            )
        }
        return AiResult(
            data = data,
            costMicrodollars = providerCostMicrodollars,
            model = payload["model"]?.jsonPrimitive?.contentOrNull ?: model,
        )
    }

    private fun extractText(content: JsonElement, generationId: String?, costMicrodollars: Long): String = when (content) {
        is kotlinx.serialization.json.JsonPrimitive ->
            content.contentOrNull ?: throw invalidResponse("OpenRouter message content was not text", generationId, costMicrodollars)
        is JsonArray -> content.mapNotNull { part ->
            (part as? JsonObject)
                ?.takeIf { it["type"]?.jsonPrimitive?.contentOrNull == "text" }
                ?.get("text")?.jsonPrimitive?.contentOrNull
        }.joinToString("").ifBlank { throw invalidResponse("OpenRouter message content was not text", generationId, costMicrodollars) }
        else -> throw invalidResponse("OpenRouter message content was not text", generationId, costMicrodollars)
    }

    private fun normalizeJsonText(text: String): String {
        val trimmed = text.trim()
        val opening = when {
            trimmed.startsWith("```json\r\n") -> "```json\r\n"
            trimmed.startsWith("```json\n") -> "```json\n"
            else -> return trimmed
        }
        val closing = when {
            trimmed.endsWith("\r\n```") -> "\r\n```"
            trimmed.endsWith("\n```") -> "\n```"
            else -> return trimmed
        }
        return trimmed.substring(opening.length, trimmed.length - closing.length).trim()
    }

    private fun costMicrodollars(usage: JsonElement?, generationId: String?): Long {
        val raw = (usage as? JsonObject)?.get("cost")?.jsonPrimitive?.contentOrNull ?: return 0
        return try {
            BigDecimal(raw).multiply(MICRODOLLARS).setScale(0, RoundingMode.HALF_UP).longValueExact()
        } catch (error: Exception) {
            throw AiProviderException(
                "OpenRouter returned an invalid usage cost",
                cause = error,
                failure = AiProviderFailure.INVALID_RESPONSE,
                generationId = generationId,
            )
        }
    }

    private fun completionsUrl(): String {
        val root = baseUrl.trimEnd('/')
        return if (root.endsWith("/api/v1")) "$root/chat/completions" else "$root/api/v1/chat/completions"
    }

    private fun retryDelayMillis(retryAfter: String?): Long {
        val requestedMillis = retryAfter?.toLongOrNull()?.coerceAtLeast(0)?.times(1_000)
            ?: retryAfter?.let {
                runCatching {
                    Duration.between(ZonedDateTime.now(), ZonedDateTime.parse(it, DateTimeFormatter.RFC_1123_DATE_TIME))
                        .toMillis()
                        .coerceAtLeast(0)
                }.getOrNull()
            }
        return (requestedMillis ?: DEFAULT_RETRY_DELAY_MILLIS).coerceAtMost(MAX_RETRY_DELAY_MILLIS)
    }

    private fun invalidResponse(message: String, generationId: String?, costMicrodollars: Long = 0) = AiProviderException(
        message,
        failure = AiProviderFailure.INVALID_RESPONSE,
        generationId = generationId,
        costMicrodollars = costMicrodollars,
    )

    private companion object {
        val logger = LoggerFactory.getLogger(OpenRouterClient::class.java)
        val MICRODOLLARS = BigDecimal("1000000")
        val REASONING_EFFORTS = setOf("max", "xhigh", "high", "medium", "low", "minimal", "none")
        val TRANSIENT_HTTP_STATUSES = setOf(429, 503)
        const val MAX_TRANSIENT_RETRIES = 2
        const val DEFAULT_RETRY_DELAY_MILLIS = 1_000L
        const val MAX_RETRY_DELAY_MILLIS = 60_000L
        const val GENERATION_ID_HEADER = "X-Generation-Id"
    }
}
