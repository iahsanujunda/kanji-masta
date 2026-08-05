package com.kanjimasta.core.ai

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class ModelCatalogException : RuntimeException("catalog_unavailable")

class OpenRouterCatalogClient(
    private val httpClient: HttpClient,
    private val apiKey: String,
    private val baseUrl: String = "https://openrouter.ai",
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ModelCatalogGateway {
    private val cacheMutex = Mutex()
    private var cachedAt = 0L
    private var cachedModels: List<CatalogModel>? = null

    override suspend fun search(workload: String, query: String?): List<CatalogModel> {
        val needle = query?.trim()?.lowercase().orEmpty()
        return getCatalog()
            .asSequence()
            .filter { it.supports(workload) }
            .filter { needle.isEmpty() || it.id.lowercase().contains(needle) || it.name.lowercase().contains(needle) }
            .take(50)
            .toList()
    }

    override suspend fun validate(models: Map<String, String>): ModelValidationResult {
        val catalog = runCatching { getCatalog() }.getOrElse {
            return ModelValidationResult(false, "catalog_unavailable")
        }
        for (workload in REQUIRED_WORKLOADS) {
            val modelId = models[workload] ?: return ModelValidationResult(false, "incomplete_config")
            val model = catalog.firstOrNull { it.id == modelId }
                ?: return ModelValidationResult(false, "model_unavailable")
            if (!model.supports(workload)) return ModelValidationResult(false, "unsupported_model")
        }
        return ModelValidationResult(true)
    }

    private suspend fun getCatalog(): List<CatalogModel> = cacheMutex.withLock {
        val cached = cachedModels
        if (cached != null && nowMillis() - cachedAt < CACHE_MILLIS) return@withLock cached
        if (apiKey.isBlank()) throw ModelCatalogException()
        val response = runCatching {
            httpClient.get("${baseUrl.trimEnd('/')}/api/v1/models/user") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
            }
        }.getOrElse { throw ModelCatalogException() }
        if (!response.status.isSuccess()) throw ModelCatalogException()
        val models = runCatching { parseModels(response.bodyAsText()) }
            .getOrElse { throw ModelCatalogException() }
        cachedModels = models
        cachedAt = nowMillis()
        models
    }

    private fun parseModels(body: String): List<CatalogModel> =
        Json.parseToJsonElement(body).jsonObject["data"]!!.jsonArray.map { element ->
            val item = element.jsonObject
            val architecture = item.objectOrEmpty("architecture")
            val pricing = item.objectOrEmpty("pricing")
            val reasoning = item.objectOrEmpty("reasoning")
            CatalogModel(
                id = item.string("id"),
                canonicalSlug = item.stringOrNull("canonical_slug") ?: item.string("id"),
                name = item.stringOrNull("name") ?: item.string("id"),
                inputModalities = architecture.stringList("input_modalities"),
                outputModalities = architecture.stringList("output_modalities"),
                contextLength = item["context_length"]?.jsonPrimitive?.intOrNull,
                supportedParameters = item.stringList("supported_parameters"),
                reasoningEfforts = reasoning.stringList("supported_efforts"),
                promptPrice = pricing.stringOrNull("prompt"),
                completionPrice = pricing.stringOrNull("completion"),
            )
        }

    private fun CatalogModel.supports(workload: String): Boolean {
        val requiredInputs = if (workload == "photo_analysis") setOf("text", "image") else setOf("text")
        val supportsStructuredResponse = supportedParameters.any {
            it == "structured_outputs" || it == "response_format"
        }
        val supportsMediumReasoning = "reasoning" in supportedParameters &&
            (reasoningEfforts.isEmpty() || "medium" in reasoningEfforts)
        return inputModalities.containsAll(requiredInputs) &&
            "text" in outputModalities &&
            supportsStructuredResponse &&
            supportsMediumReasoning
    }

    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content
    private fun JsonObject.stringOrNull(key: String): String? = get(key)?.jsonPrimitive?.contentOrNull
    private fun JsonObject.stringList(key: String): List<String> =
        get(key)?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty()
    private fun JsonObject.objectOrEmpty(key: String): JsonObject = get(key)?.jsonObject ?: JsonObject(emptyMap())

    private companion object {
        const val CACHE_MILLIS = 10 * 60 * 1000L
        val REQUIRED_WORKLOADS = listOf("photo_analysis", "quiz_generation", "word_discovery")
    }
}
