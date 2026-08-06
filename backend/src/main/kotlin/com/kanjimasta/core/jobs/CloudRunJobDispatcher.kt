package com.kanjimasta.core.jobs

import com.kanjimasta.core.auth.getGoogleAccessToken
import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.slf4j.LoggerFactory

fun interface JobDispatcher {
    suspend fun dispatch(environment: Map<String, String>): Boolean
}

class CloudRunJobDispatcher(
    private val httpClient: HttpClient,
    private val jobName: String,
) : JobDispatcher {
    override suspend fun dispatch(environment: Map<String, String>): Boolean {
        if (jobName.isBlank()) return false
        return try {
            val accessToken = getGoogleAccessToken(httpClient)
                ?: error("Google Cloud access token is unavailable")
            val response = httpClient.post("https://run.googleapis.com/v2/$jobName:run") {
                contentType(ContentType.Application.Json)
                bearerAuth(accessToken)
                setBody(buildJsonObject {
                    if (environment.isNotEmpty()) {
                        putJsonObject("overrides") {
                            putJsonArray("containerOverrides") {
                                add(buildJsonObject {
                                    putJsonArray("env") {
                                        environment.forEach { (name, value) ->
                                            add(buildJsonObject {
                                                put("name", name)
                                                put("value", value)
                                            })
                                        }
                                    }
                                })
                            }
                        }
                    }
                }.toString())
            }
            if (!response.status.isSuccess()) {
                logger.error("Cloud Run Job dispatch failed for {}: {} {}", jobName, response.status, response.bodyAsText())
                false
            } else {
                true
            }
        } catch (error: Exception) {
            logger.error("Cloud Run Job dispatch failed for {}", jobName, error)
            false
        }
    }

    private companion object {
        val logger = LoggerFactory.getLogger(CloudRunJobDispatcher::class.java)
    }
}
