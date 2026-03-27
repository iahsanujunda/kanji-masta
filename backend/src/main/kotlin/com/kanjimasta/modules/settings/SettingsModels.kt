package com.kanjimasta.modules.settings

import kotlinx.serialization.Serializable

@Serializable
data class SettingsResponse(
    val quizAllowancePerSlot: Int,
    val slotDurationHours: Int,
    val onboardingComplete: Boolean,
    val birthDate: String? = null,
)

@Serializable
data class UpdateSettingsRequest(
    val quizAllowancePerSlot: Int? = null,
    val slotDurationHours: Int? = null,
    val birthDate: String? = null,
)
