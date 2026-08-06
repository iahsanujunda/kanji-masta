package com.kanjimasta.kanji

import com.kanjimasta.photo.PhotoSessionStatus
import com.kanjimasta.jobs.JobDispatcher
import com.kanjimasta.photo.PhotoRepository
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.util.UUID

private val logger = LoggerFactory.getLogger("com.kanjimasta.kanji.KanjiService")

class KanjiService(
    private val kanjiRepository: KanjiRepository,
    private val photoRepository: PhotoRepository,
    private val jobDispatcher: JobDispatcher,
) {
    suspend fun saveSession(userId: String, request: SaveSessionRequest) {
        val learningKanjiIds = mutableListOf<String>()

        for (selection in request.selections) {
            kanjiRepository.insertUserKanji(
                userId = userId,
                kanjiMasterId = selection.kanjiMasterId,
                status = selection.status,
                sourcePhotoId = request.sessionId,
            )
            if (selection.status == "learning") {
                learningKanjiIds.add(selection.kanjiMasterId)
            }
        }

        // Mark photo session as ingested so it no longer appears in recent scans
        photoRepository.updateSessionStatus(request.sessionId, userId, PhotoSessionStatus.INGESTED)

        if (learningKanjiIds.isNotEmpty()) {
            processWordsForKanji(userId, request.sessionId, learningKanjiIds)
        }
    }

    /**
     * Word encounter flow (WordMaster-based):
     * 1. Find or create WordMaster for each word
     * 2. Check if global quizzes exist for that WordMaster
     * 3. If not → enqueue generation job
     * 4. Create personal UserWords linking to WordMaster
     */
    private suspend fun processWordsForKanji(userId: String, sessionId: String?, kanjiIds: List<String>) {
        val exampleWordsByKanji = if (sessionId != null) loadExampleWords(userId, sessionId) else emptyMap()
        var jobsEnqueued = false

        for (kanjiMasterId in kanjiIds) {
            val exampleWords = exampleWordsByKanji[kanjiMasterId]
                ?: kanjiRepository.getWordMastersForKanji(kanjiMasterId).map {
                    ExampleWord(it.word, it.reading, it.meaning)
                }

            if (exampleWords.isEmpty()) {
                logger.info("No words for kanji={}, enqueueing generation job", kanjiMasterId)
                kanjiRepository.insertQuizGenerationJob(userId, kanjiMasterId)
                jobsEnqueued = true
                continue
            }

            for (ew in exampleWords) {
                // 1. Find or create WordMaster
                val wmId = kanjiRepository.findOrCreateWordMaster(ew.word, ew.reading, ew.meaning, kanjiMasterId)

                // 2. Check for global quizzes
                if (!kanjiRepository.hasGlobalQuizzes(wmId)) {
                    logger.info("No global quizzes for word '{}', enqueueing job", ew.word)
                    kanjiRepository.insertQuizGenerationJob(userId, kanjiMasterId, wmId)
                    jobsEnqueued = true
                }

                // 3. Create personal UserWords (if not exists)
                if (kanjiRepository.findUserWordByWordMaster(userId, wmId) == null) {
                    kanjiRepository.insertUserWord(userId, wmId, kanjiMasterId)
                }
            }
        }

        if (jobsEnqueued) triggerQuizGeneration()
        logger.info("Word processing complete for {} kanji", kanjiIds.size)
    }

    suspend fun saveOnboardingSelections(userId: String, selections: List<KanjiSelection>) {
        val learningIds = mutableListOf<String>()
        for (selection in selections) {
            kanjiRepository.insertUserKanji(
                userId = userId,
                kanjiMasterId = selection.kanjiMasterId,
                status = selection.status,
                sourcePhotoId = null,
            )
            if (selection.status == "learning") {
                learningIds.add(selection.kanjiMasterId)
            }
        }

        if (learningIds.isNotEmpty()) {
            processWordsForKanji(userId, null, learningIds)
        }
    }

    private val jlptMeta = mapOf(
        5 to ("JLPT N5" to "The Basics"),
        4 to ("JLPT N4" to "Everyday Life"),
        3 to ("JLPT N3" to "Intermediate"),
        2 to ("JLPT N2" to "Advanced"),
        1 to ("JLPT N1" to "Expert"),
    )

    suspend fun getCurriculumSummary(userId: String): CurriculumResponse {
        val totals = kanjiRepository.getTotalKanjiByJlpt()
        val summary = kanjiRepository.getCurriculumSummary(userId)
        val items = summary.map { (jlpt, planted) ->
            val (title, subtitle) = jlptMeta[jlpt] ?: ("JLPT N$jlpt" to "")
            CurriculumItem(
                jlpt = jlpt,
                title = title,
                subtitle = subtitle,
                total = totals[jlpt] ?: 0,
                planted = planted,
            )
        }
        return CurriculumResponse(curriculums = items)
    }

    suspend fun getCurriculumKanji(userId: String, jlpt: Int): CurriculumDetailResponse {
        val totals = kanjiRepository.getTotalKanjiByJlpt()
        val (title, _) = jlptMeta[jlpt] ?: ("JLPT N$jlpt" to "")
        val kanji = kanjiRepository.getCurriculumKanji(userId, jlpt)
        return CurriculumDetailResponse(
            jlpt = jlpt,
            title = title,
            total = totals[jlpt] ?: 0,
            kanji = kanji,
        )
    }

    suspend fun getPendingJobCount(userId: String): Int {
        return kanjiRepository.countPendingJobs(userId)
    }

    suspend fun getKanjiList(userId: String): List<KanjiListItem> {
        return kanjiRepository.getAllUserKanji(userId)
    }

    suspend fun getWordList(userId: String, query: String?, state: String?, offset: Int, limit: Int): WordListResponse {
        return kanjiRepository.getUserWords(userId, query, state, offset, limit)
    }

    suspend fun getWordReference(userId: String, userWordId: String): WordReferenceResponse? =
        kanjiRepository.getUserWordReference(userId, userWordId)

    suspend fun getOnboardingKanji(userId: String, offset: Int, limit: Int): OnboardingResponse {
        val (items, hasMore) = kanjiRepository.getOnboardingKanji(userId, offset, limit)
        return OnboardingResponse(kanji = items, hasMore = hasMore)
    }

    private suspend fun loadExampleWords(userId: String, sessionId: String): Map<String, List<ExampleWord>> {
        val sessionUuid = runCatching { UUID.fromString(sessionId) }.getOrNull() ?: return emptyMap()
        val session = photoRepository.getSession(sessionUuid, userId) ?: return emptyMap()
        val rawResponse = session.rawAiResponse ?: return emptyMap()

        return try {
            val parsed = Json.parseToJsonElement(rawResponse).jsonArray
            parsed.associate { element ->
                val obj = element.jsonObject
                val kanjiMasterId = obj["kanjiMasterId"]?.jsonPrimitive?.contentOrNull ?: ""
                val words = obj["exampleWords"]?.jsonArray?.map { wordEl ->
                    val w = wordEl.jsonObject
                    ExampleWord(
                        word = w["word"]?.jsonPrimitive?.content ?: "",
                        reading = w["reading"]?.jsonPrimitive?.content ?: "",
                        meaning = w["meaning"]?.jsonPrimitive?.content ?: "",
                    )
                } ?: emptyList()
                kanjiMasterId to words
            }
        } catch (e: Exception) {
            logger.warn("Failed to parse example words from session {}: {}", sessionId, e.message)
            emptyMap()
        }
    }

    private suspend fun triggerQuizGeneration() {
        val dispatched = dispatchPendingQuizGeneration()
        if (!dispatched) {
            logger.warn("Quiz generation dispatch failed; pending rows remain recoverable")
        }
    }

    suspend fun dispatchPendingQuizGeneration(): Boolean = jobDispatcher.dispatch(emptyMap())
}
