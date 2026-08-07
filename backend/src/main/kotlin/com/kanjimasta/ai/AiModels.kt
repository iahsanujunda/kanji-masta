package com.kanjimasta.ai

import kotlinx.serialization.json.JsonArray

data class ActiveAiModelConfig(
    val version: Long,
    val photoAnalysisModel: String,
    val photoAnalysisReasoning: String,
    val quizGenerationModel: String,
    val quizGenerationReasoning: String,
    val wordDiscoveryModel: String,
    val wordDiscoveryReasoning: String,
    val translationModel: String,
    val translationReasoning: String,
)

data class AiResult(
    val data: JsonArray,
    val costMicrodollars: Long,
    val model: String,
)

enum class AiProviderFailure {
    CONFIGURATION,
    TIMEOUT,
    HTTP,
    INVALID_RESPONSE,
}

class AiProviderException(
    message: String,
    cause: Throwable? = null,
    val failure: AiProviderFailure = AiProviderFailure.HTTP,
    val statusCode: Int? = null,
    val generationId: String? = null,
    val costMicrodollars: Long = 0,
) : RuntimeException(message, cause)
