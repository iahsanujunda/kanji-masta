package com.kanjimasta.modules.kanji

import kotlinx.serialization.Serializable

@Serializable
data class SaveSessionRequest(
    val sessionId: String,
    val selections: List<KanjiSelection>,
)

@Serializable
data class KanjiSelection(
    val kanjiMasterId: String,
    val status: String,
)

@Serializable
data class KanjiListItem(
    val id: String,
    val kanjiMasterId: String,
    val character: String,
    val onyomi: List<String> = emptyList(),
    val kunyomi: List<String> = emptyList(),
    val meanings: List<String> = emptyList(),
    val familiarity: Int,
    val status: String,
)

@Serializable
data class WordListItem(
    val id: String,
    val word: String,
    val reading: String,
    val meaning: String,
    val familiarity: Int,
    val nextReview: String? = null,
)

@Serializable
data class WordListResponse(
    val words: List<WordListItem>,
    val total: Int,
    val hasMore: Boolean,
)

@Serializable
data class SeenAs(
    val word: String,
    val reading: String,
    val meaning: String,
)

@Serializable
data class OnboardingKanjiItem(
    val kanjiMasterId: String,
    val character: String,
    val onyomi: List<String> = emptyList(),
    val kunyomi: List<String> = emptyList(),
    val meanings: List<String> = emptyList(),
    val jlpt: Int? = null,
    val frequency: Int? = null,
    val seenAs: SeenAs? = null,
)

@Serializable
data class OnboardingResponse(
    val kanji: List<OnboardingKanjiItem>,
    val hasMore: Boolean,
)

@Serializable
data class OnboardingSelectRequest(
    val selections: List<KanjiSelection>,
)

@Serializable
data class CurriculumItem(
    val jlpt: Int,
    val title: String,
    val subtitle: String,
    val total: Int,
    val planted: Int,
)

@Serializable
data class CurriculumResponse(val curriculums: List<CurriculumItem>)

@Serializable
data class CurriculumKanjiItem(
    val kanjiMasterId: String,
    val character: String,
    val meanings: List<String> = emptyList(),
    val userStatus: String,
)

@Serializable
data class CurriculumDetailResponse(
    val jlpt: Int,
    val title: String,
    val total: Int,
    val kanji: List<CurriculumKanjiItem>,
)
