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

    // --- List queries ---

    suspend fun getAllUserKanji(userId: String): List<KanjiListItem> {
        val query = """
            query {
                userKanjis(where: { userId: { eq: "${userId.escape()}" } }, limit: 500) {
                    id familiarity status
                    kanji { id character onyomi kunyomi meanings }
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val rows = result["data"]?.jsonObject?.get("userKanjis")?.jsonArray ?: return emptyList()
        return rows.mapNotNull { row ->
            val obj = row.jsonObject
            val kanji = obj["kanji"]?.jsonObject ?: return@mapNotNull null
            KanjiListItem(
                id = obj["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                kanjiMasterId = kanji["id"]?.jsonPrimitive?.content ?: "",
                character = kanji["character"]?.jsonPrimitive?.content ?: "",
                onyomi = kanji["onyomi"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                kunyomi = kanji["kunyomi"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                meanings = kanji["meanings"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                familiarity = obj["familiarity"]?.jsonPrimitive?.int ?: 0,
                status = obj["status"]?.jsonPrimitive?.content ?: "LEARNING",
            )
        }
    }

    suspend fun getUserWords(userId: String, query: String?, offset: Int, limit: Int): WordListResponse {
        val gql = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" } }, limit: 500) {
                    id word reading meaning familiarity nextReview
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(gql)
        val rows = result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: return WordListResponse(emptyList(), 0, false)

        var items = rows.mapNotNull { row ->
            val obj = row.jsonObject
            WordListItem(
                id = obj["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                word = obj["word"]?.jsonPrimitive?.content ?: "",
                reading = obj["reading"]?.jsonPrimitive?.content ?: "",
                meaning = obj["meaning"]?.jsonPrimitive?.content ?: "",
                familiarity = obj["familiarity"]?.jsonPrimitive?.int ?: 0,
                nextReview = obj["nextReview"]?.jsonPrimitive?.contentOrNull,
            )
        }.sortedBy { it.reading }

        // Filter by query if present (word, reading, or romaji match)
        if (!query.isNullOrBlank()) {
            val q = query.lowercase()
            items = items.filter { item ->
                item.word.contains(q) ||
                item.reading.contains(q) ||
                item.meaning.lowercase().contains(q) ||
                toRomaji(item.reading).contains(q)
            }
        }

        val total = items.size
        val paged = items.drop(offset).take(limit)
        return WordListResponse(paged, total, offset + limit < total)
    }

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
}

// Simple hiragana → romaji conversion
private val KANA_ROMAJI = mapOf(
    "あ" to "a", "い" to "i", "う" to "u", "え" to "e", "お" to "o",
    "か" to "ka", "き" to "ki", "く" to "ku", "け" to "ke", "こ" to "ko",
    "さ" to "sa", "し" to "shi", "す" to "su", "せ" to "se", "そ" to "so",
    "た" to "ta", "ち" to "chi", "つ" to "tsu", "て" to "te", "と" to "to",
    "な" to "na", "に" to "ni", "ぬ" to "nu", "ね" to "ne", "の" to "no",
    "は" to "ha", "ひ" to "hi", "ふ" to "fu", "へ" to "he", "ほ" to "ho",
    "ま" to "ma", "み" to "mi", "む" to "mu", "め" to "me", "も" to "mo",
    "や" to "ya", "ゆ" to "yu", "よ" to "yo",
    "ら" to "ra", "り" to "ri", "る" to "ru", "れ" to "re", "ろ" to "ro",
    "わ" to "wa", "を" to "wo", "ん" to "n",
    "が" to "ga", "ぎ" to "gi", "ぐ" to "gu", "げ" to "ge", "ご" to "go",
    "ざ" to "za", "じ" to "ji", "ず" to "zu", "ぜ" to "ze", "ぞ" to "zo",
    "だ" to "da", "ぢ" to "di", "づ" to "du", "で" to "de", "ど" to "do",
    "ば" to "ba", "び" to "bi", "ぶ" to "bu", "べ" to "be", "ぼ" to "bo",
    "ぱ" to "pa", "ぴ" to "pi", "ぷ" to "pu", "ぺ" to "pe", "ぽ" to "po",
    "きゃ" to "kya", "きゅ" to "kyu", "きょ" to "kyo",
    "しゃ" to "sha", "しゅ" to "shu", "しょ" to "sho",
    "ちゃ" to "cha", "ちゅ" to "chu", "ちょ" to "cho",
    "にゃ" to "nya", "にゅ" to "nyu", "にょ" to "nyo",
    "ひゃ" to "hya", "ひゅ" to "hyu", "ひょ" to "hyo",
    "みゃ" to "mya", "みゅ" to "myu", "みょ" to "myo",
    "りゃ" to "rya", "りゅ" to "ryu", "りょ" to "ryo",
    "ぎゃ" to "gya", "ぎゅ" to "gyu", "ぎょ" to "gyo",
    "じゃ" to "ja", "じゅ" to "ju", "じょ" to "jo",
    "びゃ" to "bya", "びゅ" to "byu", "びょ" to "byo",
    "ぴゃ" to "pya", "ぴゅ" to "pyu", "ぴょ" to "pyo",
    "っ" to "", // doubled consonant handled by context
    "ー" to "",
)

private fun toRomaji(hiragana: String): String {
    val sb = StringBuilder()
    var i = 0
    while (i < hiragana.length) {
        // Try two-char combinations first (for きゃ etc.)
        if (i + 1 < hiragana.length) {
            val two = hiragana.substring(i, i + 2)
            val r = KANA_ROMAJI[two]
            if (r != null) {
                sb.append(r)
                i += 2
                continue
            }
        }
        val one = hiragana[i].toString()
        val r = KANA_ROMAJI[one]
        if (r != null) {
            // Handle っ (double next consonant)
            if (one == "っ" && i + 1 < hiragana.length) {
                val next = KANA_ROMAJI[hiragana[i + 1].toString()]
                if (next != null && next.isNotEmpty()) {
                    sb.append(next[0])
                }
            } else {
                sb.append(r)
            }
        } else {
            sb.append(one) // pass through unknown chars
        }
        i++
    }
    return sb.toString()
}
