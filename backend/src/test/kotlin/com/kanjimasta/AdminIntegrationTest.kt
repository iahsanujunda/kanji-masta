package com.kanjimasta

import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.ai.CatalogModel
import com.kanjimasta.ai.ModelCatalogGateway
import com.kanjimasta.ai.ModelValidationResult
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AdminIntegrationTest : com.kanjimasta.support.PersistenceTest() {

    @Test
    fun `submitting a valid model configuration activates atomically and drives status`() = testApplication {
        val catalog = object : ModelCatalogGateway {
            override suspend fun search(workload: String, query: String?) = emptyList<CatalogModel>()
            override suspend fun validate(models: Map<String, String>) = ModelValidationResult(true)
        }
        application {
            testModule(
                TestDatabase.db,
                modelCatalogGateway = catalog,
            )
        }
        val client = jsonClient()

        val down = client.get("/api/admin/status") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals("down", Json.parseToJsonElement(down.bodyAsText()).jsonObject["status"]!!.jsonPrimitive.content)

        val saved = client.put("/api/admin/model-config") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody(
                """{
                  "photoAnalysisModel":"vision/model",
                  "quizGenerationModel":"text/model",
                  "wordDiscoveryModel":"text/model"
                }""".trimIndent(),
            )
        }
        assertEquals(HttpStatusCode.OK, saved.status)
        assertEquals("active", Json.parseToJsonElement(saved.bodyAsText()).jsonObject["status"]!!.jsonPrimitive.content)

        val status = client.get("/api/admin/status") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals("operational", Json.parseToJsonElement(status.bodyAsText()).jsonObject["status"]!!.jsonPrimitive.content)
    }

    @Test
    fun `photo rerun snapshots the active configuration model`() = testApplication {
        val catalog = object : ModelCatalogGateway {
            override suspend fun search(workload: String, query: String?) = emptyList<CatalogModel>()
            override suspend fun validate(models: Map<String, String>) = ModelValidationResult(true)
        }
        application { testModule(TestDatabase.db, modelCatalogGateway = catalog) }
        val client = jsonClient()
        val saved = client.put("/api/admin/model-config") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody(
                """{"photoAnalysisModel":"vision/v2","quizGenerationModel":"text/v2","wordDiscoveryModel":"text/v2"}""",
            )
        }
        val version = Json.parseToJsonElement(saved.bodyAsText()).jsonObject["version"]!!.jsonPrimitive.long
        val photoId = UUID.randomUUID()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, photoId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://example.test/expired.jpg")
            set(it.storagePath, "$TEST_USER_ID/photo.jpg")
            set(it.status, "FAILED")
            set(it.failureCode, "provider_failed")
            set(it.attempts, 1)
        }

        val rerun = client.post("/api/admin/jobs/photo_analysis/$photoId/rerun") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, rerun.status)
        val detail = client.get("/api/admin/jobs/photo_analysis/$photoId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val attempt = Json.parseToJsonElement(detail.bodyAsText()).jsonObject["attempts"]!!
            .jsonArray.last().jsonObject
        assertEquals(version, attempt["modelConfigVersion"]!!.jsonPrimitive.long)
        assertEquals("vision/v2", attempt["modelId"]!!.jsonPrimitive.content)
    }

    @Test
    fun `rejected model configuration is not saved and preserves the active config`() = testApplication {
        var validationPasses = true
        val catalog = object : ModelCatalogGateway {
            override suspend fun search(workload: String, query: String?) = emptyList<CatalogModel>()
            override suspend fun validate(models: Map<String, String>) =
                ModelValidationResult(validationPasses, if (validationPasses) null else "unsupported_model")
        }
        application { testModule(TestDatabase.db, modelCatalogGateway = catalog) }
        val client = jsonClient()
        suspend fun submit(photo: String) = client.put("/api/admin/model-config") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"photoAnalysisModel":"$photo","quizGenerationModel":"text/model","wordDiscoveryModel":"text/model"}""")
            }

        assertEquals(HttpStatusCode.OK, submit("vision/one").status)
        validationPasses = false
        assertEquals(HttpStatusCode.UnprocessableEntity, submit("vision/broken").status)

        val configs = client.get("/api/admin/model-config") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        val savedConfigs = Json.parseToJsonElement(configs.bodyAsText()).jsonObject["configs"]!!.jsonArray
        assertEquals(1, savedConfigs.size)
        val active = savedConfigs.single().jsonObject
        assertEquals("active", active["status"]!!.jsonPrimitive.content)
        assertEquals("vision/one", active["photoAnalysisModel"]!!.jsonPrimitive.content)
    }

    @Test
    fun `admin model search returns safe backend catalog data`() = testApplication {
        val catalog = object : ModelCatalogGateway {
            override suspend fun search(workload: String, query: String?): List<CatalogModel> = listOf(
                CatalogModel(
                    id = "qwen/qwen-vision",
                    canonicalSlug = "qwen/qwen-vision",
                    name = "Qwen Vision",
                    inputModalities = listOf("text", "image"),
                    outputModalities = listOf("text"),
                    contextLength = 131072,
                    supportedParameters = listOf("structured_outputs"),
                    promptPrice = "0.000001",
                    completionPrice = "0.000002",
                ),
            )
            override suspend fun validate(models: Map<String, String>) = ModelValidationResult(true)
        }
        application { testModule(TestDatabase.db, modelCatalogGateway = catalog) }

        val response = jsonClient().get("/api/admin/models?workload=photo_analysis&q=qwen") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("qwen/qwen-vision", body["models"]!!.jsonArray.single().jsonObject["id"]!!.jsonPrimitive.content)
        assertTrue("apiKey" !in response.bodyAsText())
    }

    @Test
    fun `GET admin jobs returns photo and quiz durable work`() = testApplication {
        val photoId = UUID.randomUUID()
        val kanjiId = UUID.randomUUID()
        val quizJobId = UUID.randomUUID()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, photoId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://example.test/photo.jpg")
            set(it.storagePath, "$TEST_USER_ID/photo.jpg")
            set(it.status, "PROCESSING")
        }
        TestDatabase.db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, "駅")
            set(it.onyomi, listOf("エキ"))
            set(it.kunyomi, emptyList())
            set(it.meanings, listOf("station"))
        }
        TestDatabase.db.insert(QuizGenerationJobTable) {
            set(it.id, quizJobId)
            set(it.userId, TEST_USER_ID)
            set(it.kanjiId, kanjiId)
        }

        application { testModule(TestDatabase.db) }
        val response = jsonClient().get("/api/admin/jobs") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val jobs = Json.parseToJsonElement(response.bodyAsText()).jsonObject["jobs"]!!.jsonArray
        assertEquals(setOf("photo_analysis", "quiz_generation"), jobs.map {
            it.jsonObject["type"]!!.jsonPrimitive.content
        }.toSet())
    }

    @Test
    fun `admin can mark a processing photo failed`() = testApplication {
        val photoId = UUID.randomUUID()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, photoId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://example.test/photo.jpg")
            set(it.storagePath, "$TEST_USER_ID/photo.jpg")
            set(it.status, "PROCESSING")
        }
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        val failResponse = client.post("/api/admin/jobs/photo_analysis/$photoId/fail") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, failResponse.status)
        val sessionResponse = client.get("/api/photo/session/$photoId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals("failed", Json.parseToJsonElement(sessionResponse.bodyAsText())
            .jsonObject["status"]!!.jsonPrimitive.content)
    }

    @Test
    fun `rerun preserves failed photo attempt and appends a pending attempt`() = testApplication {
        val photoId = UUID.randomUUID()
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, photoId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://example.test/expired-photo.jpg")
            set(it.storagePath, "$TEST_USER_ID/photo.jpg")
            set(it.status, "FAILED")
            set(it.failureCode, "provider_failed")
            set(it.attempts, 1)
        }
        application { testModule(TestDatabase.db) }
        val client = jsonClient()

        val rerunResponse = client.post("/api/admin/jobs/photo_analysis/$photoId/rerun") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, rerunResponse.status)

        val detailResponse = client.get("/api/admin/jobs/photo_analysis/$photoId") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, detailResponse.status)
        val detail = Json.parseToJsonElement(detailResponse.bodyAsText()).jsonObject
        assertEquals("processing", detail["job"]!!.jsonObject["status"]!!.jsonPrimitive.content)
        assertEquals(listOf("failed", "pending"), detail["attempts"]!!.jsonArray.map {
            it.jsonObject["status"]!!.jsonPrimitive.content
        })
    }

    @Test
    fun `photo rerun dispatches durable execution`() = testApplication {
        val photoId = UUID.randomUUID()
        var dispatched = false
        TestDatabase.db.insert(PhotoSessionTable) {
            set(it.id, photoId)
            set(it.userId, TEST_USER_ID)
            set(it.imageUrl, "https://example.test/expired-photo.jpg")
            set(it.storagePath, "$TEST_USER_ID/photo.jpg")
            set(it.status, "FAILED")
            set(it.failureCode, "provider_failed")
        }
        application {
            testModule(
                TestDatabase.db,
                adminJobDispatcher = { type, id, userId ->
                    dispatched = type == "photo_analysis" && id == photoId && userId == TEST_USER_ID
                    true
                },
            )
        }

        val response = jsonClient().post("/api/admin/jobs/photo_analysis/$photoId/rerun") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(dispatched)
    }

    private fun seedCostData(db: org.ktorm.database.Database) {
        // Clean first
        db.delete(UserCostTable) { it.userId eq "cost-user-a" }
        db.delete(UserCostTable) { it.userId eq "cost-user-b" }

        // User A: 2 photo + 1 quizgen
        db.insert(UserCostTable) {
            set(it.userId, "cost-user-a")
            set(it.operationType, "PHOTO_ANALYSIS")
            set(it.operationId, UUID.randomUUID())
            set(it.costMicrodollars, 1_000_000L)
        }
        db.insert(UserCostTable) {
            set(it.userId, "cost-user-a")
            set(it.operationType, "PHOTO_ANALYSIS")
            set(it.operationId, UUID.randomUUID())
            set(it.costMicrodollars, 500_000L)
        }
        db.insert(UserCostTable) {
            set(it.userId, "cost-user-a")
            set(it.operationType, "QUIZ_GENERATION")
            set(it.operationId, UUID.randomUUID())
            set(it.costMicrodollars, 2_000_000L)
        }

        // User B: 1 photo
        db.insert(UserCostTable) {
            set(it.userId, "cost-user-b")
            set(it.operationType, "PHOTO_ANALYSIS")
            set(it.operationId, UUID.randomUUID())
            set(it.costMicrodollars, 750_000L)
        }
    }

    private fun cleanCostData(db: org.ktorm.database.Database) {
        db.delete(UserCostTable) { it.userId eq "cost-user-a" }
        db.delete(UserCostTable) { it.userId eq "cost-user-b" }
    }

    @Test
    fun `GET admin cost returns valid response`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/admin/cost") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("totalMicrodollars"))
        assertTrue(body.containsKey("totalDollars"))
        assertTrue(body.containsKey("byUser"))
        assertTrue(body.containsKey("byDay"))
    }

    @Test
    fun `GET admin jobs returns counts and list`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/admin/jobs") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("jobs"))
        assertTrue(body.containsKey("counts"))
        val counts = body["counts"]!!.jsonObject
        assertTrue(counts.containsKey("pending"))
        assertTrue(counts.containsKey("failed"))
        assertTrue(counts.containsKey("done"))
    }

    @Test
    fun `GET admin jobs with status filter works`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/admin/jobs?status=FAILED") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val jobs = body["jobs"]!!.jsonArray
        // All returned jobs use the normalized lowercase status union.
        for (job in jobs) {
            assertEquals("failed", job.jsonObject["status"]?.jsonPrimitive?.content)
        }
    }

    @Test
    fun `GET admin quizzes returns valid response`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/admin/quizzes") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("quizzes"))
        assertTrue(body.containsKey("total"))
    }

    @Test
    fun `GET admin quizzes with search query works`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/admin/quizzes?q=test") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
    }

    @Test
    fun `legacy destructive retry-all endpoint is removed`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.post("/api/admin/jobs/retry-all") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    // --- Cost data accuracy tests ---

    @Test
    fun `GET admin cost returns correct totals from user_cost table`() = testApplication {
        application { testModule(TestDatabase.db) }
        seedCostData(TestDatabase.db)
        try {
            val client = jsonClient()
            val response = client.get("/api/admin/cost") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject

            val total = body["totalMicrodollars"]!!.jsonPrimitive.long
            // User A: 1M + 500K + 2M = 3.5M, User B: 750K = total 4.25M
            assertTrue(total >= 4_250_000L, "Total should include seeded cost data, got $total")

            val byUser = body["byUser"]!!.jsonArray
            assertTrue(byUser.size >= 2, "Should have at least 2 users")
        } finally {
            cleanCostData(TestDatabase.db)
        }
    }

    @Test
    fun `GET admin cost returns correct per-user breakdown`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanCostData(TestDatabase.db)
        seedCostData(TestDatabase.db)
        try {
            val client = jsonClient()
            val response = client.get("/api/admin/cost") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val byUser = body["byUser"]!!.jsonArray

            val userA = byUser.firstOrNull {
                it.jsonObject["userId"]?.jsonPrimitive?.content == "cost-user-a"
            }?.jsonObject
            assertNotNull(userA, "Should find cost-user-a in breakdown")
            assertEquals(1_500_000L, userA["photoMicrodollars"]!!.jsonPrimitive.long, "User A photo cost: 1M + 500K")
            assertEquals(2_000_000L, userA["quizGenMicrodollars"]!!.jsonPrimitive.long, "User A quizgen cost")
            assertEquals(3_500_000L, userA["totalMicrodollars"]!!.jsonPrimitive.long, "User A total")

            val userB = byUser.firstOrNull {
                it.jsonObject["userId"]?.jsonPrimitive?.content == "cost-user-b"
            }?.jsonObject
            assertNotNull(userB, "Should find cost-user-b in breakdown")
            assertEquals(750_000L, userB["photoMicrodollars"]!!.jsonPrimitive.long, "User B photo cost")
            assertEquals(0L, userB["quizGenMicrodollars"]!!.jsonPrimitive.long, "User B has no quizgen cost")
        } finally {
            cleanCostData(TestDatabase.db)
        }
    }
}
