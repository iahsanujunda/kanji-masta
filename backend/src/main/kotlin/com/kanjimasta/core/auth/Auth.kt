package com.kanjimasta.core.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import org.slf4j.LoggerFactory

data class FirebaseUser(val uid: String, val email: String?) : Principal

private val logger = LoggerFactory.getLogger("com.kanjimasta.core.auth")

fun Application.configureAuth() {
    val jwtSecret = environment.config.property("supabase.jwtSecret").getString()

    install(Authentication) {
        jwt("firebase") { // keep provider name to avoid changing route files
            verifier(
                JWT.require(Algorithm.HMAC256(jwtSecret))
                    .withAudience("authenticated")
                    .build()
            )
            validate { credential ->
                val uid = credential.payload.subject
                if (uid == null) {
                    logger.debug("JWT missing subject claim")
                    return@validate null
                }
                val email = credential.payload.getClaim("email")?.asString()
                FirebaseUser(uid = uid, email = email)
            }
        }
    }
}
