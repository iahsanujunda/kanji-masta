package com.kanjimasta.modules.settings

import com.kanjimasta.core.db.DataConnectClient
import kotlinx.serialization.json.*

class SettingsRepository(private val dc: DataConnectClient) {

    private fun String.escape() = replace("\\", "\\\\").replace("\"", "\\\"")

    private fun JsonObject.dataOrNull(): JsonObject? {
        val d = get("data") ?: return null
        return if (d is JsonObject) d else null
    }

    suspend fun getSettings(userId: String): SettingsResponse {
        val query = """
            query {
                userSettings(key: { userId: "${userId.escape()}" }) {
                    quizAllowancePerSlot slotDurationHours
                }
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val el = result.dataOrNull()?.get("userSettings")
        val settings = if (el is JsonObject) el else null
        return SettingsResponse(
            quizAllowancePerSlot = settings?.get("quizAllowancePerSlot")?.jsonPrimitive?.int ?: 5,
            slotDurationHours = settings?.get("slotDurationHours")?.jsonPrimitive?.int ?: 6,
        )
    }

    suspend fun upsertSettings(userId: String, allowance: Int, duration: Int) {
        val query = """
            mutation {
                userSettings_upsert(data: {
                    userId: "${userId.escape()}",
                    quizAllowancePerSlot: $allowance,
                    slotDurationHours: $duration
                })
            }
        """.trimIndent()
        val result = dc.executeGraphql(query)
        val errors = result["errors"]?.jsonArray
        if (errors != null && errors.isNotEmpty()) {
            org.slf4j.LoggerFactory.getLogger("settings").error("Settings upsert failed: {}", errors)
        }
    }
}
