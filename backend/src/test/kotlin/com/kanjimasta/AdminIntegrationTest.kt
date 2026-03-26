package com.kanjimasta

import com.kanjimasta.core.db.UserCostTable
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

class AdminIntegrationTest {

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
        // All returned jobs should be FAILED (or empty)
        for (job in jobs) {
            assertEquals("FAILED", job.jsonObject["status"]?.jsonPrimitive?.content)
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
    fun `POST admin jobs retry-all returns count`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.post("/api/admin/jobs/retry-all") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("retried"))
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
