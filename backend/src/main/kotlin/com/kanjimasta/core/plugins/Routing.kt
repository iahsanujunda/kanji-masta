package com.kanjimasta.core.plugins

import com.kanjimasta.modules.admin.AdminService
import com.kanjimasta.modules.admin.adminRoutes
import com.kanjimasta.modules.internal.InternalService
import com.kanjimasta.modules.internal.internalRoutes
import com.kanjimasta.modules.invite.InviteService
import com.kanjimasta.modules.invite.inviteAdminRoutes
import com.kanjimasta.modules.invite.invitePublicRoutes
import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.kanji.kanjiRoutes
import com.kanjimasta.modules.photo.PhotoService
import com.kanjimasta.modules.photo.photoRoutes
import com.kanjimasta.modules.quiz.QuizService
import com.kanjimasta.modules.quiz.quizRoutes
import com.kanjimasta.modules.settings.SettingsRepository
import com.kanjimasta.modules.settings.settingsRoutes
import com.kanjimasta.modules.user.UserService
import com.kanjimasta.modules.user.userRoutes
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting(
    photoService: PhotoService,
    kanjiService: KanjiService,
    quizService: QuizService,
    userService: UserService,
    settingsRepository: SettingsRepository,
    inviteService: InviteService,
    adminService: AdminService,
    internalService: InternalService,
    adminUserId: String,
    internalKey: String,
    selfUrl: String,
) {
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        // Public (no auth)
        invitePublicRoutes(inviteService)

        // Internal (ai-worker callbacks, shared secret auth)
        internalRoutes(internalService, internalKey)

        authenticate("supabase") {
            photoRoutes(photoService)
            kanjiRoutes(kanjiService, settingsRepository)
            quizRoutes(quizService)
            userRoutes(userService)
            settingsRoutes(settingsRepository)
            inviteAdminRoutes(inviteService, adminUserId)
            adminRoutes(adminService, adminUserId)
        }
    }
}
