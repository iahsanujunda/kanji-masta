package com.kanjimasta.core.plugins

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
) {
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        authenticate("supabase") {
            photoRoutes(photoService)
            kanjiRoutes(kanjiService)
            quizRoutes(quizService)
            userRoutes(userService)
            settingsRoutes(settingsRepository)
        }
    }
}
