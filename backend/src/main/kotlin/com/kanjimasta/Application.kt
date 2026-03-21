package com.kanjimasta

import com.kanjimasta.core.auth.configureAuth
import com.kanjimasta.core.db.configureDatabasePool
import com.kanjimasta.core.plugins.configureCors
import com.kanjimasta.core.plugins.configureRouting
import com.kanjimasta.core.plugins.configureSerialization
import io.ktor.server.application.*
import io.ktor.server.netty.*

fun main(args: Array<String>) = EngineMain.main(args)

fun Application.module() {
    val database = configureDatabasePool()
    configureSerialization()
    configureCors()
    configureAuth()
    configureRouting()
}