package com.kanjimasta.ai

import kotlinx.serialization.json.JsonArray

data class ActiveAiModelConfig(
    val version: Long,
    val photoAnalysisModel: String,
    val quizGenerationModel: String,
    val wordDiscoveryModel: String,
    val translationModel: String,
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
) : RuntimeException(message, cause)
