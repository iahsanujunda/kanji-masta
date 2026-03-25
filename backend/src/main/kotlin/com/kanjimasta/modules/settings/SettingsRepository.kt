package com.kanjimasta.modules.settings

import com.kanjimasta.core.db.UserSettingsTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.slf4j.LoggerFactory
import java.time.Instant

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.settings.SettingsRepository")

class SettingsRepository(private val db: Database) {

    fun getSettings(userId: String): SettingsResponse {
        val row = db.from(UserSettingsTable)
            .select()
            .where { UserSettingsTable.userId eq userId }
            .map { r ->
                SettingsResponse(
                    quizAllowancePerSlot = r[UserSettingsTable.quizAllowancePerSlot] ?: 5,
                    slotDurationHours = r[UserSettingsTable.slotDurationHours] ?: 6,
                )
            }
            .firstOrNull()
        return row ?: SettingsResponse(quizAllowancePerSlot = 5, slotDurationHours = 6)
    }

    fun upsertSettings(userId: String, allowance: Int, duration: Int) {
        val updated = db.update(UserSettingsTable) {
            set(it.quizAllowancePerSlot, allowance)
            set(it.slotDurationHours, duration)
            set(it.updatedAt, Instant.now())
            where { it.userId eq userId }
        }
        if (updated == 0) {
            db.insert(UserSettingsTable) {
                set(it.userId, userId)
                set(it.quizAllowancePerSlot, allowance)
                set(it.slotDurationHours, duration)
            }
        }
    }
}
