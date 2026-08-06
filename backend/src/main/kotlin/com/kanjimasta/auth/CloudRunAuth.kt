package com.kanjimasta.auth

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.auth.CloudRunAuth")

/**
 * Fetches a Google Cloud identity token for service-to-service auth.
 * Uses the metadata server when running on Cloud Run.
 * Returns null in local dev (metadata server not available).
 */
suspend fun getIdentityToken(httpClient: HttpClient, audience: String): String? {
    return try {
        val url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=$audience"
        val response = httpClient.get(url) {
            header("Metadata-Flavor", "Google")
        }
        response.bodyAsText()
    } catch (e: Exception) {
        // Expected in local dev — metadata server not available
        logger.debug("Identity token fetch failed (expected in local dev): {}", e.message)
        null
    }
}

/**
 * Fetches an OAuth access token for Google Cloud APIs from the Cloud Run metadata server.
 * Returns null outside Google Cloud so local development can use the HTTP worker fallback.
 */
suspend fun getGoogleAccessToken(httpClient: HttpClient): String? {
    return try {
        val response = httpClient.get(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        ) {
            header("Metadata-Flavor", "Google")
        }
        Json.parseToJsonElement(response.bodyAsText())
            .jsonObject["access_token"]
            ?.jsonPrimitive
            ?.content
    } catch (e: Exception) {
        logger.debug("Google access token fetch failed (expected in local dev): {}", e.message)
        null
    }
}
