package com.kanjimasta.core.db

import org.ktorm.schema.Table
import org.ktorm.schema.boolean
import org.ktorm.schema.int
import org.ktorm.schema.long
import org.ktorm.schema.text
import org.ktorm.schema.timestamp
import org.ktorm.schema.uuid
import java.time.Instant
import java.util.UUID

// =============================================================================
// Kotlin enums matching PostgreSQL enums
// =============================================================================

enum class QuizType {
    MEANING_RECALL, READING_RECOGNITION, REVERSE_READING, BOLD_WORD_MEANING, FILL_IN_THE_BLANK
}

enum class UserKanjiStatus { FAMILIAR, LEARNING }
enum class JobType { INITIAL, REGEN }
enum class JobStatus { PENDING, PROCESSING, DONE, FAILED }
enum class DistractorTrigger { INITIAL, MILESTONE, SERVE_COUNT }
enum class WordSource { PHOTO, QUIZ, CHALLENGE, DISCOVERY }
enum class InviteStatus { PENDING, ACCEPTED, REVOKED }

// =============================================================================
// Table definitions
// =============================================================================

object KanjiMasterTable : Table<Nothing>("kanji_master") {
    val id = uuid("id").primaryKey()
    val character = text("character")
    val onyomi = textArray("onyomi")
    val kunyomi = textArray("kunyomi")
    val meanings = textArray("meanings")
    val frequency = int("frequency")
    val jlpt = int("jlpt")
}

object WordMasterTable : Table<Nothing>("word_master") {
    val id = uuid("id").primaryKey()
    val word = text("word")
    val reading = text("reading")
    val meanings = textArray("meanings")
    val kanjiIds = uuidArray("kanji_ids")
    val frequency = int("frequency")
    val createdAt = timestamp("created_at")
}

object UserKanjiTable : Table<Nothing>("user_kanji") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val kanjiId = uuid("kanji_id")
    val status = pgEnum<UserKanjiStatus>("status", "user_kanji_status")
    val familiarity = int("familiarity")
    val currentTier = pgEnum<QuizType>("current_tier", "quiz_type")
    val nextReview = timestamp("next_review")
    val sourcePhotoId = uuid("source_photo_id")
    val createdAt = timestamp("created_at")
}

object PhotoSessionTable : Table<Nothing>("photo_session") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val imageUrl = text("image_url")
    val rawAiResponse = text("raw_ai_response")
    val costMicrodollars = long("cost_microdollars")
    val createdAt = timestamp("created_at")
}

object QuizBankTable : Table<Nothing>("quiz_bank") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val kanjiId = uuid("kanji_id")
    val wordId = uuid("word_id")
    val quizType = pgEnum<QuizType>("quiz_type", "quiz_type")
    val prompt = text("prompt")
    val furigana = text("furigana")
    val target = text("target")
    val answer = text("answer")
    val explanation = text("explanation")
    val servedCount = int("served_count")
    val servedAt = timestamp("served_at")
    val createdAt = timestamp("created_at")
}

object QuizDistractorTable : Table<Nothing>("quiz_distractor") {
    val id = uuid("id").primaryKey()
    val quizId = uuid("quiz_id")
    val userId = text("user_id")
    val distractors = textArray("distractors")
    val generation = int("generation")
    val trigger = pgEnum<DistractorTrigger>("trigger", "distractor_trigger")
    val familiarityAtGeneration = int("familiarity_at_generation")
    val servedAt = timestamp("served_at")
    val createdAt = timestamp("created_at")
}

object QuizSlotTable : Table<Nothing>("quiz_slot") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val slotStart = timestamp("slot_start")
    val slotEnd = timestamp("slot_end")
    val startedAt = timestamp("started_at")
    val completed = int("completed")
    val allowance = int("allowance")
    val createdAt = timestamp("created_at")
}

object QuizServeTable : Table<Nothing>("quiz_serve") {
    val id = uuid("id").primaryKey()
    val quizId = uuid("quiz_id")
    val distractorSetId = uuid("distractor_set_id")
    val slotId = uuid("slot_id")
    val userId = text("user_id")
    val wordFamiliarityAtServe = int("word_familiarity_at_serve")
    val correct = boolean("correct")
    val answeredAt = timestamp("answered_at")
}

object QuizGenerationJobTable : Table<Nothing>("quiz_generation_job") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val kanjiId = uuid("kanji_id")
    val wordMasterId = uuid("word_master_id")
    val quizId = uuid("quiz_id")
    val jobType = pgEnum<JobType>("job_type", "job_type")
    val trigger = text("trigger")
    val status = pgEnum<JobStatus>("status", "job_status")
    val attempts = int("attempts")
    val costMicrodollars = long("cost_microdollars")
    val createdAt = timestamp("created_at")
}

object UserWordsTable : Table<Nothing>("user_words") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val wordMasterId = uuid("word_master_id")
    val kanjiIds = uuidArray("kanji_ids")
    val source = pgEnum<WordSource>("source", "word_source")
    val familiarity = int("familiarity")
    val currentTier = pgEnum<QuizType>("current_tier", "quiz_type")
    val nextReview = timestamp("next_review")
    val discoveredViaKanjiId = uuid("discovered_via_kanji_id")
    val unlocked = boolean("unlocked")
    val createdAt = timestamp("created_at")
}

object ChallengeSessionTable : Table<Nothing>("challenge_session") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val milestone = int("milestone")
    val triggeredAt = timestamp("triggered_at")
    val completedAt = timestamp("completed_at")
    val score = int("score")
}

object UserSettingsTable : Table<Nothing>("user_settings") {
    val userId = text("user_id").primaryKey()
    val quizAllowancePerSlot = int("quiz_allowance_per_slot")
    val slotDurationHours = int("slot_duration_hours")
    val timezone = text("timezone")
    val onboardingComplete = boolean("onboarding_complete")
    val updatedAt = timestamp("updated_at")
}

object UserCostTable : Table<Nothing>("user_cost") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val operationType = text("operation_type")
    val operationId = uuid("operation_id")
    val costMicrodollars = long("cost_microdollars")
    val createdAt = timestamp("created_at")
}

object UserInviteTable : Table<Nothing>("user_invite") {
    val id = uuid("id").primaryKey()
    val code = text("code")
    val email = text("email")
    val invitedBy = text("invited_by")
    val status = pgEnum<InviteStatus>("status", "invite_status")
    val createdAt = timestamp("created_at")
    val acceptedAt = timestamp("accepted_at")
}
