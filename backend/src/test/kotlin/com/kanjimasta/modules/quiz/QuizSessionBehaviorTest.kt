package com.kanjimasta.modules.quiz

import com.kanjimasta.core.db.KanjiMasterTable
import com.kanjimasta.core.db.QuizBankTable
import com.kanjimasta.core.db.QuizServeTable
import com.kanjimasta.core.db.QuizSessionCardTable
import com.kanjimasta.core.db.QuizSlotStatus
import com.kanjimasta.core.db.QuizSlotTable
import com.kanjimasta.core.db.QuizType
import com.kanjimasta.core.db.SessionCardStatus
import com.kanjimasta.core.db.SessionCardType
import com.kanjimasta.core.db.UserSettingsTable
import com.kanjimasta.core.db.UserWordsTable
import com.kanjimasta.core.db.WordMasterTable
import com.kanjimasta.core.db.WordSource
import com.kanjimasta.support.PersistenceTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.ktorm.dsl.insert
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class QuizSessionBehaviorTest : PersistenceTest() {
    private val userId = "quiz-selection-user"

    @Test
    fun `overdue reviews occupy at most sixty percent when resurfaced words are available`() {
        db.insert(UserSettingsTable) {
            set(it.userId, userId)
            set(it.quizAllowancePerSlot, 5)
            set(it.slotDurationHours, 6)
        }
        val overdueWords = buildSet {
            repeat(5) { add(seedReviewWord("overdue-$it", isOverdue = true).userWordId) }
        }
        repeat(5) { seedReviewWord("resurfaced-$it", isOverdue = false) }

        val service = QuizService(QuizRepository(db))
        var session = service.startSession(userId).session
        val servedWords = mutableListOf<String>()

        repeat(session.progress.allowance) {
            val card = checkNotNull(session.currentCard)
            servedWords += card.wordId
            val result = service.answer(
                userId = userId,
                slotId = session.slotId,
                request = AnswerRequest(
                    cardId = card.cardId,
                    submissionId = UUID.randomUUID().toString(),
                    expectedVersion = session.version,
                    answer = card.meaning,
                ),
            )
            session = assertIs<SessionCommandResult.Applied>(result).response.session
        }

        assertEquals(3, servedWords.count { it in overdueWords })
    }

    @Test
    fun `summary uses session order to decide whether a reviewed word needs revisiting`() {
        val word = seedReviewWord("summary-word", isOverdue = false)
        val slotId = UUID.randomUUID()
        db.insert(QuizSlotTable) {
            set(it.id, slotId)
            set(it.userId, userId)
            set(it.slotStart, Instant.now().minus(1, ChronoUnit.HOURS))
            set(it.slotEnd, Instant.now().plus(1, ChronoUnit.HOURS))
            set(it.completed, 2)
            set(it.allowance, 2)
            set(it.status, QuizSlotStatus.COMPLETED)
            set(it.version, 2)
            set(it.completedAt, Instant.now())
        }

        insertCompletedReview(
            slotId = slotId,
            position = 1,
            word = word,
            correct = true,
        )
        insertCompletedReview(
            slotId = slotId,
            position = 0,
            word = word,
            correct = false,
        )

        val summary = checkNotNull(QuizService(QuizRepository(db)).getSession(userId, slotId.toString()))
            .session.summary

        assertEquals(1, summary.reviewsCorrect)
        assertEquals(0, summary.toRevisit)
    }

    @Test
    fun `simultaneous start commands return one active session`() = runBlocking {
        db.insert(UserSettingsTable) {
            set(it.userId, userId)
            set(it.quizAllowancePerSlot, 5)
            set(it.slotDurationHours, 6)
        }
        repeat(5) { seedReviewWord("concurrent-$it", isOverdue = false) }
        val service = QuizService(QuizRepository(db))

        val sessions = listOf(
            async(Dispatchers.IO) { service.startSession(userId).session },
            async(Dispatchers.IO) { service.startSession(userId).session },
        ).awaitAll()

        assertEquals(1, sessions.map { it.slotId }.toSet().size)
        assertEquals(listOf("ACTIVE", "ACTIVE"), sessions.map { it.status })
    }

    @Test
    fun `simultaneous answers for one version apply exactly one command`() = runBlocking {
        db.insert(UserSettingsTable) {
            set(it.userId, userId)
            set(it.quizAllowancePerSlot, 5)
            set(it.slotDurationHours, 6)
        }
        repeat(5) { seedReviewWord("answer-race-$it", isOverdue = false) }
        val service = QuizService(QuizRepository(db))
        val session = service.startSession(userId).session
        val card = checkNotNull(session.currentCard)

        val results = listOf(
            async(Dispatchers.IO) {
                service.answer(
                    userId,
                    session.slotId,
                    AnswerRequest(
                        card.cardId,
                        UUID.randomUUID().toString(),
                        session.version,
                        card.meaning,
                    ),
                )
            },
            async(Dispatchers.IO) {
                service.answer(
                    userId,
                    session.slotId,
                    AnswerRequest(
                        card.cardId,
                        UUID.randomUUID().toString(),
                        session.version,
                        card.meaning,
                    ),
                )
            },
        ).awaitAll()

        assertEquals(1, results.count { it is SessionCommandResult.Applied })
        assertEquals(1, results.count { it is SessionCommandResult.Advanced })
        val latest = checkNotNull(service.getSession(userId, session.slotId)).session
        assertEquals(1, latest.progress.completed)
        assertTrue(latest.version == session.version + 1)
    }

    private data class SeededReviewWord(
        val userWordId: String,
        val quizId: UUID,
        val answer: String,
    )

    private fun seedReviewWord(label: String, isOverdue: Boolean): SeededReviewWord {
        val kanjiId = UUID.randomUUID()
        val wordMasterId = UUID.randomUUID()
        val userWordId = UUID.randomUUID()
        val quizId = UUID.randomUUID()
        val answer = "meaning-$label"
        db.insert(KanjiMasterTable) {
            set(it.id, kanjiId)
            set(it.character, label)
            set(it.meanings, listOf(answer))
        }
        db.insert(WordMasterTable) {
            set(it.id, wordMasterId)
            set(it.word, label)
            set(it.reading, "reading-$label")
            set(it.meanings, listOf(answer))
            set(it.kanjiIds, listOf(kanjiId.toString()))
        }
        db.insert(UserWordsTable) {
            set(it.id, userWordId)
            set(it.userId, userId)
            set(it.wordMasterId, wordMasterId)
            set(it.kanjiIds, listOf(kanjiId.toString()))
            set(it.source, WordSource.PHOTO)
            set(it.familiarity, 0)
            set(it.currentTier, QuizType.MEANING_RECALL)
            set(it.introducedAt, Instant.now().minus(30, ChronoUnit.DAYS))
            set(
                it.nextReview,
                if (isOverdue) Instant.now().minus(1, ChronoUnit.DAYS)
                else Instant.now().plus(30, ChronoUnit.DAYS),
            )
        }
        db.insert(QuizBankTable) {
            set(it.id, quizId)
            set(it.kanjiId, kanjiId)
            set(it.wordId, wordMasterId)
            set(it.quizType, QuizType.MEANING_RECALL)
            set(it.prompt, label)
            set(it.target, label)
            set(it.answer, answer)
        }
        return SeededReviewWord(userWordId.toString(), quizId = quizId, answer = answer)
    }

    private fun insertCompletedReview(
        slotId: UUID,
        position: Int,
        word: SeededReviewWord,
        correct: Boolean,
    ) {
        val cardId = UUID.randomUUID()
        db.insert(QuizSessionCardTable) {
            set(it.id, cardId)
            set(it.slotId, slotId)
            set(it.userId, userId)
            set(it.position, position)
            set(it.cardType, SessionCardType.QUIZ)
            set(it.status, SessionCardStatus.COMPLETED)
            set(it.userWordId, UUID.fromString(word.userWordId))
            set(it.quizId, word.quizId)
            set(it.completedAt, Instant.now())
        }
        db.insert(QuizServeTable) {
            set(it.quizId, word.quizId)
            set(it.slotId, slotId)
            set(it.userId, userId)
            set(it.wordFamiliarityAtServe, 0)
            set(it.correct, correct)
            set(it.sessionCardId, cardId)
            set(it.submissionId, UUID.randomUUID())
        }
    }
}
