package com.kanjimasta.core.plugins

import com.kanjimasta.modules.kanji.kanjiRoutes
import com.kanjimasta.modules.photo.photoRoutes
import com.kanjimasta.modules.quiz.quizRoutes
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        authenticate("supabase") {
            photoRoutes()
            kanjiRoutes()
            quizRoutes()
        }
    }
}
