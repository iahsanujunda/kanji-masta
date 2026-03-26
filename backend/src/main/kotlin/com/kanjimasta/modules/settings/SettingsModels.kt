package com.kanjimasta.modules.settings

import kotlinx.serialization.Serializable

@Serializable
data class SettingsResponse(
    val quizAllowancePerSlot: Int,
    val slotDurationHours: Int,
    val onboardingComplete: Boolean,
)

@Serializable
data class UpdateSettingsRequest(
    val quizAllowancePerSlot: Int,
    val slotDurationHours: Int,
)
