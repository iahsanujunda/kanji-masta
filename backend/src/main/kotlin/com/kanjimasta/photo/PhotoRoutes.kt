package com.kanjimasta.photo

import com.kanjimasta.auth.AuthUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.util.UUID

fun Route.photoRoutes(photoService: PhotoService) {
    route("/api/captures") {
        get {
            val user = call.principal<AuthUser>()!!
            val sort = call.request.queryParameters["sort"] ?: "recent"
            val direction = call.request.queryParameters["direction"] ?: "desc"
            val result = runCatching { photoService.getCaptures(user.uid, sort, direction) }
                .getOrElse {
                    return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid capture sort"))
                }
            call.respond(result)
        }

        get("/{id}") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            val capture = photoService.getCapture(user.uid, sessionId)
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            call.respond(capture)
        }

        post("/{id}/revisited") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            val result = photoService.markCaptureRevisited(user.uid, sessionId)
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            call.respond(result)
        }

        post("/{id}/word-discovery") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            when (val result = photoService.startWordDiscovery(user.uid, sessionId)) {
                CaptureWordDiscoveryEnqueueResult.NotFound ->
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
                CaptureWordDiscoveryEnqueueResult.Locked ->
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Word discovery is not available"))
                is CaptureWordDiscoveryEnqueueResult.Accepted ->
                    call.respond(
                        HttpStatusCode.Accepted,
                        StartCaptureWordDiscoveryResponse(result.value.taskId.toString(), result.value.status.lowercase()),
                    )
            }
        }

        put("/{id}/word-decisions") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@put call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            val request = call.receive<CaptureWordDecisionRequest>()
            val candidateIds = request.candidateIds.map {
                runCatching { UUID.fromString(it) }.getOrNull()
                    ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid candidate id"))
            }.toSet()
            when (val result = photoService.acceptDiscoveredWords(user.uid, sessionId, candidateIds)) {
                CaptureWordDecisionResult.NotFound ->
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
                CaptureWordDecisionResult.Invalid ->
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid word selection"))
                is CaptureWordDecisionResult.Accepted ->
                    call.respond(mapOf("added" to result.added))
            }
        }

        post("/{id}/tasks/{taskType}/retry") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            val taskType = call.parameters["taskType"].orEmpty()
            if (taskType in setOf("VISUAL_ANALYSIS", "TRANSLATION")) {
                if (!photoService.retryCapture(sessionId, user.uid, taskType)) {
                    return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "Capture task cannot be retried"))
                }
                return@post call.respond(HttpStatusCode.Accepted, mapOf("status" to "processing"))
            }
            if (taskType != CaptureWordDiscoveryRepository.TASK_TYPE) {
                return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Unsupported task type"))
            }
            when (val result = photoService.startWordDiscovery(user.uid, sessionId)) {
                CaptureWordDiscoveryEnqueueResult.NotFound ->
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
                CaptureWordDiscoveryEnqueueResult.Locked ->
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Word discovery is not available"))
                is CaptureWordDiscoveryEnqueueResult.Accepted ->
                    call.respond(HttpStatusCode.Accepted, StartCaptureWordDiscoveryResponse(result.value.taskId.toString(), result.value.status.lowercase()))
            }
        }

        post("/{id}/retry") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            if (!photoService.retryCapture(sessionId, user.uid)) {
                return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "Capture cannot be retried"))
            }
            call.respond(HttpStatusCode.Accepted, mapOf("status" to "processing"))
        }

        post("/{id}/kanji/{kanjiId}/exclusion") {
            val user = call.principal<AuthUser>()!!
            val sessionId = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture not found"))
            val kanjiId = call.parameters["kanjiId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid kanji id"))
            val request = call.receive<CaptureKanjiCorrectionRequest>()
            val result = photoService.setCaptureKanjiExcluded(user.uid, sessionId, kanjiId, request.excluded)
                ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Capture kanji not found"))
            call.respond(result)
        }
    }

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
