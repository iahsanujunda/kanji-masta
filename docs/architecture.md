# Architecture — Kanji Learning App

_Last updated: 2026-03-22_

---

## 1. Purpose

A personal mobile-first web app for learning to read Japanese kanji through real-life encounters. The user photographs signs, menus, and notices in Japan, selects which kanji they want to learn, and receives spaced-repetition quizzes across configurable daily time slots generated in the background by Claude.

Designed for a single user profile: conversational Japanese speaker, no formal study habit, living in Japan. The app optimizes for minimum friction at two moments — the capture moment (high motivation, in the wild) and the quiz moment (low friction, fits into any gap in the day).

---

## 2. Stack

| Layer | Technology | Version / Notes |
|-------|------------|-----------------|
| Frontend | React | Mobile-first, PWA |
| Backend | Ktor | Kotlin, `core/` + `modules/` structure — API gateway + slot engine |
| Auth | Firebase Auth | User authentication, ID tokens |
| Database | Firebase Data Connect | PostgreSQL via GraphQL schema — no SQL migrations |
| Functions | Firebase Functions | Claude API calls (photo analysis, quiz generation, regen) |
| AI (photo) | Claude Sonnet | Vision extraction — strong Japanese OCR + cultural context |
| AI (quiz gen) | Claude Sonnet | Quiz + distractor generation — highest quality |
| AI (regen) | Gemini 2.0 Flash | Distractor regen — narrow task, cost efficient |
| Seed Data | kanjidic2 | edrdg.org, top 1500 by frequency rank |

---

## 3. Core Learning Loop

```
📸 Photo taken
     │
     ▼
Ktor: POST /api/photo/analyze
  → delegates to Firebase Function analyzePhoto
    → Claude Sonnet vision call (Call #1)
    → Enrich with KanjiMaster via Data Connect
    → Save PhotoSession to Data Connect
  → Return enriched kanji list to frontend
     │
     ▼
React: Kanji selection UI
  → User taps each card: ✓ Already Know  /  ★ Want to Learn
  → POST /api/kanji/session (Ktor)
     │
     ├── familiar  → write UserKanji, no quiz generation
     └── learning  → write UserKanji + enqueue QuizGenerationJob
     │
     ▼ (both paths)
  example words from Claude response → insert UserWords
  → skip words whose kanji aren't all in KanjiMaster
  → set unlocked=true if all constituent kanji already in UserKanji
                          │
                          ▼ (async, user does not wait)
                  Firebase Scheduled Function (every 2 min)
                    → Claude Sonnet text call (Call #2)
                    → Generate 5 quizzes per kanji (one per type)
                    → Store in QuizBank + QuizDistractor via Data Connect
                          │
                          ▼
                  Slot-based Quiz Engine (Ktor)
                    → 4 slots/day × 6 hours each (JST)
                    → Configurable quiz allowance per slot
                    → Slot counter starts on first answer, not slot open
                    → Missed slots quietly expire — no rollover backlog
                    → Quiz selection by familiarity tier + weighted resurfacing
```

---

## 4. Features

### 4.1 Photo Analysis

- User captures a photo via device camera (`accept="image/*" capture="environment"`)
- Image uploaded to Ktor `POST /api/photo/analyze`, which delegates to Firebase Function `analyzePhoto`
- Firebase Function calls Claude Sonnet vision API with base64 image — no storage needed for analysis
- Returns per kanji: character, 5 example words (daily-life focused), `whyUseful`, `recommended` flag (max 3)
- Readings and meanings for matched kanji enriched from `KanjiMaster` via Data Connect — Claude is not asked to supply these
- Raw Claude response persisted in `PhotoSession.rawAiResponse` via Data Connect — avoids re-billing if user revisits
- Example words from response written to `UserWords` after kanji selection (see §4.2)
- Claude API key stored in Firebase Function environment config only — never exposed to Ktor or client

### 4.2 Kanji Selection

- Each extracted kanji rendered as a card showing: large character, readings, primary meaning, one example word, recommended badge
- User taps to toggle: neutral → familiar → learning
- `familiar` — written to `UserKanji`, no quizzes generated; respects existing knowledge
- `learning` — written to `UserKanji` + job enqueued in `QuizGenerationJob`
- User dismissed immediately after tapping Done — never waits for quiz generation
- After session saved: example words from Claude response inserted into `UserWords`
    - Words whose kanji are not all in `KanjiMaster` are silently skipped
    - `unlocked` set to true if all constituent kanji already exist in `UserKanji`
    - `unlocked` re-evaluated for existing `UserWords` whenever a new kanji is added

### 4.3 Background Quiz Generation

- Firebase scheduled Function runs every 2 minutes
- Drains `QuizGenerationJob` queue (status = PENDING), up to 10 per cycle
- For each job: calls Claude Sonnet text API with kanji details, generates 5 quizzes (one per type), stores in `QuizBank` + `QuizDistractor` via Data Connect
- Job status transitions: `PENDING → PROCESSING → DONE | FAILED`
- Failed jobs retried up to 3 times (`attempts < 3`)

### 4.4 Slot-Based Quiz Sessions

The quiz system is organized into **4 time slots per day, 6 hours each (JST)**:

```
Slot 1:  00:00 – 05:59
Slot 2:  06:00 – 11:59
Slot 3:  12:00 – 17:59
Slot 4:  18:00 – 23:59
```

**Slot behaviour:**
- Each slot has a configurable quiz allowance (default: 5, stored in `UserSettings`)
- The slot counter **starts on first quiz answer** — not when the slot window opens
- A slot that expires without being started is quietly abandoned — no rollover, no backlog
- A started-but-incomplete slot can be finished any time within its window
- `GET /api/quiz/slot` (Ktor) returns current slot state: quizzes, remaining, `slotEndsAt`, `nextSlotAt`

**Why no rollover:** Accumulated backlogs are the primary cause of habit abandonment in spaced repetition apps. Missed slots disappear quietly, keeping each session feeling fresh and manageable.

### 4.5 Quiz Selection Logic

Within each slot, quizzes are selected in priority order up to the slot allowance:

| Priority | Source | Cap |
|----------|--------|-----|
| 1 | Overdue current-tier quizzes (`nextReview < now()`) | Up to 60% of allowance |
| 2 | New kanji, never served (`servedAt is null`) | Up to 20% of allowance |
| 3 | Resurfaced lower-tier quizzes (weighted, see §5.3) | Remainder |

Caps are applied as proportions of the configured allowance — if allowance is 10, overdue gets up to 6, new gets up to 2, resurfaced fills the rest.

### 4.6 Familiarity Progression (Type Gating)

Each familiarity level **unlocks a new quiz type** as the current focus tier. Easier types don't disappear — they resurface at lower frequency (see §5.3).

| Familiarity | Current tier | What is being tested |
|-------------|--------------|----------------------|
| 0 | `meaning_recall` | Do you recognise what it means? |
| 1 | `reading_recognition` | Can you read it? |
| 2 | `reverse_reading` | Can you connect the sound to the character? |
| 3 | `bold_word_meaning` | Can you understand it in a sentence? |
| 4 | `fill_in_the_blank` (MC) | Can you use it in context? |
| 5 | `fill_in_the_blank` (free type) | Can you produce it from memory? |

Familiarity advances when the **current tier quiz** is answered correctly. Incorrect answer: familiarity -1 (min 0), `nextReview = tomorrow`.

SM-2 review intervals per familiarity level:

| Familiarity | Next Review |
|-------------|-------------|
| 0 | 1 day |
| 1 | 2 days |
| 2 | 4 days |
| 3 | 7 days |
| 4 | 14 days |
| 5 | 30 days |

### 4.7 Resurfacing of Previous Types

Lower-tier quiz types do not disappear once a kanji advances. They resurface with reduced weight, including at familiarity 5 (maintenance mode).

```
Example — kanji at familiarity 3 (current tier: bold_word_meaning):

  meaning_recall       5%   ← maintenance
  reading_recognition  10%  ← maintenance
  reverse_reading      15%  ← recently mastered
  bold_word_meaning    60%  ← current focus
  fill_in_the_blank    10%  ← preview of next tier
```

At familiarity 5 (no current tier), all types enter equal maintenance rotation at ~20% each.

### 4.8 Personal Kanji List

- Scrollable list of all `UserKanji` grouped by status: learning / familiar
- Familiarity shown as 0–5 dot bar with current tier label and next review date
- Tap any kanji → detail view with associated quiz types and answer history
- Familiar kanji can be moved to learning
- Manual add: search `KanjiMaster` by character → add as familiar or learning

### 4.9 User Settings

Configurable per user, stored in `UserSettings` (Data Connect):

| Setting | Default | Description |
|---------|---------|-------------|
| `quiz_allowance_per_slot` | 5 | Quizzes available per slot |
| `slot_duration_hours` | 6 | Length of each slot window in hours |
| `timezone` | `Asia/Tokyo` | Used for slot boundary calculation |

Changing `quizAllowancePerSlot` takes effect from the next slot.

### 4.10 Progress Indicators

- Current slot: quizzes remaining + time until slot closes
- Daily streak (QuizSlots with at least 1 answer)
- Total kanji: learning vs familiar
- Per-kanji familiarity and current tier

---

## 5. Quiz Types

### 5.1 Taxonomy

**Word-level** — tests kanji in isolation or short compound

| Type | `prompt` | `answer` | Always MC? |
|------|----------|----------|------------|
| `meaning_recall` | Kanji alone: `電` | English meaning | Yes |
| `reading_recognition` | Kanji compound: `電車` | Correct furigana | Yes |
| `reverse_reading` | Furigana: `でんしゃ` | Correct kanji compound | Yes |

**Sentence-level** — tests kanji in real-life Japanese context

| Type | `prompt` | `answer` | Always MC? |
|------|----------|----------|------------|
| `bold_word_meaning` | Sentence with target word marked | Meaning of marked word | Yes |
| `fill_in_the_blank` | Gapped sentence: `次の＿＿は…` | Missing word | No — see §5.2 |

### 5.2 Input Method Progression

`fill_in_the_blank` input is resolved at serve time from `user_kanji.familiarity`. Quiz rows are never regenerated.

| Familiarity | Input |
|-------------|-------|
| 0–4 | Multiple choice, 4 options |
| 5 | Free text input |

All other types: always multiple choice with 3 distractors (4 options total).

### 5.3 Resurfacing Weight Table

| Current familiarity | `meaning_recall` | `reading_recognition` | `reverse_reading` | `bold_word_meaning` | `fill_in_the_blank` |
|---------------------|------------------|-----------------------|-------------------|---------------------|---------------------|
| 0 | **70%** | 20% | 5% | 5% | 0% |
| 1 | 10% | **60%** | 20% | 5% | 5% |
| 2 | 5% | 15% | **60%** | 15% | 5% |
| 3 | 5% | 10% | 15% | **60%** | 10% |
| 4 | 5% | 10% | 10% | 15% | **60%** |
| 5 (maintenance) | 20% | 20% | 20% | 20% | **20%** |

### 5.4 quiz_bank Field Mapping

| Type | `prompt` | `target` | `furigana` | `answer` | `distractors` |
|------|----------|----------|------------|----------|---------------|
| `meaning_recall` | `電` | `電` | null | `"electricity"` | 3 other meanings |
| `reading_recognition` | `電車` | `電車` | null | `"でんしゃ"` | 3 wrong readings |
| `reverse_reading` | `でんしゃ` | `でんしゃ` | null | `"電車"` | 3 similar compounds |
| `bold_word_meaning` | full sentence | `"電車"` | `"でんしゃ"` | `"train"` | 3 plausible meanings |
| `fill_in_the_blank` | gapped sentence | `"電車"` | `"でんしゃ"` | `"電車"` | 3 plausible compounds |

`target` is stored separately from `prompt` so the client knows which word to bold or where to render the gap without string parsing.

---

## 6. Database Schema (Data Connect GraphQL)

Schema defined in `dataconnect/schema/schema.gql`. Data Connect auto-generates PostgreSQL tables — no SQL migrations needed. Security rules defined in `dataconnect/dataconnect.yaml`.

### Enums

```graphql
enum QuizType {
  MEANING_RECALL
  READING_RECOGNITION
  REVERSE_READING
  BOLD_WORD_MEANING
  FILL_IN_THE_BLANK
}

enum UserKanjiStatus { FAMILIAR, LEARNING }
enum JobType { INITIAL, REGEN }
enum JobStatus { PENDING, PROCESSING, DONE, FAILED }
enum DistractorTrigger { INITIAL, MILESTONE, SERVE_COUNT }
enum WordSource { PHOTO, QUIZ, CHALLENGE }
```

### `KanjiMaster`

Seeded once from kanjidic2. Read-only at runtime.

```graphql
type KanjiMaster @table {
  id: UUID! @default(expr: "uuidV4()")
  character: String! @unique
  onyomi: [String!]!
  kunyomi: [String!]!
  meanings: [String!]!
  frequency: Int
}
```

Seed filter: `frequency <= 1500`. JLPT level intentionally excluded — frequency rank is a better proxy for real-world encounter likelihood.

### `UserKanji`

One row per kanji the user has interacted with. `currentTier` tracks the active focus type for the familiarity ladder.

```graphql
type UserKanji @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!
  status: UserKanjiStatus!
  familiarity: Int! @default(value: 0)
  currentTier: QuizType! @default(value: "MEANING_RECALL")
  nextReview: Timestamp
  sourcePhotoId: UUID
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `PhotoSession`

One row per photo. Raw Claude response stored to avoid re-billing.

```graphql
type PhotoSession @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  imageUrl: String
  rawAiResponse: String
  costMicrodollars: Int64
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `QuizGenerationJob`

Background job queue. `jobType` distinguishes initial generation from distractor regen. Regen jobs reference an existing `QuizBank` row.

```graphql
type QuizGenerationJob @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!
  quiz: QuizBank
  jobType: JobType! @default(value: "INITIAL")
  trigger: String
  status: JobStatus! @default(value: "PENDING")
  attempts: Int! @default(value: 0)
  costMicrodollars: Int64
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `QuizBank`

Stable question content. Distractors managed separately in `QuizDistractor`. Input method for `FILL_IN_THE_BLANK` resolved at serve time from `UserKanji.familiarity`.

```graphql
type QuizBank @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!
  quizType: QuizType!
  prompt: String!
  furigana: String
  target: String!
  answer: String!
  explanation: String
  servedCount: Int! @default(value: 0)
  servedAt: Timestamp
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `QuizDistractor`

One row per distractor set per quiz. Old sets never deleted — accumulate for evaluation and prompt fine-tuning. Serve time picks most recent unserved set.

```graphql
type QuizDistractor @table {
  id: UUID! @default(expr: "uuidV4()")
  quiz: QuizBank!
  userId: String!
  distractors: [String!]!
  generation: Int!
  trigger: DistractorTrigger!
  familiarityAtGeneration: Int!
  servedAt: Timestamp
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `QuizServe`

Full answer history — one row per quiz attempt. Provides evaluation signal for distractor fine-tuning.

```graphql
type QuizServe @table {
  id: UUID! @default(expr: "uuidV4()")
  quiz: QuizBank!
  distractorSet: QuizDistractor!
  slot: QuizSlot!
  userId: String!
  familiarityAtServe: Int!
  correct: Boolean!
  answeredAt: Timestamp! @default(expr: "request.time")
}
```

### `QuizSlot`

One row per slot window. `startedAt` null until first quiz answer in that slot.

```graphql
type QuizSlot @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  slotStart: Timestamp!
  slotEnd: Timestamp!
  startedAt: Timestamp
  completed: Int! @default(value: 0)
  allowance: Int!
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `UserWords`

Compound words encountered via photos. Grows organically — no pre-seeded dictionary. `unlocked` becomes true when all constituent kanji exist in `UserKanji`.

```graphql
type UserWords @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  word: String!
  reading: String!
  meaning: String!
  kanjiIds: [UUID!]!
  source: WordSource! @default(value: "PHOTO")
  unlocked: Boolean! @default(value: false)
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### `ChallengeSession`

One row per milestone challenge. Does not affect daily familiarity scores — purely evaluative.

```graphql
type ChallengeSession @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  milestone: Int!
  triggeredAt: Timestamp!
  completedAt: Timestamp
  score: Int
}
```

### `UserSettings`

```graphql
type UserSettings @table(key: "userId") {
  userId: String! @unique
  quizAllowancePerSlot: Int! @default(value: 5)
  slotDurationHours: Int! @default(value: 6)
  timezone: String! @default(value: "Asia/Tokyo")
  updatedAt: Timestamp! @default(expr: "request.time")
}
```

### Security

Data Connect security rules enforce `userId == request.auth.uid` on all user-scoped types. `KanjiMaster` is read-only for all authenticated users.

---

## 7. API Endpoints

Ktor acts as the API gateway — handles auth token verification and session logic. Claude API calls are delegated to Firebase Functions.

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `POST` | `/api/photo/analyze` | Ktor → Firebase Fn | Multipart image → `analyzePhoto` function → enriched kanji breakdown |
| `POST` | `/api/kanji/session` | Ktor | Save kanji selections, enqueue QuizGenerationJobs via Data Connect |
| `GET` | `/api/kanji/list` | Ktor | User's full kanji list with familiarity, tier, review dates |
| `POST` | `/api/kanji/add` | Ktor | Manually add a kanji from `KanjiMaster` |
| `GET` | `/api/quiz/slot` | Ktor | Current slot state: quizzes, remaining, `slotEndsAt`, `nextSlotAt` |
| `POST` | `/api/quiz/result` | Ktor | Submit answer → update familiarity, tier, `nextReview` |
| `GET` | `/api/settings` | Ktor | Fetch `UserSettings` |
| `PUT` | `/api/settings` | Ktor | Update `quizAllowancePerSlot`, `slotDurationHours`, `timezone` |
| `GET` | `/api/words` | Ktor | User's word list with unlock status |
| `GET` | `/api/challenge/current` | Ktor | Pending milestone challenge if any |
| `POST` | `/api/challenge/result` | Ktor | Submit challenge answers |

---

## 8. Slot Lifecycle (Ktor)

```
GET /api/quiz/slot called
         │
         ▼
Compute current slot window from user timezone + slot_duration_hours
         │
         ▼
Find quiz_slots row for this window
         │
    ┌────┴─────────────────────┐
  exists                    not found
    │                           → create QuizSlot row (startedAt = null)
    ▼
slotEnd < now() AND startedAt IS NULL?
  → return { quizzes: [], nextSlotAt }  (slot expired unstarted)
         │
         ▼
remaining = QuizSlot.allowance - QuizSlot.completed
         │
         ▼
Select quizzes by priority (up to remaining):
  1. Overdue current-tier    up to 60% of allowance
  2. New kanji (unserved)    up to 20% of allowance
  3. Resurfaced lower-tier   remainder, weighted by §5.3

For each selected quiz:
  → find latest unserved quiz_distractors row
  → if none available: fall back to latest set + enqueue regen job
  → mark quiz_distractors.served_at

POST /api/quiz/result (first answer in slot)
  → set QuizSlot.startedAt = now() via Data Connect
  → increment quiz_slots.completed
  → insert quiz_serves row (quiz_id, distractor_set_id, correct, familiarity_at_serve)
  → increment quiz_bank.served_count
  → update UserKanji: familiarity, currentTier, nextReview via Data Connect
  → re-evaluate UserWords.unlocked for words linked to this kanji
  → check regen triggers (see §8.2)
```

### 8.2 Distractor Regen Triggers (Daily Cron)

A lightweight daily cron job checks two trigger conditions and enqueues `regen` type jobs for any quiz that qualifies. Old distractor sets are never deleted.

**Trigger 1 — Familiarity milestone crossing**
When `user_kanji.familiarity` crosses a tier boundary (1, 2, 3, 4, 5), all quizzes for that kanji get a regen job. At each new tier, fresh distractors calibrated to that familiarity level are more instructive.

**Trigger 2 — Serve count threshold + stale familiarity**
When any single quiz has been served 5+ times AND `user_kanji.familiarity` has not changed in 14+ days. Catches the case where the user is stuck at a tier and has memorized the option landscape without genuinely learning.

```kotlin
fun checkRegenTriggers(userId: UUID) {
    // Trigger 1: tier crossings in last 24h
    val milestoneKanji = userKanjiRepo.findRecentTierCrossings(userId, withinHours = 24)

    // Trigger 2: serve count >= 5 + familiarity stale 14+ days
    val staleSets = quizBankRepo.findHighServeCountStaleFamiliarity(
        userId,
        serveThreshold = 5,
        stalenessThreshold = 14
    )

    (milestoneKanji + staleSets)
        .distinctBy { it.quizId }
        .forEach {
            jobRepo.enqueue(
                quizId = it.quizId,
                jobType = "regen",
                trigger = it.triggerReason,
                familiarity = it.currentFamiliarity
            )
        }
}
```

**Regen Claude prompt:**
```
Regenerate distractors for this quiz. The learner is now at familiarity {familiarity}/5.
Make distractors more challenging than earlier sets — choose options that are
more plausible or confusable at this level.

Quiz: {prompt}
Answer: {answer}
Previous distractor sets: {previousDistractors}

Return ONLY a JSON array of exactly 3 distractors — no markdown, no preamble:
["option1", "option2", "option3"]
```

**Evaluation queries (future use):**
```sql
-- Which distractor sets had the highest wrong-answer rate?
SELECT
  qd.distractors,
  qd.familiarity_at_generation,
  qd.trigger,
  COUNT(*) FILTER (WHERE qs.correct = false) AS wrong_count,
  COUNT(*) AS total_served
FROM quiz_distractors qd
JOIN quiz_serves qs ON qs.distractor_set_id = qd.id
GROUP BY qd.id
ORDER BY wrong_count DESC;
```

---

## 9. Backend Module Structure

**Ktor (`ktor/src/`)** — API gateway and slot engine. Reads/writes Data Connect via Firebase Admin SDK. No direct Claude API calls.

```
ktor/src/
  core/
    config/
      AppConfig.kt
    firebase/
      FirebaseAdmin.kt          # Admin SDK init, Data Connect client
      FirebaseFunctions.kt      # HTTP client for calling Firebase Functions
    auth/
      FirebaseAuthPlugin.kt     # verify Firebase ID tokens
      UserPrincipal.kt
    plugins/
      Routing.kt
      Serialization.kt
      Authentication.kt

  modules/
    photo/
      PhotoRoutes.kt
      PhotoService.kt           # delegates to Firebase Function analyzePhoto
      models/PhotoModels.kt

    kanji/
      KanjiRoutes.kt
      KanjiService.kt
      KanjiRepository.kt        # reads KanjiMaster, writes UserKanji via Data Connect
      models/KanjiModels.kt

    quiz/
      QuizRoutes.kt
      QuizService.kt            # slot logic, tier gating, distractor selection
      QuizRepository.kt         # reads QuizBank, writes QuizSlot/QuizServe via Data Connect
      models/QuizModels.kt

    words/
      WordRoutes.kt
      WordService.kt            # insert from photo, unlock check
      WordRepository.kt         # writes UserWords via Data Connect

    challenge/
      ChallengeRoutes.kt
      ChallengeService.kt       # milestone detection
      ChallengeRepository.kt    # writes ChallengeSession via Data Connect

    settings/
      SettingsRoutes.kt
      SettingsRepository.kt     # reads/writes UserSettings via Data Connect

  Application.kt
```

**Firebase Functions (`functions/src/`)** — all Claude API calls. Triggered by Ktor or by schedule.

```
functions/src/
  analyzePhoto.ts               # HTTP trigger: Claude vision → enrich → save PhotoSession
  generateQuizzes.ts            # Scheduled (2 min): drain QuizGenerationJob queue, initial jobs
  regenDistractors.ts           # Scheduled (daily): drain QuizGenerationJob regen jobs
  milestoneCheck.ts             # Scheduled (daily): detect mature kanji milestones
  generateChallenge.ts          # HTTP trigger: generate challenge quiz for a milestone
  lib/
    claudeClient.ts             # Claude API wrapper (Sonnet + Flash)
    dataConnectClient.ts        # Data Connect GraphQL client for Functions
```

**Boundary rule:** Ktor modules import from `core/` only. Firebase Functions are independently deployable — no shared code with Ktor.

---

## 10. AI Usage (Claude + Firebase Functions)

### Call #1 — Vision (photo analysis)

- **Function:** `analyzePhoto` (HTTP trigger, called by Ktor)
- **Model:** Claude Sonnet (`claude-sonnet-4-20250514`) — strong vision + Japanese cultural context
- Input: base64 image bytes from Ktor
- Output: JSON array — `character`, `recommended`, `whyUseful`, `exampleWords` (5 per kanji)
- Readings and meanings enriched post-hoc from `KanjiMaster` via Data Connect
- Result stored in: `PhotoSession.rawAiResponse` via Data Connect
- Example words written to `UserWords` after kanji session saved

**Prompt:**
```
You are a Japanese kanji tutor for a conversational English speaker living in Japan.
Analyze this image and extract all kanji visible.

For each kanji return 5 example words commonly encountered in daily life in Japan
(shops, stations, restaurants, signage, packaging). Prioritize words the user
is likely to hear spoken AND see written — not textbook vocabulary.

Mark up to 3 kanji as recommended:true — choose the ones most worth learning
first based on how frequently they appear in everyday Japanese life.

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
]
```

### Call #2 — Text (quiz generation, `jobType = INITIAL`)

- **Function:** `generateQuizzes` (scheduled every 2 min)
- **Model:** Claude Sonnet (`claude-sonnet-4-20250514`) — highest quality for persistent quiz content
- Input: kanji character + readings + meanings from `KanjiMaster` via Data Connect
- Output: JSON array of exactly 5 quiz objects (one per `QuizType`)
- Result stored in: `QuizBank` (one row per quiz) + `QuizDistractor` (generation 1, trigger INITIAL) via Data Connect
- Claude API key: Firebase Function environment config only — never in Ktor or client

### Call #3 — Text (distractor regen, `jobType = REGEN`)

- **Function:** `regenDistractors` (scheduled daily)
- **Model:** Gemini 2.0 Flash — narrow well-defined task, cost efficient
- Input: existing quiz prompt + answer + previous distractor sets + current familiarity
- Output: JSON array of exactly 3 new distractors
- Result stored in: new `QuizDistractor` row (generation N+1, trigger from job) via Data Connect
- Old distractor sets are never deleted — retained for evaluation and prompt fine-tuning

---

## 11. Key Design Decisions

**Frequency rank over JLPT for seeding.** JLPT is an academic ranking. A kanji like 働 (work) is N3 but appears constantly on job ads and storefronts. kanjidic2 frequency rank is a better proxy for real-world encounter likelihood.

**Raw Claude response stored in DB.** Prevents re-billing if the user revisits a photo session.

**Background worker decouples capture from generation.** The photo capture moment is high motivation — the user must never wait. The worker runs async; the user is dismissed immediately.

**Type-gated familiarity ladder with weighted resurfacing.** Each familiarity level unlocks the next quiz type as focus. Previous types resurface with diminishing weight rather than disappearing. At familiarity 5, all types enter equal maintenance rotation.

**Slot-based sessions, no rollover.** Accumulated backlogs kill habits. The slot model limits daily exposure to the configured allowance and silently discards unused slots. No debt to repay.

**Slot counter starts on first answer.** The slot window opening does not start the clock. A user can open the app mid-slot and get a full session — fits irregular schedules.

**Quiz allowance is configurable.** Default of 5 per slot is conservative and sustainable. Users can increase it as habit solidifies. Changes take effect from the next slot.

**`fill_in_the_blank` input method resolved at serve time.** The quiz row is identical regardless of familiarity. The client receives `familiarity` and chooses the render path. Quiz rows never need regeneration.

**Claude not asked for readings on photo analysis.** Readings and meanings come from `KanjiMaster` via Data Connect. Claude is only asked for what it does uniquely well: recognizing kanji in images and knowing which words matter for daily life in Japan.

**No pre-seeded word dictionary.** `UserWords` grows organically from photo captures — words are guaranteed to be ones personally encountered in the wild. Claude's word selection in the photo prompt acts as the curation layer, choosing high-frequency daily-life words. This avoids the complexity of seeding and maintaining a separate word corpus while producing a more personally relevant vocabulary set.

**Compound word unlocking is derived, not tracked separately.** When a kanji is added to `UserKanji`, `UserWords.unlocked` is re-evaluated for all words containing that kanji. No separate unlock event or table needed — the state is always derivable from `UserKanji` membership.

**Milestone challenges are evaluative only.** Completing a challenge does not affect `user_kanji.familiarity` or `next_review`. They exist to stress-test retention across mature kanji and surface gaps, not to drive the daily queue. Score is stored in `challenge_sessions` for reflection.

**Distractors are versioned, never replaced.** Each regen produces a new `QuizDistractor` row rather than overwriting the old one. Old sets accumulate and are queryable for evaluation — this enables comparing distractor difficulty across generations and fine-tuning the regen prompt over time. Serve time always picks the most recent unserved set; if exhausted, falls back to the latest while a new set generates in the background.

**Regen triggers are milestone-first.** The primary trigger is a familiarity tier crossing — at each new tier, fresher and harder distractors are pedagogically appropriate. The secondary trigger (serve count + stale familiarity) catches edge cases where the user is stuck at a tier and has memorized the option landscape.

**Ktor modules never import from each other.** Each module imports only from `core/`. Firebase Functions are independently deployable with no shared code dependency on Ktor.

**Data Connect schema is the single source of truth.** No SQL migration files — the GraphQL schema in `dataconnect/schema/schema.gql` drives table generation. Changes are made in schema only.