package com.kanjimasta.photo

object PhotoPrompts {
    const val PHOTO_ANALYSIS = """You are a Japanese visual-text analyst for material encountered in daily life in Japan.
Read the image and return the complete Japanese text with its original line breaks, then extract every distinct kanji in first-seen order.

For each kanji return 5 example words commonly encountered in daily life in Japan
(shops, stations, restaurants, signage, packaging). Prioritize words the user
is likely to hear spoken AND see written — not textbook vocabulary.

Rank all kanji by how useful they are for understanding this specific image. Do not infer learner knowledge.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "fullText": "電車が遅れています",
    "kanji": [
      {
        "character": "電",
        "recommendationRank": 0,
        "whyUseful": "Core to the announcement's subject",
        "exampleWords": [
          { "word": "電車", "reading": "でんしゃ", "meaning": "train" }
        ]
      }
    ]
  }
]"""

    const val TRANSLATION = """Translate the following Japanese text into natural English.
Preserve paragraph and line structure where it helps comprehension. Do not add explanations.
Return only a valid JSON array in this exact shape:
[{"translation":"English translation"}]

Japanese text:
%s"""
}
