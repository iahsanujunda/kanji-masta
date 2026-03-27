package com.kanjimasta.modules.settings

import com.kanjimasta.core.auth.AuthUser
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.settingsRoutes(settingsRepository: SettingsRepository) {
    route("/api/settings") {
        get {
            val user = call.principal<AuthUser>()!!
            call.respond(settingsRepository.getSettings(user.uid))
        }
        put {
            val user = call.principal<AuthUser>()!!
            val request = call.receive<UpdateSettingsRequest>()
            settingsRepository.upsertSettings(user.uid, request.quizAllowancePerSlot, request.slotDurationHours, request.birthDate)
            call.respond(mapOf("status" to "ok"))
        }
    }
}
