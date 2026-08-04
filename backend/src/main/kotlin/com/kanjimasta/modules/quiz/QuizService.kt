package com.kanjimasta.modules.quiz

import com.kanjimasta.core.db.IntroductionKind
import com.kanjimasta.core.db.QuizSlotStatus
import com.kanjimasta.core.db.SessionCardType
import org.slf4j.LoggerFactory
import java.sql.SQLException
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.random.Random

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.quiz.QuizService")

private val TIER_FOR_FAMILIARITY = mapOf(
    0 to "MEANING_RECALL",
    1 to "READING_RECOGNITION",
    2 to "REVERSE_READING",
    3 to "BOLD_WORD_MEANING",
    4 to "FILL_IN_THE_BLANK",
    5 to "FILL_IN_THE_BLANK",
)

private val RESURFACING_WEIGHTS = mapOf(
    0 to listOf(70, 20, 5, 5, 0),
    1 to listOf(10, 60, 20, 5, 5),
    2 to listOf(5, 15, 60, 15, 5),
    3 to listOf(5, 10, 15, 60, 10),
    4 to listOf(5, 10, 10, 15, 60),
    5 to listOf(20, 20, 20, 20, 20),
)

private val QUIZ_TYPES = listOf(
    "MEANING_RECALL", "READING_RECOGNITION", "REVERSE_READING", "BOLD_WORD_MEANING", "FILL_IN_THE_BLANK",
)

private data class PlannedCard(
    val type: SessionCardType,
    val word: UserWordRow,
    val quiz: QuizBankRow? = null,
    val distractor: DistractorRow? = null,
    val options: List<String> = emptyList(),
    val learningStep: Int? = null,
    val introductionKind: IntroductionKind? = null,
)

class QuizService(private val quizRepository: QuizRepository) {
    fun getAvailability(userId: String): SessionAvailabilityResponse {
        val now = Instant.now()
        val active = quizRepository.getActiveSlot(userId)
        if (active != null && active.slotEnd.isAfter(now)) {
            return SessionAvailabilityResponse(
                state = "ACTIVE",
                slotId = active.id,
                availableAt = active.slotEnd.toString(),
                remaining = (active.allowance - active.completed).coerceAtLeast(0),
            )
        }
        val latest = quizRepository.getLatestFinishedSlot(userId)
        if (latest != null && latest.status == "COMPLETED" && latest.slotEnd.isAfter(now)) {
            return SessionAvailabilityResponse(state = "COOLDOWN", availableAt = latest.slotEnd.toString())
        }
        return SessionAvailabilityResponse(state = "READY")
    }

    fun startSession(userId: String): SessionResponse {
        return try {
            quizRepository.transaction { startOrResumeLocked(userId) }
        } catch (error: SQLException) {
            if (error.sqlState != "23505") throw error
            quizRepository.transaction { startOrResumeLocked(userId) }
        }
    }

    private fun startOrResumeLocked(userId: String): SessionResponse {
        val now = Instant.now()
        var slot = quizRepository.getActiveSlot(userId, lock = true)
        if (slot != null && !slot.slotEnd.isAfter(now)) {
            quizRepository.dropPendingLearningCards(slot.id)
            quizRepository.expireSlot(slot.id)
            slot = null
        }
        if (slot == null) {
            val coolingDown = quizRepository.getLatestFinishedSlot(userId)
                ?.takeIf { it.status == "COMPLETED" && it.slotEnd.isAfter(now) }
            if (coolingDown != null) return SessionResponse(snapshot(userId, coolingDown))
            val (allowance, durationHours) = quizRepository.getUserSettings(userId)
            slot = quizRepository.createSlot(
                userId = userId,
                start = now,
                end = now.plus(durationHours.toLong(), ChronoUnit.HOURS),
                allowance = allowance.coerceAtLeast(1),
            )
        }
        slot = ensureMaterialized(userId, slot)
        return SessionResponse(snapshot(userId, slot))
    }

    fun getSession(userId: String, slotId: String): SessionResponse? = quizRepository.transaction {
        var slot = quizRepository.getSlot(userId, slotId, lock = true) ?: return@transaction null
        if (slot.status == "ACTIVE" && !slot.slotEnd.isAfter(Instant.now())) {
            quizRepository.dropPendingLearningCards(slot.id)
            quizRepository.expireSlot(slot.id)
            slot = quizRepository.getSlot(userId, slotId)!!
        } else if (slot.status == "ACTIVE") {
            slot = ensureMaterialized(userId, slot)
        }
        SessionResponse(snapshot(userId, slot))
    }

    fun acknowledgeIntroduction(
        userId: String,
        slotId: String,
        request: IntroductionRequest,
    ): SessionCommandResult = quizRepository.transaction {
        var slot = quizRepository.getSlot(userId, slotId, lock = true)
            ?: return@transaction SessionCommandResult.NotFound

        val duplicate = quizRepository.getIntroductionBySubmission(slotId, request.submissionId)
        if (duplicate != null) {
            return@transaction SessionCommandResult.Applied(
                SessionCommandResponse(SessionFeedback("INTRODUCED"), snapshot(userId, slot)),
            )
        }
        if (slot.status != "ACTIVE") return@transaction SessionCommandResult.Invalid
        if (request.expectedVersion != slot.version) {
            return@transaction SessionCommandResult.Advanced(snapshot(userId, slot))
        }
        val card = quizRepository.getCurrentCard(slotId)
        if (card == null || card.id != request.cardId || card.cardType != "INTRODUCTION") {
            return@transaction SessionCommandResult.Invalid
        }

        quizRepository.completeIntroduction(card.id, request.submissionId)
        quizRepository.acknowledgeWord(card.userWordId, slot.slotEnd)
        quizRepository.updateSlot(
            slotId = slot.id,
            completed = slot.completed,
            allowance = slot.allowance,
            status = QuizSlotStatus.ACTIVE,
            version = slot.version + 1,
        )
        slot = quizRepository.getSlot(userId, slotId)!!
        SessionCommandResult.Applied(
            SessionCommandResponse(SessionFeedback("INTRODUCED"), snapshot(userId, slot)),
        )
    }

    fun answer(
        userId: String,
        slotId: String,
        request: AnswerRequest,
    ): SessionCommandResult = quizRepository.transaction {
        var slot = quizRepository.getSlot(userId, slotId, lock = true)
            ?: return@transaction SessionCommandResult.NotFound

        val duplicate = quizRepository.getServeBySubmission(slotId, request.submissionId)
        if (duplicate != null) {
            val answeredCard = quizRepository.getCards(slotId).firstOrNull { it.id == duplicate.cardId }
                ?: return@transaction SessionCommandResult.Invalid
            return@transaction SessionCommandResult.Applied(
                SessionCommandResponse(
                    feedbackFor(answeredCard, duplicate.correct, answeredCard.quizId?.let(quizRepository::getQuiz)),
                    session = snapshot(userId, slot),
                ),
            )
        }
        if (slot.status != "ACTIVE") return@transaction SessionCommandResult.Invalid
        if (request.expectedVersion != slot.version) {
            return@transaction SessionCommandResult.Advanced(snapshot(userId, slot))
        }
        val card = quizRepository.getCurrentCard(slotId)
        if (card == null || card.id != request.cardId || card.cardType != "QUIZ") {
            return@transaction SessionCommandResult.Invalid
        }
        val quiz = card.quizId?.let(quizRepository::getQuiz)
            ?: return@transaction SessionCommandResult.Invalid
        val word = quizRepository.getUserWord(userId, card.userWordId)
            ?: return@transaction SessionCommandResult.Invalid
        val correct = answersMatch(request.answer, quiz.answer)

        val outcome = wordOutcome(word, card.learningStep, correct, slot.slotEnd)
        quizRepository.updateWord(
            wordId = word.id,
            familiarity = outcome.familiarity,
            tier = TIER_FOR_FAMILIARITY[outcome.familiarity] ?: "MEANING_RECALL",
            nextReview = outcome.nextReview,
            failures = outcome.failures,
            introducedAt = outcome.introducedAt,
        )
        quizRepository.completeQuizCard(card.id)
        quizRepository.insertServe(
            card = card,
            slotId = slotId,
            userId = userId,
            familiarity = word.familiarity,
            correct = correct,
            submissionId = request.submissionId,
            answeredInMs = request.answeredInMs,
        )
        quizRepository.incrementQuizServed(quiz.id)
        quizRepository.markDistractorServed(card.distractorSetId)

        if (card.learningStep == 1 && !correct) insertStepTwo(userId, slot, card, word, quiz)

        val completed = slot.completed + 1
        val status = if (completed >= slot.allowance) QuizSlotStatus.COMPLETED else QuizSlotStatus.ACTIVE
        quizRepository.updateSlot(
            slotId = slot.id,
            completed = completed,
            allowance = slot.allowance,
            status = status,
            version = slot.version + 1,
            completedAt = if (status == QuizSlotStatus.COMPLETED) Instant.now() else null,
        )
        word.kanjiIds.forEach { recomputeKanjiFamiliarity(userId, it) }
        slot = quizRepository.getSlot(userId, slotId)!!

        logger.info(
            "Session answer user={} slot={} card={} correct={} familiarity={}→{}",
            userId, slotId, card.id, correct, word.familiarity, outcome.familiarity,
        )
        SessionCommandResult.Applied(
            SessionCommandResponse(feedbackFor(card, correct, quiz), snapshot(userId, slot)),
        )
    }

    fun exit(userId: String, slotId: String): SessionResponse? = quizRepository.transaction {
        var slot = quizRepository.getSlot(userId, slotId, lock = true) ?: return@transaction null
        if (slot.status != "ACTIVE") return@transaction SessionResponse(snapshot(userId, slot))
        val cards = quizRepository.getCards(slotId)
        val pendingLearning = cards.filter {
            it.status == "PENDING" && (it.cardType == "INTRODUCTION" || it.learningStep != null)
        }
        if (pendingLearning.isEmpty()) return@transaction SessionResponse(snapshot(userId, slot))
        val learningCards = pendingLearning.count {
            it.status == "PENDING" && it.cardType == "QUIZ" && it.learningStep != null
        }
        quizRepository.dropPendingLearningCards(slotId)
        val droppedAnswers = learningCards
        val allowance = (slot.allowance - droppedAnswers).coerceAtLeast(slot.completed)
        val pending = quizRepository.getCards(slotId).any { it.status == "PENDING" }
        val status = if (!pending || slot.completed >= allowance) QuizSlotStatus.COMPLETED else QuizSlotStatus.ACTIVE
        quizRepository.updateSlot(
            slotId = slot.id,
            completed = slot.completed,
            allowance = allowance,
            status = status,
            version = slot.version + 1,
            completedAt = if (status == QuizSlotStatus.COMPLETED) Instant.now() else null,
        )
        slot = quizRepository.getSlot(userId, slotId)!!
        SessionResponse(snapshot(userId, slot))
    }

    private fun ensureMaterialized(userId: String, slot: SlotRow): SlotRow {
        if (quizRepository.countCards(slot.id) > 0) return slot
        val remaining = (slot.allowance - slot.completed).coerceAtLeast(0)
        if (remaining == 0) return slot

        val introLimit = (remaining / 3).coerceAtMost(3)
        val introductions = quizRepository.getIntroductionWords(userId, introLimit * 4 + 4)
            .mapNotNull { word ->
                val quiz = quizRepository.getQuizForWord(word.wordMasterId, "MEANING_RECALL") ?: return@mapNotNull null
                val distractor = quizRepository.getDistractor(quiz.id)
                PlannedCard(
                    type = SessionCardType.INTRODUCTION,
                    word = word,
                    introductionKind = if (word.consecutiveFailures > 0) IntroductionKind.REINTRODUCTION else IntroductionKind.NEW,
                ) to PlannedCard(
                    type = SessionCardType.QUIZ,
                    word = word,
                    quiz = quiz,
                    distractor = distractor,
                    options = buildOptions(quiz, distractor, userId, forceMultipleChoice = true),
                    learningStep = 1,
                )
            }
            .take(introLimit)

        val normalNeeded = (remaining - introductions.size).coerceAtLeast(0)
        val excluded = introductions.map { it.first.word.id }.toSet()
        val overdueLimit = (normalNeeded * 0.6).toInt().coerceAtLeast(if (normalNeeded > 0) 1 else 0)
        val normalWords = (
            quizRepository.getOverdueWords(userId, normalNeeded * 4 + 4).take(overdueLimit * 2) +
                quizRepository.getLearningWords(userId, normalNeeded * 6 + 6)
            )
            .distinctBy { it.id }
            .filterNot { it.id in excluded }
            .mapNotNull { word ->
                val type = pickQuizType(word.familiarity)
                val quiz = quizRepository.getQuizForWord(word.wordMasterId, type)
                    ?: quizRepository.getAnyQuizForWord(word.wordMasterId)
                    ?: return@mapNotNull null
                val distractor = quizRepository.getDistractor(quiz.id)
                PlannedCard(
                    type = SessionCardType.QUIZ,
                    word = word,
                    quiz = quiz,
                    distractor = distractor,
                    options = buildOptions(quiz, distractor, userId),
                )
            }
            .take(normalNeeded)

        val planned = mutableListOf<PlannedCard>()
        planned += introductions.map { it.first }
        planned += normalWords
        introductions.forEach { pair ->
            val introIndex = planned.indexOf(pair.first)
            planned.add((introIndex + 3).coerceAtMost(planned.size), pair.second)
        }

        planned.forEachIndexed { position, card ->
            quizRepository.insertCard(
                slotId = slot.id,
                userId = userId,
                position = position,
                cardType = card.type,
                userWordId = card.word.id,
                quizId = card.quiz?.id,
                distractorSetId = card.distractor?.id,
                learningStep = card.learningStep,
                introductionKind = card.introductionKind,
                options = card.options,
            )
        }

        val answerCount = planned.count { it.type == SessionCardType.QUIZ }
        val adjustedAllowance = slot.completed + answerCount
        val status = if (answerCount == 0) QuizSlotStatus.COMPLETED else QuizSlotStatus.ACTIVE
        if (adjustedAllowance != slot.allowance || status != QuizSlotStatus.ACTIVE) {
            quizRepository.updateSlot(
                slotId = slot.id,
                completed = slot.completed,
                allowance = adjustedAllowance,
                status = status,
                version = slot.version,
                completedAt = if (status == QuizSlotStatus.COMPLETED) Instant.now() else null,
            )
            return quizRepository.getSlot(userId, slot.id)!!
        }
        return slot
    }

    private fun insertStepTwo(
        userId: String,
        slot: SlotRow,
        current: SessionCardRow,
        word: UserWordRow,
        quiz: QuizBankRow,
    ) {
        val cards = quizRepository.getCards(slot.id)
        val replacement = cards.lastOrNull {
            it.status == "PENDING" && it.cardType == "QUIZ" && it.learningStep == null
        } ?: return
        quizRepository.dropCard(replacement.id)
        val distractor = quizRepository.getDistractor(quiz.id)
        quizRepository.insertCard(
            slotId = slot.id,
            userId = userId,
            position = (cards.maxOfOrNull { it.position } ?: current.position) + 1,
            cardType = SessionCardType.QUIZ,
            userWordId = word.id,
            quizId = quiz.id,
            distractorSetId = distractor?.id,
            learningStep = 2,
            options = buildOptions(quiz, distractor, userId, forceMultipleChoice = true),
        )
    }

    private data class WordOutcome(
        val familiarity: Int,
        val nextReview: Instant?,
        val failures: Int,
        val introducedAt: Instant?,
    )

    private fun wordOutcome(
        word: UserWordRow,
        learningStep: Int?,
        correct: Boolean,
        slotEnd: Instant,
    ): WordOutcome {
        val now = Instant.now()
        if (learningStep != null) {
            if (correct) return WordOutcome(1, calculateNextReview(1, true), 0, word.introducedAt ?: now)
            if (learningStep == 1) return WordOutcome(0, slotEnd, word.consecutiveFailures, word.introducedAt ?: now)
            return tierZeroFailure(word, now)
        }

        if (correct) {
            val familiarity = (word.familiarity + 1).coerceAtMost(5)
            return WordOutcome(familiarity, calculateNextReview(familiarity, true), 0, word.introducedAt ?: now)
        }
        val familiarity = (word.familiarity - 1).coerceAtLeast(0)
        return if (word.familiarity == 0) tierZeroFailure(word, now)
        else WordOutcome(familiarity, calculateNextReview(familiarity, false), word.consecutiveFailures + 1, word.introducedAt)
    }

    private fun tierZeroFailure(word: UserWordRow, now: Instant): WordOutcome {
        val failures = word.consecutiveFailures + 1
        return if (failures >= 3) WordOutcome(0, null, failures, null)
        else WordOutcome(0, now.plus(1, ChronoUnit.DAYS), failures, word.introducedAt ?: now)
    }

    private fun snapshot(userId: String, slot: SlotRow): SessionSnapshot {
        val current = if (slot.status == "ACTIVE") quizRepository.getCurrentCard(slot.id) else null
        return SessionSnapshot(
            slotId = slot.id,
            status = slot.status,
            version = slot.version,
            slotEndsAt = slot.slotEnd.toString(),
            currentCard = current?.let { cardResponse(userId, it) },
            progress = SessionProgress(
                completed = slot.completed,
                allowance = slot.allowance,
                remaining = (slot.allowance - slot.completed).coerceAtLeast(0),
            ),
            summary = deriveSummary(slot.id),
        )
    }

    private fun cardResponse(userId: String, card: SessionCardRow): SessionCardResponse {
        val word = quizRepository.getUserWord(userId, card.userWordId)!!
        val breakdown = quizRepository.getKanjiBreakdown(word.kanjiIds)
        if (card.cardType == "INTRODUCTION") {
            val example = quizRepository.getExampleQuiz(word.wordMasterId)
            return SessionCardResponse(
                cardType = card.cardType,
                cardId = card.id,
                wordId = word.id,
                word = word.word,
                reading = word.reading,
                meaning = word.meanings.firstOrNull() ?: "",
                kanjiBreakdown = breakdown,
                introductionKind = card.introductionKind,
                exampleSentence = example?.prompt,
                exampleContext = example?.explanation,
                wordFamiliarity = word.familiarity,
            )
        }
        val quiz = quizRepository.getQuiz(card.quizId!!)!!
        return SessionCardResponse(
            cardType = card.cardType,
            cardId = card.id,
            wordId = word.id,
            word = word.word,
            reading = word.reading,
            meaning = word.meanings.firstOrNull() ?: "",
            kanjiBreakdown = breakdown,
            quizType = quiz.quizType,
            learningStep = card.learningStep,
            prompt = quiz.prompt,
            target = quiz.target,
            furigana = quiz.furigana,
            options = card.options,
            explanation = quiz.explanation,
            wordFamiliarity = word.familiarity,
        )
    }

    private fun deriveSummary(slotId: String): SessionSummary {
        val rows = quizRepository.getSummaryRows(slotId)
        val introKinds = quizRepository.getIntroductionKinds(slotId)
        val learningCorrect = rows.filter { it.learningStep != null && it.correct }.map { it.userWordId }.toSet()
        val normalRows = rows.filter { it.learningStep == null }
        val failedStepTwo = rows.filter { it.learningStep == 2 && !it.correct }.map { it.userWordId }
        val normalFinalMisses = normalRows.groupBy { it.userWordId }
            .filterValues { wordRows -> wordRows.lastOrNull()?.correct == false }
            .keys
        return SessionSummary(
            newWordsLearned = learningCorrect.count { introKinds[it] == "NEW" },
            reintroducedWordsLearned = learningCorrect.count { introKinds[it] == "REINTRODUCTION" },
            reviewsCorrect = normalRows.count { it.correct },
            toRevisit = (failedStepTwo + normalFinalMisses).toSet().size,
        )
    }

    private fun feedbackFor(card: SessionCardRow, correct: Boolean, quiz: QuizBankRow? = null): SessionFeedback {
        val type = when {
            card.learningStep != null && correct -> "LEARNED"
            card.learningStep == 1 -> "NOT_YET"
            card.learningStep == 2 -> "REVISIT_LATER"
            correct -> "CORRECT"
            else -> "INCORRECT"
        }
        val word = quizRepository.getUserWord(card.userId, card.userWordId)
        return SessionFeedback(
            type = type,
            correctAnswer = quiz?.answer,
            explanation = quiz?.explanation,
            kanjiBreakdown = word?.let { quizRepository.getKanjiBreakdown(it.kanjiIds) } ?: emptyList(),
        )
    }

    private fun answersMatch(actual: String, expected: String): Boolean =
        actual.trim().equals(expected.trim(), ignoreCase = true)

    private fun pickQuizType(familiarity: Int): String {
        val base = RESURFACING_WEIGHTS[familiarity.coerceIn(0, 5)] ?: RESURFACING_WEIGHTS.getValue(0)
        val maxIndex = familiarity.coerceIn(0, QUIZ_TYPES.lastIndex)
        val weights = base.mapIndexed { index, weight -> if (index <= maxIndex) weight else 0 }
        var roll = Random.nextInt(weights.sum().coerceAtLeast(1))
        weights.forEachIndexed { index, weight ->
            roll -= weight
            if (roll < 0) return QUIZ_TYPES[index]
        }
        return QUIZ_TYPES.first()
    }

    private fun buildOptions(
        quiz: QuizBankRow,
        distractor: DistractorRow?,
        userId: String,
        forceMultipleChoice: Boolean = false,
    ): List<String> {
        if (!forceMultipleChoice && quiz.quizType == "FILL_IN_THE_BLANK") return emptyList()
        val random = when (quiz.quizType) {
            "MEANING_RECALL", "BOLD_WORD_MEANING" -> quizRepository.getRandomMeanings(8)
            "READING_RECOGNITION" -> quizRepository.getRandomReadings(8)
            "REVERSE_READING" -> quizRepository.getRandomCharacters(8)
            "FILL_IN_THE_BLANK" -> quizRepository.getRandomUserWords(userId, 8)
            else -> emptyList()
        }
        return ((distractor?.distractors ?: emptyList()) + random)
            .filterNot { answersMatch(it, quiz.answer) }
            .distinct()
            .shuffled()
            .take(3)
            .plus(quiz.answer)
            .shuffled()
    }

    private fun recomputeKanjiFamiliarity(userId: String, kanjiId: String) {
        val words = quizRepository.getWordsForKanji(userId, kanjiId)
        if (words.isEmpty()) return
        val familiarities = words.map { it.familiarity }
        val familiarity = if (familiarities.size < 3) familiarities.min() else familiarities.sortedDescending().take(3).min()
        quizRepository.updateKanjiFamiliarity(
            userId = userId,
            kanjiId = kanjiId,
            familiarity = familiarity,
            tier = TIER_FOR_FAMILIARITY[familiarity] ?: "MEANING_RECALL",
            nextReview = words.mapNotNull { it.nextReview }.minOrNull(),
        )
    }

    private fun calculateNextReview(familiarity: Int, correct: Boolean): Instant {
        if (!correct) return Instant.now().plus(1, ChronoUnit.DAYS)
        val baseDays = when (familiarity) {
            0 -> 1
            1 -> 2
            2 -> 4
            3 -> 7
            4 -> 12
            else -> 18
        }
        val jitter = Random.nextInt(-(baseDays * 0.15).toInt().coerceAtLeast(1), (baseDays * 0.15).toInt().coerceAtLeast(1) + 1)
        return Instant.now().plus((baseDays + jitter).coerceAtLeast(1).toLong(), ChronoUnit.DAYS)
    }
}
