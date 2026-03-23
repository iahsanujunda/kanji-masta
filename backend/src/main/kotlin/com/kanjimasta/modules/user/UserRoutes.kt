package com.kanjimasta.modules.user

import com.kanjimasta.core.auth.FirebaseUser
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.userRoutes(userService: UserService) {
    route("/api/user") {
        get("/summary") {
            val user = call.principal<FirebaseUser>()!!
            val result = userService.getSummary(user.uid)
            call.respond(result)
        }
    }
}
