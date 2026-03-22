package com.kanjimasta.core.db

import com.google.auth.oauth2.GoogleCredentials
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import io.ktor.server.application.*

fun Application.configureFirebase() {
    val projectId = environment.config.property("firebase.projectId").getString()
    val emulatorHost = environment.config.propertyOrNull("firebase.authEmulatorHost")?.getString()

    if (emulatorHost != null) {
        System.setProperty("FIREBASE_AUTH_EMULATOR_HOST", emulatorHost)
    }

    val isEmulator = emulatorHost?.isNotBlank() == true

    val options = FirebaseOptions.builder()
        .setProjectId(projectId)
        .apply {
            if (isEmulator) {
                // Emulator does not require real credentials
                setCredentials(object : GoogleCredentials() {
                    override fun refreshAccessToken() = com.google.auth.oauth2.AccessToken("emulator", null)
                })
            } else {
                setCredentials(GoogleCredentials.getApplicationDefault())
            }
        }
        .build()

    FirebaseApp.initializeApp(options)
}
