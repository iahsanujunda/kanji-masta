package com.kanjimasta.settings

import com.kanjimasta.db.InviteStatus
import com.kanjimasta.db.UserInviteTable
import com.kanjimasta.db.UserSettingsTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.insertOrUpdate
import org.slf4j.LoggerFactory
import java.time.LocalDate


private val logger = LoggerFactory.getLogger("com.kanjimasta.settings.SettingsRepository")

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
                    birthDate = r[UserSettingsTable.birthDate]?.toString(),
                )
            }
            .firstOrNull()
        return row ?: SettingsResponse(quizAllowancePerSlot = 5, slotDurationHours = 6, onboardingComplete = false)
    }

    fun ensureUserInitialized(email: String?, userId: String) {
        if (hasSettings(userId)) return
        if (email.isNullOrBlank()) return
        db.useTransaction {
            db.update(UserInviteTable) {
                set(it.status, InviteStatus.ACCEPTED)
                set(it.acceptedAt, java.time.Instant.now())
                where { (it.email eq email) and (it.status eq InviteStatus.PENDING) }
            }
            db.insertOrUpdate(UserSettingsTable) {
                set(it.userId, userId)
                onConflict(it.userId) {
                    set(it.userId, userId)
                }
            }
        }
        logger.info("Initialized invited user: userId={} email={}", userId, email)
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

    fun upsertSettings(userId: String, allowance: Int?, duration: Int?, birthDate: String?) {
        val updated = db.update(UserSettingsTable) {
            if (allowance != null) set(it.quizAllowancePerSlot, allowance)
            if (duration != null) set(it.slotDurationHours, duration)
            if (birthDate != null) set(it.birthDate, LocalDate.parse(birthDate))
            where { it.userId eq userId }
        }
        if (updated == 0) {
            db.insert(UserSettingsTable) {
                set(it.userId, userId)
                if (allowance != null) set(it.quizAllowancePerSlot, allowance)
                if (duration != null) set(it.slotDurationHours, duration)
                if (birthDate != null) set(it.birthDate, LocalDate.parse(birthDate))
            }
        }
    }
}
