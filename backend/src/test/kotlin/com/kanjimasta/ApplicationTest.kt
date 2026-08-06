package com.kanjimasta

import com.kanjimasta.support.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

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
