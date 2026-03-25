package com.kanjimasta.modules.photo

import com.kanjimasta.core.auth.AuthUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.photoRoutes(photoService: PhotoService) {
    route("/api/photo") {
        post("/analyze") {
            val user = call.principal<AuthUser>()!!
            val request = call.receive<AnalyzePhotoRequest>()
            val result = photoService.startAnalysis(user.uid, request.imageUrl)
            call.respond(result)
        }

        get("/session/{id}") {
            val sessionId = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing session id"))
            val result = photoService.getSessionResult(sessionId)
            call.respond(result)
        }
    }
}
