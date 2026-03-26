package com.kanjimasta.modules.admin

import kotlinx.serialization.Serializable

@Serializable
data class CostByUser(
    val userId: String,
    val photoMicrodollars: Long,
    val quizGenMicrodollars: Long,
    val totalMicrodollars: Long,
)

@Serializable
data class CostByDay(
    val date: String,
    val totalMicrodollars: Long,
)

@Serializable
data class CostResponse(
    val totalMicrodollars: Long,
    val totalDollars: String,
    val byUser: List<CostByUser>,
    val byDay: List<CostByDay>,
)

@Serializable
data class JobItem(
    val id: String,
    val status: String,
    val attempts: Int,
    val kanji: String,
    val word: String?,
    val userId: String,
    val costMicrodollars: Long?,
    val createdAt: String,
)

@Serializable
data class JobCounts(
    val pending: Int,
    val processing: Int,
    val done: Int,
    val failed: Int,
)

@Serializable
data class JobsResponse(
    val jobs: List<JobItem>,
    val counts: JobCounts,
)

@Serializable
data class QuizItem(
    val id: String,
    val kanji: String,
    val word: String,
    val quizType: String,
    val prompt: String,
    val answer: String,
    val servedCount: Int,
)

@Serializable
data class QuizzesResponse(
    val quizzes: List<QuizItem>,
    val total: Int,
)
