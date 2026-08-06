package com.kanjimasta

import com.kanjimasta.db.connectDatabase
import com.kanjimasta.jobs.runLocalJobProcessServer
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.server.netty.EngineMain
import kotlinx.coroutines.runBlocking
import java.util.UUID

fun main(args: Array<String>) {
    when (val role = args.firstOrNull() ?: "web") {
        "web" -> EngineMain.main(args.drop(1).toTypedArray())
        "photo-job" -> runPhotoJob()
        "quiz-job" -> runQuizJob(args.getOrNull(1) ?: "drain")
        "local-dispatcher" -> runLocalJobProcessServer()
        else -> error("Unknown runtime role '$role'; expected web, photo-job, quiz-job, or local-dispatcher")
    }
}

private fun runPhotoJob() = withJobRuntime { runtime ->
    val claimedBy = listOfNotNull(
        System.getenv("CLOUD_RUN_EXECUTION"),
        System.getenv("CLOUD_RUN_TASK_INDEX"),
    ).joinToString("/").ifBlank { "local-photo-job" }
    val photoSessionId = System.getenv("PHOTO_SESSION_ID")?.takeIf(String::isNotBlank)?.let(UUID::fromString)
    val wordTaskId = System.getenv("CAPTURE_WORD_TASK_ID")?.takeIf(String::isNotBlank)?.let(UUID::fromString)
    require((photoSessionId == null) != (wordTaskId == null)) {
        "photo-job requires exactly one of PHOTO_SESSION_ID or CAPTURE_WORD_TASK_ID"
    }
    val succeeded = if (photoSessionId != null) {
        val taskAttempt = System.getenv("CLOUD_RUN_TASK_ATTEMPT")?.toIntOrNull() ?: 0
        runBlocking { runtime.photoExecutor.run(photoSessionId, taskAttempt, claimedBy) }
    } else {
        runBlocking { runtime.captureWordDiscoveryExecutor.run(wordTaskId!!, claimedBy) }
    }
    check(succeeded) { "Capture processing failed for ${photoSessionId ?: wordTaskId}" }
}

private fun runQuizJob(mode: String) = withJobRuntime { runtime ->
    when (mode) {
        "drain" -> {
            val claimedBy = System.getenv("CLOUD_RUN_EXECUTION") ?: "local-quiz-job"
            val processed = runBlocking { runtime.quizWorker.drain(claimedBy) }
            println("Quiz job processed $processed row(s)")
        }
        "check-regen" -> println("Quiz regeneration check enqueued ${runtime.quizWorker.checkRegeneration()} row(s)")
        else -> error("Unknown quiz-job mode '$mode'; expected drain or check-regen")
    }
}

private fun withJobRuntime(block: (AiRuntime) -> Unit) {
    val httpClient = sharedHttpClient()
    val database = connectDatabase(
        url = requiredEnvironment("DATABASE_URL"),
        maximumPoolSize = System.getenv("HIKARI_MAX_POOL_SIZE")?.toIntOrNull() ?: 5,
    )
    try {
        block(AiRuntime(database, httpClient, runtimeSettingsFromEnvironment()))
    } finally {
        httpClient.close()
    }
}

internal fun sharedHttpClient(): HttpClient = HttpClient(CIO) {
    install(HttpTimeout) {
        requestTimeoutMillis = System.getenv("OPENROUTER_TIMEOUT_SECONDS")?.toLongOrNull()?.times(1_000) ?: 120_000
        connectTimeoutMillis = 10_000
    }
}

internal fun runtimeSettingsFromEnvironment(): AiRuntimeSettings = AiRuntimeSettings(
    openRouterApiKey = System.getenv("OPENROUTER_API_KEY").orEmpty(),
    openRouterBaseUrl = System.getenv("OPENROUTER_BASE_URL") ?: "https://openrouter.ai",
    openRouterSiteUrl = System.getenv("OPENROUTER_SITE_URL").orEmpty(),
    openRouterAppName = System.getenv("OPENROUTER_APP_NAME") ?: "Kanji Masta",
    reasoningEffort = System.getenv("OPENROUTER_REASONING_EFFORT") ?: "medium",
    jobLeaseSeconds = System.getenv("JOB_LEASE_SECONDS")?.toLongOrNull() ?: 300,
    quizBatchSize = System.getenv("QUIZ_JOB_BATCH_SIZE")?.toIntOrNull() ?: 10,
    maxImageBytes = System.getenv("PHOTO_MAX_IMAGE_BYTES")?.toLongOrNull() ?: 10 * 1024 * 1024,
)

private fun requiredEnvironment(name: String): String =
    System.getenv(name)?.takeIf(String::isNotBlank) ?: error("$name is not set")
