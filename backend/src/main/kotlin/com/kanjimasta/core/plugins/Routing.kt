package com.kanjimasta.core.plugins

import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.kanji.kanjiRoutes
import com.kanjimasta.modules.photo.PhotoService
import com.kanjimasta.modules.photo.photoRoutes
import com.kanjimasta.modules.quiz.quizRoutes
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting(photoService: PhotoService, kanjiService: KanjiService) {
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        authenticate("firebase") {
            photoRoutes(photoService)
            kanjiRoutes(kanjiService)
            quizRoutes()
        }
    }
}
