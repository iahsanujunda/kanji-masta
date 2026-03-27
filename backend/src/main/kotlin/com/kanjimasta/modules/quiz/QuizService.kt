package com.kanjimasta.modules.quiz

import org.slf4j.LoggerFactory
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
    "MEANING_RECALL", "READING_RECOGNITION", "REVERSE_READING", "BOLD_WORD_MEANING", "FILL_IN_THE_BLANK"
)

internal fun selectDiverseQuizzes(
    quizzes: List<QuizItem>,
    limit: Int,
    maxPerKanji: Int = 2
): List<QuizItem> {
    val countPerKanji = mutableMapOf<String, Int>()

    return quizzes
        .filter { quiz ->
            val count = countPerKanji.getOrDefault(quiz.kanjiId, 0)
            if (count < maxPerKanji) {
                countPerKanji[quiz.kanjiId] = count + 1
                true
            } else false
        }
        .take(limit)
}

class QuizService(private val quizRepository: QuizRepository) {

    fun getSlot(userId: String): SlotResponse {
        val (allowance, _) = quizRepository.getUserSettings(userId)
        val now = Instant.now()

        val activeSlot = quizRepository.getActiveSlot(userId)
            ?.takeIf { it.slotEnd.isAfter(now) }

        val remaining = activeSlot?.let {
            (allowance - it.completed).coerceAtLeast(0)
        } ?: allowance
        val slotEndsAt = activeSlot?.slotEnd?.toString()

        if (remaining == 0) {
            return SlotResponse(quizzes = emptyList(), remaining = 0, slotEndsAt = slotEndsAt)
        }

        // Overfetch 4x to account for words without quizzes and diversity filtering
        val fetchLimit = remaining * 4

        val overdueLimit = (fetchLimit * 0.6).toInt().coerceAtLeast(2)
        val newLimit = (fetchLimit * 0.2).toInt().coerceAtLeast(2)

        val overdueWords = quizRepository.getOverdueWords(userId, overdueLimit)
        val newWords = quizRepository.getNewWords(userId, newLimit)
        val resurfacedWords = quizRepository.getLearningWords(userId, fetchLimit)

        val selectedWords = (overdueWords.take(overdueLimit) +
                newWords.take(newLimit) +
                resurfacedWords)
            .distinctBy { it.id }
            .take(fetchLimit)

        val quizzes = selectedWords.mapNotNull { word ->
            val quizType = pickQuizType(word.familiarity)

            // Use 'run' to group the quiz fetching logic
            val quiz = quizRepository.getQuizForWordMaster(word.wordMasterId, quizType)
                ?: quizRepository.getAnyQuizForWordMaster(word.wordMasterId)
                ?: return@mapNotNull null // Equivalent to 'continue'

            // Fetch distractors
            val storedDistractors = quizRepository.getUnservedDistractor(quiz.id)?.distractors
                ?: quizRepository.getLatestDistractor(quiz.id)?.distractors
                ?: emptyList()

            with(quiz) {
                QuizItem(
                    id = id,
                    quizType = quizType,
                    word = word.word,
                    wordReading = word.reading,
                    prompt = prompt,
                    target = target,
                    furigana = furigana,
                    answer = answer,
                    options = if (word.familiarity >= 5) emptyList() else {
                        (storedDistractors + getRandomCandidates(quizType, quiz.answer, userId))
                            .filter { it != quiz.answer }
                            .distinct()
                            .shuffled()
                            .take(3)
                            .plus(quiz.answer)
                            .shuffled()
                    },
                    explanation = explanation,
                    wordFamiliarity = word.familiarity,
                    currentTier = word.currentTier,
                    kanjiId = kanjiId,
                )
            }
        }

        val diverseQuizzes = selectDiverseQuizzes(quizzes, limit = remaining)

        logger.info("Slot for user={}: {} quizzes selected", userId, diverseQuizzes.size)
        return SlotResponse(quizzes = diverseQuizzes, remaining = diverseQuizzes.size, slotEndsAt = slotEndsAt)
    }

    fun submitResult(userId: String, request: SubmitResultRequest): ResultResponse {
        val quiz = quizRepository.getQuizById(request.quizId)
            ?: return ResultResponse(remaining = 0, correct = request.correct, newFamiliarity = 0)

        val userWord = quizRepository.getUserWordByWordMaster(userId, quiz.wordId)
        val userWordId = userWord?.id ?: ""
        val oldFamiliarity = userWord?.familiarity ?: 0

        val newFamiliarity = if (request.correct) {
            (oldFamiliarity + 1).coerceAtMost(5)
        } else {
            (oldFamiliarity - 1).coerceAtLeast(0)
        }
        val newTier = TIER_FOR_FAMILIARITY[newFamiliarity] ?: "MEANING_RECALL"
        val nextReview = calculateNextReview(newFamiliarity, request.correct)

        if (userWordId.isNotEmpty()) {
            quizRepository.updateWordFamiliarity(userWordId, newFamiliarity, newTier, nextReview)
        }

        val kanjiIds = userWord?.kanjiIds ?: emptyList()
        for (kid in kanjiIds) {
            recomputeKanjiFamiliarity(userId, kid)
        }

        val now = Instant.now()
        val (allowance, durationHours) = quizRepository.getUserSettings(userId)
        val activeSlot = quizRepository.getActiveSlot(userId)
        var slotId: String? = null
        var completed = 0

        if (activeSlot != null && activeSlot.slotEnd.isAfter(now)) {
            slotId = activeSlot.id
            completed = activeSlot.completed
        }

        if (slotId == null) {
            val slotEnd = now.plus(durationHours.toLong(), ChronoUnit.HOURS)
            slotId = quizRepository.createSlot(userId, now.toString(), slotEnd.toString(), allowance)
            completed = 0
        }

        if (slotId != null) {
            quizRepository.incrementSlotCompleted(slotId)
            completed++

            val distractorId = quizRepository.getLatestDistractor(request.quizId)?.id ?: ""

            quizRepository.insertQuizServe(
                quizId = request.quizId,
                distractorSetId = distractorId,
                slotId = slotId,
                userId = userId,
                wordFamiliarityAtServe = oldFamiliarity,
                correct = request.correct,
            )

            if (distractorId.isNotEmpty()) {
                quizRepository.markDistractorServed(distractorId)
            }
        }

        quizRepository.incrementServedCount(request.quizId)

        val remaining = (allowance - completed).coerceAtLeast(0)
        logger.info("Result for user={} quiz={}: correct={} fam {}→{} remaining={}",
            userId, request.quizId, request.correct, oldFamiliarity, newFamiliarity, remaining)

        return ResultResponse(
            remaining = remaining,
            correct = request.correct,
            newFamiliarity = newFamiliarity,
            slotComplete = remaining == 0,
        )
    }

    private fun pickQuizType(familiarity: Int): String {
        val baseWeights = RESURFACING_WEIGHTS[familiarity.coerceIn(0, 5)] ?: RESURFACING_WEIGHTS[0]!!
        val maxTypeIndex = familiarity.coerceIn(0, QUIZ_TYPES.size - 1)
        val weights = baseWeights.mapIndexed { i, w -> if (i <= maxTypeIndex) w else 0 }
        val total = weights.sum()
        if (total == 0) return QUIZ_TYPES[0]
        var roll = Random.nextInt(total)
        for (i in weights.indices) {
            roll -= weights[i]
            if (roll < 0) return QUIZ_TYPES[i]
        }
        return QUIZ_TYPES[0]
    }

    private fun getRandomCandidates(quizType: String, answer: String, userId: String): List<String> {
        return when (quizType) {
            "MEANING_RECALL", "BOLD_WORD_MEANING" -> quizRepository.getRandomMeanings(10)
            "READING_RECOGNITION" -> quizRepository.getRandomReadings(10)
            "REVERSE_READING" -> quizRepository.getRandomCharacters(10)
            "FILL_IN_THE_BLANK" -> quizRepository.getRandomUserWords(userId, 10)
            else -> emptyList()
        }.filter { it != answer }.take(5)
    }

    private fun recomputeKanjiFamiliarity(userId: String, kanjiId: String) {
        val words = quizRepository.getWordsForKanji(userId, kanjiId)
        if (words.isEmpty()) return

        val familiarities = words.map { it.familiarity }
        val computed = if (familiarities.size < 3) {
            familiarities.min()
        } else {
            familiarities.sortedDescending().take(3).min()
        }

        val tier = TIER_FOR_FAMILIARITY[computed] ?: "MEANING_RECALL"
        val earliestReview = words.mapNotNull { it.nextReview?.toString() }.minOrNull()

        quizRepository.updateKanjiFamiliarity(userId, kanjiId, computed, tier, earliestReview)
    }

    private fun calculateNextReview(familiarity: Int, correct: Boolean): String {
        if (!correct) return Instant.now().plus(1, ChronoUnit.DAYS).toString()
        val baseDays = when (familiarity) {
            0 -> 1; 1 -> 2; 2 -> 4; 3 -> 7; 4 -> 12; else -> 18
        }
        val maxJitter = (baseDays * 0.15).toInt().coerceAtLeast(1)
        val jitter = Random.nextInt(-maxJitter, maxJitter + 1)
        val days = (baseDays + jitter).coerceAtLeast(1).toLong()
        return Instant.now().plus(days, ChronoUnit.DAYS).toString()
    }
}
