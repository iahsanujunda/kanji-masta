package com.kanjimasta

import com.kanjimasta.core.ai.AiModelConfigRepository
import com.kanjimasta.core.ai.OpenRouterClient
import com.kanjimasta.core.db.*
import com.kanjimasta.modules.kanji.WordDiscoveryRepository
import com.kanjimasta.modules.kanji.WordDiscoveryRequest
import com.kanjimasta.modules.kanji.WordDiscoveryService
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

class WordDiscoveryIntegrationTest : PersistenceTest() {
    @Test
    fun `discovery uses active model and atomically creates words user links jobs and attempts`() = runBlocking {
        val kanjiId = seedAiConfigurationAndKanji()
        var requestedModel = ""
        val http = HttpClient(MockEngine { request ->
            requestedModel = Json.parseToJsonElement((request.body as TextContent).text)
                .jsonObject["model"]!!.jsonPrimitive.content
            respond(
                """{"choices":[{"message":{"content":"[{\"word\":\"日記\",\"reading\":\"にっき\",\"meaning\":\"diary\"},{\"word\":\"日本\",\"reading\":\"にほん\",\"meaning\":\"Japan\"}]"}}],"usage":{"cost":0.001}}""",
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        })
        val configs = AiModelConfigRepository(db)
        val service = WordDiscoveryService(
            WordDiscoveryRepository(db, configs),
            configs,
            OpenRouterClient(http, "test-key", "https://openrouter.test"),
        )

        val inserted = service.discover(WordDiscoveryRequest("word-user", kanjiId, "日"))

        assertEquals(2, inserted)
        assertEquals("discovery/model", requestedModel)
        assertEquals(2, db.from(WordMasterTable).select().totalRecordsInAllPages)
        assertEquals(2, db.from(UserWordsTable).select().totalRecordsInAllPages)
        assertEquals(2, db.from(QuizGenerationJobTable).select().totalRecordsInAllPages)
        assertEquals(2, db.from(JobAttemptTable).select().totalRecordsInAllPages)
        assertEquals(
            setOf("quiz/model"),
            db.from(JobAttemptTable).select(JobAttemptTable.modelId).mapNotNull { it[JobAttemptTable.modelId] }.toSet(),
        )
    }

    private fun seedAiConfigurationAndKanji(): UUID {
        db.insert(AiModelConfigTable) {
            set(it.status, "active")
            set(it.photoAnalysisModel, "vision/model")
            set(it.quizGenerationModel, "quiz/model")
            set(it.wordDiscoveryModel, "discovery/model")
            set(it.validationStatus, "passed")
            set(it.createdBy, "test")
        }
        val kanjiId = UUID.randomUUID()
        db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, "日")
            set(it.onyomi, listOf("ニチ"))
            set(it.kunyomi, listOf("ひ"))
            set(it.meanings, listOf("day"))
        }
        return kanjiId
    }
}
