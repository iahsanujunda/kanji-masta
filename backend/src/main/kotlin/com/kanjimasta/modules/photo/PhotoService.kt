package com.kanjimasta.modules.photo

import com.kanjimasta.core.auth.getGoogleAccessToken
import com.kanjimasta.core.auth.getIdentityToken
import com.kanjimasta.core.db.PhotoFailureCode
import com.kanjimasta.core.db.PhotoSessionStatus
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
import java.util.UUID

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.photo.PhotoService")

class PhotoService(
    private val photoRepository: PhotoRepository,
    private val httpClient: HttpClient,
    private val aiWorkerUrl: String,
    private val selfUrl: String = "",
    private val internalKey: String = "",
    private val photoAnalysisJobName: String = "",
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    suspend fun startAnalysis(
        userId: String,
        imageUrl: String,
        storagePath: String? = null,
        clientCaptureId: UUID? = null,
    ): AnalyzePhotoResponse {
        logger.debug("Creating photo session for user={}", userId)
        val creation = photoRepository.createSession(userId, imageUrl, storagePath, clientCaptureId)
        val sessionId = creation.id
        if (!creation.created) {
            logger.info("Reusing photo session={} for clientCaptureId={}", sessionId, clientCaptureId)
            if (creation.shouldDispatch && photoAnalysisJobName.isNotBlank()) {
                dispatchCloudRunJob(sessionId, userId)
            }
            return AnalyzePhotoResponse(sessionId = sessionId, status = PhotoSessionStatus.PROCESSING.apiValue)
        }
        logger.info("Created photo session={}, dispatching photo analysis", sessionId)

        if (photoAnalysisJobName.isNotBlank()) {
            dispatchCloudRunJob(sessionId, userId)
        } else {
            dispatchLocalWorker(sessionId, userId, imageUrl)
        }

        return AnalyzePhotoResponse(sessionId = sessionId, status = PhotoSessionStatus.PROCESSING.apiValue)
    }

    private suspend fun dispatchCloudRunJob(sessionId: String, userId: String) {
        try {
            val accessToken = getGoogleAccessToken(httpClient)
                ?: error("Google Cloud access token is unavailable")
            val response = httpClient.post("https://run.googleapis.com/v2/$photoAnalysisJobName:run") {
                contentType(ContentType.Application.Json)
                bearerAuth(accessToken)
                setBody(buildJsonObject {
                    putJsonObject("overrides") {
                        putJsonArray("containerOverrides") {
                            addJsonObject {
                                putJsonArray("env") {
                                    addJsonObject {
                                        put("name", "PHOTO_SESSION_ID")
                                        put("value", sessionId)
                                    }
                                }
                            }
                        }
                    }
                }.toString())
            }
            if (!response.status.isSuccess()) {
                logger.error(
                    "Cloud Run photo job dispatch failed for session={}, status={}: {}",
                    sessionId,
                    response.status,
                    response.bodyAsText(),
                )
                photoRepository.markFailed(sessionId, userId, PhotoFailureCode.DISPATCH_FAILED)
                return
            }
            logger.info("Cloud Run photo job accepted for session={}", sessionId)
        } catch (e: Exception) {
            logger.error("Cloud Run photo job dispatch failed for session={}: {}", sessionId, e.message, e)
            photoRepository.markFailed(sessionId, userId, PhotoFailureCode.DISPATCH_FAILED)
        }
    }

    private fun dispatchLocalWorker(sessionId: String, userId: String, imageUrl: String) {
        val url = "$aiWorkerUrl/analyze-photo"

        // Local development keeps the HTTP worker path so Docker Compose remains self-contained.
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
                    photoRepository.markFailed(sessionId, userId, PhotoFailureCode.DISPATCH_FAILED)
                }
            } catch (e: Exception) {
                logger.error("AI worker call failed for session={}: {}", sessionId, e.message, e)
                photoRepository.markFailed(sessionId, userId, PhotoFailureCode.DISPATCH_FAILED)
            }
        }
    }

    suspend fun getSessionResult(userId: String, sessionId: UUID): PhotoSessionResult? {
        val session = photoRepository.getSession(sessionId, userId) ?: return null

        if (session.status == PhotoSessionStatus.FAILED) {
            return PhotoSessionResult(
                sessionId = sessionId.toString(),
                status = PhotoSessionStatus.FAILED.apiValue,
                failureCode = session.failureCode,
                storagePath = session.storagePath,
            )
        }

        if (session.status == PhotoSessionStatus.INGESTED) {
            return PhotoSessionResult(
                sessionId = sessionId.toString(),
                status = PhotoSessionStatus.INGESTED.apiValue,
                storagePath = session.storagePath,
            )
        }

        val rawResponse = session.rawAiResponse
            ?: return PhotoSessionResult(
                sessionId = sessionId.toString(),
                status = PhotoSessionStatus.PROCESSING.apiValue,
                storagePath = session.storagePath,
            )

        val kanji = try {
            parseEnrichedKanji(rawResponse)
        } catch (e: Exception) {
            logger.error("Failed to parse session={} response: {}", sessionId, e.message)
            photoRepository.markFailed(sessionId.toString(), userId, PhotoFailureCode.INVALID_RESPONSE)
            return PhotoSessionResult(
                sessionId = sessionId.toString(),
                status = PhotoSessionStatus.FAILED.apiValue,
                failureCode = PhotoFailureCode.INVALID_RESPONSE,
                storagePath = session.storagePath,
            )
        }

        return PhotoSessionResult(
            sessionId = sessionId.toString(),
            status = PhotoSessionStatus.DONE.apiValue,
            kanji = kanji,
            storagePath = session.storagePath,
        )
    }

    suspend fun getRecentScans(userId: String): RecentScansResponse {
        val sessions = photoRepository.getRecentSessions(userId)
        val items = sessions.map { session ->
            val kanjiCount = if (session.status == PhotoSessionStatus.DONE && session.rawAiResponse != null) {
                try {
                    Json.parseToJsonElement(session.rawAiResponse).jsonArray.size
                } catch (_: Exception) {
                    null
                }
            } else null

            RecentScanItem(
                sessionId = session.id,
                storagePath = session.storagePath,
                status = session.status.apiValue,
                createdAt = session.createdAt?.toString() ?: "",
                kanjiCount = kanjiCount,
                failureCode = session.failureCode,
            )
        }
        return RecentScansResponse(sessions = items)
    }

    private fun parseEnrichedKanji(rawResponse: String): List<EnrichedKanji> {
        val parsed = Json.parseToJsonElement(rawResponse).jsonArray
        return parsed.map { element ->
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
    }
}
