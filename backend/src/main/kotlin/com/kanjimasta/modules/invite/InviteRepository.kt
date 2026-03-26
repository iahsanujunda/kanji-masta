package com.kanjimasta.modules.invite

import com.kanjimasta.core.db.InviteStatus
import com.kanjimasta.core.db.UserInviteTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.time.Instant
import java.util.UUID

data class InviteRow(
    val id: UUID,
    val code: String,
    val email: String,
    val invitedBy: String,
    val status: InviteStatus,
    val createdAt: Instant,
    val acceptedAt: Instant?,
)

class InviteRepository(private val db: Database) {

    fun findByEmail(email: String): InviteRow? {
        return db.from(UserInviteTable)
            .select()
            .where { UserInviteTable.email eq email }
            .map(::mapRow)
            .firstOrNull()
    }

    fun findByCode(code: String): InviteRow? {
        return db.from(UserInviteTable)
            .select()
            .where { UserInviteTable.code eq code }
            .map(::mapRow)
            .firstOrNull()
    }

    fun findById(id: UUID): InviteRow? {
        return db.from(UserInviteTable)
            .select()
            .where { UserInviteTable.id eq id }
            .map(::mapRow)
            .firstOrNull()
    }

    fun insert(email: String, invitedBy: String): InviteRow {
        val id = UUID.randomUUID()
        val code = generateCode()
        val now = Instant.now()
        db.insert(UserInviteTable) {
            set(it.id, id)
            set(it.code, code)
            set(it.email, email)
            set(it.invitedBy, invitedBy)
            set(it.status, InviteStatus.PENDING)
        }
        return InviteRow(id, code, email, invitedBy, InviteStatus.PENDING, now, null)
    }

    fun accept(id: UUID) {
        db.update(UserInviteTable) {
            set(it.status, InviteStatus.ACCEPTED)
            set(it.acceptedAt, Instant.now())
            where { it.id eq id }
        }
    }

    fun revoke(id: UUID) {
        db.update(UserInviteTable) {
            set(it.status, InviteStatus.REVOKED)
            where { it.id eq id }
        }
    }

    fun listAll(): List<InviteRow> {
        return db.from(UserInviteTable)
            .select()
            .orderBy(UserInviteTable.createdAt.desc())
            .map(::mapRow)
    }

    private fun mapRow(row: QueryRowSet): InviteRow {
        return InviteRow(
            id = row[UserInviteTable.id]!!,
            code = row[UserInviteTable.code] ?: "",
            email = row[UserInviteTable.email] ?: "",
            invitedBy = row[UserInviteTable.invitedBy] ?: "",
            status = row[UserInviteTable.status] ?: InviteStatus.PENDING,
            createdAt = row[UserInviteTable.createdAt] ?: Instant.now(),
            acceptedAt = row[UserInviteTable.acceptedAt],
        )
    }

    companion object {
        private const val CODE_LENGTH = 10
        private const val CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

        fun generateCode(): String {
            return (1..CODE_LENGTH)
                .map { CODE_CHARS[kotlin.random.Random.nextInt(CODE_CHARS.length)] }
                .joinToString("")
        }
    }
}
