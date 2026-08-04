package com.kanjimasta.support

import com.kanjimasta.module
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.ApplicationTestBuilder

fun ApplicationTestBuilder.configureWithTestDb() {
    TestPostgres.database
    val postgres = TestPostgres.container
    environment {
        config = MapApplicationConfig(
            "database.url" to "${postgres.jdbcUrl}&user=${postgres.username}&password=${postgres.password}",
            "supabase.url" to "http://127.0.0.1:1",
            "cors.allowedOrigins" to "https://kanji.test",
            "aiWorker.baseUrl" to "http://127.0.0.1:2",
            "resend.apiKey" to "test-resend-key",
            "admin.userId" to "test-admin",
            "internal.key" to "test-internal-key",
            "self.url" to "http://127.0.0.1:3",
        )
    }
    application { module() }
}
