package com.kanjimasta.modules.kanji

import com.kanjimasta.core.auth.AuthUser
import com.kanjimasta.modules.settings.SettingsRepository
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.kanjiRoutes(kanjiService: KanjiService, settingsRepository: SettingsRepository) {
    route("/api/kanji") {
        post("/session") {
            val user = call.principal<AuthUser>()!!
            val request = call.receive<SaveSessionRequest>()
            kanjiService.saveSession(user.uid, request)
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        get("/jobs/pending") {
            val user = call.principal<AuthUser>()!!
            val count = kanjiService.getPendingJobCount(user.uid)
            call.respond(mapOf("pending" to count))
        }

        get("/list") {
            val user = call.principal<AuthUser>()!!
            val result = kanjiService.getKanjiList(user.uid)
            call.respond(result)
        }

        post("/add") {
            call.respond(HttpStatusCode.NotImplemented, mapOf("message" to "Manual kanji add coming soon"))
        }
    }

    route("/api/onboarding") {
        get("/kanji") {
            val user = call.principal<AuthUser>()!!
            val offset = call.request.queryParameters["offset"]?.toIntOrNull() ?: 0
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 10
            val result = kanjiService.getOnboardingKanji(user.uid, offset, limit)
            call.respond(result)
        }

        post("/select") {
            val user = call.principal<AuthUser>()!!
            val request = call.receive<OnboardingSelectRequest>()
            kanjiService.saveOnboardingSelections(user.uid, request.selections)
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        post("/complete") {
            val user = call.principal<AuthUser>()!!
            settingsRepository.markOnboardingComplete(user.uid)
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }
    }

    route("/api/words") {
        get("/list") {
            val user = call.principal<AuthUser>()!!
            val query = call.request.queryParameters["q"]
            val offset = call.request.queryParameters["offset"]?.toIntOrNull() ?: 0
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 30
            val result = kanjiService.getWordList(user.uid, query, offset, limit)
            call.respond(result)
        }
    }
}
