package com.kanjimasta.modules.quiz

import kotlinx.serialization.json.*
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

class QuizService(private val quizRepository: QuizRepository) {

    suspend fun getSlot(userId: String): SlotResponse {
        val (allowance, _) = quizRepository.getUserSettings(userId)
        val now = Instant.now()

        // Check for active slot
        val activeSlot = quizRepository.getActiveSlot(userId)
        var slotEndsAt: String? = null
        var remaining = allowance

        if (activeSlot != null) {
            val slotEnd = activeSlot["slotEnd"]?.jsonPrimitive?.content ?: ""
            val endInstant = try { Instant.parse(slotEnd) } catch (_: Exception) { Instant.MIN }
            if (endInstant.isAfter(now)) {
                val completed = activeSlot["completed"]?.jsonPrimitive?.int ?: 0
                remaining = (allowance - completed).coerceAtLeast(0)
                slotEndsAt = slotEnd
            }
        }

        if (remaining == 0) {
            return SlotResponse(quizzes = emptyList(), remaining = 0, slotEndsAt = slotEndsAt)
        }

        // Select words by priority
        val overdueLimit = (allowance * 0.6).toInt().coerceAtLeast(1)
        val newLimit = (allowance * 0.2).toInt().coerceAtLeast(1)

        val overdueWords = quizRepository.getOverdueWords(userId, overdueLimit)
        val newWords = quizRepository.getNewWords(userId, newLimit)
        val resurfacedWords = quizRepository.getLearningWords(userId, allowance)

        val seenIds = mutableSetOf<String>()
        val selectedWords = mutableListOf<JsonObject>()

        fun addWords(words: JsonArray, limit: Int) {
            for (w in words) {
                if (selectedWords.size >= remaining) break
                val id = w.jsonObject["id"]?.jsonPrimitive?.content ?: continue
                if (id in seenIds) continue
                seenIds.add(id)
                selectedWords.add(w.jsonObject)
                if (selectedWords.size >= limit) break
            }
        }

        addWords(overdueWords, overdueLimit)
        addWords(newWords, newLimit + selectedWords.size)
        addWords(resurfacedWords, remaining)

        // Build quiz items
        val quizzes = mutableListOf<QuizItem>()
        for (word in selectedWords) {
            val wordId = word["id"]?.jsonPrimitive?.content ?: continue
            val wordText = word["word"]?.jsonPrimitive?.content ?: continue
            val wordReading = word["reading"]?.jsonPrimitive?.content ?: ""
            val familiarity = word["familiarity"]?.jsonPrimitive?.int ?: 0
            val currentTier = word["currentTier"]?.jsonPrimitive?.content ?: "MEANING_RECALL"

            val quizType = pickQuizType(familiarity)

            val quiz = quizRepository.getQuizForWord(userId, wordId, quizType)
                ?: quizRepository.getAnyQuizForWord(userId, wordId)
                ?: continue

            val quizId = quiz["id"]?.jsonPrimitive?.content ?: continue
            val answer = quiz["answer"]?.jsonPrimitive?.content ?: ""

            // Resolve distractors
            val distractor = quizRepository.getUnservedDistractor(quizId)
                ?: quizRepository.getLatestDistractor(quizId)
            val storedDistractors = distractor?.get("distractors")?.jsonArray
                ?.map { it.jsonPrimitive.content } ?: emptyList()

            // Augment
            val randomCandidates = getRandomCandidates(quizType, answer, userId)
            val pool = (storedDistractors + randomCandidates)
                .filter { it != answer }
                .distinct()
                .shuffled()
                .take(3)
            val options = (pool + answer).shuffled()

            quizzes.add(QuizItem(
                id = quizId,
                quizType = quiz["quizType"]?.jsonPrimitive?.content ?: quizType,
                word = wordText,
                wordReading = wordReading,
                prompt = quiz["prompt"]?.jsonPrimitive?.content ?: "",
                target = quiz["target"]?.jsonPrimitive?.content ?: "",
                furigana = quiz["furigana"]?.jsonPrimitive?.contentOrNull,
                answer = answer,
                options = if (familiarity >= 5) emptyList() else options,
                explanation = quiz["explanation"]?.jsonPrimitive?.contentOrNull,
                wordFamiliarity = familiarity,
                currentTier = currentTier,
            ))
        }

        logger.info("Slot for user={}: {} quizzes selected", userId, quizzes.size)
        return SlotResponse(quizzes = quizzes, remaining = quizzes.size, slotEndsAt = slotEndsAt)
    }

    suspend fun submitResult(userId: String, request: SubmitResultRequest): ResultResponse {
        val quiz = quizRepository.getQuizById(request.quizId)
            ?: return ResultResponse(remaining = 0, correct = request.correct, newFamiliarity = 0)

        val wordId = quiz["wordId"]?.jsonPrimitive?.content ?: ""
        val word = quizRepository.getWordById(wordId)
        val oldFamiliarity = word?.get("familiarity")?.jsonPrimitive?.int ?: 0

        val newFamiliarity = if (request.correct) {
            (oldFamiliarity + 1).coerceAtMost(5)
        } else {
            (oldFamiliarity - 1).coerceAtLeast(0)
        }
        val newTier = TIER_FOR_FAMILIARITY[newFamiliarity] ?: "MEANING_RECALL"
        val nextReview = calculateNextReview(newFamiliarity, request.correct)

        quizRepository.updateWordFamiliarity(wordId, newFamiliarity, newTier, nextReview)

        // Recompute kanji familiarity
        val kanjiIds = word?.get("kanjiIds")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
        for (kid in kanjiIds) {
            recomputeKanjiFamiliarity(userId, kid)
        }

        // Find or create slot
        val now = Instant.now()
        val (allowance, durationHours) = quizRepository.getUserSettings(userId)
        val activeSlot = quizRepository.getActiveSlot(userId)
        var slotId: String? = null
        var completed = 0

        if (activeSlot != null) {
            val slotEnd = activeSlot["slotEnd"]?.jsonPrimitive?.content ?: ""
            val endInstant = try { Instant.parse(slotEnd) } catch (_: Exception) { Instant.MIN }
            if (endInstant.isAfter(now)) {
                slotId = activeSlot["id"]?.jsonPrimitive?.content
                completed = activeSlot["completed"]?.jsonPrimitive?.int ?: 0
            }
        }

        if (slotId == null) {
            val slotEnd = now.plus(durationHours.toLong(), ChronoUnit.HOURS)
            slotId = quizRepository.createSlot(userId, now.toString(), slotEnd.toString(), allowance)
            completed = 0
        }

        if (slotId != null) {
            quizRepository.incrementSlotCompleted(slotId)
            completed++

            val distractorId = quizRepository.getLatestDistractor(request.quizId)
                ?.get("id")?.jsonPrimitive?.content ?: ""

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
        val weights = RESURFACING_WEIGHTS[familiarity.coerceIn(0, 5)] ?: RESURFACING_WEIGHTS[0]!!
        val total = weights.sum()
        var roll = Random.nextInt(total)
        for (i in weights.indices) {
            roll -= weights[i]
            if (roll < 0) return QUIZ_TYPES[i]
        }
        return QUIZ_TYPES.last()
    }

    private suspend fun getRandomCandidates(quizType: String, answer: String, userId: String): List<String> {
        return when (quizType) {
            "MEANING_RECALL", "BOLD_WORD_MEANING" -> quizRepository.getRandomMeanings(10)
            "READING_RECOGNITION" -> quizRepository.getRandomReadings(10)
            "REVERSE_READING" -> quizRepository.getRandomCharacters(10)
            "FILL_IN_THE_BLANK" -> quizRepository.getRandomUserWords(userId, 10)
            else -> emptyList()
        }.filter { it != answer }.take(5)
    }

    private suspend fun recomputeKanjiFamiliarity(userId: String, kanjiId: String) {
        val words = quizRepository.getWordsForKanji(userId, kanjiId)
        if (words.isEmpty()) return

        val familiarities = words.map { it.jsonObject["familiarity"]?.jsonPrimitive?.int ?: 0 }
        val computed = if (familiarities.size < 3) {
            familiarities.min()
        } else {
            familiarities.sortedDescending().take(3).min()
        }

        val tier = TIER_FOR_FAMILIARITY[computed] ?: "MEANING_RECALL"
        val earliestReview = words.mapNotNull { it.jsonObject["nextReview"]?.jsonPrimitive?.contentOrNull }
            .minOrNull()

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
