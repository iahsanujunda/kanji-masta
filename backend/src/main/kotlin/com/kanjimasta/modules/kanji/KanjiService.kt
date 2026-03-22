package com.kanjimasta.modules.kanji

import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.kanji.KanjiService")

class KanjiService(private val kanjiRepository: KanjiRepository) {

    suspend fun saveSession(userId: String, request: SaveSessionRequest) {
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
                }
            }
        }
    }
}
