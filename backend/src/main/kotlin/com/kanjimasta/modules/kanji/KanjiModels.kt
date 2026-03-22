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
