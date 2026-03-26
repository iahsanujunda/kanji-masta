package com.kanjimasta.modules.internal

import kotlinx.serialization.Serializable

@Serializable
data class PhotoResultRequest(
    val sessionId: String,
    val userId: String,
    val enrichedKanji: String,
    val costMicrodollars: Long,
)

@Serializable
data class QuizResultItem(
    val kanjiId: String,
    val wordMasterId: String,
    val quizType: String,
    val prompt: String,
    val target: String,
    val answer: String,
    val explanation: String? = null,
    val furigana: String? = null,
    val distractors: List<String> = emptyList(),
)

@Serializable
data class QuizResultRequest(
    val jobId: String,
    val userId: String,
    val status: String,
    val costMicrodollars: Long,
    val operationType: String = "QUIZ_GENERATION",
    val quizzes: List<QuizResultItem> = emptyList(),
)

@Serializable
data class JobStatusRequest(
    val jobId: String,
    val status: String,
    val incrementAttempts: Boolean = false,
)
