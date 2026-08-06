package com.kanjimasta.photo

import com.kanjimasta.photo.PhotoFailureCode
import com.kanjimasta.photo.PhotoSessionStatus
import com.kanjimasta.jobs.JobDispatcher
import com.kanjimasta.photo.SupabaseStorageSigner
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.Base64
import java.time.Instant

private val logger = LoggerFactory.getLogger("com.kanjimasta.photo.PhotoService")

class PhotoService(
    private val photoRepository: PhotoRepository,
    private val jobDispatcher: JobDispatcher,
    private val storageSigner: SupabaseStorageSigner? = null,
    private val wordDiscoveryRepository: CaptureWordDiscoveryRepository? = null,
    private val quizJobDispatcher: JobDispatcher? = null,
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

    suspend fun retryCapture(sessionId: UUID, userId: String): Boolean {
        val session = photoRepository.getSession(sessionId, userId) ?: return false
        val imageUrl = if (!session.storagePath.isNullOrBlank() && storageSigner != null) {
            storageSigner.signPhoto(session.storagePath) ?: return false
        } else session.imageUrl
        if (!photoRepository.prepareUserRetry(sessionId, userId)) return false
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
            val wordActivity = wordDiscoveryRepository?.activityState(
                UUID.fromString(session.id),
                session.pipelineVersion ?: 2,
            )
            PhotoActivityItem(
                sessionId = session.id,
                storagePath = session.storagePath,
                status = session.status.apiValue,
                createdAt = session.createdAt?.toString() ?: "",
                updatedAt = session.updatedAt?.toString() ?: session.createdAt?.toString() ?: "",
                kanjiCount = kanjiCount(session),
                failureCode = session.failureCode,
                taskType = wordActivity?.first,
                taskStatus = wordActivity?.second?.lowercase(),
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

    fun getCaptures(userId: String, sort: String, direction: String): CaptureListResponse {
        require(sort in setOf("recent", "familiarity", "visited")) { "Invalid capture sort" }
        require(direction in setOf("asc", "desc")) { "Invalid capture direction" }
        val captures = photoRepository.getCaptureSessions(userId).map { session ->
            val kanji = photoRepository.getCaptureKanji(UUID.fromString(session.id), userId).orEmpty()
                .filter { it.excludedAt == null }
            val familiar = kanji.count { (it.familiarity ?: 0) >= 5 }
            CaptureSummary(
                sessionId = session.id,
                label = captureLabel(session),
                storagePath = session.storagePath,
                status = captureStatus(session),
                createdAt = session.createdAt?.toString().orEmpty(),
                readyAt = session.readyAt?.toString(),
                lastRevisitedAt = session.lastRevisitedAt?.toString(),
                familiarKanji = familiar,
                totalKanji = kanji.size,
                coveragePercent = coveragePercent(familiar, kanji.size),
                translationAvailable = !session.translation.isNullOrBlank(),
            )
        }
        val comparator = when (sort) {
            "familiarity" -> compareBy<CaptureSummary> { it.coveragePercent == null }
                .thenBy { it.coveragePercent ?: 0 }
                .thenBy { it.createdAt }
            "visited" -> compareBy<CaptureSummary> { it.lastRevisitedAt == null }
                .thenBy { it.lastRevisitedAt ?: "" }
                .thenBy { it.createdAt }
            else -> compareBy<CaptureSummary> { it.createdAt }.thenBy { it.sessionId }
        }
        val ordered = if (direction == "asc") {
            if (sort == "visited") captures.sortedWith(compareBy<CaptureSummary> { it.lastRevisitedAt != null }
                .thenBy { it.lastRevisitedAt ?: "" }.thenBy { it.createdAt })
            else captures.sortedWith(comparator)
        } else {
            when (sort) {
                "familiarity" -> captures.sortedWith(compareBy<CaptureSummary> { it.coveragePercent == null }
                    .thenByDescending { it.coveragePercent ?: 0 }.thenByDescending { it.createdAt })
                "visited" -> captures.sortedWith(compareBy<CaptureSummary> { it.lastRevisitedAt == null }
                    .thenByDescending { it.lastRevisitedAt ?: "" }.thenByDescending { it.createdAt })
                else -> captures.sortedWith(comparator.reversed())
            }
        }
        return CaptureListResponse(ordered)
    }

    fun getCapture(userId: String, sessionId: UUID): CaptureDetail? {
        val session = photoRepository.getSession(sessionId, userId) ?: return null
        val rows = photoRepository.getCaptureKanji(sessionId, userId) ?: return null
        val active = rows.filter { it.excludedAt == null }
        val familiar = active.count { (it.familiarity ?: 0) >= 5 }
        val gateSatisfied = !photoRepository.hasIncompleteCaptureLearningBatch(sessionId, userId)
        val recommended = if (gateSatisfied) {
            active.filter { it.familiarity == null }.take(3).map { it.kanjiMasterId }.toSet()
        } else emptySet()
        return CaptureDetail(
            sessionId = session.id,
            label = captureLabel(session),
            storagePath = session.storagePath,
            status = captureStatus(session),
            failureCode = session.failureCode,
            createdAt = session.createdAt?.toString().orEmpty(),
            fullText = session.fullText,
            translation = session.translation,
            translationLanguage = session.translationLanguage ?: "en",
            familiarKanji = familiar,
            totalKanji = active.size,
            coveragePercent = coveragePercent(familiar, active.size),
            batchGateSatisfied = gateSatisfied,
            kanji = rows.map { row ->
                val excluded = row.excludedAt != null
                val state = when {
                    excluded -> "EXCLUDED"
                    (row.familiarity ?: 0) >= 5 -> "FAMILIAR"
                    row.familiarity != null -> "LEARNING"
                    else -> "NOT_STARTED"
                }
                CaptureKanjiItem(
                    kanjiMasterId = row.kanjiMasterId.toString(),
                    character = row.character,
                    onyomi = row.onyomi,
                    kunyomi = row.kunyomi,
                    meanings = row.meanings,
                    whyUseful = row.whyUseful,
                    familiarity = row.familiarity,
                    learningState = state,
                    selectable = !excluded && row.familiarity == null,
                    recommendedNext = row.kanjiMasterId in recommended,
                    excluded = excluded,
                )
            },
            wordDiscovery = wordDiscoveryRepository?.readState(
                userId = userId,
                sessionId = sessionId,
                pipelineVersion = session.pipelineVersion ?: 2,
                eligible = captureStatus(session) == "ready" && !session.fullText.isNullOrBlank() &&
                    (active.isEmpty() || familiar == active.size),
            ) ?: CaptureWordDiscovery(false, "LOCKED"),
        )
    }

    fun setCaptureKanjiExcluded(userId: String, sessionId: UUID, kanjiId: UUID, excluded: Boolean): CaptureDetail? {
        if (!photoRepository.setKanjiExcluded(sessionId, kanjiId, userId, excluded)) return null
        return getCapture(userId, sessionId)
    }

    fun markCaptureRevisited(userId: String, sessionId: UUID): MarkCaptureRevisitedResponse? {
        val now = Instant.now()
        if (!photoRepository.markRevisited(sessionId, userId, now)) return null
        return MarkCaptureRevisitedResponse(now.toString())
    }

    suspend fun startWordDiscovery(userId: String, sessionId: UUID): CaptureWordDiscoveryEnqueueResult {
        val result = wordDiscoveryRepository?.enqueue(userId, sessionId)
            ?: return CaptureWordDiscoveryEnqueueResult.NotFound
        val accepted = result as? CaptureWordDiscoveryEnqueueResult.Accepted ?: return result
        if (accepted.value.created) {
            jobDispatcher.dispatch(mapOf("CAPTURE_WORD_TASK_ID" to accepted.value.taskId.toString()))
        }
        return result
    }

    suspend fun acceptDiscoveredWords(
        userId: String,
        sessionId: UUID,
        candidateIds: Set<UUID>,
    ): CaptureWordDecisionResult {
        val result = wordDiscoveryRepository?.acceptWords(userId, sessionId, candidateIds)
            ?: return CaptureWordDecisionResult.NotFound
        if ((result as? CaptureWordDecisionResult.Accepted)?.quizDispatchRequired == true) {
            quizJobDispatcher?.dispatch(emptyMap())
        }
        return result
    }

    suspend fun drainWordDiscovery(limit: Int = 20): Int {
        val repository = wordDiscoveryRepository ?: return 0
        var dispatched = 0
        repository.pendingTaskIds(limit).forEach { taskId ->
            if (jobDispatcher.dispatch(mapOf("CAPTURE_WORD_TASK_ID" to taskId.toString()))) dispatched++
        }
        return dispatched
    }

    private fun kanjiCount(session: PhotoSessionRow): Int? {
        if (session.status != PhotoSessionStatus.DONE || session.rawAiResponse == null) return null
        return try {
            Json.parseToJsonElement(session.rawAiResponse).jsonArray.size
        } catch (_: Exception) {
            null
        }
    }

    private fun captureStatus(session: PhotoSessionRow): String = when {
        session.processingStatus == "READY" || session.status in setOf(PhotoSessionStatus.DONE, PhotoSessionStatus.INGESTED) -> "ready"
        session.processingStatus == "NEEDS_ATTENTION" || session.status == PhotoSessionStatus.FAILED -> "needs_attention"
        else -> "processing"
    }

    private fun captureLabel(session: PhotoSessionRow): String = session.fullText
        ?.lineSequence()
        ?.map(String::trim)
        ?.firstOrNull(String::isNotBlank)
        ?.take(80)
        ?: session.createdAt?.toString().orEmpty()

    private fun coveragePercent(familiar: Int, total: Int): Int? =
        if (total == 0) null else ((familiar * 100.0) / total).toInt()

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
