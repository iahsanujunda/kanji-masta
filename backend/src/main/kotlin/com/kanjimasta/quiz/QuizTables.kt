package com.kanjimasta.quiz

import com.kanjimasta.db.*
import org.ktorm.schema.*

enum class QuizType {
    MEANING_RECALL, READING_RECOGNITION, REVERSE_READING, BOLD_WORD_MEANING, FILL_IN_THE_BLANK
}

enum class DistractorTrigger { INITIAL, MILESTONE, SERVE_COUNT }
enum class QuizSlotStatus { ACTIVE, COMPLETED, ABANDONED, EXPIRED }
enum class SessionCardType { INTRODUCTION, QUIZ }
enum class SessionCardStatus { PENDING, COMPLETED, DROPPED }
enum class IntroductionKind { NEW, REINTRODUCTION }

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
    val sourceAttemptId = uuid("source_attempt_id")
    val sourceItemIndex = int("source_item_index")
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

// unused as of 2026-08; kept to match live schema
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
