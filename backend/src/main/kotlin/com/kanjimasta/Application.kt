package com.kanjimasta

import com.kanjimasta.db.configureDatabasePool
import com.kanjimasta.plugins.configureAuth
import com.kanjimasta.plugins.configureCors
import com.kanjimasta.plugins.configureRouting
import com.kanjimasta.plugins.configureSerialization
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