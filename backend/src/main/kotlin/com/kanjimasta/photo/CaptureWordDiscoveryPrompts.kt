package com.kanjimasta.photo

object CaptureWordDiscoveryPrompts {
    const val DISCOVER = """Extract vocabulary that is actually present in the Japanese text below.
Return surfaceText exactly as it appears, its dictionary lemma, hiragana reading, and a concise English meaning.
Include kanji-plus-kana words such as 遅れる. Do not suggest related words that are absent.

Return ONLY a valid JSON array:
[
  {"surfaceText":"運転見合わせ","lemma":"運転見合わせ","reading":"うんてんみあわせ","meaning":"service suspension"}
]

Japanese text:
%s"""
}
