package com.kanjimasta.core.auth

import com.auth0.jwk.UrlJwkProvider
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import org.slf4j.LoggerFactory
import java.net.URI

data class AuthUser(val uid: String, val email: String?) : Principal

private val logger = LoggerFactory.getLogger("com.kanjimasta.core.auth")

fun Application.configureAuth() {
    val supabaseUrl = environment.config.property("supabase.url").getString()
    val jwksUrl = URI("$supabaseUrl/auth/v1/.well-known/jwks.json").toURL()

    logger.info("Configuring JWT auth with JWKS: {}", jwksUrl)

    val jwkProvider = UrlJwkProvider(jwksUrl)

    install(Authentication) {
        jwt("supabase") {
            verifier(jwkProvider)
            validate { credential ->
                val uid = credential.payload.subject
                if (uid == null) {
                    logger.debug("JWT missing subject claim")
                    return@validate null
                }
                val email = credential.payload.getClaim("email")?.asString()
                AuthUser(uid = uid, email = email)
            }
        }
    }
}
