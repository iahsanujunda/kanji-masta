package com.kanjimasta.core.db

import org.ktorm.logging.Logger
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertFalse

class DatabaseLogRedactionTest {

    @Test
    fun `redacts credentials from JDBC query parameters`() {
        val message =
            "Connected to jdbc:postgresql://db.example/postgres?user=app_user&password=very-secret,with-punctuation&prepareThreshold=0"

        val redacted = redactDatabaseSecrets(message)

        assertContains(redacted, "user=***")
        assertContains(redacted, "password=***")
        assertContains(redacted, "prepareThreshold=0")
        assertFalse(redacted.contains("app_user"))
        assertFalse(redacted.contains("very-secret,with-punctuation"))
    }

    @Test
    fun `redacts credentials from PostgreSQL URI user info`() {
        val message = "Connecting to postgresql://app_user:very-secret@db.example:5432/postgres?sslmode=require"

        val redacted = redactDatabaseSecrets(message)

        assertContains(redacted, "postgresql://***@db.example:5432/postgres")
        assertFalse(redacted.contains("app_user"))
        assertFalse(redacted.contains("very-secret"))
    }

    @Test
    fun `Ktorm logger redacts messages before delegation`() {
        val delegate = RecordingLogger()
        val logger = RedactingKtormLogger(delegate)

        logger.info("Connected to jdbc:postgresql://db/postgres?user=app_user&password=very-secret")

        assertContains(delegate.message, "user=***")
        assertContains(delegate.message, "password=***")
        assertFalse(delegate.message.contains("app_user"))
        assertFalse(delegate.message.contains("very-secret"))
    }
}

private class RecordingLogger : Logger {
    var message = ""

    override fun isTraceEnabled() = true
    override fun trace(msg: String, e: Throwable?) { message = msg }
    override fun isDebugEnabled() = true
    override fun debug(msg: String, e: Throwable?) { message = msg }
    override fun isInfoEnabled() = true
    override fun info(msg: String, e: Throwable?) { message = msg }
    override fun isWarnEnabled() = true
    override fun warn(msg: String, e: Throwable?) { message = msg }
    override fun isErrorEnabled() = true
    override fun error(msg: String, e: Throwable?) { message = msg }
}
