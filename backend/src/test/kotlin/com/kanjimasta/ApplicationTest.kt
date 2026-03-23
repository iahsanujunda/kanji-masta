package com.kanjimasta

import com.kanjimasta.core.db.DataConnectClient
import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import com.kanjimasta.modules.kanji.KanjiRepository
import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.photo.PhotoRepository
import com.kanjimasta.modules.photo.PhotoService
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContains

fun Application.testModule() {
    configureSerialization()
    install(Authentication) {
        provider("firebase") {
            authenticate { context ->
                @Suppress("DEPRECATION")
                context.principal(object : Principal {})
            }
        }
    }
    val httpClient = HttpClient(CIO)
    val dcClient = DataConnectClient(httpClient, "http://localhost:9399/unused")
    val photoService = PhotoService(PhotoRepository(dcClient), httpClient, "http://localhost:5001", "test")
    val kanjiService = KanjiService(KanjiRepository(dcClient), PhotoRepository(dcClient), httpClient, "http://localhost:5001", "test")
    configureRouting(photoService, kanjiService)
}

class ApplicationTest {

    @Test
    fun `health endpoint returns ok`() = testApplication {
        application { testModule() }
        val response = client.get("/health")
        assertEquals(HttpStatusCode.OK, response.status)
        assertContains(response.bodyAsText(), "ok")
    }

    @Test
    fun `unknown route returns 404`() = testApplication {
        application { testModule() }
        val response = client.get("/nonexistent")
        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
