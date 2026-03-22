# Kanji Learning App — Iteration Plan

_Photo-Driven Kanji Acquisition · Stack: React · Ktor · Firebase (Auth + Data Connect + Functions + Storage) · Gemini API_

---

## Overview

This app turns real-life kanji encounters in Japan into a structured, low-friction daily learning habit. The core loop: photograph a sign or notice → select kanji to learn → receive spaced-repetition quizzes across configurable daily time slots generated in the background by Gemini.

Designed for an erratic, contextual learner. Study effort is minimized at the capture moment (high motivation) and at the quiz moment (low friction, fits into any gap in the day).

### Iteration Order Rationale

| # | Scope | Why This Order |
|---|-------|----------------|
| 1 | Data Connect Schema + kanjidic2 Seed | Foundation — all iterations depend on this |
| 2 | Photo Analysis: Firebase Function + React UI | Core value proposition — capture → loading → results → selection in one flow |
| 3 | Background Quiz Generation (Firebase Function) | Async — decouples capture from study |
| 4 | React: Slot-Based Quiz UI | Closes the learning loop |
| 5 | Spaced Repetition Tuning + Personal Kanji List + Settings | Refinement after real usage data |

---

## Quiz Type Reference

### Taxonomy

**Word-level**

| Type | Prompt | Answer |
|------|--------|--------|
| `meaning_recall` | Kanji alone: `電` | Pick the English meaning |
| `reading_recognition` | Kanji compound: `電車` | Pick the correct furigana |
| `reverse_reading` | Furigana: `でんしゃ` | Pick the correct kanji compound |

**Sentence-level**

| Type | Prompt | Answer |
|------|--------|--------|
| `bold_word_meaning` | Full sentence with target word marked | Pick the meaning of the marked word |
| `fill_in_the_blank` | Gapped sentence: `次の＿＿は何時に来ますか？` | Pick or type the missing word |

### Familiarity Ladder — Type Gating

Each familiarity level unlocks a new quiz type as the current focus tier. Previous types resurface at reduced weight — they never disappear entirely.

| Familiarity | Current tier | What is being tested |
|-------------|--------------|----------------------|
| 0 | `meaning_recall` | Do you recognise what it means? |
| 1 | `reading_recognition` | Can you read it? |
| 2 | `reverse_reading` | Can you connect the sound to the character? |
| 3 | `bold_word_meaning` | Can you understand it in a sentence? |
| 4 | `fill_in_the_blank` (MC) | Can you use it in context? |
| 5 | `fill_in_the_blank` (free type) | Can you produce it from memory? |

### Resurfacing Weight Table

| Current familiarity | `meaning_recall` | `reading_recognition` | `reverse_reading` | `bold_word_meaning` | `fill_in_the_blank` |
|---------------------|------------------|-----------------------|-------------------|---------------------|---------------------|
| 0 | **70%** | 20% | 5% | 5% | 0% |
| 1 | 10% | **60%** | 20% | 5% | 5% |
| 2 | 5% | 15% | **60%** | 15% | 5% |
| 3 | 5% | 10% | 15% | **60%** | 10% |
| 4 | 5% | 10% | 10% | 15% | **60%** |
| 5 (maintenance) | 20% | 20% | 20% | 20% | **20%** |

### Input Method Progression

`fill_in_the_blank` input resolved at serve time from `familiarity`. Quiz rows never regenerated.

| Familiarity | Input |
|-------------|-------|
| 0–4 | Multiple choice (4 options) |
| 5 | Free text input |

All other types: always multiple choice, 3 distractors (4 options total).

### Quizzes Generated Per Kanji

| # | Type | Level |
|---|------|-------|
| 1 | `meaning_recall` | Word |
| 2 | `reading_recognition` | Word |
| 3 | `reverse_reading` | Word |
| 4 | `bold_word_meaning` | Sentence |
| 5 | `fill_in_the_blank` | Sentence |

---

# Iteration 1 — Data Connect Schema + kanjidic2 Seed

Establishes the data foundation. No UI, no API — just schema and seed data.

### 1.1 Database Schema (Data Connect GraphQL)

Schema defined in `dataconnect/schema/schema.gql`. Data Connect auto-generates PostgreSQL tables from these types — no SQL migrations needed.

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
```

**`KanjiMaster`** — seeded once from kanjidic2, read-only at runtime.

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

**`UserKanji`** — one row per kanji the user has interacted with. `currentTier` tracks the active focus type for the familiarity ladder.

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

**`PhotoSession`** — one row per photo. Raw AI response stored to avoid re-billing.

```graphql
type PhotoSession @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  imageUrl: String
  rawAiResponse: String
  createdAt: Timestamp! @default(expr: "request.time")
}
```

**`QuizGenerationJob`** — background job queue. `jobType` distinguishes initial generation from distractor regen.

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
  createdAt: Timestamp! @default(expr: "request.time")
}
```

**`QuizBank`** — stable question content. Distractors managed separately. Input method for `fill_in_the_blank` resolved at serve time.

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

**`QuizDistractor`** — one row per distractor set per quiz. Sets accumulate — old ones are never deleted.

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

**`QuizServe`** — full answer history, one row per quiz attempt.

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

**`QuizSlot`** — one row per slot window. `startedAt` null until first quiz answer.

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

**`UserSettings`** — configurable per-user preferences. One row per user.

```graphql
type UserSettings @table(key: "userId") {
  userId: String! @unique
  quizAllowancePerSlot: Int! @default(value: 5)
  slotDurationHours: Int! @default(value: 6)
  timezone: String! @default(value: "Asia/Tokyo")
  updatedAt: Timestamp! @default(expr: "request.time")
}
```

### 1.2 Field Mapping by Quiz Type

| Type | `prompt` | `target` | `furigana` | `answer` | `distractors` |
|------|----------|----------|------------|----------|---------------|
| `meaning_recall` | `電` | `電` | null | `"electricity"` | 3 other meanings |
| `reading_recognition` | `電車` | `電車` | null | `"でんしゃ"` | 3 wrong readings |
| `reverse_reading` | `でんしゃ` | `でんしゃ` | null | `"電車"` | 3 similar compounds |
| `bold_word_meaning` | full sentence | `"電車"` | `"でんしゃ"` | `"train"` | 3 plausible meanings |
| `fill_in_the_blank` | gapped sentence | `"電車"` | `"でんしゃ"` | `"電車"` | 3 plausible compounds |

### 1.3 kanjidic2 Seed Script

Python script (`scripts/seed.py`). JLPT level intentionally ignored — frequency rank is a better proxy for real-world encounter likelihood.

- Parse `kanjidic2.xml` with iterparse (file is ~60MB)
- Filter: `<freq>` exists and rank <= 1500
- Extract: `literal`, `on_reading`, `kun_reading`, `meaning` (lang=en), `freq`
- Batch insert via Data Connect `executeGraphql` endpoint (100 per batch)
- Same script targets local emulator or production via `--prod` flag

```bash
# Local emulator
python scripts/seed.py --file scripts/data/kanjidic2.xml --freq-limit 1500 --persist

# Production
python scripts/seed.py --file scripts/data/kanjidic2.xml --freq-limit 1500 --persist --prod

# Clear and re-seed
python scripts/seed.py --file scripts/data/kanjidic2.xml --freq-limit 1500 --clear-and-persist
```

> **Why 1500?** Covers daily life in Japan without pulling in obscure formal vocabulary. Adjust after real usage.

### Definition of Done

- [ ] All types created in `dataconnect/schema/schema.gql`
- [ ] `firebase emulators:start` succeeds with schema loaded
- [ ] Top 1500 kanji seeded into local emulator via `scripts/seed.py`
- [ ] Same script seeds production via `--prod` flag

---

# Iteration 2 — Photo Analysis: Firebase Function + React UI

Full capture-to-selection flow. Frontend uploads image to Cloud Storage, sends URL to Ktor. Ktor creates a PhotoSession, fires a Firebase Function async, and returns a session ID. Frontend polls for results. The Function calls Gemini 3.1 Pro for vision analysis.

### 2.1 Architecture

```
React (camera capture)
  → Upload image to Firebase Cloud Storage (photos/{userId}/{uuid}.jpg)
  → POST /api/photo/analyze { imageUrl } (Ktor)
    → Create PhotoSession in Data Connect
    → Fire-and-forget HTTP call to Firebase Function `analyze_photo`
    ← Return { sessionId, status: "processing" }

React (poll for results)
  → GET /api/photo/session/{id} (Ktor, every 2s)
    → Read PhotoSession from Data Connect
    ← Return { status: "processing" } or { status: "done", kanji: [...] }

Firebase Function `analyze_photo` (runs async):
  → Download image from Storage URL
  → Call Gemini 3.1 Pro vision API (thinking_level: MEDIUM)
  → Query KanjiMaster via Data Connect for enrichment
  → Update PhotoSession with enriched result + cost

React (results view → selection → done)
  → POST /api/kanji/session (Ktor)
    → Write UserKanji + enqueue QuizGenerationJob via Data Connect
```

### 2.2 Firebase Function: `analyze_photo`

Python HTTP-triggered function (`functions/main.py`). Called by Ktor fire-and-forget.

**Steps:**
1. Parse body: `{ imageUrl, userId, sessionId }`
2. Download image from Storage URL
3. Call Gemini 3.1 Pro (`gemini-3.1-pro-preview`) with vision + `thinking_level: MEDIUM`
4. Parse JSON response (uses `response_mime_type: "application/json"` for clean output)
5. Query `KanjiMaster` via Data Connect for each character — enrich with `onyomi`, `kunyomi`, `meanings`, `frequency`, `kanjiMasterId`
6. Update `PhotoSession` with enriched result JSON + `costMicrodollars`

**Enriched Result** (stored in `PhotoSession.rawAiResponse`, returned via poll):

```json
[
  {
    "kanjiMasterId": "uuid",
    "character": "電",
    "recommended": true,
    "whyUseful": "Core kanji for anything electric — trains, phones, appliances",
    "onyomi": ["でん"],
    "kunyomi": [],
    "meanings": ["electricity", "electric"],
    "frequency": 185,
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

Fields from Gemini: `character`, `recommended`, `whyUseful`, `exampleWords`
Fields from `KanjiMaster`: `kanjiMasterId`, `onyomi`, `kunyomi`, `meanings`, `frequency`

Kanji not found in `KanjiMaster` are still included (with null `kanjiMasterId` and empty readings/meanings) — the user may still want to mark them.

### 2.3 Gemini Prompt (Vision)

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

### 2.4 React UI Flow

Capture flow lives at `/capture` route. Three phases:

**Upload + Analyzing** — shown after camera capture while uploading to Storage and waiting for Function to complete.

- Full-screen dark background with animated indigo glow
- Spinning sparkles icon with circular progress indicator
- "Analyzing Capture" heading
- Status text: "Uploading photo..." → "AI is scanning image..."
- Frontend polls `GET /api/photo/session/{id}` every 2s

**Results View** — shown when poll returns `status: "done"`.

- PageHeader: "Found Kanji" + count detected, close (X) button
- Scrollable list of kanji cards (see 2.5)
- Sticky bottom "Done" button with gradient fade

**Done** — after tapping Done, selections saved via `POST /api/kanji/session`, user returns to home.

### 2.5 Kanji Result Card

Each card displays the enriched data:

```
┌─────────────────────────────────────┐
│                        ★ Recommended│  ← if recommended === true
│  ┌──────┐                           │
│  │      │  でん              ← onyomi (from KanjiMaster)
│  │  電  │  electricity       ← meanings[0] (from KanjiMaster)
│  │      │  ┌─────────────────┐      │
│  └──────┘  │ 電車 (train)    │      │  ← exampleWords[0] (from Gemini)
│            └─────────────────┘      │
│                                     │
│  [✓ Already Know]  [★ Want to Learn]│  ← toggles familiar/learning
└─────────────────────────────────────┘
```

### 2.6 POST /api/kanji/session

```json
{ "sessionId": "uuid", "selections": [{ "kanjiMasterId": "uuid", "status": "learning" }] }
```

- `learning` → insert `UserKanji` (familiarity 0, `currentTier = MEANING_RECALL`) + enqueue `QuizGenerationJob`
- `familiar` → insert `UserKanji` (status FAMILIAR), no job

### 2.7 Implementation Notes

- Gemini API key in Firebase Function environment config only — never exposed to client or Ktor
- Image uploaded to Cloud Storage by frontend, Function downloads via URL
- Enriched result stored in `PhotoSession.rawAiResponse` — avoids re-processing on poll
- Cost tracked in `PhotoSession.costMicrodollars` from Gemini usage metadata
- Gemini not asked for readings — `KanjiMaster` is the authoritative source
- Firebase Function uses Data Connect `executeGraphql` REST API for DB operations
- Ktor uses fire-and-forget pattern — does not await Function response

### Definition of Done

- [ ] Firebase Function `analyze_photo` deployed and callable
- [ ] `POST /api/photo/analyze` creates PhotoSession and fires Function async
- [ ] `GET /api/photo/session/{id}` returns enriched kanji when Function completes
- [ ] Camera capture works on mobile browser
- [ ] Image uploads to Cloud Storage successfully
- [ ] Loading view shows status text while polling
- [ ] Results view renders kanji cards with character, readings, meaning, example word
- [ ] Recommended badge shown on top-3 kanji
- [ ] Already Know / Want to Learn toggle works
- [ ] Done writes `UserKanji` rows and enqueues `QuizGenerationJob` rows
- [ ] `PhotoSession` row populated with enriched result + `costMicrodollars`
- [ ] Tested with a real photo end-to-end

### Pre-Deployment Checklist

**Local Testing:**
- [ ] `firebase emulators:start` succeeds with Auth, Data Connect, Functions, Storage
- [ ] `cd functions && pip install -r requirements.txt` installs without errors
- [ ] `cd backend && ./gradlew build` compiles without errors
- [ ] `cd frontend && npx tsc --noEmit` type-checks without errors
- [ ] KanjiMaster seed data present in Data Connect emulator
- [ ] `GEMINI_API_KEY` set in `functions/.env` (real key needed even with emulators)
- [ ] Create test user in Auth emulator UI (http://localhost:4000)
- [ ] Frontend login works against Auth emulator
- [ ] Camera capture opens on mobile browser
- [ ] Image uploads to Storage emulator successfully
- [ ] `POST /api/photo/analyze` returns sessionId immediately
- [ ] Function fires and completes (check Functions emulator logs)
- [ ] `GET /api/photo/session/{id}` returns enriched kanji after Function completes
- [ ] Kanji cards render correctly with character, readings, meaning, example word
- [ ] Selection toggles work (familiar / learning)
- [ ] Done saves UserKanji rows + QuizGenerationJob rows in Data Connect
- [ ] `costMicrodollars` populated on PhotoSession

**Production Deployment:**
- [ ] Firebase project on Blaze plan (required for Functions)
- [ ] `firebase deploy --only functions` succeeds
- [ ] `firebase deploy --only dataconnect` succeeds
- [ ] `firebase deploy --only storage` deploys storage rules
- [ ] Cloud Storage bucket exists and CORS configured for frontend domain
- [ ] `GEMINI_API_KEY` set via `firebase functions:secrets:set GEMINI_API_KEY`
- [ ] Backend deployed with production Firebase config (no emulator hosts)
- [ ] Frontend built with production env vars (no emulator hosts)
- [ ] End-to-end test: capture photo → see results → select kanji → verify DB writes

---

# Iteration 3 — Background Quiz Generation (Firebase Function)

Async, decoupled from photo flow. User never waits for this. Triggered by new `QuizGenerationJob` rows.

### 3.1 Trigger

Firebase scheduled function, runs every 2 minutes. Polls `QuizGenerationJob` for `status = PENDING`, processes up to 10 per cycle.

### 3.2 Status Transitions

| From | To | Condition |
|------|----|-----------|
| `PENDING` | `PROCESSING` | Worker picks up job |
| `PROCESSING` | `DONE` | All 5 quizzes saved |
| `PROCESSING` | `FAILED` | Exception thrown |
| `FAILED` | `PENDING` | `attempts < 3` |

### 3.3 Worker — Two Job Types

The worker handles both `INITIAL` and `REGEN` job types from the same queue:

- `INITIAL` — generates 5 quiz rows in `QuizBank` + 1 `QuizDistractor` row per quiz (generation 1, trigger INITIAL)
- `REGEN` — targets an existing `QuizBank` row, generates a new `QuizDistractor` row only (generation N+1, trigger from job)

### 3.4 Distractor Regen Cron (Daily)

A separate scheduled Firebase Function checks two trigger conditions daily and enqueues `REGEN` jobs.

**Key constraint — only regen quizzes that have actually been served.** A quiz with `servedCount = 0` has never been shown to the user, so its distractors are still fresh. Additionally, skip any quiz that already has an unserved `QuizDistractor` row waiting — no point generating a new set if the previous one hasn't been used yet.

```kotlin
fun checkRegenTriggers(userId: String, kanjiId: UUID, newFamiliarity: Int) {

    val eligibleQuizzes = quizBankRepo
        .findByKanji(userId, kanjiId)
        .filter { it.servedCount > 0 }                      // only served quizzes
        .filter { !quizDistractorRepo.hasUnserved(it.id) }  // no unused set waiting

    // Trigger 1 — tier crossing
    eligibleQuizzes.forEach { quiz ->
        jobRepo.enqueueRegen(quiz.id, trigger = "milestone")
    }

    // Trigger 2 — serve count threshold (daily cron, separate pass)
    eligibleQuizzes
        .filter { it.servedCount >= 10 }
        .forEach { quiz ->
            jobRepo.enqueueRegen(quiz.id, trigger = "serve_count")
        }
}
```

**Trigger 1 — Familiarity milestone:** when `currentTier` advances, enqueue regen for eligible quizzes of that kanji. Unserved higher-tier quizzes are skipped — they enter the regen cycle naturally once served.

**Trigger 2 — Serve count threshold:** when `QuizBank.servedCount >= 10`. Threshold is set at 10 rather than 5 because serve-time distractor augmentation already pulls random DB candidates each serve, providing meaningful variety. By serve 10 the stored Gemini distractors may start feeling familiar despite augmentation — a fresh set is warranted.

Old distractor sets are never deleted — they accumulate for evaluation.

### 3.5 Gemini Prompt (Initial Quiz Generation)

```
You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target kanji: {character}

Generate exactly 5 quizzes, one of each type below.
Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "quiz_type": "meaning_recall",
    "prompt": "電",
    "target": "電",
    "furigana": null,
    "answer": "electricity",
    "distractors": ["iron", "east", "express"],
    "explanation": "電 is the root of 電車 (train), 電話 (phone), 電気 (electricity)"
  },
  {
    "quiz_type": "reading_recognition",
    "prompt": "電車",
    "target": "電車",
    "furigana": null,
    "answer": "でんしゃ",
    "distractors": ["てっどう", "きゅうこう", "ちかてつ"],
    "explanation": "でん (on-yomi of 電) + しゃ (on-yomi of 車)"
  },
  {
    "quiz_type": "reverse_reading",
    "prompt": "でんしゃ",
    "target": "でんしゃ",
    "furigana": null,
    "answer": "電車",
    "distractors": ["電話", "電気", "電池"],
    "explanation": "電車 — the kanji for electricity + vehicle"
  },
  {
    "quiz_type": "bold_word_meaning",
    "prompt": "電車、遅れてるじゃん。",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "train",
    "distractors": ["bus", "taxi", "subway"],
    "explanation": "電車 literally means electric vehicle — the standard word for train"
  },
  {
    "quiz_type": "fill_in_the_blank",
    "prompt": "＿＿乗り換えどこだっけ？",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "電車",
    "distractors": ["急行", "地下鉄", "バス停"],
    "explanation": "電車 fits here — asking where to transfer trains"
  }
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
- furigana is null for word-level types; always a string for sentence-level
```

### Definition of Done

- [ ] Scheduled Firebase Function runs every 2 minutes
- [ ] Processes up to 10 jobs per cycle
- [ ] Status transitions correctly
- [ ] Failed jobs with `attempts < 3` retried
- [ ] Exactly 5 quizzes per job in `QuizBank` (initial jobs)
- [ ] 1 `QuizDistractor` row per quiz created with generation=1, trigger=INITIAL
- [ ] Regen jobs create new `QuizDistractor` rows without modifying `QuizBank`
- [ ] Daily cron enqueues regen jobs for milestone + serve count triggers
- [ ] Verified end-to-end: photo → selection → wait 2 min → 5 QuizBank rows + 5 QuizDistractor rows

---

# Iteration 4 — React: Slot-Based Quiz UI

The daily habit side of the loop. Rolling session windows, no score pressure, no rollover backlog.

### 4.1 Slot System (Ktor: GET /api/quiz/slot)

Slots are **rolling windows** anchored to your first answer — not fixed clock boundaries. Duration configurable in `UserSettings` (default 6 hours).

```
First answer at 1am  → slot active 01:00–06:59
Slot expires at 07:00, no new slot opens

Next answer at 11am  → slot active 11:00–16:59
Slot expires at 17:00, no new slot opens
```

**Lifecycle:**
- No `QuizSlot` row exists until the first `POST /api/quiz/result`
- `GET /api/quiz/slot` checks for an active slot (`slotEnd > now()`):
    - Active slot found → return remaining quizzes from that slot
    - No active slot → return preview batch using same selection logic (no slot row created yet)
- `POST /api/quiz/result` (first answer):
    - Creates `QuizSlot` row: `slotStart = now()`, `slotEnd = now() + slotDurationHours`
    - Subsequent answers in same slot → increment `completed` as normal
- Slot expired → next `GET /api/quiz/slot` returns preview batch again, waiting for next first answer

**No rollover** — expired slots are silently abandoned. No debt to repay.

**Response:**
```json
{
  "quizzes": [
    {
      "id": "uuid",
      "quizType": "FILL_IN_THE_BLANK",
      "prompt": "＿＿乗り換えどこだっけ？",
      "target": "電車",
      "furigana": "でんしゃ",
      "answer": "電車",
      "options": ["電車", "急行", "地下鉄", "バス停"],
      "explanation": "電車 fits here — asking where to transfer trains",
      "familiarity": 1,
      "currentTier": "READING_RECOGNITION"
    }
  ],
  "remaining": 4,
  "slotEndsAt": "2026-03-23T07:00:00+09:00",
  "nextSlotAt": null
}
```

> `nextSlotAt` is always `null` — the next slot opens whenever you next answer a quiz, not at a fixed time.

### 4.2 Quiz Selection Priority

| Priority | Source | Cap |
|----------|--------|-----|
| 1 | Overdue current-tier (`nextReview < now()`) | Up to 60% of allowance |
| 2 | New kanji, never served | Up to 20% of allowance |
| 3 | Resurfaced lower-tier (weighted by familiarity table) | Remainder |

For each selected quiz, `QuizService` resolves the distractor set and augments with random DB candidates:

- Find latest `QuizDistractor` row where `servedAt is null`
- If none available: fall back to latest set + enqueue regen job in background
- Augment stored distractors with random candidates from DB (see below)
- Mark `QuizDistractor.servedAt` when quiz is returned to client

**Serve-time distractor augmentation** — options are never the same 4 every serve:

```kotlin
fun resolveOptions(quiz: QuizBank, distractorSet: QuizDistractor, userId: String): List<String> {
    val stored = distractorSet.distractors
    val random = fetchRandomCandidates(
        quizType = quiz.quizType,
        answer = quiz.answer,
        userId = userId,
        exclude = listOf(quiz.answer) + stored,
        limit = 5
    )
    val pool = (stored + random).shuffled()
    val picked = pool.take(3)
    return (picked + quiz.answer).shuffled()
}
```

Random candidate sources by quiz type:

| Quiz type | Random pool |
|-----------|-------------|
| `meaning_recall` | `KanjiMaster.meanings` of other kanji |
| `reading_recognition` | `KanjiMaster.onyomi` / `kunyomi` of other kanji |
| `reverse_reading` | `KanjiMaster.character` at similar frequency |
| `bold_word_meaning` | `KanjiMaster.meanings` from user's learning set |
| `fill_in_the_blank` | `UserWords.word` — words the user has personally encountered |

### 4.3 Quiz Card UI — Per Type

**`meaning_recall`** — Large kanji. 4 meaning options. Furigana revealed on answer.

**`reading_recognition`** — Kanji/compound large. 4 furigana options.

**`reverse_reading`** — Furigana large. 4 kanji compound options.

**`bold_word_meaning`** — Sentence with target bolded. Furigana below. 4 meaning options.

**`fill_in_the_blank`** — Sentence with `＿＿` gap:
- familiarity 0–4 → 4 MC options
- familiarity 5 → free text input

All cards: reveal answer → show correct/incorrect + explanation. Slot complete → summary screen with next session prompt.

### 4.4 POST /api/quiz/result

```json
{ "quizId": "uuid", "correct": true }
```

- First call with no active slot: creates `QuizSlot` (`slotStart = now()`, `slotEnd = now() + slotDurationHours`)
- Increments `QuizSlot.completed` and `QuizBank.servedCount`
- Marks `QuizDistractor.servedAt` for the set that was used
- Inserts `QuizServe` row (quiz, distractorSet, slot, correct, familiarityAtServe)
- Correct + current-tier: `familiarity + 1`, advance `currentTier`
- Correct + resurfaced: update `nextReview` only
- Incorrect: `familiarity - 1` (min 0), `nextReview = tomorrow`, regress `currentTier` if needed

**`nextReview` calculation:**

Increment familiarity first, then calculate `nextReview` from the new value. A ±15% jitter is applied to prevent reviews bunching on the same day and to stop the schedule feeling predictable.

```kotlin
fun nextReview(familiarity: Int, correct: Boolean): Instant {
  if (!correct) return now().plusDays(1)

  val baseDays = when (familiarity) {
    0 -> 1
    1 -> 2
    2 -> 4
    3 -> 7
    4 -> 12
    else -> 18
  }
  val maxJitter = (baseDays * 0.15).toInt().coerceAtLeast(1)
  val jitter = Random.nextInt(-maxJitter, maxJitter + 1)
  return now().plusDays((baseDays + jitter).coerceAtLeast(1).toLong())
}
```

Effective ranges after jitter:

| New familiarity | Base | Range |
|-----------------|------|-------|
| 0 | 1 day | 1 day (no jitter below 1) |
| 1 | 2 days | 1–3 days |
| 2 | 4 days | 3–5 days |
| 3 | 7 days | 6–8 days |
| 4 | 14 days | 12–16 days |
| 5 | 30 days | 25–35 days |

Incorrect answer: always `now + 1 day`, no jitter applied.

### Definition of Done

- [ ] `GET /api/quiz/slot` returns preview batch when no active slot exists
- [ ] `GET /api/quiz/slot` returns remaining quizzes when active slot exists
- [ ] `QuizSlot` row created on first `POST /api/quiz/result`, not on GET
- [ ] `slotStart = now()`, `slotEnd = now() + slotDurationHours` set at first answer
- [ ] Expired slot returns preview batch on next GET — no `nextSlotAt` in response
- [ ] Selection respects priority order and caps
- [ ] Current-tier gating applied per `UserKanji.currentTier`
- [ ] Serve-time distractor augmentation returns different option sets across serves
- [ ] All 5 card types render correctly
- [ ] `fill_in_the_blank` MC for familiarity 0–4, free type for 5
- [ ] `POST /api/quiz/result` updates `familiarity`, `currentTier`, `nextReview`
- [ ] `QuizServe` row inserted on every answer
- [ ] `QuizBank.servedCount` incremented on every serve
- [ ] `QuizDistractor.servedAt` marked on the used distractor set
- [ ] Summary screen shown after slot complete

---

# Iteration 5 — Tuning + Personal Kanji List + Settings

Adds visibility, manual control, and settings after real usage data.

### 5.1 Personal Kanji List

- All `UserKanji` grouped by status: learning / familiar
- Familiarity dots (0–5) + current tier label + next review date
- Tap → detail view: quiz types, answer history, current resurfacing weights
- Familiar → learning promotion via tap

### 5.2 Manual Kanji Add

Search `KanjiMaster` by character → add as familiar or learning. Covers kanji encountered without a photo.

### 5.3 Progress Indicators

- Current slot: quizzes remaining + time to next slot
- Daily streak (slots with ≥1 answer)
- Total kanji: learning vs familiar

### 5.4 Settings Screen

Wired to `PUT /api/settings`. Changes take effect from next slot.

| Setting | Input | Default |
|---------|-------|---------|
| `quizAllowancePerSlot` | Number input | 5 |
| `slotDurationHours` | Selector: 3 / 6 / 8 / 12 | 6 |

### 5.5 SM-2 Interval Review

After 2 weeks of real usage:
- Too many quizzes pile up same day → spread intervals
- Familiarity 5 reappears too often → extend 30-day cap
- Forgotten kanji reset too aggressively → soften decrement

### Definition of Done

- [ ] Kanji list shows status, familiarity, tier, next review
- [ ] Manual add works via `KanjiMaster` search
- [ ] Settings screen wired to `PUT /api/settings`
- [ ] Slot queue + streak visible on home screen
- [ ] SM-2 intervals reviewed after 2 weeks

---

# Appendix — Architecture Reference

### Stack

| Layer | Technology | Role |
|-------|------------|------|
| Frontend | React | Photo capture, kanji selection, quiz UI |
| Backend | Ktor (Kotlin) | API gateway, slot engine, session management |
| Auth | Firebase Auth | User authentication, ID tokens |
| Database | Firebase Data Connect | PostgreSQL via GraphQL schema |
| Storage | Firebase Cloud Storage | Photo uploads from client |
| Functions | Firebase Functions (Python) | Gemini API calls (photo analysis, quiz generation) |
| AI | Gemini 3.1 Pro (`gemini-3.1-pro-preview`) | Vision extraction + quiz generation |
| Seed Data | kanjidic2 (edrdg.org) | Top 1500 kanji by frequency |

### Request Flow Summary

- **Call #1 (photo)** — Frontend uploads to Storage → Ktor creates session → Firebase Function → Gemini vision → enrich from KanjiMaster → frontend polls → user selection → DB write + jobs enqueued
- **Call #2 (background)** — Firebase scheduled function → Gemini text → 5 quizzes per kanji → `QuizBank`
- **Slot quiz** — Ktor slot engine → tier-gated priority selection + weighted resurfacing → familiarity + tier update

### Key Design Decisions

- Gemini API key in Firebase Functions only — never exposed to client or Ktor
- Image uploaded to Cloud Storage by frontend, Function downloads via URL
- Enriched result stored in DB — no re-processing on poll, no re-billing on revisit
- Cost tracked in `costMicrodollars` (Int64) from Gemini usage metadata
- Background worker decouples capture (high motivation) from generation (slow)
- Type-gated ladder with resurfacing — previous types never disappear, just become rare
- No rollover — missed slots expire quietly, no backlog anxiety
- Slot counter starts on first answer — fits irregular schedules
- Quiz allowance configurable — default 5 is conservative, increase as habit solidifies
- `fill_in_the_blank` input resolved at serve time — quiz rows never regenerated
- Gemini not asked for readings on photo — `KanjiMaster` is authoritative source
- Ktor uses fire-and-forget pattern for Function calls — frontend polls for results
- Distractors versioned, never replaced — old sets retained for evaluation and prompt fine-tuning
- Regen triggers are milestone-first (tier crossing) with serve count as secondary safety net
- `QuizServe` provides full answer history per distractor set — foundation for future prompt optimization
- Modules never import from each other — only from `core/`
- Data Connect schema is the single source of truth — no SQL migrations

---

# Iteration 6 — Challenge Sessions (Consolidation + Maturity)

Two types of challenge session that sit outside the daily slot queue. Both are triggered automatically, sit pending until the user starts them, never expire, and do not count against slot allowance.

| | Consolidation | Maturity |
|---|---|---|
| Trigger | 5 kanji cross familiarity 2 or 4 within 7 days | Every 10 kanji reach familiarity 5 |
| Quiz pool | `meaning_recall` + `reading_recognition` from QuizBank | Gemini-generated multi-kanji sentences |
| Length | Up to 10 questions (2 types × 5 kanji) | 5 questions |
| Affects familiarity? | Yes — wrong answer → familiarity -1 on that kanji | No — purely evaluative |
| Tone | Checkpoint — real gate before progressing | Celebration — showcase of how far you've come |

---

## 6.1 Schema Updates

Add `ChallengeType` and `ConsolidationTier` enums plus update `ChallengeSession` in `dataconnect/schema/schema.gql`:

```graphql
enum ChallengeType { CONSOLIDATION, MATURITY }
enum ConsolidationTier { FAMILIARITY_2, FAMILIARITY_4 }

type ChallengeSession @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  type: ChallengeType!
  tier: ConsolidationTier          # CONSOLIDATION only — which familiarity level triggered it
  milestone: Int                   # MATURITY only — mature kanji count at trigger (10, 20, 30...)
  kanjiIds: [UUID!]!               # kanji involved in this challenge
  quizOrder: [UUID!]!              # pre-computed interleaved QuizBank IDs (CONSOLIDATION)
  generatedQuestions: String       # JSON — Gemini sentences (MATURITY only)
  triggeredAt: Timestamp!
  completedAt: Timestamp
  score: Int                       # correct out of total
  affectsFamiliarity: Boolean!     # true for CONSOLIDATION, false for MATURITY
}
```

> `quizOrder` stores the pre-computed interleaved sequence so the order is consistent if the user starts, exits, and returns mid-challenge.

---

## 6.2 Trigger Logic

Both triggers fire inside `POST /api/quiz/result` after updating `familiarity` and `currentTier`. Called in this order:

```kotlin
// POST /api/quiz/result — after SM-2 update
checkConsolidationTrigger(userId, newFamiliarity)   // fires at 2 and 4
checkMaturityTrigger(userId, newFamiliarity)         // fires at 5
checkRegenTriggers()                                 // existing — distractor regen
```

**Priority when multiple challenges pending:** `CONSOLIDATION (tier 2)` → `CONSOLIDATION (tier 4)` → `MATURITY`. Consolidation shown first because it affects familiarity progression — better to consolidate before stress-testing.

### Consolidation Trigger

```kotlin
val CONSOLIDATION_TRIGGERS = listOf(2, 4)

fun checkConsolidationTrigger(userId: String, newFamiliarity: Int) {
    if (newFamiliarity !in CONSOLIDATION_TRIGGERS) return

    val recentKanji = userKanjiRepo.findRecentlyReachedFamiliarity(
        userId = userId,
        familiarity = newFamiliarity,
        withinDays = 7,
        excludeAlreadyChallenged = true   // not already used in a CONSOLIDATION session at this tier
    )

    if (recentKanji.size >= 5) {
        val group = recentKanji.takeLast(5)   // 5 most recent
        val quizOrder = buildInterleavedOrder(group, familiarity = newFamiliarity)
        challengeRepo.createConsolidation(
            userId = userId,
            kanjiIds = group.map { it.id },
            quizOrder = quizOrder,
            tier = if (newFamiliarity == 2) ConsolidationTier.FAMILIARITY_2 else ConsolidationTier.FAMILIARITY_4
        )
    }
}
```

### Maturity Trigger

```kotlin
fun checkMaturityTrigger(userId: String, newFamiliarity: Int) {
    if (newFamiliarity != 5) return

    val matureCount = userKanjiRepo.countByFamiliarity(userId, familiarity = 5)
    val lastMilestone = challengeRepo.lastMaturityMilestone(userId) ?: 0

    if (matureCount >= lastMilestone + 10) {
        val matureKanji = userKanjiRepo.findByFamiliarity(userId, familiarity = 5)
        val unlockedWords = userWordsRepo.findUnlocked(userId)

        challengeRepo.createMaturity(
            userId = userId,
            milestone = matureCount,
            kanjiIds = matureKanji.map { it.id }
        )
        // fire-and-forget to Firebase Function to generate questions
        firebaseFunction.call("generate_challenge", mapOf(
            "userId" to userId,
            "matureKanji" to matureKanji.map { it.character },
            "unlockedWords" to unlockedWords.map { it.word },
            "challengeSessionId" to newSessionId
        ))
    }
}
```

---

## 6.3 Consolidation — Interleaving Mechanism

Quiz types selected: `meaning_recall` + `reading_recognition` only — the two lowest tiers. These are the foundation skills being cemented before the kanji progresses further.

**Ordering — spaced interleave by type:**

All `meaning_recall` quizzes first (random kanji order within), then all `reading_recognition` quizzes (different random kanji order). Same cognitive skill across varied stimuli — the most effective interleaving pattern for discrimination learning.

```
Round 1 — meaning_recall (5 quizzes, random kanji order):
  東 → 急 → 電 → 京 → 車

Round 2 — reading_recognition (5 quizzes, different random order):
  車 → 電 → 京 → 東 → 急
```

```kotlin
fun buildInterleavedOrder(kanji: List<UserKanji>, familiarity: Int): List<UUID> {
    val quizTypes = listOf(QuizType.MEANING_RECALL, QuizType.READING_RECOGNITION)

    return quizTypes.flatMap { type ->
        val quizzes = quizBankRepo.findByKanjiIdsAndType(
            kanjiIds = kanji.map { it.kanjiId },
            quizType = type
        )
        quizzes.shuffled().map { it.id }
    }
}
```

**Familiarity effect during consolidation:**

- Correct answer → no familiarity change, `nextReview` refreshed (same as resurfaced quiz in daily slot)
- Wrong answer → `familiarity - 1` on that specific kanji, `nextReview = tomorrow`
  - This pushes the kanji back below the consolidation threshold
  - It re-enters the daily slot queue, progresses naturally back to familiarity 2 or 4
  - When enough kanji group up again, a new consolidation triggers automatically

---

## 6.4 Maturity Challenge — Gemini Generation

Triggered async at the moment the 10th (20th, 30th...) kanji reaches familiarity 5. Questions are generated by Firebase Function `generate_challenge` and stored in `ChallengeSession.generatedQuestions` before the user opens the challenge. No Gemini call at open time.

**Gemini Prompt:**

```
You are generating a celebration challenge for a Japanese learner living in Japan.
They have mastered these kanji: {matureKanji}
They have also encountered these compound words: {unlockedWords}

Generate exactly 5 challenge questions. Each question is a casual Japanese sentence
containing at least 2 kanji from the mastered list. The learner must read the sentence
and provide the full English meaning.

This is a celebration — sentences should feel rewarding to read, like something
they would actually encounter in daily life in Japan.

Rules:
- Each sentence must use at least 2 kanji from the mastered list
- Use compound words from their list where natural
- Casual spoken Japanese only — no keigo, no ます/です
- No furigana anywhere — full recall required
- Sentences should reflect real daily life: trains, shops, restaurants, weather, friends
- Answer is the full English meaning of the sentence
- Explanation highlights which kanji appeared and why the sentence works

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "prompt": "駅で急行待ってたら電車止まっちゃった。",
    "targetKanji": ["急行", "電車"],
    "answer": "I was waiting for the express at the station and the train stopped.",
    "explanation": "急行 (express) + 電車 (train) — both learned kanji in a real station scenario"
  }
]
```

**Response stored in `ChallengeSession.generatedQuestions`** as a JSON string. Parsed at open time by the frontend.

---

## 6.5 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/challenge/pending` | Returns pending challenge if any, with type and metadata |
| `GET` | `/api/challenge/{id}` | Returns full challenge — quizzes or generated questions |
| `POST` | `/api/challenge/{id}/result` | Submit one answer — updates familiarity if CONSOLIDATION |
| `POST` | `/api/challenge/{id}/complete` | Mark challenge done, store final score |

**GET /api/challenge/pending response:**

```json
{
  "challenge": {
    "id": "uuid",
    "type": "CONSOLIDATION",
    "tier": "FAMILIARITY_2",
    "kanjiCount": 5,
    "questionCount": 10,
    "triggeredAt": "2026-03-23T..."
  }
}
```

Returns `{ "challenge": null }` when nothing pending.

**POST /api/challenge/{id}/result:**

```json
{ "quizId": "uuid", "correct": true }
```

- CONSOLIDATION + wrong answer → `familiarity - 1` on the kanji, `nextReview = tomorrow`
- CONSOLIDATION + correct answer → `nextReview` refreshed, no familiarity change
- MATURITY → no familiarity effect either direction

---

## 6.6 React UI

**Home screen badge** — shown when a pending challenge exists. Priority order determines which badge shows if multiple are pending.

```
┌─────────────────────────────────────┐
│  ⚡ Consolidation Ready             │
│  5 kanji to review · 10 questions   │
│  [ Start Challenge ]                │
└─────────────────────────────────────┘
```

For maturity:
```
┌─────────────────────────────────────┐
│  🎉 10 Kanji Mastered!              │
│  Your celebration challenge awaits  │
│  [ Take Challenge ]                 │
└─────────────────────────────────────┘
```

**Challenge screen** — separate from quiz slot UI, same card components:

- CONSOLIDATION: standard quiz cards (meaning_recall + reading_recognition) in pre-computed order
- MATURITY: sentence card only — full Japanese sentence, user types English meaning
- Both: progress bar, no timer, exit allowed at any time (progress saved via answered questions)
- Summary on completion: score breakdown per kanji, which ones were knocked back (CONSOLIDATION)

**Exit and resume** — `quizOrder` stores the full pre-computed sequence. Progress tracked by counting completed `ChallengeQuizServe` rows. Resuming picks up from where the user left off.

---

## 6.7 ChallengeQuizServe

Separate from daily `QuizServe` to keep challenge answer history distinct:

```graphql
type ChallengeQuizServe @table {
  id: UUID! @default(expr: "uuidV4()")
  challengeSession: ChallengeSession!
  userId: String!
  quizId: UUID                     # QuizBank ID (CONSOLIDATION) or null (MATURITY)
  questionIndex: Int!              # position in challenge (0–9)
  correct: Boolean!
  answeredAt: Timestamp! @default(expr: "request.time")
}
```

---

## 6.8 Firebase Function: `generate_challenge`

HTTP trigger, called fire-and-forget from Ktor when a maturity challenge is created.

```python
# functions/main.py — add to existing file

@https_fn.on_request()
def generate_challenge(req: https_fn.Request) -> https_fn.Response:
    data = req.get_json()
    session_id = data["challengeSessionId"]
    mature_kanji = data["matureKanji"]        # ["電", "車", "東", ...]
    unlocked_words = data["unlockedWords"]    # ["電車", "急行", ...]

    prompt = build_challenge_prompt(mature_kanji, unlocked_words)

    response = gemini_client.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"}
    )

    questions_json = response.text
    cost = extract_cost(response.usage_metadata)

    # Update ChallengeSession via Data Connect
    data_connect.update_challenge_session(
        session_id=session_id,
        generated_questions=questions_json,
        cost_microdollars=cost
    )

    return https_fn.Response("ok", status=200)
```

---

## Definition of Done

- [ ] `ChallengeType`, `ConsolidationTier` enums added to schema
- [ ] `ChallengeSession` updated with `tier`, `quizOrder`, `generatedQuestions`, `affectsFamiliarity`
- [ ] `ChallengeQuizServe` table added to schema
- [ ] `checkConsolidationTrigger` fires at familiarity 2 and 4 crossings in `POST /api/quiz/result`
- [ ] `checkMaturityTrigger` fires at every 10th familiarity 5 crossing
- [ ] Consolidation quiz order uses spaced interleave (all meaning_recall then all reading_recognition, each round shuffled independently)
- [ ] Consolidation wrong answer knocks familiarity -1 and sets nextReview = tomorrow
- [ ] Consolidation correct answer refreshes nextReview only — no familiarity change
- [ ] Maturity challenge questions generated by `generate_challenge` Firebase Function (fire-and-forget)
- [ ] Maturity challenge stored in `ChallengeSession.generatedQuestions` before user opens it
- [ ] Maturity challenge has no familiarity effect either direction
- [ ] `GET /api/challenge/pending` returns correct priority ordering
- [ ] Challenge UI separate from daily slot — does not consume slot allowance
- [ ] Exit and resume works — progress saved via `ChallengeQuizServe` rows
- [ ] Home screen badge shows correct challenge type with appropriate tone (checkpoint vs celebration)
- [ ] Summary screen shows per-kanji breakdown after completion
- [ ] Score stored in `ChallengeSession.score`