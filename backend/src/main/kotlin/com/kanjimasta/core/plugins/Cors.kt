package com.kanjimasta.core.plugins

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.cors.routing.*

fun Application.configureCors() {
    val allowedOrigins = environment.config.propertyOrNull("cors.allowedOrigins")?.getString()

    install(CORS) {
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Options)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowHeader("X-Request-Id")
        allowNonSimpleContentTypes = true

        if (allowedOrigins.isNullOrBlank()) {
            anyHost()
        } else {
            allowedOrigins.split(",").forEach { origin ->
                allowHost(origin.trim().removePrefix("https://").removePrefix("http://"), schemes = listOf("https", "http"))
            }
        }
    }
}