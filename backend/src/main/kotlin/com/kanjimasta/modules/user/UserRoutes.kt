package com.kanjimasta.modules.user

import com.kanjimasta.core.auth.AuthUser
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.userRoutes(userService: UserService) {
    route("/api/user") {
        get("/summary") {
            val user = call.principal<AuthUser>()!!
            userService.ensureUserInitialized(user.email, user.uid)
            val result = userService.getSummary(user.uid)
            call.respond(result)
        }
    }
}
