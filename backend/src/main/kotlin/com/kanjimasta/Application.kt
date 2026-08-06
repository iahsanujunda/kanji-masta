package com.kanjimasta

import com.kanjimasta.core.auth.configureAuth
import com.kanjimasta.core.db.connectDatabase
import com.kanjimasta.core.email.ResendClient
import com.kanjimasta.core.jobs.CloudRunJobDispatcher
import com.kanjimasta.core.jobs.JobDispatcher
import com.kanjimasta.core.jobs.LocalJobDispatcher
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

    val httpClient = HttpClient(CIO) {
        install(HttpTimeout) {
            requestTimeoutMillis = 120_000
            connectTimeoutMillis = 10_000
        }
    }
    val photoAnalysisJobName = environment.config.propertyOrNull("photoAnalysis.jobName")?.getString().orEmpty()
    val quizGenerationJobName = environment.config.propertyOrNull("quizGeneration.jobName")?.getString().orEmpty()
    val localDispatchUrl = environment.config.propertyOrNull("localJobs.dispatchUrl")?.getString().orEmpty()
    val localDispatchKey = environment.config.propertyOrNull("localJobs.dispatchKey")?.getString().orEmpty()
    val cloudJobsConfigured = photoAnalysisJobName.isNotBlank() || quizGenerationJobName.isNotBlank()
    require(!cloudJobsConfigured || (photoAnalysisJobName.isNotBlank() && quizGenerationJobName.isNotBlank())) {
        "PHOTO_ANALYSIS_JOB and QUIZ_GENERATION_JOB must be configured together"
    }
    require(cloudJobsConfigured || localDispatchUrl.isNotBlank()) {
        "Configure Cloud Run Job names or LOCAL_JOB_DISPATCH_URL; inline job execution is not supported"
    }
    require(!cloudJobsConfigured || localDispatchUrl.isBlank()) {
        "Configure either Cloud Run Jobs or the local dispatcher, not both"
    }

    fun dispatcher(cloudJobName: String, localRole: String): JobDispatcher =
        if (cloudJobsConfigured) CloudRunJobDispatcher(httpClient, cloudJobName)
        else LocalJobDispatcher(httpClient, localDispatchUrl, localRole, localDispatchKey)

    val internalKey = environment.config.propertyOrNull("internal.key")?.getString() ?: ""
    val supabaseUrl = environment.config.propertyOrNull("supabase.url")?.getString() ?: ""
    val supabaseServiceRoleKey = environment.config.propertyOrNull("supabase.serviceRoleKey")?.getString() ?: ""
    val storageSigner = SupabaseStorageSigner(httpClient, supabaseUrl, supabaseServiceRoleKey)

    val photoRepository = PhotoRepository(database)
    val photoService = PhotoService(
        photoRepository,
        dispatcher(photoAnalysisJobName, "photo-job"),
        storageSigner,
    )

    val kanjiRepository = KanjiRepository(database)
    val kanjiService = KanjiService(
        kanjiRepository,
        photoRepository,
        dispatcher(quizGenerationJobName, "quiz-job"),
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
