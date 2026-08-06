package com.kanjimasta.internal

import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.slf4j.LoggerFactory
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private val logger = LoggerFactory.getLogger("com.kanjimasta.internal.InternalRoutes")

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
            try {
                internalService.handlePhotoResult(request)
            } catch (_: KotlinClaimConflictException) {
                return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "job_owned_by_kotlin"))
            }
            call.respond(mapOf("status" to "ok"))
        }

        post("/quiz-result") {
            if (!requireInternalKey(internalKey)) return@post
            val request = call.receive<QuizResultRequest>()
            try {
                internalService.handleQuizResult(request)
            } catch (_: KotlinClaimConflictException) {
                return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "job_owned_by_kotlin"))
            }
            call.respond(mapOf("status" to "ok"))
        }

        post("/job-status") {
            if (!requireInternalKey(internalKey)) return@post
            val request = call.receive<JobStatusRequest>()
            try {
                internalService.handleJobStatus(request)
            } catch (_: KotlinClaimConflictException) {
                return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "job_owned_by_kotlin"))
            }
            call.respond(mapOf("status" to "ok"))
        }

        post("/cron/cleanup-photo-sessions") {
            if (!requireInternalKey(internalKey)) return@post
            val count = internalService.cleanupStalePhotoSessions()
            logger.info("Cleanup: marked {} stale durable jobs as FAILED", count)
            call.respond(buildJsonObject {
                put("status", "ok")
                put("failed", count)
            })
        }
    }
}
