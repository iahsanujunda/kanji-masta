package com.kanjimasta

import com.kanjimasta.core.auth.AuthUser
import com.kanjimasta.core.ai.ModelCatalogGateway
import com.kanjimasta.core.ai.BootstrapModelConfig
import com.kanjimasta.core.ai.UnavailableModelCatalogGateway
import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import com.kanjimasta.support.TestPostgres
import com.kanjimasta.modules.kanji.KanjiRepository
import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.photo.PhotoRepository
import com.kanjimasta.modules.photo.PhotoService
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.response.*
import io.ktor.server.testing.*
import org.ktorm.database.Database
import org.slf4j.LoggerFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

const val TEST_USER_ID = "test-user-integration"
const val TEST_USER_EMAIL = "test@example.com"

/**
 * Test database using Testcontainers — spins up a fresh PostgreSQL container.
 * No external dependencies required (no `supabase start` needed).
 */
object TestDatabase {
    val db: Database get() = TestPostgres.database
}

private val testLogger = LoggerFactory.getLogger("TestModule")

fun Application.testModule(
    db: Database,
    authUser: AuthUser = AuthUser(uid = TEST_USER_ID, email = TEST_USER_EMAIL),
    adminJobDispatcher: suspend (String, java.util.UUID, String) -> Boolean = { _, _, _ -> true },
    modelCatalogGateway: ModelCatalogGateway = UnavailableModelCatalogGateway,
    bootstrapModelConfig: BootstrapModelConfig = BootstrapModelConfig(
        photoAnalysisModel = "bootstrap/photo",
        quizGenerationModel = "bootstrap/quiz",
        wordDiscoveryModel = "bootstrap/discovery",
    ),
) {
    configureSerialization()
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            testLogger.error("Unhandled exception in test", cause)
            call.respondText("Error: ${cause.message}", status = HttpStatusCode.InternalServerError)
        }
    }
    install(Authentication) {
        bearer("supabase") {
            authenticate {
                authUser
            }
        }
    }
    // This harness must never escape to the network. Worker triggers, Cloud
    // metadata token requests, and email calls all terminate in memory.
    val httpClient = HttpClient(MockEngine) {
        engine {
            addHandler {
                respond(
                    content = "ok",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Text.Plain.toString()),
                )
            }
        }
    }
    val photoService = PhotoService(PhotoRepository(db), httpClient, "http://localhost:5001")
    val kanjiService = KanjiService(KanjiRepository(db), PhotoRepository(db), httpClient, "http://localhost:5001")
    val quizRepository = com.kanjimasta.modules.quiz.QuizRepository(db)
    val quizService = com.kanjimasta.modules.quiz.QuizService(quizRepository)
    val settingsRepository = com.kanjimasta.modules.settings.SettingsRepository(db)
    val userService = com.kanjimasta.modules.user.UserService(com.kanjimasta.modules.user.UserRepository(db), quizRepository, settingsRepository)
    val resendClient = com.kanjimasta.core.email.ResendClient(httpClient, "")
    val inviteRepository = com.kanjimasta.modules.invite.InviteRepository(db)
    val inviteService = com.kanjimasta.modules.invite.InviteService(inviteRepository, resendClient)
    val adminRepository = com.kanjimasta.modules.admin.AdminRepository(db)
    val adminService = com.kanjimasta.modules.admin.AdminService(
        adminRepository,
        adminJobDispatcher,
        modelCatalogGateway,
        bootstrapModelConfig,
    )
    val internalService = com.kanjimasta.modules.internal.InternalService(db)

    // Seed settings for test user so tests that depend on settings work
    settingsRepository.upsertSettings(TEST_USER_ID, 5, 6, null)

    configureRouting(photoService, kanjiService, quizService, userService, settingsRepository, inviteService, adminService, internalService, TEST_USER_ID, "test-internal-key", "http://localhost:8080")
}

fun ApplicationTestBuilder.jsonClient() = createClient {
    install(ContentNegotiation) { json() }
}

class ApplicationTest : com.kanjimasta.support.PersistenceTest() {

    @Test
    fun `health endpoint returns ok`() = testApplication {
        application { testModule(TestDatabase.db) }
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertContains(response.bodyAsText(), "ok")
    }

    @Test
    fun `unknown route returns 404`() = testApplication {
        application { testModule(TestDatabase.db) }
        val response = client.get("/nonexistent")
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `unauthenticated request returns 401`() = testApplication {
        application { testModule(TestDatabase.db) }
        val response = client.get("/api/settings")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
