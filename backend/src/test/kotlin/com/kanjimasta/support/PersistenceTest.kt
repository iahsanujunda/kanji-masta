package com.kanjimasta.support

import org.ktorm.database.Database
import java.sql.Connection
import kotlin.test.BeforeTest

abstract class PersistenceTest {
    protected val db: Database get() = TestPostgres.database

    @BeforeTest
    fun cleanDatabaseBeforeEachTest() {
        cleanDatabase()
    }
}

fun cleanDatabase() {
    TestPostgres.database.useConnection { connection ->
        val tables = connection.publicTableNames()
        if (tables.isEmpty()) return@useConnection

        val quotedTables = tables.joinToString(", ") { table ->
            "\"${table.replace("\"", "\"\"")}\""
        }
        connection.createStatement().use { statement ->
            statement.execute("TRUNCATE TABLE $quotedTables RESTART IDENTITY CASCADE")
        }
    }
}

private fun Connection.publicTableNames(): List<String> = prepareStatement(
    """
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
    """.trimIndent(),
).use { statement ->
    statement.executeQuery().use { rows ->
        buildList {
            while (rows.next()) add(rows.getString("tablename"))
        }
    }
}
