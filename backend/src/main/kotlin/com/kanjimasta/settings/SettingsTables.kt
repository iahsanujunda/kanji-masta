package com.kanjimasta.settings

import com.kanjimasta.db.*
import org.ktorm.schema.*

object UserSettingsTable : Table<Nothing>("user_settings") {
    val userId = text("user_id").primaryKey()
    val quizAllowancePerSlot = int("quiz_allowance_per_slot")
    val slotDurationHours = int("slot_duration_hours")
    val timezone = text("timezone")
    val onboardingComplete = boolean("onboarding_complete")
    val birthDate = date("birth_date")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}
