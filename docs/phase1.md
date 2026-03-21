# Kanji Learning App — Iteration Plan

_Photo-Driven Kanji Acquisition · Stack: React · Ktor · Supabase · Claude API_

---

## Overview

This app turns real-life kanji encounters in Japan into a structured, low-friction daily learning habit. The core loop: photograph a sign or notice → select kanji to learn → receive 5 spaced-repetition quizzes per day generated in the background by Claude.

Designed for an erratic, contextual learner — not a formal studier. Study effort is minimized at the capture moment (high motivation) and again at the quiz moment (low friction daily habit).

### Iteration Order Rationale

| # | Scope | Why This Order |
|---|-------|----------------|
| 1 | Supabase Schema + kanjidic2 Seed | Foundation — all iterations depend on this |
| 2 | Ktor: Photo Analysis Endpoint | Core value proposition — must exist before UI |
| 3 | React: Photo Upload + Kanji Selection UI | The highest-motivation moment in the loop |
| 4 | Ktor: Background Quiz Generation Worker | Async — decouples capture from study |
| 5 | React: Daily Quiz UI (5/day) | Closes the learning loop |
| 6 | Spaced Repetition Tuning + Personal Kanji List | Refinement after real usage data |

---

# Iteration 1 — Supabase Schema + kanjidic2 Seed

Establishes the data foundation. All subsequent iterations depend on this. No UI, no API — just tables and seed data.

### 1.1 Database Schema

**`kanji_master`**

Seeded once from kanjidic2. Never written to by the app at runtime.

```sql
create table kanji_master (
  id          uuid primary key default gen_random_uuid(),
  character   text not null unique,
  onyomi      text[],
  kunyomi     text[],
  meanings    text[],
  frequency   int    -- kanjidic2 freq rank, lower = more common, null = rare
);
```

**`user_kanji`**

One row per kanji the user has interacted with. `status` drives whether quizzes are generated.

```sql
create table user_kanji (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users,
  kanji_id        uuid references kanji_master,
  status          text check (status in ('familiar', 'learning')),
  familiarity     int default 0,   -- 0-5
  next_review     timestamptz,
  source_photo_id uuid,
  created_at      timestamptz default now()
);
```

**`photo_sessions`**

One row per photo taken. Stores the raw Claude response so kanji can be re-extracted without re-calling the API.

```sql
create table photo_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users,
  image_url            text,
  raw_claude_response  jsonb,
  created_at           timestamptz default now()
);
```

**`quiz_generation_jobs`**

Background job queue. The worker polls this table; status transitions: `pending → processing → done | failed`.

```sql
create table quiz_generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users,
  kanji_id    uuid references kanji_master,
  status      text default 'pending'
              check (status in ('pending', 'processing', 'done', 'failed')),
  attempts    int default 0,
  created_at  timestamptz default now()
);
```

**`quiz_bank`**

Pre-generated quizzes ready to serve. `served_at` is null until the quiz is shown to the user.

```sql
create table quiz_bank (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users,
  kanji_id    uuid references kanji_master,
  quiz_type   text check (quiz_type in ('word_recognition', 'sentence')),
  question    text,
  furigana    text,
  answer      text,
  distractors text[],
  served_at   timestamptz,
  created_at  timestamptz default now()
);
```

### 1.2 kanjidic2 Seed Script

One-time Kotlin script. Downloads `kanjidic2.xml`, filters by frequency rank, and batch-inserts into `kanji_master`. JLPT level is intentionally ignored — frequency rank is a better proxy for kanji you'll actually encounter in the wild in Japan.

- Download `kanjidic2.xml` from edrdg.org
- Parse XML with a SAX parser — file is ~60MB, don't load into memory
- Filter: keep kanji where `<freq>` element exists and rank <= 1500
- Extract: `literal` (character), `on_reading` / `kun_reading`, `meaning` (lang=en), `freq`
- Batch insert in chunks of 50 using Exposed or plain JDBC

```kotlin
// Seed filter — frequency rank only, no JLPT
val shouldInclude = freqRank != null && freqRank <= 1500
```

> **Why 1500?** Covers everyday vocabulary well beyond convenience store and train station signage, without pulling in obscure formal/legal kanji that rarely appear in daily life. Adjust up or down after real usage.

### Definition of Done

- [ ] `kanji_master`, `user_kanji`, `photo_sessions`, `quiz_generation_jobs`, `quiz_bank` tables created via migration
- [ ] Top 1500 kanji by frequency seeded in `kanji_master`
- [ ] Verified: `SELECT count(*) FROM kanji_master WHERE frequency IS NOT NULL` returns ~1500
- [ ] Row Level Security enabled on `user_kanji`, `quiz_bank`, `quiz_generation_jobs` (`user_id = auth.uid()`)

---

# Iteration 2 — Ktor: Photo Analysis Endpoint

The server-side half of the photo workflow. Receives an image, calls Claude vision API, returns a structured kanji breakdown. The React UI does not exist yet — test with curl or Postman.

### 2.1 Endpoint

`POST /api/photo/analyze` — accepts `multipart/form-data` with a single image field.

Response shape:

```json
{
  "sessionId": "uuid",
  "kanji": [
    {
      "character": "電",
      "onyomi": ["でん"],
      "kunyomi": [],
      "meanings": ["electricity", "electric"],
      "exampleWords": [
        { "word": "電車", "reading": "でんしゃ", "meaning": "train" },
        { "word": "電話", "reading": "でんわ", "meaning": "telephone" }
      ],
      "whyUseful": "Appears on every train sign in Japan",
      "recommended": true
    }
  ]
}
```

### 2.2 Claude Prompt (Call #1 — Vision)

System prompt instructs Claude to return only valid JSON. The user message includes the base64 image.

```
You are a Japanese kanji tutor for a conversational English speaker living in Japan.
Analyze this image and extract all kanji found.

Return ONLY a valid JSON array — no markdown, no preamble:
[{
  "character": "電",
  "onyomi": ["でん"],
  "kunyomi": [],
  "meanings": ["electricity", "electric"],
  "exampleWords": [
    { "word": "電車", "reading": "でんしゃ", "meaning": "train" },
    { "word": "電話", "reading": "でんわ", "meaning": "telephone" }
  ],
  "whyUseful": "Appears on every train sign in Japan",
  "recommended": true
}]

Limit to max 3 recommended:true. Focus on kanji worth learning for daily life
in Japan, not rare or formal kanji.
```

### 2.3 Implementation Notes

- Convert incoming multipart bytes to base64 in Ktor before passing to Claude
- Store image in Supabase Storage under `photos/{userId}/{uuid}.jpg`
- Persist raw Claude JSON in `photo_sessions.raw_claude_response` — avoids re-calling API if user revisits
- Match returned characters against `kanji_master` to enrich with DB IDs before returning to client
- Claude API key must live in environment variable, never in source

### Definition of Done

- [ ] `POST /api/photo/analyze` accepts multipart image and returns structured JSON
- [ ] Photo stored in Supabase Storage
- [ ] `photo_sessions` row created with `raw_claude_response` populated
- [ ] Returned kanji enriched with `kanji_master` IDs where matched
- [ ] Tested with a real station photo — returns kanji with correct readings and example words

---

# Iteration 3 — React: Photo Upload + Kanji Selection UI

The highest-motivation moment in the entire app. User snaps a photo, sees the breakdown, and taps which kanji they already know vs want to learn. Speed and satisfaction matter here — the user must never wait.

### 3.1 Flow

1. User taps camera button → device camera opens (`accept="image/*" capture="environment"`)
2. Photo sent to `POST /api/photo/analyze`
3. Loading state shown (spinner, ~3–5s for Claude)
4. Kanji cards appear — one card per extracted kanji
5. User taps each card to toggle: neutral → familiar → learning
6. Tapping Done → `POST /api/kanji/session` with selections → background jobs enqueued
7. User dismissed — no waiting for quiz generation

### 3.2 Kanji Card Design

Each card shows enough to make the familiar/learning decision:

- Large character (60px+) — the kanji itself
- Readings in furigana style below
- Primary English meaning
- One example word
- "Recommended" badge on top 3 (from Claude)
- Two tap zones: **✓ Already Know** / **★ Want to Learn**

### 3.3 POST /api/kanji/session (new Ktor endpoint)

Receives the session result and writes to `user_kanji` + enqueues jobs:

```json
{ "sessionId": "uuid", "selections": [{ "kanjiId": "uuid", "status": "learning" }] }
```

- `status = 'learning'` → insert into `user_kanji` + insert into `quiz_generation_jobs`
- `status = 'familiar'` → insert into `user_kanji` with `status = 'familiar'`, no job enqueued

### Definition of Done

- [ ] Camera capture works on mobile browser
- [ ] Loading state shown during Claude call
- [ ] Kanji cards render with character, readings, meaning, example word
- [ ] Familiar / Want to Learn toggle works per card
- [ ] Done button writes to `user_kanji` and enqueues jobs
- [ ] User is not blocked — UI dismisses before jobs complete

---

# Iteration 4 — Ktor: Background Quiz Generation Worker

Async worker that drains the `quiz_generation_jobs` queue and calls Claude (Call #2) to build quiz questions. Decoupled from the photo flow — runs on a coroutine schedule. User never waits for this.

### 4.1 Worker Schedule

Runs every 2 minutes via a Ktor coroutine scheduler. Processes up to 10 jobs per cycle to avoid rate-limiting the Claude API. Each job generates 4 quizzes: 2 `word_recognition` + 2 `sentence`.

### 4.2 Status Transitions

| From | To | Condition |
|------|----|-----------|
| `pending` | `processing` | Worker picks up job |
| `processing` | `done` | Quizzes saved to `quiz_bank` |
| `processing` | `failed` | Exception thrown |
| `failed` | `pending` | If `attempts < 3` (retry) |

### 4.3 Worker Skeleton

```kotlin
class QuizGenerationWorker(
    private val supabase: SupabaseClient,
    private val claudeClient: ClaudeClient
) {
    suspend fun run() {
        val jobs = fetchPending(limit = 10)
        jobs.forEach { job ->
            markProcessing(job.id)
            try {
                val quizzes = generateQuizzes(job)
                saveToQuizBank(quizzes)
                markDone(job.id)
            } catch (e: Exception) {
                markFailed(job.id)  // retry logic checks attempts < 3
            }
        }
    }
}
```

### 4.4 Claude Prompt (Call #2 — Quiz Generation)

```
Generate quiz questions for a Japanese learner living in Japan.
Target kanji: {character} ({meanings})

Return ONLY a JSON array of exactly 4 quizzes — 2 word_recognition, 2 sentence:
[
  {
    "quiz_type": "word_recognition",
    "question": "地下＿ (chikatetsu)",
    "answer": "鉄",
    "distractors": ["東", "急", "電"],
    "furigana": "ちかてつ"
  },
  {
    "quiz_type": "sentence",
    "question": "次の【急行】は何時に来ますか？\nWhat does the bold word mean?",
    "answer": "express train",
    "distractors": ["local train", "last train", "next stop"],
    "furigana": "きゅうこう"
  }
]

Rules:
- Sentences must reflect real daily life in Japan
- Distractors must be plausible, not obviously wrong
- Always include furigana
```

### Definition of Done

- [ ] Worker runs on 2-minute schedule via Ktor coroutine
- [ ] Processes up to 10 pending jobs per cycle
- [ ] Status transitions correctly: `pending → processing → done/failed`
- [ ] Failed jobs with `attempts < 3` are retried automatically
- [ ] 4 quizzes saved to `quiz_bank` per job (2 `word_recognition` + 2 `sentence`)
- [ ] Verified: take photo → select learning kanji → wait 2 min → `quiz_bank` rows appear

---

# Iteration 5 — React: Daily Quiz UI

The daily habit side of the loop. Serves 5 quizzes per day from the `quiz_bank`. Simple, fast, satisfying. No score pressure — just recognition building.

### 5.1 Quiz Selection Logic (Ktor: GET /api/quiz/daily)

Priority order for selecting the 5 daily quizzes:

1. **Overdue reviews** — `next_review < now()` (highest priority)
2. **Never served** — `served_at is null` (new material)
3. **Random filler** — padding to reach 5

Returns exactly 5 quizzes (or fewer if the bank is not yet populated).

### 5.2 Quiz Card UI

One card at a time, tap to advance:

- **Word recognition**: gapped word with furigana hint, 4 multiple choice options
- **Sentence**: full sentence with target word highlighted, 4 options for its meaning
- Reveal answer on tap — show correct/incorrect with brief explanation
- After all 5: summary screen with streak and next review time

### 5.3 POST /api/quiz/result

Called after each answer. Updates familiarity and schedules next review:

```json
{ "quizId": "uuid", "correct": true }
```

SM-2 intervals applied in Ktor:

| Familiarity | Next Review |
|-------------|-------------|
| 0 | 1 day |
| 1 | 2 days |
| 2 | 4 days |
| 3 | 7 days |
| 4 | 14 days |
| 5+ | 30 days |

Incorrect answer: familiarity decreases by 1 (minimum 0), `next_review = tomorrow`.

### Definition of Done

- [ ] `GET /api/quiz/daily` returns up to 5 quizzes in correct priority order
- [ ] Word recognition card renders with gap and 4 options
- [ ] Sentence card renders with highlighted target word and 4 options
- [ ] Furigana shown as reading hint below question
- [ ] `POST /api/quiz/result` updates `familiarity` and `next_review` correctly
- [ ] Summary screen shown after 5 quizzes with next review time

---

# Iteration 6 — Spaced Repetition Tuning + Personal Kanji List

Adds visibility into learning progress and tunes spaced repetition based on real usage data. Also adds the ability to manually add kanji outside of photo sessions.

### 6.1 Personal Kanji List Screen

Scrollable list of all kanji in `user_kanji`, grouped by status:

- **Learning** — familiarity bar (0–5 dots) and next review date
- **Familiar** — greyed out, tap to move to learning
- Tap any kanji → detail view showing associated quizzes and answer history

### 6.2 Manual Kanji Add

Search field → type or draw a kanji → look up against `kanji_master` → add as familiar or learning. Covers kanji encountered without a photo (conversation, handwriting, etc.).

### 6.3 Progress Indicators

- Daily streak counter
- Total kanji: learning vs familiar
- Quizzes due today vs completed today

No complex analytics — keep it lightweight.

### 6.4 SM-2 Interval Review

After 2 weeks of real usage, review whether the fixed intervals feel right. Adjust based on:

- Too many quizzes pile up on the same day → spread intervals more
- Familiarity 5 kanji keep reappearing → extend the 30-day cap
- Forgotten kanji reset too aggressively → soften the decrement

### Definition of Done

- [ ] Personal kanji list screen shows all `user_kanji` grouped by status
- [ ] Familiarity level and `next_review` date visible per kanji
- [ ] Manual kanji add via search against `kanji_master`
- [ ] Daily streak and queue size visible on home screen
- [ ] SM-2 intervals reviewed and adjusted after 2 weeks of real usage

---

# Appendix — Architecture Reference

### Stack

| Layer | Technology | Role |
|-------|------------|------|
| Frontend | React | Photo capture, kanji selection, quiz UI |
| Backend | Ktor (Kotlin) | API, Claude calls, background worker |
| Database | Supabase (Postgres) | Schema, auth, storage |
| AI | Claude API (`claude-sonnet-4-20250514`) | Vision extraction + quiz generation |
| Seed Data | kanjidic2 (edrdg.org) | Top 1500 kanji by frequency |

### Request Flow Summary

- **Call #1 (photo)** — Claude vision → kanji list → user selection → DB write + jobs enqueued
- **Call #2 (background)** — Claude text → 4 quizzes per kanji → `quiz_bank`
- **Daily quiz** — priority queue from `quiz_bank` → user answers → SM-2 scheduling update

### Key Design Decisions

- Claude API key lives server-side in Ktor only — never exposed to the React client
- Raw photo response stored in DB — avoids re-billing for re-analysis
- Background worker decouples capture (high motivation) from generation (slow)
- User sees 5 quizzes/day maximum — prevents overwhelm for erratic learners
- `familiar` status stores recognition without generating quizzes — respects existing knowledge