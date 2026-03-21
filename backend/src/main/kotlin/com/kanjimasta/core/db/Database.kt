package com.kanjimasta.core.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.server.application.*
import org.ktorm.database.Database

fun Application.configureDatabasePool(): Database {
    val dbHost = environment.config.property("database.host").getString()
    val dbPort = environment.config.property("database.port").getString()
    val dbName = environment.config.property("database.name").getString()
    val dbUser = environment.config.property("database.user").getString()
    val dbPassword = environment.config.property("database.password").getString()

    val hikariConfig = HikariConfig().apply {
        jdbcUrl = "jdbc:postgresql://$dbHost:$dbPort/$dbName"
        username = dbUser
        password = dbPassword
        maximumPoolSize = 10
        isAutoCommit = true
        validate()
    }

    val dataSource = HikariDataSource(hikariConfig)
    return Database.connect(dataSource)
}