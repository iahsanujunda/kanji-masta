package com.kanjimasta

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.photo.CaptureWordDiscoveryExecutor
import com.kanjimasta.photo.CaptureWordDiscoveryRepository
import com.kanjimasta.photo.PhotoAnalysisExecutor
import com.kanjimasta.photo.PhotoAnalysisRepository
import com.kanjimasta.quiz.generation.QuizGenerationRepository
import com.kanjimasta.quiz.generation.QuizGenerationWorker
import io.ktor.client.HttpClient
import org.ktorm.database.Database

data class AiRuntimeSettings(
    val openRouterApiKey: String,
    val openRouterBaseUrl: String = "https://openrouter.ai",
    val openRouterSiteUrl: String = "",
    val openRouterAppName: String = "Kanji Masta",
    val reasoningEffort: String = "medium",
    val jobLeaseSeconds: Long = 300,
    val quizBatchSize: Int = 10,
    val maxImageBytes: Long = 10 * 1024 * 1024,
)

class AiRuntime(
    database: Database,
    httpClient: HttpClient,
    settings: AiRuntimeSettings,
) {
    private val modelConfigs = AiModelConfigRepository(database)
    private val openRouter = OpenRouterClient(
        httpClient = httpClient,
        apiKey = settings.openRouterApiKey,
        baseUrl = settings.openRouterBaseUrl,
        siteUrl = settings.openRouterSiteUrl,
        appName = settings.openRouterAppName,
        reasoningEffort = settings.reasoningEffort,
    )

    val photoExecutor = PhotoAnalysisExecutor(
        repository = PhotoAnalysisRepository(database, modelConfigs),
        openRouter = openRouter,
        httpClient = httpClient,
        leaseSeconds = settings.jobLeaseSeconds,
        maxImageBytes = settings.maxImageBytes,
    )
    val quizWorker = QuizGenerationWorker(
        repository = QuizGenerationRepository(database, modelConfigs),
        openRouter = openRouter,
        batchSize = settings.quizBatchSize,
        leaseSeconds = settings.jobLeaseSeconds,
    )
    val captureWordDiscoveryExecutor = CaptureWordDiscoveryExecutor(
        repository = CaptureWordDiscoveryRepository(database, modelConfigs),
        openRouter = openRouter,
        leaseSeconds = settings.jobLeaseSeconds,
    )
}
