# Kanji Learning App — Phase 2 Iteration Plan

_Multi-User · Shared Quiz Bank · Invite System · Stack unchanged_

---

## Overview

Phase 2 opens the app to a small trusted group of users. The core learning loop is unchanged — the work is in making data shared where it makes sense, keeping it personal where it doesn't, and adding the invite access layer.

**Why this order matters:** shared infrastructure (WordMaster, shared QuizBank) must exist before new users onboard, otherwise their words generate duplicate quiz content. The invite system gates all of this until the schema is ready.

### Phase 2 Iteration Order

| # | Scope | Why This Order |
|---|-------|----------------|
| 2.1 | Schema Migration — WordMaster + Shared QuizBank | Foundation — shared quiz reuse depends on this |
| 2.2 | Invite System | Gates new user access until infrastructure is ready |
| 2.3 | Per-User Onboarding Flow | First experience for invited users |
| 2.4 | Settings — Quiz Allowance Slider | Small UX improvement, natural fit with multi-user launch |

---

## Sharing Decision Reference

Quick reference for what is shared vs personal across all tables:

| Table | Scope | Notes |
|-------|-------|-------|
| `KanjiMaster` | ✅ Shared | Pure reference data — same for everyone |
| `WordMaster` | ✅ Shared (NEW) | Canonical word list, grows as users encounter new words |
| `QuizBank` | ✅ Shared (MIGRATED) | Quiz content is universal — sentences work for anyone in Japan |
| `QuizDistractor` | ✅ Shared (MIGRATED) | Distractor content is word-agnostic |
| `UserKanji` | ❌ Personal | Each user's learning state per kanji |
| `UserWords` | ❌ Personal | Each user's relationship to a word — familiarity, progress, source |
| `QuizGenerationJob` | ❌ Personal queue | Tracks pending generation per user |
| `QuizServe` | ❌ Personal | Each user's answer history |
| `QuizSlot` | ❌ Personal | Each user's session |
| `ChallengeSession` | ❌ Personal | Each user's milestone |
| `PhotoSession` | ❌ Personal | Each user's photos |
| `UserSettings` | ❌ Personal | Each user's preferences |
| `UserInvite` | ❌ Admin | Invite management |

---

# Iteration 2.1 — Schema Migration: WordMaster + Shared QuizBank

Migrates quiz content from per-user to shared. After this iteration, quiz rows are generated once per word globally and reused across all users. Personal progress is always tracked per user in `UserWords`.

### 2.1.1 New and Updated Schema

**`WordMaster`** — NEW. Shared canonical word list. Grows as any user encounters new words. Similar role to `KanjiMaster`.

```graphql
type WordMaster @table {
  id: UUID! @default(expr: "uuidV4()")
  word: String! @unique
  reading: String!
  meanings: [String!]!
  kanjiIds: [UUID!]!          # constituent KanjiMaster IDs
  frequency: Int              # derived from encounter count across users
  createdAt: Timestamp! @default(expr: "request.time")
}
```

**`UserWords`** — UPDATED. Now references `WordMaster` instead of storing word data directly. Familiarity and progress remain personal.

```graphql
type UserWords @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  wordMaster: WordMaster!           # reference to shared word (replaces inline word/reading/meaning)
  source: WordSource!
  discoveredViaKanjiId: UUID
  familiarity: Int! @default(value: 0)
  currentTier: QuizType! @default(value: "MEANING_RECALL")
  nextReview: Timestamp
  unlocked: Boolean! @default(value: false)
  createdAt: Timestamp! @default(expr: "request.time")
  # unique constraint: (userId, wordMasterId)
}
```

**`QuizBank`** — UPDATED. `userId` becomes nullable — `null` means global/shared. `word` now references `WordMaster` instead of `UserWords`.

```graphql
type QuizBank @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String              # null = global shared quiz; set = user-specific override
  kanji: KanjiMaster!
  word: WordMaster!           # shared word reference (was UserWords)
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

**`QuizDistractor`** — UPDATED. Also shared when `userId = null`.

```graphql
type QuizDistractor @table {
  id: UUID! @default(expr: "uuidV4()")
  quiz: QuizBank!
  userId: String              # null = global shared distractor set
  distractors: [String!]!
  generation: Int!
  trigger: DistractorTrigger!
  familiarityAtGeneration: Int!
  servedAt: Timestamp
  createdAt: Timestamp! @default(expr: "request.time")
}
```

**`QuizGenerationJob`** — UPDATED. References `WordMaster` instead of `UserWords`.

```graphql
type QuizGenerationJob @table {
  id: UUID! @default(expr: "uuidV4()")
  userId: String!
  kanji: KanjiMaster!
  wordMaster: WordMaster!     # the word to generate quizzes for
  quiz: QuizBank
  jobType: JobType! @default(value: "INITIAL")
  trigger: String
  status: JobStatus! @default(value: "PENDING")
  attempts: Int! @default(value: 0)
  createdAt: Timestamp! @default(expr: "request.time")
}
```

**`UserInvite`** — NEW. Manages invite-only access.

```graphql
enum InviteStatus { PENDING, ACCEPTED, REVOKED }

type UserInvite @table {
  id: UUID! @default(expr: "uuidV4()")
  email: String! @unique
  invitedBy: String!          # userId of admin who sent the invite
  status: InviteStatus! @default(value: "PENDING")
  createdAt: Timestamp! @default(expr: "request.time")
  acceptedAt: Timestamp
}
```

### 2.1.2 Word Encounter Flow — Updated

When any user encounters a word (via photo or word discovery), the system now:

1. Check `WordMaster` for the word string — if exists, reuse
2. If not found — insert new `WordMaster` row
3. Check `QuizBank` where `wordMasterId = X` and `userId = null` — if quizzes exist, reuse
4. If no quizzes — enqueue `QuizGenerationJob` (generates global quizzes, `userId = null` on resulting rows)
5. Always insert personal `UserWords` row linking to `WordMaster`

```kotlin
fun handleWordEncountered(userId: String, word: String, reading: String,
                          meaning: String, kanjiIds: List<UUID>, source: WordSource) {

    // 1. Find or create WordMaster
    val wordMaster = wordMasterRepo.findByWord(word)
        ?: wordMasterRepo.insert(word, reading, meaning, kanjiIds)

    // 2. Check for existing global quizzes
    val hasGlobalQuizzes = quizBankRepo.existsGlobal(wordMaster.id)

    // 3. Enqueue generation only if no global quizzes yet
    if (!hasGlobalQuizzes) {
        jobRepo.enqueue(
            userId = userId,
            wordMasterId = wordMaster.id,
            kanjiId = primaryKanjiId
        )
    }

    // 4. Always create personal UserWords row
    userWordsRepo.insertIfAbsent(
        userId = userId,
        wordMasterId = wordMaster.id,
        source = source
    )
}
```

### 2.1.3 Quiz Generation — Global Output

The Firebase Function `generate_quizzes` now writes `QuizBank` rows with `userId = null`:

```python
# functions/main.py

def generate_quizzes_for_word(job):
    word = job["wordMaster"]
    kanji = job["kanji"]

    # Check again in case another user's job already generated these
    existing = query_global_quizzes(word["id"])
    if existing:
        mark_job_done(job["id"])
        return

    prompt = build_quiz_prompt(word, kanji)
    response = gemini_client.generate_content(prompt, ...)
    quizzes = json.loads(response.text)

    for quiz in quizzes:
        insert_quiz_bank(
            user_id=None,           # global — shared across all users
            word_master_id=word["id"],
            kanji_id=kanji["id"],
            **quiz
        )
        insert_quiz_distractor(
            user_id=None,           # global
            quiz_id=new_quiz_id,
            distractors=quiz["distractors"],
            generation=1,
            trigger="INITIAL"
        )
```

### 2.1.4 Serve-Time Resolution — Global Quizzes for Personal Users

When `QuizService` selects quizzes for a user's slot, it queries `QuizBank` where either `userId = currentUser` OR `userId = null`. Global quizzes are served to all users. The `QuizServe` row records which user answered — always personal regardless of quiz scope.

```kotlin
fun getServableQuizzes(userId: String): List<QuizBank> {
    return quizBankRepo.findForUser(userId)
    // query: WHERE userId = $userId OR userId IS NULL
}
```

### 2.1.5 Data Migration Script

One-time migration for existing data (your personal quizzes from Phase 1):

1. For each unique word string in existing `UserWords` — insert `WordMaster` row
2. Update existing `UserWords` rows to reference `WordMaster`
3. Update existing `QuizBank` rows to reference `WordMaster` and set `userId = null`
4. Update existing `QuizDistractor` rows to set `userId = null`
5. Update existing `QuizGenerationJob` rows to reference `WordMaster`

```bash
python scripts/migrate_phase2.py --env prod
```

### Definition of Done

- [ ] `WordMaster` table added to schema
- [ ] `UserWords` updated to reference `WordMaster`
- [ ] `QuizBank.userId` nullable — null = global
- [ ] `QuizDistractor.userId` nullable — null = global
- [ ] `QuizGenerationJob` references `WordMaster`
- [ ] `UserInvite` table added to schema
- [ ] Word encounter flow checks `WordMaster` before inserting
- [ ] Quiz generation writes global rows (`userId = null`)
- [ ] Slot selection queries both global and personal quizzes
- [ ] `QuizServe` always personal regardless of quiz scope
- [ ] Migration script runs cleanly on existing data
- [ ] Verified: two users learning same word share QuizBank rows, track progress independently

---

# Iteration 2.2 — Invite System

Gates new user access. You create invites; users sign up via an invite link; Firebase Auth handles identity; Ktor validates invite status on first login.

### 2.2.1 Invite Flow

```
You (admin):
  POST /api/admin/invite { email }
    → insert UserInvite row (status: PENDING)
    → send email with signup link: https://app.com/signup?invite={id}

New user:
  Opens signup link
  → Signs up via Firebase Auth (Google or email/password)
  → On first authenticated request, Ktor checks UserInvite for their email
      → PENDING → mark ACCEPTED, create UserSettings row, allow access
      → no invite / REVOKED → return 403

You (admin):
  PUT /api/admin/invite/{id}/revoke
    → set status REVOKED
    → optionally disable Firebase Auth account
```

### 2.2.2 Ktor Middleware — Invite Guard

A Ktor plugin that runs on every authenticated request for new users. Checks are cached after first successful validation so it doesn't query on every request:

```kotlin
fun Application.configureInviteGuard() {
    intercept(ApplicationCallPipeline.Plugins) {
        val userId = call.principal<UserPrincipal>()?.uid ?: return@intercept
        val email = call.principal<UserPrincipal>()?.email ?: return@intercept

        // Check UserSettings — if row exists, user is already onboarded
        val settings = userSettingsRepo.findByUserId(userId)
        if (settings != null) return@intercept  // already validated, skip

        // First login — validate invite
        val invite = inviteRepo.findByEmail(email)
        if (invite == null || invite.status == InviteStatus.REVOKED) {
            call.respond(HttpStatusCode.Forbidden, "No valid invite found")
            finish()
            return@intercept
        }

        // Accept invite + create UserSettings in one @transaction mutation
        inviteRepo.acceptAndCreateSettings(invite.id, userId)
    }
}
```

### 2.2.3 Admin Endpoints

Simple admin-only endpoints. Protected by checking `userId` against a hardcoded admin list in `AppConfig` — no need for a full role system at this scale.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/invite` | Create invite, send email |
| `GET` | `/api/admin/invites` | List all invites with status |
| `PUT` | `/api/admin/invite/{id}/revoke` | Revoke access |

### 2.2.4 Invite Email

Plain text email via Firebase Extensions (Trigger Email) or a simple SMTP call from a Firebase Function:

```
Subject: You're invited to Kanji App

[Name] has invited you to join Kanji App —
a photo-driven kanji learning tool for people living in Japan.

Click to get started:
https://app.com/signup?invite={inviteId}

This link is personal to you. Do not share it.
```

### Definition of Done

- [ ] `POST /api/admin/invite` creates `UserInvite` row and sends email
- [ ] Signup page reads `?invite={id}` and pre-fills email
- [ ] Firebase Auth signup works (Google + email/password)
- [ ] First login validates invite → creates `UserSettings` → allows access
- [ ] Invalid or revoked invite returns 403 with clear message
- [ ] `GET /api/admin/invites` lists all invites with status
- [ ] `PUT /api/admin/invite/{id}/revoke` sets status REVOKED
- [ ] Invite accept + UserSettings creation wrapped in `@transaction`

---

# Iteration 2.3 — Per-User Onboarding Flow

The first experience for invited users. They need to seed their known kanji before the app is useful — same as you did in Phase 1, but with a guided first-run flow.

### 2.3.1 Onboarding Steps

```
1. Welcome screen
   "Welcome to Kanji App. Let's set up your profile."

2. Known kanji seeding (optional but recommended)
   "Mark kanji you already know — these won't be quizzed at beginner level."
   → Searchable grid of KanjiMaster (top 300 by frequency shown first)
   → Tap to mark familiar
   → Can skip entirely

3. First photo prompt
   "Take your first photo — any sign, menu, or notice around you."
   → Launches camera directly

4. Done → home screen
```

### 2.3.2 Onboarding State

Tracked via a `onboardingComplete` flag on `UserSettings`:

```graphql
type UserSettings @table(key: "userId") {
  userId: String! @unique
  quizAllowancePerSlot: Int! @default(value: 5)
  slotDurationHours: Int! @default(value: 6)
  timezone: String! @default(value: "Asia/Tokyo")
  onboardingComplete: Boolean! @default(value: false)   # NEW
  updatedAt: Timestamp! @default(expr: "request.time")
}
```

Ktor checks `onboardingComplete` on first load — if false, redirect to onboarding flow. Set to true when user reaches the home screen after step 3 (or skips).

### 2.3.3 Bulk Familiar Kanji Endpoint

Allows seeding many familiar kanji at once from the onboarding grid:

```
POST /api/kanji/bulk-familiar
{ "kanjiMasterIds": ["uuid1", "uuid2", ...] }
```

Inserts `UserKanji` rows with `status = FAMILIAR` for each. No quiz generation jobs — same as marking familiar in the photo selection flow. Wrapped in a single `@transaction` mutation.

### Definition of Done

- [ ] New users see onboarding flow on first login
- [ ] Known kanji grid shows top 300 by frequency, searchable
- [ ] Bulk familiar seeding via `POST /api/kanji/bulk-familiar`
- [ ] First photo prompt launches camera
- [ ] `onboardingComplete` set to true after first photo or skip
- [ ] Returning users skip onboarding entirely
- [ ] Onboarding can be re-triggered from settings ("Re-seed known kanji")

---

# Iteration 2.4 — Settings: Quiz Allowance Slider + Timezone

Small UX improvements that make more sense now that multiple users with different habits are using the app.

### 2.4.1 Quiz Allowance Slider

Replace the number input with a slider. Range: 5–15, step 1. Default: 5.

```
Quiz per session: [5 ——●————————] 15
                        8
```

Label updates live as slider moves. Changes take effect from next slot — shown as a note below the slider.

### 2.4.2 Timezone Selection

Previously hardcoded to `Asia/Tokyo`. Now user-selectable for friends who might be elsewhere or traveling. Practical short list — no need for full IANA timezone picker:

| Label | Value |
|-------|-------|
| Japan (JST) | Asia/Tokyo |
| Korea (KST) | Asia/Seoul |
| Australia EST | Australia/Sydney |
| UK (GMT/BST) | Europe/London |
| US East (ET) | America/New_York |
| US West (PT) | America/Los_Angeles |

Default remains `Asia/Tokyo`.

### 2.4.3 Updated Settings Screen

```
Quiz Session
  Quizzes per session
  [Slider 5–15, current value shown]
  Changes take effect from your next session.

  Session window
  [Selector: 3h / 6h / 8h / 12h]

  Timezone
  [Dropdown: Japan (JST) selected]

Account
  [Re-seed known kanji]
  [Sign out]
```

### Definition of Done

- [ ] Quiz allowance rendered as slider (5–15, step 1)
- [ ] Live value label updates as slider moves
- [ ] Timezone selector with 6 options, defaults to Asia/Tokyo
- [ ] Slot window calculation uses `UserSettings.timezone`
- [ ] Settings changes persist via `PUT /api/settings`
- [ ] "Re-seed known kanji" navigates back to onboarding step 2

---

# Appendix — Phase 2 Architecture Notes

### What changed from Phase 1

**New tables:** `WordMaster`, `UserInvite`

**Modified tables:**
- `UserWords` — references `WordMaster` instead of storing word data inline
- `QuizBank` — `userId` nullable, `word` references `WordMaster`
- `QuizDistractor` — `userId` nullable
- `QuizGenerationJob` — references `WordMaster`
- `UserSettings` — adds `onboardingComplete`, `timezone`

**New endpoints:**
- `POST /api/admin/invite`
- `GET /api/admin/invites`
- `PUT /api/admin/invite/{id}/revoke`
- `POST /api/kanji/bulk-familiar`

**New Firebase Function:** none — existing `generate_quizzes` updated to write global rows.

### API Cost Model

Flat $5/user contribution, trust-based. No automated billing or usage enforcement in Phase 2. If API costs become a concern in Phase 3, add `costMicrodollars` tracking per user by summing `PhotoSession.costMicrodollars` and estimating quiz generation cost per job.

### Shared Quiz Reuse — Expected Impact

After a small group uses the app for a few weeks, the shared `QuizBank` will cover most common daily-life vocabulary. Gemini generation calls will reduce significantly — new calls only trigger for words no one in the group has encountered yet. The first user to encounter a word pays the generation cost; everyone after reuses for free.

### Key Design Decisions

**WordMaster grows organically** — no pre-seeded word dictionary. Words enter `WordMaster` the first time any user encounters them via photo or word discovery. The shared bank reflects real vocabulary from real daily life in Japan, not an academic corpus.

**Global quizzes, personal progress** — `QuizBank` rows with `userId = null` are the canonical quiz content. Personal `QuizServe` rows track who answered what. This separation means a user can be deleted cleanly (remove all personal rows) without affecting the shared quiz content.

**Invite acceptance is atomic** — `UserInvite` status update and `UserSettings` creation happen in a single `@transaction` mutation. A failure in either step leaves the user in a clean state — they can retry signup without corrupting invite state.

**No role system** — admin access is a hardcoded `userId` check in `AppConfig`. At this scale (5–10 users) a full RBAC system is unnecessary overhead.