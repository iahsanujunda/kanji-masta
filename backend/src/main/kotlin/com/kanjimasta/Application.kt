package com.kanjimasta

import com.kanjimasta.core.auth.configureAuth
import com.kanjimasta.core.db.connectDatabase
import com.kanjimasta.core.email.ResendClient
import com.kanjimasta.core.storage.SupabaseStorageSigner
import com.kanjimasta.modules.admin.AdminRepository
import com.kanjimasta.modules.admin.AdminService
import com.kanjimasta.core.ai.OpenRouterCatalogClient
import com.kanjimasta.modules.internal.InternalService
import com.kanjimasta.core.plugins.configureCors
import com.kanjimasta.core.plugins.configureObservability
import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import com.kanjimasta.modules.invite.InviteRepository
import com.kanjimasta.modules.invite.InviteService
import com.kanjimasta.modules.kanji.KanjiRepository
import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.photo.PhotoRepository
import com.kanjimasta.modules.photo.PhotoService
import com.kanjimasta.modules.quiz.QuizRepository
import com.kanjimasta.modules.quiz.QuizService
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.*
import io.ktor.server.application.*

fun Application.module() {
    configureSerialization()
    configureCors()
    configureObservability()
    configureAuth()

    // Database (Ktorm + Supabase PostgreSQL)
    val database = connectDatabase(environment)

    val photoAnalysisJobName = environment.config.propertyOrNull("photoAnalysis.jobName")?.getString() ?: ""

    val httpClient = HttpClient(CIO) {
        install(HttpTimeout) {
            requestTimeoutMillis = 120_000
            connectTimeoutMillis = 10_000
        }
    }
    val aiRuntime = AiRuntime(
        database = database,
        httpClient = httpClient,
        settings = AiRuntimeSettings(
            openRouterApiKey = environment.config.propertyOrNull("openrouter.apiKey")?.getString() ?: "",
            openRouterBaseUrl = environment.config.propertyOrNull("openrouter.baseUrl")?.getString()
                ?: "https://openrouter.ai",
            openRouterSiteUrl = environment.config.propertyOrNull("openrouter.siteUrl")?.getString() ?: "",
            openRouterAppName = environment.config.propertyOrNull("openrouter.appName")?.getString() ?: "Kanji Masta",
            reasoningEffort = environment.config.propertyOrNull("openrouter.reasoningEffort")?.getString() ?: "medium",
            jobLeaseSeconds = environment.config.propertyOrNull("jobs.leaseSeconds")?.getString()?.toLongOrNull() ?: 300,
            quizBatchSize = environment.config.propertyOrNull("jobs.quizBatchSize")?.getString()?.toIntOrNull() ?: 10,
            maxImageBytes = environment.config.propertyOrNull("jobs.maxImageBytes")?.getString()?.toLongOrNull()
                ?: 10 * 1024 * 1024,
        ),
    )

    val internalKey = environment.config.propertyOrNull("internal.key")?.getString() ?: ""
    val supabaseUrl = environment.config.propertyOrNull("supabase.url")?.getString() ?: ""
    val supabaseServiceRoleKey = environment.config.propertyOrNull("supabase.serviceRoleKey")?.getString() ?: ""
    val storageSigner = SupabaseStorageSigner(httpClient, supabaseUrl, supabaseServiceRoleKey)

    val photoRepository = PhotoRepository(database)
    val photoService = PhotoService(
        photoRepository,
        httpClient,
        photoAnalysisJobName,
        storageSigner,
        localPhotoRunner = { aiRuntime.photoExecutor.run(it) },
    )

    val kanjiRepository = KanjiRepository(database)
    val quizGenerationJobName = environment.config.propertyOrNull("quizGeneration.jobName")?.getString() ?: ""
    val kanjiService = KanjiService(
        kanjiRepository,
        photoRepository,
        httpClient,
        quizGenerationJobName,
        localQuizRunner = { aiRuntime.quizWorker.drain() },
    )

    val quizRepository = QuizRepository(database)
    val quizService = QuizService(quizRepository)

    val settingsRepository = com.kanjimasta.modules.settings.SettingsRepository(database)
    val userRepository = com.kanjimasta.modules.user.UserRepository(database)
    val userService = com.kanjimasta.modules.user.UserService(userRepository, quizRepository, settingsRepository)

    val resendApiKey = environment.config.propertyOrNull("resend.apiKey")?.getString() ?: ""
    val adminUserId = environment.config.propertyOrNull("admin.userId")?.getString() ?: ""
    val resendClient = ResendClient(httpClient, resendApiKey)
    val inviteRepository = InviteRepository(database)
    val inviteService = InviteService(inviteRepository, resendClient)
    val adminRepository = AdminRepository(database)
    val openRouterCatalog = OpenRouterCatalogClient(
        httpClient = httpClient,
        apiKey = environment.config.propertyOrNull("openrouter.apiKey")?.getString() ?: "",
        baseUrl = environment.config.propertyOrNull("openrouter.baseUrl")?.getString() ?: "https://openrouter.ai",
    )
    val adminService = AdminService(
        adminRepository,
        jobDispatcher = { type, id, userId ->
            when (type) {
                "photo_analysis" -> photoService.rerunAnalysis(id, userId)
                "quiz_generation" -> kanjiService.dispatchPendingQuizGeneration()
                else -> false
            }
        },
        modelCatalogGateway = openRouterCatalog,
    )
    val internalService = InternalService(database)

    monitor.subscribe(ApplicationStopped) {
        httpClient.close()
    }

    configureRouting(photoService, kanjiService, quizService, userService, settingsRepository, inviteService, adminService, internalService, adminUserId, internalKey)
}
