package com.kanjimasta.modules.kanji

import com.kanjimasta.core.db.DataConnectClient
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.kanji.KanjiRepository")

data class SystemQuiz(
    val quizType: String,
    val prompt: String,
    val furigana: String?,
    val target: String,
    val answer: String,
    val explanation: String?,
    val kanjiId: String,
    val wordId: String,
    val distractors: List<String>,
)

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

    suspend fun insertUserWord(
        userId: String,
        word: String,
        reading: String,
        meaning: String,
        kanjiMasterId: String,
        source: String = "PHOTO",
    ): String? {
        val query = """
            mutation {
                userWords_insert(data: {
                    userId: "${userId.escape()}",
                    word: "${word.escape()}",
                    reading: "${reading.escape()}",
                    meaning: "${meaning.escape()}",
                    kanjiIds: ["$kanjiMasterId"],
                    source: $source,
                    unlocked: true
                })
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        if (result["errors"]?.jsonArray?.isNotEmpty() == true) {
            logger.debug("Word insert issue for '{}': {}", word, result["errors"])
            return null
        }
        return result["data"]?.jsonObject?.get("userWords_insert")?.jsonObject?.get("id")?.jsonPrimitive?.content
    }

    suspend fun findUserWordByWord(userId: String, word: String): String? {
        val query = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" }, word: { eq: "${word.escape()}" } }) { id }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val rows = result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: return null
        return rows.firstOrNull()?.jsonObject?.get("id")?.jsonPrimitive?.content
    }

    suspend fun getSystemQuizzesByWord(wordText: String): List<SystemQuiz> {
        val query = """
            query {
                quizBanks(where: { userId: { eq: "system" } }) {
                    quizType prompt furigana target answer explanation kanjiId wordId
                    word { word }
                    quizDistractors_on_quiz { distractors }
                }
            }
        """.trimIndent()

        val result = dc.executeGraphql(query)
        val rows = result["data"]?.jsonObject?.get("quizBanks")?.jsonArray ?: return emptyList()

        return rows.mapNotNull { row ->
            val obj = row.jsonObject
            val w = obj["word"]?.jsonObject?.get("word")?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            if (w != wordText) return@mapNotNull null

            val distractorSets = obj["quizDistractors_on_quiz"]?.jsonArray
            val distractors = distractorSets?.firstOrNull()?.jsonObject
                ?.get("distractors")?.jsonArray
                ?.map { it.jsonPrimitive.content }
                ?: emptyList()

            SystemQuiz(
                quizType = obj["quizType"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                prompt = obj["prompt"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                furigana = obj["furigana"]?.jsonPrimitive?.contentOrNull,
                target = obj["target"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                answer = obj["answer"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                explanation = obj["explanation"]?.jsonPrimitive?.contentOrNull,
                kanjiId = obj["kanjiId"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                wordId = obj["wordId"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                distractors = distractors,
            )
        }
    }

    suspend fun cloneQuizzesToUser(userId: String, kanjiMasterId: String, userWordId: String, systemQuizzes: List<SystemQuiz>) {
        for (quiz in systemQuizzes) {
            val furiganaField = if (quiz.furigana != null) """furigana: "${quiz.furigana.escape()}",""" else ""
            val explanationField = if (quiz.explanation != null) """explanation: "${quiz.explanation.escape()}",""" else ""

            val insertQuery = """
                mutation {
                    quizBank_insert(data: {
                        userId: "${userId.escape()}",
                        kanjiId: "$kanjiMasterId",
                        wordId: "$userWordId",
                        quizType: ${quiz.quizType},
                        prompt: "${quiz.prompt.escape()}",
                        target: "${quiz.target.escape()}",
                        answer: "${quiz.answer.escape()}",
                        $furiganaField
                        $explanationField
                    })
                }
            """.trimIndent()

            val insertResult = dc.executeGraphql(insertQuery)
            val quizId = insertResult["data"]?.jsonObject
                ?.get("quizBank_insert")?.jsonObject
                ?.get("id")?.jsonPrimitive?.content

            if (quizId == null) {
                logger.error("Failed to clone quiz: {}", insertResult)
                continue
            }

            if (quiz.distractors.isNotEmpty()) {
                val distJson = buildJsonArray { quiz.distractors.forEach { add(it) } }
                val distQuery = """
                    mutation {
                        quizDistractor_insert(data: {
                            quizId: "$quizId",
                            userId: "${userId.escape()}",
                            distractors: $distJson,
                            generation: 1,
                            trigger: INITIAL,
                            familiarityAtGeneration: 0
                        })
                    }
                """.trimIndent()
                dc.executeGraphql(distQuery)
            }
        }
        logger.info("Cloned {} quizzes for user={} word={}", systemQuizzes.size, userId, userWordId)
    }

    suspend fun insertQuizGenerationJob(userId: String, kanjiMasterId: String, wordId: String? = null) {
        val wordField = if (wordId != null) """wordId: "$wordId",""" else ""
        val query = """
            mutation {
                quizGenerationJob_insert(data: {
                    userId: "${userId.escape()}",
                    kanjiId: "$kanjiMasterId",
                    $wordField
                })
            }
        """.trimIndent()
        dc.executeGraphql(query)
    }

    suspend fun countPendingJobs(userId: String): Int {
        val query = """
            query {
                quizGenerationJobs(where: {
                    userId: { eq: "${userId.escape()}" },
                    status: { in: [PENDING, PROCESSING] }
                }) { id }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizGenerationJobs")?.jsonArray?.size ?: 0
    }

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
}
