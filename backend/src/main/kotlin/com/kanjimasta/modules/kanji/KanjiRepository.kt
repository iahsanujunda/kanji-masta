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

    suspend fun getSystemQuizzes(kanjiMasterId: String): List<SystemQuiz> {
        val query = """
            query {
                quizBanks(where: { userId: { eq: "system" }, kanjiId: { eq: "$kanjiMasterId" } }) {
                    quizType
                    prompt
                    furigana
                    target
                    answer
                    explanation
                    kanjiId
                    quizDistractors_on_quiz {
                        distractors
                    }
                }
            }
        """.trimIndent()

        val result = dc.executeGraphql(query)
        val rows = result["data"]?.jsonObject?.get("quizBanks")?.jsonArray ?: return emptyList()

        return rows.mapNotNull { row ->
            val obj = row.jsonObject
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
                kanjiId = obj["kanjiId"]?.jsonPrimitive?.content ?: kanjiMasterId,
                distractors = distractors,
            )
        }
    }

    suspend fun cloneQuizzesToUser(userId: String, kanjiMasterId: String, systemQuizzes: List<SystemQuiz>) {
        for (quiz in systemQuizzes) {
            val furiganaField = if (quiz.furigana != null) """furigana: "${quiz.furigana.escape()}",""" else ""
            val explanationField = if (quiz.explanation != null) """explanation: "${quiz.explanation.escape()}",""" else ""

            val insertQuery = """
                mutation {
                    quizBank_insert(data: {
                        userId: "${userId.escape()}",
                        kanjiId: "$kanjiMasterId",
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
                logger.error("Failed to clone quiz for kanji={}: {}", kanjiMasterId, insertResult)
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
        logger.info("Cloned {} system quizzes for user={} kanji={}", systemQuizzes.size, userId, kanjiMasterId)
    }

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
}
