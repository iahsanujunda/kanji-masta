package com.kanjimasta.modules.user

import com.kanjimasta.modules.quiz.QuizRepository
import kotlinx.serialization.json.*
import java.time.Instant

class UserService(
    private val userRepository: UserRepository,
    private val quizRepository: QuizRepository,
) {
    suspend fun getSummary(userId: String): UserSummaryResponse {
        val (learning, familiar) = userRepository.getKanjiCounts(userId)
        val wordCount = userRepository.getWordCount(userId)
        val streak = userRepository.getStreak(userId)

        val (allowance, _) = quizRepository.getUserSettings(userId)
        val activeSlot = quizRepository.getActiveSlot(userId)
        val now = Instant.now()

        var slotRemaining = allowance
        var slotEndsAt: String? = null

        if (activeSlot != null) {
            val slotEnd = activeSlot["slotEnd"]?.jsonPrimitive?.contentOrNull ?: ""
            val endInstant = try { Instant.parse(slotEnd) } catch (_: Exception) { Instant.MIN }
            if (endInstant.isAfter(now)) {
                val completed = activeSlot["completed"]?.jsonPrimitive?.intOrNull ?: 0
                slotRemaining = (allowance - completed).coerceAtLeast(0)
                slotEndsAt = slotEnd
            }
        }

        return UserSummaryResponse(
            kanjiLearning = learning,
            kanjiFamiliar = familiar,
            wordCount = wordCount,
            streak = streak,
            slotRemaining = slotRemaining,
            slotTotal = allowance,
            slotEndsAt = slotEndsAt,
        )
    }
}
