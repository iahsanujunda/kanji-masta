KANJI_PROMPT = """You are a Japanese kanji tutor for a conversational English speaker living in Japan.
Analyze this image and extract all kanji visible.

{known_kanji_section}

For each kanji return 5 example words commonly encountered in daily life in Japan
(shops, stations, restaurants, signage, packaging). Prioritize words the user
is likely to hear spoken AND see written — not textbook vocabulary.

Mark up to 3 kanji as recommended:true — choose the ones most worth learning
first based on how frequently they appear in everyday Japanese life.
Prefer recommending kanji the learner does NOT already know.
Only recommend known kanji if there are fewer than 3 unknown kanji in the image worth learning.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {{
    "character": "電",
    "recommended": true,
    "whyUseful": "Core kanji for anything electric — trains, phones, appliances",
    "exampleWords": [
      {{ "word": "電車", "reading": "でんしゃ", "meaning": "train" }},
      {{ "word": "電話", "reading": "でんわ", "meaning": "telephone" }},
      {{ "word": "電気", "reading": "でんき", "meaning": "electricity / lights" }},
      {{ "word": "電池", "reading": "でんち", "meaning": "battery" }},
      {{ "word": "充電", "reading": "じゅうでん", "meaning": "charging (a device)" }}
    ]
  }}
]"""

QUIZ_PROMPT = """You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target word: {word} ({reading}) — meaning: {meaning}

Generate exactly 5 quizzes, one of each type below.
Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {{
    "quiz_type": "meaning_recall",
    "prompt": "電",
    "target": "電",
    "furigana": null,
    "answer": "electricity",
    "distractors": ["iron", "east", "express"],
    "explanation": "電 is the root of 電車 (train), 電話 (phone), 電気 (electricity)"
  }},
  {{
    "quiz_type": "reading_recognition",
    "prompt": "電車",
    "target": "電車",
    "furigana": null,
    "answer": "でんしゃ",
    "distractors": ["てっどう", "きゅうこう", "ちかてつ"],
    "explanation": "でん (on-yomi of 電) + しゃ (on-yomi of 車)"
  }},
  {{
    "quiz_type": "reverse_reading",
    "prompt": "でんしゃ",
    "target": "でんしゃ",
    "furigana": null,
    "answer": "電車",
    "distractors": ["電話", "電気", "電池"],
    "explanation": "電車 — the kanji for electricity + vehicle"
  }},
  {{
    "quiz_type": "bold_word_meaning",
    "prompt": "電車、遅れてるじゃん。",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "train",
    "distractors": ["bus", "taxi", "subway"],
    "explanation": "電車 literally means electric vehicle — the standard word for train"
  }},
  {{
    "quiz_type": "fill_in_the_blank",
    "prompt": "＿＿乗り換えどこだっけ？",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "電車",
    "distractors": ["急行", "地下鉄", "バス停"],
    "explanation": "電車 fits here — asking where to transfer trains"
  }}
]

Rules:
- Sentences must be casual, natural spoken Japanese — the kind said between friends,
  overheard on the street, or seen on informal signs. Not textbook Japanese.
- Draw from real daily contexts: convenience stores, trains, restaurants, weather,
  shopping, work small talk, phone messages, social media captions
- Good sentence patterns: 〜じゃん、〜よね、〜だけど、〜てる、〜っけ、short casual commands
- bold_word_meaning and fill_in_the_blank must use completely different sentences —
  never the same sentence with the target word swapped for ＿＿
- Distractors must be plausible — never obviously wrong
- Explanations brief and memorable, not academic
- furigana is null for word-level types; always a string for sentence-level"""

REGEN_PROMPT = """Regenerate distractors for this quiz. The learner is now at familiarity {familiarity}/5.
Make distractors more challenging than earlier sets — choose options that are
more plausible or confusable at this level.

Quiz type: {quiz_type}
Prompt: {prompt}
Answer: {answer}
Previous distractor sets: {previous_distractors}

Return ONLY a JSON array of exactly 3 distractors — no markdown, no preamble:
["option1", "option2", "option3"]"""

DISCOVERY_PROMPT = """The learner is studying the kanji: {character}
They already know these words well: {known_words}

Suggest 5 more common daily-life words containing {character} that are
NOT in the known list. Words the learner is likely to encounter in Japan
(shops, stations, restaurants, signage, packaging).

Return ONLY a valid JSON array — no markdown, no preamble:
[
  {{ "word": "会話", "reading": "かいわ", "meaning": "conversation" }}
]"""

QUIZ_TYPE_MAP = {
    "meaning_recall": "MEANING_RECALL",
    "reading_recognition": "READING_RECOGNITION",
    "reverse_reading": "REVERSE_READING",
    "bold_word_meaning": "BOLD_WORD_MEANING",
    "fill_in_the_blank": "FILL_IN_THE_BLANK",
}
