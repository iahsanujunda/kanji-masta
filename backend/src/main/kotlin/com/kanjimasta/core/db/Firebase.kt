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

    val options = FirebaseOptions.builder()
        .setProjectId(projectId)
        .apply {
            val credentialsPath = System.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if (credentialsPath != null) {
                setCredentials(GoogleCredentials.getApplicationDefault())
            } else {
                // For emulator usage, credentials are not required
                setCredentials(GoogleCredentials.create(null))
            }
        }
        .build()

    FirebaseApp.initializeApp(options)
}
