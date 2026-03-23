package com.kanjimasta.modules.kanji

import com.kanjimasta.modules.photo.PhotoRepository
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.kanji.KanjiService")

class KanjiService(
    private val kanjiRepository: KanjiRepository,
    private val photoRepository: PhotoRepository,
    private val httpClient: HttpClient,
    private val functionsBaseUrl: String,
    private val firebaseProjectId: String,
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    suspend fun saveSession(userId: String, request: SaveSessionRequest) {
        var jobsEnqueued = false

        // Read example words from PhotoSession for word creation
        val exampleWordsByKanji = loadExampleWords(request.sessionId)

        for (selection in request.selections) {
            kanjiRepository.insertUserKanji(
                userId = userId,
                kanjiMasterId = selection.kanjiMasterId,
                status = selection.status,
                sourcePhotoId = request.sessionId,
            )

            if (selection.status == "learning") {
                val exampleWords = exampleWordsByKanji[selection.kanjiMasterId] ?: emptyList()

                for (ew in exampleWords) {
                    // Create UserWord (or find existing)
                    var wordId = kanjiRepository.findUserWordByWord(userId, ew.word)
                    if (wordId == null) {
                        wordId = kanjiRepository.insertUserWord(
                            userId = userId,
                            word = ew.word,
                            reading = ew.reading,
                            meaning = ew.meaning,
                            kanjiMasterId = selection.kanjiMasterId,
                        )
                    }
                    if (wordId == null) continue

                    // Check for system quizzes by word text
                    val systemQuizzes = kanjiRepository.getSystemQuizzesByWord(ew.word)
                    if (systemQuizzes.isNotEmpty()) {
                        logger.info("Cloning {} system quizzes for word '{}'", systemQuizzes.size, ew.word)
                        kanjiRepository.cloneQuizzesToUser(userId, selection.kanjiMasterId, wordId, systemQuizzes)
                    } else {
                        logger.info("No system quizzes for word '{}', enqueueing job", ew.word)
                        kanjiRepository.insertQuizGenerationJob(userId, selection.kanjiMasterId, wordId)
                        jobsEnqueued = true
                    }
                }
            }
        }

        if (jobsEnqueued) {
            triggerQuizGeneration()
        }
    }

    suspend fun getPendingJobCount(userId: String): Int {
        return kanjiRepository.countPendingJobs(userId)
    }

    private suspend fun loadExampleWords(sessionId: String): Map<String, List<ExampleWord>> {
        val session = photoRepository.getSession(sessionId) ?: return emptyMap()
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

    private fun triggerQuizGeneration() {
        val functionUrl = "$functionsBaseUrl/$firebaseProjectId/us-central1/generate_quizzes_http"
        logger.info("Triggering quiz generation: {}", functionUrl)
        scope.launch {
            try {
                httpClient.post(functionUrl) {
                    contentType(ContentType.Application.Json)
                    setBody("{}")
                }
            } catch (e: Exception) {
                logger.warn("Quiz generation trigger failed (will retry via schedule): {}", e.message)
            }
        }
    }
}

data class ExampleWord(val word: String, val reading: String, val meaning: String)
