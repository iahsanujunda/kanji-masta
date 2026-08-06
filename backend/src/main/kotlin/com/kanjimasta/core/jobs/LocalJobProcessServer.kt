package com.kanjimasta.core.jobs

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

fun interface LocalJobProcessLauncher {
    fun launch(role: String, environment: Map<String, String>): Long
}

class JavaJobProcessLauncher(private val jarPath: String) : LocalJobProcessLauncher {
    private val children = ConcurrentHashMap.newKeySet<Process>()

    init {
        require(jarPath.isNotBlank()) { "LOCAL_JOB_JAR is required" }
        Runtime.getRuntime().addShutdownHook(Thread {
            children.forEach { process ->
                process.destroy()
                if (process.isAlive) process.destroyForcibly()
            }
        })
    }

    override fun launch(role: String, environment: Map<String, String>): Long {
        val arguments = when (role) {
            "photo-job" -> {
                require(environment.keys == setOf("PHOTO_SESSION_ID")) {
                    "photo-job requires only PHOTO_SESSION_ID"
                }
                UUID.fromString(environment.getValue("PHOTO_SESSION_ID"))
                listOf("photo-job")
            }
            "quiz-job" -> {
                require(environment.isEmpty()) { "quiz-job does not accept environment overrides" }
                listOf("quiz-job", "drain")
            }
            else -> error("Unsupported local job role '$role'")
        }
        val process = ProcessBuilder(listOf("java", "-jar", jarPath) + arguments)
            .apply { this.environment().putAll(environment) }
            .inheritIO()
            .start()
        children += process
        logger.info("Started local {} process={}", role, process.pid())
        process.onExit().thenAccept { completed ->
            children -= completed
            if (completed.exitValue() == 0) {
                logger.info("Local {} process={} completed", role, completed.pid())
            } else {
                logger.error("Local {} process={} exited with code {}", role, completed.pid(), completed.exitValue())
            }
        }
        return process.pid()
    }

    private companion object {
        val logger = LoggerFactory.getLogger(JavaJobProcessLauncher::class.java)
    }
}

fun Application.localJobProcessModule(
    dispatchKey: String,
    launcher: LocalJobProcessLauncher,
) {
    require(dispatchKey.isNotBlank()) { "LOCAL_JOB_DISPATCH_KEY is required" }
    install(ContentNegotiation) { json() }
    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }
        post("/v1/jobs/{role}") {
            if (call.request.headers[LOCAL_JOB_KEY_HEADER] != dispatchKey) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "invalid_dispatch_key"))
                return@post
            }
            val role = call.parameters["role"].orEmpty()
            val environment = runCatching {
                Json.parseToJsonElement(call.receiveText()).jsonObject["environment"]
                    ?.jsonObject?.mapValues { (_, value) -> value.jsonPrimitive.content }
                    .orEmpty()
            }.getOrElse {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "invalid_request"))
                return@post
            }
            val pid = runCatching { launcher.launch(role, environment) }.getOrElse { error ->
                processLogger.error("Failed to start local {}", role, error)
                call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "job_start_failed"))
                return@post
            }
            call.respond(HttpStatusCode.Accepted, buildJsonObject {
                put("pid", pid)
                put("role", role)
            })
        }
    }
}

fun runLocalJobProcessServer() {
    val port = System.getenv("LOCAL_JOB_DISPATCH_PORT")?.toIntOrNull() ?: 8081
    val key = System.getenv("LOCAL_JOB_DISPATCH_KEY").orEmpty()
    val jar = System.getenv("LOCAL_JOB_JAR").orEmpty()
    embeddedServer(Netty, port = port) {
        localJobProcessModule(key, JavaJobProcessLauncher(jar))
    }.start(wait = true)
}

private val processLogger = LoggerFactory.getLogger("com.kanjimasta.core.jobs.LocalJobProcessServer")
