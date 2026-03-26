package com.kanjimasta.modules.settings

import com.kanjimasta.core.db.UserSettingsTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.slf4j.LoggerFactory


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
                    onboardingComplete = r[UserSettingsTable.onboardingComplete] ?: false,
                )
            }
            .firstOrNull()
        return row ?: SettingsResponse(quizAllowancePerSlot = 5, slotDurationHours = 6, onboardingComplete = false)
    }

    fun hasSettings(userId: String): Boolean {
        return db.from(UserSettingsTable)
            .select(UserSettingsTable.userId)
            .where { UserSettingsTable.userId eq userId }
            .totalRecordsInAllPages > 0
    }

    fun markOnboardingComplete(userId: String) {
        val updated = db.update(UserSettingsTable) {
            set(it.onboardingComplete, true)
            where { it.userId eq userId }
        }
        if (updated == 0) {
            db.insert(UserSettingsTable) {
                set(it.userId, userId)
                set(it.onboardingComplete, true)
            }
        }
    }

    fun upsertSettings(userId: String, allowance: Int, duration: Int) {
        val updated = db.update(UserSettingsTable) {
            set(it.quizAllowancePerSlot, allowance)
            set(it.slotDurationHours, duration)
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
