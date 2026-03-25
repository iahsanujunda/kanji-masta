package com.kanjimasta.core.db

import org.ktorm.schema.BaseTable
import org.ktorm.schema.Column
import org.ktorm.schema.SqlType
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.Types

// -- text[] ↔ List<String> --

object TextArraySqlType : SqlType<List<String>>(Types.ARRAY, "text[]") {
    override fun doSetParameter(ps: PreparedStatement, index: Int, parameter: List<String>) {
        val array = ps.connection.createArrayOf("text", parameter.toTypedArray())
        ps.setArray(index, array)
    }

    override fun doGetResult(rs: ResultSet, index: Int): List<String>? {
        val array = rs.getArray(index) ?: return null
        return (array.array as Array<*>).map { it.toString() }
    }
}

fun BaseTable<*>.textArray(name: String): Column<List<String>> {
    return registerColumn(name, TextArraySqlType)
}

// -- uuid[] ↔ List<String> (UUIDs stored as strings) --

object UuidArraySqlType : SqlType<List<String>>(Types.ARRAY, "uuid[]") {
    override fun doSetParameter(ps: PreparedStatement, index: Int, parameter: List<String>) {
        val array = ps.connection.createArrayOf("uuid", parameter.toTypedArray())
        ps.setArray(index, array)
    }

    override fun doGetResult(rs: ResultSet, index: Int): List<String>? {
        val array = rs.getArray(index) ?: return null
        return (array.array as Array<*>).map { it.toString() }
    }
}

fun BaseTable<*>.uuidArray(name: String): Column<List<String>> {
    return registerColumn(name, UuidArraySqlType)
}

// -- PostgreSQL enum ↔ Kotlin enum --

class PgEnumSqlType<T : Enum<T>>(
    private val enumClass: Class<T>,
    private val pgTypeName: String,
) : SqlType<T>(Types.OTHER, pgTypeName) {

    override fun doSetParameter(ps: PreparedStatement, index: Int, parameter: T) {
        ps.setObject(index, parameter.name, Types.OTHER)
    }

    override fun doGetResult(rs: ResultSet, index: Int): T? {
        val value = rs.getString(index) ?: return null
        return java.lang.Enum.valueOf(enumClass, value)
    }
}

inline fun <reified T : Enum<T>> BaseTable<*>.pgEnum(name: String, pgTypeName: String): Column<T> {
    return registerColumn(name, PgEnumSqlType(T::class.java, pgTypeName))
}
