package com.kanjimasta.support

import org.ktorm.database.Database
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager

object TestPostgres {
    val container by lazy {
        PostgreSQLContainer("postgres:16-alpine")
            .withDatabaseName("test")
            .withUsername("test")
            .withPassword("test")
            .apply { start() }
    }

    val database: Database by lazy {
        val postgres = container
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.applySupabasePrelude()
            connection.applyProductionMigrations()
        }
        Database.connect(postgres.jdbcUrl, user = postgres.username, password = postgres.password)
    }
}

private fun Connection.applySupabasePrelude() {
    createStatement().use { statement ->
        statement.execute(
            """
            DO ${'$'}${'$'} BEGIN
                CREATE ROLE authenticated NOLOGIN;
            EXCEPTION WHEN duplicate_object THEN NULL;
            END ${'$'}${'$'};

            CREATE SCHEMA IF NOT EXISTS auth;
            CREATE SCHEMA IF NOT EXISTS storage;

            CREATE OR REPLACE FUNCTION auth.uid()
            RETURNS uuid LANGUAGE sql STABLE AS ${'$'}${'$'} SELECT NULL::uuid ${'$'}${'$'};

            CREATE OR REPLACE FUNCTION auth.email()
            RETURNS text LANGUAGE sql STABLE AS ${'$'}${'$'} SELECT NULL::text ${'$'}${'$'};

            CREATE OR REPLACE FUNCTION storage.foldername(path text)
            RETURNS text[] LANGUAGE sql IMMUTABLE AS ${'$'}${'$'}
                SELECT regexp_split_to_array(path, '/');
            ${'$'}${'$'};

            CREATE TABLE IF NOT EXISTS storage.buckets (
                id text PRIMARY KEY,
                name text NOT NULL,
                public boolean NOT NULL DEFAULT false
            );

            CREATE TABLE IF NOT EXISTS storage.objects (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                bucket_id text NOT NULL,
                name text NOT NULL
            );
            """.trimIndent(),
        )
    }
}

private fun Connection.applyProductionMigrations() {
    val migrationDirectory = Path.of(
        checkNotNull(System.getProperty("kanjimasta.migrations.dir")) {
            "kanjimasta.migrations.dir test property is not configured"
        },
    )
    val migrations = Files.list(migrationDirectory).use { paths ->
        paths
            .filter { Files.isRegularFile(it) && it.fileName.toString().endsWith(".sql") }
            .sorted()
            .toList()
    }

    migrations.forEach { migration ->
        try {
            createStatement().use { it.execute(Files.readString(migration)) }
        } catch (error: Exception) {
            throw IllegalStateException("Failed to apply production migration ${migration.fileName}", error)
        }
    }
}
