package com.kanjimasta.support

import com.kanjimasta.auth.AuthUser
import com.kanjimasta.configureSerialization
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.auth.Authentication
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.bearer
import io.ktor.server.routing.Route
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder

fun ApplicationTestBuilder.configureIsolatedKtor(
    user: AuthUser = AuthUser(uid = "route-test-user", email = "route-test@example.com"),
    routes: Route.() -> Unit,
) {
    application {
        configureSerialization()
        configureTestAuthentication(user)
        routing {
            authenticate("supabase") {
                routes()
            }
        }
    }
}

private fun Application.configureTestAuthentication(user: AuthUser) {
    install(Authentication) {
        bearer("supabase") {
            authenticate { user }
        }
    }
}
