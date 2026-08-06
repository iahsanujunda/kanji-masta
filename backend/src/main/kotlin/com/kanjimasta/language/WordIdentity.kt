package com.kanjimasta.language

import java.text.Normalizer

data class WordIdentity(
    val normalizedLemma: String,
    val normalizedReading: String,
) {
    companion object {
        fun from(lemma: String, reading: String): WordIdentity = WordIdentity(
            normalizedLemma = normalizeLemma(lemma),
            normalizedReading = normalizeReading(reading),
        )
    }
}

private val unicodeWhitespace = Regex("[\\p{Z}\\s]+")

fun normalizeJapaneseText(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFKC)

fun normalizeLemma(value: String): String = normalizeJapaneseText(value)
    .trim()
    .replace(unicodeWhitespace, " ")

fun normalizeReading(value: String): String = buildString {
    normalizeJapaneseText(value)
        .trim()
        .replace(unicodeWhitespace, "")
        .codePoints()
        .forEach { codePoint ->
            appendCodePoint(if (codePoint in 0x30A1..0x30F6) codePoint - 0x60 else codePoint)
        }
}

fun normalizedCodePointIndexOf(fullText: String, surfaceText: String): Int? {
    val normalizedText = normalizeJapaneseText(fullText)
    val normalizedSurface = normalizeJapaneseText(surfaceText).trim()
    if (normalizedSurface.isEmpty()) return null
    val charIndex = normalizedText.indexOf(normalizedSurface)
    if (charIndex < 0) return null
    return normalizedText.codePointCount(0, charIndex)
}
