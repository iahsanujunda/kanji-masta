package com.kanjimasta.ai

import kotlinx.serialization.Serializable

@Serializable
data class CatalogModel(
    val id: String,
    val canonicalSlug: String,
    val name: String,
    val inputModalities: List<String>,
    val outputModalities: List<String>,
    val contextLength: Int? = null,
    val supportedParameters: List<String> = emptyList(),
    val reasoningEfforts: List<String> = emptyList(),
    val defaultReasoningEffort: String? = null,
    val promptPrice: String? = null,
    val completionPrice: String? = null,
)

data class ModelSelection(
    val modelId: String,
    val reasoningEffort: String,
)

data class ModelValidationResult(
    val valid: Boolean,
    val failureCode: String? = null,
)

interface ModelCatalogGateway {
    suspend fun search(workload: String, query: String?): List<CatalogModel>
    suspend fun validate(selections: Map<String, ModelSelection>): ModelValidationResult
}

object UnavailableModelCatalogGateway : ModelCatalogGateway {
    override suspend fun search(workload: String, query: String?): List<CatalogModel> = emptyList()

    override suspend fun validate(selections: Map<String, ModelSelection>): ModelValidationResult =
        ModelValidationResult(valid = false, failureCode = "catalog_unavailable")
}

val SUPPORTED_REASONING_EFFORTS = setOf("none", "minimal", "low", "medium", "high", "xhigh", "max")
