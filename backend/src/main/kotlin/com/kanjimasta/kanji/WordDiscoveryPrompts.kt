package com.kanjimasta.kanji

object WordDiscoveryPrompts {
    const val WORD_DISCOVERY = """The learner is studying the kanji: %s
They already know these words well: %s

Suggest 5 more common daily-life words containing %s that are
NOT in the known list. Words the learner is likely to encounter in Japan
(shops, stations, restaurants, signage, packaging).

Return ONLY a valid JSON array — no markdown, no preamble:
[
  { "word": "会話", "reading": "かいわ", "meaning": "conversation" }
]"""
}
