# Kanji Masta

Photo-driven kanji learning for people living in Japan. Capture signs and menus, choose
kanji to learn, and practise them through generated spaced-repetition quizzes.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React, MUI, Vite, TanStack Query |
| API and AI execution | Ktor and Kotlin, built as one fat JAR/image |
| Durable AI work | Cloud Run Jobs using the same Kotlin image as the API |
| AI provider | OpenRouter; active model IDs stored in PostgreSQL |
| Auth, database, storage | Supabase |
| Database access | Ktorm |
| Frontend hosting | GCS behind Cloudflare |

The Kotlin artifact has three launcher roles:

```text
web                    Ktor API and inline word-discovery capability
photo-job              one durable photo-analysis execution
quiz-job drain         bounded quiz-generation batch
quiz-job check-regen   scheduled regeneration eligibility pass
local-dispatcher       development-only process launcher for the two Job roles
```

Photo and quiz Jobs claim durable PostgreSQL attempts with leases and claim tokens, call
OpenRouter, and write terminal results directly through Ktorm. There is no maintained Python
worker or worker-to-backend result callback.

## Local development

Copy `.env.example` to `.env` and configure `OPENROUTER_API_KEY`. Model IDs are managed from
the Admin model-settings UI and stored in the active `ai_model_config` row.

Run the stack in three terminals:

```bash
make supabase-start   # local database/auth/storage + pending migrations
make backend          # Ktor API + mandatory local Job dispatcher
make frontend         # Vite development server
```

Alternatively, after starting Supabase:

```bash
make up               # backend + frontend through Docker Compose
```

Useful commands:

```bash
make setup
make test
make test-backend
make test-frontend
make test-frontend-e2e
make quiz-job
make check-regen
make photo-job PHOTO_SESSION_ID=<uuid>
make psql
make reset-all
make check-deploy
```

Local requests never execute AI work inside the backend process. The backend sends the same
logical dispatch operation to the `job-dispatcher` Compose service, which starts a fresh JVM
from the same fat JAR using `photo-job` or `quiz-job drain`. Production swaps only this
dispatcher adapter for the Cloud Run Jobs API. A missing dispatcher, rejected request, failed
child-process start, or child-process crash is therefore observable locally.

The `photo-job` and `quiz-job` commands remain useful for manually running the same entrypoints;
they do not require another project or language toolchain.

To exercise dispatch failure locally, stop the dispatcher before making a request:

```bash
docker compose stop job-dispatcher
# submit a photo: its durable attempt becomes failed with dispatch_failed
docker compose start job-dispatcher
```

## Testing

Backend tests use JUnit 5, Ktor test hosts, MockEngine, Ktorm, and Testcontainers PostgreSQL.
The persistence harness applies every production migration from `supabase/migrations/` to a
fresh PostgreSQL database. Frontend component tests use Vitest; browser tests use Playwright.

```bash
make test             # backend + frontend component tests
make test-backend     # Kotlin unit/integration tests; Docker required
make test-frontend
make test-frontend-e2e
```

## Deployment

```bash
make deploy COMPONENT=db
make deploy COMPONENT=photo-job
make deploy COMPONENT=quiz-job
make deploy COMPONENT=workers   # both Kotlin Jobs
make deploy COMPONENT=backend   # tagged revision with no production traffic
make deploy COMPONENT=frontend
make deploy COMPONENT=all

make smoke COMPONENT=backend
make promote COMPONENT=backend  # explicit production traffic switch after verification
make scheduler ACTION=pause
make scheduler ACTION=retarget
make scheduler ACTION=resume    # only after both updated targets have been exercised
```

`make stage-kotlin-runtime` builds the commit-tagged image once and stages both the Jobs and
the no-traffic backend revision. The image is resolved to a digest before each Cloud Run
deployment. `make deploy-all` also stops before API traffic promotion; scheduler changes and
traffic promotion remain explicit cutover operations. Scheduler retargeting pauses both jobs
and intentionally leaves them paused until `make scheduler ACTION=resume` is invoked. Project,
region, scheduler names, scheduler service account, Job names, and candidate tag are stable
Makefile configuration and do not need to be supplied per invocation. The original explicit
targets remain available for rollback scripts and operational compatibility.

The shared image uses distinct runtime arguments:

```text
Cloud Run service               web
photo-analysis-kotlin Job       photo-job
quiz-generation-kotlin Job      quiz-job drain
```

The previously deployed Python service and photo Job are not updated or deleted by these
commands. They remain rollback targets only for the migration soak described in
[`docs/infra-migration.md`](docs/infra-migration.md).

## Project structure

```text
kanji-masta/
├── backend/                 # all maintained server and AI runtime code (Kotlin)
├── frontend/                # React SPA
├── supabase/migrations/     # schema authority
├── supabase/seed.sql
├── scripts/                 # offline seed/deployment utilities
├── docs/
├── Makefile
└── docker-compose.yml
```

Important backend locations:

```text
backend/src/main/kotlin/com/kanjimasta/
├── Main.kt                  # web/photo-job/quiz-job launcher
├── Application.kt           # Ktor composition root
├── AiRuntime.kt             # shared AI execution composition
├── core/ai/                 # OpenRouter client, models, and prompts
├── core/db/                 # Ktorm table definitions and database setup
├── core/jobs/               # Cloud Run and local process dispatch adapters
└── modules/
    ├── photo/               # photo API, claim, execution, and result persistence
    ├── kanji/               # kanji flows and inline word discovery
    └── worker/              # bounded quiz execution and regeneration
```

See [architecture.md](docs/architecture.md), [test.md](docs/test.md), and
[infra-migration.md](docs/infra-migration.md) for the detailed contracts and rollout plan.
