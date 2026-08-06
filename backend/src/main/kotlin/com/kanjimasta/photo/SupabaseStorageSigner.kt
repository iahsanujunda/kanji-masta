package com.kanjimasta.photo

import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class SupabaseStorageSigner(
    private val httpClient: HttpClient,
    supabaseUrl: String,
    private val serviceRoleKey: String,
) {
    private val baseUrl = supabaseUrl.trimEnd('/')

    suspend fun signPhoto(storagePath: String, expiresInSeconds: Int = 600): String? {
        if (baseUrl.isBlank() || serviceRoleKey.isBlank() || storagePath.isBlank()) return null
        val encodedPath = storagePath.split('/').joinToString("/") { it.encodeURLPathPart() }
        val response = httpClient.post("$baseUrl/storage/v1/object/sign/photos/$encodedPath") {
            contentType(ContentType.Application.Json)
            bearerAuth(serviceRoleKey)
            header("apikey", serviceRoleKey)
            setBody("""{"expiresIn":$expiresInSeconds}""")
        }
        if (!response.status.isSuccess()) return null
        val signedPath = Json.parseToJsonElement(response.bodyAsText())
            .jsonObject["signedURL"]?.jsonPrimitive?.content ?: return null
        return if (signedPath.startsWith("http://") || signedPath.startsWith("https://")) {
            signedPath
        } else {
            "$baseUrl/storage/v1/${signedPath.trimStart('/')}"
        }
    }
}
