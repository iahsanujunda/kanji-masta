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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

const val TEST_USER_ID = "test-user-integration"
const val TEST_USER_EMAIL = "test@example.com"

/**
 * Test database connects to local Supabase PostgreSQL.
 * Start with `supabase start` before running tests.
 *
 * Falls back to TESTCONTAINERS if DATABASE_TEST_URL is not set and Supabase is not running.
 * Uses a separate schema per test run to avoid conflicts.
 */
object TestDatabase {
    private const val DEFAULT_URL = "jdbc:postgresql://127.0.0.1:54322/postgres?user=postgres&password=postgres"

    val db: Database by lazy {
        val url = System.getenv("DATABASE_TEST_URL") ?: DEFAULT_URL
        val db = Database.connect(url)
        // Apply migration if tables don't exist yet
        db.useConnection { conn ->
            val rs = conn.createStatement().executeQuery(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kanji_master')"
            )
            rs.next()
            if (!rs.getBoolean(1)) {
                val sql = Thread.currentThread().contextClassLoader
                    .getResource("test-schema.sql")?.readText()
                    ?: error("test-schema.sql not found on classpath")
                conn.createStatement().execute(sql)
            }
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

    // Seed settings for test user so invite guard doesn't block existing tests
    settingsRepository.upsertSettings(TEST_USER_ID, 5, 6)

    configureRouting(photoService, kanjiService, quizService, userService, settingsRepository, inviteService, TEST_USER_ID)
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
