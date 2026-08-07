package com.kanjimasta.photo

import com.kanjimasta.ai.AiProviderException
import com.kanjimasta.ai.AiProviderFailure
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.jobs.JobDispatcher
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
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.slf4j.LoggerFactory
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.text.Normalizer

class PhotoAnalysisExecutor(
    private val repository: PhotoAnalysisRepository,
    private val openRouter: OpenRouterClient,
    private val httpClient: HttpClient,
    private val jobDispatcher: JobDispatcher,
    private val storageSigner: SupabaseStorageSigner? = null,
    private val leaseSeconds: Long = 1_500,
    private val maxImageBytes: Long = 10 * 1024 * 1024,
) {
    init {
        require(maxImageBytes > 0) { "maxImageBytes must be positive" }
    }

    suspend fun run(
        taskId: UUID,
        taskAttempt: Int = 0,
        claimedBy: String = "local-photo-job",
    ): Boolean {
        val claim = repository.claim(taskId, taskAttempt, claimedBy, leaseSeconds)
        if (claim == null) {
            val downstreamTask = repository.pendingTranslationForVisual(taskId)
                ?: return true.also { logger.info("Capture task {} has no claimable work", taskId) }
            return dispatchTask(downstreamTask)
        }

        return withLeaseHeartbeat(claim) {
            when (claim.taskType) {
                "VISUAL_ANALYSIS" -> processVisual(claim)
                "TRANSLATION" -> processTranslation(claim)
                else -> error("Unsupported required capture task '${claim.taskType}'")
            }
        }
    }

    suspend fun runLegacySession(
        sessionId: UUID,
        taskAttempt: Int = 0,
        claimedBy: String = "local-photo-job",
    ): Boolean {
        val taskId = repository.pendingRequiredTaskForSession(sessionId)
            ?: return true.also { logger.info("Legacy photo session {} has no pending required task", sessionId) }
        return run(taskId, taskAttempt, claimedBy)
    }

    private suspend fun processVisual(claim: PhotoAnalysisClaim): Boolean {
        val imageUrl = if (!claim.storagePath.isNullOrBlank() && storageSigner != null) {
            storageSigner.signPhoto(claim.storagePath, expiresInSeconds = 900) ?: run {
                repository.fail(claim, PhotoFailureCode.SOURCE_MISSING)
                return false
            }
        } else claim.imageUrl
        val image = try {
            val response = httpClient.get(rewriteLocalhost(imageUrl)) {
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
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            logger.error("Failed to download image for session={}", claim.sessionId, error)
            repository.fail(claim, PhotoFailureCode.PROVIDER_FAILED)
            return false
        }

        val result = try {
            openRouter.analyzeImage(
                prompt = PhotoPrompts.PHOTO_ANALYSIS,
                imageBytes = image.bytes,
                contentType = image.contentType,
                model = claim.modelId,
            )
        } catch (error: AiProviderException) {
            logProviderFailure("analysis", claim.sessionId, error)
            repository.fail(claim, failureCode(error))
            return false
        }
        repository.recordProviderCost(claim, result.costMicrodollars)

        val visual = try {
            parseVisualResult(result.data)
        } catch (error: Exception) {
            logger.error("Photo response validation failed for session={}", claim.sessionId, error)
            repository.fail(claim, PhotoFailureCode.INVALID_RESPONSE, result.costMicrodollars)
            return false
        }
        if (visual.fullText.isBlank()) {
            repository.fail(claim, PhotoFailureCode.INVALID_RESPONSE, result.costMicrodollars)
            return false
        }
        val translationTaskId = repository.completeVisual(
            claim = claim,
            fullText = visual.fullText,
            enrichedJson = visual.enriched.toString(),
            costMicrodollars = result.costMicrodollars,
        ) ?: return false
        return dispatchTask(translationTaskId)
    }

    private suspend fun processTranslation(claim: PhotoAnalysisClaim): Boolean {
        val fullText = claim.fullText.orEmpty()
        if (fullText.isBlank()) {
            repository.fail(claim, PhotoFailureCode.SOURCE_MISSING)
            return false
        }
        val translation = try {
            openRouter.completeText(
                prompt = PhotoPrompts.TRANSLATION.format(fullText),
                model = claim.modelId,
            )
        } catch (error: AiProviderException) {
            logProviderFailure("translation", claim.sessionId, error)
            repository.fail(claim, failureCode(error))
            return false
        }
        val translatedText = translation.data.firstOrNull()?.jsonObject
            ?.get("translation")?.jsonPrimitive?.contentOrNull.orEmpty()
        if (translatedText.isBlank()) {
            repository.fail(claim, PhotoFailureCode.INVALID_RESPONSE, translation.costMicrodollars)
            return false
        }
        return repository.completeTranslation(claim, translatedText, translation.costMicrodollars)
    }

    private suspend fun dispatchTask(taskId: UUID): Boolean {
        val accepted = jobDispatcher.dispatch(mapOf(CAPTURE_TASK_ID_ENV to taskId.toString()))
        if (!accepted) repository.markDispatchFailed(taskId)
        return accepted
    }

    private suspend fun withLeaseHeartbeat(
        claim: PhotoAnalysisClaim,
        block: suspend () -> Boolean,
    ): Boolean = coroutineScope {
        val heartbeatIntervalSeconds = (leaseSeconds / 3).coerceIn(30, 300)
        val heartbeat = launch {
            while (isActive) {
                delay(heartbeatIntervalSeconds * 1_000)
                val renewed = try {
                    repository.renewLease(claim, leaseSeconds)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    logger.error("Failed to renew photo lease for session={}", claim.sessionId, error)
                    continue
                }
                check(renewed) { "Lost photo claim for session=${claim.sessionId}" }
            }
        }
        try {
            block()
        } finally {
            heartbeat.cancelAndJoin()
        }
    }

    private fun parseVisualResult(data: JsonArray): VisualResult {
        val envelope = data.singleOrNull()?.jsonObject
        val fullText = envelope?.get("fullText")?.jsonPrimitive?.contentOrNull.orEmpty()
        val items = envelope?.get("kanji") as? JsonArray
            ?: throw IllegalArgumentException("Visual analysis did not return a kanji array")
        return VisualResult(fullText, enrich(items))
    }

    private fun failureCode(error: AiProviderException): String = when (error.failure) {
        AiProviderFailure.TIMEOUT -> PhotoFailureCode.TIMED_OUT
        AiProviderFailure.INVALID_RESPONSE -> PhotoFailureCode.INVALID_RESPONSE
        else -> PhotoFailureCode.PROVIDER_FAILED
    }

    private fun logProviderFailure(stage: String, sessionId: UUID, error: AiProviderException) {
        logger.error(
            "Photo {} failed for session={} failure={} status={} generationId={}",
            stage,
            sessionId,
            error.failure,
            error.statusCode,
            error.generationId,
            error,
        )
    }

    private fun enrich(items: JsonArray): JsonArray {
        val objects = items.map { it.jsonObject }
        val characters = objects.mapNotNull { item ->
            item["character"]?.jsonPrimitive?.contentOrNull?.let(::normalizeCharacter)
        }
        val references = repository.lookupKanji(characters)
        return buildJsonArray {
            objects.forEachIndexed { index, item ->
                val character = item["character"]?.jsonPrimitive?.contentOrNull?.let(::normalizeCharacter).orEmpty()
                val reference = references[character]
                add(buildJsonObject {
                    if (reference == null) put("kanjiMasterId", JsonNull) else put("kanjiMasterId", reference.id.toString())
                    put("character", character)
                    put("recommended", index < 3)
                    put("recommendationRank", item["recommendationRank"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: index)
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

    private fun normalizeCharacter(value: String): String {
        val normalized = Normalizer.normalize(value.trim(), Normalizer.Form.NFKC)
        return normalized.takeIf { it.codePointCount(0, it.length) == 1 }.orEmpty()
    }

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
    private data class VisualResult(val fullText: String, val enriched: JsonArray)

    private companion object {
        val logger = LoggerFactory.getLogger(PhotoAnalysisExecutor::class.java)
        const val CAPTURE_TASK_ID_ENV = "CAPTURE_TASK_ID"
    }
}
