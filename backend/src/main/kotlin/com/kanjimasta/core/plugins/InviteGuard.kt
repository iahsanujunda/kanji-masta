package com.kanjimasta.core.plugins

import com.kanjimasta.core.auth.AuthUser
import com.kanjimasta.modules.invite.InviteService
import com.kanjimasta.modules.settings.SettingsRepository
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.core.plugins.InviteGuard")

val InviteGuardPlugin = createRouteScopedPlugin(
    name = "InviteGuard",
    createConfiguration = ::InviteGuardConfig,
) {
    val inviteService = pluginConfig.inviteService!!
    val settingsRepository = pluginConfig.settingsRepository!!

    onCall { call ->
        val user = call.principal<AuthUser>() ?: return@onCall

        if (settingsRepository.hasSettings(user.uid)) return@onCall

        val accepted = inviteService.validateAndAcceptInvite(user.email, user.uid)
        if (!accepted) {
            logger.info("Access denied for user={} email={} — no valid invite", user.uid, user.email)
            call.respond(HttpStatusCode.Forbidden, mapOf("error" to "No valid invite found"))
        }
    }
}

class InviteGuardConfig {
    var inviteService: InviteService? = null
    var settingsRepository: SettingsRepository? = null
}

fun Route.installInviteGuard(inviteService: InviteService, settingsRepository: SettingsRepository) {
    install(InviteGuardPlugin) {
        this.inviteService = inviteService
        this.settingsRepository = settingsRepository
    }
}
