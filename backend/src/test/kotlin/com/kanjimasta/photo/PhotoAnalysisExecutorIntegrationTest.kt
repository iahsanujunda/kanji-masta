package com.kanjimasta.photo

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.jobs.JobDispatcher
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.photo.PhotoAnalysisExecutor
import com.kanjimasta.photo.PhotoAnalysisRepository
import com.kanjimasta.photo.PhotoRepository
import com.kanjimasta.support.PersistenceTest
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpRequestTimeoutException
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PhotoAnalysisExecutorIntegrationTest : PersistenceTest() {
    @Test
    fun `photo job claims downloads enriches and writes terminal result directly`() = runBlocking {
        val kanjiId = seedConfigurationAndKanji()
        val session = PhotoRepository(db).createSession(
            userId = "photo-user",
            imageUrl = "https://images.test/photo.jpg",
        )
        val requestedModels = mutableListOf<String>()
        val http = HttpClient(MockEngine { request ->
            if (request.url.host == "images.test") {
                respond(
                    content = byteArrayOf(1, 2, 3),
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Image.JPEG.toString()),
                )
            } else {
                val requestedModel = Json.parseToJsonElement((request.body as TextContent).text)
                    .jsonObject["model"]!!.jsonPrimitive.content
                requestedModels += requestedModel
                val content = if (requestedModel == "vision/model") {
                    "[{\"fullText\":\"本日は運休です\",\"kanji\":[{\"character\":\"日\",\"recommendationRank\":0,\"whyUseful\":\"daily\",\"exampleWords\":[]}]}]"
                } else {
                    "[{\"translation\":\"Service is suspended today.\"}]"
                }
                respond(
                    """{"model":"$requestedModel","choices":[{"message":{"content":${Json.encodeToString(content)}}}],"usage":{"cost":"0.0025"}}""",
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        })
        val configs = AiModelConfigRepository(db)
        val dispatchedTasks = mutableListOf<UUID>()
        val executor = PhotoAnalysisExecutor(
            PhotoAnalysisRepository(db, configs),
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
            http,
            JobDispatcher { environment ->
                dispatchedTasks += UUID.fromString(environment.getValue("CAPTURE_TASK_ID"))
                true
            },
        )
        val visualTaskId = requiredTaskId(session.id, "VISUAL_ANALYSIS")

        assertTrue(executor.run(visualTaskId, claimedBy = "photo-execution"))

        assertEquals(listOf("vision/model"), requestedModels)
        assertEquals("PROCESSING", db.from(PhotoSessionTable).select(PhotoSessionTable.status)
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { it[PhotoSessionTable.status] }.single())
        assertEquals(1, dispatchedTasks.size)
        assertTrue(executor.run(dispatchedTasks.single(), claimedBy = "translation-execution"))
        assertEquals(listOf("vision/model", "translation/model"), requestedModels)
        val result = db.from(PhotoSessionTable).select()
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { Triple(it[PhotoSessionTable.status], it[PhotoSessionTable.costMicrodollars], it[PhotoSessionTable.rawAiResponse]) }
            .single()
        assertEquals("DONE", result.first)
        assertEquals(5_000, result.second)
        val enriched = Json.parseToJsonElement(result.third!!)
            .jsonArray.single().jsonObject
        assertEquals(kanjiId.toString(), enriched["kanjiMasterId"]?.jsonPrimitive?.content)
        assertEquals("本日は運休です", db.from(PhotoSessionTable).select(PhotoSessionTable.fullText)
            .map { it[PhotoSessionTable.fullText] }.single())
        assertEquals("Service is suspended today.", db.from(PhotoSessionTable).select(PhotoSessionTable.translation)
            .map { it[PhotoSessionTable.translation] }.single())
        assertEquals(1, db.from(PhotoSessionKanjiTable).select().totalRecordsInAllPages)
        assertEquals(listOf("done", "done"), db.from(JobAttemptTable).select(JobAttemptTable.status)
            .orderBy(JobAttemptTable.attemptNumber.asc())
            .map { it[JobAttemptTable.status] })
        assertEquals(2, db.from(UserCostTable).select().totalRecordsInAllPages)
    }

    @Test
    fun `retrying failed translation never reruns visual analysis`() = runBlocking {
        seedConfigurationAndKanji()
        val photoRepository = PhotoRepository(db)
        val session = photoRepository.createSession(
            userId = "translation-retry-user",
            imageUrl = "https://images.test/photo.jpg",
        )
        val requestedModels = mutableListOf<String>()
        var translationCalls = 0
        val http = HttpClient(MockEngine { request ->
            if (request.url.host == "images.test") {
                respond(
                    content = byteArrayOf(1, 2, 3),
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Image.JPEG.toString()),
                )
            } else {
                val model = Json.parseToJsonElement((request.body as TextContent).text)
                    .jsonObject["model"]!!.jsonPrimitive.content
                requestedModels += model
                val content = if (model == "vision/model") {
                    "[{\"fullText\":\"本日\",\"kanji\":[{\"character\":\"日\",\"recommendationRank\":0,\"whyUseful\":\"daily\",\"exampleWords\":[]}]}]"
                } else {
                    translationCalls++
                    if (translationCalls == 1) "[]" else "[{\"translation\":\"Today\"}]"
                }
                respond(
                    """{"model":"$model","choices":[{"message":{"content":${Json.encodeToString(content)}}}],"usage":{"cost":"0.001"}}""",
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        })
        val dispatchedTasks = mutableListOf<UUID>()
        val executor = PhotoAnalysisExecutor(
            PhotoAnalysisRepository(db, AiModelConfigRepository(db)),
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
            http,
            JobDispatcher { environment ->
                dispatchedTasks += UUID.fromString(environment.getValue("CAPTURE_TASK_ID"))
                true
            },
        )

        assertTrue(executor.run(requiredTaskId(session.id, "VISUAL_ANALYSIS"), claimedBy = "visual-execution"))
        val translationTaskId = dispatchedTasks.single()
        assertFalse(executor.run(translationTaskId, claimedBy = "translation-execution-1"))

        val retry = assertNotNull(photoRepository.prepareUserRetry(UUID.fromString(session.id), "translation-retry-user"))
        assertEquals("TRANSLATION", retry.type)
        assertEquals(translationTaskId, retry.id)
        assertTrue(executor.run(retry.id, claimedBy = "translation-execution-2"))

        assertEquals(listOf("vision/model", "translation/model", "translation/model"), requestedModels)
        assertEquals("DONE", db.from(PhotoSessionTable).select(PhotoSessionTable.status)
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { it[PhotoSessionTable.status] }.single())
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
            JobDispatcher { true },
            maxImageBytes = 3,
        )

        assertEquals(false, executor.run(requiredTaskId(session.id, "VISUAL_ANALYSIS"), claimedBy = "photo-execution"))
        assertEquals(0, providerCalls)
        assertEquals("FAILED", db.from(PhotoSessionTable).select(PhotoSessionTable.status)
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { it[PhotoSessionTable.status] }.single())
    }

    @Test
    fun `photo job persists provider request timeout distinctly`() = runBlocking {
        seedConfigurationAndKanji()
        val session = PhotoRepository(db).createSession(
            userId = "timed-out-photo-user",
            imageUrl = "https://images.test/photo.jpg",
        )
        val http = HttpClient(MockEngine { request ->
            if (request.url.host == "images.test") {
                respond(
                    content = byteArrayOf(1, 2, 3),
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Image.JPEG.toString()),
                )
            } else {
                throw HttpRequestTimeoutException(request)
            }
        })
        val configs = AiModelConfigRepository(db)
        val executor = PhotoAnalysisExecutor(
            PhotoAnalysisRepository(db, configs),
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
            http,
            JobDispatcher { true },
        )

        assertEquals(false, executor.run(requiredTaskId(session.id, "VISUAL_ANALYSIS"), claimedBy = "photo-execution"))

        val failure = db.from(PhotoSessionTable)
            .select(PhotoSessionTable.status, PhotoSessionTable.failureCode)
            .where { PhotoSessionTable.id eq UUID.fromString(session.id) }
            .map { it[PhotoSessionTable.status] to it[PhotoSessionTable.failureCode] }
            .single()
        assertEquals("FAILED" to PhotoFailureCode.TIMED_OUT, failure)
        assertEquals(PhotoFailureCode.TIMED_OUT, db.from(JobAttemptTable)
            .select(JobAttemptTable.failureCode)
            .map { it[JobAttemptTable.failureCode] }
            .single())
    }

    @Test
    fun `photo lease renewal remains fenced by the active claim token`() {
        seedConfigurationAndKanji()
        val session = PhotoRepository(db).createSession(
            userId = "lease-photo-user",
            imageUrl = "https://images.test/photo.jpg",
        )
        val repository = PhotoAnalysisRepository(db, AiModelConfigRepository(db))
        val visualTaskId = requiredTaskId(session.id, "VISUAL_ANALYSIS")
        val claim = assertNotNull(
            repository.claim(visualTaskId, taskAttempt = 0, claimedBy = "photo-execution", leaseSeconds = 1),
        )
        val originalLease = db.from(JobAttemptTable)
            .select(JobAttemptTable.leaseUntil)
            .map { it[JobAttemptTable.leaseUntil] }
            .single()

        assertTrue(repository.renewLease(claim, leaseSeconds = 1_500))
        val renewedLease = db.from(JobAttemptTable)
            .select(JobAttemptTable.leaseUntil)
            .map { it[JobAttemptTable.leaseUntil] }
            .single()
        assertTrue(assertNotNull(renewedLease).isAfter(assertNotNull(originalLease)))
        assertFalse(repository.renewLease(claim.copy(claimToken = UUID.randomUUID()), leaseSeconds = 1_500))
    }

    private fun requiredTaskId(sessionId: String, taskType: String): UUID = db.from(PhotoSessionTaskTable)
        .select(PhotoSessionTaskTable.id)
        .where {
            (PhotoSessionTaskTable.photoSessionId eq UUID.fromString(sessionId)) and
                (PhotoSessionTaskTable.taskType eq taskType)
        }
        .map { it[PhotoSessionTaskTable.id]!! }
        .single()

    private fun seedConfigurationAndKanji(): UUID {
        db.insert(AiModelConfigTable) {
            set(it.status, "active")
            set(it.photoAnalysisModel, "vision/model")
            set(it.quizGenerationModel, "quiz/model")
            set(it.wordDiscoveryModel, "discovery/model")
            set(it.translationModel, "translation/model")
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
