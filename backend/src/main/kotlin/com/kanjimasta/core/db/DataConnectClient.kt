package com.kanjimasta.core.db

import com.google.auth.oauth2.GoogleCredentials
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*

class DataConnectClient(
    private val httpClient: HttpClient,
    private val baseUrl: String,
    private val useAuth: Boolean = false,
) {
    private val credentials: GoogleCredentials? = if (useAuth) {
        GoogleCredentials.getApplicationDefault()
            .createScoped("https://www.googleapis.com/auth/firebase.dataconnect")
    } else null

    suspend fun executeGraphql(query: String, variables: JsonObject? = null): JsonObject {
        val body = buildJsonObject {
            put("query", query)
            if (variables != null) put("variables", variables)
        }

        val response = httpClient.post(baseUrl) {
            contentType(ContentType.Application.Json)
            if (credentials != null) {
                credentials.refreshIfExpired()
                header("Authorization", "Bearer ${credentials.accessToken.tokenValue}")
            }
            setBody(body.toString())
        }

        return Json.parseToJsonElement(response.bodyAsText()).jsonObject
    }
}
