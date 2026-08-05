# Infrastructure Migration — Consolidate to Kotlin, then move to Fly.io + Cloudflare Pages

_Fold the Python AI worker into the Kotlin/Ktor codebase (Milestone 1), then optionally move
the runtime from Cloud Run + GCS to Fly.io + Cloudflare Pages (Milestone 2). Supabase remains
the database, auth, and storage provider throughout._

---

## 0. Two independent milestones

This document describes **two milestones that ship and stand on their own.** Do not treat the
first as merely a stepping stone to the second.

- **Milestone 1 — Kotlin consolidation (on Cloud Run).** Delete the Python worker; run one
  Kotlin image as a Cloud Run **service** (API + inline AI) plus Kotlin Cloud Run **Jobs**
  (photo analysis, quiz generation) that write results directly to Postgres. This is a
  **complete, durable, indefinitely-livable architecture.** It fixes the two-language /
  two-database-layer problem that motivates the whole effort, and **feature work proceeds on
  it** with no dependency on Milestone 2. If Milestone 2 never happens, Milestone 1 is still a
  strictly better place to be than today.

- **Milestone 2 — Fly.io + Cloudflare Pages (optional, later).** Replace the Cloud Run Jobs
  with an always-on in-process **queue drainer**, replace Google Cloud Scheduler with an
  in-process scheduler, and move the runtime to Fly.io + Cloudflare Pages. This changes only
  the *runtime platform* and the *durable-execution mechanism* — the Kotlin code, the AI
  clients, the durable database records, and the direct-write result handling all carry over
  unchanged from Milestone 1.

The single most important sequencing decision is already made: **Milestone 1 is a resting
state, not a transition.** The Kotlin Cloud Run Jobs it introduces are the durable-execution
model until and unless Milestone 2 is undertaken.

---

## 1. Why consolidate (motivation)

This migration begins with a language consolidation, and the consolidation carries the
justification. Do it first; the platform move is smaller and cleaner once there is one
application instead of two.

**1. Remove a second language and a duplicated database layer.** The AI worker's
[`services/ai-worker/app/db.py`](../services/ai-worker/app/db.py) is ~438 lines that
re-implement, in psycopg2, database access the Ktor backend already expresses in Ktorm
against the *same* Supabase tables. Today every schema change is applied in two places, in
two languages, with two connection pools, two Docker images, and two deploy targets, plus a
backend↔worker authentication handshake and result callbacks between them. Consolidating to
one Kotlin codebase deletes all of that surface. This is the primary reason and it needs no
qualification.

**2. Move a large class of schema errors from production to the compiler — with one honest
caveat.** In the Python worker, a mistyped column in a SQL string or a wrong key on a result
row is a *runtime* error, often a production one. In Ktorm those are typed properties on
`Table` objects: column typos, type mismatches, nullability, and rename-refactors are caught
by the compiler and IDE before anything runs. That is the class of error that actually
recurs, and it is the daily inner-loop win.

The honest caveat: Ktorm does **not** verify at compile time that your declared `Table`
objects match the *actual* Postgres schema. A migration that adds a column the code doesn't
declare, or a declared type that disagrees with the database, surfaces at query execution —
caught by the Testcontainers integration tests, exactly as today. So the accurate claim is:
consolidation collapses **two hand-maintained schema mappings into one and puts the compiler
in front of the survivor**; the mapping-vs-real-database check stays where it already lives,
in the integration suite that both stacks already run.

**3. Developer velocity.** A single Kotlin codebase with one build, one test command, and one
mental model is faster and more pleasant to work in than a Kotlin/Python split. This is a
tiebreaker, not the load-bearing reason, but it is why this is worth doing now rather than
never.

**What consolidation costs.** Essentially nothing in ecosystem terms. The worker has no Python
lock-in — its runtime dependencies are FastAPI, uvicorn, psycopg2, and pydantic once the
Gemini path is dropped (see below), and images are handled as raw `bytes` → base64 → data URL,
all trivial in Kotlin. The AI call is OpenRouter, which is a plain JSON POST — gpipi already
proves the Kotlin port (`OpenRouterClient`, strict-JSON structured extraction). Prompts become
Kotlin constants; pydantic models become data classes; the worker queries become Ktorm.

**Drop Gemini during the port.** The provider abstraction and the `gemini.py` /
`google-genai` path are retired rather than ported — OpenRouter is now the only AI provider in
use, including for photo-analysis vision (`openrouter.py` already carries the image
`analyze_image` path). This removes the `google-genai` dependency and the one Kotlin-side
inconvenience the two-provider design would have created (Gemini has no official Kotlin SDK).
The result is a single `OpenRouterClient` with no `AI_PROVIDER` switch. Re-adding a second
provider later is a small, isolated change if it is ever wanted.

---

## 2. Objective

Migrate the application runtime and topology without moving application data:

- Fold the Python AI worker into the Kotlin/Ktor codebase as **inline services** (for
  interactive work) plus an **always-on queue drainer** (for durable background work).
- Replace the Cloud Run photo-analysis **Job** and the worker's synchronous AI HTTP
  endpoints with a Postgres-backed job queue drained by the always-on worker process.
- Replace Google Cloud Scheduler with an **in-process Ktor scheduler that enqueues** work.
- Deploy the single Kotlin image to **one Fly.io app with two process groups** (`web` and
  `worker`).
- Host the React/Vite frontend on **Cloudflare Pages**.
- Keep **Supabase** as PostgreSQL, auth, and photo storage.
- Preserve the `shuukanhq.com` frontend domain; introduce `api.shuukanhq.com` as the stable
  API hostname.
- Retire Cloud Run, Cloud Run Jobs, GCS frontend hosting, and Google Cloud Scheduler.
- Provide a staged cutover with a DNS-based rollback path.

No schema or production-data migration is required. The database contract that already backs
durability — `photo_session` and `quiz_generation_job` rows created before dispatch,
idempotent terminal writes, and stale-state cleanup — is preserved and becomes the queue.

---

## 3. Architecture: before, after Milestone 1, after Milestone 2

Three states, because you will live on the middle one indefinitely.

### 3.1 Before — current production (Cloud Run + Python)

```mermaid
flowchart TB
  Browser([Browser / Mobile PWA])
  subgraph CF[Cloudflare]
    CDN[CDN → shuukanhq.com]
  end
  subgraph GCP["Google Cloud · asia-east1"]
    GCS[("GCS bucket<br/>static frontend")]
    BE["Cloud Run service<br/>Ktor backend · JVM"]
    WK["Cloud Run service<br/>AI worker · FastAPI / Python"]
    JOB["Cloud Run Job<br/>photo analysis · Python"]
    SCH["Google Cloud Scheduler<br/>cron triggers"]
  end
  subgraph SB["Supabase · AWS"]
    PG[("Postgres")]
    AUTH["Auth"]
    ST["Storage · photos"]
  end
  subgraph EXT["External APIs"]
    AI["OpenRouter"]
    RS["Resend"]
  end
  Browser --> CDN
  CDN -. serves .-> GCS
  Browser -->|API| BE
  Browser -->|direct| AUTH
  Browser -->|upload| ST
  BE -->|HTTP + WORKER_API_KEY| WK
  BE -->|Jobs API dispatch| JOB
  WK -->|callback + INTERNAL_API_KEY| BE
  JOB -->|callback + INTERNAL_API_KEY| BE
  SCH -->|HTTP| WK
  SCH -->|HTTP| BE
  BE --> PG
  WK --> PG
  JOB --> PG
  WK --> AI
  JOB --> AI
  BE --> RS
```

### 3.2 After Milestone 1 — consolidated Kotlin on Cloud Run (the resting state)

This is where feature work happens. One Kotlin image runs as a Cloud Run service plus Kotlin
Cloud Run Jobs. The separate Python worker service is gone; the Jobs write results directly to
Postgres through the shared Ktorm code, so there are no result callbacks and no
application-to-application secrets. The platform is still Google Cloud.

```mermaid
flowchart TB
  Browser([Browser / Mobile PWA])
  subgraph CF[Cloudflare]
    CDN["CDN → shuukanhq.com"]
  end
  subgraph GCP["Google Cloud · asia-east1 · one Kotlin image"]
    GCS[("GCS bucket · static frontend")]
    BE["Cloud Run service · Ktor / JVM<br/>API + inline word discovery"]
    PJOB["Cloud Run Job · photo analysis (Kotlin)"]
    QJOB["Cloud Run Job · quiz generation (Kotlin)"]
    SCH["Google Cloud Scheduler · cron"]
  end
  subgraph SB["Supabase · AWS"]
    PG[("Postgres")]
    AUTH["Auth"]
    ST["Storage · photos"]
  end
  subgraph EXT["External APIs"]
    AI["OpenRouter"]
    RS["Resend"]
  end
  Browser --> CDN
  CDN -. serves .-> GCS
  Browser -->|API| BE
  Browser -->|direct| AUTH
  Browser -->|upload| ST
  BE -->|Jobs API dispatch| PJOB
  BE -->|Jobs API dispatch| QJOB
  SCH -->|OIDC dispatch| BE
  BE --> PG
  PJOB -->|write result directly| PG
  QJOB -->|write result directly| PG
  BE --> AI
  PJOB --> AI
  QJOB --> AI
  BE --> RS
```

### 3.3 After Milestone 2 — Fly.io + Cloudflare Pages

```mermaid
flowchart TB
  Browser([Browser / Mobile PWA])
  subgraph CF[Cloudflare]
    PAGES["Pages → shuukanhq.com"]
  end
  subgraph FLY["Fly.io · one app · region nrt · one Kotlin image"]
    WEB["web process · JVM · public<br/>api.shuukanhq.com<br/>API + inline AI + scheduler"]
    WORKER["worker process · JVM · no public service<br/>always-on queue drainer"]
  end
  subgraph SB["Supabase · AWS"]
    PG[("Postgres<br/>+ job queue")]
    AUTH["Auth"]
    ST["Storage · photos"]
  end
  subgraph EXT["External APIs"]
    AI["OpenRouter"]
    RS["Resend"]
  end
  Browser --> PAGES
  Browser -->|API| WEB
  Browser -->|direct| AUTH
  Browser -->|upload| ST
  WEB -->|"INSERT pending (+ NOTIFY)"| PG
  WORKER -->|"LISTEN + claim (SKIP LOCKED)"| PG
  WORKER -->|write terminal result| PG
  WEB --> PG
  WORKER --> AI
  WEB --> AI
  WEB --> RS
```

### 3.4 Component inventory

| Concern | Before (Python, Cloud Run) | After Milestone 1 (Kotlin, Cloud Run) | After Milestone 2 (Kotlin, Fly) |
|---|---|---|---|
| Static frontend | GCS bucket (GCP) | GCS bucket (GCP) | Cloudflare Pages |
| CDN / DNS | Cloudflare CDN | Cloudflare CDN | Cloudflare |
| API backend | Cloud Run service · Ktor/JVM | Cloud Run service · Ktor/JVM | Fly `web` process · Ktor/JVM |
| Inline AI (word discovery) | Cloud Run worker · Python | Cloud Run service · inline Kotlin | Fly `web` process · inline Kotlin |
| Durable photo analysis | Cloud Run **Job** · Python | Cloud Run **Job** · Kotlin | Fly `worker` · drainer (Kotlin) |
| Quiz generation | Cloud Run worker · Python | Cloud Run **Job** · Kotlin | Fly `worker` · drainer (Kotlin) |
| Cron scheduling | Google Cloud Scheduler | Google Cloud Scheduler | in-process Ktor scheduler |
| Database / Auth / Storage | Supabase | Supabase | Supabase |
| AI provider | Gemini / OpenRouter | OpenRouter (Kotlin) | OpenRouter (Kotlin) |
| Email | Resend | Resend | Resend |

**What Milestone 1 changes (the move you actually live on):**

- Languages: **2 → 1** (Python deleted; Kotlin only).
- Database-access layers: **2 → 1** (Ktorm only; psycopg2 removed).
- Container images: **2 → 1** (one Kotlin image runs the service and both Jobs via different
  entrypoints).
- Runtime deployables: **2 Cloud Run services + 1 Job → 1 Cloud Run service + 2 Jobs**, all
  from that one image; the separate worker service is gone.
- Cross-service secrets: **Supabase JWT + `WORKER_API_KEY` + `INTERNAL_API_KEY` → Supabase JWT
  only**. Jobs write results directly to Postgres, so there is no worker HTTP call and no
  callback, hence no application-to-application secret.
- AI provider: **two-provider (Gemini / OpenRouter) → OpenRouter only**; the `google-genai`
  dependency and the `AI_PROVIDER` switch are removed.
- Cloud provider: **still Google Cloud.** Nothing about the platform changes yet.

**What Milestone 2 adds on top (optional, later):**

- Durable execution: **Cloud Run Jobs → one always-on `worker` process draining a queue.**
- Cron: **Google Cloud Scheduler → in-process Ktor scheduler (enqueuer).**
- Frontend host: **GCS → Cloudflare Pages.**
- Compute topology: **1 Cloud Run service + 2 Jobs → 1 Fly app with 2 process groups.**
- Cloud provider: **Google Cloud removed entirely** (runtime path becomes Cloudflare + Fly +
  Supabase).

### 3.5 Durable vs inline — the split that holds across both milestones

The division of labour is the same in both milestones; only the *mechanism* for durable work
changes (Cloud Run Job in Milestone 1, queue drainer in Milestone 2). Fast, interactive,
user-is-waiting work stays a direct in-process call on the backend either way — routing it
through a job or queue would only add latency for no durability benefit.

| Work | Nature | Placement | Milestone 1 mechanism | Milestone 2 mechanism |
|---|---|---|---|---|
| Photo analysis | slow, durable, user locks the phone | durable | Kotlin Cloud Run Job | drainer |
| Quiz generation | backed by a durable `quiz_generation_job` row; batch/cron | durable | Kotlin Cloud Run Job | drainer |
| Word discovery | interactive; user waits for the result | inline | inline in the service | inline on `web` |
| Cron (generate quizzes, check-regen, cleanup) | scheduled | trigger | Cloud Scheduler → dispatch Job | scheduler → enqueue |

### 3.6 Milestone 2 shape — one codebase, three roles

For reference, the Milestone 2 end state runs the single Kotlin image as three roles. The
`web` and `worker` roles are separate Fly process groups from the same deploy; the scheduler
is a component inside `web`. (In Milestone 1 the same responsibilities exist, but "durable
work" is a Cloud Run Job dispatched by the service rather than a `worker` process.)

| Role | Fly process | Exposure | Responsibility |
|---|---|---|---|
| Request-serving backend | `web` | public HTTPS | Serve the API; run **inline AI** for interactive work; host the scheduler |
| Queue drainer | `worker` | none | Drain durable jobs from the Postgres queue; call AI; write terminal results |
| Scheduler | (inside `web`) | none | On a locked schedule, **enqueue** cron work as `PENDING` rows |

---

## 4. The execution model: always-on queue drainer

### 4.1 Why the drainer, not a spawned per-job Machine

Fly has no Cloud Run Jobs primitive, so the per-invocation model must change regardless of
language. The two candidates were an always-on drainer and spawning a run-to-completion Fly
Machine per job. The drainer was chosen because:

- **JVM stays warm.** A spawned per-job JVM Machine pays JVM boot + classloading + framework
  init on every job — a 20–40% overhead on a several-second AI call, paid forever, and
  directly at odds with the reason for adopting the JVM. The drainer pays that cost once.
- **The handoff failure boundary is cleaner.** With the drainer, "dispatch" is an `INSERT`
  into the same database the request already writes to — no second external system that can
  fail between the durable write and the dispatch. Spawning a Machine keeps an external
  dispatch call and its split-brain window.
- **Fewer moving parts.** No Machine lifecycle, no orphaned-Machine cleanup, one persistent
  process to observe and tail.

The drainer's own drawbacks are accepted and mitigated in §4.5.

### 4.2 Enqueue

The `web` process creates the durable row exactly as it does today, then does **not** call a
worker:

- `PhotoService` inserts a `photo_session` row with `PROCESSING`/`PENDING` status before
  returning to the browser (it already does this).
- Quiz selection and the scheduler insert `quiz_generation_job` rows with `PENDING`.
- Optionally, the enqueuing transaction issues a Postgres `NOTIFY` on a well-known channel to
  wake the drainer immediately.

The browser-facing request returns as soon as the row is committed. Cloudflare's origin
timeout never applies to AI completion.

### 4.3 Drain

The `worker` process runs a bounded pool of drain coroutines:

- It `LISTEN`s on the notify channel for low-latency wake-ups **and** polls on a short
  interval as a backstop, because a `NOTIFY` issued while the worker is disconnected (deploy,
  restart) is lost. `LISTEN` requires its own dedicated connection.
- Each coroutine claims a row with `SELECT … FOR UPDATE SKIP LOCKED`, sets it to `PROCESSING`
  with a lease deadline and increments `attempts`, and commits the claim before starting the
  slow AI work — never holding a transaction open across the AI call.
- It performs the AI call (OpenRouter) with hard per-call timeouts.
- It writes the terminal result **directly** to Postgres by calling the same Kotlin service
  and repository code the backend uses. There is no callback HTTP and no `INTERNAL_API_KEY`;
  applying a result is an in-process function call within the drainer.
- Terminal writes are idempotent: a duplicate completion is ignored and cost is recorded once
  (the existing callback idempotency, relocated).

### 4.4 Recover

- A **short lease/visibility timeout** returns a row whose worker died mid-job to `PENDING`
  for re-claim, giving fast liveness recovery.
- A **long stale reaper** (the existing 25h photo path, plus the new quiz-job equivalent)
  converts abandoned rows to `FAILED` with a bounded `failure_code`, surfaced on the admin
  Jobs page for manual rerun.
- Because every job is claimed idempotently and re-runnable, an interrupted drainer loses no
  work; the durable row is the source of truth.

### 4.5 Accepted drawbacks and required mitigations

The drainer's downsides are bounded but real, and each mitigation below is part of the
Definition of Done, not a follow-up:

- **Fixed-width throughput / head-of-line blocking.** The drainer processes at a fixed
  concurrency. Make the pool width **configurable** (start at 3–5) so a burst or a slow job
  type can be tuned without a redesign. At current volume this width essentially never
  blocks; the ceiling is understood and adjustable.
- **Single-process silent stall.** A wedged drainer stalls all async work without producing
  an HTTP error. Required: hard per-job/per-AI-call timeouts; a liveness signal for the drain
  loop; and **queue-depth and oldest-`PENDING`-age alerting as the primary health metric** —
  the operator watches queue lag, not request error rate.
- **Always-on cost / no scale-to-zero.** The `worker` process has no inbound HTTP, so Fly
  Proxy cannot manage its lifecycle; it must run continuously (autostop off). This is the
  accepted cost of the model.
- **You own retry/idempotency.** The lease + reaper + idempotent terminal write are your
  code, not a platform feature. This is a port, not an invention — the durable record,
  attempt claim, idempotent completion, and reaper already ship (see
  [`capture-resilience.md`](capture-resilience.md) Milestone 3); the change is relocating the
  claim key from `CLOUD_RUN_TASK_ATTEMPT` to a database lease.

---

## 5. Current-state gaps

The containers are portable, but several assumptions must change. Compared with the earlier
two-app plan, all worker-authentication, worker-private-networking, and worker-callback gaps
are **removed** because there is no separate worker service.

### 5.1 Two database layers and two languages (resolved by consolidation)

Addressed in Phase A. The Python worker (`openrouter.py`, `prompts.py`, `db.py`, `main.py`,
`photo_job.py`, `callback.py`) is ported into the Kotlin codebase; `gemini.py` and the
provider abstraction are dropped, not ported (§1). The Python source is removed from the repo
and the deployed Cloud Run service is retired per the retention rule in Phase A.

### 5.2 Cloud Run Job dispatch and worker HTTP endpoints

`PhotoService` dispatches a Cloud Run Job via the Google Jobs API, and `KanjiService` calls
the worker's `/generate-quizzes` HTTP endpoint. These change across the two milestones:

- **Milestone 1:** the `/generate-quizzes` HTTP call is removed — quiz generation becomes a
  Kotlin Cloud Run Job dispatched the same way photo analysis already is. The
  metadata-server identity-token flow in
  [`core/auth/CloudRunAuth.kt`](../backend/src/main/kotlin/com/kanjimasta/core/auth/CloudRunAuth.kt)
  authenticated calls to the *worker service*; it is removed with that service. Jobs-API
  dispatch still uses the backend's Google service-account credentials.
- **Milestone 2:** the Jobs and their Jobs-API dispatch are replaced by queue rows drained by
  the always-on `worker` process, and all remaining Google authentication disappears.

### 5.3 Scheduled jobs are not deployable infrastructure

Cron currently arrives as HTTP from Google Cloud Scheduler to worker/backend endpoints. A
scheduler outside Fly cannot reach an internal process, and there is no worker HTTP endpoint
to call anymore. Replace it with **one in-process Ktor scheduler** on `web` that *enqueues*
work:

- Read `SCHEDULER_ENABLED` at startup; default `false`; emit one startup log confirming state.
- Start the scheduler from the Ktor lifecycle only when `SCHEDULER_ENABLED=true`.
- Configure every schedule and its IANA time zone in version-controlled application config.
- Claim each scheduled occurrence with `pg_try_advisory_xact_lock` inside a short
  transaction, and in the same transaction create a durable execution record keyed by task
  and occurrence, so a second `web` instance cannot double-enqueue.
- The scheduled task's action is to **insert `PENDING` queue rows** (and cleanup service
  calls), not to make an AI call or an outbound HTTP request. Do not hold a transaction open
  while doing work.
- Log task name, scheduled time, start time, duration, enqueued count, and failure.
- Release scheduler resources on graceful shutdown.

The advisory lock is required even with one `web` Machine so later scaling or overlapping
deploys do not double-enqueue. `SCHEDULER_ENABLED=false` is the cross-platform overlap
control while Google Cloud Scheduler is still active during cutover.

### 5.4 Durable records exist; the queue formalizes them

The dispatch paths already create durable rows before contacting the worker, and photo
sessions already have an hourly stale-cleanup path. The queue model uses these same rows as
its work items. The one net-new reliability item is the **quiz-job reaper** (interrupted quiz
jobs can currently remain `PROCESSING` indefinitely), plus admin visibility and rerun for
both photo and quiz failures. Ship that as Phase 0 on the current stack before any language
or platform change. A transactional outbox is explicitly **not** introduced; the durable row
plus the reaper is sufficient.

### 5.5 Public API requests already return before AI completion

The current dispatch paths return before AI work finishes, so Cloudflare's origin timeout
does not gate completion. The queue preserves this — enqueue-and-return is even more clearly
decoupled. Keep the Cloudflare proxy on `api.shuukanhq.com` for fast DNS/origin rollback, and
add a regression test proving the enqueue endpoints return promptly while drain work
continues.

### 5.6 Deployment commands target Google Cloud

The `Makefile` builds/pushes to Google Artifact Registry, deploys with `gcloud run deploy`,
deploys a Cloud Run Job, discovers Cloud Run URLs, and uploads the frontend to GCS. All are
replaced (§6.6), retained temporarily as `deploy-legacy-*` during the rollback window.

### 5.7 Documentation is stale

`README.md` and `docs/architecture.md` describe the older Cloud Run / two-service / Python
worker architecture and must be updated once the new path works.

---

## 6. Repository changes

### 6.1 Fly application configuration (one app, two processes)

Add `fly.toml` at the backend/app root containing:

- the final Fly app name and primary region;
- Dockerfile build for the single Kotlin image;
- `internal_port = 8080`;
- a `[processes]` table defining `web` and `worker` commands (two entrypoints in the same
  image — the Ktor server for `web`, the drainer `main()` for `worker`);
- an `[http_service]` bound to `processes = ["web"]` only, with forced HTTPS and an HTTP
  health check against `/health`;
- **no** service and **no** public IP for `worker`;
- `auto_stop_machines = "off"` and `auto_start_machines = true` for both processes (the
  drainer must stay up; the web machine stays up because Fly Proxy cannot see background
  work);
- `kill_timeout = 90`;
- an immediate deployment strategy for the single Machine per process.

Keep `/health` a lightweight liveness check on `web`. The `worker` process exposes a liveness
signal for its drain loop (a top-level Fly health check where practical, or a heartbeat
row/metric), not an HTTP service.

`/health` must remain cheap; add a separate readiness check if database reachability must
affect routing.

### 6.2 Consolidate the worker into Kotlin

This is the prerequisite (Phase A). Port, then delete Python:

- `openrouter.py` → a single Kotlin `OpenRouterClient` (a JSON POST; the gpipi
  `OpenRouterClient` is a working reference for structured-JSON extraction and the image
  `analyze_image` path in Kotlin). **`gemini.py`, `ai_client.py`, and the `AI_PROVIDER`
  abstraction are dropped, not ported** — OpenRouter is the only provider (§1).
- `prompts.py` → Kotlin string constants/objects.
- pydantic models → Kotlin data classes / `kotlinx.serialization`.
- worker queries in `db.py` → Ktorm against the existing `core/db/Tables.kt`.
- `main.py` route handlers → inline service methods on `web` (discovery) and drainer job
  handlers (`worker`).
- `photo_job.py` / `callback.py` → the drainer's claim/execute/write-result loop; the
  callback becomes a direct in-process service call.
- Port the pytest suites (`test_openrouter.py`, `test_db.py`, `test_routes.py`,
  `test_photo_job.py`) to Kotlin/Testcontainers integration tests alongside the existing
  backend suite. `test_gemini.py` and `test_ai_client.py` are dropped with the Gemini path.

Centralize OpenRouter model configuration (`OPENROUTER_*`) in Kotlin config; there is no
provider switch.

### 6.3 Runtime configuration

Backend/app variables (both processes read the shared set they need):

```text
PORT=8080
DATABASE_URL=...
SUPABASE_URL=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
OPENROUTER_REASONING_EFFORT=...
OPENROUTER_ANALYZE_MODEL=...
OPENROUTER_QUIZ_MODEL=...
OPENROUTER_DISCOVERY_MODEL=...
OPENROUTER_SITE_URL=https://shuukanhq.com
OPENROUTER_APP_NAME=Kanji Masta
SCHEDULER_ENABLED=false
DRAINER_CONCURRENCY=4
DRAINER_POLL_INTERVAL_SECONDS=...
JOB_LEASE_SECONDS=...
HIKARI_MAX_POOL_SIZE=...
CORS_ALLOWED_ORIGINS=shuukanhq.com
RESEND_API_KEY=...
ADMIN_USER_ID=...
LOG_LEVEL=INFO
```

Note the secrets that are **gone**: `WORKER_API_KEY` and `INTERNAL_API_KEY` (no
backend↔worker HTTP, no callbacks). Do not include secret values in `fly.toml`, images, logs,
error messages, frontend env, or committed `.env` files. Non-sensitive settings (log level,
concurrency, intervals) may live in `[env]`.

### 6.4 Memory and connection-pool hardening

Start the `web` JVM at 1 GB. Size the `worker` JVM for image base64 expansion plus AI
response buffering; start at 512 MB–1 GB and measure under representative photo load.

Both processes:

- Set `-XX:MaxRAMPercentage=55` via `JAVA_TOOL_OPTIONS`; lower if native-memory headroom is
  tight.
- Set an explicit `-XX:MaxDirectMemorySize` for Netty/HTTP-client direct buffers and verify
  under load.
- Add `-XX:+ExitOnOutOfMemoryError` so an unhealthy process restarts cleanly.
- Make Hikari `maximumPoolSize` configurable; start conservative and raise from observed
  demand. The `worker` needs one additional dedicated connection for `LISTEN`.

**Connection budget.** Account for `web` pool + `worker` pool + the `worker` `LISTEN`
connection + scheduler claims + migrations/admin. During Phases B–D the old Cloud Run
backend/worker pair and the new Fly `web`/`worker` pair run against the same Supabase
database concurrently; compute the worst-case old-plus-new ceiling (Cloud Run autoscaling
raises the real number) and confirm it sits comfortably under the Supabase plan limit before
creating Fly Machines. Reduce pool sizes or Cloud Run max instances first if it does not.

Worker-side image safety (ported from the Python guardrails): explicit connect/read/total
timeouts on image downloads; reject or cap unexpectedly large responses before base64
expansion.

### 6.5 Graceful shutdown and in-flight work

On `web`: any remaining service-owned dispatch coroutines are replaced by enqueue-and-return,
so there is little to drain; stop accepting new requests and let Ktor finish in-flight ones.

On `worker`: on `SIGTERM`, stop claiming new rows, let in-flight jobs finish within the Fly
`kill_timeout = 90` budget, and release leases; anything not finished within the window
returns to `PENDING` on lease expiry and is re-claimed. Bind the drain-shutdown wait to under
90 seconds. Terminal and status writes must be idempotent so a job interrupted after the AI
call but before the terminal write is safely re-run.

`kill_timeout` is a best-effort drain window, not a durability guarantee; the durable row plus
the reaper is the guarantee.

### 6.6 Makefile and deployment state

Provider-neutral targets:

```text
make deploy-db
make deploy-app         # fly deploy (builds one image, deploys web + worker)
make deploy-frontend    # Cloudflare Pages (Wrangler or Git integration)
make deploy-all
make deploy-status
make smoke-production
```

- `deploy-app` runs backend tests/build and then `fly deploy`; there is no separate worker
  deploy — the one image runs both process groups.
- `deploy-all` order: database, app, frontend.
- `scripts/check_deploy.py` maps paths to the new components; deploy-state recording stays
  provider-neutral.
- Old `gcloud`/GCS targets remain as `deploy-legacy-*` during the rollback window, removed
  after soak.

### 6.7 Cloudflare Pages repository preparation

| Setting | Value |
|---|---|
| Framework | React/Vite |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production branch | repository production branch |
| Build watch include | `frontend/*` plus root dependency files if needed |

Production build variables:

```text
VITE_API_URL=https://api.shuukanhq.com
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Preview deployments need separate Supabase/API values only if authenticated preview testing
is required; avoid permitting arbitrary `*.pages.dev` origins in production CORS. Cloudflare
Pages applies SPA fallback automatically when no top-level `404.html` is deployed, so a
`_redirects` catch-all is not required for the current React Router app — verify direct
navigation and refresh on every route in staging. Add `frontend/public/_headers` if browser
security headers are not applied elsewhere (`Content-Security-Policy`, `Referrer-Policy`,
`X-Content-Type-Options`, `Permissions-Policy`, and asset caching for fingerprinted files).
Do not aggressively cache `index.html`.

---

## 7. External infrastructure configuration

### 7.1 Fly application

- Create or select the Fly organization; enable billing.
- Select one globally unique app name and the primary region (match the Supabase AWS region
  because most requests do database work; use `nrt` for `ap-northeast-1`, otherwise the
  nearest Fly region — verify database latency before cutover).
- Deploy the single image with `web` and `worker` process groups; scale one Machine each
  initially (`fly scale count web=1 worker=1`).
- Confirm `web` receives public IPv6 and shared IPv4 through its HTTP service, and `worker`
  has no public service and no public IP.
- Set secrets on the app; keep a secure record of secret names and rotation procedures.

### 7.2 Supabase database connectivity

- Use the Supabase direct PostgreSQL hostname over IPv6 for both long-lived processes; require
  TLS with `sslmode=require`.
- Keep migration tooling on a connection mode suitable for DDL.
- Do not use transaction-pooler-specific JDBC workarounds unless the runtime connection
  actually uses the transaction pooler — note `LISTEN/NOTIFY` requires a session (not a
  transaction-pooled) connection, so the drainer's `LISTEN` connection must be a direct/
  session connection.
- Validate before creating Fly Machines against production Supabase: complete the
  old-plus-new connection-budget calculation; resolve the Supabase host from each Machine;
  establish TLS; confirm queries, transactions, `LISTEN/NOTIFY`, and startup pool creation;
  confirm total usage stays within the plan limit; confirm latency from the chosen region.
- If Supabase network restrictions are enabled, allocate stable Fly egress IPs for every
  Machine that connects to Postgres and add the IPv4/IPv6 CIDRs to the allowlist, accounting
  for replacement Machines during deploys.

### 7.3 Fly secrets

App secrets:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SCHEDULER_ENABLED` (set `false` through Phases B and C)
- `OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `ADMIN_USER_ID`

`WORKER_API_KEY` and `INTERNAL_API_KEY` are not created. Rotate any previously exposed secret
during migration.

### 7.4 API domain and TLS

Provision `api.shuukanhq.com` on the Fly app (`web` service):

1. Add the hostname to the Fly app.
2. Obtain exact DNS records from `fly certs setup api.shuukanhq.com`.
3. Add the required CNAME or A/AAAA records in Cloudflare DNS.
4. Add the `_fly-ownership` TXT record when the Cloudflare proxy is enabled.
5. Set Cloudflare SSL mode to `Full (strict)`.
6. Verify certificate issuance before directing production traffic.
7. Verify HTTP→HTTPS redirects and `/health`.

### 7.5 Cloudflare Pages project

- Create a Git-integrated Pages project (preferred over Direct Upload for branch previews,
  commit status, and automatic production deploys — the integration mode cannot be switched
  later).
- Configure the monorepo root, build command, and output directory; set production and
  preview build variables; limit builds to frontend paths.
- Deploy and test the `.pages.dev` hostname; attach `shuukanhq.com` only after preview
  verification; keep the GCS origin recoverable during the rollback window.

### 7.6 Supabase Auth URLs

- Keep the production Site URL `https://shuukanhq.com`.
- Confirm signup, login, invite, password-reset, and callback URLs.
- Add a fixed staging URL if authenticated staging is required; avoid broad preview wildcards.

### 7.7 Scheduled jobs

- Configure the in-process Ktor scheduler and exact IANA time zone in version control.
- Verify `web` starts with no scheduled tasks when `SCHEDULER_ENABLED=false`.
- Run each scheduled enqueue in local/integration tests before Fly deployment.
- Verify the advisory-lock claim from two concurrent `web` processes enqueues exactly once.
- At cutover, disable the matching Google Cloud schedules first, then set
  `SCHEDULER_ENABLED=true` and wait for the resulting Machine restart; confirm the startup log
  reports the scheduler enabled.

---

## 8. Security requirements

- The `worker` process has no public Fly service and no public IP.
- All browser-to-backend traffic uses HTTPS; Cloudflare SSL mode is `Full (strict)`, never
  `Flexible`.
- Database traffic uses TLS outside Fly private networking.
- CORS allows only the production frontend and intentionally configured staging origins.
- Health endpoints return no secret or dependency configuration.
- Logs never contain API keys, database credentials, JWTs, or full signed storage URLs.
- Fly and Cloudflare CI tokens have the narrowest practical scopes; production secrets are
  never Docker build arguments.
- Backend↔worker coordination is the shared database; there is no application-to-application
  network secret to protect, which removes the `WORKER_API_KEY`/`INTERNAL_API_KEY` trust
  surface entirely.
- User authentication remains Supabase JWT (HS256), unchanged.

---

## 9. Observability and operational checks

Observability must operate before cutover. `fly logs` tails live; Fly's managed Grafana log
search retains ~7 days, covering the soak. Establish a Cloud Run/Cloud Monitoring baseline
before cutover and compare.

Stack: Fly managed Prometheus + Grafana for Machine/proxy/CPU/memory/restart/network metrics;
application `/metrics` scraped via each process's Fly `[metrics]`; Fly Grafana log search;
Better Stack uptime checks for `https://api.shuukanhq.com/health` and `https://shuukanhq.com`.

### web

- Machine restarts and OOM; JVM heap and resident memory
- request count, latency, error rate
- database pool active/idle/timeout
- inline AI (discovery) latency and failures
- Supabase JWT/JWKS failures
- Resend failures
- scheduler executions, lock skips, durations, enqueued counts, failures

### worker (queue-shaped, not HTTP-shaped)

- **queue depth and oldest-`PENDING` age per job type** (primary lag/health signal, with
  alerts)
- drain concurrency in use; jobs claimed/completed/failed; per-job duration
- lease expiries and re-claims (interrupted-work indicator)
- OpenRouter latency and error rate
- image download size and latency; rejected oversized images
- stale-reaper `FAILED` counts
- drain-loop liveness / heartbeat; resident memory during image analysis

Add Better Stack uptime alerts for both public endpoints and a Fly Grafana dashboard covering
resident memory, CPU, latency, status, restarts, and the custom queue-lag/drain metrics.
During the soak, review at defined checkpoints for restarts/OOM, sustained 5xx, failed
scheduler enqueues, growing queue lag, and stale-state recovery.

---

## 10. Testing plan

### 10.1 Automated tests

- Backend tests pass after removing Cloud Run identity-token code and the Jobs-API dispatch.
- Ported worker logic (the OpenRouter client, prompts, queries) has Kotlin/Testcontainers
  coverage equivalent to the retired pytest suites.
- Drainer tests: claim with `FOR UPDATE SKIP LOCKED` does not double-process; lease expiry
  re-queues; idempotent terminal write ignores duplicates and charges once; reaper marks
  stale rows `FAILED`.
- Scheduler tests: two `web` instances enqueue a schedule exactly once via the advisory lock.
- Enqueue endpoints return promptly while drain work continues.
- Frontend unit and browser tests pass against the existing fake API.
- The single Docker image builds and runs both process commands.
- `fly config validate --strict` passes.

### 10.2 End-to-end staging tests

Run queue-mutating tests against local Supabase or an isolated staging project. While Fly and
Cloud Run share production Supabase in Phases B–C, limit production checks to health, auth,
and read-only behavior; **do not let both stacks drain the same production job queue.**

- Open every frontend route directly and refresh; sign in and refresh the session.
- Upload a photo; start analysis; verify the drainer completes it and the result appears
  (no callback path).
- Generate quizzes; verify the drainer completes all jobs.
- Admin Jobs page shows pending/processing/stale/failed work; retry a failed quiz job to
  `DONE`; exercise the failed-photo recovery/rescan flow.
- Complete and resume a quiz session; run the invite/Resend flow.
- Run every scheduled enqueue manually; verify CORS rejection from an unapproved origin;
  verify the public internet cannot reach the `worker` process.

### 10.3 Failure tests

Prove recovery first on Cloud Run in Phase 0; during Fly migration repeat only the
platform-specific cases with dedicated records.

- Restart `worker` during an active job; verify lease expiry re-queues and it completes.
- Kill a job after the AI call but before the terminal write; verify idempotent re-run does
  not double-charge.
- Run a job longer than the shutdown window; verify durable recovery, not silent loss.
- Deploy the app during active drain work; verify in-flight jobs drain or re-queue.
- Simulate an unavailable database at startup, a failed AI provider call, and an oversized
  image response.
- Confirm the full operator flow: stale work becomes visible and actionable, an admin reruns
  it, and the rerun succeeds without direct database edits.

---

## 11. Milestones and sequence

The two milestones are independent. Milestone 1 ships and stands on its own; Milestone 2 is a
later, optional platform move. Do not start Milestone 2 work until Milestone 1 has soaked in
production and you have actually decided to move off Google Cloud.

## Milestone 1 — Kotlin consolidation on Cloud Run

The destination: Python deleted, one Kotlin image running as a Cloud Run service plus Kotlin
Cloud Run Jobs, durable results written directly to Postgres. This is a durable resting state
that hosts feature work indefinitely.

### Phase 0 — ship recovery on Cloud Run

- Add stale quiz-job detection and the quiz-job reaper; complete the admin rerun flow for
  interrupted quiz jobs; add the failed-photo recovery/rescan path.
- Deploy to the current (Python) Cloud Run stack; force an interrupted job, recover and rerun
  it to `DONE`; observe with the existing Cloud Logging/Monitoring.

This is mostly backend Kotlin and survives everything after it. It makes the durable work
recoverable before the language port touches it. Phase A does not begin until recovery is
proven.

### Phase A — consolidate the worker into Kotlin

Delete Python; converge on one Kotlin image with the execution model below. Scope is
deliberately tight so this milestone is a clean, defensible end state.

**Target topology (the resting state):**

- One Cloud Run **service** (Ktor): the API plus **inline word discovery**.
- One Cloud Run **Job** `photo-analysis` (Kotlin entrypoint in the same image), dispatched by
  the service via the Jobs API — the durable-execution mechanism, unchanged in shape from
  today, only the language differs.
- One Cloud Run **Job** `quiz-generation` (Kotlin entrypoint in the same image), dispatched by
  the service and by cron. This retires the separate worker service's synchronous
  `/generate-quizzes` endpoint and makes quiz generation durable the same way photo analysis
  already is. _(This is the one modest execution change beyond a pure language port; it is
  what lets the standalone Python worker service be deleted entirely.)_
- Cron stays on **Google Cloud Scheduler**, now dispatching the Kotlin Jobs (directly, or via
  authenticated service endpoints that dispatch them).

**Work:**

- Port `openrouter.py`, `prompts.py`, and the worker `db.py` queries into Kotlin (§6.2). Drop
  `gemini.py` and the `AI_PROVIDER` abstraction — OpenRouter is the only provider.
- **Both Jobs write terminal results directly to Postgres** through the shared Ktorm
  service/repository code. Remove the worker→backend callback, `INTERNAL_API_KEY`, and
  `WORKER_API_KEY`. Keep the writes idempotent (relocate the existing callback idempotency).
- Word discovery becomes an inline service call.
- Remove the Python worker source, its Dockerfile, and its build/deploy target from the repo,
  so it is no longer built or deployed.
- Port the pytest suites to Kotlin/Testcontainers.
- Deploy to Cloud Run and verify parity against the pre-consolidation behavior.

**Retain the old service for rollback (do not delete it yet).** Removing the Python source
does not delete the *running* Cloud Run service. Leave the last-deployed Python worker service
in place at **zero traffic** — it costs nothing while idle (Cloud Run scales it to zero) and
becomes the rollback target. Because Cloud Run also retains the backend's previous revision, a
Milestone 1 rollback is then a **traffic/revision change, not a redeploy from git** (§12).
Delete the retained Python worker service only after the Milestone 1 Definition of Done is
signed off.

**Soak, then decommission.** After deploying the consolidated stack, soak it in production
(24–48 hours) with the retained Python worker service standing by. When the Definition of Done
is signed off, delete the retained Python worker Cloud Run service, its Artifact Registry
image, and its deploy artifacts.

**Milestone 1 is done when** (see §15) the Python source is gone and no longer deployed, the
one Kotlin image serves the API and runs both Jobs, results are written directly to Postgres
with no callback or app-to-app secret, admin recovery works for both job types, and the stack
has soaked in production with the retained rollback target still available. At that point
feature development proceeds here with no dependency on Milestone 2.

**What carries forward to Milestone 2 unchanged:** the AI clients, prompts, Ktorm queries, the
direct-write result handling, and the durable records + reapers. The only throwaway is the
Cloud Run Job wrapper and its Jobs-API dispatch, replaced by the drainer's claim loop.

## Milestone 2 — Fly.io + Cloudflare Pages (optional, later)

Undertake only after Milestone 1 has soaked and you have decided to leave Google Cloud. This
milestone changes the runtime platform and swaps Cloud Run Jobs for the always-on queue
drainer; the Kotlin code is largely reused.

### Phase B — Fly app + drainer + queue (staging)

- Confirm the Supabase connection budget supports Cloud Run and Fly concurrently.
- Add `fly.toml` with `web` + `worker` process groups; add the drainer loop (claim/execute/
  write-result), the `LISTEN`/poll backstop, the lease, and the quiz + photo reapers.
- Convert the Kotlin Jobs' Jobs-API dispatch to enqueue-and-drain, and convert the scheduler
  from a Job dispatcher to an enqueuer. (The direct-to-Postgres result write already exists
  from Milestone 1 and is reused as-is.)
- Set secrets, including `SCHEDULER_ENABLED=false`.
- Deploy to the `.fly.dev` hostname; verify Supabase connectivity and `LISTEN/NOTIFY` from
  both processes; verify `worker` has no public service or IP; verify the startup log confirms
  the scheduler disabled; verify logs/metrics and the queue-lag dashboard; record baseline
  memory and latency.

Cloud Run remains production during this phase; do not let the Fly `worker` drain the
production queue yet.

### Phase C — provision public endpoints

- Add `api.shuukanhq.com` to the Fly `web` service; configure Cloudflare DNS + Fly cert
  ownership; validate TLS with `Full (strict)`.
- Create the Cloudflare Pages project pointing at `https://api.shuukanhq.com`; deploy a
  preview; complete the end-to-end staging checklist against isolated data.
- Reconfirm `SCHEDULER_ENABLED=false` and that Google Cloud Scheduler remains the only active
  scheduler and Cloud Run the only active drainer.

### Phase D — backend cutover

- Lower DNS TTLs in advance; disable the matching Google Cloud Scheduler jobs and confirm no
  executions remain.
- Point `api.shuukanhq.com` at Fly; wait for old Cloud Run traffic and any in-flight Cloud Run
  Job to drain.
- Manually invoke each Fly scheduled enqueue once and verify the drainer executes it while
  Google Cloud Scheduler is off and the in-process scheduler is still disabled.
- Set `SCHEDULER_ENABLED=true` (this restarts the `web` Machine); confirm the startup log
  reports the scheduler enabled and verify the first advisory-lock claim.
- Confirm frontend API traffic reaches Fly; monitor errors, latency, memory, queue lag, and
  database connections. Keep Cloud Run deployable but stop sending it traffic.

### Phase E — frontend cutover

- Attach `shuukanhq.com` to Cloudflare Pages; verify DNS and TLS.
- Repeat login, upload, photo, quiz, invite, and route-refresh smoke tests; confirm the build
  points only to `api.shuukanhq.com`; keep the GCS frontend available for rollback.

### Phase F — soak and decommission

Soak 24–48 hours under normal usage. Review Grafana metrics and 7-day logs at checkpoints;
review uptime; review all Machine restarts; confirm no OOM; inspect drain failures and queue
lag; verify no rows stuck; verify connection counts; compare latency with the previous
deployment; confirm Pages health.

After soak: remove Cloud Run services and the Cloud Run Job; remove obsolete Artifact Registry
images; remove GCS frontend automation; remove Google Cloud Scheduler jobs; remove temporary
DNS records and `deploy-legacy-*` targets; rotate migration-time credentials; update
`deploy-state.json` and architecture docs. Do not delete Supabase resources, migrations,
storage buckets, or production data.

---

## 12. Rollback

Rollback remains available until each milestone's soak completes and its retained legacy
services are removed.

### Milestone 1 rollback (within Cloud Run)

Because the Python worker service is retained at zero traffic (Phase A) and Cloud Run keeps the
backend's previous revision, a Milestone 1 rollback is a **traffic/revision change, not a
redeploy from git**:

1. Roll the backend Cloud Run service back to its pre-consolidation revision (the one that
   still speaks the worker-HTTP + callback protocol).
2. Confirm the retained Python worker service accepts traffic again; it now handles quiz
   generation and the local photo path as before.
3. Re-point any cron that targeted the Kotlin Jobs back to the pre-consolidation targets.

No git revert or image rebuild is required. Keep both the retained Python worker service and
the prior backend revision until the Milestone 1 Definition of Done is signed off; only then
delete them. Do not run the Kotlin Jobs and the Python worker against the same pending queue
at once — roll fully forward or fully back.

### Milestone 2 — backend rollback (Fly → Cloud Run)

1. Restore `api.shuukanhq.com` DNS to the Cloud Run endpoint.
2. Set the Fly secret `SCHEDULER_ENABLED=false` and wait for the Machine restart; verify the
   startup log reports the scheduler disabled.
3. Re-enable Google Cloud Scheduler only after Fly scheduling is confirmed off.
4. Confirm the frontend reaches the restored API.

API rollback is a fast Cloudflare origin/DNS change. Scheduler rollback is slower because
`SCHEDULER_ENABLED` restarts the Machine. Never re-enable Cloud Scheduler before the Fly
scheduler-disable restart completes, and never let both the Cloud Run and Fly drainers process
the production queue at once.

### Milestone 2 — frontend rollback (Pages → GCS)

1. Restore `shuukanhq.com` to the GCS/Cloudflare origin.
2. Verify the restored frontend uses `https://api.shuukanhq.com` or the restored API URL.
3. Purge or wait for Cloudflare cache propagation.

### Data considerations

- Both runtimes use the same Supabase database; no restore is expected on rollback.
- Never allow both drainer stacks (or both scheduler stacks) to process the same jobs
  concurrently.
- Avoid rolling back application code across incompatible schema migrations.

---

## 13. Implementation estimate

### Milestone 1 — Kotlin consolidation on Cloud Run

| Workstream | Estimated active effort |
|---|---|
| Phase 0 Cloud Run recovery release (quiz reaper + admin rerun) | 0.5–1 day |
| Port the OpenRouter client, prompts, and queries to Kotlin (drop Gemini) | 1–1.5 days |
| Photo + quiz as Kotlin Cloud Run Jobs with direct-to-Postgres writes; delete callbacks/keys | 0.5–1 day |
| Inline word discovery; remove Python source; retain the deployed service for rollback | 0.25–0.5 day |
| Production soak with retained rollback target; decommission after DoD sign-off | 24–48 hours elapsed |
| Port pytest suites to Kotlin/Testcontainers | 0.5–1 day |
| Cloud Run deploy commands and parity verification | 0.5 day |

**Milestone 1 total: roughly three to five active engineering days**, after which this is a
durable, feature-ready state with one language and one image. It can sit here indefinitely.

### Milestone 2 — Fly.io + Cloudflare Pages (only if undertaken)

| Workstream | Estimated active effort |
|---|---|
| Queue drainer (claim/lease/reaper, `LISTEN`/poll, concurrency) | 1–1.5 days |
| Scheduler-as-enqueuer with advisory-lock claim | 0.5 day |
| Fly configuration (one app, two processes) and deploy commands | 0.5 day |
| Memory, connection-pool, health, and failure hardening | 0.5–1 day |
| Metrics, Grafana queue-lag dashboard, uptime alerts | 0.25–0.5 day |
| Cloudflare Pages preparation and documentation | 0.5 day |
| Infrastructure provisioning, DNS, secrets | 2–4 hours |
| Staging verification and production cutover | 2–4 hours |
| Production soak | 24–48 hours elapsed |

**Milestone 2 total: roughly three to four active engineering days** plus the soak. Because it
reuses the Milestone 1 Kotlin code and adds no second language or worker-authentication
surface, it is smaller than the original two-app Fly plan.

---

## 14. Decisions required before implementation

- [ ] Final Fly organization and app name
- [ ] Confirm Supabase AWS region and matching Fly region (`nrt` for `ap-northeast-1`)
- [ ] Confirm `web` starts at 1 GB; choose the `worker` starting size (512 MB vs 1 GB)
- [ ] Confirm both process groups run always-on (autostop off)
- [ ] Initial `DRAINER_CONCURRENCY`, `JOB_LEASE_SECONDS`, and poll interval
- [ ] `NOTIFY`-plus-poll versus poll-only for the first release
- [ ] Exact schedules and time zone for the three scheduled operations
- [ ] Git-integrated Cloudflare Pages project or Direct Upload
- [ ] Production branch name; whether authenticated preview deployments are required
- [ ] Supabase direct IPv6 (session) connection for the drainer's `LISTEN`
- [ ] Whether Supabase database network restrictions are enabled
- [ ] Better Stack uptime-check account and alert recipients
- [ ] Length of production soak before legacy decommissioning

Recommended defaults:

- one Fly app, two process groups, one always-on `web` (1 GB) and one always-on `worker`
- `DRAINER_CONCURRENCY=4`, `NOTIFY` + short poll backstop, database-lease claims via
  `FOR UPDATE SKIP LOCKED`
- Git-integrated Cloudflare Pages; `api.shuukanhq.com` as the stable hostname; Cloudflare
  proxy with `_fly-ownership` and `Full (strict)` TLS
- direct Supabase IPv6 connection with `sslmode=require`
- one in-process Ktor scheduler (enqueuer) protected by transaction-scoped advisory locks and
  durable execution claims; `SCHEDULER_ENABLED=false` until Google Cloud Scheduler is disabled
  in Phase D
- Fly managed Prometheus/Grafana plus Better Stack; 48-hour soak

---

## 15. Definition of Done

### Milestone 1 — Kotlin consolidation on Cloud Run

- [ ] Python worker source and Dockerfile are removed from the repo and no longer built or
  deployed; all AI logic (the OpenRouter client, prompts, queries) lives in Kotlin with
  Testcontainers coverage equivalent to the retired pytest suites; `gemini.py` and the
  `AI_PROVIDER` path are gone
- [ ] The previously deployed Python worker Cloud Run service is retained at zero traffic as a
  rollback target and is deleted only after this Definition of Done is signed off
- [ ] One Kotlin image runs the Cloud Run service plus the `photo-analysis` and
  `quiz-generation` Jobs via distinct entrypoints
- [ ] Word discovery is an inline service call
- [ ] Both Jobs write terminal results directly to Postgres through shared Ktorm code; writes
  are idempotent
- [ ] The worker→backend callback is removed; `WORKER_API_KEY` and `INTERNAL_API_KEY` are no
  longer used; Cloud Run metadata-server identity-token auth is removed
- [ ] Photo and quiz reapers mark stale rows actionable; the admin Jobs page shows stale/failed
  photo and quiz work and can rerun it without direct database edits
- [ ] Deploy commands build the one image and deploy the service and both Jobs; parity with
  pre-consolidation behavior is verified and the stack has soaked in production
- [ ] README and architecture docs describe the single-Kotlin-image Cloud Run topology

This is the durable resting state. Feature work may proceed here indefinitely.

### Milestone 2 — Fly.io + Cloudflare Pages

**Repository**

- [ ] Single Fly app defines `web` and `worker` process groups from one image; strict config
  validation passes; one `deploy-app` deploys both
- [ ] `worker` has no public Fly service or IP; `web` serves `api.shuukanhq.com`
- [ ] Jobs-API dispatch is replaced by the drainer: claims via `FOR UPDATE SKIP LOCKED` with a
  lease; lease expiry re-queues; terminal writes remain idempotent
- [ ] Drain concurrency, lease, and poll interval are configurable
- [ ] Scheduler defaults disabled, enqueues via transaction-scoped advisory locks + durable
  execution claims, and creates no tasks when `SCHEDULER_ENABLED=false`
- [ ] Both JVM processes have reviewed `MaxRAMPercentage` and direct-memory limits; pools are
  configurable; image downloads have time and size limits
- [ ] Fly custom queue-lag/drain metrics are exposed and scraped; Makefile/deploy-state are
  provider-neutral

**Fly.io**

- [ ] `web` and `worker` run in the same app and region; `worker` is unreachable from the
  public internet
- [ ] Both processes connect to Supabase with TLS; `LISTEN/NOTIFY` works from `worker`
- [ ] Combined Cloud Run and Fly database connections stayed within the Supabase limit
- [ ] Scheduled enqueues run exactly once per intended schedule
- [ ] Controlled shutdown drains or re-queues in-flight jobs within the grace period
- [ ] Fly staging remained scheduler-disabled and did not drain the production queue through
  Phases B–C

**Cloudflare Pages**

- [ ] Frontend builds from `frontend/`; production bundle uses `https://api.shuukanhq.com`
- [ ] `shuukanhq.com` serves the Pages deployment; direct navigation and refresh work on
  every route; Supabase login/redirect flows work
- [ ] Production CORS allows the Pages origin and rejects unrelated origins; security headers
  reviewed

**Cutover**

- [ ] Full photo-analysis and quiz-generation flows succeed via the drainer
- [ ] Quiz session resume/completion and the invite/email flow succeed
- [ ] All scheduled operations complete; interrupted work is recovered and rerun through the
  admin page
- [ ] Grafana metrics/log search and Better Stack uptime operated throughout the soak
- [ ] Google Cloud schedules are disabled; production has completed the soak; rollback was
  verified before legacy removal
- [ ] Cloud Run, both Cloud Run Jobs, GCS deployment automation, and obsolete Google Cloud
  resources are decommissioned

---

## 16. Admin control plane mockups

- [Admin control-plane implementation contract](admin-control-plane.md) — security boundary,
  job recovery semantics, versioned model configuration, blast radius, rollout, and test plan.
- [Jobs control panel](mockups/admin-jobs-control-panel.svg) — all durable job types and
  statuses, stale/failed recovery, rerun-as-a-new-attempt, and versioned model configuration.
- [Mobile Admin shell](mockups/admin-mobile-shell.svg) — mobile-first Cost and Invites views,
  bottom-sheet actions, and the same narrow application column at desktop widths.

The status in the Admin header is intentionally binary: **Operational** or **System down**.
Job-level facts and recovery controls live in Jobs; the global header does not expose internal
error details. Stale reconciliation remains automatic, while Mark failed and Rerun provide a
manual control path. Model identifiers are editable, validated, and versioned in Admin; API
keys and other secrets remain infrastructure-managed and never enter the browser. Every
transient interaction on mobile—including confirmations and model selection—uses a bottom
drawer rather than a centered modal.

---

## References

- [Fly.io app configuration reference](https://fly.io/docs/reference/configuration/)
- [Fly.io processes / multiple process groups](https://fly.io/docs/apps/processes/)
- [Fly.io app services](https://fly.io/docs/networking/app-services/)
- [Fly.io secrets and Machine restarts](https://fly.io/docs/apps/secrets/)
- [Fly.io health checks](https://fly.io/docs/reference/health-checks/)
- [Fly.io scaling process groups](https://fly.io/docs/apps/scale-count/)
- [Fly.io managed Prometheus and Grafana](https://fly.io/docs/monitoring/metrics/)
- [Fly.io searchable logs and retention](https://fly.io/docs/monitoring/search-logs/)
- [Fly.io long-running task lifecycle](https://fly.io/docs/blueprints/long-running-tasks/)
- [Fly.io custom domains](https://fly.io/docs/networking/custom-domain/)
- [Fly.io with Cloudflare](https://fly.io/docs/networking/understanding-cloudflare/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Supabase PostgreSQL connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase network restrictions](https://supabase.com/docs/guides/platform/network-restrictions)
- [PostgreSQL SELECT … FOR UPDATE SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [PostgreSQL LISTEN / NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
