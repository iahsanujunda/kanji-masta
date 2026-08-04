package com.kanjimasta.modules.quiz

import com.kanjimasta.core.auth.AuthUser
import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import java.util.UUID

fun Route.quizRoutes(quizService: QuizService) {
    route("/api/quiz") {
        get("/availability") {
            val user = call.principal<AuthUser>()!!
            call.respond(quizService.getAvailability(user.uid))
        }

        route("/session") {
            post("/start") {
                val user = call.principal<AuthUser>()!!
                call.respond(quizService.startSession(user.uid))
            }

            get("/{slotId}") {
                val user = call.principal<AuthUser>()!!
                val slotId = call.parameters["slotId"] ?: return@get call.respond(HttpStatusCode.BadRequest)
                if (!slotId.isUuid()) {
                    return@get call.respond(HttpStatusCode.BadRequest)
                }
                val response = quizService.getSession(user.uid, slotId)
                    ?: return@get call.respond(HttpStatusCode.NotFound)
                call.respond(response)
            }

            post("/{slotId}/introduction") {
                val user = call.principal<AuthUser>()!!
                val slotId = call.parameters["slotId"] ?: return@post call.respond(HttpStatusCode.BadRequest)
                if (!slotId.isUuid()) return@post call.respond(HttpStatusCode.BadRequest)
                respondCommand(quizService.acknowledgeIntroduction(user.uid, slotId, call.receive()))
            }

            post("/{slotId}/answer") {
                val user = call.principal<AuthUser>()!!
                val slotId = call.parameters["slotId"] ?: return@post call.respond(HttpStatusCode.BadRequest)
                if (!slotId.isUuid()) return@post call.respond(HttpStatusCode.BadRequest)
                respondCommand(quizService.answer(user.uid, slotId, call.receive()))
            }

            post("/{slotId}/exit") {
                val user = call.principal<AuthUser>()!!
                val slotId = call.parameters["slotId"] ?: return@post call.respond(HttpStatusCode.BadRequest)
                if (!slotId.isUuid()) return@post call.respond(HttpStatusCode.BadRequest)
                val response = quizService.exit(user.uid, slotId)
                    ?: return@post call.respond(HttpStatusCode.NotFound)
                call.respond(response)
            }
        }
    }
}

private fun String.isUuid(): Boolean = runCatching { UUID.fromString(this) }.isSuccess

private suspend fun io.ktor.server.routing.RoutingContext.respondCommand(result: SessionCommandResult) {
    when (result) {
        is SessionCommandResult.Applied -> call.respond(result.response)
        is SessionCommandResult.Advanced -> call.respond(
            HttpStatusCode.Conflict,
            SessionAdvancedResponse(session = result.session),
        )
        SessionCommandResult.NotFound -> call.respond(HttpStatusCode.NotFound)
        SessionCommandResult.Invalid -> call.respond(HttpStatusCode.BadRequest)
    }
}
