package com.kanjimasta

import com.kanjimasta.core.db.KanjiMasterTable
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class KanjiIntegrationTest {

    private fun seedKanji(db: org.ktorm.database.Database) {
        // Insert test kanji if not already present
        val existing = db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id)
            .where { KanjiMasterTable.character eq "火" }
            .map { it[KanjiMasterTable.id] }
        if (existing.isNotEmpty()) return

        for ((char, on, kun, mean, freq) in listOf(
            listOf("火", "カ", "ひ", "fire", "10"),
            listOf("水", "スイ", "みず", "water", "11"),
            listOf("木", "モク", "き", "tree", "12"),
        )) {
            db.insert(KanjiMasterTable) {
                set(it.character, char)
                set(it.onyomi, listOf(on))
                set(it.kunyomi, listOf(kun))
                set(it.meanings, listOf(mean))
                set(it.frequency, freq.toInt())
                set(it.jlpt, 5)
            }
        }
    }

    @Test
    fun `GET kanji list returns valid response`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/kanji/list") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        // Response is a JSON array
        Json.parseToJsonElement(response.bodyAsText()).jsonArray
    }

    @Test
    fun `GET onboarding kanji returns valid response`() = testApplication {
        application { testModule(TestDatabase.db) }
        seedKanji(TestDatabase.db)
        val client = jsonClient()
        val response = client.get("/api/onboarding/kanji?offset=0&limit=50") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("kanji"))
        assertTrue(body.containsKey("hasMore"))
        // kanji may be empty if user already selected all JLPT 5 kanji — that's valid
        body["kanji"]?.jsonArray ?: error("kanji should be a JSON array")
    }

    @Test
    fun `POST onboarding select saves kanji`() = testApplication {
        application { testModule(TestDatabase.db) }
        seedKanji(TestDatabase.db)
        val client = jsonClient()

        // Get a kanji ID from onboarding
        val onboardingResp = client.get("/api/onboarding/kanji?offset=0&limit=50") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, onboardingResp.status)
        val kanjiList = Json.parseToJsonElement(onboardingResp.bodyAsText())
            .jsonObject["kanji"]?.jsonArray ?: error("no kanji")
        if (kanjiList.isEmpty()) return@testApplication

        val kanjiMasterId = kanjiList.last().jsonObject["kanjiMasterId"]?.jsonPrimitive?.content ?: return@testApplication

        // Select it as "familiar"
        val selectResp = client.post("/api/onboarding/select") {
            header(HttpHeaders.Authorization, "Bearer test-token")
            contentType(ContentType.Application.Json)
            setBody("""{"selections": [{"kanjiMasterId": "$kanjiMasterId", "status": "familiar"}]}""")
        }
        assertEquals(HttpStatusCode.OK, selectResp.status)
    }

    @Test
    fun `GET pending jobs returns count`() = testApplication {
        application { testModule(TestDatabase.db) }
        val client = jsonClient()
        val response = client.get("/api/kanji/jobs/pending") {
            header(HttpHeaders.Authorization, "Bearer test-token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertTrue(body.containsKey("pending"))
    }
}
