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

# Iteration 3.5 — Schema Migration + Word-Centric Model

Migrates quiz tracking from kanji-level to word-level. No new UI. After this iteration, quizzes are generated and tracked per word, and kanji familiarity is computed from word familiarities.

### Why before iteration 4

Iteration 4 (quiz UI) reads `QuizBank` rows and updates familiarity on answer. If those rows still reference kanji instead of words, the quiz UI would be built on the wrong model and need rework. Better to migrate the data layer cleanly first.

---

## 3.5.1 Schema Changes

### UserWords — add familiarity tracking

`UserWords` gains the familiarity fields previously on `UserKanji`. This is the primary tracking unit going forward.

```graphql
type UserWords @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  word: String!
  reading: String!
  meaning: String!
  kanjiIds: [UUID!]!
  source: WordSource! @default(value: "PHOTO")

  # NEW — moved from UserKanji, now tracked per word
  familiarity: Int! @default(value: 0)
  currentTier: QuizType! @default(value: "MEANING_RECALL")
  nextReview: Timestamp

  # NEW — which kanji triggered word discovery (for debugging)
  discoveredViaKanjiId: UUID

  unlocked: Boolean! @default(value: false)
  createdAt: Timestamp! @default(expr: "request.time")

  # Unique constraint — one row per word per user
  # enforced via application logic on insert
}
```

### UserKanji — familiarity becomes computed

`familiarity` and `currentTier` on `UserKanji` are now **derived** from the word-level scores. They are kept as cached fields (not removed) but recalculated whenever a `UserWords.familiarity` changes for a word that contains this kanji.

```graphql
type UserKanji @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!
  status: UserKanjiStatus!
  familiarity: Int! @default(value: 0)       # cached — derived from UserWords
  currentTier: QuizType! @default(value: "MEANING_RECALL")  # cached
  nextReview: Timestamp                       # earliest nextReview across its words
  sourcePhotoId: UUID
  createdAt: Timestamp! @default(expr: "request.time")
}
```

**Derivation rule — minimum of top 3 words:**

```kotlin
fun computeKanjiFamiliarity(words: List<UserWord>): Int {
    if (words.isEmpty()) return 0
    if (words.size < 3) return words.minOf { it.familiarity }
    return words.sortedByDescending { it.familiarity }
        .take(3)
        .minOf { it.familiarity }
}
```

You need breadth, not just one well-known word. Familiarity only advances when at least 3 words are solid.

`UserKanji.nextReview` = earliest `nextReview` across all its `UserWords` — so the kanji surfaces for review as soon as any of its words is due.

### QuizBank — add word reference

`QuizBank` gains a `word` reference alongside `kanji`. The `kanji` reference is kept for grouping and regen triggers.

```graphql
type QuizBank @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!       # kept — for grouping, regen triggers
  word: UserWords!          # NEW — the specific word this quiz is about
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

### QuizGenerationJob — add word reference

```graphql
type QuizGenerationJob @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!
  word: UserWords            # NEW — the word to generate quizzes for
  quiz: QuizBank
  jobType: JobType! @default(value: "INITIAL")
  trigger: String
  status: JobStatus! @default(value: "PENDING")
  attempts: Int! @default(value: 0)
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### QuizServe — reference word familiarity

```graphql
type QuizServe @table {
  id: UUID! @default(expr: "uuidV4()")
  quiz: QuizBank!
  distractorSet: QuizDistractor!
  slot: QuizSlot!
  userId: String!
  wordFamiliarityAtServe: Int!    # renamed from familiarityAtServe — now word-level
  correct: Boolean!
  answeredAt: Timestamp! @default(expr: "request.time")
}
```

---

## 3.5.2 Quiz Generation — Per Word, Not Per Kanji

**Old:** 1 `QuizGenerationJob` per kanji → 5 quizzes referencing that kanji

**New:** 1 `QuizGenerationJob` per word → 5 quizzes referencing that word

When a kanji is added to `UserKanji` (via `POST /api/kanji/session`), the system now enqueues one job per word, not one job per kanji:

```kotlin
// In KanjiService, after saving UserKanji
fun enqueueQuizJobs(userId: String, kanjiId: UUID, words: List<UserWord>) {
    words.forEach { word ->
        // Deduplication — check if QuizBank already has quizzes for this word
        val existing = quizBankRepo.findByWord(userId, word.id)
        if (existing.isEmpty()) {
            jobRepo.enqueue(
                userId = userId,
                kanjiId = kanjiId,
                wordId = word.id,
                jobType = JobType.INITIAL
            )
        }
        // If quizzes already exist (word shared with another kanji) — reuse them, no new job
    }
}
```

**Deduplication is key:** if 電話 already has quizzes in `QuizBank` (generated when 電 was learned), and now 話 is being learned, no new job is enqueued for 電話. The existing quiz rows are reused.

### Updated Gemini prompt — per word

The prompt changes from "generate quizzes for this kanji" to "generate quizzes for this word":

```
You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target word: {word} ({reading}) — meaning: {meaning}
This word contains these kanji: {kanjiList}

Generate exactly 5 quizzes, one of each type below.
Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "quiz_type": "meaning_recall",
    "prompt": "電車",
    "target": "電車",
    "furigana": null,
    "answer": "train",
    "distractors": ["phone call", "electricity", "battery"],
    "explanation": "電車 — 電 (electric) + 車 (vehicle) = electric vehicle = train"
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
- Avoid: keigo (polite forms), formal written style, news language、〜ます／〜です endings
- bold_word_meaning and fill_in_the_blank must use completely different sentences —
  never the same sentence with the target word swapped for ＿＿
- Distractors must be plausible — never obviously wrong
- Explanations brief and memorable, not academic
- furigana is null for word-level types; always a string for sentence-level
```

---

## 3.5.3 Word Discovery — Fresh Words for Shared Kanji

When a kanji is added and most of its example words are already familiar, fetch additional words from Gemini so the user gets fresh vocabulary to learn.

**Trigger condition** — checked in `POST /api/kanji/session` after saving `UserWords`:

```kotlin
fun checkWordDiscovery(userId: String, kanjiId: UUID, exampleWords: List<UserWord>) {
    val alreadyFamiliar = exampleWords.count { word ->
        userWordsRepo.findByWordAndUser(userId, word.word)
            ?.familiarity?.let { it >= 3 } ?: false
    }

    // If 3 or more of the 5 example words are already familiar → discover fresh ones
    if (alreadyFamiliar >= 3) {
        val knownWords = exampleWords.map { it.word }
        firebaseFunction.call("discover_words", mapOf(
            "userId" to userId,
            "kanjiId" to kanjiId,
            "character" to kanjiCharacter,
            "knownWords" to knownWords
        ))
    }
}
```

**Firebase Function: `discover_words`** — Gemini 3.0 Flash (cheap, narrow task):

```python
@https_fn.on_request()
def discover_words(req: https_fn.Request) -> https_fn.Response:
    data = req.get_json()
    character = data["character"]
    known_words = data["knownWords"]   # words to exclude

    prompt = f"""
The learner is studying the kanji: {character}
They already know these words well: {、".join(known_words)}

Suggest 5 more common daily-life words containing {character} that are
NOT in the known list. Words the learner is likely to encounter in Japan.

Return ONLY a valid JSON array — no markdown, no preamble:
[
  {{ "word": "会話", "reading": "かいわ", "meaning": "conversation" }}
]
"""
    response = gemini_client.generate_content(
        prompt,
        generation_config={{"response_mime_type": "application/json"}}
    )

    new_words = json.loads(response.text)

    # Insert into UserWords + enqueue QuizGenerationJobs for each
    for w in new_words:
        insert_user_word(data["userId"], w, source="DISCOVERY",
                        discovered_via_kanji_id=data["kanjiId"])
        enqueue_quiz_job(data["userId"], data["kanjiId"], word=w)

    return https_fn.Response("ok", status=200)
```

Add `DISCOVERY` to the `WordSource` enum:

```graphql
enum WordSource { PHOTO, QUIZ, CHALLENGE, DISCOVERY }
```

---

## 3.5.4 Familiarity Attribution on Quiz Answer

When a quiz answer is submitted, familiarity advances on the **word**, and kanji familiarity is recomputed from the updated word set.

```kotlin
fun handleQuizResult(userId: String, quizId: UUID, correct: Boolean) {
    val quiz = quizBankRepo.findById(quizId)
    val word = userWordsRepo.findById(quiz.wordId)

    // 1. Update word familiarity
    val newWordFamiliarity = if (correct)
        (word.familiarity + 1).coerceAtMost(5)
    else
        (word.familiarity - 1).coerceAtLeast(0)

    userWordsRepo.update(word.id,
        familiarity = newWordFamiliarity,
        currentTier = tierForFamiliarity(newWordFamiliarity),
        nextReview = nextReview(newWordFamiliarity, correct)
    )

    // 2. Recompute and cache kanji familiarity for all kanji in this word
    word.kanjiIds.forEach { kanjiId ->
        val allWords = userWordsRepo.findByKanjiId(userId, kanjiId)
        val computed = computeKanjiFamiliarity(allWords)
        val earliestReview = allWords.mapNotNull { it.nextReview }.minOrNull()
        userKanjiRepo.updateCached(kanjiId,
            familiarity = computed,
            currentTier = tierForFamiliarity(computed),
            nextReview = earliestReview
        )
    }

    // 3. Check challenge triggers (unchanged)
    checkConsolidationTrigger(userId, quiz.kanjiId, newWordFamiliarity)
    checkMaturityTrigger(userId, newWordFamiliarity)
    checkRegenTriggers(userId, quiz.kanjiId, newWordFamiliarity)
}
```

**Attribution for shared words** — if 電話 is answered correctly:
- `UserWords` for 電話 → familiarity +1
- `UserKanji` for 電 → recomputed from all 電 words
- `UserKanji` for 話 → recomputed from all 話 words

Both kanji benefit from one correct answer, proportional to how many of their other words are also known.

---

## 3.5.5 Quiz Type Reference Update

The familiarity ladder and resurfacing weights now apply per **word**, not per kanji. The table itself is unchanged — the unit it applies to has shifted.

| Familiarity | Current tier | What is being tested |
|-------------|--------------|----------------------|
| 0 | `meaning_recall` | Do you recognise what this word means? |
| 1 | `reading_recognition` | Can you read this word? |
| 2 | `reverse_reading` | Can you connect the sound to the written word? |
| 3 | `bold_word_meaning` | Can you understand it in a sentence? |
| 4 | `fill_in_the_blank` (MC) | Can you use it in context? |
| 5 | `fill_in_the_blank` (free type) | Can you produce it from memory? |

---

## 3.5.6 Data Connect Transactions

Multi-step writes use the `@transaction` directive in Data Connect mutation files. All steps succeed or all roll back — no partial writes. The `response` binding passes output from one step to the next within the same transaction.

**`SaveQuizResult`** — the most critical multi-step write:

```graphql
mutation SaveQuizResult(
  $quizId: UUID!
  $wordId: UUID!
  $slotId: UUID!
  $distractorSetId: UUID!
  $correct: Boolean!
  $newFamiliarity: Int!
  $nextReview: Timestamp!
) @transaction {
 
  # Step 1 — update word familiarity + next review
  userWords_update(id: $wordId, data: {
    familiarity: $newFamiliarity
    currentTier_expr: "..."     # derived from newFamiliarity
    nextReview: $nextReview
  })
 
  # Step 2 — increment quiz served count
  quizBank_update(id: $quizId, data: {
    servedCount_update: { inc: 1 }
    servedAt_expr: "request.time"
  })
 
  # Step 3 — mark distractor set as used
  quizDistractor_update(id: $distractorSetId, data: {
    servedAt_expr: "request.time"
  })
 
  # Step 4 — insert serve record (references previous steps via response)
  quizServe_insert(data: {
    quizId: $quizId
    distractorSetId: $distractorSetId
    slotId: $slotId
    correct: $correct
    wordFamiliarityAtServe: $newFamiliarity
    answeredAt_expr: "request.time"
  })
 
  # Step 5 — increment slot completed count
  quizSlot_update(id: $slotId, data: {
    completed_update: { inc: 1 }
  })
}
```

**`SaveKanjiSession`** — word + kanji inserts + job enqueue on photo selection:

```graphql
mutation SaveKanjiSession(
  $userId: String!
  $kanjiMasterId: UUID!
  $photoId: UUID!
  $wordData: [UserWordInput!]!
) @transaction {
 
  # Step 1 — insert UserKanji
  userKanji_insert(data: {
    userId: $userId
    kanjiId: $kanjiMasterId
    status: LEARNING
    sourcePhotoId: $photoId
  })
 
  # Step 2 — insert UserWords (one per example word)
  # Step 3 — insert QuizGenerationJobs (one per word)
  # Both handled via batch insert mutations
}
```

---

## Definition of Done

- [ ] `UserWords` gains `familiarity`, `currentTier`, `nextReview`, `discoveredViaKanjiId`
- [ ] `UserKanji.familiarity` and `currentTier` updated as cached fields derived from `UserWords`
- [ ] `QuizBank` gains `word` reference alongside `kanji`
- [ ] `QuizGenerationJob` gains `word` reference
- [ ] `QuizServe.familiarityAtServe` renamed to `wordFamiliarityAtServe`
- [ ] `WordSource` enum gains `DISCOVERY`
- [ ] Quiz generation jobs enqueued per word, not per kanji
- [ ] Deduplication: if `QuizBank` already has quizzes for a word, no new job enqueued
- [ ] Word discovery fires when 3+ of 5 example words already at familiarity >= 3
- [ ] `discover_words` Firebase Function (Gemini 2.0 Flash) inserts new `UserWords` + enqueues jobs
- [ ] Quiz answer updates `UserWords.familiarity` first, then recomputes `UserKanji.familiarity`
- [ ] Both kanji in a shared word (e.g. 電話) get familiarity recomputed on every answer
- [ ] Verified: learn 電 → 電話 gets quizzes → learn 話 → 電話 quiz reused, not duplicated
- [ ] Verified: learn 電 with 電話 already familiar → word discovery fires → fresh words appear

---

# Iteration 4 — React: Slot-Based Quiz UI

The daily habit side of the loop. Rolling session windows, no score pressure, no rollover backlog. Builds on word-centric quiz model from iteration 3.5.

### 4.1 Slot System (Ktor: GET /api/quiz/slot)

Slots are **rolling windows** anchored to your first answer — not fixed clock boundaries. Duration configurable in `UserSettings` (default 6 hours).

```
First answer at 1am  → slot active 01:00–06:59
Slot expires, no new slot opens

Next answer at 11am  → slot active 11:00–16:59
Slot expires, no new slot opens
```

**Lifecycle:**
- No `QuizSlot` row exists until the first `POST /api/quiz/result`
- `GET /api/quiz/slot` checks for an active slot (`slotEnd > now()`):
  - Active slot found → return remaining quizzes
  - No active slot → return preview batch (same selection logic, no slot row created yet)
- `POST /api/quiz/result` (first answer with no active slot):
  - Creates `QuizSlot`: `slotStart = now()`, `slotEnd = now() + slotDurationHours`
- No rollover — expired slots silently abandoned

**Response:**
```json
{
  "quizzes": [
    {
      "id": "uuid",
      "quizType": "FILL_IN_THE_BLANK",
      "word": "電車",
      "wordReading": "でんしゃ",
      "prompt": "＿＿乗り換えどこだっけ？",
      "target": "電車",
      "furigana": "でんしゃ",
      "answer": "電車",
      "options": ["電車", "急行", "地下鉄", "バス停"],
      "explanation": "電車 fits here — asking where to transfer trains",
      "wordFamiliarity": 1,
      "currentTier": "READING_RECOGNITION"
    }
  ],
  "remaining": 4,
  "slotEndsAt": "2026-03-23T07:00:00+09:00"
}
```

> `nextSlotAt` removed — next slot opens whenever you next answer, not at a fixed time.

### 4.2 Quiz Selection Priority

Selection operates on `UserWords` — words due for review, not kanji.

| Priority | Source | Cap |
|----------|--------|-----|
| 1 | Overdue current-tier words (`UserWords.nextReview < now()`) | Up to 60% of allowance |
| 2 | New words, never served (`QuizBank.servedAt is null`) | Up to 20% of allowance |
| 3 | Resurfaced lower-tier words (weighted by familiarity table) | Remainder |

For each selected quiz, `QuizService` resolves the distractor set and augments with random DB candidates:

- Find latest `QuizDistractor` where `servedAt is null`
- If none: fall back to latest set + enqueue regen job
- Augment stored distractors with random candidates from `KanjiMaster` / `UserWords`
- Shuffle combined pool, pick 3, add correct answer → 4 options total
- Mark `QuizDistractor.servedAt`

**Random candidate sources by quiz type:**

| Quiz type | Random pool |
|-----------|-------------|
| `meaning_recall` | `KanjiMaster.meanings` of other kanji |
| `reading_recognition` | `KanjiMaster.onyomi` / `kunyomi` of other kanji |
| `reverse_reading` | `KanjiMaster.character` at similar frequency |
| `bold_word_meaning` | `KanjiMaster.meanings` from user's learning set |
| `fill_in_the_blank` | `UserWords.word` — words the user has personally encountered |

### 4.3 Quiz Card UI — Per Type

**`meaning_recall`** — Word shown large (電車). 4 meaning options. Furigana revealed on answer.

**`reading_recognition`** — Word shown large (電車). 4 furigana options.

**`reverse_reading`** — Furigana shown large (でんしゃ). 4 word options.

**`bold_word_meaning`** — Sentence with target word bolded. Furigana below. 4 meaning options.
Fsm-2
**`fill_in_the_blank`** — Sentence with `＿＿` gap:
- wordFamiliarity 0–4 → 4 MC options
- wordFamiliarity 5 → free text input

All cards: reveal answer → show correct/incorrect + explanation. Slot complete → summary screen.

### 4.4 POST /api/quiz/result

```json
{ "quizId": "uuid", "correct": true }
```

- First call with no active slot: creates `QuizSlot`
- Increments `QuizSlot.completed` and `QuizBank.servedCount`
- Marks `QuizDistractor.servedAt`
- Inserts `QuizServe` row (quiz, distractorSet, slot, correct, wordFamiliarityAtServe)
- Updates `UserWords.familiarity`, `currentTier`, `nextReview` (SM-2 + jitter)
- Recomputes and caches `UserKanji.familiarity` for all kanji in the word
- Checks consolidation + maturity triggers
- Checks regen triggers

**`nextReview` calculation** — increment word familiarity first, then calculate from new value with ±15% jitter:

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

| New word familiarity | Base | Range (±15%) |
|----------------------|------|--------------|
| 0 | 1 day | 1 day |
| 1 | 2 days | 1–3 days |
| 2 | 4 days | 3–5 days |
| 3 | 7 days | 6–8 days |
| 4 | 12 days | 10–14 days |
| 5 | 18 days | 15–21 days |

### Definition of Done

- [ ] `GET /api/quiz/slot` returns preview batch when no active slot
- [ ] `GET /api/quiz/slot` returns remaining quizzes when active slot exists
- [ ] `QuizSlot` created on first `POST /api/quiz/result`, not on GET
- [ ] `slotStart = now()`, `slotEnd = now() + slotDurationHours` at first answer
- [ ] Expired slot returns fresh preview on next GET
- [ ] Quiz selection operates on `UserWords.nextReview` not `UserKanji.nextReview`
- [ ] Selection respects priority order and caps
- [ ] Serve-time distractor augmentation returns different options across serves
- [ ] All 5 card types render correctly
- [ ] `fill_in_the_blank` MC for wordFamiliarity 0–4, free type for 5
- [ ] `POST /api/quiz/result` updates `UserWords.familiarity`, `currentTier`, `nextReview`
- [ ] `UserKanji.familiarity` recomputed after every word familiarity change
- [ ] SM-2 jitter applied — nextReview varies within ±15% of base interval
- [ ] `QuizServe` row inserted on every answer
- [ ] `QuizBank.servedCount` incremented on every serve
- [ ] `QuizDistractor.servedAt` marked on used distractor set
- [ ] Summary screen shown after slot complete

---

# Iteration 5 — Tuning + Personal Kanji List + Settings

Adds visibility and manual control. By now there's real usage data to inform SM-2 tuning.

### 5.1 Personal Kanji List

- All `UserKanji` grouped by status: learning / familiar
- Derived familiarity shown as 0–5 dot bar — computed from word scores
- Tap kanji → detail view showing all its words with individual familiarity dots
- Shows which words are unlocked vs still being learned
- Familiar kanji can be promoted to learning via tap

### 5.2 Word List

- All `UserWords` for the user, grouped by familiarity level
- Each word shows: word, reading, meaning, familiarity dots, next review date, source (photo/discovery)
- Tap word → detail view with quiz history from `QuizServe`

### 5.3 Manual Kanji Add

Search `KanjiMaster` by character → add as familiar or learning. Triggers word discovery if learning — fetches example words from Gemini and enqueues quiz jobs.

### 5.4 Progress Indicators

- Current slot: quizzes remaining + time until slot closes
- Daily streak (slots with ≥1 answer)
- Total words: by familiarity level breakdown
- Total kanji: learning vs familiar (derived)

### 5.5 Settings Screen

Wired to `PUT /api/settings`. Changes take effect from next slot.

| Setting | Input | Default |
|---------|-------|---------|
| `quizAllowancePerSlot` | Number input | 5 |
| `slotDurationHours` | Selector: 3 / 6 / 8 / 12 | 6 |

### 5.6 SM-2 Interval Review

After 2 weeks of real usage, query `QuizServe` to check:
- Words that are repeatedly answered wrong at the same familiarity level → shorten interval
- Words at familiarity 5 answered correctly every time → consider extending 18-day cap
- Words forgotten after long gaps → adjust jitter range

### Definition of Done

- [ ] Kanji list shows derived familiarity (computed from words) with dot bar
- [ ] Kanji detail shows all constituent words with individual familiarity
- [ ] Word list shows all `UserWords` with familiarity and next review
- [ ] Manual kanji add triggers word discovery via Gemini
- [ ] Settings screen wired to `PUT /api/settings`
- [ ] Slot queue + streak visible on home screen
- [ ] SM-2 intervals reviewed after 2 weeks of real data

---

# Iteration 6 — Challenge Sessions (Consolidation + Maturity)

Two challenge types that sit outside the daily slot. Both trigger automatically, sit pending until started, never expire, and do not count against slot allowance.

> _Full spec unchanged from previously designed iteration 6 — consolidation and maturity challenges. One update: challenge triggers now check **word familiarity** not kanji familiarity, since familiarity is now tracked at the word level._

**Updated trigger check:**

```kotlin
// Consolidation — fires when 5 words cross familiarity 2 or 4 within 7 days
// (was: 5 kanji — now: 5 words)
val recentWords = userWordsRepo.findRecentlyReachedFamiliarity(
    userId = userId,
    familiarity = newWordFamiliarity,
    withinDays = 7,
    excludeAlreadyChallenged = true
)
if (recentWords.size >= 5) { ... }

// Maturity — fires when derived UserKanji.familiarity reaches 5 for 10th kanji
// (kanji familiarity is still the milestone marker — it represents overall mastery)
val matureKanjiCount = userKanjiRepo.countByFamiliarity(userId, 5)
```

Consolidation triggers on word familiarity crossings — you're consolidating vocabulary, not abstract kanji. Maturity triggers on kanji familiarity milestones — reaching kanji mastery is the celebration milestone.

Everything else in iteration 6 (interleaving, Gemini prompt, schema, UI, API) remains as previously specified.