package com.kanjimasta.core.plugins

import com.kanjimasta.core.auth.FirebaseUser
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.plugins.callid.*
import io.ktor.server.plugins.calllogging.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.response.*
import org.slf4j.LoggerFactory
import org.slf4j.event.Level
import java.util.*

fun Application.configureObservability() {
    val log = LoggerFactory.getLogger("Application")

    install(StatusPages) {
        exception<Throwable> { call, cause ->
            log.error("Unhandled exception: ${cause.message}", cause)
            call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (cause.message ?: "Internal Server Error")))
        }
    }

    install(CallId) {
        header("X-Request-Id")
        generate { UUID.randomUUID().toString().replace("-", "").take(12) }
        verify { it.isNotEmpty() }
    }

    install(CallLogging) {
        level = Level.INFO
        callIdMdc("callId")
        mdc("userId") { call ->
            call.principal<FirebaseUser>()?.uid
        }
    }
}
