package com.kanjimasta.photo

import com.kanjimasta.auth.AuthUser
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

        get("/activity") {
            val user = call.principal<AuthUser>()!!
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 20
            if (limit !in 1..50) {
                return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Limit must be between 1 and 50"))
            }
            val result = runCatching {
                photoService.getActivity(user.uid, limit, call.request.queryParameters["cursor"])
            }.getOrElse {
                return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid activity cursor"))
            }
            call.respond(result)
        }

        get("/activity/unseen") {
            val user = call.principal<AuthUser>()!!
            call.respond(photoService.getActivityUnseen(user.uid))
        }

        post("/activity/seen") {
            val user = call.principal<AuthUser>()!!
            val request = call.receive<MarkPhotoActivitySeenRequest>()
            val seenThrough = runCatching { java.time.Instant.parse(request.seenThrough) }.getOrNull()
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid seen-through timestamp"))
            photoService.markActivitySeen(user.uid, seenThrough)
            call.respond(mapOf("acknowledged" to true))
        }
    }
}
