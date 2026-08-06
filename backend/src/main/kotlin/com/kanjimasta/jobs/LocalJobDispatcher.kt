package com.kanjimasta.jobs

import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.slf4j.LoggerFactory

const val LOCAL_JOB_KEY_HEADER = "X-Local-Job-Key"

class LocalJobDispatcher(
    private val httpClient: HttpClient,
    baseUrl: String,
    private val role: String,
    private val dispatchKey: String,
) : JobDispatcher {
    private val endpoint = "${baseUrl.trimEnd('/')}/v1/jobs/$role"

    init {
        require(baseUrl.isNotBlank()) { "Local job dispatcher URL is required" }
        require(role in setOf("photo-job", "quiz-job")) { "Unsupported local job role '$role'" }
        require(dispatchKey.isNotBlank()) { "Local job dispatcher key is required" }
    }

    override suspend fun dispatch(environment: Map<String, String>): Boolean = try {
        val response = httpClient.post(endpoint) {
            contentType(ContentType.Application.Json)
            header(LOCAL_JOB_KEY_HEADER, dispatchKey)
            setBody(buildJsonObject {
                putJsonObject("environment") {
                    environment.forEach { (name, value) -> put(name, value) }
                }
            }.toString())
        }
        if (!response.status.isSuccess()) {
            logger.error("Local job dispatch failed for {}: {} {}", role, response.status, response.bodyAsText())
            false
        } else {
            true
        }
    } catch (error: Exception) {
        logger.error("Local job dispatch failed for {}", role, error)
        false
    }

    private companion object {
        val logger = LoggerFactory.getLogger(LocalJobDispatcher::class.java)
    }
}
