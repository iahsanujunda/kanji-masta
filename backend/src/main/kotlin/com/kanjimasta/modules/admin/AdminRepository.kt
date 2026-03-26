package com.kanjimasta.modules.admin

import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

class AdminRepository(private val db: Database) {

    fun getCostByUser(): List<CostByUser> {
        val photoCosts = mutableMapOf<String, Long>()
        val quizGenCosts = mutableMapOf<String, Long>()

        db.from(UserCostTable)
            .select(UserCostTable.userId, UserCostTable.operationType, UserCostTable.costMicrodollars)
            .map { row ->
                val uid = row[UserCostTable.userId] ?: return@map
                val opType = row[UserCostTable.operationType] ?: return@map
                val cost = row[UserCostTable.costMicrodollars] ?: 0L
                when (opType) {
                    "PHOTO_ANALYSIS" -> photoCosts[uid] = (photoCosts[uid] ?: 0L) + cost
                    else -> quizGenCosts[uid] = (quizGenCosts[uid] ?: 0L) + cost
                }
            }

        val allUsers = (photoCosts.keys + quizGenCosts.keys).toSet()
        return allUsers.map { uid ->
            val photo = photoCosts[uid] ?: 0L
            val quizGen = quizGenCosts[uid] ?: 0L
            CostByUser(uid, photo, quizGen, photo + quizGen)
        }.sortedByDescending { it.totalMicrodollars }
    }

    fun getCostByDay(days: Int): List<CostByDay> {
        val cutoff = Instant.now().minus(days.toLong(), ChronoUnit.DAYS)
        val dailyCosts = mutableMapOf<String, Long>()

        db.from(UserCostTable)
            .select(UserCostTable.createdAt, UserCostTable.costMicrodollars)
            .where { UserCostTable.createdAt greaterEq cutoff }
            .map { row ->
                val date = row[UserCostTable.createdAt]?.atOffset(ZoneOffset.UTC)?.toLocalDate()?.toString() ?: return@map
                val cost = row[UserCostTable.costMicrodollars] ?: 0L
                dailyCosts[date] = (dailyCosts[date] ?: 0L) + cost
            }

        return dailyCosts.entries
            .sortedBy { it.key }
            .map { CostByDay(it.key, it.value) }
    }

    fun getJobCounts(): JobCounts {
        var pending = 0; var processing = 0; var done = 0; var failed = 0
        db.from(QuizGenerationJobTable)
            .select(QuizGenerationJobTable.status)
            .map { row ->
                when (row[QuizGenerationJobTable.status]) {
                    JobStatus.PENDING -> pending++
                    JobStatus.PROCESSING -> processing++
                    JobStatus.DONE -> done++
                    JobStatus.FAILED -> failed++
                    null -> {}
                }
            }
        return JobCounts(pending, processing, done, failed)
    }

    fun getJobs(status: String?, limit: Int = 100): List<JobItem> {
        return db.from(QuizGenerationJobTable)
            .innerJoin(KanjiMasterTable, on = QuizGenerationJobTable.kanjiId eq KanjiMasterTable.id)
            .leftJoin(WordMasterTable, on = QuizGenerationJobTable.wordMasterId eq WordMasterTable.id)
            .select()
            .let { query ->
                if (status != null) {
                    query.where { QuizGenerationJobTable.status eq JobStatus.valueOf(status) }
                } else query
            }
            .orderBy(QuizGenerationJobTable.createdAt.desc())
            .limit(limit)
            .map { row ->
                JobItem(
                    id = row[QuizGenerationJobTable.id].toString(),
                    status = row[QuizGenerationJobTable.status]?.name ?: "UNKNOWN",
                    attempts = row[QuizGenerationJobTable.attempts] ?: 0,
                    kanji = row[KanjiMasterTable.character] ?: "",
                    word = row[WordMasterTable.word],
                    userId = row[QuizGenerationJobTable.userId] ?: "",
                    costMicrodollars = row[QuizGenerationJobTable.costMicrodollars],
                    createdAt = row[QuizGenerationJobTable.createdAt]?.toString() ?: "",
                )
            }
    }

    fun retryJob(id: UUID) {
        db.update(QuizGenerationJobTable) {
            set(it.status, JobStatus.PENDING)
            set(it.attempts, 0)
            where { it.id eq id }
        }
    }

    fun retryAllFailed(): Int {
        return db.update(QuizGenerationJobTable) {
            set(it.status, JobStatus.PENDING)
            set(it.attempts, 0)
            where { it.status eq JobStatus.FAILED }
        }
    }

    fun searchQuizzes(query: String?, limit: Int = 50): List<QuizItem> {
        return db.from(QuizBankTable)
            .innerJoin(KanjiMasterTable, on = QuizBankTable.kanjiId eq KanjiMasterTable.id)
            .innerJoin(WordMasterTable, on = QuizBankTable.wordId eq WordMasterTable.id)
            .select()
            .let { q ->
                if (!query.isNullOrBlank()) {
                    q.where {
                        (KanjiMasterTable.character like "%$query%") or
                            (WordMasterTable.word like "%$query%")
                    }
                } else q
            }
            .orderBy(QuizBankTable.servedCount.desc())
            .limit(limit)
            .map { row ->
                QuizItem(
                    id = row[QuizBankTable.id].toString(),
                    kanji = row[KanjiMasterTable.character] ?: "",
                    word = row[WordMasterTable.word] ?: "",
                    quizType = row[QuizBankTable.quizType]?.name ?: "",
                    prompt = row[QuizBankTable.prompt] ?: "",
                    answer = row[QuizBankTable.answer] ?: "",
                    servedCount = row[QuizBankTable.servedCount] ?: 0,
                )
            }
    }

    fun deleteQuiz(id: UUID) {
        db.delete(QuizDistractorTable) { it.quizId eq id }
        db.delete(QuizBankTable) { it.id eq id }
    }
}
