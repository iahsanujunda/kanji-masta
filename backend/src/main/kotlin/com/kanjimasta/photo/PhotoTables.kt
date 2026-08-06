package com.kanjimasta.photo

import com.kanjimasta.db.*
import org.ktorm.schema.*

object PhotoSessionTable : Table<Nothing>("photo_session") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val imageUrl = text("image_url")
    val rawAiResponse = text("raw_ai_response")
    val status = text("status")
    val storagePath = text("storage_path")
    val clientCaptureId = uuid("client_capture_id")
    val failureCode = text("failure_code")
    val attempts = int("attempts")
    val costMicrodollars = long("cost_microdollars")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object UserPhotoActivityStateTable : Table<Nothing>("user_photo_activity_state") {
    val userId = text("user_id").primaryKey()
    val seenThrough = timestamp("seen_through")
    val updatedAt = timestamp("updated_at")
}
