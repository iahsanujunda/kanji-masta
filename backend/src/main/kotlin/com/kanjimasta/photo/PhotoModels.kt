package com.kanjimasta.photo

import kotlinx.serialization.Serializable

@Serializable
data class AnalyzePhotoRequest(
    val imageUrl: String,
    val storagePath: String? = null,
    val clientCaptureId: String? = null,
)

@Serializable
data class AnalyzePhotoResponse(val sessionId: String, val status: String)

@Serializable
data class PhotoSessionResult(
    val sessionId: String,
    val status: String,
    val kanji: List<EnrichedKanji>? = null,
    val failureCode: String? = null,
    val storagePath: String? = null,
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

@Serializable
data class RecentScanItem(
    val sessionId: String,
    val storagePath: String?,
    val status: String,
    val createdAt: String,
    val kanjiCount: Int? = null,
    val failureCode: String? = null,
)

@Serializable
data class RecentScansResponse(val sessions: List<RecentScanItem>)

@Serializable
data class PhotoActivityItem(
    val sessionId: String,
    val storagePath: String?,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
    val kanjiCount: Int? = null,
    val failureCode: String? = null,
)

@Serializable
data class PhotoActivityResponse(
    val items: List<PhotoActivityItem>,
    val nextCursor: String? = null,
    val hasMore: Boolean,
)

@Serializable
data class PhotoActivityUnseenResponse(
    val hasUnseen: Boolean,
    val latestTerminalAt: String? = null,
)

@Serializable
data class MarkPhotoActivitySeenRequest(val seenThrough: String)

@Serializable
data class CaptureListResponse(val captures: List<CaptureSummary>)

@Serializable
data class CaptureSummary(
    val sessionId: String,
    val label: String,
    val storagePath: String?,
    val status: String,
    val createdAt: String,
    val readyAt: String? = null,
    val lastRevisitedAt: String? = null,
    val familiarKanji: Int,
    val totalKanji: Int,
    val coveragePercent: Int? = null,
    val translationAvailable: Boolean,
)

@Serializable
data class CaptureDetail(
    val sessionId: String,
    val label: String,
    val storagePath: String?,
    val status: String,
    val failureCode: String? = null,
    val createdAt: String,
    val fullText: String? = null,
    val translation: String? = null,
    val translationLanguage: String = "en",
    val familiarKanji: Int,
    val totalKanji: Int,
    val coveragePercent: Int? = null,
    val batchGateSatisfied: Boolean,
    val kanji: List<CaptureKanjiItem>,
)

@Serializable
data class CaptureKanjiItem(
    val kanjiMasterId: String,
    val character: String,
    val onyomi: List<String> = emptyList(),
    val kunyomi: List<String> = emptyList(),
    val meanings: List<String> = emptyList(),
    val whyUseful: String = "",
    val familiarity: Int? = null,
    val learningState: String,
    val selectable: Boolean,
    val recommendedNext: Boolean,
    val excluded: Boolean,
)

@Serializable
data class CaptureKanjiCorrectionRequest(val excluded: Boolean)

@Serializable
data class MarkCaptureRevisitedResponse(val lastRevisitedAt: String)
