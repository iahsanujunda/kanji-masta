package com.kanjimasta.modules.quiz

import com.kanjimasta.core.db.DataConnectClient
import kotlinx.serialization.json.*

class QuizRepository(private val dc: DataConnectClient) {

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")

    // --- Slot ---

    suspend fun getActiveSlot(userId: String): JsonObject? {
        val query = """
            query {
                quizSlots(
                    where: { userId: { eq: "${userId.escape()}" } },
                    orderBy: { slotEnd: DESC },
                    limit: 1
                ) { id slotStart slotEnd completed allowance }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val slots = result["data"]?.jsonObject?.get("quizSlots")?.jsonArray ?: return null
        return slots.firstOrNull()?.jsonObject
    }

    suspend fun createSlot(userId: String, slotStart: String, slotEnd: String, allowance: Int): String? {
        val query = """
            mutation {
                quizSlot_insert(data: {
                    userId: "${userId.escape()}",
                    slotStart: "$slotStart",
                    slotEnd: "$slotEnd",
                    startedAt: "$slotStart",
                    allowance: $allowance
                })
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizSlot_insert")?.jsonObject?.get("id")?.jsonPrimitive?.content
    }

    suspend fun incrementSlotCompleted(slotId: String) {
        // Read current, then update
        val read = dc.executeGraphql("""query { quizSlot(id: "$slotId") { completed } }""")
        val current = read["data"]?.jsonObject?.get("quizSlot")?.jsonObject?.get("completed")?.jsonPrimitive?.int ?: 0
        dc.executeGraphql("""mutation { quizSlot_update(id: "$slotId", data: { completed: ${current + 1} }) }""")
    }

    // --- Settings ---

    suspend fun getUserSettings(userId: String): Pair<Int, Int> {
        val query = """
            query {
                userSettings(key: { userId: "${userId.escape()}" }) {
                    quizAllowancePerSlot slotDurationHours
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val settings = result["data"]?.jsonObject?.get("userSettings")?.jsonObject
        val allowance = settings?.get("quizAllowancePerSlot")?.jsonPrimitive?.int ?: 5
        val duration = settings?.get("slotDurationHours")?.jsonPrimitive?.int ?: 6
        return allowance to duration
    }

    // --- Word Selection ---

    suspend fun getOverdueWords(userId: String, limit: Int): JsonArray {
        val query = """
            query {
                userWordss(
                    where: { userId: { eq: "${userId.escape()}" }, nextReview: { lt: "${java.time.Instant.now()}" } },
                    orderBy: { nextReview: ASC },
                    limit: $limit
                ) { id word reading meaning familiarity currentTier kanjiIds }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: JsonArray(emptyList())
    }

    suspend fun getNewWords(userId: String, limit: Int): JsonArray {
        val query = """
            query {
                userWordss(
                    where: { userId: { eq: "${userId.escape()}" }, familiarity: { eq: 0 } },
                    limit: $limit
                ) { id word reading meaning familiarity currentTier kanjiIds }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: JsonArray(emptyList())
    }

    suspend fun getLearningWords(userId: String, limit: Int): JsonArray {
        val query = """
            query {
                userWordss(
                    where: { userId: { eq: "${userId.escape()}" } },
                    limit: $limit
                ) { id word reading meaning familiarity currentTier kanjiIds }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: JsonArray(emptyList())
    }

    // --- Quiz Lookup ---

    suspend fun getQuizForWord(userId: String, wordId: String, quizType: String): JsonObject? {
        val query = """
            query {
                quizBanks(
                    where: { userId: { eq: "${userId.escape()}" }, wordId: { eq: "$wordId" }, quizType: { eq: "$quizType" } },
                    limit: 1
                ) { id quizType prompt target furigana answer explanation servedCount wordId kanjiId }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizBanks")?.jsonArray?.firstOrNull()?.jsonObject
    }

    suspend fun getAnyQuizForWord(userId: String, wordId: String): JsonObject? {
        val query = """
            query {
                quizBanks(
                    where: { userId: { eq: "${userId.escape()}" }, wordId: { eq: "$wordId" } },
                    limit: 1
                ) { id quizType prompt target furigana answer explanation servedCount wordId kanjiId }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizBanks")?.jsonArray?.firstOrNull()?.jsonObject
    }

    // --- Distractor ---

    suspend fun getUnservedDistractor(quizId: String): JsonObject? {
        val query = """
            query {
                quizDistractors(
                    where: { quizId: { eq: "$quizId" }, servedAt: { isNull: true } },
                    orderBy: { generation: DESC },
                    limit: 1
                ) { id distractors generation }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizDistractors")?.jsonArray?.firstOrNull()?.jsonObject
    }

    suspend fun getLatestDistractor(quizId: String): JsonObject? {
        val query = """
            query {
                quizDistractors(
                    where: { quizId: { eq: "$quizId" } },
                    orderBy: { generation: DESC },
                    limit: 1
                ) { id distractors generation }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizDistractors")?.jsonArray?.firstOrNull()?.jsonObject
    }

    suspend fun markDistractorServed(distractorId: String) {
        dc.executeGraphql("""
            mutation { quizDistractor_update(id: "$distractorId", data: { servedAt_date: { today: true } }) }
        """.trimIndent())
    }

    // --- Random candidates for distractor augmentation ---

    suspend fun getRandomMeanings(limit: Int): List<String> {
        val query = """
            query { kanjiMasters(limit: $limit) { meanings } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("kanjiMasters")?.jsonArray
            ?.flatMap { it.jsonObject["meanings"]?.jsonArray?.map { m -> m.jsonPrimitive.content } ?: emptyList() }
            ?.shuffled()
            ?.take(limit * 2)
            ?: emptyList()
    }

    suspend fun getRandomReadings(limit: Int): List<String> {
        val query = """
            query { kanjiMasters(limit: $limit) { onyomi kunyomi } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("kanjiMasters")?.jsonArray
            ?.flatMap {
                val obj = it.jsonObject
                (obj["onyomi"]?.jsonArray?.map { r -> r.jsonPrimitive.content } ?: emptyList()) +
                (obj["kunyomi"]?.jsonArray?.map { r -> r.jsonPrimitive.content } ?: emptyList())
            }
            ?.shuffled()
            ?.take(limit * 2)
            ?: emptyList()
    }

    suspend fun getRandomCharacters(limit: Int): List<String> {
        val query = """
            query { kanjiMasters(limit: ${limit * 3}) { character } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("kanjiMasters")?.jsonArray
            ?.map { it.jsonObject["character"]!!.jsonPrimitive.content }
            ?.shuffled()
            ?.take(limit * 2)
            ?: emptyList()
    }

    suspend fun getRandomUserWords(userId: String, limit: Int): List<String> {
        val query = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" } }, limit: ${limit * 3}) { word }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("userWordss")?.jsonArray
            ?.map { it.jsonObject["word"]!!.jsonPrimitive.content }
            ?.shuffled()
            ?.take(limit * 2)
            ?: emptyList()
    }

    // --- Result submission ---

    suspend fun getQuizById(quizId: String): JsonObject? {
        val query = """
            query { quizBank(id: "$quizId") { id quizType prompt target answer wordId kanjiId servedCount } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("quizBank")?.jsonObject
    }

    suspend fun getWordById(wordId: String): JsonObject? {
        val query = """
            query { userWords(id: "$wordId") { id word familiarity currentTier kanjiIds } }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result["data"]?.jsonObject?.get("userWords")?.jsonObject
    }

    suspend fun incrementServedCount(quizId: String) {
        val read = dc.executeGraphql("""query { quizBank(id: "$quizId") { servedCount } }""")
        val current = read["data"]?.jsonObject?.get("quizBank")?.jsonObject?.get("servedCount")?.jsonPrimitive?.int ?: 0
        dc.executeGraphql("""mutation { quizBank_update(id: "$quizId", data: { servedCount: ${current + 1} }) }""")
    }

    suspend fun insertQuizServe(
        quizId: String, distractorSetId: String, slotId: String,
        userId: String, wordFamiliarityAtServe: Int, correct: Boolean,
    ) {
        val query = """
            mutation {
                quizServe_insert(data: {
                    quizId: "$quizId",
                    distractorSetId: "$distractorSetId",
                    slotId: "$slotId",
                    userId: "${userId.escape()}",
                    wordFamiliarityAtServe: $wordFamiliarityAtServe,
                    correct: $correct
                })
            }
        """.trimIndent()
        dc.executeGraphql(query)
    }

    suspend fun updateWordFamiliarity(wordId: String, familiarity: Int, currentTier: String, nextReview: String) {
        val query = """
            mutation {
                userWords_update(id: "$wordId", data: {
                    familiarity: $familiarity,
                    currentTier: $currentTier,
                    nextReview: "$nextReview"
                })
            }
        """.trimIndent()
        dc.executeGraphql(query)
    }

    suspend fun getWordsForKanji(userId: String, kanjiId: String): JsonArray {
        // Find all words that contain this kanji ID in their kanjiIds array
        val query = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" } }, limit: 100) {
                    id familiarity nextReview kanjiIds
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val allWords = result["data"]?.jsonObject?.get("userWordss")?.jsonArray ?: return JsonArray(emptyList())
        // Filter client-side for words containing this kanjiId
        val filtered = allWords.filter { word ->
            word.jsonObject["kanjiIds"]?.jsonArray?.any { it.jsonPrimitive.content == kanjiId } == true
        }
        return JsonArray(filtered)
    }

    suspend fun updateKanjiFamiliarity(userId: String, kanjiId: String, familiarity: Int, currentTier: String, nextReview: String?) {
        val nextReviewField = if (nextReview != null) """nextReview: "$nextReview",""" else ""
        // Find the UserKanji row for this user+kanji
        val find = dc.executeGraphql("""
            query {
                userKanjis(where: { userId: { eq: "${userId.escape()}" }, kanjiId: { eq: "$kanjiId" } }, limit: 1) { id }
            }
        """.trimIndent())
        val ukId = find["data"]?.jsonObject?.get("userKanjis")?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("id")?.jsonPrimitive?.content ?: return

        dc.executeGraphql("""
            mutation {
                userKanji_update(id: "$ukId", data: {
                    familiarity: $familiarity,
                    currentTier: $currentTier,
                    $nextReviewField
                })
            }
        """.trimIndent())
    }
}
