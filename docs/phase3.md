# Phase 3 — Iteration 3.1: Introduction Cards + Learning Steps

_Fixing the cold-start failure loop at familiarity 0_

---

## The problem

A word's first encounter is a `MEANING_RECALL` quiz — the user is asked to recall something they were never taught. The photo selection screen shows the word briefly, but that is a glance, not a study moment.

Worse, the retry gap is a full day. A wrong answer at familiarity 0 sets `nextReview = tomorrow`, so each failure costs 24 hours. Genuinely new words take several days and several failures before the trace forms.

Two changes fix this:

1. **Introduction cards** — the first appearance of a word teaches rather than tests
2. **Learning steps** — the first quiz for a word happens later in the same session, not the next day

Expanding rehearsal within a single session builds the memory trace that daily repetition can then maintain.

---

## Phase 3 mockups

The visual contract is captured as SVG storyboards, following the repository convention used by the sibling projects:

- [Primary learning-session flow](mockups/phase3-learning-session-flow.svg) — ready home state, new-word introduction, spaced learning steps, supportive feedback, learned confirmation, and session summary
- [Supporting session states](mockups/phase3-session-state-variants.svg) — resume, cooldown, re-introduction, normal incorrect feedback, revisit later, loading, retry, and exit confirmation
- [Dictionary and word-reference access](mockups/phase3-dictionary-word-access.svg) — learning-state labels, filtering, and read-only access to introduction content outside a session

The storyboards use the existing frontend theme tokens and mobile-first 390–480 px composition. The API contract in this document remains authoritative when a visual state and implementation detail appear to conflict.

---

## 3.1.1 Session architecture

The quiz flow is a server-authoritative, turn-based session state machine backed by PostgreSQL. It should feel sticky to the user, but it must not depend on a sticky Cloud Run instance.

The closest game analogy is a single-player match, not a multiplayer matchmaking lobby:

| Game concept | Kanji Masta |
|--------------|-------------|
| Lobby availability | Cooldown until `availableAt` |
| Match | Quiz session |
| Match state | `QuizSlot` |
| Turns | Introduction and quiz cards |
| Player command | Acknowledge or answer |
| Match result | Session summary |
| Match timeout | `slotEndsAt` |

There is no matchmaking, scarce game-server allocation, opponent coordination, or real-time presence. Redis, Pub/Sub, RabbitMQ, WebSockets, and Cloud Run session affinity are therefore unnecessary for this iteration.

### Derived availability state

Waiting is a time gate, not a job queue. The backend derives whether the user can start:

```text
if active slot exists                         → ACTIVE
if latest completed slot ends in the future  → COOLDOWN
otherwise                                     → READY
```

The client countdown is display-only. The backend timestamp is authoritative. No delayed task is created to unlock a user.

```text
COOLDOWN ── time reached ──> READY
READY ── start ──> ACTIVE
ACTIVE ── allowance completed ──> COMPLETED
COMPLETED ──> COOLDOWN
ACTIVE ── slot end reached ──> EXPIRED ──> READY
```

`READY` and `COOLDOWN` are derived states. Persisted `QuizSlot.status` values are `ACTIVE`, `COMPLETED`, `ABANDONED`, and `EXPIRED`.

Starting a session is an explicit command. `POST /api/quiz/session/start` creates the slot, sets `startedAt` and `slotEndsAt`, and materializes its card rows. Repeating the command while a slot is active returns that existing session.

### Stateless application servers

Any Cloud Run instance must be able to handle any turn:

```text
request
  → authenticate user
  → load QuizSlot and current card from PostgreSQL
  → validate the command
  → mutate state in one short transaction
  → return the updated session snapshot
```

Process memory may cache data, but it is never the source of truth. Refreshing, switching devices, or reaching another Cloud Run instance resumes the same logical session.

### Concurrency and idempotency

Every client command includes:

- `cardId` — the exact turn being acted on
- `submissionId` — a client-generated UUID used for idempotent retries
- `expectedVersion` — the `QuizSlot.version` the client last received

The backend applies a command in a short transaction:

1. Load and lock the active `QuizSlot`.
2. Return the previous result when `submissionId` has already been handled.
3. Reject an unrelated stale `expectedVersion` with `409 SESSION_ADVANCED` and the latest snapshot.
4. Verify that `cardId` is the first pending card.
5. Apply the introduction or answer outcome.
6. Materialize, move, or drop learning-step cards as required.
7. Increment `QuizSlot.version` and commit.

This prevents double answers, double familiarity increments, duplicate step-2 cards, and conflicts between two tabs or devices.

---

## 3.1.2 Schema

### User word state

```sql
ALTER TABLE user_words
    ADD COLUMN introduced_at timestamptz,
    ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;
```

`introducedAt` is nullable rather than encoding introduction as familiarity `-1`. A negative familiarity would break `RESURFACING_WEIGHTS` lookups and tier derivation — introduction is a pre-tier state, not a tier.

`consecutiveFailures` drives re-introduction (see 3.1.6).

### Dictionary and word-reference access

Every `UserWords` row is part of the learner's collection from the moment it is saved, including words that have not yet received an introduction. The Dictionary therefore lists new words instead of hiding them until familiarity reaches 1.

The API returns a derived `learningState` so the frontend does not reinterpret nullable timestamps and familiarity rules independently:

| State | Derivation | Dictionary label |
|-------|------------|------------------|
| `WAITING_TO_LEARN` | `introducedAt IS NULL` and `consecutiveFailures = 0` | New |
| `WAITING_TO_REVISIT` | `introducedAt IS NULL` and `consecutiveFailures > 0` | Revisit |
| `LEARNING` | `introducedAt IS NOT NULL` and `familiarity = 0` | Learning |
| `REVIEWING` | `familiarity BETWEEN 1 AND 4` | Tier 1–4 |
| `MASTERED` | `familiarity >= 5` | Mastered |

Dictionary cards are tappable and open a read-only word-reference page containing the same stable study content as an introduction: word, reading, meaning, kanji breakdown, example sentence, and optional example context.

Opening this page is not a learning command. It must not:

- set `introducedAt`
- reset `consecutiveFailures`
- create or complete a session card
- change familiarity or `nextReview`
- consume session allowance

Only acknowledging an `INTRODUCTION` card in an active session starts the scheduled learning sequence. This keeps browsing safe and predictable while allowing learners to revisit their own saved vocabulary whenever they want.

`GET /api/words/list` adds an optional `state` filter and returns `learningState` for each row. Filtering happens before pagination. `GET /api/words/{userWordId}` returns the read-only study content and learning state for a word owned by the authenticated user.

Because the collection includes pre-introduction words, aggregate copy must say “saved words” or “words in your collection,” not “words learned.” Empty copy becomes “No saved words yet.”

### Quiz-slot lifecycle

```sql
CREATE TYPE quiz_slot_status AS ENUM (
    'ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED'
);

ALTER TABLE quiz_slot
    ADD COLUMN status quiz_slot_status NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN version integer NOT NULL DEFAULT 0,
    ADD COLUMN completed_at timestamptz;
```

`QuizSlot` is the aggregate root for one session. Its existing `allowance` and `completed` fields continue to count answer moments only.

### Materialized session cards

```sql
CREATE TYPE session_card_type AS ENUM ('INTRODUCTION', 'QUIZ');
CREATE TYPE session_card_status AS ENUM ('PENDING', 'COMPLETED', 'DROPPED');
CREATE TYPE introduction_kind AS ENUM ('NEW', 'REINTRODUCTION');

CREATE TABLE quiz_session_card (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id             uuid NOT NULL REFERENCES quiz_slot(id) ON DELETE CASCADE,
    user_id             text NOT NULL,
    position            integer NOT NULL,
    card_type           session_card_type NOT NULL,
    status              session_card_status NOT NULL DEFAULT 'PENDING',
    user_word_id        uuid NOT NULL REFERENCES user_words(id),
    quiz_id             uuid REFERENCES quiz_bank(id),
    distractor_set_id   uuid REFERENCES quiz_distractor(id),
    learning_step       integer CHECK (learning_step IN (1, 2)),
    introduction_kind   introduction_kind,
    options             text[] NOT NULL DEFAULT '{}',
    submission_id       uuid UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    UNIQUE (slot_id, position)
);

CREATE INDEX idx_quiz_session_card_pending
    ON quiz_session_card (slot_id, status, position);
```

The current card is the lowest-position `PENDING` row; it is not stored as a separate mutable flag. Session-specific shuffled options are persisted so refreshes and retries see the same choices.

Introduction content is assembled when returning the card. Stable word and kanji data are not duplicated into the session table.

### Answer linkage

```sql
ALTER TABLE quiz_serve
    ADD COLUMN session_card_id uuid REFERENCES quiz_session_card(id),
    ADD COLUMN submission_id uuid UNIQUE,
    ADD COLUMN answered_in_ms integer;
```

`sessionCardId` distinguishes two appearances of the same `QuizBank` row, such as learning steps 1 and 2. `submissionId` makes result submission idempotent.

---

## 3.1.3 Introduction cards

A word with `introducedAt = null` is served as a study card, not a quiz. It has no answer input, correct state, or failure state.

```text
        電車
       でんしゃ
        train

   電 electricity + 車 vehicle

  「電車、遅れてるじゃん。」
   A casual sentence about a delayed train.

        [ Got it ]
```

**Card contents use existing data:**

| Element | Source |
|---------|--------|
| Word | `WordMaster.word` |
| Reading | `WordMaster.reading` |
| Meaning | `WordMaster.meanings[0]` |
| Kanji breakdown | First `KanjiMaster.meanings` value for each constituent kanji |
| Example sentence | `QuizBank.prompt` for `BOLD_WORD_MEANING` |
| Example context | `QuizBank.explanation` for that row, optional |

`QuizBank.answer` is the highlighted word's meaning, not a full sentence translation. The API therefore exposes optional `exampleContext`, not `exampleTranslation`. If no `BOLD_WORD_MEANING` row exists, the UI hides the example panel without leaving empty space.

The kanji breakdown is the mnemonic hook. It makes 電車 stick as “electric vehicle” rather than as an arbitrary string.

Tapping “Got it”:

1. Marks the introduction card complete.
2. Sets `introducedAt = now()`.
3. Sets a fallback `nextReview = slotEndsAt` in case the user exits before the learning step.
4. Resets `consecutiveFailures` when this is a re-introduction.
5. Returns the next pending card without incrementing `QuizSlot.completed`.

**No new AI calls.** Everything is assembled from existing rows.

---

## 3.1.4 Learning steps

After introduction, the word is quizzed within the same session at expanding intervals.

```text
pos 1  intro 電車                    [ Got it ]
pos 2  quiz  (overdue word)
pos 3  quiz  (overdue word)
pos 4  quiz  電車  MEANING_RECALL    ← learning step 1
pos 5  quiz  (overdue word)
pos 6  quiz  (resurfaced word)
pos 7  quiz  電車  MEANING_RECALL    ← learning step 2, only if step 1 failed
```

**Placement rules:**

| Step | Gap after previous appearance | Clamping |
|------|-------------------------------|----------|
| Step 1 | At least 2 intervening cards | Place at end if the session is too short |
| Step 2 | At least 3 intervening cards | Place at end if the session is too short |

**Outcomes:**

| Result | Effect |
|--------|--------|
| Step 1 correct | Familiarity → 1, failures → 0, normal review schedule, no step 2 |
| Step 1 wrong | Familiarity remains 0, step 2 inserted later in the session |
| Step 2 correct | Familiarity → 1, failures → 0, normal review schedule |
| Step 2 wrong | Familiarity remains 0, failures + 1, `nextReview = tomorrow` unless re-introduction threshold is reached |

A word that fails both steps has still been seen three times in one session. That is fundamentally different from being tested cold, even though its familiarity remains unchanged.

Learning steps are **session-scoped**, not part of durable word-learning history. They are materialized as `quiz_session_card` rows so the session can survive refreshes and Cloud Run instance changes. Pending learning cards are marked `DROPPED` on explicit exit or slot expiry.

If the user exits after acknowledging an introduction, its fallback `nextReview = slotEndsAt` makes the word eligible for a normal tier-zero review in the next session.

---

## 3.1.5 Session composition

Introduction cards do not count against `quizAllowancePerSlot`; their learning steps do.

Each introduction needs roughly three quiz positions: step 1, a possible step 2, and spacing/buffer capacity.

```kotlin
fun maxIntroductions(allowance: Int): Int =
    (allowance / 3).coerceAtMost(3)
```

| Allowance | Max introductions | Total cards before conditional replacements |
|-----------|-------------------|-----------------------------------------------|
| 5 | 1 | 6 |
| 6–8 | 2 | 8–10 |
| 9–15 | 3 | 12–18 |

### Initial materialization

For allowance `R` and introduction count `I`:

1. Select `I = min(floor(R / 3), 3)` introductions.
2. Materialize one step-1 quiz for every introduction.
3. Fill the other `R - I` answer positions with normal review quizzes.
4. Insert each introduction before its learning sequence.
5. Position step 1 after at least two intervening cards.

The initial session contains exactly `R` quiz cards plus `I` introduction cards.

### Conditional step 2

When step 1 is wrong, the same transaction:

1. Creates a fresh step-2 card and options.
2. Places it after at least three intervening cards, clamped to the end.
3. Marks the last eligible unserved normal review `DROPPED`.
4. Renumbers the small remaining queue if necessary.

Replacing a normal review keeps the number of answer moments equal to the allowance. The introduction cap guarantees enough normal cards to provide spacing and replacement capacity.

### Selection priority

| Priority | Source | Cap |
|----------|--------|-----|
| 0 | Introductions (`introducedAt is null`) | `maxIntroductions(allowance)` |
| 1 | Learning step 1 | One per selected introduction |
| 2 | Overdue words (`nextReview < now()`) | 60% of remaining normal-review positions |
| 3 | Resurfaced lower-tier words, weighted | Remaining positions |

The previous “new words never served” priority is removed. A word cannot reach its first quiz without an introduction.

Capping introductions at 1–3 per session also throttles intake. Words wait in `UserWords` with `introducedAt = null` until a session has room to teach them properly. The database query is the introduction queue; no separate messaging service is required.

### Progress semantics

Progress is based on answer moments, never raw card index:

```text
progress = QuizSlot.completed / QuizSlot.allowance
```

Acknowledging an introduction transitions to the next card but does not move the progress bar. Adding step 2 cannot make progress move backward.

Suggested header copy:

```text
Introduction   New word · 5 reviews left
Learning step  Quick recall · Step 1 · 3 reviews left
Normal review  Review · Tier 2 · 2 left
```

---

## 3.1.6 Re-introduction on repeated failure

A word that keeps failing at familiarity 0 was not taught well enough. Rather than testing it cold forever, teach it again.

```kotlin
fun handleTierZeroFailure(word: UserWord) {
    val failures = word.consecutiveFailures + 1

    if (failures >= 3) {
        userWordsRepo.update(word.id,
            consecutiveFailures = failures, // preserve for ordering and card kind
            introducedAt = null,
            nextReview = null
        )
    } else {
        userWordsRepo.update(word.id,
            consecutiveFailures = failures,
            nextReview = tomorrow()
        )
    }
}
```

Preserving the failure count resolves an important ordering requirement: re-introduced words can be selected by `consecutiveFailures DESC`. When the introduction card is materialized, `consecutiveFailures > 0` produces `introductionKind = REINTRODUCTION`; genuinely new words use `NEW`.

Acknowledging the re-introduction resets failures to 0. Any correct answer at any tier also resets failures to 0.

The UI uses “Let's revisit” for `REINTRODUCTION`, with no failure count or punitive framing.

---

## 3.1.7 Feedback and summary

A wrong answer during a learning step is not framed like a normal failed review.

| Context | Feedback type | Framing |
|---------|---------------|---------|
| Learning step 1 wrong | `NOT_YET` | Neutral; show correct answer and kanji breakdown. No red or ✕. |
| Learning step 2 wrong | `REVISIT_LATER` | Neutral; explain that the word will return later. |
| Learning step correct | `LEARNED` | Emerald success treatment. |
| Familiarity 1+ wrong | `INCORRECT` | Normal incorrect state. |
| Normal correct | `CORRECT` | Normal success state. |

Example learning-step copy:

```text
Not yet — 電 electricity + 車 vehicle.
You'll see this word again before the session ends.
```

Session summary counters are server-derived from the session cards and quiz serves:

- `newWordsLearned` — unique `NEW` introduction words that completed a learning step correctly
- `reintroducedWordsLearned` — unique `REINTRODUCTION` words that completed a learning step correctly
- `reviewsCorrect` — correct normal reviews where `learningStep = null`
- `toRevisit` — unique words whose final session outcome is a normal miss or failed step 2

A step-1 miss followed by a correct step 2 counts only as learned. The UI may hide zero-valued categories and use concise copy such as “2 new words learned · 3 reviews correct · 1 to revisit.”

---

## 3.1.8 Migration

All schema and data changes ship through `supabase/migrations/`, the project source of truth.

Existing words need `introducedAt` backfilled. Words at familiarity 1 or above have demonstrably been learned; words stuck at 0 have not.

```sql
UPDATE user_words
SET introduced_at = created_at
WHERE familiarity >= 1;

UPDATE user_words
SET introduced_at = NULL,
    consecutive_failures = 0
WHERE familiarity = 0;
```

Existing active `QuizSlot` rows have no materialized cards. On first resume after deployment, the backend materializes their remaining allowance using the new composition rules. Completed or expired historical slots do not need session-card rows.

Expect the first few sessions after migration to be introduction-heavy. Every word that has been failing cold will finally be taught.

Expired `quiz_session_card` rows are deleted by the existing internal cleanup mechanism after their parent slot is no longer needed. They may also be removed automatically when old `QuizSlot` rows are deleted because of `ON DELETE CASCADE`.

---

## 3.1.9 API contract

The server returns one authoritative current card rather than exposing a mutable queue for the frontend to reorder.

### Start or resume

**`POST /api/quiz/session/start`** creates a session or returns the existing active session.

```json
{
  "session": {
    "slotId": "slot-uuid",
    "status": "ACTIVE",
    "version": 0,
    "slotEndsAt": "2026-08-04T14:00:00+09:00",
    "currentCard": {
      "cardType": "INTRODUCTION",
      "cardId": "card-uuid",
      "wordId": "user-word-uuid",
      "introductionKind": "NEW",
      "word": "電車",
      "reading": "でんしゃ",
      "meaning": "train",
      "kanjiBreakdown": [
        { "character": "電", "meaning": "electricity" },
        { "character": "車", "meaning": "vehicle" }
      ],
      "exampleSentence": "電車、遅れてるじゃん。",
      "exampleContext": "電車 means train in this casual sentence."
    },
    "progress": {
      "completed": 0,
      "allowance": 5,
      "remaining": 5
    },
    "summary": {
      "newWordsLearned": 0,
      "reintroducedWordsLearned": 0,
      "reviewsCorrect": 0,
      "toRevisit": 0
    }
  }
}
```

**`GET /api/quiz/session/{slotId}`** reloads the latest snapshot for refresh, resume, or conflict recovery.

### Acknowledge an introduction

**`POST /api/quiz/session/{slotId}/introduction`**

```json
{
  "cardId": "card-uuid",
  "submissionId": "command-uuid",
  "expectedVersion": 0
}
```

The response contains `feedback.type = INTRODUCED` and the updated session snapshot. Introductions do not increment `progress.completed`.

### Submit an answer

**`POST /api/quiz/session/{slotId}/answer`**

```json
{
  "cardId": "card-uuid",
  "submissionId": "command-uuid",
  "expectedVersion": 3,
  "answer": "train",
  "answeredInMs": 3400
}
```

The server derives `quizId`, `learningStep`, the correct answer, and correctness from the session card. The client never submits a trusted `correct` boolean.

```json
{
  "feedback": {
    "type": "NOT_YET",
    "correctAnswer": "train",
    "kanjiBreakdown": [
      { "character": "電", "meaning": "electricity" },
      { "character": "車", "meaning": "vehicle" }
    ]
  },
  "session": {
    "slotId": "slot-uuid",
    "status": "ACTIVE",
    "version": 4,
    "slotEndsAt": "2026-08-04T14:00:00+09:00",
    "currentCard": {},
    "progress": {
      "completed": 2,
      "allowance": 5,
      "remaining": 3
    },
    "summary": {
      "newWordsLearned": 0,
      "reintroducedWordsLearned": 0,
      "reviewsCorrect": 1,
      "toRevisit": 0
    }
  }
}
```

The frontend renders `feedback` against the answered card. After Continue, it renders `session.currentCard`.

### Exit

**`POST /api/quiz/session/{slotId}/exit`** marks pending learning cards `DROPPED` and applies fallback review dates. Normal unanswered reviews may remain pending while the slot is active so the user can resume them later.

### Stale commands

An unrelated stale `expectedVersion` returns:

```http
409 Conflict
```

```json
{
  "code": "SESSION_ADVANCED",
  "session": {
    "slotId": "slot-uuid",
    "version": 5,
    "currentCard": {}
  }
}
```

The frontend replaces its local snapshot with this response. A retry using the same `submissionId` returns the already-applied outcome instead of a conflict.

---

## References

- [Cloud Run session affinity](https://cloud.google.com/run/docs/configuring/session-affinity) — affinity is best effort; application correctness must not depend on instance-local session state
- [Cloud Run and external session state](https://cloud.google.com/blog/topics/developers-practitioners/improve-responsiveness-session-affinity-cloud-run) — server-side session data belongs in a persistent external store
- [PostgreSQL application best practices](https://cloud.google.com/sql/docs/postgres/best-practices) — keep state-changing transactions small and short

---

## Definition of Done

### Schema and migration

- [x] `UserWords.introducedAt` and `UserWords.consecutiveFailures` added
- [x] `QuizSlot.status`, `QuizSlot.version`, and `QuizSlot.completedAt` added
- [x] `QuizSessionCard` table and enums added through `supabase/migrations/`
- [x] `QuizServe.sessionCardId`, `submissionId`, and `answeredInMs` added
- [x] Familiarity 1+ words backfilled as introduced; familiarity 0 words re-enter introduction
- [x] Existing active slots materialize remaining cards safely on first resume

### Session architecture

- [x] Start command creates or resumes exactly one active session per user
- [x] Availability is derived from authoritative timestamps; no delayed unlock jobs
- [x] Any Cloud Run instance can resume and advance a session
- [x] Current card is the lowest-position pending session card
- [x] Every mutation is short, transactional, versioned, and idempotent
- [x] Duplicate `submissionId` cannot increment progress or familiarity twice
- [x] Stale device/tab commands receive `409 SESSION_ADVANCED` with latest snapshot
- [x] Explicit exit and expiry drop pending learning steps cleanly

### Introduction and learning

- [x] Introduction card assembled from existing word, kanji, and quiz rows with no new AI calls
- [x] Missing example sentence/context has a clean UI fallback
- [x] Introduction acknowledgement sets `introducedAt` and fallback `nextReview`
- [x] Introductions do not increment `QuizSlot.completed`
- [x] `maxIntroductions(allowance)` caps introductions at `floor(allowance / 3)`, max 3
- [x] Learning step 1 is at least 2 cards after introduction
- [x] Step-1 failure inserts step 2 at least 3 cards later and drops one normal review
- [x] Both steps clamp to the end when the session is too short
- [x] Correct learning step moves the word to familiarity 1 and normal scheduling
- [x] Failed step 2 increments failures and schedules tomorrow unless re-introduction triggers
- [x] Failure threshold preserves the count for ordering and marks the card `REINTRODUCTION`
- [x] Re-introduction acknowledgement and any correct answer reset failures
- [x] “New words never served” selection priority removed

### API and UI

- [x] API returns an authoritative `currentCard`, progress, summary, and version
- [x] Server derives correctness; client does not submit a trusted `correct` boolean
- [x] Buttons disable and show progress while a command is saving
- [x] Failed saves do not advance the UI and offer Retry with the same `submissionId`
- [x] Learning-step misses use neutral framing and repeat the kanji breakdown
- [x] Progress counts answer moments and never moves backward after queue mutation
- [x] Summary separates new words, re-introduced words, correct reviews, and revisits
- [x] Dictionary lists every saved `UserWords` row, including pre-introduction words
- [x] Word list and detail responses expose a server-derived `learningState`
- [x] Dictionary state filters are applied before pagination
- [x] Dictionary cards open a read-only word-reference page with introduction content
- [x] Viewing word-reference content does not mutate introduction, session, familiarity, failure, or scheduling state
- [x] Collection counts and empty states do not describe unintroduced words as learned
- [x] Verified end-to-end: a new word is introduced, recalled later, and reaches familiarity 1 in the same session
