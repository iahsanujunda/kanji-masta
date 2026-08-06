package com.kanjimasta.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.server.application.*
import org.ktorm.database.Database
import org.ktorm.logging.Logger as KtormLogger
import org.ktorm.logging.detectLoggerImplementation
import org.slf4j.LoggerFactory
import java.net.URI

private val log = LoggerFactory.getLogger("com.kanjimasta.db.DatabaseConfig")
private val postgresUserInfo = Regex("(?i)((?:jdbc:)?postgres(?:ql)?://)[^/@\\s]+@")
private val databaseCredentialParameter =
    Regex("(?i)(\\b(?:user(?:name)?|(?:ssl)?password|passwd|pass|pwd)\\s*=\\s*)[^&\\s]+")

internal fun redactDatabaseSecrets(message: String): String = message
    .replace(postgresUserInfo, "$1***@")
    .replace(databaseCredentialParameter, "$1***")

internal class RedactingKtormLogger(
    private val delegate: KtormLogger,
) : KtormLogger {
    override fun isTraceEnabled() = delegate.isTraceEnabled()
    override fun trace(msg: String, e: Throwable?) = delegate.trace(redactDatabaseSecrets(msg), e)

    override fun isDebugEnabled() = delegate.isDebugEnabled()
    override fun debug(msg: String, e: Throwable?) = delegate.debug(redactDatabaseSecrets(msg), e)

    override fun isInfoEnabled() = delegate.isInfoEnabled()
    override fun info(msg: String, e: Throwable?) = delegate.info(redactDatabaseSecrets(msg), e)

    override fun isWarnEnabled() = delegate.isWarnEnabled()
    override fun warn(msg: String, e: Throwable?) = delegate.warn(redactDatabaseSecrets(msg), e)

    override fun isErrorEnabled() = delegate.isErrorEnabled()
    override fun error(msg: String, e: Throwable?) = delegate.error(redactDatabaseSecrets(msg), e)
}

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
    val maximumPoolSize = environment.config.propertyOrNull("database.maxPoolSize")
        ?.getString()?.toIntOrNull() ?: 7
    return connectDatabase(url, maximumPoolSize)
}

fun connectDatabase(url: String, maximumPoolSize: Int = 7): Database {
    require(url.isNotBlank()) { "DATABASE_URL must be set" }

    val jdbcUrl = toJdbcUrl(url)
    log.info("Connecting to database: {}", redactDatabaseSecrets(jdbcUrl))

    // Disable server-side prepared statements to avoid "prepared statement already exists"
    // errors with Supabase's connection pooler (PgBouncer)
    val separator = if ("?" in jdbcUrl) "&" else "?"
    val finalJdbcUrl = "$jdbcUrl${separator}prepareThreshold=0"

    val config = HikariConfig().apply {
        this.jdbcUrl = finalJdbcUrl
        this.maximumPoolSize = maximumPoolSize.coerceAtLeast(1)
        minimumIdle = 1
        idleTimeout = 60_000
        connectionTimeout = 10_000
        maxLifetime = 300_000
        isAutoCommit = true
    }

    val dataSource = HikariDataSource(config)
    return Database.connect(
        dataSource = dataSource,
        logger = RedactingKtormLogger(detectLoggerImplementation()),
    )
}
