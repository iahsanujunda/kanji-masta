package com.kanjimasta.plugins

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Serializable
data class ClickRequest(val clickedAt: String)

@Serializable
data class ClickResponse(val message: String)

private val formatter = DateTimeFormatter.ofPattern("yy/MM/dd HH:mm").withZone(ZoneOffset.UTC)

fun Application.configureRouting() {
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        post("/api/click") {
            val request = call.receive<ClickRequest>()
            val instant = Instant.parse(request.clickedAt)
            val formatted = formatter.format(instant)
            call.respond(ClickResponse(message = "clicked at $formatted"))
        }
    }
}