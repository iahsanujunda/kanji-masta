package com.kanjimasta.core.db

import com.google.auth.oauth2.GoogleCredentials
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory

class DataConnectClient(
    private val httpClient: HttpClient,
    private val baseUrl: String,
    private val useAuth: Boolean = false,
) {
    private val log = LoggerFactory.getLogger(DataConnectClient::class.java)

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

        val text = response.bodyAsText()
        val json = Json.parseToJsonElement(text).jsonObject
        if (!response.status.isSuccess()) {
            log.error("DataConnect HTTP {}: {}", response.status.value, text)
            throw RuntimeException("DataConnect request failed with HTTP ${response.status.value}")
        }
        if (json.containsKey("errors")) {
            log.error("DataConnect GraphQL errors: {}", json["errors"])
        }
        return json
    }
}
