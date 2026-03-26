package com.kanjimasta.modules.invite

import kotlinx.serialization.Serializable

@Serializable
data class CreateInviteRequest(val email: String)

@Serializable
data class InviteResponse(
    val id: String,
    val email: String,
    val code: String,
    val status: String,
    val invitedBy: String,
    val createdAt: String,
    val acceptedAt: String? = null,
)

@Serializable
data class InviteDetailsResponse(
    val email: String,
    val status: String,
)

@Serializable
data class InviteListResponse(val invites: List<InviteResponse>)
