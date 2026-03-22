package com.kanjimasta.modules.kanji

import com.kanjimasta.core.db.DataConnectClient

class KanjiRepository(private val dc: DataConnectClient) {

    suspend fun insertUserKanji(userId: String, kanjiMasterId: String, status: String, sourcePhotoId: String?) {
        val photoIdField = if (sourcePhotoId != null) """sourcePhotoId: "$sourcePhotoId",""" else ""
        val query = """
            mutation {
                userKanji_insert(data: {
                    userId: "${userId.escape()}",
                    kanjiId: "$kanjiMasterId",
                    status: ${status.uppercase()},
                    $photoIdField
                })
            }
        """.trimIndent()
        dc.executeGraphql(query)
    }

    suspend fun insertQuizGenerationJob(userId: String, kanjiMasterId: String) {
        val query = """
            mutation {
                quizGenerationJob_insert(data: {
                    userId: "${userId.escape()}",
                    kanjiId: "$kanjiMasterId"
                })
            }
        """.trimIndent()
        dc.executeGraphql(query)
    }

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"")
}
