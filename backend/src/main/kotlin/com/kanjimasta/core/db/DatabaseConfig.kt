package com.kanjimasta.core.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.server.application.*
import org.ktorm.database.Database
import org.slf4j.LoggerFactory
import java.net.URI

private val log = LoggerFactory.getLogger("com.kanjimasta.core.db.DatabaseConfig")

/**
 * Convert a standard PostgreSQL URI (postgresql://user:pass@host:port/db)
 * to JDBC format (jdbc:postgresql://host:port/db?user=X&password=Y).
 * If already in JDBC format, return as-is.
 */
private fun toJdbcUrl(url: String): String {
    if (url.startsWith("jdbc:")) return url

    val uri = URI(url)
    val userInfo = uri.userInfo
    val jdbcBase = "jdbc:postgresql://${uri.host}:${uri.port}${uri.path}"

    if (userInfo != null && ":" in userInfo) {
        val (user, pass) = userInfo.split(":", limit = 2)
        val query = uri.query?.let { "&$it" } ?: ""
        return "$jdbcBase?user=$user&password=$pass$query"
    }

    return if (uri.query != null) "$jdbcBase?${uri.query}" else jdbcBase
}

fun connectDatabase(environment: ApplicationEnvironment): Database {
    val url = environment.config.property("database.url").getString()
    require(url.isNotBlank()) { "database.url must be set (DATABASE_URL env var)" }

    val jdbcUrl = toJdbcUrl(url)
    log.info("Connecting to database: {}", jdbcUrl.substringBefore("?").replace(Regex("://[^@]+@"), "://***@"))

    // Disable server-side prepared statements to avoid "prepared statement already exists"
    // errors with Supabase's connection pooler (PgBouncer)
    val separator = if ("?" in jdbcUrl) "&" else "?"
    val finalJdbcUrl = "$jdbcUrl${separator}prepareThreshold=0"

    val config = HikariConfig().apply {
        this.jdbcUrl = finalJdbcUrl
        maximumPoolSize = 7
        minimumIdle = 1
        idleTimeout = 60_000
        connectionTimeout = 10_000
        maxLifetime = 300_000
        isAutoCommit = true
    }

    val dataSource = HikariDataSource(config)
    return Database.connect(dataSource)
}
