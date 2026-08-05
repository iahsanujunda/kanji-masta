package com.kanjimasta.core.ai

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
    val promptPrice: String? = null,
    val completionPrice: String? = null,
)

data class ModelValidationResult(
    val valid: Boolean,
    val failureCode: String? = null,
)

interface ModelCatalogGateway {
    suspend fun search(workload: String, query: String?): List<CatalogModel>
    suspend fun validate(models: Map<String, String>): ModelValidationResult
}

object UnavailableModelCatalogGateway : ModelCatalogGateway {
    override suspend fun search(workload: String, query: String?): List<CatalogModel> = emptyList()

    override suspend fun validate(models: Map<String, String>): ModelValidationResult =
        ModelValidationResult(valid = false, failureCode = "catalog_unavailable")
}
