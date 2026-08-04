# Phase 3 — Iteration 3.1: Introduction Cards + Learning Steps

_Fixing the cold-start failure loop at familiarity 0_

---

## The problem

A word's first encounter is a `meaning_recall` quiz — the user is asked to recall something they were never taught. The photo selection screen shows the word briefly, but that is a glance, not a study moment.

Worse, the retry gap is a full day. A wrong answer at familiarity 0 sets `nextReview = tomorrow`, so each failure costs 24 hours. Genuinely new words take several days and several failures before the trace forms.

Two changes fix this:

1. **Introduction cards** — the first appearance of a word teaches rather than tests
2. **Learning steps** — the first quiz for a word happens minutes later in the same session, not the next day

Expanding rehearsal within a single session builds the memory trace that daily repetition can then maintain.

---

## 3.1.1 Schema

```graphql
type UserWords @table {
  # ... existing fields

  introducedAt: Timestamp        # NEW — null means never introduced
  consecutiveFailures: Int! @default(value: 0)   # NEW — resets on any correct answer
}
```

`introducedAt` is a nullable timestamp rather than a familiarity value of `-1`. A negative familiarity would break `RESURFACING_WEIGHTS` lookups and tier derivation — introduction is a pre-tier state, not a tier.

`consecutiveFailures` drives re-introduction (see 3.1.5).

---

## 3.1.2 Introduction cards

A word with `introducedAt = null` is served as a study card, not a quiz. No answer input, no correct/incorrect, no failure possible.

```
        電車
       でんしゃ
        train

   電 electricity + 車 vehicle

  「電車、遅れてるじゃん。」
   The train's late.

        [ Got it ]
```

**Card contents, all from data you already have:**

| Element | Source |
|---------|--------|
| Word | `WordMaster.word` |
| Reading | `WordMaster.reading` |
| Meaning | `WordMaster.meanings[0]` |
| Kanji breakdown | `KanjiMaster.meanings` for each constituent kanji |
| Example sentence | `QuizBank` row for this word where `quizType = BOLD_WORD_MEANING` — reuse its `prompt` and `answer` |

The kanji breakdown is the mnemonic hook. It is what makes 電車 stick as "electric vehicle" rather than as an arbitrary string.

Tapping "Got it" sets `introducedAt = now()` and schedules the first learning step within the current session.

**No new AI calls.** Everything on the card is assembled from existing rows.

---

## 3.1.3 Learning steps

After introduction, the word is quizzed twice within the same session at expanding intervals.

```
pos 1  intro 電車                    [ Got it ]
pos 2  quiz  (overdue word)
pos 3  quiz  (overdue word)
pos 4  quiz  電車  meaning_recall    ← learning step 1
pos 5  quiz  (overdue word)
pos 6  quiz  (resurfaced word)
pos 7  quiz  電車  meaning_recall    ← learning step 2, only if step 1 failed
```

**Placement rules:**

| Step | Gap after previous appearance | Clamping |
|------|-------------------------------|----------|
| Step 1 | at least 2 intervening cards | placed at end if session too short |
| Step 2 | at least 3 intervening cards | placed at end if session too short |

**Outcomes:**

| Result | Effect |
|--------|--------|
| Step 1 correct | familiarity → 1, `consecutiveFailures` → 0, enters normal SM-2 schedule, no step 2 |
| Step 1 wrong | stays at familiarity 0, step 2 scheduled later in session |
| Step 2 correct | familiarity → 1, `consecutiveFailures` → 0, enters normal SM-2 schedule |
| Step 2 wrong | stays at familiarity 0, `consecutiveFailures` + 1, `nextReview` = tomorrow |

A word that fails both steps has still been seen three times in one session. That is a fundamentally different state from being tested cold, even though the familiarity value is unchanged.

**Learning steps are ephemeral.** They live in session state, not in the database. If the session expires or the user exits mid-session, any pending step is simply dropped — the word keeps `introducedAt` set and follows the normal schedule from the next session.

---

## 3.1.4 Session composition

Introduction cards do not count against `quizAllowancePerSlot` — they are not answer moments. Their learning steps do count, because they are real quizzes.

Each introduction needs roughly three quiz slots reserved (step 1, possible step 2, buffer):

```kotlin
fun maxIntroductions(allowance: Int): Int =
    (allowance / 3).coerceAtMost(3)
```

| Allowance | Max introductions | Total cards (typical) |
|-----------|-------------------|----------------------|
| 5 | 1 | 6 |
| 6–8 | 2 | 8–10 |
| 9–15 | 3 | 12–18 |

**Updated selection priority:**

| Priority | Source | Cap |
|----------|--------|-----|
| 0 | Introductions (`introducedAt is null`) | `maxIntroductions(allowance)` |
| 1 | Learning steps (scheduled this session) | as needed |
| 2 | Overdue words (`nextReview < now()`) | 60% of allowance |
| 3 | Resurfaced lower-tier words, weighted | remainder |

The previous "new words never served" priority is removed — introductions replace it entirely. A word can no longer reach its first quiz without having been introduced.

**This throttles intake as a side effect.** Capping introductions at 1–3 per session means words wait in `UserWords` with `introducedAt = null` until a session has room to teach them properly. That solves the "dozens of kanji in flight at once" problem without a separate queue system — the introduction cap is the queue.

---

## 3.1.5 Re-introduction on repeated failure

A word that keeps failing at familiarity 0 is not learning-resistant — it was never taught well enough. Rather than testing it cold forever, teach it again.

```kotlin
fun handleTierZeroFailure(word: UserWord) {
    val failures = word.consecutiveFailures + 1

    if (failures >= 3) {
        userWordsRepo.update(word.id,
            consecutiveFailures = 0,
            introducedAt = null,        // re-enters the introduction path
            nextReview = null           // picked up by priority 0, not by due date
        )
    } else {
        userWordsRepo.update(word.id,
            consecutiveFailures = failures,
            nextReview = tomorrow()
        )
    }
}
```

`consecutiveFailures` resets to 0 on any correct answer at any tier. Re-introduced words compete for introduction slots alongside genuinely new words, ordered by `consecutiveFailures` descending — the most-failed words get taught first.

---

## 3.1.6 Softer failure framing at familiarity 0

A wrong answer at familiarity 0 during a learning step is not really a failure — the word was introduced moments ago. Reflect that in the UI.

| Context | Framing |
|---------|---------|
| Learning step wrong | Neutral. Show the correct answer with the kanji breakdown again. Copy: "Not yet — 電 electricity + 車 vehicle." No red, no ✗. |
| Familiarity 1+ wrong | Normal incorrect state. |

The session summary should also separate the two: "2 new words learned · 3 reviews correct · 1 to revisit" rather than a single score that makes new material look like failure.

---

## 3.1.7 Migration

Existing words need `introducedAt` backfilled. Words at familiarity 1 or above have clearly been learned; words stuck at 0 have not.

```sql
-- Words that have demonstrably been learned
UPDATE user_words
SET introduced_at = created_at
WHERE familiarity >= 1;

-- Words stuck at familiarity 0 re-enter the introduction path
UPDATE user_words
SET introduced_at = NULL, consecutive_failures = 0
WHERE familiarity = 0;
```

Run as part of the migration script:

```bash
python scripts/migrate_introductions.py --env prod
```

Expect the first few sessions after migration to be introduction-heavy. That is the intended correction — every word that has been failing cold gets properly taught.

---

## 3.1.8 API changes

**`GET /api/quiz/slot`** — response items gain a `cardType` discriminator:

```json
{
  "cards": [
    {
      "cardType": "INTRODUCTION",
      "wordId": "uuid",
      "word": "電車",
      "reading": "でんしゃ",
      "meaning": "train",
      "kanjiBreakdown": [
        { "character": "電", "meaning": "electricity" },
        { "character": "車", "meaning": "vehicle" }
      ],
      "exampleSentence": "電車、遅れてるじゃん。",
      "exampleTranslation": "The train's late."
    },
    {
      "cardType": "QUIZ",
      "id": "uuid",
      "quizType": "MEANING_RECALL",
      "learningStep": 1,
      "prompt": "電車",
      "options": ["train", "phone", "electricity", "battery"],
      "wordFamiliarity": 0
    }
  ],
  "remaining": 4,
  "slotEndsAt": "2026-08-04T14:00:00+09:00"
}
```

`quizzes` is renamed to `cards` since the array is now heterogeneous. `learningStep` is `null` for normal review quizzes, `1` or `2` for learning steps.

**`POST /api/quiz/introduction`** — new endpoint, acknowledges an introduction card:

```json
{ "wordId": "uuid" }
```

Sets `introducedAt = now()` and schedules learning step 1 in session state. Does not increment `QuizSlot.completed` — introductions do not consume allowance.

**`POST /api/quiz/result`** — accepts optional `learningStep`:

```json
{ "quizId": "uuid", "correct": false, "answeredInMs": 3400, "learningStep": 1 }
```

When `learningStep` is present, the SM-2 path is bypassed and the learning-step outcome table in 3.1.3 applies instead.

---

## Definition of Done

- [ ] `UserWords.introducedAt` and `UserWords.consecutiveFailures` added to schema
- [ ] Migration backfills `introducedAt` for familiarity 1+, nulls it for familiarity 0
- [ ] Introduction card assembled from `WordMaster` + `KanjiMaster` + existing `QuizBank` row — no new AI calls
- [ ] `POST /api/quiz/introduction` sets `introducedAt` and schedules learning step 1
- [ ] Introductions do not increment `QuizSlot.completed`
- [ ] `maxIntroductions(allowance)` caps introductions per session at `floor(allowance / 3)`, max 3
- [ ] Learning step 1 placed at least 2 cards after introduction
- [ ] Learning step 2 placed at least 3 cards after step 1, only when step 1 failed
- [ ] Both steps clamp to end of session when session is too short
- [ ] Step correct → familiarity 1, `consecutiveFailures` reset, normal SM-2 schedule
- [ ] Both steps failed → stays at 0, `consecutiveFailures` incremented, `nextReview` tomorrow
- [ ] Learning steps held in session state only — dropped cleanly on exit or expiry
- [ ] `consecutiveFailures >= 3` clears `introducedAt` for re-introduction
- [ ] Re-introduced words ordered by `consecutiveFailures` descending in the introduction queue
- [ ] `consecutiveFailures` resets to 0 on any correct answer at any tier
- [ ] "New words never served" priority removed from slot selection
- [ ] `GET /api/quiz/slot` returns `cards` array with `cardType` discriminator
- [ ] Learning-step failures use neutral framing, not the standard incorrect state
- [ ] Session summary separates new words learned from reviews correct
- [ ] Verified: a genuinely new word is introduced, quizzed twice in session, and reaches familiarity 1 same day