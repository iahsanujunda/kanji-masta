# Kanji Learning App — Iteration Plan

_Photo-Driven Kanji Acquisition · Stack: React · Ktor · Firebase (Auth + Data Connect + Functions) · Claude API_

---

## Overview

This app turns real-life kanji encounters in Japan into a structured, low-friction daily learning habit. The core loop: photograph a sign or notice → select kanji to learn → receive spaced-repetition quizzes across configurable daily time slots generated in the background by Claude.

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

**`PhotoSession`** — one row per photo. Raw Claude response stored to avoid re-billing.

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

A separate scheduled Firebase Function checks two trigger conditions daily and enqueues `REGEN` jobs:

**Trigger 1 — Familiarity milestone:** when `currentTier` advances, enqueue regen for all quizzes of that kanji. Fresh distractors calibrated to the new tier are more instructive.

**Trigger 2 — Serve count + stale familiarity:** when `QuizBank.servedCount >= 5` AND `UserKanji.familiarity` unchanged for 14+ days. Catches the user stuck at a tier who has memorized the option landscape.

Old distractor sets are never deleted — they accumulate for evaluation.

### 3.5 Claude Prompt (Initial Quiz Generation)

```
You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target kanji: {character} — meanings: {meanings}, onyomi: {onyomi}, kunyomi: {kunyomi}

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
- Avoid: keigo (polite forms), formal written style, news language, 〜ます／〜です endings
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

The daily habit side of the loop. Configurable time slots, no score pressure, no rollover backlog.

### 4.1 Slot System (Ktor: GET /api/quiz/slot)

Default: 4 slots/day × 6 hours each (JST). Both values configurable in `UserSettings`.

```
Slot 1:  00:00 – 05:59
Slot 2:  06:00 – 11:59
Slot 3:  12:00 – 17:59
Slot 4:  18:00 – 23:59
```

- Slot row created on first request in window (`startedAt` = null)
- `startedAt` set on first `POST /api/quiz/result`
- Slot expired without starting → `{ quizzes: [], nextSlotAt }`
- No rollover — missed slots silently abandoned

Response:
```json
{
  "quizzes": [
    {
      "id": "uuid",
      "quizType": "FILL_IN_THE_BLANK",
      "prompt": "次の＿＿は何時に来ますか？",
      "target": "電車",
      "furigana": "でんしゃ",
      "answer": "電車",
      "distractors": ["急行", "地下鉄", "バス停"],
      "explanation": "電車 fits here",
      "familiarity": 1,
      "currentTier": "READING_RECOGNITION"
    }
  ],
  "remaining": 4,
  "slotEndsAt": "2026-03-21T11:59:59+09:00",
  "nextSlotAt": "2026-03-21T12:00:00+09:00"
}
```

### 4.2 Quiz Selection Priority

| Priority | Source | Cap |
|----------|--------|-----|
| 1 | Overdue current-tier (`nextReview < now()`) | Up to 60% of allowance |
| 2 | New kanji, never served | Up to 20% of allowance |
| 3 | Resurfaced lower-tier (weighted by familiarity table) | Remainder |

For each selected quiz, the slot endpoint resolves the distractor set to use:
- Find latest `QuizDistractor` row where `servedAt is null`
- If none available: fall back to latest set + enqueue regen job in background
- Mark `QuizDistractor.servedAt` when the quiz is returned to client

### 4.3 Quiz Card UI — Per Type

**`meaning_recall`** — Large kanji. 4 meaning options. Furigana revealed on answer.

**`reading_recognition`** — Kanji/compound large. 4 furigana options.

**`reverse_reading`** — Furigana large. 4 kanji compound options.

**`bold_word_meaning`** — Sentence with target bolded. Furigana below. 4 meaning options.

**`fill_in_the_blank`** — Sentence with `＿＿` gap:
- familiarity 0–4 → 4 MC options
- familiarity 5 → free text input

All cards: reveal answer → show correct/incorrect + explanation. Slot complete → summary with streak + next slot time.

### 4.4 POST /api/quiz/result

```json
{ "quizId": "uuid", "correct": true }
```

- First call in slot: sets `QuizSlot.startedAt`
- Increments `QuizSlot.completed` and `QuizBank.servedCount`
- Marks `QuizDistractor.servedAt` for the set that was used
- Inserts `QuizServe` row (quiz, distractorSet, slot, correct, familiarityAtServe)
- Correct + current-tier: `familiarity + 1`, advance `currentTier`
- Correct + resurfaced: update `nextReview` only
- Incorrect: `familiarity - 1` (min 0), `nextReview = tomorrow`, regress `currentTier` if needed

### Definition of Done

- [ ] `GET /api/quiz/slot` returns quizzes + `remaining`, `slotEndsAt`, `nextSlotAt`
- [ ] Slot created on first request, `startedAt` set on first answer
- [ ] Expired unstarted slots return empty + `nextSlotAt`
- [ ] Selection respects priority order and caps
- [ ] Current-tier gating applied per `UserKanji.currentTier`
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
| Functions | Firebase Functions | Claude API calls (photo analysis, quiz generation) |
| AI | Claude API (`claude-sonnet-4-20250514`) | Vision extraction + quiz generation |
| Seed Data | kanjidic2 (edrdg.org) | Top 1500 kanji by frequency |

### Request Flow Summary

- **Call #1 (photo)** — Ktor → Firebase Function → Claude vision → enrich from kanji_master → user selection → DB write + jobs enqueued
- **Call #2 (background)** — Firebase scheduled function → Claude text → 5 quizzes per kanji → `QuizBank`
- **Slot quiz** — Ktor slot engine → tier-gated priority selection + weighted resurfacing → familiarity + tier update

### Key Design Decisions

- Claude API key in Firebase Functions only — never exposed to client or Ktor
- Raw photo response stored in DB — no re-billing on revisit
- Background worker decouples capture (high motivation) from generation (slow)
- Type-gated ladder with resurfacing — previous types never disappear, just become rare
- No rollover — missed slots expire quietly, no backlog anxiety
- Slot counter starts on first answer — fits irregular schedules
- Quiz allowance configurable — default 5 is conservative, increase as habit solidifies
- `fill_in_the_blank` input resolved at serve time — quiz rows never regenerated
- Claude not asked for readings on photo — `kanji_master` is authoritative source
- Distractors versioned, never replaced — old sets retained for evaluation and prompt fine-tuning
- Regen triggers are milestone-first (tier crossing) with serve count as secondary safety net
- `QuizServe` provides full answer history per distractor set — foundation for future prompt optimization
- Modules never import from each other — only from `core/`
- Data Connect schema is the single source of truth — no SQL migrations
