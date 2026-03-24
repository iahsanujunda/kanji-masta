package com.kanjimasta

import com.kanjimasta.core.auth.configureAuth
import com.kanjimasta.core.db.DataConnectClient
import com.kanjimasta.core.db.configureFirebase
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
    configureFirebase()
    configureSerialization()
    configureCors()
    configureObservability()
    configureAuth()

    val projectId = environment.config.property("firebase.projectId").getString()
    val dcHost = environment.config.property("firebase.dataConnectHost").getString()
    val functionsHost = environment.config.property("firebase.functionsHost").getString()
    val functionsRegion = environment.config.property("firebase.functionsRegion").getString()

    val dcUrl = if (dcHost.isNotBlank())
        "http://$dcHost/v1alpha/projects/$projectId/locations/asia-east1/services/kanji-masta:executeGraphql"
    else
        "https://firebasedataconnect.googleapis.com/v1alpha/projects/$projectId/locations/asia-east1/services/kanji-masta:executeGraphql"
    val functionsBaseUrl = if (functionsHost.isNotBlank()) "http://$functionsHost" else "https://$functionsRegion-$projectId.cloudfunctions.net"

    val httpClient = HttpClient(CIO) {
        install(HttpTimeout) {
            requestTimeoutMillis = 120_000
            connectTimeoutMillis = 10_000
        }
    }
    val isProduction = dcHost.isBlank()
    val dcClient = DataConnectClient(httpClient, dcUrl, useAuth = isProduction)

    val photoRepository = PhotoRepository(dcClient)
    val photoService = PhotoService(photoRepository, httpClient, functionsBaseUrl, projectId, functionsRegion)

    val kanjiRepository = KanjiRepository(dcClient)
    val kanjiService = KanjiService(kanjiRepository, photoRepository, httpClient, functionsBaseUrl, projectId, functionsRegion)

    val quizRepository = QuizRepository(dcClient)
    val quizService = QuizService(quizRepository)

    val settingsRepository = com.kanjimasta.modules.settings.SettingsRepository(dcClient)
    val userRepository = com.kanjimasta.modules.user.UserRepository(dcClient)
    val userService = com.kanjimasta.modules.user.UserService(userRepository, quizRepository)

    configureRouting(photoService, kanjiService, quizService, userService, settingsRepository)
}
