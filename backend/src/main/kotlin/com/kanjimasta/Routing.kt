package com.kanjimasta

import com.kanjimasta.admin.AdminService
import com.kanjimasta.admin.adminRoutes
import com.kanjimasta.internal.InternalService
import com.kanjimasta.internal.internalRoutes
import com.kanjimasta.invite.InviteService
import com.kanjimasta.invite.inviteAdminRoutes
import com.kanjimasta.invite.invitePublicRoutes
import com.kanjimasta.kanji.KanjiService
import com.kanjimasta.kanji.kanjiRoutes
import com.kanjimasta.photo.PhotoService
import com.kanjimasta.photo.photoRoutes
import com.kanjimasta.quiz.QuizService
import com.kanjimasta.quiz.quizRoutes
import com.kanjimasta.settings.SettingsRepository
import com.kanjimasta.settings.settingsRoutes
import com.kanjimasta.user.UserService
import com.kanjimasta.user.userRoutes
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
) {
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        // Public (no auth)
        invitePublicRoutes(inviteService)

        // Temporary legacy callbacks plus scheduled stale cleanup.
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
