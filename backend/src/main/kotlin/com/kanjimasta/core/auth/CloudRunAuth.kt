package com.kanjimasta.core.auth

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.core.auth.CloudRunAuth")

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