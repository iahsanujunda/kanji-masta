package com.kanjimasta.modules.kanji

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.kanji.KanjiService")

class KanjiService(
    private val kanjiRepository: KanjiRepository,
    private val httpClient: HttpClient,
    private val functionsBaseUrl: String,
    private val firebaseProjectId: String,
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    suspend fun saveSession(userId: String, request: SaveSessionRequest) {
        var jobsEnqueued = false

        for (selection in request.selections) {
            kanjiRepository.insertUserKanji(
                userId = userId,
                kanjiMasterId = selection.kanjiMasterId,
                status = selection.status,
                sourcePhotoId = request.sessionId,
            )

            if (selection.status == "learning") {
                val systemQuizzes = kanjiRepository.getSystemQuizzes(selection.kanjiMasterId)
                if (systemQuizzes.isNotEmpty()) {
                    logger.info("Cloning {} system quizzes for kanji={}", systemQuizzes.size, selection.kanjiMasterId)
                    kanjiRepository.cloneQuizzesToUser(userId, selection.kanjiMasterId, systemQuizzes)
                } else {
                    logger.info("No system quizzes for kanji={}, enqueueing generation job", selection.kanjiMasterId)
                    kanjiRepository.insertQuizGenerationJob(userId, selection.kanjiMasterId)
                    jobsEnqueued = true
                }
            }
        }

        // Trigger quiz generation immediately if any jobs were enqueued
        if (jobsEnqueued) {
            val functionUrl = "$functionsBaseUrl/$firebaseProjectId/us-central1/generate_quizzes_http"
            logger.info("Triggering quiz generation function: {}", functionUrl)
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

    suspend fun getPendingJobCount(userId: String): Int {
        return kanjiRepository.countPendingJobs(userId)
    }
}
