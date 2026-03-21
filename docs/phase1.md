# Kanji Learning App — Iteration Plan

_Photo-Driven Kanji Acquisition · Stack: React · Ktor · Supabase · Claude API_

---

## Overview

This app turns real-life kanji encounters in Japan into a structured, low-friction daily learning habit. The core loop: photograph a sign or notice → select kanji to learn → receive spaced-repetition quizzes across configurable daily time slots generated in the background by Claude.

Designed for an erratic, contextual learner. Study effort is minimized at the capture moment (high motivation) and at the quiz moment (low friction, fits into any gap in the day).

### Iteration Order Rationale

| # | Scope | Why This Order |
|---|-------|----------------|
| 1 | Supabase Schema + kanjidic2 Seed | Foundation — all iterations depend on this |
| 2 | Ktor: Photo Analysis Endpoint | Core value proposition — must exist before UI |
| 3 | React: Photo Upload + Kanji Selection UI | The highest-motivation moment in the loop |
| 4 | Ktor: Background Quiz Generation Worker | Async — decouples capture from study |
| 5 | React: Slot-Based Quiz UI | Closes the learning loop |
| 6 | Spaced Repetition Tuning + Personal Kanji List + Settings | Refinement after real usage data |

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

# Iteration 1 — Supabase Schema + kanjidic2 Seed

Establishes the data foundation. No UI, no API — just tables and seed data.

### 1.1 Database Schema

**`kanji_master`** — seeded once, read-only at runtime.

```sql
create table kanji_master (
                              id          uuid primary key default gen_random_uuid(),
                              character   text not null unique,
                              readings    jsonb not null default '{}',  -- { "on": ["でん"], "kun": [] }
                              meanings    text[],
                              frequency   int    -- kanjidic2 freq rank, lower = more common, null = rare
);
```

**`user_kanji`** — one row per kanji the user has interacted with. `current_tier` tracks the active focus type for the familiarity ladder.

```sql
create table user_kanji (
                            id              uuid primary key default gen_random_uuid(),
                            user_id         uuid references auth.users,
                            kanji_id        uuid references kanji_master,
                            status          text check (status in ('familiar', 'learning')),
                            familiarity     int default 0,
                            current_tier    quiz_type default 'meaning_recall',
                            next_review     timestamptz,
                            source_photo_id uuid,
                            created_at      timestamptz default now()
);
```

**`photo_sessions`** — one row per photo. Raw Claude response stored to avoid re-billing.

```sql
create table photo_sessions (
                                id                   uuid primary key default gen_random_uuid(),
                                user_id              uuid references auth.users,
                                image_url            text,
                                raw_claude_response  jsonb,
                                created_at           timestamptz default now()
);
```

**`quiz_generation_jobs`** — background job queue. `job_type` distinguishes initial generation from distractor regen. Regen jobs target a specific `quiz_id` and insert new `quiz_distractors` rows.

```sql
create table quiz_generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users,
  kanji_id    uuid references kanji_master,
  quiz_id     uuid references quiz_bank,   -- null for initial, set for regen
  job_type    text default 'initial'
              check (job_type in ('initial', 'regen')),
  trigger     text,                        -- 'milestone', 'serve_count' for regen
  status      text default 'pending'
              check (status in ('pending', 'processing', 'done', 'failed')),
  attempts    int default 0,
  created_at  timestamptz default now()
);
```

**`quiz_bank`** — stable question content. Distractors are managed separately in `quiz_distractors`. Input method for `fill_in_the_blank` resolved at serve time, not stored here.

```sql
create type quiz_type as enum (
  'meaning_recall',
  'reading_recognition',
  'reverse_reading',
  'bold_word_meaning',
  'fill_in_the_blank'
);

create table quiz_bank (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users,
  kanji_id      uuid references kanji_master,
  quiz_type     quiz_type not null,
  prompt        text not null,
  furigana      text,
  target        text not null,
  answer        text not null,
  explanation   text,
  served_count  int default 0,
  served_at     timestamptz,
  created_at    timestamptz default now()
);
```

**`quiz_distractors`** — one row per distractor set per quiz. Sets accumulate — old ones are never deleted, enabling evaluation and prompt fine-tuning. Serve time picks the most recent unserved set.

```sql
create table quiz_distractors (
  id                        uuid primary key default gen_random_uuid(),
  quiz_id                   uuid references quiz_bank,
  user_id                   uuid references auth.users,
  distractors               text[] not null,
  generation                int not null,         -- 1 = initial, 2 = first regen, etc.
  trigger                   text not null
                            check (trigger in ('initial', 'milestone', 'serve_count')),
  familiarity_at_generation int not null,
  served_at                 timestamptz,
  created_at                timestamptz default now()
);
```

**`quiz_serves`** — full answer history, one row per quiz attempt. Provides evaluation signal for distractor fine-tuning.

```sql
create table quiz_serves (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid references quiz_bank,
  distractor_set_id   uuid references quiz_distractors,
  slot_id             uuid references quiz_slots,
  user_id             uuid references auth.users,
  familiarity_at_serve int not null,
  correct             boolean not null,
  answered_at         timestamptz default now()
);
```

**`quiz_slots`** — one row per slot window. `started_at` null until first quiz answer.

```sql
create table quiz_slots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users,
  slot_start    timestamptz not null,
  slot_end      timestamptz not null,
  started_at    timestamptz,
  completed     int default 0,
  allowance     int not null,   -- snapshot of user_settings at slot creation
  created_at    timestamptz default now()
);
```

**`user_settings`** — configurable quiz and slot behaviour. One row per user.

```sql
create table user_settings (
  user_id                 uuid primary key references auth.users,
  quiz_allowance_per_slot int default 5,    -- quizzes available per slot
  slot_duration_hours     int default 6,    -- length of each slot window
  timezone                text default 'Asia/Tokyo',
  updated_at              timestamptz default now()
);
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

One-time Kotlin script. JLPT level intentionally ignored — frequency rank is a better proxy for real-world encounter likelihood.

- Parse `kanjidic2.xml` with SAX (file is ~60MB)
- Filter: `<freq>` exists and rank <= 1500
- Extract: `literal`, `on_reading`, `kun_reading`, `meaning` (lang=en), `freq`
- Batch insert in chunks of 50

```kotlin
val shouldInclude = freqRank != null && freqRank <= 1500
```

> **Why 1500?** Covers daily life in Japan without pulling in obscure formal vocabulary. Adjust after real usage.

### Definition of Done

- [ ] All tables created: `kanji_master`, `user_kanji`, `photo_sessions`, `quiz_generation_jobs`, `quiz_bank`, `quiz_distractors`, `quiz_serves`, `quiz_slots`, `user_settings`
- [ ] `quiz_type` enum created
- [ ] Top 1500 kanji seeded — `SELECT count(*) FROM kanji_master WHERE frequency IS NOT NULL` returns ~1500
- [ ] RLS enabled on all user-scoped tables
- [ ] Default `user_settings` row created on new user signup

---

# Iteration 2 — Ktor: Photo Analysis Endpoint

Receives an image, calls Claude vision API, returns a structured kanji breakdown. Test with curl — no UI yet.

### 2.1 Endpoint

`POST /api/photo/analyze` — `multipart/form-data`, single image field.

```json
{
  "sessionId": "uuid",
  "kanji": [
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
      ],
      "kanjiMasterId": "uuid",
      "readings": { "on": ["でん"], "kun": [] },
      "meanings": ["electricity", "electric"]
    }
  ]
}
```

Readings and meanings are enriched from `kanji_master` after Claude responds — Claude is not asked to supply them.

### 2.2 Claude Prompt (Call #1 — Vision)

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

### 2.3 Implementation Notes

- Convert multipart bytes to base64 before passing to Claude
- Store image in Supabase Storage: `photos/{userId}/{uuid}.jpg`
- Persist raw response in `photo_sessions.raw_claude_response`
- Match characters against `kanji_master` to enrich with IDs, readings, meanings
- Claude API key in environment variable only

### Definition of Done

- [ ] `POST /api/photo/analyze` returns structured JSON
- [ ] Photo stored in Supabase Storage
- [ ] `photo_sessions` row created with `raw_claude_response`
- [ ] Returned kanji enriched with `kanji_master` data where matched
- [ ] Tested with a real station photo

---

# Iteration 3 — React: Photo Upload + Kanji Selection UI

The highest-motivation moment. User must never wait here.

### 3.1 Flow

1. Camera opens (`accept="image/*" capture="environment"`)
2. Photo sent to `POST /api/photo/analyze`
3. Loading spinner (~3–5s for Claude)
4. Kanji cards appear
5. User toggles each: neutral → familiar → learning
6. Done → `POST /api/kanji/session` → jobs enqueued
7. User dismissed immediately

### 3.2 Kanji Card

- Large character (60px+)
- Readings and primary meaning
- One example word
- Recommended badge (top 3)
- Two tap zones: **✓ Already Know** / **★ Want to Learn**

### 3.3 POST /api/kanji/session

```json
{ "sessionId": "uuid", "selections": [{ "kanjiId": "uuid", "status": "learning" }] }
```

- `learning` → insert `user_kanji` (familiarity 0, `current_tier = meaning_recall`) + enqueue job
- `familiar` → insert `user_kanji` (status familiar), no job

### Definition of Done

- [ ] Camera capture works on mobile browser
- [ ] Loading state shown during Claude call
- [ ] Cards render correctly with character, readings, meaning, example word
- [ ] Familiar / Want to Learn toggle works
- [ ] Done writes to `user_kanji` and enqueues jobs
- [ ] User not blocked — dismissed before jobs complete

---

# Iteration 4 — Ktor: Background Quiz Generation Worker

Async worker, decoupled from photo flow. User never waits for this.

### 4.1 Schedule

Every 2 minutes via Ktor coroutine. Up to 10 jobs per cycle. Each job generates 5 quizzes (one per type).

### 4.2 Status Transitions

| From | To | Condition |
|------|----|-----------|
| `pending` | `processing` | Worker picks up job |
| `processing` | `done` | All 5 quizzes saved |
| `processing` | `failed` | Exception thrown |
| `failed` | `pending` | `attempts < 3` |

### 4.3 Worker — Two Job Types

The worker handles both `initial` and `regen` job types from the same queue:

- `initial` — generates 5 quiz rows in `quiz_bank` + 1 `quiz_distractors` row per quiz (generation 1, trigger 'initial')
- `regen` — targets an existing `quiz_bank` row, generates a new `quiz_distractors` row only (generation N+1, trigger from job)

### 4.4 Distractor Regen Cron (Daily)

A separate lightweight daily cron checks two trigger conditions and enqueues `regen` jobs:

**Trigger 1 — Familiarity milestone:** when `current_tier` advances, enqueue regen for all quizzes of that kanji. Fresh distractors calibrated to the new tier are more instructive.

**Trigger 2 — Serve count + stale familiarity:** when `quiz_bank.served_count >= 5` AND `user_kanji.familiarity` unchanged for 14+ days. Catches the user stuck at a tier who has memorized the option landscape.

Old distractor sets are never deleted — they accumulate for evaluation.

### 4.5 Claude Prompt (Call #2 — Initial Quiz Generation)

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
    "prompt": "次の電車は何時に来ますか？",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "train",
    "distractors": ["bus", "taxi", "subway"],
    "explanation": "電車 literally means electric vehicle — the standard word for train"
  },
  {
    "quiz_type": "fill_in_the_blank",
    "prompt": "次の＿＿は何時に来ますか？",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "電車",
    "distractors": ["急行", "地下鉄", "バス停"],
    "explanation": "電車 fits here — asking when the next train arrives"
  }
]

Rules:
- Sentences must reflect real daily life in Japan
- Distractors must be plausible — never obviously wrong
- Explanations brief and memorable, not academic
- furigana is null for word-level types; always a string for sentence-level
```

### Definition of Done

- [ ] Worker runs on 2-minute coroutine schedule
- [ ] Processes up to 10 jobs per cycle
- [ ] Status transitions correctly
- [ ] Failed jobs with `attempts < 3` retried
- [ ] Exactly 5 quizzes per job in `quiz_bank` (initial jobs)
- [ ] 1 `quiz_distractors` row per quiz created with generation=1, trigger='initial'
- [ ] Regen jobs create new `quiz_distractors` rows without modifying `quiz_bank`
- [ ] Daily cron enqueues regen jobs for milestone + serve count triggers
- [ ] Verified end-to-end: photo → selection → wait 2 min → 5 quiz_bank rows + 5 quiz_distractors rows

---

# Iteration 5 — React: Slot-Based Quiz UI

The daily habit side of the loop. Configurable time slots, no score pressure, no rollover backlog.

### 5.1 Slot System (Ktor: GET /api/quiz/slot)

Default: 4 slots/day × 6 hours each (JST). Both values configurable in `user_settings`.

```
Slot 1:  00:00 – 05:59
Slot 2:  06:00 – 11:59
Slot 3:  12:00 – 17:59
Slot 4:  18:00 – 23:59
```

- Slot row created on first request in window (`started_at` = null)
- `started_at` set on first `POST /api/quiz/result`
- Slot expired without starting → `{ quizzes: [], nextSlotAt }`
- No rollover — missed slots silently abandoned

Response:
```json
{
  "quizzes": [
    {
      "id": "uuid",
      "quiz_type": "fill_in_the_blank",
      "prompt": "次の＿＿は何時に来ますか？",
      "target": "電車",
      "furigana": "でんしゃ",
      "answer": "電車",
      "distractors": ["急行", "地下鉄", "バス停"],
      "explanation": "電車 fits here",
      "familiarity": 1,
      "currentTier": "reading_recognition"
    }
  ],
  "remaining": 4,
  "slotEndsAt": "2026-03-21T11:59:59+09:00",
  "nextSlotAt": "2026-03-21T12:00:00+09:00"
}
```

### 5.2 Quiz Selection Priority

| Priority | Source | Cap |
|----------|--------|-----|
| 1 | Overdue current-tier (`next_review < now()`) | Up to 60% of allowance |
| 2 | New kanji, never served | Up to 20% of allowance |
| 3 | Resurfaced lower-tier (weighted by familiarity table) | Remainder |

For each selected quiz, `QuizService` resolves the distractor set to use:
- Find latest `quiz_distractors` row where `served_at is null`
- If none available: fall back to latest set + enqueue regen job in background
- Mark `quiz_distractors.served_at` when the quiz is returned to client

### 5.3 Quiz Card UI — Per Type

**`meaning_recall`** — Large kanji. 4 meaning options. Furigana revealed on answer.

**`reading_recognition`** — Kanji/compound large. 4 furigana options.

**`reverse_reading`** — Furigana large. 4 kanji compound options.

**`bold_word_meaning`** — Sentence with target bolded. Furigana below. 4 meaning options.

**`fill_in_the_blank`** — Sentence with `＿＿` gap:
- familiarity 0–4 → 4 MC options
- familiarity 5 → free text input

All cards: reveal answer → show correct/incorrect + explanation. Slot complete → summary with streak + next slot time.

### 5.4 POST /api/quiz/result

```json
{ "quizId": "uuid", "correct": true }
```

- First call in slot: sets `quiz_slots.started_at`
- Increments `quiz_slots.completed` and `quiz_bank.served_count`
- Marks `quiz_distractors.served_at` for the set that was used
- Inserts `quiz_serves` row (quiz_id, distractor_set_id, slot_id, correct, familiarity_at_serve)
- Correct + current-tier: `familiarity + 1`, advance `current_tier`
- Correct + resurfaced: update `next_review` only
- Incorrect: `familiarity - 1` (min 0), `next_review = tomorrow`, regress `current_tier` if needed

### Definition of Done

- [ ] `GET /api/quiz/slot` returns quizzes + `remaining`, `slotEndsAt`, `nextSlotAt`
- [ ] Slot created on first request, `started_at` set on first answer
- [ ] Expired unstarted slots return empty + `nextSlotAt`
- [ ] Selection respects priority order and caps
- [ ] Current-tier gating applied per `user_kanji.current_tier`
- [ ] All 5 card types render correctly
- [ ] `fill_in_the_blank` MC for familiarity 0–4, free type for 5
- [ ] `POST /api/quiz/result` updates `familiarity`, `current_tier`, `next_review`
- [ ] `quiz_serves` row inserted on every answer
- [ ] `quiz_bank.served_count` incremented on every serve
- [ ] `quiz_distractors.served_at` marked on the used distractor set
- [ ] Summary screen shown after slot complete

---

# Iteration 6 — Tuning + Personal Kanji List + Settings

Adds visibility, manual control, and settings after real usage data.

### 6.1 Personal Kanji List

- All `user_kanji` grouped by status: learning / familiar
- Familiarity dots (0–5) + current tier label + next review date
- Tap → detail view: quiz types, answer history, current resurfacing weights
- Familiar → learning promotion via tap

### 6.2 Manual Kanji Add

Search `kanji_master` by character → add as familiar or learning. Covers kanji encountered without a photo.

### 6.3 Progress Indicators

- Current slot: quizzes remaining + time to next slot
- Daily streak (slots with ≥1 answer)
- Total kanji: learning vs familiar

### 6.4 Settings Screen

Wired to `PUT /api/settings`. Changes take effect from next slot.

| Setting | Input | Default |
|---------|-------|---------|
| `quiz_allowance_per_slot` | Number input | 5 |
| `slot_duration_hours` | Selector: 3 / 6 / 8 / 12 | 6 |

### 6.5 SM-2 Interval Review

After 2 weeks of real usage:
- Too many quizzes pile up same day → spread intervals
- Familiarity 5 reappears too often → extend 30-day cap
- Forgotten kanji reset too aggressively → soften decrement

### Definition of Done

- [ ] Kanji list shows status, familiarity, tier, next review
- [ ] Manual add works via `kanji_master` search
- [ ] Settings screen wired to `PUT /api/settings`
- [ ] Slot queue + streak visible on home screen
- [ ] SM-2 intervals reviewed after 2 weeks

---

# Appendix — Architecture Reference

### Stack

| Layer | Technology | Role |
|-------|------------|------|
| Frontend | React | Photo capture, kanji selection, quiz UI |
| Backend | Ktor (Kotlin) | API, Claude calls, slot engine, background worker |
| Database | Supabase (Postgres) | Schema, auth, storage |
| AI | Claude API (`claude-sonnet-4-20250514`) | Vision extraction + quiz generation |
| Seed Data | kanjidic2 (edrdg.org) | Top 1500 kanji by frequency |

### Request Flow Summary

- **Call #1 (photo)** — Claude vision → kanji list → user selection → DB write + jobs enqueued
- **Call #2 (background)** — Claude text → 5 quizzes per kanji → `quiz_bank`
- **Slot quiz** — slot engine → tier-gated priority selection + weighted resurfacing → familiarity + tier update

### Key Design Decisions

- Claude API key server-side in Ktor only — never exposed to client
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
- `quiz_serves` provides full answer history per distractor set — foundation for future prompt optimization
- Modules never import from each other — only from `core/`