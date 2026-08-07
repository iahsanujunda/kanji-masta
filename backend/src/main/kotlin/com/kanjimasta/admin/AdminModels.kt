package com.kanjimasta.admin

import com.kanjimasta.ai.CatalogModel
import com.kanjimasta.ai.ModelSelection
import kotlinx.serialization.Serializable

@Serializable
data class ModelsResponse(val models: List<CatalogModel>)

@Serializable
data class ModelConfigRequest(
    val photoAnalysisModel: String,
    val photoAnalysisReasoning: String,
    val quizGenerationModel: String,
    val quizGenerationReasoning: String,
    val wordDiscoveryModel: String,
    val wordDiscoveryReasoning: String,
    val translationModel: String = wordDiscoveryModel,
    val translationReasoning: String = wordDiscoveryReasoning,
) {
    fun asSelections(): Map<String, ModelSelection> = mapOf(
        "photo_analysis" to ModelSelection(photoAnalysisModel, photoAnalysisReasoning),
        "quiz_generation" to ModelSelection(quizGenerationModel, quizGenerationReasoning),
        "word_discovery" to ModelSelection(wordDiscoveryModel, wordDiscoveryReasoning),
        "translation" to ModelSelection(translationModel, translationReasoning),
    )
}

@Serializable
data class ModelConfigItem(
    val version: Long,
    val status: String,
    val photoAnalysisModel: String,
    val photoAnalysisReasoning: String,
    val quizGenerationModel: String,
    val quizGenerationReasoning: String,
    val wordDiscoveryModel: String,
    val wordDiscoveryReasoning: String,
    val translationModel: String,
    val translationReasoning: String,
    val validationStatus: String,
    val failureCode: String? = null,
    val createdBy: String,
    val createdAt: String,
    val validatedAt: String? = null,
    val activatedAt: String? = null,
)

@Serializable
data class ModelConfigsResponse(val configs: List<ModelConfigItem>)

@Serializable
data class AdminStatusResponse(val status: String, val checkedAt: String)

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
    val type: String,
    val status: String,
    val stale: Boolean,
    val attempts: Int,
    val maxAttempts: Int,
    val userId: String,
    val summary: String,
    val kanji: String? = null,
    val word: String? = null,
    val costMicrodollars: Long?,
    val createdAt: String,
    val updatedAt: String,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val failureCode: String? = null,
    val modelId: String? = null,
    val modelConfigVersion: Long? = null,
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
data class JobAttemptItem(
    val id: String,
    val attemptNumber: Int,
    val status: String,
    val trigger: String,
    val modelConfigVersion: Long? = null,
    val modelId: String? = null,
    val failureCode: String? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val createdBy: String,
    val createdAt: String,
)

@Serializable
data class JobDetailResponse(
    val job: JobItem,
    val attempts: List<JobAttemptItem>,
)

sealed interface JobCommandResult {
    data class Applied(val job: JobItem) : JobCommandResult
    data object NotFound : JobCommandResult
    data object Conflict : JobCommandResult
}

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
