package com.kanjimasta.modules.user

import com.kanjimasta.modules.quiz.QuizRepository
import com.kanjimasta.modules.settings.SettingsRepository
import java.time.Instant

class UserService(
    private val userRepository: UserRepository,
    private val quizRepository: QuizRepository,
    private val settingsRepository: SettingsRepository,
) {
    fun ensureUserInitialized(email: String?, userId: String) {
        settingsRepository.ensureUserInitialized(email, userId)
    }

    fun getSummary(userId: String): UserSummaryResponse {
        val (learning, familiar) = userRepository.getKanjiCounts(userId)
        val wordCount = userRepository.getWordCount(userId)
        val streak = userRepository.getStreak(userId)

        val (allowance, _) = quizRepository.getUserSettings(userId)
        val activeSlot = quizRepository.getActiveSlot(userId)
        val now = Instant.now()

        var slotRemaining = allowance
        var slotEndsAt: String? = null

        if (activeSlot != null && activeSlot.slotEnd.isAfter(now)) {
            slotRemaining = (allowance - activeSlot.completed).coerceAtLeast(0)
            slotEndsAt = activeSlot.slotEnd.toString()
        }

        return UserSummaryResponse(
            kanjiLearning = learning,
            kanjiFamiliar = familiar,
            wordCount = wordCount,
            streak = streak,
            slotRemaining = slotRemaining,
            slotTotal = allowance,
            slotEndsAt = slotEndsAt,
            onboardingComplete = settingsRepository.getSettings(userId).onboardingComplete,
        )
    }
}
