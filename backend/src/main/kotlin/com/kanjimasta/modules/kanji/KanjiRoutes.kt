package com.kanjimasta.modules.kanji

import com.kanjimasta.core.auth.FirebaseUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.kanjiRoutes(kanjiService: KanjiService) {
    route("/api/kanji") {
        post("/session") {
            val user = call.principal<FirebaseUser>()!!
            val request = call.receive<SaveSessionRequest>()
            kanjiService.saveSession(user.uid, request)
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        get("/jobs/pending") {
            val user = call.principal<FirebaseUser>()!!
            val count = kanjiService.getPendingJobCount(user.uid)
            call.respond(mapOf("pending" to count))
        }
    }
}
