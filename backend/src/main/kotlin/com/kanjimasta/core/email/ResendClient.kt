package com.kanjimasta.core.email

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("com.kanjimasta.core.email.ResendClient")

class ResendClient(
    private val httpClient: HttpClient,
    private val apiKey: String,
) {
    suspend fun sendInvite(toEmail: String, inviteCode: String) {
        if (apiKey.isBlank()) {
            logger.warn("RESEND_API_KEY not set, skipping invite email to {}", toEmail)
            return
        }

        try {
            httpClient.post("https://api.resend.com/emails") {
                header("Authorization", "Bearer $apiKey")
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("from", "Kanji Masta <noreply@shuukanhq.com>")
                    put("to", toEmail)
                    put("subject", "You're invited to Kanji Masta")
                    put("text", """
                        You've been invited to join Kanji Masta —
                        a photo-driven kanji learning tool for people living in Japan.

                        Click to get started:
                        https://shuukanhq.com/signup?invite=$inviteCode

                        This link is personal to you. Do not share it.
                    """.trimIndent())
                }.toString())
            }
            logger.info("Invite email sent to {}", toEmail)
        } catch (e: Exception) {
            logger.error("Failed to send invite email to {}: {}", toEmail, e.message)
        }
    }
}
