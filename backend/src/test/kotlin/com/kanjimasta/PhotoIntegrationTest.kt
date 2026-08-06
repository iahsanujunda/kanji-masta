package com.kanjimasta

import com.kanjimasta.core.auth.AuthUser
import com.kanjimasta.core.db.PhotoSessionTable
import com.kanjimasta.core.db.PhotoSessionStatus
import com.kanjimasta.core.jobs.CloudRunJobDispatcher
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
                CloudRunJobDispatcher(httpClient, "projects/test/locations/test/jobs/photo-analysis"),
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
                CloudRunJobDispatcher(httpClient, "projects/test/locations/test/jobs/photo-analysis"),
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
                CloudRunJobDispatcher(httpClient, "projects/test/locations/test/jobs/photo-analysis"),
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
    fun `GET activity paginates the owners complete scan history newest first`() = testApplication {
        val now = Instant.parse("2026-08-05T05:00:00Z")
        val expectedIds = listOf(
            UUID.fromString("00000000-0000-0000-0000-000000000004"),
            UUID.fromString("00000000-0000-0000-0000-000000000003"),
            UUID.fromString("00000000-0000-0000-0000-000000000002"),
        )
        listOf("PROCESSING", "DONE", "INGESTED").forEachIndexed { index, status ->
            TestDatabase.db.insert(PhotoSessionTable) {
                set(it.id, expectedIds[index])
                set(it.userId, TEST_USER_ID)
                set(it.imageUrl, "https://storage.example.com/photos/activity-$index.jpg")
                set(it.status, status)
                set(it.createdAt, now.minus(index.toLong(), ChronoUnit.MINUTES))
            }
        }
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString("00000000-0000-0000-0000-000000000001"))
            set(it.userId, "different-user")
            set(it.imageUrl, "https://storage.example.com/photos/private.jpg")
            set(it.status, "FAILED")
            set(it.createdAt, now.plus(1, ChronoUnit.MINUTES))
        }

        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val firstResponse = client.get("/api/photo/activity?limit=2") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, firstResponse.status)
        val first = Json.parseToJsonElement(firstResponse.bodyAsText()).jsonObject
        assertEquals(
            expectedIds.take(2).map(UUID::toString),
            first["items"]!!.jsonArray.map { it.jsonObject["sessionId"]!!.jsonPrimitive.content },
        )
        assertEquals(listOf("processing", "done"), first["items"]!!.jsonArray.map {
            it.jsonObject["status"]!!.jsonPrimitive.content
        })
        assertEquals(true, first["hasMore"]!!.jsonPrimitive.boolean)
        val cursor = first["nextCursor"]!!.jsonPrimitive.content

        val secondResponse = client.get("/api/photo/activity?limit=2&cursor=$cursor") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, secondResponse.status)
        val second = Json.parseToJsonElement(secondResponse.bodyAsText()).jsonObject
        assertEquals(
            listOf(expectedIds.last().toString()),
            second["items"]!!.jsonArray.map { it.jsonObject["sessionId"]!!.jsonPrimitive.content },
        )
        assertEquals("ingested", second["items"]!!.jsonArray.single().jsonObject["status"]!!.jsonPrimitive.content)
        assertEquals(false, second["hasMore"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun `activity unseen watermark clears acknowledged changes and preserves later changes`() = testApplication {
        val firstChangedAt = Instant.parse("2026-08-05T05:10:00Z")
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString("00000000-0000-0000-0000-000000000011"))
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://storage.example.com/photos/ready.jpg")
            set(it.status, "DONE")
            set(it.updatedAt, firstChangedAt)
        }
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString("00000000-0000-0000-0000-000000000012"))
            set(it.userId, "different-user")
            set(it.imageUrl, "https://storage.example.com/photos/private-failure.jpg")
            set(it.status, "FAILED")
            set(it.updatedAt, firstChangedAt.plus(1, ChronoUnit.HOURS))
        }

        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        suspend fun unseen(): JsonObject {
            val response = client.get("/api/photo/activity/unseen") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            return Json.parseToJsonElement(response.bodyAsText()).jsonObject
        }

        val before = unseen()
        assertEquals(true, before["hasUnseen"]!!.jsonPrimitive.boolean)
        assertEquals(firstChangedAt.toString(), before["latestTerminalAt"]!!.jsonPrimitive.content)

        val seenResponse = client.post("/api/photo/activity/seen") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"seenThrough":"$firstChangedAt"}""")
        }
        assertEquals(HttpStatusCode.OK, seenResponse.status)
        assertEquals(false, unseen()["hasUnseen"]!!.jsonPrimitive.boolean)

        val laterChangedAt = firstChangedAt.plus(2, ChronoUnit.MINUTES)
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString("00000000-0000-0000-0000-000000000013"))
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://storage.example.com/photos/later-failure.jpg")
            set(it.status, "FAILED")
            set(it.updatedAt, laterChangedAt)
        }
        val after = unseen()
        assertEquals(true, after["hasUnseen"]!!.jsonPrimitive.boolean)
        assertEquals(laterChangedAt.toString(), after["latestTerminalAt"]!!.jsonPrimitive.content)

        client.post("/api/photo/activity/seen") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"seenThrough":"$laterChangedAt"}""")
        }
        client.post("/api/photo/activity/seen") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"seenThrough":"$firstChangedAt"}""")
        }
        assertEquals(false, unseen()["hasUnseen"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun `activity acknowledgement cannot advance beyond the owners latest terminal change`() = testApplication {
        val firstChangedAt = Instant.parse("2026-08-05T05:30:00Z")
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString("00000000-0000-0000-0000-000000000021"))
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://storage.example.com/photos/first-terminal.jpg")
            set(it.status, "DONE")
            set(it.updatedAt, firstChangedAt)
        }
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        val response = client.post("/api/photo/activity/seen") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"seenThrough":"2036-08-05T05:30:00Z"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status)

        val laterChangedAt = firstChangedAt.plus(1, ChronoUnit.MINUTES)
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, UUID.fromString("00000000-0000-0000-0000-000000000022"))
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://storage.example.com/photos/later-terminal.jpg")
            set(it.status, "FAILED")
            set(it.updatedAt, laterChangedAt)
        }
        val unseenResponse = client.get("/api/photo/activity/unseen") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val unseen = Json.parseToJsonElement(unseenResponse.bodyAsText()).jsonObject
        assertEquals(true, unseen["hasUnseen"]!!.jsonPrimitive.boolean)
        assertEquals(laterChangedAt.toString(), unseen["latestTerminalAt"]!!.jsonPrimitive.content)
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
