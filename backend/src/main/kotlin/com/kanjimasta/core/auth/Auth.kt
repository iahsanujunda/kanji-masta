package com.kanjimasta.core.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*

fun Application.configureAuth() {
    val jwtSecret = environment.config.property("jwt.secret").getString()
    val jwtIssuer = environment.config.property("jwt.issuer").getString()

    install(Authentication) {
        jwt("supabase") {
            verifier(
                JWT.require(Algorithm.HMAC256(jwtSecret))
                    .withIssuer(jwtIssuer)
                    .build()
            )
            validate { credential ->
                val userId = credential.payload.subject
                if (userId != null) JWTPrincipal(credential.payload) else null
            }
        }
    }
}