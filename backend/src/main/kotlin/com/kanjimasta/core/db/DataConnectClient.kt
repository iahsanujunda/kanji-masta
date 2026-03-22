package com.kanjimasta.core.db

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*

class DataConnectClient(
    private val httpClient: HttpClient,
    private val baseUrl: String,
) {
    suspend fun executeGraphql(query: String, variables: JsonObject? = null): JsonObject {
        val body = buildJsonObject {
            put("query", query)
            if (variables != null) put("variables", variables)
        }

        val response = httpClient.post(baseUrl) {
            contentType(ContentType.Application.Json)
            setBody(body.toString())
        }

        return Json.parseToJsonElement(response.bodyAsText()).jsonObject
    }
}
