package com.kanjimasta.core.auth

import com.google.firebase.auth.FirebaseAuth
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*

data class FirebaseUser(val uid: String, val email: String?) : Principal

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
                } catch (_: Exception) {
                    null
                }
            }
        }
    }
}
