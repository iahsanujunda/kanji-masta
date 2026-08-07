package com.kanjimasta.photo

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserWordsTable
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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.ktorm.dsl.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CaptureWordDiscoveryExecutorIntegrationTest : PersistenceTest() {
    @Test
    fun `worker publishes only present normalized words in deterministic order without enrollment`() = runBlocking {
        seedConfiguration()
        val kanji = listOf("運", "転", "見", "合").associateWith { character ->
            UUID.randomUUID().also { id ->
                db.insert(KanjiMasterTable) {
                    set(it.id, id)
                    set(it.character, character)
                    set(it.onyomi, emptyList())
                    set(it.kunyomi, emptyList())
                    set(it.meanings, emptyList())
                }
            }
        }
        val sessionId = readyCapture("本日は運転見合わせです")
        val task = (CaptureWordDiscoveryRepository(db).enqueue("word-user", sessionId)
            as CaptureWordDiscoveryEnqueueResult.Accepted).value
        var requestedModel = ""
        var requestedReasoning = ""
        val http = HttpClient(MockEngine { request ->
            val requestBody = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            requestedModel = requestBody["model"]!!.jsonPrimitive.content
            requestedReasoning = requestBody["reasoning"]!!.jsonObject["effort"]!!.jsonPrimitive.content
            val content = """[
                {"surfaceText":"運転見合わせ","lemma":"運転見合わせ","reading":"ウンテンミアワセ","meaning":"service suspension"},
                {"surfaceText":"運転見合わせ","lemma":"運転見合わせ","reading":"うんてんみあわせ","meaning":"suspension"},
                {"surfaceText":"振替輸送","lemma":"振替輸送","reading":"ふりかえゆそう","meaning":"alternative transportation"}
            ]""".trimIndent()
            respond(
                """{"choices":[{"message":{"content":${Json.encodeToString(content)}}}],"usage":{"cost":0.001}}""",
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val executor = CaptureWordDiscoveryExecutor(
            CaptureWordDiscoveryRepository(db),
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
        )

        assertTrue(executor.run(task.taskId, claimedBy = "word-execution"))

        assertEquals("discovery/model", requestedModel)
        assertEquals("low", requestedReasoning)
        val rows = db.from(PhotoSessionWordTable).select().map { row ->
            Triple(
                row[PhotoSessionWordTable.normalizedLemma],
                row[PhotoSessionWordTable.normalizedReading],
                row[PhotoSessionWordTable.kanjiIds],
            )
        }
        assertEquals(1, rows.size)
        assertEquals("運転見合わせ", rows.single().first)
        assertEquals("うんてんみあわせ", rows.single().second)
        assertEquals(listOf(kanji.getValue("運"), kanji.getValue("転"), kanji.getValue("見"), kanji.getValue("合")).map(UUID::toString), rows.single().third)
        assertEquals(0, db.from(UserWordsTable).select().totalRecordsInAllPages)
        assertEquals("DONE", db.from(PhotoSessionTaskTable).select(PhotoSessionTaskTable.status)
            .where { PhotoSessionTaskTable.id eq task.taskId }.map { it[PhotoSessionTaskTable.status] }.single())
        assertEquals("done", db.from(JobAttemptTable).select(JobAttemptTable.status)
            .where { JobAttemptTable.jobId eq task.taskId }.map { it[JobAttemptTable.status] }.single())
        assertEquals("READY", db.from(PhotoSessionTable).select(PhotoSessionTable.processingStatus)
            .where { PhotoSessionTable.id eq sessionId }.map { it[PhotoSessionTable.processingStatus] }.single())
    }

    private fun seedConfiguration() {
        db.insert(AiModelConfigTable) {
            set(it.status, "active")
            set(it.photoAnalysisModel, "vision/model")
            set(it.translationModel, "translation/model")
            set(it.quizGenerationModel, "quiz/model")
            set(it.wordDiscoveryModel, "discovery/model")
            set(it.wordDiscoveryReasoning, "low")
            set(it.validationStatus, "passed")
            set(it.createdBy, "test")
        }
    }

    private fun readyCapture(fullText: String): UUID = UUID.randomUUID().also { id ->
        db.insert(PhotoSessionTable) {
            set(it.id, id)
            set(it.userId, "word-user")
            set(it.imageUrl, "https://images.test/words.jpg")
            set(it.status, "DONE")
            set(it.processingStatus, "READY")
            set(it.pipelineVersion, 2)
            set(it.fullText, fullText)
        }
    }
}
