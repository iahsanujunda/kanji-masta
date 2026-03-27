package com.kanjimasta

import com.kanjimasta.core.db.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.ktorm.dsl.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OnboardingIntegrationTest {

    private fun cleanupTestUser(db: org.ktorm.database.Database, userId: String) {
        db.useConnection { conn ->
            conn.createStatement().execute("DELETE FROM user_words WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM quiz_generation_job WHERE user_id = '$userId'")
            conn.createStatement().execute("DELETE FROM user_kanji WHERE user_id = '$userId'")
        }
    }

    /**
     * Seeds N kanji in kanji_master with JLPT 5. Returns their IDs.
     * Uses unique characters per test to avoid collisions.
     */
    private fun seedKanjiBatch(
        db: org.ktorm.database.Database,
        chars: List<String>,
    ): List<UUID> {
        return chars.map { char ->
            db.from(KanjiMasterTable)
                .select(KanjiMasterTable.id)
                .where { KanjiMasterTable.character eq char }
                .map { it[KanjiMasterTable.id]!! }
                .firstOrNull()
                ?: UUID.randomUUID().also { id ->
                    db.insert(KanjiMasterTable) {
                        set(it.id, id)
                        set(it.character, char)
                        set(it.onyomi, listOf("テスト"))
                        set(it.kunyomi, emptyList())
                        set(it.meanings, listOf("test-$char"))
                        set(it.frequency, 1)
                        set(it.jlpt, 5)
                    }
                }
        }
    }

    // =========================================================================
    // Test 1: Incremental batches don't duplicate
    // =========================================================================

    @Test
    fun `POST onboarding select with two batches creates all kanji without duplicates`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        // Use rare kanji unlikely to conflict with other tests
        val batch1Chars = listOf("亜", "哀", "挨", "曖", "握")
        val batch2Chars = listOf("渦", "嘘", "唄", "鬱", "畝")
        val batch1Ids = seedKanjiBatch(TestDatabase.db, batch1Chars)
        val batch2Ids = seedKanjiBatch(TestDatabase.db, batch2Chars)

        try {
            val client = jsonClient()

            // Save batch 1
            val selections1 = batch1Ids.map { """{"kanjiMasterId":"$it","status":"familiar"}""" }
            val resp1 = client.post("/api/onboarding/select") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[${selections1.joinToString(",")}]}""")
            }
            assertEquals(HttpStatusCode.OK, resp1.status)

            // Save batch 2
            val selections2 = batch2Ids.map { """{"kanjiMasterId":"$it","status":"learning"}""" }
            val resp2 = client.post("/api/onboarding/select") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[${selections2.joinToString(",")}]}""")
            }
            assertEquals(HttpStatusCode.OK, resp2.status)

            // Verify all 10 exist in user_kanji
            val allIds = batch1Ids + batch2Ids
            val savedCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where {
                    (UserKanjiTable.userId eq TEST_USER_ID) and
                        (UserKanjiTable.kanjiId inList allIds)
                }
                .totalRecordsInAllPages
            assertEquals(10, savedCount, "All 10 kanji from both batches should be saved")

            // Verify no duplicates — count should match distinct count
            val totalUserKanji = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where { UserKanjiTable.userId eq TEST_USER_ID }
                .map { it[UserKanjiTable.kanjiId] }
            val distinctCount = totalUserKanji.toSet().size
            assertEquals(totalUserKanji.size, distinctCount, "No duplicates should exist")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test 2: GET onboarding/kanji excludes previously saved kanji
    // =========================================================================

    @Test
    fun `GET onboarding kanji excludes kanji saved in previous batch`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val batch1Chars = listOf("壱", "逸", "茨", "芋", "淫")
        val batch1Ids = seedKanjiBatch(TestDatabase.db, batch1Chars)

        try {
            val client = jsonClient()

            // Save batch 1
            val selections = batch1Ids.map { """{"kanjiMasterId":"$it","status":"familiar"}""" }
            val saveResp = client.post("/api/onboarding/select") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[${selections.joinToString(",")}]}""")
            }
            assertEquals(HttpStatusCode.OK, saveResp.status)

            // Fetch next batch — should NOT contain any of batch 1's kanji
            val fetchResp = client.get("/api/onboarding/kanji?offset=0&limit=50") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, fetchResp.status)

            val body = Json.parseToJsonElement(fetchResp.bodyAsText()).jsonObject
            val kanjiArray = body["kanji"]!!.jsonArray
            val returnedIds = kanjiArray.map {
                it.jsonObject["kanjiMasterId"]!!.jsonPrimitive.content
            }.toSet()

            // None of batch 1's IDs should appear
            for (id in batch1Ids) {
                assertTrue(
                    id.toString() !in returnedIds,
                    "Kanji $id from batch 1 should NOT appear in subsequent onboarding fetch"
                )
            }
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }

    // =========================================================================
    // Test 3: Complete after partial saves persists everything
    // =========================================================================

    @Test
    fun `POST onboarding complete after partial batch preserves saved kanji`() = testApplication {
        application { testModule(TestDatabase.db) }
        cleanupTestUser(TestDatabase.db, TEST_USER_ID)

        val batchChars = listOf("頃", "痕", "紺", "魂", "墾")
        val batchIds = seedKanjiBatch(TestDatabase.db, batchChars)

        try {
            val client = jsonClient()

            // Save one batch
            val selections = batchIds.map { """{"kanjiMasterId":"$it","status":"familiar"}""" }
            val saveResp = client.post("/api/onboarding/select") {
                header(HttpHeaders.Authorization, "Bearer test-token")
                contentType(ContentType.Application.Json)
                setBody("""{"selections":[${selections.joinToString(",")}]}""")
            }
            assertEquals(HttpStatusCode.OK, saveResp.status)

            // Complete onboarding (without saving more batches)
            val completeResp = client.post("/api/onboarding/complete") {
                header(HttpHeaders.Authorization, "Bearer test-token")
            }
            assertEquals(HttpStatusCode.OK, completeResp.status)

            // Verify onboarding_complete is true
            val settings = TestDatabase.db.from(UserSettingsTable)
                .select(UserSettingsTable.onboardingComplete)
                .where { UserSettingsTable.userId eq TEST_USER_ID }
                .map { it[UserSettingsTable.onboardingComplete] }
                .first()
            assertEquals(true, settings, "onboarding_complete should be true")

            // Verify batch kanji are still persisted
            val savedCount = TestDatabase.db.from(UserKanjiTable)
                .select()
                .where {
                    (UserKanjiTable.userId eq TEST_USER_ID) and
                        (UserKanjiTable.kanjiId inList batchIds)
                }
                .totalRecordsInAllPages
            assertEquals(5, savedCount, "All 5 kanji from the batch should still be saved")
        } finally {
            cleanupTestUser(TestDatabase.db, TEST_USER_ID)
        }
    }
}
