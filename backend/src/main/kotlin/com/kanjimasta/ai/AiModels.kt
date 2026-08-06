package com.kanjimasta.ai

import kotlinx.serialization.json.JsonArray

data class ActiveAiModelConfig(
    val version: Long,
    val photoAnalysisModel: String,
    val quizGenerationModel: String,
    val wordDiscoveryModel: String,
)

data class AiResult(
    val data: JsonArray,
    val costMicrodollars: Long,
    val model: String,
)

class AiProviderException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
