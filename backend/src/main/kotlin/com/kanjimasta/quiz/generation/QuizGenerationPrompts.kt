package com.kanjimasta.quiz.generation

object QuizGenerationPrompts {
    const val QUIZ_GENERATION = """You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target word: %s (%s) — discovered meaning: %s

Generate exactly 5 quizzes, one of each type below.

IMPORTANT — explanations:
The app displays the word, its reading, and its English meaning above your
explanation, pulled from its own database. Your explanation must NOT repeat
any of those three things. It explains WHY the answer is what it is, never
WHAT the word means.

Never write phrases like "X means Y", "X is the word for Y", or
"... = Y" where Y is the English meaning. Never end an explanation by
stating the English meaning as a conclusion.

What each explanation should cover:
- meaning_recall: how the constituent kanji meanings compose into the whole.
  Give the derivation, stop before stating the English answer.
- reading_recognition: which reading each kanji contributes (on-yomi or
  kun-yomi), and any sound change such as rendaku.
- reverse_reading: why these specific kanji spell this sound, and what
  distinguishes the answer from similar-looking compounds.
- bold_word_meaning: what is happening in the sentence and the word's role
  in it. Describe the situation, not the isolated word.
- fill_in_the_blank: why this word fits this context and why the other
  options do not.

Keep explanations to 20 words or fewer. Brief and memorable, not academic.

IMPORTANT — answer format for meaning_recall and bold_word_meaning:
The "answer" field for these two types is displayed directly to the learner as
the word's meaning, so it must be a clean standalone gloss — a dictionary-style
definition, not a sentence-shaped fragment.
Good: "train". Bad: "the train that was late", "a train is delayed".
For bold_word_meaning, give the meaning of the target word alone, never a
paraphrase of the sentence it appears in.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "quiz_type": "meaning_recall",
    "prompt": "電車",
    "target": "電車",
    "furigana": null,
    "answer": "train",
    "distractors": ["phone call", "electricity", "battery"],
    "explanation": "電 (electricity) + 車 (vehicle) — the compound follows the parts directly"
  },
  {
    "quiz_type": "reading_recognition",
    "prompt": "電車",
    "target": "電車",
    "furigana": null,
    "answer": "でんしゃ",
    "distractors": ["てつどう", "きゅうこう", "ちかてつ"],
    "explanation": "でん (on-yomi of 電) + しゃ (on-yomi of 車)"
  },
  {
    "quiz_type": "reverse_reading",
    "prompt": "でんしゃ",
    "target": "でんしゃ",
    "furigana": null,
    "answer": "電車",
    "distractors": ["電話", "電気", "電池"],
    "explanation": "しゃ points to 車, not 話 (わ) or 気 (き) — the second kanji decides it"
  },
  {
    "quiz_type": "bold_word_meaning",
    "prompt": "電車、遅れてるじゃん。",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "train",
    "distractors": ["bus", "taxi", "subway"],
    "explanation": "The speaker is complaining that their ride is running late"
  },
  {
    "quiz_type": "fill_in_the_blank",
    "prompt": "＿＿乗り換えどこだっけ？",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "電車",
    "distractors": ["急行", "地下鉄", "バス停"],
    "explanation": "乗り換え means transferring — 急行 and 地下鉄 are specific services, not the general one"
  }
]

Rules:
- Sentences must be casual, natural spoken Japanese — the kind said between friends,
  overheard on the street, or seen on informal signs. Not textbook Japanese.
- Draw from real daily contexts: convenience stores, trains, restaurants, weather,
  shopping, work small talk, phone messages, social media captions
- Good sentence patterns: 〜じゃん、〜よね、〜だけど、〜てる、〜っけ、short casual commands
- Avoid: keigo (polite forms), formal written style, news language, 〜ます／〜です endings
- bold_word_meaning and fill_in_the_blank must use completely different sentences —
  never the same sentence with the target word swapped for ＿＿
- Distractors must be plausible — never obviously wrong
- furigana is null for word-level types; always a string for sentence-level

Before returning, reread each explanation and confirm it does not state the
English meaning of the target word."""

    const val DISTRACTOR_REGENERATION = """Regenerate distractors for this quiz. The learner is now at familiarity %d/5.
Make distractors more challenging than earlier sets — choose options that are
more plausible or confusable at this level.

Quiz type: %s
Prompt: %s
Answer: %s
Previous distractor sets: %s

Return ONLY a JSON array of exactly 3 distractors — no markdown, no preamble:
["option1", "option2", "option3"]"""
}
