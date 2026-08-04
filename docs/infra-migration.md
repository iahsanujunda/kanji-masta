# Infrastructure Migration — Fly.io + Cloudflare Pages

_Move the Ktor backend and AI worker from Cloud Run to Fly.io, move the static frontend from GCS to Cloudflare Pages, and retain Supabase for database, authentication, and storage_

---

## 1. Objective

Migrate the application runtime without moving application data:

- Run the Ktor backend on a public Fly.io Machine with 1 GB of memory initially.
- Run the FastAPI AI worker on a separate private Fly.io Machine with 512 MB of memory.
- Route backend-to-worker traffic over Fly.io private IPv6 networking.
- Host the React/Vite frontend on Cloudflare Pages.
- Keep Supabase as the PostgreSQL database, authentication provider, and photo storage provider.
- Preserve the existing `shuukanhq.com` frontend domain.
- Introduce `api.shuukanhq.com` as the stable public API hostname.
- Replace Cloud Run-specific service authentication and deployment commands.
- Migrate all scheduled jobs away from Google Cloud infrastructure.
- Provide a staged cutover with a DNS-based rollback path.

This is primarily a runtime and deployment migration. No schema or production-data migration is required.

---

## 2. Target architecture

```text
Browser
  ├── static application ───────────────> Cloudflare Pages
  │                                        shuukanhq.com
  │
  ├── authenticated API requests ───────> Fly.io backend
  │                                        api.shuukanhq.com
  │                                        Ktor, 1 GB
  │                                             │
  │                                  Fly private IPv6 / 6PN
  │                                             │
  └── direct Supabase client calls              v
                                           Fly.io AI worker
                                           FastAPI, 512 MB

Backend and AI worker ───────────────────> Supabase PostgreSQL
Browser ─────────────────────────────────> Supabase Auth + Storage
AI worker ───────────────────────────────> Gemini or OpenRouter
Backend ─────────────────────────────────> Resend
```

### Fly.io applications

Use two separate Fly Apps in the same Fly organization and primary region:

| Application | Exposure | Initial size | Runtime |
|-------------|----------|--------------|---------|
| Backend | Public HTTPS through Fly Proxy | `shared-cpu-1x`, 1 GB | Ktor/JVM |
| AI worker | Private 6PN only; no public service | `shared-cpu-1x`, 512 MB | FastAPI/Uvicorn |

The backend and worker should start in the same region. Region selection should match the Supabase AWS region because most application requests perform database work. Use Fly `nrt` when Supabase is in `ap-northeast-1`; otherwise select the nearest Fly region to the actual Supabase region and verify database latency before cutover.

Both Machines should remain running during the initial migration and soak period. Autostop is unsafe for the current long-running/background request pattern because Fly Proxy only observes inbound traffic and cannot see application work continuing after the initiating browser request has completed.

### Stable hostnames

| Purpose | Hostname |
|---------|----------|
| Production frontend | `https://shuukanhq.com` |
| Production API | `https://api.shuukanhq.com` |
| Backend private address | `http://<backend-fly-app>.internal:8080` |
| AI worker private address | `http://<worker-fly-app>.internal:8080` |

The frontend should use `api.shuukanhq.com`, not a provider-specific `.fly.dev` hostname. Future backend migrations can then happen without rebuilding the frontend solely to change `VITE_API_URL`.

---

## 3. Current-state gaps

The existing containers are portable, but the repository contains several Cloud Run and GCS assumptions that must change.

### 3.1 Backend-to-worker authentication is Cloud Run-specific

`backend/src/main/kotlin/com/kanjimasta/core/auth/CloudRunAuth.kt` calls the Google metadata server to obtain an identity token. That metadata server is unavailable on Fly.io. Leaving the call in place would cause failed lookups or avoidable latency before worker requests.

Required changes:

- Remove the Google metadata-server identity-token flow.
- Add a dedicated `WORKER_API_KEY` secret to both Fly Apps.
- Send the key on every backend-to-worker request, for example with `X-Worker-Key`.
- Reject missing or invalid keys in the AI worker.
- Keep the worker private-only even after application-layer authentication is added.
- Add tests for missing, invalid, and valid worker keys.

The existing `INTERNAL_API_KEY` remains suitable for worker-to-backend callback authentication. Keeping separate keys makes the two trust directions independently rotatable.

### 3.2 The AI worker does not listen on private IPv6

The worker currently starts Uvicorn with `--host 0.0.0.0`. Fly `.internal` DNS resolves to 6PN IPv6 addresses, and a private service must listen on IPv6 to be reachable directly.

Required changes:

- Bind Uvicorn to `::` or the Machine's `fly-local-6pn` address.
- Do not add `[http_service]` or public `[[services]]` configuration to the worker app.
- Do not allocate public IP addresses for the worker.
- Verify AAAA resolution of `<worker-fly-app>.internal` from the backend Machine.
- Verify `GET /health` and all worker operations over the private hostname.

### 3.3 The backend must listen on private IPv6 for callbacks

The worker sends results back to backend callback routes protected by `INTERNAL_API_KEY`.

Use private callback routing:

```text
SELF_URL=http://<backend-fly-app>.internal:8080
```

Bind Ktor to `::` so the same listener accepts Fly Proxy traffic and direct 6PN callback traffic. Verify both paths inside Fly before cutover. Do not route callbacks through the public API hostname.

### 3.4 Scheduled jobs are not represented as deployable infrastructure

The repository exposes scheduled operations but does not contain the scheduler configuration that invokes them:

- `POST /cron/generate-quizzes`
- `POST /cron/check-regen`
- `POST /api/internal/cron/cleanup-photo-sessions`

A scheduler outside the Fly organization cannot call a private `.internal` worker address.

Use one in-process scheduler in the Ktor backend. It is smaller than operating Fly Cron Manager and supports exact schedules and an explicit time zone, unlike Fly Scheduled Machines, which only provide fuzzy hourly/daily/weekly/monthly intervals in UTC.

Required changes:

- Read `SCHEDULER_ENABLED` at startup and default it to `false` when absent.
- Do not create scheduler tasks when `SCHEDULER_ENABLED=false`; emit one startup log that confirms the disabled state.
- Start the scheduler from the Ktor application lifecycle only when `SCHEDULER_ENABLED=true`.
- Configure every schedule and its IANA time zone in version-controlled application configuration.
- Use `pg_try_advisory_xact_lock` inside a short scheduler-claim transaction rather than holding a session advisory lock on a leased Hikari connection.
- In the same claim transaction, create or claim a durable execution record keyed by task and scheduled occurrence. The unique claim prevents a second instance from running the task after the transaction-scoped lock releases.
- Assign a stable, documented lock identifier to each scheduled operation.
- Skip the execution when another instance holds the lock.
- Invoke the private worker endpoints for quiz generation and regeneration checks.
- Invoke the backend cleanup service for stale photo sessions and quiz jobs.
- Log the task name, scheduled time, start time, duration, result count, and failure.
- Ensure each operation is safe to retry.
- Release scheduler resources during graceful shutdown.
- Test two backend instances attempting the same schedule and prove only one performs the work.

The transaction-scoped advisory lock and durable execution claim are required even with one backend Machine so later scaling or overlapping deployments do not create duplicate runs. Do not hold a database transaction open while waiting for an AI worker HTTP request.

The advisory lock does not coordinate with the existing Google Cloud Scheduler because those HTTP-triggered paths do not acquire it. `SCHEDULER_ENABLED=false` is therefore the cross-platform overlap control during Phases B and C.

### 3.5 Durable records exist, but stale-state recovery is incomplete

The dispatch paths already create durable database records before contacting the worker:

- `PhotoService.startAnalysis()` inserts a `photo_session` row with the default `PROCESSING` status before launching the worker request.
- quiz selection inserts `quiz_generation_job` rows with `PENDING` status before `triggerQuizGeneration()` contacts the worker.
- the worker marks a quiz job `PROCESSING` before making the AI call.

An outbox is therefore not a prerequisite for this migration and must not be introduced in Phase A. The immediate gap is that an interrupted quiz job can remain `PROCESSING` indefinitely. Photo sessions already have an hourly cleanup path that marks stale `PROCESSING` rows failed, but quiz jobs have no equivalent reaper.

Ship the following as a separate reliability release on Cloud Run before starting the Fly migration:

- Detect stale `PROCESSING` quiz jobs using `updated_at` and a documented timeout.
- Mark stale jobs `FAILED`, increment `attempts`, and record a recovery reason.
- Surface stale, failed, and long-running work in the admin Jobs page.
- Make the admin retry action the documented recovery path.
- Add equivalent admin visibility and recovery for failed photo sessions, or explicitly provide a user-visible rescan action using the stored image.
- Ensure a retried quiz job returns to `PENDING`, immediately triggers private worker processing, and requires no manual database edits.
- Test status transitions and retry behavior around process restarts.
- Exercise the admin recovery flow in production while the existing Cloud Run runtime and Cloud Logging remain the known-good platform.

A transactional outbox or database-polling worker may be considered only after the new infrastructure has completed its soak period.

### 3.6 Public API requests do not wait for AI completion

The current Ktor dispatch paths create their database record and then call the worker from a separate coroutine. The browser-facing request returns without waiting for the AI request to finish. Cloudflare's origin request timeout therefore does not apply to photo analysis or quiz generation completion.

Keep the Cloudflare proxy enabled for `api.shuukanhq.com` to retain fast DNS/origin rollback. Add a regression test proving the dispatch endpoints return promptly while worker processing continues, and confirm normal synchronous API routes remain comfortably below Cloudflare's origin timeout.

### 3.7 Deployment commands target Google Cloud

The current `Makefile`:

- builds and pushes images to Google Artifact Registry;
- deploys backend and worker services with `gcloud run deploy`;
- discovers Cloud Run service URLs;
- uploads the frontend to a GCS bucket.

These commands must be replaced or retained temporarily under clearly named legacy targets during the rollback window.

### 3.8 Documentation is stale

`README.md` still describes older Firebase and Cloud Run architecture in several places. Deployment, architecture, environment-variable, and project-structure documentation must be updated after the new deployment path is working.

---

## 4. Repository changes

### 4.1 Fly backend configuration

Add `backend/fly.toml` containing:

- the final Fly app name;
- primary region;
- Dockerfile build configuration;
- `internal_port = 8080`;
- forced HTTPS;
- service-level HTTP health check against `/health`;
- one `shared-cpu-1x` Machine with 1 GB memory;
- `auto_stop_machines = "off"`;
- `auto_start_machines = true`;
- `kill_timeout = 90`;
- an immediate deployment strategy for the single Machine.

The `/health` route should remain a lightweight liveness check. Add a separate readiness check if database reachability must affect traffic routing; do not turn the current health route into an expensive query executed every few seconds.

### 4.2 Fly AI worker configuration

Add `services/ai-worker/fly.toml` containing:

- the final Fly app name;
- the same primary region as the backend;
- Dockerfile build configuration;
- one `shared-cpu-1x` Machine with 512 MB memory;
- no public HTTP service;
- no public IP allocation;
- a top-level health/monitoring check where practical;
- restart policy for unexpected process exits;
- `kill_timeout = 90`;
- an immediate deployment strategy for the single Machine.

Because there is no Fly Proxy service in front of the worker, proxy-based autostart and autostop do not apply. The worker should run continuously.

### 4.3 Worker request authentication

Replace `getIdentityToken()` usage in:

- `PhotoService`
- `KanjiService`

with a small worker-client authentication abstraction that adds `X-Worker-Key` to outbound requests.

Add FastAPI validation covering:

- `/analyze-photo`
- `/generate-quizzes`
- `/cron/generate-quizzes`, if the HTTP form remains enabled
- `/cron/check-regen`, if the HTTP form remains enabled

`GET /health` may remain unauthenticated because it is only exposed on the private network and is needed for health checks.

Do not include secret values in `fly.toml`, Docker images, logs, error messages, frontend environment variables, or committed `.env` files.

### 4.4 Runtime configuration

Add or formalize the following backend variables:

```text
PORT=8080
DATABASE_URL=...
SUPABASE_URL=...
AI_WORKER_URL=http://<worker-fly-app>.internal:8080
WORKER_API_KEY=...
INTERNAL_API_KEY=...
SELF_URL=http://<backend-fly-app>.internal:8080
SCHEDULER_ENABLED=false
CORS_ALLOWED_ORIGINS=shuukanhq.com
RESEND_API_KEY=...
ADMIN_USER_ID=...
LOG_LEVEL=INFO
```

Add or formalize the following worker variables:

```text
PORT=8080
DATABASE_URL=...
WORKER_API_KEY=...
AI_PROVIDER=gemini|openrouter
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
OPENROUTER_REASONING_EFFORT=...
OPENROUTER_ANALYZE_MODEL=...
OPENROUTER_QUIZ_MODEL=...
OPENROUTER_DISCOVERY_MODEL=...
OPENROUTER_SITE_URL=https://shuukanhq.com
OPENROUTER_APP_NAME=Kanji Masta
```

Fly secrets should hold all credentials, private connection strings, and the `SCHEDULER_ENABLED` production kill switch. Keep `SCHEDULER_ENABLED=false` through Phases B and C. Non-sensitive settings such as log level and internal service URLs may live in `[env]` sections of the Fly configuration.

### 4.5 Memory and connection-pool hardening

Start the JVM backend at 1 GB. A 512 MB JVM limit leaves little margin for Netty direct buffers, metaspace, thread stacks, and non-heap allocations even when the Java heap appears healthy. Keep the Python worker at 512 MB initially and measure both services under representative work.

Backend changes:

- Set `-XX:MaxRAMPercentage=55` through `JAVA_TOOL_OPTIONS` and lower it if native-memory measurements leave insufficient headroom.
- Set an explicit `-XX:MaxDirectMemorySize=128m` for Netty/direct buffers and verify it under load.
- Add `-XX:+ExitOnOutOfMemoryError` so an unhealthy process restarts cleanly.
- Make Hikari `maximumPoolSize` configurable instead of hard-coding seven.
- Start with a conservative pool size and increase only from observed demand.
- Export or log enough information to distinguish JVM heap pressure from connection exhaustion.

Worker changes:

- Make the psycopg2 pool maximum configurable instead of hard-coding five.
- Add explicit connect, read, and total timeouts for image downloads.
- Reject unexpectedly large image responses before base64 expansion.
- Stream or cap downloads rather than accepting an unlimited response body.
- Record peak memory during representative photo-analysis and quiz-generation requests.

Initial combined database connection limits should account for both services. Current defaults allow up to twelve application connections for one backend/worker pair before scheduler, administrative, or migration connections are counted.

Phases B through D temporarily run the Cloud Run backend/worker pair and Fly backend/worker pair against the same Supabase database. With one instance of each service, the current pool maxima can therefore reach roughly 24 application connections; Cloud Run autoscaling can make the real ceiling higher. Before Phase B:

- inventory Cloud Run maximum instances and actual pool settings;
- calculate the worst-case old-plus-new connection ceiling;
- reserve headroom for migrations, Supabase services, scheduler claims, and administrative access;
- compare the total with the production Supabase plan's connection limit;
- reduce pool sizes or Cloud Run maximum instances before deploying Fly if the limit is not comfortably met.

If the worker repeatedly exceeds roughly 80–85% of its 512 MB allocation under representative photo load, increase it to 1 GB rather than relying on repeated OOM restarts. Reduce the backend to 512 MB only after production measurements demonstrate safe heap and native-memory headroom.

### 4.6 Graceful shutdown and in-flight work

Photo analysis and quiz generation can outlive the browser request that initiated them. Code inspection confirms that worker AI work is not detached from Uvicorn:

- `/analyze-photo` awaits the image download, AI call, and callback in its request handler.
- `/generate-quizzes` is a synchronous FastAPI handler and remains an active request while its thread-pool work runs.
- the worker does not use FastAPI `BackgroundTask` or bare `asyncio.create_task` for these operations.

Uvicorn can therefore drain these active requests during graceful shutdown. No outstanding-task registry is required for the current worker shape.

The Ktor side is different: `PhotoService` and `KanjiService` launch outbound worker calls in service-owned `CoroutineScope(Dispatchers.IO)` instances after the browser request returns. Those coroutines are not automatically drained as active Ktor requests. Replace them with an application-managed scope, stop accepting new dispatch work during shutdown, await outstanding dispatch calls within the shutdown budget, and then cancel what remains. The durable database record remains the recovery mechanism if the drain cannot finish.

Required protections:

- Disable Fly autostop for the backend.
- Keep the worker continuously running.
- Set Fly `kill_timeout = 90` for both services.
- Set Uvicorn `--timeout-graceful-shutdown=75`, leaving time for lifespan cleanup before Fly forces termination.
- Bound the Ktor application-managed dispatch drain to less than 90 seconds.
- Close the psycopg2 pool during FastAPI lifespan shutdown.
- Ensure callback and job status writes are idempotent.
- Verify what happens when backend deployment occurs after a worker job starts but before its callback.
- Verify what happens when a worker deployment interrupts active AI generation.
- Run stale-state recovery for sessions and jobs left in `PROCESSING`.
- Verify the admin Jobs page can rerun recovered work successfully.
- Preserve database state as the source of truth; no job may depend solely on process memory.

`kill_timeout` is a best-effort drain window, not a durability guarantee. A single-Machine immediate deploy can make the API unavailable during this window, so the plan deliberately caps it at 90 seconds and relies on stale-state recovery for longer work. A later reliability iteration may replace long-lived HTTP-triggered work with an outbox or database-backed worker poller, but that redesign is explicitly out of scope until after migration soak.

### 4.7 Makefile and deployment state

Add targets such as:

```text
make deploy-db
make deploy-backend
make deploy-ai-worker
make deploy-frontend
make deploy-all
make deploy-status
make smoke-production
```

Expected behavior:

- `deploy-backend` runs backend tests/build and then `fly deploy backend`.
- `deploy-ai-worker` runs worker tests and then `fly deploy services/ai-worker`.
- `deploy-frontend` either performs a Wrangler Pages deployment or explains that Git integration deploys from the production branch.
- `deploy-all` retains the dependency order: database, worker, backend, frontend.
- deploy-state recording remains provider-neutral.
- `scripts/check_deploy.py` maps relevant paths to the new components.

During the rollback window, old Cloud Run/GCS commands may remain available as explicitly named `deploy-legacy-*` targets. Remove them after production has passed the soak period.

### 4.8 Cloudflare Pages repository preparation

Cloudflare Pages configuration:

| Setting | Value |
|---------|-------|
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

Preview deployments need separate Supabase and API values only if authenticated preview testing is required. Avoid permitting arbitrary `*.pages.dev` origins in production CORS. Prefer a fixed staging hostname or an explicit preview-origin policy.

Cloudflare Pages automatically applies SPA fallback behavior when no top-level `404.html` is deployed. A catch-all `_redirects` rule is therefore not required for the current React Router application. Verify direct navigation and refresh on every route during staging.

Add a `frontend/public/_headers` file if browser security headers are not already applied elsewhere. At minimum, review:

- `Content-Security-Policy`
- `Referrer-Policy`
- `X-Content-Type-Options`
- `Permissions-Policy`
- asset caching for fingerprinted Vite files

Do not add aggressive caching rules for `index.html`; each Pages deployment already handles asset invalidation.

---

## 5. External infrastructure configuration

### 5.1 Fly organization and applications

- Create or select the Fly organization.
- Enable billing.
- Select globally unique backend and worker app names.
- Select the primary region.
- Create both Fly Apps in the same organization.
- Confirm the worker has no public service and no allocated public IPs.
- Confirm the backend receives public IPv6 and shared IPv4 through its HTTP service.
- Set secrets independently on both applications.
- Retain a secure record of secret names and rotation procedures.

### 5.2 Supabase database connectivity

Preferred runtime connection:

- Use the Supabase direct PostgreSQL hostname over IPv6 for the persistent backend and worker.
- Require TLS with `sslmode=require`.
- Keep migration tooling on a connection mode suitable for DDL and administrative work.
- Do not use transaction-pooler-specific JDBC workarounds unless the selected runtime connection actually uses transaction pooling.

Validation:

- Complete the old-plus-new connection-budget calculation before creating Fly Machines that point at production Supabase.
- Resolve the Supabase database hostname from each Fly Machine.
- Establish TLS connections from both services.
- Confirm normal queries, transactions, and startup pool creation.
- Confirm total connection usage stays within the Supabase plan limit.
- Confirm database latency from the chosen Fly region.

If Supabase network restrictions are enabled:

- Allocate stable Fly egress IPs for every Machine that connects to PostgreSQL, or revise the restriction strategy.
- Add both relevant IPv4 and IPv6 CIDRs to the Supabase allowlist.
- Account for replacement Machines during deployments; machine-scoped egress addresses complicate rolling replacement.

Static egress IPs are unnecessary when Supabase network restrictions are not enabled.

### 5.3 Fly secrets

Set backend secrets:

- `DATABASE_URL`
- `SUPABASE_URL`
- `WORKER_API_KEY`
- `INTERNAL_API_KEY`
- `SCHEDULER_ENABLED` (set to `false` through Phases B and C)
- `RESEND_API_KEY`
- `ADMIN_USER_ID`

Set worker secrets:

- `DATABASE_URL`
- `WORKER_API_KEY`
- selected AI provider API keys

Rotate the existing `INTERNAL_API_KEY` during migration if it has previously been exposed outside managed secret stores.

### 5.4 API domain and TLS

Provision `api.shuukanhq.com` on the backend Fly App:

1. Add the hostname to the Fly App.
2. Obtain the exact DNS records from `fly certs setup api.shuukanhq.com`.
3. Add the required CNAME or A/AAAA records in Cloudflare DNS.
4. Add the `_fly-ownership` TXT record when the Cloudflare proxy is enabled.
5. Set Cloudflare SSL mode to `Full (strict)`.
6. Verify certificate issuance before directing production traffic.
7. Verify HTTP-to-HTTPS redirects and the `/health` endpoint.

Use either a CNAME or A/AAAA records as instructed by Fly; do not leave conflicting record types for the same hostname.

### 5.5 Cloudflare Pages project

- Create a Git-integrated Pages project.
- Authorize repository access.
- Configure the monorepo root, build command, and output directory.
- Configure production and preview build variables.
- Limit automatic builds to frontend-relevant paths.
- Deploy and test the generated `.pages.dev` hostname.
- Attach `shuukanhq.com` only after preview verification succeeds.
- Confirm that the old frontend origin remains recoverable during the rollback window.

Git integration is preferred over a Direct Upload-only project because it provides branch previews, commit status, and automatic production deployments. The choice should be made before project creation because Pages restricts switching integration modes later.

### 5.6 Supabase Auth URLs

- Keep the production Site URL set to `https://shuukanhq.com`.
- Confirm signup, login, invite, password-reset, and callback URLs.
- Add a fixed staging URL if authenticated staging is required.
- Do not allow broad preview wildcards unless the security consequences are accepted.

### 5.7 Scheduled jobs

- Configure the Ktor in-process scheduler and exact IANA time zone.
- Configure each schedule in version control.
- Verify the backend starts with no scheduled tasks when `SCHEDULER_ENABLED=false`.
- Run each scheduled operation in local/integration tests before Fly deployment.
- Do not manually execute Fly schedules against production Supabase while Google Cloud Scheduler remains enabled.
- Verify the PostgreSQL advisory lock from two concurrent backend processes.
- Confirm only one logical execution occurs per schedule.
- Confirm results and failures appear in Fly Grafana log search.
- Add a documented manual rerun procedure.
- At cutover, disable the corresponding Google Cloud schedules first.
- Then set `SCHEDULER_ENABLED=true` on Fly and wait for the resulting Machine restart to complete.
- Confirm the Fly startup log reports the scheduler enabled before considering scheduler cutover complete.

---

## 6. Security requirements

- The AI worker must have no public Fly service.
- Private networking is not a substitute for application authentication.
- Worker request keys and callback keys must be different secrets.
- All browser-to-backend traffic must use HTTPS.
- Database traffic must use TLS outside Fly private networking.
- CORS must allow only the production frontend and intentionally configured staging origins.
- Callback endpoints must reject missing or invalid `INTERNAL_API_KEY` values.
- Worker endpoints must reject missing or invalid `WORKER_API_KEY` values.
- Health endpoints must not return secret or dependency configuration.
- Logs must never contain API keys, database credentials, JWTs, or full signed storage URLs.
- Cloudflare SSL mode must be `Full (strict)`, never `Flexible`.
- Fly and Cloudflare access tokens used by CI must have the narrowest practical scopes.
- Production secrets must not be supplied as Docker build arguments.

---

## 7. Observability and operational checks

Observability must be operating before application cutover. `fly logs` remains useful for live tailing; Fly's built-in Grafana log search currently retains searchable application logs for seven days, which covers the planned 48-hour soak.

Use this stack:

- Fly.io managed Prometheus and managed Grafana for built-in Machine, proxy, CPU, memory, restart, and network metrics.
- application `/metrics` endpoints scraped through each app's Fly `[metrics]` configuration for service-specific metrics.
- Fly Grafana log search for backend and worker log retention and investigation during migration.
- Better Stack uptime checks for `https://api.shuukanhq.com/health` and `https://shuukanhq.com`.

Do not deploy Fly Log Shipper for the initial migration. Reconsider a shipper and external sink after soak only if seven-day retention, beta log search, or missing log-based alerting proves insufficient.

Establish a Cloud Run/Cloud Monitoring baseline before cutover and compare it with Fly production behavior.

### Backend

- Machine restarts and OOM events
- JVM heap and total resident memory
- request count, latency, and error rate
- database pool active, idle, and timeout counts
- worker request latency and failures
- callback authentication failures
- Supabase JWT/JWKS failures
- Resend failures
- scheduler executions, lock skips, durations, and failures
- stale job recovery counts

### AI worker

- Machine restarts and OOM events
- process resident memory during image analysis
- database pool exhaustion
- image download size and latency
- Gemini/OpenRouter latency and error rate
- callback attempts and failures
- scheduled job duration and result counts
- active worker requests during graceful shutdown

### Cloudflare Pages

- build failures
- production deployment status
- missing assets and route-refresh failures
- browser console errors
- API CORS failures

Add Better Stack uptime alerts for both public endpoints. Build a Fly Grafana migration dashboard covering resident memory, CPU, response latency, response status, restarts, and custom database-pool/worker metrics. During the 48-hour soak, review Grafana metrics and logs at defined checkpoints for Machine restarts/OOM events, sustained 5xx responses, failed scheduler executions, callback failures, and stale-state recovery.

---

## 8. Testing plan

### 8.1 Automated tests

- Backend tests pass after removing Cloud Run identity-token code.
- Worker tests pass with request authentication enabled.
- Backend worker-client tests verify the correct header without logging its value.
- Worker authentication tests cover missing, invalid, and valid keys.
- Callback authentication tests continue to pass.
- Frontend unit and browser tests pass against the existing fake API.
- Docker images build from their respective subdirectories.
- `fly config validate --strict` passes for both Fly configurations.

### 8.2 Private-network smoke tests

From the backend Machine:

- resolve `<worker-fly-app>.internal` as AAAA;
- call the worker health endpoint;
- verify an unauthenticated worker operation is rejected;
- verify an authenticated worker operation succeeds.

From the worker Machine:

- resolve the backend private hostname;
- call the backend health endpoint;
- verify a callback with an invalid key is rejected;
- verify a valid callback succeeds.

### 8.3 End-to-end staging tests

Run queue-mutating end-to-end tests against local Supabase or an isolated Supabase staging project. While Fly and Cloud Run share production Supabase in Phases B and C, limit production checks to health, authentication, private networking, callbacks with dedicated records, and read-only behavior; do not let both AI workers compete for the shared pending-job queue.

- Open every frontend route directly and refresh it.
- Sign up or sign in through Supabase.
- Refresh an authenticated session.
- Load kanji, word, quiz, settings, and admin data as applicable.
- Upload a photo to Supabase Storage.
- Start photo analysis and receive the callback result.
- Generate quizzes and receive all callbacks.
- Open the admin Jobs page and verify pending, processing, stale, and failed work is visible.
- Retry a failed quiz job from the admin Jobs page and verify it reaches `DONE`.
- Exercise the documented failed-photo recovery or rescan flow.
- Complete and resume a quiz session.
- Send or validate an invite flow and Resend link.
- Run every scheduled command manually.
- Verify CORS rejection from an unapproved origin.
- Verify public requests cannot reach the AI worker.

### 8.4 Failure tests

Run the recovery-path tests first on Cloud Run in Phase 0. During Fly migration, repeat only the platform-specific shutdown and restart cases with dedicated test records; Phase D must not be the first proof that admin recovery works.

- Restart the backend during an active worker job; recover the stale job, rerun it from the admin Jobs page, and verify it reaches `DONE`.
- Restart the worker during an active AI request; recover the stale job/session, rerun it through the documented admin recovery path, and verify it succeeds.
- Deploy the worker during an active request and verify Uvicorn drains the request when it finishes within the configured grace period.
- Run a job longer than the graceful-shutdown limit and verify durable stale-state recovery rather than silent loss.
- Temporarily supply an invalid worker key.
- Temporarily supply an invalid callback key.
- Simulate an unavailable database at startup.
- Simulate a failed AI provider call.
- Submit an oversized image response.
- Confirm the complete operator flow: stale work becomes visible and actionable, an admin reruns it, and the rerun succeeds without direct database edits.

---

## 9. Migration sequence

### Phase 0 — ship recovery on Cloud Run

- Add stale quiz-job detection and recovery.
- Complete the admin rerun flow for interrupted quiz jobs.
- Add the documented failed-photo recovery or rescan path.
- Deploy these changes to the existing Cloud Run infrastructure.
- Force an interrupted job on Cloud Run, recover it through the admin page, rerun it, and verify it reaches `DONE`.
- Observe the release with the existing Cloud Logging/Monitoring stack before beginning Fly work.

This separates new recovery behavior from the infrastructure migration. Phase A does not begin until the recovery path is proven on the known-good platform.

### Phase A — prepare the repository

- Add Fly configurations.
- Replace Cloud Run identity-token authentication.
- Add worker authentication.
- Add IPv6 listener configuration.
- Add memory and connection-pool settings.
- Add the locked in-process Ktor scheduler.
- Add and test the `SCHEDULER_ENABLED` startup kill switch, defaulting to disabled.
- Add application metrics endpoints.
- Add Fly managed Prometheus/Grafana configuration.
- Add Better Stack uptime checks.
- Update deployment commands.
- Add automated tests.
- Update deployment documentation.

No production DNS or existing deployment is changed in this phase.

Do not build an outbox or replace the HTTP worker protocol in this phase. Use the existing durable `photo_session` and `quiz_generation_job` records, then reconsider the worker architecture after migration soak.

### Phase B — provision Fly staging endpoints

- Confirm the production Supabase connection budget can support Cloud Run and Fly concurrently.
- Create the backend and worker Fly Apps.
- Set all required secrets, including `SCHEDULER_ENABLED=false` on the backend.
- Deploy the private worker.
- Verify that the worker has no public service or public IPs.
- Deploy the backend at its `.fly.dev` hostname.
- Verify Supabase connectivity from both Machines.
- Verify private backend-to-worker communication.
- Verify callback routing.
- Verify the backend startup log confirms the scheduler is disabled and no scheduled tasks are registered.
- Verify searchable logs and metrics arrive in Fly Grafana.
- Verify Better Stack uptime checks and alerts.
- Confirm the Phase 0 admin recovery release is present; do not force a new production failure during staging.
- Record baseline memory and latency.

Cloud Run remains production during this phase.

### Phase C — provision the new public endpoints

- Add `api.shuukanhq.com` to the Fly backend.
- Configure Cloudflare DNS and Fly certificate ownership.
- Validate TLS using `Full (strict)` mode.
- Create the Cloudflare Pages project.
- Configure the Pages build to use `https://api.shuukanhq.com`.
- Deploy a Pages preview.
- Complete the end-to-end staging checklist against isolated test data; keep production queue-mutating worker tests disabled.
- Reconfirm `SCHEDULER_ENABLED=false` and verify Cloud Scheduler remains the only active scheduler.

### Phase D — backend cutover

- Lower relevant DNS TTLs in advance where possible.
- Disable the matching Google Cloud Scheduler jobs and confirm no executions remain active.
- Direct `api.shuukanhq.com` to Fly.
- Wait for old Cloud Run API requests and worker triggers to drain.
- Manually invoke each Fly scheduled operation once and verify its result while Google Cloud Scheduler is disabled and the in-process scheduler is still off.
- Set `SCHEDULER_ENABLED=true` on the Fly backend. This secret update restarts the single Machine.
- Wait for the Fly Machine to become healthy and confirm its startup log reports the scheduler enabled.
- Confirm frontend API traffic reaches Fly.
- Monitor errors, latency, memory, callbacks, and database connections.
- Keep the Cloud Run backend and worker deployable but stop sending new traffic to them.
- Verify the first Fly scheduler claim and execution, including its transaction-scoped lock and unique execution record.

### Phase E — frontend cutover

- Attach `shuukanhq.com` to Cloudflare Pages.
- Verify DNS and TLS.
- Repeat login, upload, photo, quiz, invite, and route-refresh smoke tests.
- Confirm the Pages build points only to `api.shuukanhq.com`.
- Keep the existing GCS frontend available for rollback.

### Phase F — soak and decommission

Soak the new infrastructure for at least 24–48 hours under normal usage.

During the soak:

- review Fly Grafana metrics and seven-day searchable logs at defined checkpoints;
- review Better Stack uptime results;
- review all Machine restarts;
- confirm there are no OOM events;
- inspect callback and scheduled-job failures;
- verify no sessions or jobs remain stuck;
- verify database connection counts;
- compare response latency with the previous deployment;
- confirm Cloudflare Pages builds and routing remain healthy.

After the soak:

- remove Cloud Run services;
- remove obsolete Artifact Registry images or repositories according to retention policy;
- remove GCS frontend deployment automation;
- remove Google Cloud scheduler jobs;
- remove temporary DNS records;
- remove legacy Make targets;
- rotate migration-time credentials if necessary;
- update `deploy-state.json` and final architecture documentation.

Do not delete Supabase resources, migrations, storage buckets, or production data as part of this infrastructure migration.

---

## 10. Rollback plan

Rollback remains available until the soak period is complete and legacy services are removed.

### Backend rollback

1. Restore `api.shuukanhq.com` DNS to the Cloud Run endpoint or its previous proxy origin.
2. Set the Fly backend secret `SCHEDULER_ENABLED=false`.
3. Wait for the resulting Fly Machine restart and verify its startup log reports the scheduler disabled.
4. Re-enable the old Google Cloud Scheduler jobs only after Fly scheduling is confirmed off.
5. Confirm the frontend can call the restored API.
6. Investigate Fly without changing the database.

API rollback is fast because it is a Cloudflare origin/DNS change. Scheduler rollback is slower because changing `SCHEDULER_ENABLED` updates and restarts the Fly Machine; budget up to the configured shutdown window plus boot and health-check time. Never re-enable Cloud Scheduler before the Fly scheduler-disable restart has completed.

### Frontend rollback

1. Restore `shuukanhq.com` to the existing GCS/Cloudflare origin configuration.
2. Verify that the restored frontend uses `https://api.shuukanhq.com` or the restored API URL.
3. Purge or wait for Cloudflare DNS/cache propagation as appropriate.

A frontend-only rollback does not change scheduler ownership. A full platform rollback must also complete the backend scheduler-disable sequence above before Google Cloud Scheduler is re-enabled.

### Data considerations

- Both old and new runtimes use the same Supabase database.
- No database restore is expected during infrastructure rollback.
- Never allow both scheduler stacks to process the same jobs concurrently.
- Avoid rolling back application code across incompatible schema migrations. Schema deployments remain a separate compatibility decision.

---

## 11. Implementation estimate

| Workstream | Estimated active effort |
|------------|-------------------------|
| Fly configuration and deployment commands | 0.5 day |
| Private networking and authentication replacement | 0.5–1 day |
| Memory, connection pool, health, and failure hardening | 0.5–1 day |
| Pre-migration Cloud Run recovery release | 0.5–1 day |
| Locked in-process scheduler | 0.5 day |
| Metrics, Grafana logs/dashboard, and uptime alerts | 0.25–0.5 day |
| Cloudflare Pages preparation and documentation | 0.5 day |
| Infrastructure provisioning, DNS, and secrets | 2–4 hours |
| Staging verification and production cutover | 2–4 hours |
| Production soak | 24–48 hours elapsed |

Expected total: approximately three to five active engineering days plus the production soak period.

---

## 12. Decisions required before implementation

- [ ] Final Fly organization
- [ ] Backend Fly app name
- [ ] AI worker Fly app name
- [ ] Confirm Supabase AWS region and select the matching Fly region (`nrt` for `ap-northeast-1`)
- [ ] Confirm backend starts at 1 GB and worker starts at 512 MB
- [ ] Confirm backend remains always-on initially
- [ ] Confirm worker remains always-on and private-only
- [ ] Confirm Ktor binds to `::` and callbacks use the private backend hostname
- [ ] Confirm `SCHEDULER_ENABLED=false` for Phases B and C, and approve the Phase D scheduler handoff sequence
- [ ] Exact schedules and time zone for all three scheduled operations
- [ ] Git-integrated Cloudflare Pages project or Direct Upload workflow
- [ ] Production branch name
- [ ] Whether authenticated preview deployments are required
- [ ] Supabase direct IPv6 connection or pooler connection
- [ ] Whether Supabase database network restrictions are enabled
- [ ] Better Stack uptime-check account and alert recipients
- [ ] Length of production soak before legacy decommissioning

Recommended defaults:

- Git-integrated Cloudflare Pages
- `api.shuukanhq.com` as the stable backend hostname
- Cloudflare proxy enabled with `_fly-ownership` verification and `Full (strict)` TLS
- direct Supabase IPv6 connection with `sslmode=require`
- private callback routing over a dual-stack Ktor listener
- one in-process Ktor scheduler protected by transaction-scoped PostgreSQL advisory locks and durable execution claims
- `SCHEDULER_ENABLED=false` until Google Cloud Scheduler is disabled during Phase D
- Fly managed Prometheus/Grafana with seven-day log search plus Better Stack uptime checks
- one always-running 1 GB backend Machine and one always-running 512 MB worker Machine
- 48-hour soak before decommissioning Google Cloud resources

---

## 13. Definition of Done

### Repository

- [ ] Backend Fly configuration is committed and passes strict validation
- [ ] AI worker Fly configuration is committed and passes strict validation
- [ ] Both single-Machine apps use immediate deployment strategy and a 90-second Fly shutdown window
- [ ] Worker has no public Fly service
- [ ] Cloud Run metadata-server authentication is removed
- [ ] Backend sends `WORKER_API_KEY` on worker requests
- [ ] Worker rejects unauthenticated operation requests
- [ ] Worker listens on private IPv6
- [ ] Backend listens on IPv6 and accepts private worker callbacks
- [ ] Callback authentication continues to use `INTERNAL_API_KEY`
- [ ] Backend worker-dispatch coroutines use an application-managed scope with bounded shutdown draining
- [ ] Connection pool sizes are configurable
- [ ] Backend starts at 1 GB with explicit heap and direct-memory limits
- [ ] Worker has explicit 512 MB guardrails
- [ ] Image downloads have time and size limits
- [ ] Stale `PROCESSING` photo sessions and quiz jobs transition to an actionable failed state
- [ ] Admin Jobs page shows stale/failed work and can rerun it successfully
- [ ] Recovery and admin rerun flow was deployed and proven on Cloud Run before Fly migration
- [ ] Scheduler defaults disabled and creates no tasks when `SCHEDULER_ENABLED=false`
- [ ] Scheduled operations use transaction-scoped PostgreSQL advisory locks and durable unique execution claims
- [ ] Fly custom metrics are exposed and scraped
- [ ] Backend JVM uses the reviewed `MaxRAMPercentage` and direct-memory limit
- [ ] Makefile and deploy-state tooling are provider-neutral
- [ ] README and architecture documentation describe the new deployment
- [ ] Automated tests pass

### Fly.io

- [ ] Backend and worker run in the same organization and region
- [ ] Backend is available at `api.shuukanhq.com`
- [ ] Worker is reachable from the backend over `.internal` IPv6
- [ ] Worker is unreachable from the public internet
- [ ] Both services connect to Supabase with TLS
- [ ] Backend-to-worker authentication succeeds
- [ ] Worker-to-backend callbacks succeed
- [ ] Backend is stable at 1 GB and worker is stable at 512 MB
- [ ] Health checks pass
- [ ] Scheduled jobs run exactly once per intended schedule
- [ ] Controlled worker shutdown drains attached requests within the grace period
- [ ] Fly staging remained scheduler-disabled through Phases B and C
- [ ] Combined Cloud Run and Fly database connections stayed within the Supabase limit

### Cloudflare Pages

- [ ] Frontend builds from `frontend/`
- [ ] Production bundle uses `https://api.shuukanhq.com`
- [ ] `shuukanhq.com` serves the Pages deployment
- [ ] Direct navigation and refresh work on every React route
- [ ] Supabase login and redirect flows work
- [ ] Production CORS allows the Pages origin and rejects unrelated origins
- [ ] Security headers have been reviewed

### Cutover

- [ ] Full photo-analysis flow succeeds
- [ ] Full quiz-generation flow succeeds
- [ ] Quiz session resume and completion succeed
- [ ] Invite/email flow succeeds
- [ ] All scheduled operations have completed successfully
- [ ] Interrupted work has been recovered and rerun successfully through the admin page
- [ ] Fly Grafana metrics/log search and Better Stack uptime checks operated throughout the soak
- [ ] Google Cloud schedules are disabled
- [ ] Production has completed the selected soak period
- [ ] Rollback procedure has been verified before legacy removal
- [ ] Cloud Run, GCS deployment automation, and obsolete Google Cloud resources are decommissioned

---

## References

- [Fly.io private networking](https://fly.io/docs/networking/private-networking/)
- [Fly.io app services](https://fly.io/docs/networking/app-services/)
- [Fly.io monorepo deployments](https://fly.io/docs/launch/monorepo/)
- [Fly.io configuration reference](https://fly.io/docs/reference/configuration/)
- [Fly.io secrets and Machine restarts](https://fly.io/docs/apps/secrets/)
- [Fly.io health checks](https://fly.io/docs/reference/health-checks/)
- [Fly.io managed Prometheus and Grafana](https://fly.io/docs/monitoring/metrics/)
- [Fly.io searchable logs and retention](https://fly.io/docs/monitoring/search-logs/)
- [Fly.io logging and export options](https://fly.io/docs/monitoring/logs-api-options/)
- [Fly.io Log Shipper](https://fly.io/docs/monitoring/exporting-logs/)
- [Fly.io long-running task lifecycle](https://fly.io/docs/blueprints/long-running-tasks/)
- [Fly.io task scheduling](https://fly.io/docs/blueprints/task-scheduling/)
- [Fly.io custom domains](https://fly.io/docs/networking/custom-domain/)
- [Fly.io with Cloudflare](https://fly.io/docs/networking/understanding-cloudflare/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/)
- [Cloudflare Pages SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Supabase PostgreSQL connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase network restrictions](https://supabase.com/docs/guides/platform/network-restrictions)
