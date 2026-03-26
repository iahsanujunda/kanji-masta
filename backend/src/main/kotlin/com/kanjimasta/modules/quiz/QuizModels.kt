package com.kanjimasta.modules.quiz

import kotlinx.serialization.Serializable

@Serializable
data class SlotResponse(
    val quizzes: List<QuizItem>,
    val remaining: Int,
    val slotEndsAt: String? = null,
)

@Serializable
data class QuizItem(
    val id: String,
    val quizType: String,
    val word: String,
    val wordReading: String,
    val prompt: String,
    val target: String,
    val furigana: String? = null,
    val answer: String,
    val options: List<String>,
    val explanation: String? = null,
    val wordFamiliarity: Int,
    val currentTier: String,
    val kanjiId: String,
)

@Serializable
data class SubmitResultRequest(
    val quizId: String,
    val correct: Boolean,
)

@Serializable
data class ResultResponse(
    val remaining: Int,
    val correct: Boolean,
    val newFamiliarity: Int,
    val slotComplete: Boolean = false,
)
