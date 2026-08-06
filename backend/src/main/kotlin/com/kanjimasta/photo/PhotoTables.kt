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
    val processingStatus = text("processing_status")
    val pipelineVersion = int("pipeline_version")
    val fullText = text("full_text")
    val translation = text("translation")
    val translationLanguage = text("translation_language")
    val thumbnailPath = text("thumbnail_path")
    val capturedKanjiCoverage = float("captured_kanji_coverage")
    val readyAt = timestamp("ready_at")
    val selectionCompletedAt = timestamp("selection_completed_at")
    val lastRevisitedAt = timestamp("last_revisited_at")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object PhotoSessionTaskTable : Table<Nothing>("photo_session_task") {
    val id = uuid("id").primaryKey()
    val photoSessionId = uuid("photo_session_id")
    val taskType = text("task_type")
    val status = text("status")
    val requiredForReady = boolean("required_for_ready")
    val pipelineVersion = int("pipeline_version")
    val resultJson = text("result_json")
    val failureCode = text("failure_code")
    val leaseUntil = timestamp("lease_until")
    val claimedBy = text("claimed_by")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
    val finishedAt = timestamp("finished_at")
}

object PhotoSessionKanjiTable : Table<Nothing>("photo_session_kanji") {
    val photoSessionId = uuid("photo_session_id")
    val kanjiMasterId = uuid("kanji_master_id")
    val firstSeenOrder = int("first_seen_order")
    val recommendationRank = int("recommendation_rank")
    val whyUseful = text("why_useful")
    val excludedAt = timestamp("excluded_at")
    val pipelineVersion = int("pipeline_version")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object PhotoSessionKanjiDecisionTable : Table<Nothing>("photo_session_kanji_decision") {
    val id = uuid("id").primaryKey()
    val photoSessionId = uuid("photo_session_id")
    val kanjiMasterId = uuid("kanji_master_id")
    val batchId = uuid("batch_id")
    val decision = text("decision")
    val decisionSource = text("decision_source")
    val createdAt = timestamp("created_at")
}

object PhotoSessionWordTable : Table<Nothing>("photo_session_word") {
    val id = uuid("id").primaryKey()
    val photoSessionId = uuid("photo_session_id")
    val surfaceText = text("surface_text")
    val lemma = text("lemma")
    val normalizedLemma = text("normalized_lemma")
    val reading = text("reading")
    val normalizedReading = text("normalized_reading")
    val meaning = text("meaning")
    val firstSeenOrder = int("first_seen_order")
    val kanjiIds = uuidArray("kanji_ids")
    val wordMasterId = uuid("word_master_id")
    val pipelineVersion = int("pipeline_version")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object UserPhotoActivityStateTable : Table<Nothing>("user_photo_activity_state") {
    val userId = text("user_id").primaryKey()
    val seenThrough = timestamp("seen_through")
    val updatedAt = timestamp("updated_at")
}
