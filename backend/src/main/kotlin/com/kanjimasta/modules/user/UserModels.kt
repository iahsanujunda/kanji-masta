package com.kanjimasta.modules.user

import kotlinx.serialization.Serializable

@Serializable
data class UserSummaryResponse(
    val kanjiLearning: Int,
    val kanjiFamiliar: Int,
    val wordCount: Int,
    val streak: Int,
    val slotRemaining: Int,
    val slotTotal: Int,
    val slotEndsAt: String? = null,
    val onboardingComplete: Boolean = false,
)
