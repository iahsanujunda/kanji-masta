package com.kanjimasta.kanji

import com.kanjimasta.db.*
import com.kanjimasta.quiz.QuizType
import org.ktorm.schema.*

enum class UserKanjiStatus { FAMILIAR, LEARNING }
enum class WordSource { PHOTO, QUIZ, CHALLENGE, DISCOVERY }

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
    val normalizedLemma = text("normalized_lemma")
    val normalizedReading = text("normalized_reading")
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
