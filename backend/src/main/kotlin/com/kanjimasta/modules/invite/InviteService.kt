package com.kanjimasta.modules.invite

import com.kanjimasta.core.db.InviteStatus
import com.kanjimasta.core.email.ResendClient
import com.kanjimasta.modules.settings.SettingsRepository
import org.slf4j.LoggerFactory
import java.util.UUID

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.invite.InviteService")

class InviteService(
    private val inviteRepository: InviteRepository,
    private val settingsRepository: SettingsRepository,
    private val resendClient: ResendClient,
) {
    suspend fun createInvite(email: String, adminUserId: String): InviteResponse {
        val existing = inviteRepository.findByEmail(email)
        if (existing != null) {
            return toResponse(existing)
        }

        val invite = inviteRepository.insert(email, adminUserId)
        resendClient.sendInvite(email, invite.code)
        logger.info("Invite created for email={} code={}", email, invite.code)
        return toResponse(invite)
    }

    fun listInvites(): InviteListResponse {
        return InviteListResponse(invites = inviteRepository.listAll().map(::toResponse))
    }

    fun revokeInvite(id: UUID) {
        inviteRepository.revoke(id)
        logger.info("Invite revoked id={}", id)
    }

    fun getInviteDetails(code: String): InviteDetailsResponse? {
        val invite = inviteRepository.findByCode(code) ?: return null
        return InviteDetailsResponse(email = invite.email, status = invite.status.name)
    }

    fun validateAndAcceptInvite(email: String?, userId: String): Boolean {
        if (email.isNullOrBlank()) return false

        val invite = inviteRepository.findByEmail(email) ?: return false
        if (invite.status != InviteStatus.PENDING) return false

        inviteRepository.accept(invite.id)
        settingsRepository.upsertSettings(userId, 5, 6)
        logger.info("Invite accepted for email={} userId={}", email, userId)
        return true
    }

    private fun toResponse(row: InviteRow) = InviteResponse(
        id = row.id.toString(),
        email = row.email,
        code = row.code,
        status = row.status.name,
        invitedBy = row.invitedBy,
        createdAt = row.createdAt.toString(),
        acceptedAt = row.acceptedAt?.toString(),
    )
}
