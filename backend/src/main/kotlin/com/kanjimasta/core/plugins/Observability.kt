package com.kanjimasta.core.plugins

import com.kanjimasta.core.auth.FirebaseUser
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.plugins.callid.*
import io.ktor.server.plugins.calllogging.*
import org.slf4j.event.Level
import java.util.*

fun Application.configureObservability() {
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
