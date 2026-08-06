package com.kanjimasta.photo

import com.kanjimasta.ai.AiProviderException
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.photo.PhotoFailureCode
import io.ktor.client.HttpClient
import io.ktor.client.plugins.timeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.utils.io.readAvailable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory
import java.io.ByteArrayOutputStream
import java.util.UUID

class PhotoAnalysisExecutor(
    private val repository: PhotoAnalysisRepository,
    private val openRouter: OpenRouterClient,
    private val httpClient: HttpClient,
    private val leaseSeconds: Long = 300,
    private val maxImageBytes: Long = 10 * 1024 * 1024,
) {
    init {
        require(maxImageBytes > 0) { "maxImageBytes must be positive" }
    }

    suspend fun run(
        sessionId: UUID,
        taskAttempt: Int = 0,
        claimedBy: String = "local-photo-job",
    ): Boolean {
        val claim = repository.claim(sessionId, taskAttempt, claimedBy, leaseSeconds)
            ?: return true.also { logger.info("Photo session {} has no claimable work", sessionId) }

        val image = try {
            val response = httpClient.get(rewriteLocalhost(claim.imageUrl)) {
                timeout {
                    requestTimeoutMillis = 30_000
                    socketTimeoutMillis = 30_000
                    connectTimeoutMillis = 10_000
                }
            }
            if (response.status.value !in 200..299) {
                repository.fail(claim, PhotoFailureCode.PROVIDER_FAILED)
                return false
            }
            DownloadedImage(
                bytes = readImage(
                    response.bodyAsChannel(),
                    response.headers[HttpHeaders.ContentLength]?.toLongOrNull(),
                ),
                contentType = response.contentType()?.toString() ?: "image/jpeg",
            )
        } catch (error: Exception) {
            logger.error("Failed to download image for session={}", sessionId, error)
            repository.fail(claim, PhotoFailureCode.PROVIDER_FAILED)
            return false
        }

        val knownKanji = repository.knownKanji(claim.userId)
        val knownSection = if (knownKanji.isEmpty()) {
            "The learner is a beginner with no kanji knowledge yet."
        } else {
            "The learner already knows these kanji: ${knownKanji.joinToString(", ")}\n" +
                "Do NOT recommend kanji they already know."
        }
        val result = try {
            openRouter.analyzeImage(
                prompt = PhotoPrompts.PHOTO_ANALYSIS.format(knownSection),
                imageBytes = image.bytes,
                contentType = image.contentType,
                model = claim.modelId,
            )
        } catch (error: AiProviderException) {
            logger.error("Photo analysis failed for session={}: {}", sessionId, error.message)
            val failure = if (error.message?.contains("JSON", ignoreCase = true) == true ||
                error.message?.contains("message content", ignoreCase = true) == true
            ) PhotoFailureCode.INVALID_RESPONSE else PhotoFailureCode.PROVIDER_FAILED
            repository.fail(claim, failure)
            return false
        }
        repository.recordProviderCost(claim, result.costMicrodollars)

        val enriched = try {
            enrich(result.data)
        } catch (error: Exception) {
            logger.error("Photo response validation failed for session={}", sessionId, error)
            repository.fail(claim, PhotoFailureCode.INVALID_RESPONSE, result.costMicrodollars)
            return false
        }
        return repository.complete(claim, enriched.toString(), result.costMicrodollars)
    }

    private fun enrich(items: JsonArray): JsonArray {
        val objects = items.map { it.jsonObject }
        val characters = objects.mapNotNull { it["character"]?.jsonPrimitive?.contentOrNull }
        val references = repository.lookupKanji(characters)
        return buildJsonArray {
            objects.forEach { item ->
                val character = item["character"]?.jsonPrimitive?.contentOrNull.orEmpty()
                val reference = references[character]
                add(buildJsonObject {
                    if (reference == null) put("kanjiMasterId", JsonNull) else put("kanjiMasterId", reference.id.toString())
                    put("character", character)
                    put("recommended", item["recommended"]?.jsonPrimitive?.booleanOrNull ?: false)
                    put("whyUseful", item["whyUseful"]?.jsonPrimitive?.contentOrNull.orEmpty())
                    put("onyomi", JsonArray(reference?.onyomi.orEmpty().map(::JsonPrimitive)))
                    put("kunyomi", JsonArray(reference?.kunyomi.orEmpty().map(::JsonPrimitive)))
                    put("meanings", JsonArray(reference?.meanings.orEmpty().map(::JsonPrimitive)))
                    reference?.frequency?.let { put("frequency", it) } ?: put("frequency", JsonNull)
                    put("exampleWords", item["exampleWords"] ?: JsonArray(emptyList()))
                })
            }
        }
    }

    private fun rewriteLocalhost(url: String): String =
        url.replace("http://127.0.0.1:", "http://host.docker.internal:")
            .replace("http://localhost:", "http://host.docker.internal:")

    private suspend fun readImage(channel: io.ktor.utils.io.ByteReadChannel, contentLength: Long?): ByteArray {
        if (contentLength != null && contentLength > maxImageBytes) {
            error("Image exceeds the configured $maxImageBytes byte limit")
        }
        val output = ByteArrayOutputStream((contentLength ?: 8_192).coerceAtMost(maxImageBytes).toInt())
        val buffer = ByteArray(8_192)
        var total = 0L
        while (true) {
            val read = channel.readAvailable(buffer, 0, buffer.size)
            if (read == -1) break
            if (read == 0) continue
            total += read
            if (total > maxImageBytes) error("Image exceeds the configured $maxImageBytes byte limit")
            output.write(buffer, 0, read)
        }
        return output.toByteArray()
    }

    private data class DownloadedImage(val bytes: ByteArray, val contentType: String)

    private companion object {
        val logger = LoggerFactory.getLogger(PhotoAnalysisExecutor::class.java)
    }
}
