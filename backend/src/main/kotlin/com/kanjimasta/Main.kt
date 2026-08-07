package com.kanjimasta

import com.kanjimasta.db.connectDatabase
import com.kanjimasta.jobs.runLocalJobProcessServer
import com.kanjimasta.jobs.CloudRunJobDispatcher
import com.kanjimasta.jobs.LocalJobDispatcher
import com.kanjimasta.jobs.JobDispatcher
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
    val captureTaskId = System.getenv("CAPTURE_TASK_ID")?.takeIf(String::isNotBlank)?.let(UUID::fromString)
    val legacySessionId = System.getenv("PHOTO_SESSION_ID")?.takeIf(String::isNotBlank)?.let(UUID::fromString)
    val wordTaskId = System.getenv("CAPTURE_WORD_TASK_ID")?.takeIf(String::isNotBlank)?.let(UUID::fromString)
    require(listOf(captureTaskId, legacySessionId, wordTaskId).count { it != null } == 1) {
        "photo-job requires exactly one of CAPTURE_TASK_ID, legacy PHOTO_SESSION_ID, or CAPTURE_WORD_TASK_ID"
    }
    val succeeded = if (captureTaskId != null || legacySessionId != null) {
        val taskAttempt = System.getenv("CLOUD_RUN_TASK_ATTEMPT")?.toIntOrNull() ?: 0
        runBlocking {
            if (captureTaskId != null) runtime.photoExecutor.run(captureTaskId, taskAttempt, claimedBy)
            else runtime.photoExecutor.runLegacySession(legacySessionId!!, taskAttempt, claimedBy)
        }
    } else {
        runBlocking { runtime.captureWordDiscoveryExecutor.run(wordTaskId!!, claimedBy) }
    }
    check(succeeded) { "Capture processing failed for ${captureTaskId ?: legacySessionId ?: wordTaskId}" }
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
        val cloudJob = System.getenv("PHOTO_ANALYSIS_JOB").orEmpty()
        val localDispatchUrl = System.getenv("LOCAL_JOB_DISPATCH_URL").orEmpty()
        val dispatcher: JobDispatcher = if (cloudJob.isNotBlank()) {
            CloudRunJobDispatcher(httpClient, cloudJob)
        } else if (localDispatchUrl.isNotBlank()) {
            LocalJobDispatcher(
                httpClient,
                localDispatchUrl,
                "photo-job",
                System.getenv("LOCAL_JOB_DISPATCH_KEY").orEmpty(),
            )
        } else {
            JobDispatcher { false }
        }
        block(AiRuntime(database, httpClient, runtimeSettingsFromEnvironment(), dispatcher))
    } finally {
        httpClient.close()
    }
}

internal fun sharedHttpClient(): HttpClient = HttpClient(CIO) {
    install(HttpTimeout) {
        requestTimeoutMillis = System.getenv("OPENROUTER_TIMEOUT_SECONDS")?.toLongOrNull()?.times(1_000) ?: 600_000
        connectTimeoutMillis = 10_000
    }
}

internal fun runtimeSettingsFromEnvironment(): AiRuntimeSettings = AiRuntimeSettings(
    openRouterApiKey = System.getenv("OPENROUTER_API_KEY").orEmpty(),
    openRouterBaseUrl = System.getenv("OPENROUTER_BASE_URL") ?: "https://openrouter.ai",
    openRouterSiteUrl = System.getenv("OPENROUTER_SITE_URL").orEmpty(),
    openRouterAppName = System.getenv("OPENROUTER_APP_NAME") ?: "Kanji Masta",
    reasoningEffort = System.getenv("OPENROUTER_REASONING_EFFORT") ?: "medium",
    jobLeaseSeconds = System.getenv("JOB_LEASE_SECONDS")?.toLongOrNull() ?: 1_500,
    quizBatchSize = System.getenv("QUIZ_JOB_BATCH_SIZE")?.toIntOrNull() ?: 10,
    maxImageBytes = System.getenv("PHOTO_MAX_IMAGE_BYTES")?.toLongOrNull() ?: 10 * 1024 * 1024,
    supabaseUrl = System.getenv("SUPABASE_URL").orEmpty(),
    supabaseServiceRoleKey = System.getenv("SUPABASE_SERVICE_ROLE_KEY").orEmpty(),
)

private fun requiredEnvironment(name: String): String =
    System.getenv(name)?.takeIf(String::isNotBlank) ?: error("$name is not set")
