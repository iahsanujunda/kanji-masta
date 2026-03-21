# Architecture — Kanji Learning App

_Last updated: 2026-03-21_

---

## 1. Purpose

A personal mobile-first web app for learning to read Japanese kanji through real-life encounters. The user photographs signs, menus, and notices in Japan, selects which kanji they want to learn, and receives spaced-repetition quizzes across configurable daily time slots generated in the background by Claude.

Designed for a single user profile: conversational Japanese speaker, no formal study habit, living in Japan. The app optimizes for minimum friction at two moments — the capture moment (high motivation, in the wild) and the quiz moment (low friction, fits into any gap in the day).

---

## 2. Stack

| Layer | Technology | Version / Notes |
|-------|------------|-----------------|
| Frontend | React | Mobile-first, PWA |
| Backend | Ktor | Kotlin, `core/` + `modules/` structure |
| Database | Supabase | Postgres + Auth + Storage |
| AI | Claude API | `claude-sonnet-4-20250514`, server-side only |
| Seed Data | kanjidic2 | edrdg.org, top 1500 by frequency rank |

---

## 3. Core Learning Loop

```
📸 Photo taken
     │
     ▼
Ktor: Claude vision call (Call #1)
  → Extract kanji + 5 daily-life example words each
  → Return to frontend immediately
     │
     ▼
React: Kanji selection UI
  → User taps each card: ✓ Already Know  /  ★ Want to Learn
  → POST /api/kanji/session
     │
     ├── familiar  → write user_kanji, no quiz generation
     └── learning  → write user_kanji + enqueue quiz_generation_jobs
                          │
                          ▼ (async, user does not wait)
                  Background Worker (every 2 min)
                    → Claude text call (Call #2)
                    → Generate 5 quizzes per kanji (one per type)
                    → Store in quiz_bank
                          │
                          ▼
                  Slot-based Quiz Engine
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
- Image uploaded to `POST /api/photo/analyze`
- Image stored in Supabase Storage under `photos/{userId}/{uuid}.jpg`
- Claude vision model extracts all kanji found in the image
- Returns per kanji: character, 5 example words (daily-life focused), `whyUseful`, `recommended` flag (max 3)
- Readings and meanings for matched kanji enriched from `kanji_master` — Claude is not asked to supply these
- Raw Claude response persisted in `photo_sessions.raw_claude_response` — avoids re-billing if user revisits

### 4.2 Kanji Selection

- Each extracted kanji rendered as a card showing: large character, readings, primary meaning, one example word, recommended badge
- User taps to toggle: neutral → familiar → learning
- `familiar` — written to `user_kanji`, no quizzes generated; respects existing knowledge
- `learning` — written to `user_kanji` + job enqueued in `quiz_generation_jobs`
- User dismissed immediately after tapping Done — never waits for quiz generation

### 4.3 Background Quiz Generation

- Ktor coroutine worker runs every 2 minutes
- Drains `quiz_generation_jobs` queue, up to 10 jobs per cycle
- For each job: calls Claude text API with kanji details, generates 5 quizzes (one per type), stores in `quiz_bank`
- Job status transitions: `pending → processing → done | failed`
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
- Each slot has a configurable quiz allowance (default: 5, stored in `user_settings`)
- The slot counter **starts on first quiz answer** — not when the slot window opens
- A slot that expires without being started is quietly abandoned — no rollover, no backlog
- A started-but-incomplete slot can be finished any time within its window
- `GET /api/quiz/slot` returns current slot state: quizzes, remaining, `slotEndsAt`, `nextSlotAt`

**Why no rollover:** Accumulated backlogs are the primary cause of habit abandonment in spaced repetition apps. Missed slots disappear quietly, keeping each session feeling fresh and manageable.

### 4.5 Quiz Selection Logic

Within each slot, quizzes are selected in priority order up to the slot allowance:

| Priority | Source | Cap |
|----------|--------|-----|
| 1 | Overdue current-tier quizzes (`next_review < now()`) | Up to 60% of allowance |
| 2 | New kanji, never served (`served_at is null`) | Up to 20% of allowance |
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

Familiarity advances when the **current tier quiz** is answered correctly. Incorrect answer: familiarity -1 (min 0), `next_review = tomorrow`.

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

- Scrollable list of all `user_kanji` grouped by status: learning / familiar
- Familiarity shown as 0–5 dot bar with current tier label and next review date
- Tap any kanji → detail view with associated quiz types and answer history
- Familiar kanji can be moved to learning
- Manual add: search `kanji_master` by character → add as familiar or learning

### 4.9 User Settings

Configurable per user, stored in `user_settings`:

| Setting | Default | Description |
|---------|---------|-------------|
| `quiz_allowance_per_slot` | 5 | Quizzes available per slot |
| `slot_duration_hours` | 6 | Length of each slot window in hours |
| `timezone` | `Asia/Tokyo` | Used for slot boundary calculation |

Changing `quiz_allowance_per_slot` takes effect from the next slot.

### 4.10 Progress Indicators

- Current slot: quizzes remaining + time until slot closes
- Daily streak (slots with at least 1 quiz answered)
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

## 6. Database Schema

### `kanji_master`

Seeded once from kanjidic2. Read-only at runtime.

```sql
create table kanji_master (
                              id          uuid primary key default gen_random_uuid(),
                              character   text not null unique,
                              readings    jsonb not null default '{}',  -- { "on": ["でん"], "kun": [] }
                              meanings    text[],
                              frequency   int
);
```

Seed filter: `frequency IS NOT NULL AND frequency <= 1500`. JLPT level intentionally excluded.

### `user_kanji`

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

### `photo_sessions`

```sql
create table photo_sessions (
                                id                   uuid primary key default gen_random_uuid(),
                                user_id              uuid references auth.users,
                                image_url            text,
                                raw_claude_response  jsonb,
                                created_at           timestamptz default now()
);
```

### `quiz_generation_jobs`

`job_type` distinguishes initial generation from distractor regen jobs. Regen jobs target existing `quiz_bank` rows (via `quiz_id`) and insert new `quiz_distractors` rows rather than creating new quiz content.

```sql
create table quiz_generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users,
  kanji_id    uuid references kanji_master,
  quiz_id     uuid references quiz_bank,   -- null for initial, set for regen
  job_type    text default 'initial'
              check (job_type in ('initial', 'regen')),
  trigger     text,                        -- 'milestone', 'serve_count' for regen jobs
  status      text default 'pending'
              check (status in ('pending', 'processing', 'done', 'failed')),
  attempts    int default 0,
  created_at  timestamptz default now()
);
```

### `quiz_bank`

Stores the stable question content. Distractors are managed separately in `quiz_distractors`. `served_at` tracks when the quiz was last presented regardless of which distractor set was used.

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
  served_count  int default 0,     -- incremented on every serve
  served_at     timestamptz,
  created_at    timestamptz default now()
);
```

### `quiz_distractors`

One row per distractor set per quiz. Multiple sets accumulate over time — old sets are never deleted, enabling evaluation and prompt fine-tuning. At serve time the most recent unserved set is used.

```sql
create table quiz_distractors (
  id                          uuid primary key default gen_random_uuid(),
  quiz_id                     uuid references quiz_bank,
  user_id                     uuid references auth.users,
  distractors                 text[] not null,           -- always 3 options
  generation                  int not null,              -- 1 = initial, 2 = first regen, etc.
  trigger                     text not null              -- 'initial', 'milestone', 'serve_count'
                              check (trigger in ('initial', 'milestone', 'serve_count')),
  familiarity_at_generation   int not null,              -- familiarity when this set was generated
  served_at                   timestamptz,               -- null until this set is used
  created_at                  timestamptz default now()
);
```

### `quiz_serves`

Full answer history — one row per quiz attempt. Replaces the simple `served_at` timestamps and provides the evaluation signal needed for distractor fine-tuning.

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

### `quiz_slots`

```sql
create table quiz_slots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users,
  slot_start    timestamptz not null,
  slot_end      timestamptz not null,
  started_at    timestamptz,
  completed     int default 0,
  allowance     int not null,
  created_at    timestamptz default now()
);
```

### `user_settings`

```sql
create table user_settings (
  user_id                 uuid primary key references auth.users,
  quiz_allowance_per_slot int default 5,
  slot_duration_hours     int default 6,
  timezone                text default 'Asia/Tokyo',
  updated_at              timestamptz default now()
);
```

### Row Level Security

RLS enabled on all user-scoped tables: `user_kanji`, `photo_sessions`, `quiz_generation_jobs`, `quiz_bank`, `quiz_distractors`, `quiz_serves`, `quiz_slots`, `user_settings`. All policies enforce `user_id = auth.uid()`.

---

## 7. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/photo/analyze` | Multipart image → Claude vision → kanji breakdown |
| `POST` | `/api/kanji/session` | Save kanji selections, enqueue quiz generation jobs |
| `GET` | `/api/kanji/list` | User's full kanji list with familiarity, tier, review dates |
| `POST` | `/api/kanji/add` | Manually add a kanji from `kanji_master` |
| `GET` | `/api/quiz/slot` | Current slot state: quizzes, remaining, `slotEndsAt`, `nextSlotAt` |
| `POST` | `/api/quiz/result` | Submit answer → update familiarity, tier, `next_review` |
| `GET` | `/api/settings` | Fetch user settings |
| `PUT` | `/api/settings` | Update `quiz_allowance_per_slot`, `slot_duration_hours`, `timezone` |

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
    │                           → create row (started_at = null)
    ▼
slot_end < now() AND started_at IS NULL?
  → return { quizzes: [], nextSlotAt }
         │
         ▼
remaining = allowance - completed
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
  → set quiz_slots.started_at = now()
  → increment quiz_slots.completed
  → insert quiz_serves row (quiz_id, distractor_set_id, correct, familiarity_at_serve)
  → increment quiz_bank.served_count
  → update user_kanji: familiarity, current_tier, next_review
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

```
src/
  core/
    config/
      AppConfig.kt
    client/
      ClaudeClient.kt
    auth/
      JwtConfig.kt
      UserPrincipal.kt
    db/
      Database.kt
    storage/
      StorageClient.kt
    plugins/
      Routing.kt
      Serialization.kt
      Authentication.kt

  modules/
    photo/
      PhotoRoutes.kt
      PhotoService.kt
      PhotoRepository.kt
      models/PhotoModels.kt

    kanji/
      KanjiRoutes.kt
      KanjiService.kt
      KanjiRepository.kt
      models/KanjiModels.kt

    quiz/
      QuizRoutes.kt
      QuizService.kt
      QuizRepository.kt
      models/QuizModels.kt

    settings/
      SettingsRoutes.kt
      SettingsRepository.kt

    worker/
      QuizGenerationWorker.kt       # handles both initial + regen job types
      DistractorRegenCron.kt        # daily cron checking regen triggers
      QuizGenerationRepository.kt

  Application.kt
```

**Boundary rule:** modules import from `core/` only — never from each other.

---

## 10. Claude API Usage

### Call #1 — Vision (photo analysis)

- Triggered by: `POST /api/photo/analyze`
- Model: `claude-sonnet-4-20250514`
- Input: base64 image
- Output: JSON array — `character`, `recommended`, `whyUseful`, `exampleWords` (5 per kanji)
- Readings and meanings enriched post-hoc from `kanji_master`
- Result stored in: `photo_sessions.raw_claude_response`

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

### Call #2 — Text (quiz generation, `job_type = initial`)

- Triggered by: background worker draining `quiz_generation_jobs` where `job_type = 'initial'`
- Model: `claude-sonnet-4-20250514`
- Input: kanji character + readings + meanings from `kanji_master`
- Output: JSON array of exactly 5 quiz objects (one per `quiz_type`)
- Result stored in: `quiz_bank` (one row per quiz) + `quiz_distractors` (generation 1, trigger 'initial')
- Claude API key: environment variable, server-side only

### Call #3 — Text (distractor regen, `job_type = regen`)

- Triggered by: daily cron via `quiz_generation_jobs` where `job_type = 'regen'`
- Model: `claude-sonnet-4-20250514`
- Input: existing quiz prompt + answer + previous distractor sets + current familiarity
- Output: JSON array of exactly 3 new distractors
- Result stored in: new `quiz_distractors` row (generation N+1, trigger from job)
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

**Claude not asked for readings on photo analysis.** Readings and meanings come from `kanji_master`. Claude is only asked for what it does uniquely well: recognizing kanji in images and knowing which words matter for daily life in Japan.

**Distractors are versioned, never replaced.** Each regen produces a new `quiz_distractors` row rather than overwriting the old one. Old sets accumulate and are queryable for evaluation — this enables comparing distractor difficulty across generations and fine-tuning the regen prompt over time. Serve time always picks the most recent unserved set; if exhausted, falls back to the latest while a new set generates in the background.

**Regen triggers are milestone-first.** The primary trigger is a familiarity tier crossing — at each new tier, fresher and harder distractors are pedagogically appropriate. The secondary trigger (serve count + stale familiarity) catches edge cases where the user is stuck at a tier and has memorized the option landscape.

**Modules never import from each other.** Each module imports only from `core/`. Cross-cutting concerns live in `core/` and are injected.