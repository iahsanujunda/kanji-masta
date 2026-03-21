package com.kanjimasta.modules.kanji

import io.ktor.server.routing.*

fun Route.kanjiRoutes() {
    route("/api/kanji") {
        // POST /api/kanji/session
        // GET /api/kanji/list
    }
}