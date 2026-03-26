package com.kanjimasta.modules.photo

import com.kanjimasta.core.auth.getIdentityToken
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import org.slf4j.MDC

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.photo.PhotoService")

class PhotoService(
    private val photoRepository: PhotoRepository,
    private val httpClient: HttpClient,
    private val aiWorkerUrl: String,
    private val selfUrl: String = "",
    private val internalKey: String = "",
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    suspend fun startAnalysis(userId: String, imageUrl: String): AnalyzePhotoResponse {
        logger.debug("Creating photo session for user={}", userId)
        val sessionId = photoRepository.createSession(userId, imageUrl)
        logger.info("Created photo session={}, calling ai-worker", sessionId)

        val url = "$aiWorkerUrl/analyze-photo"

        // Fire-and-forget: call AI worker async
        scope.launch {
            try {
                val idToken = getIdentityToken(httpClient, aiWorkerUrl)
                val response = httpClient.post(url) {
                    contentType(ContentType.Application.Json)
                    idToken?.let { header("Authorization", "Bearer $it") }
                    header("X-Call-Id", MDC.get("callId") ?: "no-call")
                    header("X-User-Id", userId)
                    setBody(buildJsonObject {
                        put("imageUrl", imageUrl)
                        put("userId", userId)
                        put("sessionId", sessionId)
                        if (selfUrl.isNotBlank()) {
                            put("callbackUrl", "$selfUrl/api/internal/photo-result")
                            put("callbackKey", internalKey)
                        }
                    }.toString())
                }
                logger.info("AI worker call completed for session={}, status={}", sessionId, response.status)
                if (!response.status.isSuccess()) {
                    logger.error("AI worker returned error for session={}: {}", sessionId, response.bodyAsText())
                }
            } catch (e: Exception) {
                logger.error("AI worker call failed for session={}: {}", sessionId, e.message, e)
            }
        }

        return AnalyzePhotoResponse(sessionId = sessionId, status = "processing")
    }

    suspend fun getSessionResult(sessionId: String): PhotoSessionResult {
        val session = photoRepository.getSession(sessionId)
            ?: return PhotoSessionResult(sessionId = sessionId, status = "not_found")

        if (session.status == "ERROR") {
            return PhotoSessionResult(sessionId = sessionId, status = "error")
        }

        val rawResponse = session.rawAiResponse
            ?: return PhotoSessionResult(sessionId = sessionId, status = "processing")

        val kanji = try {
            val parsed = Json.parseToJsonElement(rawResponse).jsonArray
            parsed.map { element ->
                val obj = element.jsonObject
                with(obj) {
                    EnrichedKanji(
                        kanjiMasterId = get("kanjiMasterId")?.jsonPrimitive?.contentOrNull,
                        character = get("character")?.jsonPrimitive?.content ?: "",
                        recommended = get("recommended")?.jsonPrimitive?.booleanOrNull ?: false,
                        whyUseful = get("whyUseful")?.jsonPrimitive?.content ?: "",
                        onyomi = get("onyomi")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                        kunyomi = get("kunyomi")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                        meanings = get("meanings")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                        frequency = get("frequency")?.jsonPrimitive?.intOrNull,
                        exampleWords = get("exampleWords")?.jsonArray?.map { wordEl ->
                            val w = wordEl.jsonObject
                            ExampleWord(
                                word = w["word"]?.jsonPrimitive?.content ?: "",
                                reading = w["reading"]?.jsonPrimitive?.content ?: "",
                                meaning = w["meaning"]?.jsonPrimitive?.content ?: ""
                            )
                        } ?: emptyList()
                    )
                }
            }
        } catch (e: Exception) {
            logger.error("Failed to parse session={} response: {}", sessionId, e.message)
            return PhotoSessionResult(sessionId = sessionId, status = "error")
        }

        return PhotoSessionResult(sessionId = sessionId, status = "done", kanji = kanji)
    }
}
