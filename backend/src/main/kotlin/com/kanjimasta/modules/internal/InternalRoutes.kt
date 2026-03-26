package com.kanjimasta.modules.internal

import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.internal.InternalRoutes")

private suspend fun RoutingContext.requireInternalKey(internalKey: String): Boolean {
    if (internalKey.isBlank()) return true // no key configured = allow all (local dev)
    val key = call.request.header("X-Internal-Key")
    if (key != internalKey) {
        logger.warn("Internal API call with invalid key")
        call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid internal key"))
        return false
    }
    return true
}

fun Route.internalRoutes(internalService: InternalService, internalKey: String) {
    route("/api/internal") {
        post("/photo-result") {
            if (!requireInternalKey(internalKey)) return@post
            val request = call.receive<PhotoResultRequest>()
            internalService.handlePhotoResult(request)
            call.respond(mapOf("status" to "ok"))
        }

        post("/quiz-result") {
            if (!requireInternalKey(internalKey)) return@post
            val request = call.receive<QuizResultRequest>()
            internalService.handleQuizResult(request)
            call.respond(mapOf("status" to "ok"))
        }

        post("/job-status") {
            if (!requireInternalKey(internalKey)) return@post
            val request = call.receive<JobStatusRequest>()
            internalService.handleJobStatus(request)
            call.respond(mapOf("status" to "ok"))
        }

        post("/cron/cleanup-photo-sessions") {
            if (!requireInternalKey(internalKey)) return@post
            val count = internalService.cleanupStalePhotoSessions()
            logger.info("Cleanup: marked {} stale photo sessions as FAILED", count)
            call.respond(mapOf("status" to "ok", "failed" to count))
        }
    }
}
