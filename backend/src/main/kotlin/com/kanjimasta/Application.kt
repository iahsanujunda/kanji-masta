package com.kanjimasta

import com.kanjimasta.core.auth.configureAuth
import com.kanjimasta.core.db.connectDatabase
import com.kanjimasta.core.plugins.configureCors
import com.kanjimasta.core.plugins.configureObservability
import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import com.kanjimasta.modules.kanji.KanjiRepository
import com.kanjimasta.modules.kanji.KanjiService
import com.kanjimasta.modules.photo.PhotoRepository
import com.kanjimasta.modules.photo.PhotoService
import com.kanjimasta.modules.quiz.QuizRepository
import com.kanjimasta.modules.quiz.QuizService
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.*
import io.ktor.server.application.*
import io.ktor.server.netty.*

fun main(args: Array<String>) = EngineMain.main(args)

fun Application.module() {
    configureSerialization()
    configureCors()
    configureObservability()
    configureAuth()

    // Database (Ktorm + Supabase PostgreSQL)
    val database = connectDatabase(environment)

    // AI Worker (Cloud Run service replacing Firebase Functions)
    val aiWorkerUrl = environment.config.property("aiWorker.baseUrl").getString()

    val httpClient = HttpClient(CIO) {
        install(HttpTimeout) {
            requestTimeoutMillis = 120_000
            connectTimeoutMillis = 10_000
        }
    }

    val photoRepository = PhotoRepository(database)
    val photoService = PhotoService(photoRepository, httpClient, aiWorkerUrl)

    val kanjiRepository = KanjiRepository(database)
    val kanjiService = KanjiService(kanjiRepository, photoRepository, httpClient, aiWorkerUrl)

    val quizRepository = QuizRepository(database)
    val quizService = QuizService(quizRepository)

    val settingsRepository = com.kanjimasta.modules.settings.SettingsRepository(database)
    val userRepository = com.kanjimasta.modules.user.UserRepository(database)
    val userService = com.kanjimasta.modules.user.UserService(userRepository, quizRepository)

    configureRouting(photoService, kanjiService, quizService, userService, settingsRepository)
}
