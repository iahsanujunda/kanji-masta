package com.kanjimasta

import com.kanjimasta.core.ai.AiModelConfigRepository
import com.kanjimasta.core.db.*
import com.kanjimasta.modules.kanji.KanjiRepository
import com.kanjimasta.modules.worker.GeneratedQuiz
import com.kanjimasta.modules.worker.QuizGenerationRepository
import com.kanjimasta.support.PersistenceTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.ktorm.dsl.*
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class QuizGenerationWorkerIntegrationTest : PersistenceTest() {
    @Test
    fun `concurrent drainers claim a pending row once`() = runBlocking {
        val (kanjiId, wordId) = seedQuizInput()
        KanjiRepository(db).insertQuizGenerationJob("quiz-user", kanjiId.toString(), wordId.toString())
        val repository = QuizGenerationRepository(db, AiModelConfigRepository(db))

        val claims = listOf("execution-a", "execution-b").map { owner ->
            async(Dispatchers.IO) { repository.claimNext(owner, leaseSeconds = 300) }
        }.awaitAll()

        assertEquals(1, claims.count { it != null })
        assertEquals(1, db.from(JobAttemptTable).select()
            .where { JobAttemptTable.status eq "processing" }.totalRecordsInAllPages)
    }

    @Test
    fun `expired claim is fenced while replacement publishes once and costs stay per attempt`() {
        val (kanjiId, wordId) = seedQuizInput()
        KanjiRepository(db).insertQuizGenerationJob("quiz-user", kanjiId.toString(), wordId.toString())
        val repository = QuizGenerationRepository(db, AiModelConfigRepository(db))

        val expiredClaim = repository.claimNext("execution-1", leaseSeconds = 300)!!
        db.update(JobAttemptTable) {
            set(it.leaseUntil, Instant.now().minusSeconds(1))
            where { it.id eq expiredClaim.attemptId }
        }
        val replacement = repository.claimNext("execution-2", leaseSeconds = 300)!!
        assertNotEquals(expiredClaim.claimToken, replacement.claimToken)

        val quiz = GeneratedQuiz(
            QuizType.MEANING_RECALL,
            prompt = "日",
            target = "日",
            answer = "day",
            furigana = null,
            explanation = "day",
            distractors = listOf("month", "year", "week"),
        )
        assertFalse(repository.completeInitial(expiredClaim, listOf(quiz), 100))
        assertTrue(repository.completeInitial(replacement, listOf(quiz), 200))
        assertFalse(repository.completeInitial(replacement, listOf(quiz), 200))

        assertEquals(1, db.from(QuizBankTable).select().totalRecordsInAllPages)
        assertEquals(1, db.from(QuizDistractorTable).select().totalRecordsInAllPages)
        assertEquals(2, db.from(UserCostTable).select().totalRecordsInAllPages)
        assertEquals(
            JobStatus.DONE,
            db.from(QuizGenerationJobTable).select(QuizGenerationJobTable.status)
                .map { it[QuizGenerationJobTable.status] }.single(),
        )
        val attempts = db.from(JobAttemptTable).select(JobAttemptTable.status, JobAttemptTable.failureCode)
            .orderBy(JobAttemptTable.attemptNumber.asc()).map { it[JobAttemptTable.status] to it[JobAttemptTable.failureCode] }
        assertEquals(listOf("failed" to "lease_expired", "done" to null), attempts)
    }

    private fun seedQuizInput(): Pair<UUID, UUID> {
        db.insert(AiModelConfigTable) {
            set(it.status, "active")
            set(it.photoAnalysisModel, "vision/model")
            set(it.quizGenerationModel, "quiz/model")
            set(it.wordDiscoveryModel, "discovery/model")
            set(it.validationStatus, "passed")
            set(it.createdBy, "test")
        }
        val kanjiId = UUID.randomUUID()
        db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, "日")
            set(it.meanings, listOf("day"))
        }
        val wordId = UUID.randomUUID()
        db.insert(WordMasterTable) {
            set(it.id, wordId)
            set(it.word, "日本")
            set(it.reading, "にほん")
            set(it.meanings, listOf("Japan"))
            set(it.kanjiIds, listOf(kanjiId.toString()))
        }
        return kanjiId to wordId
    }
}
