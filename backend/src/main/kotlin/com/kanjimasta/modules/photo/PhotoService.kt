package com.kanjimasta.modules.photo

import com.kanjimasta.core.db.PhotoFailureCode
import com.kanjimasta.core.db.PhotoSessionStatus
import com.kanjimasta.core.jobs.JobDispatcher
import com.kanjimasta.core.storage.SupabaseStorageSigner
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.Base64
import java.time.Instant

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.photo.PhotoService")

class PhotoService(
    private val photoRepository: PhotoRepository,
    private val jobDispatcher: JobDispatcher,
    private val storageSigner: SupabaseStorageSigner? = null,
) {
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
            if (creation.shouldDispatch) {
                dispatchJob(sessionId, userId)
            }
            return AnalyzePhotoResponse(sessionId = sessionId, status = PhotoSessionStatus.PROCESSING.apiValue)
        }
        logger.info("Created photo session={}, dispatching photo analysis", sessionId)

        dispatchJob(sessionId, userId)

        return AnalyzePhotoResponse(sessionId = sessionId, status = PhotoSessionStatus.PROCESSING.apiValue)
    }

    suspend fun rerunAnalysis(sessionId: UUID, userId: String): Boolean {
        val session = photoRepository.getSession(sessionId, userId) ?: return false
        val imageUrl = if (!session.storagePath.isNullOrBlank() && storageSigner != null) {
            storageSigner.signPhoto(session.storagePath) ?: run {
                photoRepository.markFailed(sessionId.toString(), userId, PhotoFailureCode.SOURCE_MISSING)
                return false
            }
        } else {
            session.imageUrl
        }
        photoRepository.updateImageUrl(sessionId, userId, imageUrl)
        return dispatchJob(sessionId.toString(), userId)
    }

    private suspend fun dispatchJob(sessionId: String, userId: String): Boolean {
        val accepted = jobDispatcher.dispatch(mapOf("PHOTO_SESSION_ID" to sessionId))
        if (!accepted) {
            photoRepository.markFailed(sessionId, userId, PhotoFailureCode.DISPATCH_FAILED)
        }
        return accepted
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

    fun getActivity(userId: String, limit: Int, cursor: String?): PhotoActivityResponse {
        val decodedCursor = cursor?.let(::decodeActivityCursor)
        val sessions = photoRepository.getActivitySessions(
            userId = userId,
            limit = limit + 1,
            beforeCreatedAt = decodedCursor?.first,
            beforeId = decodedCursor?.second,
        )
        val hasMore = sessions.size > limit
        val page = sessions.take(limit)
        val items = page.map { session ->
            PhotoActivityItem(
                sessionId = session.id,
                storagePath = session.storagePath,
                status = session.status.apiValue,
                createdAt = session.createdAt?.toString() ?: "",
                updatedAt = session.updatedAt?.toString() ?: session.createdAt?.toString() ?: "",
                kanjiCount = kanjiCount(session),
                failureCode = session.failureCode,
            )
        }
        val nextCursor = if (hasMore) page.lastOrNull()?.let { session ->
            encodeActivityCursor(
                checkNotNull(session.createdAt) { "Photo activity is missing created_at" },
                UUID.fromString(session.id),
            )
        } else null
        return PhotoActivityResponse(items = items, nextCursor = nextCursor, hasMore = hasMore)
    }

    fun getActivityUnseen(userId: String): PhotoActivityUnseenResponse {
        val latestTerminalAt = photoRepository.getLatestTerminalActivityAt(userId)
        val seenThrough = photoRepository.getActivitySeenThrough(userId)
        return PhotoActivityUnseenResponse(
            hasUnseen = latestTerminalAt != null && (seenThrough == null || latestTerminalAt.isAfter(seenThrough)),
            latestTerminalAt = latestTerminalAt?.toString(),
        )
    }

    fun markActivitySeen(userId: String, seenThrough: Instant) {
        val latestTerminalAt = photoRepository.getLatestTerminalActivityAt(userId) ?: return
        val boundedWatermark = if (seenThrough.isAfter(latestTerminalAt)) latestTerminalAt else seenThrough
        photoRepository.markActivitySeen(userId, boundedWatermark)
    }

    private fun kanjiCount(session: PhotoSessionRow): Int? {
        if (session.status != PhotoSessionStatus.DONE || session.rawAiResponse == null) return null
        return try {
            Json.parseToJsonElement(session.rawAiResponse).jsonArray.size
        } catch (_: Exception) {
            null
        }
    }

    private fun encodeActivityCursor(createdAt: Instant, id: UUID): String =
        Base64.getUrlEncoder().withoutPadding()
            .encodeToString("$createdAt|$id".toByteArray(Charsets.UTF_8))

    private fun decodeActivityCursor(cursor: String): Pair<Instant, UUID> = try {
        val decoded = String(Base64.getUrlDecoder().decode(cursor), Charsets.UTF_8)
        val parts = decoded.split('|', limit = 2)
        require(parts.size == 2)
        Instant.parse(parts[0]) to UUID.fromString(parts[1])
    } catch (error: Exception) {
        throw IllegalArgumentException("Invalid activity cursor", error)
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
