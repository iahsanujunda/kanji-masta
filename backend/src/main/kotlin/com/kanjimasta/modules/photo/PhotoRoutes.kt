package com.kanjimasta.modules.photo

import com.kanjimasta.core.auth.AuthUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.util.UUID

fun Route.photoRoutes(photoService: PhotoService) {
    route("/api/photo") {
        post("/analyze") {
            val user = call.principal<AuthUser>()!!
            val request = call.receive<AnalyzePhotoRequest>()
            val clientCaptureId = request.clientCaptureId?.let {
                runCatching { UUID.fromString(it) }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid client capture id"))
            }
            val result = photoService.startAnalysis(
                user.uid,
                request.imageUrl,
                request.storagePath,
                clientCaptureId,
            )
            call.respond(result)
        }

        get("/session/{id}") {
            val sessionId = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing session id"))
            val sessionUuid = runCatching { UUID.fromString(sessionId) }.getOrNull()
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Scan not found"))
            val user = call.principal<AuthUser>()!!
            val result = photoService.getSessionResult(user.uid, sessionUuid)
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Scan not found"))
            call.respond(result)
        }

        get("/recent") {
            val user = call.principal<AuthUser>()!!
            val result = photoService.getRecentScans(user.uid)
            call.respond(result)
        }
    }
}
