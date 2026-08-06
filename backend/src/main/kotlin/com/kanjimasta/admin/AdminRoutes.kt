package com.kanjimasta.admin

import com.kanjimasta.auth.AuthUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
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
        get("/status") {
            requireAdmin(adminUserId) ?: return@get
            call.respond(adminService.getStatus())
        }

        get("/model-config") {
            requireAdmin(adminUserId) ?: return@get
            call.respond(adminService.getModelConfigs())
        }

        put("/model-config") {
            val admin = requireAdmin(adminUserId) ?: return@put
            val request = runCatching { call.receive<ModelConfigRequest>() }.getOrNull()
                ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid model configuration"))
            if (request.asWorkloads().values.any { it.isBlank() || it.length > 240 }) {
                return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid model configuration"))
            }
            val config = adminService.saveModelConfig(request, admin.uid)
                ?: return@put call.respond(HttpStatusCode.UnprocessableEntity, mapOf("error" to "Model configuration rejected"))
            call.respond(config)
        }

        get("/models") {
            requireAdmin(adminUserId) ?: return@get
            val workload = call.request.queryParameters["workload"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing workload"))
            if (workload !in setOf("photo_analysis", "translation", "quiz_generation", "word_discovery")) {
                return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid workload"))
            }
            val response = runCatching { adminService.searchModels(workload, call.request.queryParameters["q"]) }
                .getOrElse {
                    return@get call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "catalog_unavailable"))
                }
            call.respond(response)
        }

        get("/cost") {
            requireAdmin(adminUserId) ?: return@get
            call.respond(adminService.getCost())
        }

        get("/jobs") {
            requireAdmin(adminUserId) ?: return@get
            val status = call.request.queryParameters["status"]
            val type = call.request.queryParameters["type"]
            call.respond(adminService.getJobs(status, type))
        }

        post("/jobs/{type}/{id}/fail") {
            val admin = requireAdmin(adminUserId) ?: return@post
            val type = call.parameters["type"]
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing job type"))
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid job id"))
            when (val result = adminService.markFailed(type, id, admin.uid)) {
                is JobCommandResult.Applied -> call.respond(result.job)
                JobCommandResult.NotFound -> call.respond(HttpStatusCode.NotFound, mapOf("error" to "Job not found"))
                JobCommandResult.Conflict -> call.respond(HttpStatusCode.Conflict, mapOf("error" to "Job changed"))
            }
        }

        get("/jobs/{type}/{id}") {
            requireAdmin(adminUserId) ?: return@get
            val type = call.parameters["type"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing job type"))
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid job id"))
            val detail = adminService.getJobDetail(type, id)
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Job not found"))
            call.respond(detail)
        }

        post("/jobs/{type}/{id}/rerun") {
            val admin = requireAdmin(adminUserId) ?: return@post
            val type = call.parameters["type"]
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing job type"))
            val id = call.parameters["id"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid job id"))
            when (val result = adminService.rerun(type, id, admin.uid)) {
                is JobCommandResult.Applied -> call.respond(result.job)
                JobCommandResult.NotFound -> call.respond(HttpStatusCode.NotFound, mapOf("error" to "Job not found"))
                JobCommandResult.Conflict -> call.respond(HttpStatusCode.Conflict, mapOf("error" to "Job changed"))
            }
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
