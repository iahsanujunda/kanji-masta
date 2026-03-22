package com.kanjimasta.modules.photo

import kotlinx.serialization.Serializable

@Serializable
data class AnalyzePhotoRequest(val imageUrl: String)

@Serializable
data class AnalyzePhotoResponse(val sessionId: String, val status: String)

@Serializable
data class PhotoSessionResult(
    val sessionId: String,
    val status: String,
    val kanji: List<EnrichedKanji>? = null,
)

@Serializable
data class EnrichedKanji(
    val kanjiMasterId: String? = null,
    val character: String,
    val recommended: Boolean = false,
    val whyUseful: String = "",
    val onyomi: List<String> = emptyList(),
    val kunyomi: List<String> = emptyList(),
    val meanings: List<String> = emptyList(),
    val frequency: Int? = null,
    val exampleWords: List<ExampleWord> = emptyList(),
)

@Serializable
data class ExampleWord(
    val word: String,
    val reading: String,
    val meaning: String,
)
