package com.kanjimasta.modules.kanji

import com.kanjimasta.core.db.DataConnectClient
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.kanji.KanjiRepository")

class KanjiRepository(val dc: DataConnectClient) {

    // --- UserKanji ---

    suspend fun insertUserKanji(userId: String, kanjiMasterId: String, status: String, sourcePhotoId: String?) {
        val photoIdField = if (sourcePhotoId != null) """sourcePhotoId: "$sourcePhotoId",""" else ""
        val isFamiliar = status.uppercase() == "FAMILIAR"
        val familiarityField = if (isFamiliar) "familiarity: 5, currentTier: FILL_IN_THE_BLANK," else ""
        val query = """
            mutation {
                userKanji_insert(data: {
                    userId: "${userId.escape()}",
                    kanjiId: "$kanjiMasterId",
                    status: ${status.uppercase()},
                    $familiarityField
                    $photoIdField
                })
            }
        """.trimIndent()
        dc.executeGraphql(query)
    }

    // --- WordMaster ---

    suspend fun findWordMasterByWord(word: String): String? {
        val query = """
            query {
                wordMasters(where: { word: { eq: "${word.escape()}" } }, limit: 1) { id }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("wordMasters")?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("id")?.jsonPrimitive?.content
    }

    suspend fun findOrCreateWordMaster(word: String, reading: String, meaning: String, kanjiMasterId: String): String {
        val existing = findWordMasterByWord(word)
        if (existing != null) return existing

        val meaningsJson = buildJsonArray { add(meaning) }
        val query = """
            mutation {
                wordMaster_insert(data: {
                    word: "${word.escape()}",
                    reading: "${reading.escape()}",
                    meanings: $meaningsJson,
                    kanjiIds: ["$kanjiMasterId"]
                })
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("wordMaster_insert")?.jsonObject?.get("id")?.jsonPrimitive?.content
            ?: throw RuntimeException("Failed to create WordMaster for '$word'")
    }

    suspend fun getWordMasterById(id: String): JsonObject? {
        val query = """
            query { wordMaster(id: "$id") { id word reading meanings kanjiIds } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val el = result["data"]?.jsonObject?.get("wordMaster")
        return if (el is JsonObject) el else null
    }

    suspend fun getWordMastersForKanji(kanjiMasterId: String): List<WordMasterItem> {
        // WordMaster stores kanjiIds as array — fetch all and filter client-side
        val query = """
            query { wordMasters(limit: 200) { id word reading meanings kanjiIds } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val all = result["data"]?.jsonObject?.get("wordMasters")?.jsonArray ?: return emptyList()
        return all.mapNotNull { row ->
            val obj = row.jsonObject
            val ids = obj["kanjiIds"]?.jsonArray?.map { it.jsonPrimitive.content } ?: return@mapNotNull null
            if (kanjiMasterId !in ids) return@mapNotNull null
            WordMasterItem(
                id = obj["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                word = obj["word"]?.jsonPrimitive?.content ?: "",
                reading = obj["reading"]?.jsonPrimitive?.content ?: "",
                meaning = obj["meanings"]?.jsonArray?.firstOrNull()?.jsonPrimitive?.content ?: "",
            )
        }
    }

    // --- UserWords ---

    suspend fun insertUserWord(userId: String, wordMasterId: String, kanjiMasterId: String, source: String = "PHOTO"): String? {
        val query = """
            mutation {
                userWords_insert(data: {
                    userId: "${userId.escape()}",
                    wordMasterId: "$wordMasterId",
                    kanjiIds: ["$kanjiMasterId"],
                    source: $source,
                    unlocked: true
                })
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        if (result["errors"]?.jsonArray?.isNotEmpty() == true) {
            logger.debug("UserWord insert issue: {}", result["errors"])
            return null
        }
        return result["data"]?.jsonObject?.get("userWords_insert")?.jsonObject?.get("id")?.jsonPrimitive?.content
    }

    suspend fun findUserWordByWordMaster(userId: String, wordMasterId: String): String? {
        val query = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" }, wordMasterId: { eq: "$wordMasterId" } }, limit: 1) { id }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("userWordss")?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("id")?.jsonPrimitive?.content
    }

    // --- Global Quiz Check ---

    suspend fun hasGlobalQuizzes(wordMasterId: String): Boolean {
        val query = """
            query {
                quizBanks(where: { wordId: { eq: "$wordMasterId" }, userId: { isNull: true } }, limit: 1) { id }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val rows = result["data"]?.jsonObject?.get("quizBanks")?.jsonArray
        return rows != null && rows.isNotEmpty()
    }

    // --- QuizGenerationJob ---

    suspend fun insertQuizGenerationJob(userId: String, kanjiMasterId: String, wordMasterId: String? = null) {
        val wmField = if (wordMasterId != null) """wordMasterId: "$wordMasterId",""" else ""
        val query = """
            mutation {
                quizGenerationJob_insert(data: {
                    userId: "${userId.escape()}",
                    kanjiId: "$kanjiMasterId",
                    $wmField
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

    // --- Onboarding ---

    suspend fun getOnboardingKanji(userId: String, offset: Int, limit: Int): Pair<List<OnboardingKanjiItem>, Boolean> {
        val fetchLimit = offset + limit + 1
        val query = """
            query {
                kanjiMasters(
                    where: { jlpt: { in: [5, 4] } },
                    orderBy: [{ frequency: ASC }],
                    limit: $fetchLimit
                ) { id character onyomi kunyomi meanings jlpt frequency }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val allKanji = result["data"]?.jsonObject?.get("kanjiMasters")?.jsonArray ?: return emptyList<OnboardingKanjiItem>() to false

        val userKanjiQuery = """
            query {
                userKanjis(where: { userId: { eq: "${userId.escape()}" } }, limit: 1000) { kanjiId }
            }
        """.trimIndent()
        val userResult = dc.executeGraphql(userKanjiQuery)
        val existingIds = userResult["data"]?.jsonObject?.get("userKanjis")?.jsonArray
            ?.mapNotNull { it.jsonObject["kanjiId"]?.jsonPrimitive?.contentOrNull }
            ?.toSet() ?: emptySet()

        val available = allKanji.filter { row ->
            val id = row.jsonObject["id"]?.jsonPrimitive?.content ?: ""
            id !in existingIds
        }

        val paged = available.drop(offset).take(limit)
        val hasMore = available.size > offset + limit

        val items = paged.map { row ->
            val obj = row.jsonObject
            val kmId = obj["id"]?.jsonPrimitive?.content ?: ""
            val wm = getWordMastersForKanji(kmId).firstOrNull()
            OnboardingKanjiItem(
                kanjiMasterId = kmId,
                character = obj["character"]?.jsonPrimitive?.content ?: "",
                onyomi = obj["onyomi"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                kunyomi = obj["kunyomi"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                meanings = obj["meanings"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                jlpt = obj["jlpt"]?.jsonPrimitive?.intOrNull,
                frequency = obj["frequency"]?.jsonPrimitive?.intOrNull,
                seenAs = wm?.let { SeenAs(word = it.word, reading = it.reading, meaning = it.meaning) },
            )
        }

        return items to hasMore
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

    suspend fun getUserWords(userId: String, searchQuery: String?, offset: Int, limit: Int): WordListResponse {
        // Fetch UserWords joined with WordMaster
        val gql = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" } }, limit: 500) {
                    id familiarity nextReview
                    wordMaster { word reading meanings }
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(gql)
        val rows = result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: return WordListResponse(emptyList(), 0, false)

        var items = rows.mapNotNull { row ->
            val obj = row.jsonObject
            val wm = obj["wordMaster"]?.jsonObject ?: return@mapNotNull null
            WordListItem(
                id = obj["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                word = wm["word"]?.jsonPrimitive?.content ?: "",
                reading = wm["reading"]?.jsonPrimitive?.content ?: "",
                meaning = wm["meanings"]?.jsonArray?.firstOrNull()?.jsonPrimitive?.content ?: "",
                familiarity = obj["familiarity"]?.jsonPrimitive?.int ?: 0,
                nextReview = obj["nextReview"]?.jsonPrimitive?.contentOrNull,
            )
        }.sortedBy { it.reading }

        if (!searchQuery.isNullOrBlank()) {
            val q = searchQuery.lowercase()
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

data class WordMasterItem(val id: String, val word: String, val reading: String, val meaning: String)

data class ExampleWord(val word: String, val reading: String, val meaning: String)

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
    "っ" to "", "ー" to "",
)

private fun toRomaji(hiragana: String): String {
    val sb = StringBuilder()
    var i = 0
    while (i < hiragana.length) {
        if (i + 1 < hiragana.length) {
            val two = hiragana.substring(i, i + 2)
            val r = KANA_ROMAJI[two]
            if (r != null) { sb.append(r); i += 2; continue }
        }
        val one = hiragana[i].toString()
        val r = KANA_ROMAJI[one]
        if (r != null) {
            if (one == "っ" && i + 1 < hiragana.length) {
                val next = KANA_ROMAJI[hiragana[i + 1].toString()]
                if (next != null && next.isNotEmpty()) sb.append(next[0])
            } else sb.append(r)
        } else sb.append(one)
        i++
    }
    return sb.toString()
}
