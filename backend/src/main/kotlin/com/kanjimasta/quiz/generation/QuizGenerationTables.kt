package com.kanjimasta.quiz.generation

import com.kanjimasta.db.*
import org.ktorm.schema.*

enum class JobType { INITIAL, REGEN }
enum class JobStatus { PENDING, PROCESSING, DONE, FAILED }

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
