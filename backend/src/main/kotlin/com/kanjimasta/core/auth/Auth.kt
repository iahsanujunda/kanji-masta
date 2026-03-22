package com.kanjimasta.core.auth

import com.google.firebase.auth.FirebaseAuth
import io.ktor.server.application.*
import io.ktor.server.auth.*
import org.slf4j.LoggerFactory

data class FirebaseUser(val uid: String, val email: String?) : Principal

private val logger = LoggerFactory.getLogger("com.kanjimasta.core.auth")

fun Application.configureAuth() {
    install(Authentication) {
        bearer("firebase") {
            authenticate { tokenCredential ->
                try {
                    val decoded = FirebaseAuth.getInstance()
                        .verifyIdToken(tokenCredential.token)
                    FirebaseUser(
                        uid = decoded.uid,
                        email = decoded.email
                    )
                } catch (e: Exception) {
                    logger.debug("Token verification failed: {}", e.message)
                    null
                }
            }
        }
    }
}
