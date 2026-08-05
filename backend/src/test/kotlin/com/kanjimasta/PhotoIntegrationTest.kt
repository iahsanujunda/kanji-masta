package com.kanjimasta

import com.kanjimasta.core.auth.AuthUser
import com.kanjimasta.core.db.PhotoSessionTable
import com.kanjimasta.core.db.PhotoSessionStatus
import com.kanjimasta.modules.photo.PhotoService
import com.kanjimasta.modules.photo.PhotoRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import io.ktor.server.testing.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PhotoIntegrationTest : com.kanjimasta.support.PersistenceTest() {

    @Test
    fun `cloud run job dispatch returns after execution is accepted`() = runBlocking {
        var jobRequestBody = ""
        var jobAuthorization = ""
        val httpClient = HttpClient(MockEngine) {
            engine {
                addHandler { request ->
                    if (request.url.host == "metadata.google.internal") {
                        respond(
                            """{"access_token":"test-access-token","expires_in":3599,"token_type":"Bearer"}""",
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                        )
                    } else {
                        jobRequestBody = (request.body as TextContent).text
                        jobAuthorization = request.headers[HttpHeaders.Authorization].orEmpty()
                        respond(
                            """{"name":"projects/test/locations/test/operations/accepted"}""",
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                        )
                    }
                }
            }
        }
        try {
            val repository = PhotoRepository(TestDatabase.db)
            val service = PhotoService(
                repository,
                httpClient,
                "https://worker.example",
                photoAnalysisJobName = "projects/test/locations/test/jobs/photo-analysis",
            )

            val response = service.startAnalysis(
                userId = TEST_USER_ID,
                imageUrl = "https://storage.example.com/photos/job.jpg",
            )

            val session = repository.getSession(UUID.fromString(response.sessionId), TEST_USER_ID)
            assertEquals(PhotoSessionStatus.PROCESSING, session?.status)
            assertEquals(null, session?.failureCode)
            assertEquals("Bearer test-access-token", jobAuthorization)
            val body = Json.parseToJsonElement(jobRequestBody).jsonObject
            val env = body["overrides"]!!.jsonObject["containerOverrides"]!!.jsonArray
                .single().jsonObject["env"]!!.jsonArray.single().jsonObject
            assertEquals("PHOTO_SESSION_ID", env["name"]?.jsonPrimitive?.content)
            assertEquals(response.sessionId, env["value"]?.jsonPrimitive?.content)
        } finally {
            httpClient.close()
        }
    }

    @Test
    fun `cloud run job rejection marks session failed`() = runBlocking {
        val httpClient = HttpClient(MockEngine) {
            engine {
                addHandler { request ->
                    if (request.url.host == "metadata.google.internal") {
                        respond(
                            """{"access_token":"test-access-token"}""",
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                        )
                    } else {
                        respond("rejected", HttpStatusCode.Forbidden)
                    }
                }
            }
        }
        try {
            val repository = PhotoRepository(TestDatabase.db)
            val service = PhotoService(
                repository,
                httpClient,
                "https://worker.example",
                photoAnalysisJobName = "projects/test/locations/test/jobs/photo-analysis",
            )

            val response = service.startAnalysis(
                userId = TEST_USER_ID,
                imageUrl = "https://storage.example.com/photos/rejected.jpg",
            )

            val session = repository.getSession(UUID.fromString(response.sessionId), TEST_USER_ID)
            assertEquals(PhotoSessionStatus.FAILED, session?.status)
            assertEquals("dispatch_failed", session?.failureCode)
        } finally {
            httpClient.close()
        }
    }

    @Test
    fun `reused unclaimed capture dispatches its cloud run job`() = runBlocking {
        var jobDispatches = 0
        val httpClient = HttpClient(MockEngine) {
            engine {
                addHandler { request ->
                    if (request.url.host == "metadata.google.internal") {
                        respond(
                            """{"access_token":"test-access-token"}""",
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                        )
                    } else {
                        jobDispatches += 1
                        respond("{}", headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                    }
                }
            }
        }
        try {
            val captureId = UUID.randomUUID()
            val repository = PhotoRepository(TestDatabase.db)
            val initial = repository.createSession(
                TEST_USER_ID,
                "https://storage.example.com/photos/lost-response.jpg",
                clientCaptureId = captureId,
            )
            val service = PhotoService(
                repository,
                httpClient,
                "https://worker.example",
                photoAnalysisJobName = "projects/test/locations/test/jobs/photo-analysis",
            )

            val retried = service.startAnalysis(
                userId = TEST_USER_ID,
                imageUrl = "https://storage.example.com/photos/lost-response.jpg",
                clientCaptureId = captureId,
            )

            assertEquals(initial.id, retried.sessionId)
            assertEquals(1, jobDispatches)
        } finally {
            httpClient.close()
        }
    }

    @Test
    fun `POST photo analyze creates session`() = testApplication {
        application { testModule(TestDatabase.db) }
        val response = jsonClient().post("/api/photo/analyze") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"imageUrl":"https://storage.example.com/photos/test.jpg"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("sessionId"))
        assertEquals("processing", body["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun `POST photo analyze reuses session for the same client capture`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val captureId = UUID.randomUUID().toString()

        suspend fun create(): JsonObject {
            val response = client.post("/api/photo/analyze") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"imageUrl":"https://storage.example.com/photos/idempotent.jpg","clientCaptureId":"$captureId"}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            return Json.parseToJsonElement(response.bodyAsText()).jsonObject
        }

        val first = create()
        val second = create()
        assertEquals(first["sessionId"], second["sessionId"])
        val count = TestDatabase.db.from(PhotoSessionTable)
            .select()
            .where { PhotoSessionTable.clientCaptureId eq UUID.fromString(captureId) }
            .totalRecordsInAllPages
        assertEquals(1, count)
    }

    @Test
    fun `GET photo session is scoped to its owner`() = testApplication {
        val creation = PhotoRepository(TestDatabase.db).createSession(
            TEST_USER_ID,
            "https://storage.example.com/photos/owned.jpg",
        )
        application {
            testModule(TestDatabase.db, AuthUser("different-user", "different@example.com"))
        }
        val response = jsonClient().get("/api/photo/session/${creation.id}") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `GET photo session returns processing status for owner`() = testApplication {
        val creation = PhotoRepository(TestDatabase.db).createSession(
            TEST_USER_ID,
            "https://storage.example.com/photos/processing.jpg",
        )
        application { testModule(TestDatabase.db) }
        val response = jsonClient().get("/api/photo/session/${creation.id}") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("processing", body["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun `GET photo session with malformed id returns not found`() = testApplication {
        application { testModule(TestDatabase.db) }
        val response = jsonClient().get("/api/photo/session/not-a-uuid") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `GET recent includes actionable statuses and excludes ingested`() = testApplication {
        listOf("PROCESSING", "DONE", "FAILED", "INGESTED").forEachIndexed { index, status ->
            TestDatabase.db.insert(PhotoSessionTable) {
                set(it.id, UUID.randomUUID())
                set(it.userId, TEST_USER_ID)
                set(it.imageUrl, "https://storage.example.com/photos/$index.jpg")
                set(it.status, status)
                set(it.createdAt, Instant.now().plus(index.toLong(), ChronoUnit.SECONDS))
            }
        }
        application { testModule(TestDatabase.db) }
        val response = jsonClient().get("/api/photo/recent") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val statuses = Json.parseToJsonElement(response.bodyAsText()).jsonObject["sessions"]!!
            .jsonArray.map { it.jsonObject["status"]!!.jsonPrimitive.content }.toSet()
        assertEquals(setOf("processing", "done", "failed"), statuses)
        assertNotEquals(true, "ingested" in statuses)
    }

    @Test
    fun `stale cleanup returns failed through the photo API`() = testApplication {
        val sessionId = UUID.randomUUID()
        val longRunningSessionId = UUID.randomUUID()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, sessionId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://storage.example.com/photos/stale.jpg")
            set(it.status, "PROCESSING")
            set(it.updatedAt, Instant.now().minus(26, ChronoUnit.HOURS))
        }
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, longRunningSessionId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://storage.example.com/photos/long-running.jpg")
            set(it.status, "PROCESSING")
            set(it.updatedAt, Instant.now().minus(2, ChronoUnit.HOURS))
        }
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val cleanup = client.post("/api/internal/cron/cleanup-photo-sessions") {
            header("X-Internal-Key", "test-internal-key")
        }
        assertEquals(HttpStatusCode.OK, cleanup.status)

        val response = client.get("/api/photo/session/$sessionId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("failed", body["status"]?.jsonPrimitive?.content)
        assertEquals("timed_out", body["failureCode"]?.jsonPrimitive?.content)

        val stillRunning = client.get("/api/photo/session/$longRunningSessionId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val stillRunningBody = Json.parseToJsonElement(stillRunning.bodyAsText()).jsonObject
        assertEquals("processing", stillRunningBody["status"]?.jsonPrimitive?.content)
    }
}
