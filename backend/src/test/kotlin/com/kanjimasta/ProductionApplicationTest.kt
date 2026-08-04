package com.kanjimasta

import com.kanjimasta.support.PersistenceTest
import com.kanjimasta.support.configureWithTestDb
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class ProductionApplicationTest : PersistenceTest() {

    @Test
    fun `production module boots against the migrated database`() = testApplication {
        configureWithTestDb()

        assertEquals(HttpStatusCode.OK, client.get("/health").status)
    }
}
