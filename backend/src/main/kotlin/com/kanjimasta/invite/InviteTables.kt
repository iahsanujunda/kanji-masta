package com.kanjimasta.invite

import com.kanjimasta.db.*
import org.ktorm.schema.*

enum class InviteStatus { PENDING, ACCEPTED, REVOKED }

object UserInviteTable : Table<Nothing>("user_invite") {
    val id = uuid("id").primaryKey()
    val code = text("code")
    val email = text("email")
    val invitedBy = text("invited_by")
    val status = pgEnum<InviteStatus>("status", "invite_status")
    val createdAt = timestamp("created_at")
    val acceptedAt = timestamp("accepted_at")
    val updatedAt = timestamp("updated_at")
}
