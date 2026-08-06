package com.kanjimasta.quiz

import kotlinx.serialization.Serializable

@Serializable
data class KanjiBreakdownItem(val character: String, val meaning: String)

@Serializable
data class SessionCardResponse(
    val cardType: String,
    val cardId: String,
    val wordId: String,
    val word: String,
    val reading: String,
    val meaning: String,
    val kanjiBreakdown: List<KanjiBreakdownItem> = emptyList(),
    val introductionKind: String? = null,
    val exampleSentence: String? = null,
    val exampleContext: String? = null,
    val quizType: String? = null,
    val learningStep: Int? = null,
    val prompt: String? = null,
    val target: String? = null,
    val furigana: String? = null,
    val options: List<String> = emptyList(),
    val explanation: String? = null,
    val wordFamiliarity: Int = 0,
)

@Serializable
data class SessionProgress(val completed: Int, val allowance: Int, val remaining: Int)

@Serializable
data class SessionSummary(
    val newWordsLearned: Int = 0,
    val reintroducedWordsLearned: Int = 0,
    val reviewsCorrect: Int = 0,
    val toRevisit: Int = 0,
)

@Serializable
data class SessionSnapshot(
    val slotId: String,
    val status: String,
    val version: Int,
    val slotEndsAt: String,
    val currentCard: SessionCardResponse? = null,
    val progress: SessionProgress,
    val summary: SessionSummary,
)

@Serializable
data class SessionResponse(val session: SessionSnapshot)

@Serializable
data class SessionCommandResponse(
    val feedback: SessionFeedback,
    val session: SessionSnapshot,
)

@Serializable
data class SessionFeedback(
    val type: String,
    val correctAnswer: String? = null,
    val explanation: String? = null,
    val kanjiBreakdown: List<KanjiBreakdownItem> = emptyList(),
)

@Serializable
data class IntroductionRequest(
    val cardId: String,
    val submissionId: String,
    val expectedVersion: Int,
)

@Serializable
data class AnswerRequest(
    val cardId: String,
    val submissionId: String,
    val expectedVersion: Int,
    val answer: String,
    val answeredInMs: Int? = null,
)

@Serializable
data class SessionAdvancedResponse(val code: String = "SESSION_ADVANCED", val session: SessionSnapshot)

@Serializable
data class SessionAvailabilityResponse(
    val state: String,
    val slotId: String? = null,
    val availableAt: String? = null,
    val remaining: Int = 0,
)

sealed class SessionCommandResult {
    data class Applied(val response: SessionCommandResponse) : SessionCommandResult()
    data class Advanced(val session: SessionSnapshot) : SessionCommandResult()
    data object NotFound : SessionCommandResult()
    data object Invalid : SessionCommandResult()
}
