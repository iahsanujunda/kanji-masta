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

----

# Iteration 3.2: Captures

_Keeping the source material and making progress legible against it_

---

## The problem

A photo is currently disposable input. It is uploaded, analyzed for kanji, used once as a selector, and then hidden. This loses both the immediate value of understanding the photographed text and the long-term value of returning to material that motivated the learning.

A capture must answer two different questions:

1. **Kanji coverage:** how many distinct kanji in this photo has the learner mastered?
2. **Word coverage:** does the learner understand the words those kanji form in this particular text?

These are deliberately separate. A learner can know 100% of the individual kanji in a poster while still not knowing a compound used by the poster. Calling both states "readability" would overstate what the app knows.

The translation is available immediately after processing and hidden by default on revisit. Revisiting is primarily a self-test and a way to choose the next small batch of kanji, not a familiarity-changing quiz.

---

## 3.2.1 Product concept

Every successfully uploaded photo becomes a permanent **capture**. The existing kanji selector is replaced by the capture detail page rather than followed by a separate disposable flow.

```
Photo
  → required visual analysis
  → required translation
  → capture ready
      → learn the first recommended kanji
      → revisit and learn the next batch
      → reach 100% kanji coverage
      → discover unfamiliar words used in this capture
```

The learner may begin with three recommended kanji, leave, and return later. The same page always shows:

- every kanji detected in the photo;
- which kanji the learner originally selected;
- which were added on later revisits;
- current familiarity, including progress made through other photos;
- which kanji remain available to learn.

AI omissions are out of scope for this iteration. The learner can revisit the detected list, but cannot manually add a kanji that visual analysis missed.

Every capture is retained automatically. "Done" leaves the page; it does not decide whether the capture is saved.

---

## 3.2.2 Processing pipeline

Visual analysis and translation use separate model workloads so each can be selected, evaluated, and fine-tuned for one task.

### Required tasks

**`VISUAL_ANALYSIS`** receives the image and returns:

- complete Japanese text with line breaks;
- a short title;
- kanji character observations and their first-seen order;
- a content-based learning priority for each character;
- the existing kanji explanation and starter-word data needed by the learning flow.

The visual model detects content; it does not determine canonical database identity or whether a kanji is appropriate for this learner. Do not send the learner's known-kanji list to the model. That state changes after the capture is processed and would make stored recommendations stale.

### Deterministic kanji canonicalization

Before publishing visual-analysis results, the backend:

1. trims and Unicode-normalizes each returned character;
2. validates that it represents one supported kanji character;
3. resolves it through the unique `kanji_master.character` key;
4. deduplicates observations by canonical `kanji_master.id`;
5. retains the earliest observed position and best content-based priority;
6. writes the normalized `photo_session_kanji` rows in the same fenced transaction that completes the task.

The application never accepts a `kanjiMasterId`, reading, or meaning invented by the model. An unresolved character remains in task evidence for diagnostics, but is not selectable and does not count toward coverage. Repeated occurrences of the same kanji count once.

Content priority may originate with the visual model, but learner eligibility is always recomputed by the backend. A model-provided priority can never make an already-learning or familiar kanji selectable.

**`TRANSLATION`** receives the canonical `fullText` produced by visual analysis and returns an English translation. It does not inspect the image independently. This avoids paying twice for image input and prevents OCR disagreements between workers.

Translation begins only after visual analysis completes. A capture becomes `READY` only after all required tasks succeed. Failure of a required task moves it to `NEEDS_ATTENTION`; retry reruns only the failed task.

### Optional later task

**`CAPTURE_WORD_DISCOVERY`** is not required for initial readiness. It is triggered from a revisit after kanji coverage reaches 100%, operates on canonical `fullText`, and extracts vocabulary actually present in the capture.

Starting this optional task does not move a ready capture back to `PROCESSING`. Its status appears on the capture page and in the existing activity drawer.

### Execution model

The database is the durable queue and source of truth. Cloud Run Jobs provide execution; Redis, RabbitMQ, and Pub/Sub are not required for this workload.

- Use the same application artifact and a generic capture-job runtime role with task executors.
- Claim bounded batches with `FOR UPDATE SKIP LOCKED`.
- Use immediate dispatch for responsiveness and a scheduled drainer for recovery.
- Fence completion with the existing `job_attempt` claim token and lease pattern.
- Snapshot pipeline version, model configuration version, and model ID on each task attempt.
- Resolve fresh image access from private `storage_path` at execution time; do not treat an expiring signed URL as a durable job input.

Suggested executors:

- `CaptureVisualAnalysisExecutor`
- `CaptureTranslationExecutor`
- `CaptureWordDiscoveryExecutor`
- `CapturePipelineCoordinator`

---

## 3.2.3 Persistence contract

SQL migrations in `supabase/migrations/` remain the schema source of truth. The names below describe the domain contract; exact DDL is deferred until implementation.

### `photo_session`: the capture aggregate

Continue using the existing row as the aggregate to avoid an unnecessary rename migration. Add:

- `processing_status`: `PROCESSING | READY | NEEDS_ATTENTION`
- `pipeline_version`
- `title`
- `full_text`
- `translation`
- `translation_language`, initially `en`
- `thumbnail_path`
- `captured_kanji_coverage`, immutable and nullable for legacy captures
- `ready_at`
- `selection_completed_at`
- `last_revisited_at`
- `archived`

Processing status and selection completion are separate. The current `INGESTED` state conflates them and must not hide a permanent capture.

### `photo_session_task`: durable asynchronous work

- `id`
- `photo_session_id`
- `task_type`: `VISUAL_ANALYSIS | TRANSLATION | CAPTURE_WORD_DISCOVERY`
- `status`: `BLOCKED | PENDING | PROCESSING | DONE | FAILED`
- `required_for_ready`
- `pipeline_version`
- `result_json` for provider evidence/debugging, not the primary read model
- failure and lease metadata
- timestamps

Unique key: `(photo_session_id, task_type, pipeline_version)`.

`job_attempt.job_id` points to the task ID. Completing a task and publishing its normalized result must be one fenced transaction.

### `photo_session_kanji`: every detected kanji

- `photo_session_id`
- `kanji_master_id`
- `first_seen_order`
- `recommendation_rank`
- `why_useful`
- nullable `excluded_at` for a learner-confirmed false positive
- visual-analysis provenance/version

Unique key: `(photo_session_id, kanji_master_id)`. Repeated appearances of the same character do not inflate coverage.

This association is permanent and independent from `user_kanji`. Live familiarity is joined from `user_kanji` when the capture is read.

`recommendation_rank` is capture-content metadata, not a frozen user recommendation. When AI priority is absent or tied, use a stable fallback of canonical frequency, first-seen order, then `kanji_master_id`.

### `photo_session_kanji_decision`: selection history

- `photo_session_id`
- `kanji_master_id`
- `batch_id` for selections submitted together
- `decision`: `LEARNING | FAMILIAR | EXCLUDED_FALSE_POSITIVE | RESTORED`
- `decision_source`: `INITIAL | REVISIT`
- `created_at`

This preserves what the learner chose at capture time versus what they added later. The latest global learning state still lives in `user_kanji`.

`EXCLUDED_FALSE_POSITIVE` and `RESTORED` change only the capture-specific association. They never create, remove, or modify global `user_kanji` state. Keeping the association and decision event makes the correction reversible and auditable.

`user_kanji.source_photo_id` is not sufficient as the capture association because the same kanji may appear in many captures.

### `photo_session_word`: vocabulary actually present

- `photo_session_id`
- position/order in canonical text
- surface text
- normalized lemma
- reading
- meaning
- all constituent kanji IDs
- nullable `word_master_id`
- extraction version and timestamps

The association is retained even after the learner encounters the same word elsewhere. Its current learning state is joined from `user_words`.

Word identity must use at least normalized `(lemma, reading)`, not spelling alone. The current spelling-only lookup can merge homographs and must not be copied into this flow.

This normalized capture-to-word relation also avoids pretending that a `UserWords` row has only one source photo.

### `capture_revisit_prompt`: prompt delivery

Use a separate row with threshold, status, fired/seen/dismissed timestamps, and a unique capture-plus-threshold key. A `firedThresholds` array on the capture cannot safely enforce one pending prompt and a weekly cross-capture rate limit.

---

## 3.2.4 Kanji coverage and progressive selection

Kanji coverage is computed live from distinct resolved kanji that have not been excluded as false positives:

```kotlin
fun kanjiCoverage(activeDetected: Set<KanjiId>, familiarity: Map<KanjiId, Int>): Float? {
    if (activeDetected.isEmpty()) return null
    val familiar = activeDetected.count { (familiarity[it] ?: 0) >= 5 }
    return familiar.toFloat() / activeDetected.size
}

fun kanjiGateSatisfied(activeDetected: Set<KanjiId>, familiarity: Map<KanjiId, Int>) =
    activeDetected.all { (familiarity[it] ?: 0) >= 5 }
```

A capture with no resolved kanji shows kanji coverage as `N/A`, not 100%. It can still be `READY`, show its translation, and unlock capture word discovery because there is no kanji-learning prerequisite to satisfy.

The capture page groups kanji into:

- **Familiar:** familiarity 5 or higher;
- **Learning:** present in `user_kanji` with familiarity 0–4;
- **Not started:** no `user_kanji` row.

Learning a kanji from any source updates every capture containing it. Opening a capture does not alter familiarity.

The capture read model returns the backend-derived state instead of asking the client to infer it:

```json
{
  "kanjiMasterId": "uuid",
  "character": "電",
  "firstSeenOrder": 4,
  "recommendationRank": 2,
  "familiarity": 5,
  "learningState": "FAMILIAR",
  "selectable": false,
  "recommendedNext": false
}
```

`selectable` is true only for `NOT_STARTED` and non-excluded rows. `recommendedNext` is true only when the previous learning batch selected from this capture has reached familiarity 5, then only for the first three selectable rows ordered by stored recommendation rank and its deterministic fallback. Familiar and learning kanji remain visible because they explain coverage, but neither can be selected again.

Every non-excluded row also offers a secondary **Not in this photo** action. This handles false positives without adding support for kanji the AI missed. Excluded rows move to a collapsed correction section with an **Undo** action.

### False-positive example

A station announcement contains `本日は運転を見合わせます`, whose distinct kanji are `本 日 運 転 見 合`. Glare, a logo, or background decoration causes visual analysis to additionally report `米`. Because `米` is a real seeded kanji, deterministic canonical matching can correctly resolve its ID but cannot prove that the observation was visually correct.

Without correction, a learner familiar with every real kanji remains at `6 / 7` and never unlocks word discovery. Choosing **Not in this photo** records `EXCLUDED_FALSE_POSITIVE`, removes only `米` from this capture's coverage denominator, and produces `6 / 6`. It does not mark `米` familiar or alter any other capture. **Undo** restores the association if the learner excluded it by mistake.

This is different from an AI omission: the learner can remove an incorrectly reported character but cannot add a character the model failed to report in this iteration.

### Initial visit

```
┌────────────────────────────────────┐
│  ← Station notice                  │
│  [original image]                  │
│                                    │
│  Kanji coverage       4 / 18       │
│                                    │
│  Recommended next                  │
│  電   運   転                       │
│                                    │
│  [ Learn these 3 ]                 │
│  [ Show all detected kanji ]       │
│                                    │
│  [ Reveal translation ]            │
│                         [ Done ]    │
└────────────────────────────────────┘
```

The word-encounter flow adds exactly one starter word for each newly selected learning kanji, preferring a contextually relevant word from the capture analysis. It must not add all five examples from the current AI response. These starter words are separate from later capture word discovery.

### Revisit before 100%

```
Kanji coverage: 9 / 18 familiar

9 familiar · 3 learning · 6 not started

[ Add next 3 ]
```

`Add next 3` remains disabled while any kanji in the previous learning batch selected from this capture is below familiarity 5. Kanji that were already being learned from another source do not block the capture's next batch. Declaring a not-started kanji **Already know** sets it familiar but does not consume one of the three learning slots.

When the batch gate opens, `Add next 3` uses the stored recommendation rank among not-started kanji. The client submits exact kanji IDs; the server does not recalculate a different batch during the mutation.

The selection command rechecks everything transactionally because the response may be stale by the time the learner taps the button:

1. verify that the authenticated user owns the capture;
2. verify that every submitted ID belongs to that capture's normalized kanji set;
3. enforce the batch-size limit for new `LEARNING` selections;
4. insert missing `user_kanji` rows with `ON CONFLICT DO NOTHING`;
5. never overwrite familiarity, tier, review date, or status on an existing row;
6. append only newly applied capture decision events;
7. return the refreshed capture snapshot.

If a kanji became learning or familiar elsewhere after the page loaded, selecting it is an idempotent no-op rather than a duplicate-key error or a familiarity reset. Arbitrary kanji IDs and kanji from another capture are rejected.

`captured_kanji_coverage` is snapshotted automatically when a new capture first becomes `READY`, before initial selections change the live value.

---

## 3.2.5 Word discovery after kanji mastery

Reaching 100% kanji coverage means only that every character is familiar. It explicitly does not mean the learner understands every word in the photo.

At 100%, the capture page unlocks:

```
You know every kanji in this announcement.
Some combinations may still be new.

[ Find new words ]
```

The button idempotently enqueues `CAPTURE_WORD_DISCOVERY`. A `GET` request never starts work or updates `last_revisited_at`.

The worker contract differs from the existing generic word-discovery prompt:

- input is canonical `fullText`, not one kanji and a known-word list;
- return only lexical items actually present in the captured text;
- return surface text, lemma, reading, meaning, position, and constituent kanji;
- include kanji-plus-kana words such as `遅れる`, not only multi-kanji compounds;
- do not suggest related vocabulary that is absent from the capture.

The extraction is stored once per capture and pipeline version. "New to this learner" is computed later by joining against `user_words`; it is not embedded in the AI prompt or frozen in the task result.

This means a word discovered in one capture immediately appears as already known or learning in every other capture containing it.

Word coverage is `NOT_MEASURED` until discovery completes. Afterward, the initial implementation shows counts for new, learning, and familiar words without presenting another percentage. This avoids false precision while the extraction quality is still being evaluated; kanji coverage must not borrow a word-familiarity threshold.

### Consuming discovery results

After the optional task completes, the page shows only candidates not already in `UserWords` as new:

```
New combinations found

運転見合わせ  うんてんみあわせ
Service suspended

振替輸送      ふりかえゆそう
Alternative transportation

[ Learn these 2 words ]
```

Results are selected by default but require the learner to press **Learn these words**. AI discovery never changes the curriculum merely because a capture was opened.

On confirmation, one transaction:

1. resolves or creates `WordMaster` by normalized lemma and reading;
2. creates missing `UserWords` idempotently;
3. preserves the capture-to-word associations;
4. reuses global quizzes when they exist;
5. enqueues quiz generation only for accepted new words without global quizzes;
6. dispatches the quiz drainer after commit.

Retries and repeated confirmations must not create duplicate user words, candidates, quiz jobs, or attempts.

The existing `WordDiscoveryService` is infrastructure to reuse, not a compatible domain implementation. Today it is constructed but has no caller, suggests five generic words around one kanji, and immediately inserts every result into `UserWords`. Its prompt, request, persistence, and runtime entry point must become capture-specific.

---

## 3.2.6 Gallery and revisit experience

`/captures` becomes the permanent server-backed gallery. The device-local upload queue moves to `/capture-queue`, with `/capture-queue/{clientCaptureId}` for local recovery. Once the server owns an upload, the local route redirects to `/captures/{captureId}`.

Gallery cards show `PROCESSING`, `READY`, and `NEEDS_ATTENTION` distinctly. Ready cards show title, date, thumbnail, captured kanji coverage when available, and current kanji coverage.

The gallery has three sorting tabs:

1. **Recent** — defaults to newest capture first; tapping the active tab reverses to oldest first.
2. **Familiarity** — defaults to highest current kanji coverage first; tapping the active tab reverses to lowest coverage first, which is the most-challenging view.
3. **Recently visited** — defaults to most recently revisited first; tapping the active tab reverses to never/least recently revisited first.

Selecting an inactive tab applies that tab's default direction. Tapping the already-active tab reverses its direction. Each tab displays an ascending/descending indicator and exposes an accessible label such as "Familiarity, highest first. Activate to show lowest first."

Ordering is server-authoritative and stable:

- **Recent:** `(created_at, id)` in the selected direction.
- **Familiarity:** `(current_kanji_coverage, familiar_kanji_count, created_at, id)` in the selected direction. `N/A` coverage always appears after numeric coverage in both directions.
- **Recently visited:** `(last_revisited_at, created_at, id)` in the selected direction. In descending order, never-visited captures appear last; in ascending order, they appear first.

Processing and `NEEDS_ATTENTION` cards remain discoverable in every tab. Because their familiarity is `N/A`, they sort after ready captures in the Familiarity tab. Archived captures are excluded from the three main tabs and opened through a separate archived view.

On revisit, translation is hidden by default. The learner first attempts to read the original, then reveals the translation to check understanding. Kanji and word state are informational; simply revisiting never changes familiarity.

Opening the page does not mutate `last_revisited_at`. The client sends an explicit revisit command after the page is successfully displayed.

Revisit prompts use exactly two kanji-coverage milestones:

- **60%:** enough of the material is familiar to make a revisit meaningfully different.
- **100%:** every active detected kanji is familiar and capture word discovery is unlocked.

A capture must be at least 14 days old. It fires only when live familiarity moves it from below to at-or-above a milestone; starting above a milestone does not fire it. A false-positive exclusion by itself does not create a learning celebration. If a pending 60% prompt reaches 100%, update the existing prompt to 100% instead of creating another.

There is at most one pending revisit prompt for the user and no more than one newly surfaced prompt per week. If several captures are eligible, priority is: 100% before 60%, then greatest improvement from captured coverage, least recently revisited, oldest capture, and capture ID as the final stable tie-breaker. The prompt stays below consolidation and maturity work on the home screen.

---

## 3.2.7 Storage and initial retention

The private `storage_path` is the durable image pointer. API responses resolve short-lived signed URLs as needed.

Generate a deterministic private thumbnail path during the client-side upload preparation already used for image optimization. Gallery rendering must not download full-resolution images.

Archiving hides a capture without affecting learned kanji, learned words, or source associations. The initial implementation provides archive and restore only. It does not expose a capture-level hard-delete API or label archive as delete.

Pre-feature photo sessions are not reprocessed or backfilled. Only sessions created under the capture pipeline version appear in the permanent gallery. Existing photo activity may remain in operational history, but opening it does not enqueue new visual, translation, or word-discovery jobs.

Capture-level hard delete is deferred rather than rejected permanently. Photographs can contain addresses, government correspondence, medical information, or other sensitive text, so deletion should be designed before a broad public launch. Account-level data removal is a separate retention requirement and is not replaced by archive.

---

## 3.2.8 API contract

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/captures?tab={recent\|familiarity\|recentlyVisited}&direction={asc\|desc}` | Cursor-paginated gallery using the selected reversible tab order |
| `GET` | `/api/captures/{id}` | Canonical capture, task stages, normalized kanji with backend-derived eligibility, and word candidates |
| `PUT` | `/api/captures/{id}` | Update user-owned metadata such as title and archived state |
| `PUT` | `/api/captures/{id}/kanji-decisions` | Validate membership and idempotently record exact initial or revisit selections |
| `POST` | `/api/captures/{id}/revisited` | Explicitly record a successful revisit |
| `POST` | `/api/captures/{id}/word-discovery` | Idempotently enqueue optional capture word discovery |
| `PUT` | `/api/captures/{id}/word-decisions` | Accept selected new words and enqueue missing quiz generation |
| `POST` | `/api/captures/{id}/tasks/{taskType}/retry` | Retry one failed task |
| `GET` | `/api/captures/revisit-prompt` | Return the one pending prompt or null |

All write endpoints verify capture ownership. Selection, discovery, retry, and acceptance commands are idempotent. Each gallery tab uses its documented compound cursor and matching index; reversing direction must not duplicate or skip captures between pages.

---

## 3.2.9 Settled decisions

Settled:

- Persist every AI-detected kanji; do not support manually adding AI-missed kanji in this iteration.
- Let AI detect characters and content priority, but resolve canonical identity and learner eligibility in the backend.
- Do not send mutable learner kanji state to the visual model.
- Replace the disposable selector with the permanent capture detail page.
- Let the learner add recommended kanji progressively across revisits.
- Gate each new learning batch until the preceding capture-selected batch reaches familiarity 5.
- Allow capture-specific false-positive exclusion and undo; continue to ignore AI-missed kanji.
- Show `N/A` rather than 100% when a capture contains no resolved kanji, while still allowing translation and word discovery.
- Add exactly one starter word per newly selected learning kanji.
- Compute kanji coverage from live `user_kanji` familiarity, with mastery at 5.
- Keep kanji coverage separate from word understanding.
- Use separate visual-analysis and translation models.
- Make word discovery an optional asynchronous task triggered after 100% kanji coverage.
- Extract only words actually present in canonical capture text.
- Compute whether a word is new in the database rather than asking AI to decide.
- Require explicit **Learn these words** confirmation before changing the curriculum.
- Show word-state counts without a word-coverage percentage in the initial implementation.
- Migrate `WordMaster` identity from spelling-only to normalized `(lemma, reading)` before capture word discovery.
- Generate or reuse quizzes only for newly accepted capture words.
- Use the database queue plus Cloud Run Jobs, without another broker.
- Do not backfill or reprocess pre-feature photo sessions.
- Provide archive and restore only; defer capture-level hard delete.
- Use only 60% and 100% revisit-prompt milestones.
- Use reversible Recent, Familiarity, and Recently visited gallery tabs.

No product-contract decision remains open for the initial implementation. Mockup validation may refine labels, placement, and explanatory copy without changing these behaviors.

---

## 3.2.10 Capture verification contract

Automated integration tests must cover these boundaries:

- an extracted character resolves to the seeded canonical `kanji_master.id`, regardless of AI-supplied metadata;
- repeated observations of one character create one `photo_session_kanji` row and one coverage unit;
- an unresolved or malformed character cannot become selectable;
- a learner can exclude and restore a false-positive kanji without changing global kanji progress;
- excluded false positives do not count toward coverage or block word discovery;
- a no-kanji capture reports `N/A`, remains ready, and permits word discovery;
- only familiarity-driven crossings at 60% and 100% create revisit prompts;
- a pending 60% prompt upgrades in place when the same capture reaches 100%;
- false-positive exclusion alone does not create a revisit prompt;
- a model result that gives highest priority to a familiar kanji is overridden by the backend;
- a kanji already at familiarity 5 is returned as `FAMILIAR`, visible, and not selectable;
- a kanji already at familiarity 0–4 is returned as `LEARNING`, visible, and not selectable;
- a kanji learned through another capture changes this capture's read model without rerunning AI;
- a new batch remains unavailable until the preceding capture-selected learning batch reaches familiarity 5;
- selecting three kanji creates at most three starter words;
- repeating a selection command creates no duplicate decision, word, quiz job, or attempt;
- a stale selection never resets an existing kanji's familiarity, tier, or next review;
- submitting another user's capture or a kanji absent from the capture is rejected before any learning state changes;
- reversing each gallery tab preserves complete, duplicate-free cursor pagination;
- Familiarity always places `N/A` after numeric coverage;
- Recently visited places never-visited captures last when descending and first when ascending.

---

## Definition of Done

- [ ] Required visual-analysis and translation tasks use separate configurable models
- [ ] Capture readiness is derived from required task completion
- [ ] Optional word discovery does not demote a ready capture
- [ ] Extracted characters are normalized, validated, resolved only through unique `kanji_master.character`, and deduplicated
- [ ] Unresolved characters are retained as diagnostic evidence but are not selectable or counted in coverage
- [ ] Every resolved detected kanji is normalized into `photo_session_kanji` in the fenced completion transaction
- [ ] Visual analysis receives no mutable learner-known-kanji list
- [ ] Recommendation order supports repeatable batches of three
- [ ] Initial and revisit selections are retained separately
- [ ] Capture detail shows familiar, learning, and not-started kanji using live state
- [ ] False-positive exclusion is reversible, capture-specific, and excluded from coverage
- [ ] A no-kanji capture shows `N/A`, remains ready, and can run word discovery
- [ ] Already-learning and familiar kanji remain visible but are never selectable or recommended next
- [ ] Backend eligibility overrides contradictory AI recommendation metadata
- [ ] Kanji coverage uses distinct detected kanji and familiarity 5
- [ ] `captured_kanji_coverage` is snapshotted automatically for new capture-pipeline sessions
- [ ] Selection verifies capture ownership and rejects kanji outside the capture
- [ ] A stale or repeated selection is an idempotent no-op and never resets existing learning progress
- [ ] The next capture batch remains gated until the preceding capture-selected batch is familiar
- [ ] Each newly selected learning kanji creates exactly one starter word
- [ ] Selecting the next batch continues the existing kanji learning flow
- [ ] 100% kanji coverage unlocks capture-specific word discovery
- [ ] Word discovery returns only lexical items actually present in canonical `fullText`
- [ ] Word candidates are normalized and retained per capture
- [ ] New/learning/familiar word state is computed live from `user_words`
- [ ] Initial word progress uses counts and does not claim a percentage
- [ ] `WordMaster` identity and uniqueness migrate from spelling-only to normalized `(lemma, reading)`
- [ ] Discovery results require explicit learner confirmation before creating `UserWords`
- [ ] Accepting new words creates no duplicate `UserWords` or quiz jobs
- [ ] Existing global quizzes are reused; generation runs only when quizzes are missing
- [ ] Permanent gallery replaces `/captures` local-queue semantics
- [ ] Upload queue and recovery routes move to `/capture-queue`
- [ ] Processing and failed captures remain visible in gallery and activity drawer
- [ ] Gallery provides reversible Recent, Familiarity, and Recently visited tabs with visible and accessible direction state
- [ ] Each gallery direction uses stable cursor pagination without duplicates or omissions
- [ ] Familiarity `N/A` and never-visited ordering follow the documented tab rules
- [ ] Revisit hides translation initially and never alters familiarity
- [ ] Explicit revisit command records `last_revisited_at`; `GET` remains read-only
- [ ] Revisit prompts fire only at familiarity-driven 60% and 100% crossings after the 14-day minimum
- [ ] At most one prompt is pending and at most one is newly surfaced per week
- [ ] A pending 60% prompt upgrades to 100% rather than duplicating
- [ ] Archive and restore are available without presenting archive as deletion
- [ ] Capture-level hard delete is absent from the initial API and UI
- [ ] Immediate dispatch and scheduled draining recover stranded database work
- [ ] Claim-token fencing prevents stale workers from publishing results
- [ ] Pre-feature photo sessions are excluded from the permanent gallery and never enqueue backfill jobs
