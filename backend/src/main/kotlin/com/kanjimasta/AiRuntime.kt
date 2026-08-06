package com.kanjimasta

import com.kanjimasta.core.ai.AiModelConfigRepository
import com.kanjimasta.core.ai.OpenRouterClient
import com.kanjimasta.modules.kanji.WordDiscoveryRepository
import com.kanjimasta.modules.kanji.WordDiscoveryService
import com.kanjimasta.modules.photo.PhotoAnalysisExecutor
import com.kanjimasta.modules.photo.PhotoAnalysisRepository
import com.kanjimasta.modules.worker.QuizGenerationRepository
import com.kanjimasta.modules.worker.QuizGenerationWorker
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
    val wordDiscovery = WordDiscoveryService(
        repository = WordDiscoveryRepository(database, modelConfigs),
        modelConfigs = modelConfigs,
        openRouter = openRouter,
    )
}
