package com.kanjimasta.core.db

import org.ktorm.schema.Table
import org.ktorm.schema.boolean
import org.ktorm.schema.date
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
enum class QuizSlotStatus { ACTIVE, COMPLETED, ABANDONED, EXPIRED }
enum class SessionCardType { INTRODUCTION, QUIZ }
enum class SessionCardStatus { PENDING, COMPLETED, DROPPED }
enum class IntroductionKind { NEW, REINTRODUCTION }

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
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object WordMasterTable : Table<Nothing>("word_master") {
    val id = uuid("id").primaryKey()
    val word = text("word")
    val reading = text("reading")
    val meanings = textArray("meanings")
    val kanjiIds = uuidArray("kanji_ids")
    val frequency = int("frequency")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
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
    val updatedAt = timestamp("updated_at")
}

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
    val updatedAt = timestamp("updated_at")
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
    val updatedAt = timestamp("updated_at")
}

object QuizSlotTable : Table<Nothing>("quiz_slot") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val slotStart = timestamp("slot_start")
    val slotEnd = timestamp("slot_end")
    val startedAt = timestamp("started_at")
    val completed = int("completed")
    val allowance = int("allowance")
    val status = pgEnum<QuizSlotStatus>("status", "quiz_slot_status")
    val version = int("version")
    val completedAt = timestamp("completed_at")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object QuizServeTable : Table<Nothing>("quiz_serve") {
    val id = uuid("id").primaryKey()
    val quizId = uuid("quiz_id")
    val distractorSetId = uuid("distractor_set_id")
    val slotId = uuid("slot_id")
    val userId = text("user_id")
    val wordFamiliarityAtServe = int("word_familiarity_at_serve")
    val correct = boolean("correct")
    val sessionCardId = uuid("session_card_id")
    val submissionId = uuid("submission_id")
    val answeredInMs = int("answered_in_ms")
    val answeredAt = timestamp("answered_at")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object QuizSessionCardTable : Table<Nothing>("quiz_session_card") {
    val id = uuid("id").primaryKey()
    val slotId = uuid("slot_id")
    val userId = text("user_id")
    val position = int("position")
    val cardType = pgEnum<SessionCardType>("card_type", "session_card_type")
    val status = pgEnum<SessionCardStatus>("status", "session_card_status")
    val userWordId = uuid("user_word_id")
    val quizId = uuid("quiz_id")
    val distractorSetId = uuid("distractor_set_id")
    val learningStep = int("learning_step")
    val introductionKind = pgEnum<IntroductionKind>("introduction_kind", "introduction_kind")
    val options = textArray("options")
    val submissionId = uuid("submission_id")
    val createdAt = timestamp("created_at")
    val completedAt = timestamp("completed_at")
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
    val updatedAt = timestamp("updated_at")
}

object JobAttemptTable : Table<Nothing>("job_attempt") {
    val id = uuid("id").primaryKey()
    val jobType = text("job_type")
    val jobId = uuid("job_id")
    val attemptNumber = int("attempt_number")
    val status = text("status")
    val trigger = text("trigger")
    val modelConfigVersion = long("model_config_version")
    val modelId = text("model_id")
    val failureCode = text("failure_code")
    val startedAt = timestamp("started_at")
    val finishedAt = timestamp("finished_at")
    val createdBy = text("created_by")
    val createdAt = timestamp("created_at")
}

object AiModelConfigTable : Table<Nothing>("ai_model_config") {
    val version = long("version").primaryKey()
    val status = text("status")
    val photoAnalysisModel = text("photo_analysis_model")
    val quizGenerationModel = text("quiz_generation_model")
    val wordDiscoveryModel = text("word_discovery_model")
    val validationStatus = text("validation_status")
    val failureCode = text("failure_code")
    val createdBy = text("created_by")
    val createdAt = timestamp("created_at")
    val validatedAt = timestamp("validated_at")
    val activatedAt = timestamp("activated_at")
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
    val introducedAt = timestamp("introduced_at")
    val consecutiveFailures = int("consecutive_failures")
    val discoveredViaKanjiId = uuid("discovered_via_kanji_id")
    val unlocked = boolean("unlocked")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object ChallengeSessionTable : Table<Nothing>("challenge_session") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val milestone = int("milestone")
    val triggeredAt = timestamp("triggered_at")
    val completedAt = timestamp("completed_at")
    val score = int("score")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object UserSettingsTable : Table<Nothing>("user_settings") {
    val userId = text("user_id").primaryKey()
    val quizAllowancePerSlot = int("quiz_allowance_per_slot")
    val slotDurationHours = int("slot_duration_hours")
    val timezone = text("timezone")
    val onboardingComplete = boolean("onboarding_complete")
    val birthDate = date("birth_date")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

object UserCostTable : Table<Nothing>("user_cost") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val operationType = text("operation_type")
    val operationId = uuid("operation_id")
    val costMicrodollars = long("cost_microdollars")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}

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
