package com.kanjimasta

import com.kanjimasta.core.db.UserInviteTable
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class InviteIntegrationTest {

    private fun cleanupInvites(db: org.ktorm.database.Database, email: String) {
        db.delete(UserInviteTable) { it.email eq email }
    }

    // --- Admin Endpoints ---

    @Test
    fun `POST admin invite creates invite and returns details`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val testEmail = "invite-test@example.com"
        cleanupInvites(TestDatabase.db, testEmail)

        try {
            val response = client.post("/api/admin/invite") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"email": "$testEmail"}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals(testEmail, body["email"]?.jsonPrimitive?.content)
            assertEquals("PENDING", body["status"]?.jsonPrimitive?.content)
            val code = body["code"]?.jsonPrimitive?.content
            assertNotNull(code)
            assertEquals(10, code.length, "Invite code should be 10 characters")
        } finally {
            cleanupInvites(TestDatabase.db, testEmail)
        }
    }

    @Test
    fun `POST admin invite returns existing invite for duplicate email`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val testEmail = "duplicate-test@example.com"
        cleanupInvites(TestDatabase.db, testEmail)

        try {
            // Create first invite
            val resp1 = client.post("/api/admin/invite") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"email": "$testEmail"}""")
            }
            val body1 = Json.parseToJsonElement(resp1.bodyAsText()).jsonObject
            val code1 = body1["code"]?.jsonPrimitive?.content

            // Create duplicate
            val resp2 = client.post("/api/admin/invite") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"email": "$testEmail"}""")
            }
            assertEquals(HttpStatusCode.OK, resp2.status)
            val body2 = Json.parseToJsonElement(resp2.bodyAsText()).jsonObject
            assertEquals(code1, body2["code"]?.jsonPrimitive?.content, "Should return same invite")
        } finally {
            cleanupInvites(TestDatabase.db, testEmail)
        }
    }

    @Test
    fun `GET admin invites returns list`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val testEmail = "list-test@example.com"
        cleanupInvites(TestDatabase.db, testEmail)

        try {
            // Create an invite first
            client.post("/api/admin/invite") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"email": "$testEmail"}""")
            }

            val response = client.get("/api/admin/invites") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val invites = body["invites"]?.jsonArray ?: error("missing invites array")
            assertTrue(invites.any {
                it.jsonObject["email"]?.jsonPrimitive?.content == testEmail
            }, "Should contain the created invite")
        } finally {
            cleanupInvites(TestDatabase.db, testEmail)
        }
    }

    @Test
    fun `PUT admin invite revoke sets status to REVOKED`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val testEmail = "revoke-test@example.com"
        cleanupInvites(TestDatabase.db, testEmail)

        try {
            // Create invite
            val createResp = client.post("/api/admin/invite") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"email": "$testEmail"}""")
            }
            val inviteId = Json.parseToJsonElement(createResp.bodyAsText())
                .jsonObject["id"]?.jsonPrimitive?.content ?: error("no id")

            // Revoke it
            val revokeResp = client.put("/api/admin/invite/$inviteId/revoke") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, revokeResp.status)

            // Verify via list
            val listResp = client.get("/api/admin/invites") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            val invites = Json.parseToJsonElement(listResp.bodyAsText())
                .jsonObject["invites"]?.jsonArray ?: error("missing invites")
            val revoked = invites.firstOrNull {
                it.jsonObject["email"]?.jsonPrimitive?.content == testEmail
            }
            assertEquals("REVOKED", revoked?.jsonObject?.get("status")?.jsonPrimitive?.content)
        } finally {
            cleanupInvites(TestDatabase.db, testEmail)
        }
    }

    // --- Public Endpoint ---

    @Test
    fun `GET invite details returns email and status for valid code`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val testEmail = "details-test@example.com"
        cleanupInvites(TestDatabase.db, testEmail)

        try {
            // Create invite (as admin)
            val createResp = client.post("/api/admin/invite") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"email": "$testEmail"}""")
            }
            val code = Json.parseToJsonElement(createResp.bodyAsText())
                .jsonObject["code"]?.jsonPrimitive?.content ?: error("no code")

            // Fetch details (no auth!)
            val response = client.get("/api/invite/$code/details")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals(testEmail, body["email"]?.jsonPrimitive?.content)
            assertEquals("PENDING", body["status"]?.jsonPrimitive?.content)
        } finally {
            cleanupInvites(TestDatabase.db, testEmail)
        }
    }

    @Test
    fun `GET invite details returns 404 for invalid code`() = testApplication {
        application { testModule(TestDatabase.db) }
        val response = client.get("/api/invite/nonexistent1/details")
        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
