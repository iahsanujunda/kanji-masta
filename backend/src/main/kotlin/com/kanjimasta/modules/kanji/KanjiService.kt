package com.kanjimasta.modules.kanji

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
                kanjiRepository.insertQuizGenerationJob(
                    userId = userId,
                    kanjiMasterId = selection.kanjiMasterId,
                )
            }
        }
    }
}
