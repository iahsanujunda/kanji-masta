package com.kanjimasta.photo

object PhotoPrompts {
    const val PHOTO_ANALYSIS = """You are a Japanese kanji tutor for a conversational English speaker living in Japan.
Analyze this image and extract all kanji visible.

%s

For each kanji return 5 example words commonly encountered in daily life in Japan
(shops, stations, restaurants, signage, packaging). Prioritize words the user
is likely to hear spoken AND see written — not textbook vocabulary.

Mark up to 3 kanji as recommended:true — choose the ones most worth learning
first based on how frequently they appear in everyday Japanese life.
Prefer recommending kanji the learner does NOT already know.
Only recommend known kanji if there are fewer than 3 unknown kanji in the image worth learning.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "character": "電",
    "recommended": true,
    "whyUseful": "Core kanji for anything electric — trains, phones, appliances",
    "exampleWords": [
      { "word": "電車", "reading": "でんしゃ", "meaning": "train" },
      { "word": "電話", "reading": "でんわ", "meaning": "telephone" },
      { "word": "電気", "reading": "でんき", "meaning": "electricity / lights" },
      { "word": "電池", "reading": "でんち", "meaning": "battery" },
      { "word": "充電", "reading": "じゅうでん", "meaning": "charging (a device)" }
    ]
  }
]"""
}
