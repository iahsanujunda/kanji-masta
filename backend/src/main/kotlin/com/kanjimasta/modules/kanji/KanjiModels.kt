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
