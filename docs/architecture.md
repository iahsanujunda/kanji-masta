# Architecture — Kanji Masta

_Last updated: 2026-08-06_

## Purpose

Kanji Masta is a mobile-first learning application built around real encounters with written
Japanese. A learner photographs text, chooses kanji to learn, receives generated vocabulary
and quizzes, and practises through bounded learning sessions.

## Runtime topology

One Gradle project produces one fat JAR and one Docker image. The launcher selects a role:

| Role | Current Cloud Run resource | Responsibility |
|---|---|---|
| `web` | `kanji-masta-backend` service | Public Ktor API, auth, learning flows, admin UI API, inline word-discovery capability |
| `photo-job` | `photo-analysis-kotlin` Job | Claim one photo attempt, analyze it, enrich kanji, write its terminal result |
| `quiz-job drain` | `quiz-generation-kotlin` Job | Claim and execute a bounded quiz-generation batch |
| `quiz-job check-regen` | execution override of the quiz Job | Enqueue eligible distractor-regeneration work |
| `local-dispatcher` | local Compose only | Accept a dispatch and start a fresh JVM with the matching Job role |

The frontend is a React SPA. Supabase owns authentication, PostgreSQL, and photo storage.
OpenRouter is the only runtime AI provider. Model IDs are not environment variables: the
active validated `ai_model_config` row is authoritative for photo analysis, quiz generation,
and word discovery.

```text
React SPA
   │ Supabase JWT
   ▼
Ktor web role ──────────────── Supabase PostgreSQL
   │ Jobs API                         ▲
   ├── photo-job ── OpenRouter ───────┤
   └── quiz-job  ── OpenRouter ───────┘
```

The Jobs do not call the backend with their results. They use the same Ktorm repositories and
terminal-write services as the web artifact and write directly to PostgreSQL.

### Local execution parity

Docker Compose always starts `backend` and `job-dispatcher` as separate processes. There is no
inline execution fallback and no feature flag that bypasses dispatching:

```text
backend → HTTP dispatch → job-dispatcher → fresh java -jar process → Ktorm/OpenRouter
```

The dispatcher validates a local-only shared key and a narrow per-role environment contract,
then returns `202` only after the child JVM starts. Stopping the dispatcher exercises a failed
handoff; stopping a child JVM exercises interruption after acceptance. Production replaces the
local HTTP/process-launch adapter with the Cloud Run Jobs API while preserving the service,
repository, launcher role, durable claim, and terminal-write paths.

## Code organization

```text
backend/src/main/kotlin/com/kanjimasta/
├── Main.kt                    # role dispatch
├── Application.kt             # Ktor composition root
├── AiRuntime.kt               # shared AI component composition
├── core/
│   ├── ai/                    # OpenRouter transport, model config, prompts
│   ├── auth/                  # Supabase JWT and Google Jobs API credentials
│   ├── db/                    # Ktorm connection and table definitions
│   ├── jobs/                  # Cloud Run Job dispatcher
│   ├── plugins/               # Ktor plugins and route composition
│   └── storage/               # Supabase signed-photo access
└── modules/
    ├── admin/                 # job recovery, costs, model control plane
    ├── photo/                 # photo API, durable claim, executor, persistence
    ├── kanji/                 # kanji/word flows and inline word discovery
    ├── quiz/                  # learning-session selection and answers
    ├── worker/                # quiz generation and regeneration executor
    └── ...
```

Modules contain Routes, Service, Repository, and Models as appropriate. Modules import shared
infrastructure from `core`; `Application.kt` and `AiRuntime.kt` are the composition roots.
Production database access uses Ktorm table definitions from `core/db/Tables.kt`.

## Photo flow

```text
1. Frontend uploads a photo to private Supabase Storage.
2. POST /api/photo/analyze creates photo_session and pending job_attempt atomically.
3. The web role dispatches photo-analysis-kotlin with PHOTO_SESSION_ID.
4. photo-job claims the attempt with a lease and random claim token.
5. It downloads the signed image and calls the active OpenRouter vision model.
6. It enriches recognized characters from kanji_master.
7. A claim-fenced transaction writes photo_session, job_attempt, and user_cost.
8. Frontend polling observes DONE or FAILED.
```

The browser request returns after durable enqueue and Job dispatch; it never waits for the AI
call. A local backend with no Cloud Run Job name executes the same Kotlin executor in-process.

## Kanji, word, and quiz-generation flow

When a learner saves selected kanji, the backend writes `user_kanji`. Example words from the
photo result, or existing `word_master` rows for manual additions, become personal
`user_words`. Missing global quiz content creates `quiz_generation_job` and its initial
pending `job_attempt` in one transaction.

The web role dispatches `quiz-generation-kotlin`. Its bounded drainer:

1. reconciles an expired lease if one exists;
2. selects the oldest pending source row with `FOR UPDATE SKIP LOCKED`;
3. claims only that row and commits before calling OpenRouter;
4. generates initial quizzes or a replacement distractor set;
5. writes content, terminal status, and per-attempt cost in a fenced transaction;
6. repeats up to the configured batch size.

Generated quiz IDs and distractor IDs are stable for an attempt. `quiz_bank` also records the
source attempt and item index. Retrying the same completion cannot create duplicate content.

## Word discovery

Word discovery is retained as `WordDiscoveryService` in the Kotlin `kanji` module. It uses the
database-authoritative `word_discovery_model`, writes `word_master` and `user_words` through
Ktorm, and atomically creates quiz jobs and attempts when shared quizzes are absent.

It has no automatic product trigger. Manual kanji addition continues to use existing words;
activating discovery there is a separate product decision.

## Durable execution and recovery

`job_attempt` is the execution authority for photo and quiz work:

- the source row and initial pending attempt commit before external dispatch;
- `claim_token`, `lease_until`, and `claimed_by` identify one active executor;
- terminal writes require the matching active claim token;
- an expired attempt becomes failed with `lease_expired`, and a new numbered reconciler
  attempt receives a fresh token;
- a Cloud Run retry may immediately replace its own attempt, identified by execution/task;
- unrelated executors wait for lease expiry;
- `user_cost.job_attempt_id` makes provider cost idempotent per real attempt;
- the Admin Jobs page preserves attempt history and can rerun failed work.

During the Cloud Run migration window, legacy callback routes remain temporarily available.
They can apply only when the active attempt has no Kotlin claim token. A callback that targets
Kotlin-owned work receives a conflict and cannot overwrite it. `INTERNAL_API_KEY` also protects
the existing scheduled stale-cleanup route.

## Learning-session model

The quiz module creates durable `quiz_slot` and `quiz_session_card` plans. Cards are selected
from unlocked words and global/personal quiz content, then answered idempotently through a
submission ID. Familiarity and review scheduling live on `user_words`; introduction and quiz
cards share one ordered session plan.

The detailed learning rules and their historical rollout are documented in `phase3.md` and
the relevant migrations.

## Data model

The schema authority is `supabase/migrations/`. Important groups are:

| Concern | Tables |
|---|---|
| Shared reference data | `kanji_master`, `word_master` |
| Personal learning state | `user_kanji`, `user_words`, `user_settings` |
| Photo capture | `photo_session`, `user_photo_activity_state` |
| Quiz content | `quiz_bank`, `quiz_distractor` |
| Learning sessions | `quiz_slot`, `quiz_session_card`, `quiz_serve` |
| Durable AI work | `quiz_generation_job`, `job_attempt`, `user_cost` |
| Operations | `ai_model_config`, invites/admin-facing records |

`quiz_bank.user_id IS NULL` denotes shared global content; a non-null user ID is a personal
override. `WordMaster` is shared vocabulary, while `UserWords` carries personal progress.

## Security boundaries

- The frontend receives only Supabase publishable credentials.
- Ktor verifies Supabase JWTs and derives the user ID from the authenticated principal.
- The Supabase service-role key, OpenRouter key, Resend key, and Google credentials stay
  server-side.
- Cloud Run Jobs are not public HTTP services; the backend service account receives the Job
  execution role.
- Job results are authorized by database claim tokens rather than network location or a
  callback secret.
- Private photo objects are accessed through short-lived signed URLs.

## Configuration

Shared runtime configuration includes:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
OPENROUTER_BASE_URL
OPENROUTER_REASONING_EFFORT
OPENROUTER_SITE_URL
OPENROUTER_APP_NAME
HIKARI_MAX_POOL_SIZE
JOB_LEASE_SECONDS
QUIZ_JOB_BATCH_SIZE
```

The web role additionally uses `PHOTO_ANALYSIS_JOB`, `QUIZ_GENERATION_JOB`, CORS, auth,
Resend, admin, and temporary internal-cleanup configuration. `photo-job` receives
`PHOTO_SESSION_ID` per execution.

## Build, test, and deployment

`backend/build.gradle.kts` sets `MainKt` as the sole application main class and builds
`kanji-masta.jar`. The Docker image entrypoint is `java -jar app.jar`, with `web` as its
default argument. Cloud Run overrides only the arguments for each Job.

Backend tests use Ktor MockEngine for external HTTP and Testcontainers PostgreSQL with all
production migrations. See `test.md`. Deployment and cutover sequencing, including retention
of the already deployed Python rollback targets, is documented in `infra-migration.md`.
