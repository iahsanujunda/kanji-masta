# Quiz Feedback Rework — DB-Sourced Meaning + Non-Redundant Explanations

_Splitting the feedback panel into a data layer and a reasoning layer_

---

## Mockup

- [Quiz feedback composition](mockups/phase4-quiz-feedback.svg) — all five quiz types plus the missing-explanation fallback, using the established Phase 3 mobile session shell and theme tokens

The mockup is the visual contract for information hierarchy and state parity. The API and sourcing rules in this document remain authoritative for data behavior.

---

## The problem

The current feedback panel does not render `QuizBank.explanation`. It renders fixed outcome copy, shows `QuizBank.answer` only after a non-positive result, and shows the kanji breakdown only after a non-positive result. Although the session card already carries the word, reading, canonical meaning, and explanation, those fields are not composed into learner-facing feedback.

Once explanations are rendered, the generated text also has an inconsistency to fix: it sometimes restates the word's English meaning and sometimes does not:

| Quiz type | Current example explanation | Restates meaning? |
|-----------|----------------------------|-------------------|
| `meaning_recall` | 電車 — 電 (electric) + 車 (vehicle) = electric vehicle = train | Yes |
| `reading_recognition` | でん (on-yomi of 電) + しゃ (on-yomi of 車) | No |
| `reverse_reading` | 電車 — the kanji for electricity + vehicle | Partially |
| `bold_word_meaning` | 電車 literally means electric vehicle — the standard word for train | Yes |
| `fill_in_the_blank` | 電車 fits here — asking where to transfer trains | No |

Without an explicit data layer, whether useful meaning context appears depends on the quiz type and outcome. Rendering the existing explanation as-is would add a second problem: some rows would duplicate the meaning while others would not.

The needed facts are already available. Word discovery selects a concise contextual meaning from the captured text, stores it in `WordMaster.meanings`, and quiz generation writes the selected answer to `QuizBank.answer`. `SessionCardResponse` already exposes `word`, `reading`, `meaning`, and `explanation`; `SessionFeedback` exposes `correctAnswer` and `explanation`. No new database query or schema field is required for the core change.

The feedback sheet should render those facts consistently on every quiz type. The AI explanation then has one job: explain *why*, never *what*.

---

## 1. Feedback panel composition

Two layers, clearly separated:

```
┌──────────────────────────────────────────┐
│  ✓ Correct!                              │
│                                          │
│  市民 · しみん · citizen                 │  ← data layer, from DB
│                                          │
│  し (on-yomi of 市) + みん (on-yomi of 民) │  ← reasoning layer, from AI
│                                          │
│           [ CONTINUE → ]                 │
└──────────────────────────────────────────┘
```

**Data layer** — identical in shape on every quiz type, correct or incorrect:

| Element | Source |
|---------|--------|
| Word | `WordMaster.word` |
| Reading | `WordMaster.reading` |
| Meaning | see sourcing rule below |

**Reasoning layer** — `QuizBank.explanation`, which must never duplicate any of the three fields above.

The outcome title remains (`Correct!`, `Not quite`, `Learned!`, and so on). The existing generic outcome sentence becomes a fallback used only when an explanation is absent. The failure-only `Answer:` row is removed because the identity line contains the correct answer for every quiz type: its meaning for meaning quizzes, its reading for reading recognition, and its word for reverse reading/fill in the blank.

This also means the incorrect state gets the meaning for free, which it currently lacks. A user who fails 市民 sees what it actually means, not just a reading breakdown. The data and reasoning layers render for positive, neutral, and negative outcomes alike.

### As-built data path

The quiz page retains the answered `SessionCard` while the answer command returns `SessionFeedback`. The feedback sheet can therefore compose the display without another backend lookup:

| Display value | Existing response field |
|---------------|-------------------------|
| Word | `answeredCard.word` |
| Reading | `answeredCard.reading` |
| Canonical/contextual meaning | `answeredCard.meaning` or `feedback.correctAnswer` per rule below |
| Reasoning | `feedback.explanation`, falling back to `answeredCard.explanation` |

`feedbackMeaning()` belongs in the frontend feedback composition layer. Moving it to Kotlin would only be necessary if feedback must later become self-contained without the answered card.

### Meaning sourcing rule

Two quiz types test the meaning directly, which means the generator already picked the sense that fits that specific quiz. For those, `QuizBank.answer` is authoritative. For the rest, the answer is a reading or a Japanese word, so there is nothing contextual to draw from and the canonical `WordMaster.meanings[0]` is correct.

| Tier | Type | Meaning sourced from |
|------|------|---------------------|
| 0 | `meaning_recall` | `QuizBank.answer` |
| 1 | `reading_recognition` | `WordMaster.meanings[0]` |
| 2 | `reverse_reading` | `WordMaster.meanings[0]` |
| 3 | `bold_word_meaning` | `QuizBank.answer` |
| 4 | `fill_in_the_blank` | `WordMaster.meanings[0]` |

In the current frontend contract, implement the rule as:

```ts
function feedbackMeaning(card: SessionCard, feedback: SessionFeedback): string {
  const answerIsMeaning =
    card.quizType === "MEANING_RECALL" ||
    card.quizType === "BOLD_WORD_MEANING";

  return answerIsMeaning
    ? feedback.correctAnswer || card.meaning
    : card.meaning;
}
```

`WordMaster.meanings` is allowed to be empty. The UI must omit the meaning segment when both sources are blank rather than calling `first()` or rendering a dangling separator.

This preserves the context-specific gloss selected by the existing pipeline. Capture word discovery asks for the meaning of the word as it appears in the captured text and stores that gloss in `WordMaster.meanings`; quiz generation then writes the meaning answer into the tier 0 and tier 3 rows. Using `QuizBank.answer` prevents the feedback layer from replacing that selected answer with a different canonical display value.

This is not full polysemy support. The current discovery contract returns one `meaning`, and the `WordMaster` identity conflict path does not merge a later sense into an existing word. Tracking multiple senses of the same lemma and reading, or generating separate quizzes per sense, is a future vocabulary-model change and is not a Phase 4 prerequisite.

The identity line renders the same shape regardless — `電車 · でんしゃ · train` — only the source of the third field varies.

**Consequence:** at tiers 0 and 3 the meaning echoes the highlighted correct option, since the answer is the meaning. This is accepted. Consistency across types is worth more than avoiding a mild echo, and on a wrong answer it stops being an echo and becomes the whole point.

---

## 1b. Worked examples — all five types

Using 電車 (でんしゃ, train) throughout, so the difference between explanation types is visible without the word changing underneath.

### Tier 0 — meaning recall

```
prompt:   電車
options:  phone call · train · electricity · battery
```
```
✓ Correct
電車 · でんしゃ · train
電 (electricity) + 車 (vehicle) — the compound follows the parts directly
```

Gives the derivation and stops. The parts, not the sum.

### Tier 1 — reading recognition

```
prompt:   電車
options:  てつどう · でんしゃ · ちかてつ · きゅうこう
```
```
✓ Correct
電車 · でんしゃ · train
でん (on-yomi of 電) + しゃ (on-yomi of 車)
```

Purely phonetic — which reading each kanji contributes, plus any sound change.

### Tier 2 — reverse reading

```
prompt:   でんしゃ
options:  電話 · 電車 · 電気 · 電池
```
```
✗ Not quite
電車 · でんしゃ · train
しゃ points to 車 — 話 would end in わ, 気 in き
```

Shown failed deliberately. The prompt is a sound, so the explanation names the discriminator that rules the other kanji out. Note that under the old build this state gave a reading breakdown and no meaning at all — the meaning now arrives exactly when it is most needed.

### Tier 3 — bold word meaning

```
prompt:   【電車】、遅れてるじゃん。
furigana: でんしゃ
options:  bus · train · taxi · subway
```
```
✓ Correct
電車 · でんしゃ · train
The speaker is complaining that their ride is running late
```

Describes the situation. In a sentence quiz the sentence is the hard part, not the word.

### Tier 4 — fill in the blank

```
prompt:   ＿＿乗り換えどこだっけ？
options:  急行 · 電車 · 地下鉄 · バス停
```
```
✓ Correct
電車 · でんしゃ · train
乗り換え is transferring — 急行 and 地下鉄 name specific services, not the general one
```

Justifies the fit against the specific distractors rather than describing the word.

---

## 2. What each explanation should contain

The rule is one line: **the explanation answers "why", the data layer answers "what".** Concretely, per type:

| Quiz type | Explanation should cover | Must not contain |
|-----------|-------------------------|------------------|
| `meaning_recall` | How the constituent kanji meanings compose | The English meaning as a stated answer |
| `reading_recognition` | Which reading (on/kun) each kanji contributes | The English meaning |
| `reverse_reading` | Why these kanji spell this sound; what distinguishes it from similar-looking compounds | The English meaning |
| `bold_word_meaning` | What is happening in the sentence, and the word's role in it | The word's isolated English meaning |
| `fill_in_the_blank` | Why this word fits this context and the others do not | The word's isolated English meaning |

The distinction for the two sentence types is subtle but important. "電車 means train" is banned. "The speaker is complaining about a delay on their commute" is exactly what is wanted — it explains the situation, which is the actual difficulty in a sentence-level quiz.

For `meaning_recall` the constraint bites hardest, since the meaning is the answer. The explanation gives the derivation and stops short of the conclusion:

- Banned: `電車 — 電 (electric) + 車 (vehicle) = electric vehicle = train`
- Wanted: `電 (electricity) + 車 (vehicle) — the compound follows the parts directly`

The data layer above it already says "train". Restating it wastes the line.

---

## 3. Reworked generation prompt

```
You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.

Target word: {word} ({reading}) — discovered meaning: {meaning}

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
- Sentences must be casual, natural spoken Japanese — the kind said between
  friends, overheard on the street, or seen on informal signs. Not textbook Japanese.
- Draw from real daily contexts: convenience stores, trains, restaurants, weather,
  shopping, work small talk, phone messages, social media captions
- Good sentence patterns: 〜じゃん、〜よね、〜だけど、〜てる、〜っけ、short casual commands
- Avoid: keigo (polite forms), formal written style, news language, 〜ます／〜です endings
- bold_word_meaning and fill_in_the_blank must use completely different sentences —
  never the same sentence with the target word swapped for ＿＿
- Distractors must be plausible — never obviously wrong
- furigana is null for word-level types; always a string for sentence-level

Before returning, reread each explanation and confirm it does not state the
English meaning of the target word.
```

The closing self-check line matters. Without it the model reliably slips the meaning back into `meaning_recall` and `bold_word_meaning`, because both have the meaning as their answer field and the pull toward restating it is strong.

### Generation response validation

Prompt instructions are not validation. Before publishing rows, the Kotlin worker must reject a response unless it has:

- exactly five quizzes;
- exactly one of every `QuizType`;
- non-blank `prompt`, `target`, `answer`, and `explanation`;
- exactly three distinct distractors that do not equal the answer;
- null furigana for word-level types and non-blank furigana for sentence types; and
- explanations of no more than 20 whitespace-delimited words.

The no-restated-meaning rule and standalone-gloss quality still require prompt-level instructions plus a real generation acceptance check; they cannot be reliably proven with a simple string validator.

---

## 4. Deferred — sentence translations

For `bold_word_meaning` and `fill_in_the_blank`, the user often does not understand the whole sentence, only the target word. The explanation now describes the situation, which helps, but a full translation would help more.

If selected, add a nullable `prompt_translation` column through the actual application stack:

```sql
ALTER TABLE quiz_bank ADD COLUMN prompt_translation text;
```

Then map it through `QuizBankTable`, `GeneratedQuiz`, the generation parser/repository, `SessionCardResponse`, the frontend `SessionCard` type, and `FeedbackSheet`.

And to the prompt, for the two sentence types only:

```
"prompt_translation": "The train's running late."
```

Rendered as a third line in the feedback panel, below the explanation, only when present:

```
市民 · しみん · citizen
The speaker is complaining that their ride is running late
「電車、遅れてるじゃん。」The train's running late.
```

**Decision:** defer sentence translations to a separate enhancement. They are useful but are not needed to make feedback facts reliable. Phase 4 does not add `prompt_translation`, change the schema, or backfill existing rows.

---

## 5. Existing rows

Explanations already in `QuizBank` will keep restating meanings. Mild duplication, not broken — the panel will show "citizen" on one line and "市民 means citizen" on the next.

The distractor regen cycle does not touch `QuizBank.explanation` (it only creates new `QuizDistractor` rows), so these will not self-correct. Three options:

**Leave them.** New words get clean explanations, old ones look slightly redundant. Costs nothing.

**Build explanation-only regeneration on demand.** There is no existing `POST /api/admin/quizzes/{id}/regenerate` route. The current admin API supports listing and deleting quizzes, while `REGEN` quiz jobs only create a new distractor set. A new content-refresh operation should update the answer/explanation in place so quiz IDs, session references, distractors, and serve telemetry survive.

**Bulk refresh in place.** Run the same content-refresh operation for every existing word. This pays the full generation cost but should preserve row IDs and `servedCount`; deleting and replacing rows would unnecessarily disturb references and telemetry.

The planned Phase 2.6 win-rate/flag triage inbox is not present in the current code, so Phase 4 must not depend on it.

**Decision:** leave existing rows unchanged for the initial release. Mild duplication is accepted. If it becomes materially distracting, add an in-place content-refresh operation later; Phase 4 does not add on-demand or bulk regeneration.

---

## 6. Decisions before implementation

### Settled by the current architecture

- Keep the contextual gloss selected by capture word discovery; full multi-sense vocabulary modelling is outside Phase 4.
- Implement feedback composition in the frontend using the retained answered card and returned feedback. No new core API field or database lookup is needed.
- Render the outcome title, identity line, and explanation for every outcome.
- Remove the failure-only `Answer:` row. Use the generic outcome sentence only when no explanation exists.
- Remove the failure-only kanji breakdown from answer feedback. The generated explanation owns the reasoning role; kanji breakdown remains available on introduction cards.
- Omit a missing meaning segment safely; never assume `WordMaster.meanings[0]` exists.
- Remove the unsupported `{kanjiList}` prompt input unless a later change adds a real kanji breakdown to the generation claim.
- Add structural generation-response validation rather than relying on prompt compliance alone.
- Defer sentence translations to a separate enhancement; Phase 4 has no schema migration.
- Leave historical explanations unchanged initially; do not add content regeneration in this phase.

### Open decisions

None. Phase 4 can begin without a schema migration or a content-regeneration prerequisite.

---

## Definition of Done

- [x] Feedback panel renders word, reading, meaning, and AI reasoning from the existing session card/feedback contract
- [x] Meaning sourced from `QuizBank.answer` for `meaning_recall` and `bold_word_meaning`
- [x] Meaning sourced from `WordMaster.meanings[0]` for the other three types
- [x] Missing/blank meaning handled without a crash or dangling separator
- [x] Frontend `feedbackMeaning()` helper implemented and used by all quiz types
- [x] Data and reasoning layers shown on positive, neutral, and negative states
- [x] Incorrect state now shows the meaning, which it previously lacked
- [x] Existing failure-only `Answer:` row removed
- [x] Failure-only kanji breakdown removed from answer feedback and retained on introduction cards
- [x] Fixed outcome sentence used only as a fallback when no explanation exists
- [x] Generation prompt includes the no-restating-meaning constraint
- [x] Generation prompt requires clean standalone glosses in `answer` for the two meaning-testing types
- [x] Prompt specifies what each of the 5 explanation types should cover
- [x] Prompt includes the closing self-check line
- [x] All 5 example explanations in the prompt comply with the rule
- [x] Explanations capped at 20 words
- [x] Worker requires exactly five quizzes with exactly one of each `QuizType`
- [x] Worker rejects blank required fields, invalid furigana shape, and invalid distractor sets
- [ ] Verified: a newly generated `meaning_recall` explanation gives derivation without stating the English meaning
- [ ] Verified: a newly generated `bold_word_meaning` explanation describes the situation, not the word
- [ ] Verified: a newly generated `bold_word_meaning` answer is a standalone gloss, not a sentence fragment
- [x] Verified: tier 3 renders the contextual gloss stored in `QuizBank.answer`
- [x] Sentence translations deferred; no Phase 4 schema migration
- [x] Existing explanations left unchanged for the initial release
- [x] Kanji breakdown removed from answer feedback and retained on introduction cards
