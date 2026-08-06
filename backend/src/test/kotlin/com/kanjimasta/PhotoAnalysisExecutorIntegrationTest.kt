package com.kanjimasta

import com.kanjimasta.core.ai.AiModelConfigRepository
import com.kanjimasta.core.ai.OpenRouterClient
import com.kanjimasta.core.db.*
import com.kanjimasta.modules.photo.PhotoAnalysisExecutor
import com.kanjimasta.modules.photo.PhotoAnalysisRepository
import com.kanjimasta.modules.photo.PhotoRepository
import com.kanjimasta.support.PersistenceTest
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.ktorm.dsl.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PhotoAnalysisExecutorIntegrationTest : PersistenceTest() {
    @Test
    fun `photo job claims downloads enriches and writes terminal result directly`() = runBlocking {
        val kanjiId = seedConfigurationAndKanji()
        val session = PhotoRepository(db).createSession(
            userId = "photo-user",
            imageUrl = "https://images.test/photo.jpg",
        )
        var requestedModel = ""
        val http = HttpClient(MockEngine { request ->
            if (request.url.host == "images.test") {
                respond(
                    content = byteArrayOf(1, 2, 3),
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Image.JPEG.toString()),
                )
            } else {
                requestedModel = Json.parseToJsonElement((request.body as TextContent).text)
                    .jsonObject["model"]!!.jsonPrimitive.content
                respond(
                    """{"model":"vision/actual","choices":[{"message":{"content":"[{\"character\":\"日\",\"recommended\":true,\"whyUseful\":\"daily\",\"exampleWords\":[]}]"}}],"usage":{"cost":"0.0025"}}""",
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        })
        val configs = AiModelConfigRepository(db)
        val executor = PhotoAnalysisExecutor(
            PhotoAnalysisRepository(db, configs),
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
            http,
        )

        assertTrue(executor.run(UUID.fromString(session.id), claimedBy = "photo-execution"))

        assertEquals("vision/model", requestedModel)
        val result = db.from(PhotoSessionTable).select()
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { Triple(it[PhotoSessionTable.status], it[PhotoSessionTable.costMicrodollars], it[PhotoSessionTable.rawAiResponse]) }
            .single()
        assertEquals("DONE", result.first)
        assertEquals(2_500, result.second)
        val enriched = Json.parseToJsonElement(result.third!!)
            .jsonArray.single().jsonObject
        assertEquals(kanjiId.toString(), enriched["kanjiMasterId"]?.jsonPrimitive?.content)
        assertEquals("done", db.from(JobAttemptTable).select(JobAttemptTable.status)
            .map { it[JobAttemptTable.status] }.single())
        assertEquals(1, db.from(UserCostTable).select().totalRecordsInAllPages)
    }

    @Test
    fun `photo job rejects an oversized download before calling OpenRouter`() = runBlocking {
        seedConfigurationAndKanji()
        val session = PhotoRepository(db).createSession(
            userId = "oversized-photo-user",
            imageUrl = "https://images.test/too-large.jpg",
        )
        var providerCalls = 0
        val http = HttpClient(MockEngine { request ->
            if (request.url.host == "images.test") {
                respond(
                    content = byteArrayOf(1, 2, 3, 4),
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Image.JPEG.toString()),
                )
            } else {
                providerCalls++
                error("OpenRouter must not be called for an oversized image")
            }
        })
        val configs = AiModelConfigRepository(db)
        val executor = PhotoAnalysisExecutor(
            PhotoAnalysisRepository(db, configs),
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
            http,
            maxImageBytes = 3,
        )

        assertEquals(false, executor.run(UUID.fromString(session.id), claimedBy = "photo-execution"))
        assertEquals(0, providerCalls)
        assertEquals("FAILED", db.from(PhotoSessionTable).select(PhotoSessionTable.status)
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { it[PhotoSessionTable.status] }.single())
    }

    private fun seedConfigurationAndKanji(): UUID {
        db.insert(AiModelConfigTable) {
            set(it.status, "active")
            set(it.photoAnalysisModel, "vision/model")
            set(it.quizGenerationModel, "quiz/model")
            set(it.wordDiscoveryModel, "discovery/model")
            set(it.validationStatus, "passed")
            set(it.createdBy, "test")
        }
        val id = UUID.randomUUID()
        db.insert(KanjiMasterTable) {
            set(it.id, id)
            set(it.character, "日")
            set(it.onyomi, listOf("ニチ"))
            set(it.kunyomi, listOf("ひ"))
            set(it.meanings, listOf("day"))
            set(it.frequency, 5)
        }
        return id
    }
}
