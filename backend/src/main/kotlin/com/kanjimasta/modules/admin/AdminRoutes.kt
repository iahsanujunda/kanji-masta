package com.kanjimasta.modules.admin

import com.kanjimasta.core.auth.AuthUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.util.UUID

private suspend fun RoutingContext.requireAdmin(adminUserId: String): AuthUser? {
    val user = call.principal<AuthUser>()
    if (user == null || user.uid != adminUserId) {
        call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Admin only"))
        return null
    }
    return user
}

fun Route.adminRoutes(adminService: AdminService, adminUserId: String) {
    route("/api/admin") {
        get("/cost") {
            requireAdmin(adminUserId) ?: return@get
            call.respond(adminService.getCost())
        }

        get("/jobs") {
            requireAdmin(adminUserId) ?: return@get
            val status = call.request.queryParameters["status"]
            call.respond(adminService.getJobs(status))
        }

        post("/jobs/{id}/retry") {
            requireAdmin(adminUserId) ?: return@post
            val id = call.parameters["id"]
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing job id"))
            adminService.retryJob(UUID.fromString(id))
            call.respond(mapOf("status" to "ok"))
        }

        post("/jobs/retry-all") {
            requireAdmin(adminUserId) ?: return@post
            val count = adminService.retryAllFailed()
            call.respond(mapOf("status" to "ok", "retried" to count.toString()))
        }

        get("/quizzes") {
            requireAdmin(adminUserId) ?: return@get
            val query = call.request.queryParameters["q"]
            call.respond(adminService.searchQuizzes(query))
        }

        delete("/quizzes/{id}") {
            requireAdmin(adminUserId) ?: return@delete
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing quiz id"))
            adminService.deleteQuiz(UUID.fromString(id))
            call.respond(mapOf("status" to "ok"))
        }
    }
}
