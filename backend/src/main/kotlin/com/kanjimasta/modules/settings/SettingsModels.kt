package com.kanjimasta.modules.settings

import kotlinx.serialization.Serializable

@Serializable
data class SettingsResponse(
    val quizAllowancePerSlot: Int,
    val slotDurationHours: Int,
)

@Serializable
data class UpdateSettingsRequest(
    val quizAllowancePerSlot: Int,
    val slotDurationHours: Int,
)
