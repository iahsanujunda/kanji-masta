package com.kanjimasta.modules.invite

import com.kanjimasta.core.auth.AuthUser
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.util.UUID

fun Route.invitePublicRoutes(inviteService: InviteService) {
    route("/api/invite") {
        get("/{code}/details") {
            val code = call.parameters["code"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing invite code"))
            val details = inviteService.getInviteDetails(code)
                ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Invite not found"))
            call.respond(details)
        }
    }
}

fun Route.inviteAdminRoutes(inviteService: InviteService, adminUserId: String) {
    route("/api/admin") {
        post("/invite") {
            val user = call.principal<AuthUser>()!!
            if (user.uid != adminUserId) {
                return@post call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Admin only"))
            }
            val request = call.receive<CreateInviteRequest>()
            val result = inviteService.createInvite(request.email, user.uid, request.sendEmail)
            call.respond(result)
        }

        get("/invites") {
            val user = call.principal<AuthUser>()!!
            if (user.uid != adminUserId) {
                return@get call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Admin only"))
            }
            call.respond(inviteService.listInvites())
        }

        put("/invite/{id}/revoke") {
            val user = call.principal<AuthUser>()!!
            if (user.uid != adminUserId) {
                return@put call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Admin only"))
            }
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing invite id"))
            inviteService.revokeInvite(UUID.fromString(id))
            call.respond(mapOf("status" to "ok"))
        }
    }
}
