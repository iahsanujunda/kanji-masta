package com.kanjimasta

import com.kanjimasta.core.auth.AuthUser
import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import com.kanjimasta.modules.kanji.KanjiRepository
import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.photo.PhotoRepository
import com.kanjimasta.modules.photo.PhotoService
import io.ktor.client.*
import io.ktor.client.engine.cio.*
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
import org.testcontainers.containers.PostgreSQLContainer
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
    private val container = PostgreSQLContainer("postgres:16-alpine")
        .withDatabaseName("test")
        .withUsername("test")
        .withPassword("test")

    val db: Database by lazy {
        container.start()
        val db = Database.connect(container.jdbcUrl, user = "test", password = "test")
        db.useConnection { conn ->
            val sql = Thread.currentThread().contextClassLoader
                .getResource("test-schema.sql")?.readText()
                ?: error("test-schema.sql not found on classpath")
            conn.createStatement().execute(sql)
        }
        db
    }
}

private val testLogger = LoggerFactory.getLogger("TestModule")

fun Application.testModule(db: Database) {
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
                AuthUser(uid = TEST_USER_ID, email = TEST_USER_EMAIL)
            }
        }
    }
    val httpClient = HttpClient(CIO)
    val photoService = PhotoService(PhotoRepository(db), httpClient, "http://localhost:5001")
    val kanjiService = KanjiService(KanjiRepository(db), PhotoRepository(db), httpClient, "http://localhost:5001")
    val quizRepository = com.kanjimasta.modules.quiz.QuizRepository(db)
    val quizService = com.kanjimasta.modules.quiz.QuizService(quizRepository)
    val settingsRepository = com.kanjimasta.modules.settings.SettingsRepository(db)
    val userService = com.kanjimasta.modules.user.UserService(com.kanjimasta.modules.user.UserRepository(db), quizRepository, settingsRepository)
    val resendClient = com.kanjimasta.core.email.ResendClient(httpClient, "")
    val inviteRepository = com.kanjimasta.modules.invite.InviteRepository(db)
    val inviteService = com.kanjimasta.modules.invite.InviteService(inviteRepository, settingsRepository, resendClient)
    val adminRepository = com.kanjimasta.modules.admin.AdminRepository(db)
    val adminService = com.kanjimasta.modules.admin.AdminService(adminRepository)

    // Seed settings for test user so invite guard doesn't block existing tests
    settingsRepository.upsertSettings(TEST_USER_ID, 5, 6)

    configureRouting(photoService, kanjiService, quizService, userService, settingsRepository, inviteService, adminService, TEST_USER_ID)
}

fun ApplicationTestBuilder.jsonClient() = createClient {
    install(ContentNegotiation) { json() }
}

class ApplicationTest {

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
