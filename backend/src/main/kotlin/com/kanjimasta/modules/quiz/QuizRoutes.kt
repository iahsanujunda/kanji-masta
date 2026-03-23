package com.kanjimasta.modules.quiz

import com.kanjimasta.core.auth.FirebaseUser
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.quizRoutes(quizService: QuizService) {
    route("/api/quiz") {
        get("/slot") {
            val user = call.principal<FirebaseUser>()!!
            val result = quizService.getSlot(user.uid)
            call.respond(result)
        }

        post("/result") {
            val user = call.principal<FirebaseUser>()!!
            val request = call.receive<SubmitResultRequest>()
            val result = quizService.submitResult(user.uid, request)
            call.respond(result)
        }
    }
}
