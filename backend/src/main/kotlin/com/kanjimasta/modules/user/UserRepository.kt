package com.kanjimasta.modules.user

import com.kanjimasta.core.db.DataConnectClient
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class UserRepository(private val dc: DataConnectClient) {

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"")

    private fun JsonObject.dataOrNull(): JsonObject? {
        val d = get("data") ?: return null
        return if (d is JsonObject) d else null
    }

    suspend fun getKanjiCounts(userId: String): Pair<Int, Int> {
        val query = """
            query {
                userKanjis(where: { userId: { eq: "${userId.escape()}" } }, limit: 1000) {
                    status
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val rows = result.dataOrNull()?.get("userKanjis")?.jsonArray ?: return 0 to 0
        val learning = rows.count { it.jsonObject["status"]?.jsonPrimitive?.content == "LEARNING" }
        val familiar = rows.count { it.jsonObject["status"]?.jsonPrimitive?.content == "FAMILIAR" }
        return learning to familiar
    }

    suspend fun getWordCount(userId: String): Int {
        val query = """
            query {
                userWordss(where: { userId: { eq: "${userId.escape()}" } }, limit: 1000) { id }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        return result.dataOrNull()?.get("userWordss")?.jsonArray?.size ?: 0
    }

    suspend fun getStreak(userId: String): Int {
        val query = """
            query {
                quizSlots(
                    where: { userId: { eq: "${userId.escape()}" } },
                    orderBy: { slotStart: DESC },
                    limit: 100
                ) { slotStart completed }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val slots = result.dataOrNull()?.get("quizSlots")?.jsonArray ?: return 0

        val zone = ZoneId.of("Asia/Tokyo")
        val today = LocalDate.now(zone)
        var streak = 0
        var expectedDate = today

        // Group slots by date, check consecutive days with completed > 0
        val dateHasActivity = mutableSetOf<LocalDate>()
        for (slot in slots) {
            val completed = slot.jsonObject["completed"]?.jsonPrimitive?.int ?: 0
            if (completed > 0) {
                val startStr = slot.jsonObject["slotStart"]?.jsonPrimitive?.content ?: continue
                val date = try {
                    Instant.parse(startStr).atZone(zone).toLocalDate()
                } catch (_: Exception) { continue }
                dateHasActivity.add(date)
            }
        }

        while (dateHasActivity.contains(expectedDate)) {
            streak++
            expectedDate = expectedDate.minusDays(1)
        }
        return streak
    }
}
