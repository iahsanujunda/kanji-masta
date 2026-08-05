# Capture Resilience — Surviving Bad Connections and Backgrounded Tabs

_Making "photograph now, get results later" actually hold when the phone is locked or offline_

---

## The problem

Capture is used in the field: a user photographs kanji on a station sign, a menu, a
poster — usually on a phone, often on a bad connection, and frequently they lock the
phone and walk away while the scan runs. The current flow does not survive either of
the two things that happen most in that setting.

**Failure A — locked phone during analysis.** User uploads, sees the loading screen,
locks the phone, commutes for 20 minutes. On reopening they land on Home with no
visible thread back to the scan they started. The scan itself finished server-side, but
the path back to it is gone.

**Failure B — no connection during upload.** User photographs in a basement bike park /
underground station with no signal. The upload to storage never completes, so no server
session is ever created. The loading spinner hangs indefinitely, and the only copy of
the photo is an in-memory blob that dies when the tab is suspended. The capture is lost
entirely.

Both stem from the same root cause: **the in-progress capture lives only in ephemeral
React state**, and mobile browsers discard backgrounded tabs.

---

## Current flow

`frontend/src/pages/Capture.tsx` drives the whole flow with local `useState`
(`view`, `sessionId`, `kanjiResults` — lines 49-53). The sequence in `handleFileChange`
(lines 69-101):

1. `setView("uploading")` → upload the `File` **directly to Supabase Storage** from the
   client (`supabase.storage.from("photos").upload`, line 83), then create a signed URL.
2. `setView("analyzing")` → `POST /api/photo/analyze` with `{ imageUrl, storagePath }`
   (line 92), which creates a **server-side session** and returns `{ sessionId, status }`.
3. Poll `GET /api/photo/session/:sessionId` every 2s until `status === "done"`
   (lines 104-137), with a **30s client give-up** that silently `navigate("/home")`
   (lines 114-118).

Recovery today exists but is gated:

- `Home.tsx` polls `/api/photo/recent` and lists past sessions (lines 70-75).
- A recent-scan card is only clickable **once `status === "DONE"`** (`isDone` gate,
  `Home.tsx:450,465`). An in-progress scan cannot be re-entered.
- The resume path passes `sessionId` via `navigate("/capture", { state: {...} })`
  (`Home.tsx:465`), read back in `Capture.tsx:56`. Because it lives in
  `location.state`, a reload or a fresh app launch loses it.

### Where each failure lands

| Step | Failure A (locked phone) | Failure B (no signal) |
|------|--------------------------|------------------------|
| Server session exists? | Yes — created before lock | **No** — upload never finished |
| Photo recoverable? | Server has it | Only the in-memory blob |
| What the user sees on return | Home, scan not re-enterable while processing | Infinite spinner, then lost |
| Can existing recovery help? | Partially — only after `DONE` | No — nothing to resume |

---

## Root cause

1. **Capture state is in-memory only.** `sessionId` / `view` live in `useState` and are
   never represented by a stable route. Mobile Safari/Chrome may suspend or reload a
   backgrounded tab, so the mounted component cannot be the recovery mechanism.
2. **The resume handle is in `location.state`,** not the URL — not reload-safe, not
   deep-linkable.
3. **The 30s poll give-up** guarantees the loading screen abandons the user on any
   real-world commute.
4. **In-progress scans are not re-enterable** (`isDone` gate) — exactly the state a
   returning user is in.
5. **Upload is fire-and-forget with no offline handling.** No `navigator.onLine` check,
   no timeout, and the captured blob is never persisted, so a failed upload is
   unrecoverable.

---

## How similar apps handle it

Apps built for capturing in the field — Google Photos, WhatsApp media send, Instagram
posting, delivery/inspection apps — converge on the same patterns:

- **The work becomes a durable item early.** It has a stable re-entry point in a
  library, conversation, task list, or URL rather than existing only on a spinner.
- **Server job is the single source of truth;** the client just reflects it, and resumes
  polling on tab focus rather than giving up on a timer.
- **A persistent, always-tappable "in progress" indicator** — not gated on completion.
- **Offline-first capture:** the photo is written to local durable storage the instant
  it's taken, shown as "pending," and uploaded by a background retry when connectivity
  returns (WhatsApp's clock icon; Instagram's "Posting…" that survives app close).
- **Push / badge on completion** so the user never has to babysit the loading screen.

WhatsApp and Instagram are native applications and have background-execution options
that a mobile web app does not. They are useful interaction references, not proof that a
PWA can guarantee upload while fully closed. For this app, the honest guarantee is:

- before the local IndexedDB write finishes, the UI says “Saving photo…”;
- after that local write succeeds, the user may lock the phone and the capture is retried
  when the app can run again, even if the server has not received it yet;
- after the server accepts the upload, analysis can continue without the page; and
- browser storage and iOS background execution improve resilience but are not absolute
  guarantees against OS storage eviction or a user clearing site data.

---

## Design

The design separates creating a capture from observing a server-owned scan:

- `/capture` starts a new capture and owns only the file-picker/upload phase.
- `/captures/:clientCaptureId` displays a locally queued or uploading capture before a
  server session exists.
- `/scans/:sessionId` displays `processing`, `done`, or `failed` by fetching the server.
- `/api/photo/recent` is the primary recovery source on Home and after a fresh launch.
- Local persistence supplements the server only for photos that have not reached it.

Do not use `localStorage` as the source of truth for an active server session. It can be
stale, can belong to a previously signed-in user, and cannot represent all server work.
The authenticated recent-sessions endpoint already has the durable information needed.

### Flow mockup

The visual contract is captured in the repository-standard SVG storyboard:

- [Capture resilience flow](mockups/capture-resilience-flow.svg) — local-save safety
  boundary, resumable upload, server processing, Home recovery, ready result, restored
  selection UI, and visible failed-analysis recovery.

The storyboard uses the existing frontend theme tokens and 390 px mobile composition.
The API and state contracts in this document remain authoritative if a visual detail and
an implementation requirement conflict.

### User-visible state model

| State | Authority | User copy | User can leave? | Primary action |
|-------|-----------|-----------|-----------------|----------------|
| Selecting | browser | Camera/file picker | Yes | Choose photo |
| Saving locally | IndexedDB | Saving photo… | Not until confirmed | None |
| Queued/uploading | IndexedDB + browser/storage | Analysing — you can close the app | **Yes** | Back to Home |
| Processing | server | Photo saved — analysis continues in the background | **Yes** | Back to Home / View progress |
| Done | server | _N_ kanji found | Yes | Review results |
| Failed | server or local queue | Analysis failed / Upload waiting | Yes after local save | Retry / Choose another photo |
| Ingested | server | Added to your collection | Yes | View collection |

Database statuses remain uppercase (`PROCESSING`, `DONE`, `FAILED`, `INGESTED`). API
DTOs expose one consistent lowercase union (`processing`, `done`, `failed`, `ingested`)
so the frontend does not mix casing. Pending upload states remain local and must not be
confused with a server session.

### UX contract

1. Immediately after the camera returns the File, persist its Blob to IndexedDB before
   starting network work. During that brief write, say **“Saving photo…”**.
2. As soon as the IndexedDB transaction commits, show the concise progress state
   **“Analysing”** with **“You can close the app.”** Upload may continue now or resume on
   a later launch; those mechanics do not need explanatory copy on the scan page.
3. As soon as `/api/photo/analyze` returns a session ID, replace the route with
   `/scans/:sessionId` and say **“Photo saved. You can safely close the app.”**
4. The scan page provides a normal Back/Home action; it never traps the user behind a
   full-screen spinner.
5. Home keeps the quiz/session card as the first main section. An always-tappable
   active-scan card sits immediately beneath it, before secondary content. Completed,
   unreviewed work uses **“Review results”**, not a passive status.
6. The scan route re-fetches immediately on focus/reconnect. It does not interpret a
   client polling timeout as job failure.
7. Failed work remains visible with a cause and recovery action. It never disappears
   because a cleanup job changed its status spelling.
8. Status is expressed with icon and text, not color alone; cards and actions retain at
   least a 44×44 px touch target and work with keyboard focus and screen readers.

---

## Actual implementation plan

Implement this as separately deployable milestones. Milestone 1 makes the photo safe on
the device immediately and then hands it to a secure, resumable server session. Milestone
2 hardens the queue and explores best-effort closed-app delivery. Milestone 3 improves
interrupted server work. Milestone 4 adds notification convenience.

### Implementation status — 2026-08-05

Milestone 1 is implemented across the frontend, backend, worker, and schema:

- the browser commits the captured Blob to an authenticated IndexedDB queue before any
  storage or API request;
- foreground retries run on startup, reconnect, focus, visibility return, and a bounded
  retry timer using the deterministic user/capture storage path;
- the server atomically reuses `(user_id, client_capture_id)`, scopes session reads to
  the authenticated owner, and exposes lowercase statuses;
- `/captures/:clientCaptureId` and `/scans/:sessionId` restore local and server work
  without `location.state`;
- Home merges the newest local/server item directly below the quiz card; and
- backend, worker, and frontend regressions cover the persistence boundary, idempotent
  retry, ownership, status normalization, route restoration, and Home ordering.

The checked-in schema change is intentionally the **expand** migration only. The
`ERROR` → `FAILED` data cleanup and status constraint remain a separate contract
migration to ship after the updated backend and worker have been deployed and old
writers are no longer running. Service Worker Background Sync and notifications remain
later milestones; neither is required for reopen-and-resume behavior.

### Milestone 1 — Immediate-close capture and secure resumable sessions

This is the first release. It includes the minimum IndexedDB queue and idempotent analysis
creation required to make **“snap, lock the phone, continue later”** truthful. It does not
add Service Worker Background Sync or push notifications.

#### 1. Normalize session status and ownership

Use an expand/deploy/contract sequence under `supabase/migrations/`.

The expand migration:

- adds nullable `failure_code text` for a safe, stable recovery category;
- adds `attempts integer NOT NULL DEFAULT 0` for future retry visibility; and
- adds nullable `client_capture_id uuid` with a unique constraint on
  `(user_id, client_capture_id)` for idempotent handoff; and
- retains the existing `(user_id, status)` recent-session index.

Deploy backend and worker code that reads both legacy `ERROR` and new `FAILED` as a
failure, but writes only `FAILED`. After all old writers are gone, the contract migration:

- converts remaining `ERROR` rows to `FAILED`; and
- constrains status to `PROCESSING`, `DONE`, `FAILED`, or `INGESTED`.

Do not store exception messages or provider responses in `failure_code`. Use a bounded
set such as `dispatch_failed`, `provider_failed`, `invalid_response`, `callback_failed`,
`timed_out`, and `unknown`; map those codes to user-facing copy in the frontend.

Update `core/db/Tables.kt` and the photo models for the new fields. Centralize status
values in backend code instead of scattering string literals.

Change session lookup to accept the authenticated user ID:

```text
PhotoRepository.getSession(sessionId, userId)
WHERE id = :sessionId AND user_id = :userId
```

`GET /api/photo/session/{id}` must read `AuthUser`, validate the UUID, and return `404`
for a missing or foreign session. Do not reveal whether another user owns the ID.

Update all writers to use `FAILED`, including:

- AI-worker parse/provider failures;
- callback handling when no usable kanji are returned; and
- stale-session cleanup.

Update `/api/photo/recent` to include `PROCESSING`, `DONE`, and `FAILED`, while keeping
`INGESTED` out of the actionable list. Map all response statuses to lowercase.

**Files:**

- `supabase/migrations/<timestamp>_expand_photo_session_resilience.sql`
- `supabase/migrations/<timestamp>_normalize_photo_session_status.sql`
- `backend/src/main/kotlin/com/kanjimasta/core/db/Tables.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoModels.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoRepository.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoService.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoRoutes.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/internal/InternalService.kt`
- `services/ai-worker/app/db.py`
- `services/ai-worker/app/main.py`

#### 2. Persist the photo before any network call

Add the maintained `idb` package and a small queue wrapper. When the camera/file picker
returns a File:

1. Generate `clientCaptureId` with `crypto.randomUUID()`.
2. Write the Blob and metadata to IndexedDB in one transaction.
3. Until that transaction commits, show **“Saving photo…”** and do not claim it is safe
   to leave.
4. On commit, show **“Analysing”** with **“You can close the app.”**
5. Replace the route with `/captures/:clientCaptureId` so a reload can render local state.
6. Begin the upload using deterministic path `{userId}/{clientCaptureId}.jpg`.
7. Call `/api/photo/analyze` with the same `clientCaptureId`.
8. Store the returned `sessionId`, replace the route with `/scans/:sessionId`, then remove
   the Blob from the local record.

Minimum local record:

```ts
type LocalCapture = {
  id: string;
  userId: string;
  blob?: Blob;
  storagePath: string;
  status: "pending" | "uploading" | "starting" | "server-owned" | "failed";
  sessionId?: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt: string;
};
```

The foreground drainer runs after authentication on app startup, on `online`, on return
to foreground, and from a manual Retry action. Use one active upload and bounded
exponential backoff with jitter. A network/5xx failure stays queued; auth, quota,
unsupported-image, and permission failures become explicit user-actionable states.
`navigator.onLine` may improve copy but is not proof that storage or the API is reachable.

Add `clientCaptureId` to `AnalyzePhotoRequest`. If the same authenticated user repeats a
client ID, return the existing session rather than creating or charging for another one.
The database uniqueness constraint is the concurrency boundary; a read-before-write
check alone is insufficient. Treat an “object already exists” response for the
deterministic, user-owned storage path as a resumable upload outcome, not a reason to
generate a new path.

Namespace queue reads by authenticated user. On logout, stop draining immediately and
follow an explicit local-photo retention policy; never expose one user's queued capture
to the next signed-in user.

**Files:**

- `frontend/package.json`
- `frontend/src/lib/captureQueue.ts` (new)
- `frontend/src/hooks/useCaptureQueue.ts` (new)
- `frontend/src/pages/Capture.tsx`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoModels.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoRepository.kt`
- `backend/src/main/kotlin/com/kanjimasta/modules/photo/PhotoService.kt`

#### 3. Add stable local-capture and server-scan routes

Add lazy routes `/captures/:clientCaptureId` and `/scans/:sessionId` in `App.tsx`.
`LocalCaptureDetail.tsx` reflects the IndexedDB queue and offers Retry for actionable
errors; `ScanDetail.tsx` reflects the server. Keep `/capture` for creating a new capture.
Extract the existing result list and selection UI from `Capture.tsx` into reusable scan
components rather than making the capture page serve unrelated navigation modes.

Create a typed query hook:

```text
useScanSession(sessionId)
queryKey: ["photo-session", sessionId]
GET /api/photo/session/:sessionId
processing: refetch every 2s while visible
done/failed/ingested: stop interval
refetchOnWindowFocus: true
refetchOnReconnect: true
```

The hook should use TanStack Query rather than a manual `setInterval`. When the document
is hidden, suspend interval polling; browser focus/reconnect performs an immediate fetch.
Network errors show a non-destructive reconnect state and do not turn the server session
into `failed`.

After `/api/photo/analyze` returns, `Capture.tsx` must call:

```text
navigate(`/scans/${sessionId}`, { replace: true })
```

Remove the 30-second redirect and the `location.state` resume path after all callers have
migrated. A compatibility fallback may remain for one release if an already-deployed
client can still create those history entries.

**Files:**

- `frontend/src/App.tsx`
- `frontend/src/pages/Capture.tsx`
- `frontend/src/pages/LocalCaptureDetail.tsx` (new)
- `frontend/src/pages/ScanDetail.tsx` (new)
- `frontend/src/components/scan/ScanProgressView.tsx` (new)
- `frontend/src/components/scan/ScanResultsView.tsx` (new or extracted)
- `frontend/src/lib/photo.ts` or `frontend/src/hooks/useScanSession.ts` (new)

#### 4. Surface actionable work on Home

Keep the quiz/session card as the first main section. Place the newest actionable session
immediately below it and before lessons, collection, dictionary, or other secondary
content. Render it as a semantic button or keyboard-operable card:

| Source/status | Title | Supporting copy | Destination |
|---------------|-------|-----------------|-------------|
| local `pending` | Waiting to upload | Saved on this device | `/captures/:id` |
| local `uploading` | Uploading saved photo | You can safely close the app | `/captures/:id` |
| `processing` | Analysing your photo | You can safely close the app | `/scans/:id` |
| `done` | Scan ready | _N_ kanji found — review results | `/scans/:id` |
| `failed` | Scan needs attention | Analysis did not finish — try another photo | `/scans/:id` |

All three states are tappable. Use a chevron or explicit action label in addition to the
status icon. Keep the lower “Recent Scans” section if useful, but it must not be the only
way back to unfinished work.

When a processing session changes to done, invalidate both `["recent-scans"]` and the
individual session query. If the user is already on Home, the existing ten-second recent
query may update the card; when the app regains focus it must fetch immediately.

**Files:**

- `frontend/src/pages/Home.tsx`
- `frontend/src/components/scan/ActiveScanCard.tsx` (new)

#### 5. Define scan-detail behavior

The scan route renders by server status:

- `processing`: thumbnail, progress treatment, “Photo saved” confirmation, Back to Home;
- `done`: existing detected-kanji selection UI;
- `failed`: failure explanation, “Capture another photo,” and Back to Home;
- `ingested`: completion summary and link to Collection;
- `404`: “This scan is unavailable” and Back to Home;
- network error: Retry without destroying or hiding the server session.

Do not claim percentage progress because the worker does not expose measurable stages.
Use an indeterminate progress indicator and truthful status copy. Avoid rotating fake
stage messages such as “Extracting kanji” unless the backend actually reports that stage.

For Milestone 1, failed analysis offers **Capture another photo**. Retrying the stored
image is deferred until the backend/worker can securely obtain a fresh storage URL from
`storage_path`; the signed URL currently stored in `image_url` expires.

#### 6. Milestone 1 tests

Backend integration tests:

- owner can fetch their processing session;
- a different authenticated user receives `404` for the same ID;
- malformed session UUID does not produce `500`;
- stale cleanup produces `FAILED`, and the API returns `failed`;
- recent sessions include processing/done/failed and exclude ingested;
- AI-worker and callback failures converge on `FAILED`.

Frontend unit tests:

- IndexedDB commits before the storage upload begins;
- “safe to close” appears only after the local transaction succeeds;
- a local write/quota failure keeps truthful unsafe copy and offers Retry;
- `/captures/:id` restores queued/uploading state after reload;
- startup/online/focus drains a pending capture;
- a lost `/analyze` response retries with the same client ID and resolves to one session;
- Capture navigates to `/scans/:id` after the server accepts the upload;
- ScanDetail reloads from its route parameter without `location.state`;
- processing refetch stops when hidden and immediately resumes on focus;
- done and failed statuses stop interval polling;
- Home places processing/done/failed active cards directly below the top quiz card;
- every active card is keyboard/tap actionable;
- network failure shows Retry and does not navigate Home;
- the old 30-second silent navigation no longer exists.

Playwright mobile-flow test:

1. Select a photo while the fake storage/API is unavailable.
2. Verify the local save commits and the UI says it is safe to close.
3. Reload before upload succeeds and verify the pending capture is restored.
4. Bring the fake API online; verify one upload and one idempotent session are created.
5. Verify the URL becomes `/scans/session-1` with `processing`.
6. Navigate Home and verify the active card is directly below the quiz card.
7. Change the fake API response to `done` and regain focus.
8. Open the card and verify the results render.

Automated coverage for this checklist lives in `PhotoIntegrationTest`,
`InternalIntegrationTest`, the AI-worker route tests, the frontend capture queue/hook/page
test suites, and `tests/e2e/capture-resilience.spec.js`. The browser fixture tracks successful
uploads, analyze calls, and distinct sessions so the interruption flow also asserts one upload
and one idempotent server session.

Run:

```bash
make test-backend
make test-ai-worker
make test-frontend
cd frontend && npm run test:e2e
```

#### 7. Milestone 1 rollout and observability

Roll out Milestone 1 in this order:

1. Apply the expand migration that adds nullable/defaulted columns and idempotency.
2. Deploy backend and worker dual-read/new-write status handling plus idempotent analyze.
3. Verify no active instance writes `ERROR`.
4. Backfill legacy rows and apply the status constraint in the contract migration.
5. Deploy the frontend local queue, stable route, and Home affordance together.

This avoids applying a constraint while an older worker or backend instance can still
write `ERROR`.

Add structured logs or counters for:

- photo sessions created;
- transition counts and durations: processing→done and processing→failed;
- sessions still processing after 2, 10, and 60 minutes;
- session lookups returning not-found; and
- Home recent-session API failures.

Release behind `VITE_RESUMABLE_SCANS_ENABLED` only if a staged frontend rollout is
needed. Otherwise the new route and old Home recent list can coexist safely. Observe for
at least 24 hours, complete the locked-phone acceptance flow on iOS Safari and Android
Chrome, and confirm no unexplained long-running sessions before beginning Milestone 2.

### Milestone 2 — Queue hardening and best-effort background delivery

Milestone 1 already guarantees **“saved locally and retried when the app next runs.”**
Milestone 2 improves storage hygiene and explores faster delivery, but it must not weaken
or delay the immediate-close contract.

- Request persistent browser storage with `navigator.storage.persist()` where supported,
  while treating denial as a supported state rather than a fatal error.
- Define photo retention and cleanup limits by count, age, and total bytes; never evict an
  unowned Blob merely because a timer elapsed.
- Validate and resize unusually large images before persistence when this can be done
  without delaying the local safety confirmation or destroying the original before the
  replacement is committed.
- Add queue management UI when multiple items are pending: waiting, uploading, needs
  sign-in, and failed. The quiz/session card remains the first Home section.
- Measure local-save duration, queued age, upload retry count, and storage failures without
  logging image content or storage URLs.
- Experiment with Service Worker Background Sync only after authenticated token refresh,
  logout isolation, duplicate prevention, and browser support are proven. The current
  Supabase session is not automatically available to a closed service worker, and iOS
  cannot support a reliable closed-app upload promise.

#### Milestone 2A — Target-browser Background Sync experiment

Run the experiment before choosing a Service Worker delivery architecture. Scope real-device
testing to the browsers used by current users:

- iOS Safari;
- iOS Chrome;
- iOS Firefox;
- Android Chrome; and
- Android Firefox.

Safari has no Android counterpart. Desktop browser emulation is only a probe smoke test; it
does not prove mobile lock-screen or closed-window execution. The deployed probe at
`/capture-sync-probe/index.html` records Service Worker and one-off Background Sync capability, queues a
connectivity check, and records the number and visibility of window clients when the `sync`
event runs.

For each browser, run once as a regular browser tab and, where installation is offered, once
as an installed web app:

1. Open the probe online and install its isolated Service Worker.
2. Enable airplane mode, queue the test, then lock the phone or close the browser window.
3. Restore connectivity without reopening the probe and wait up to five minutes.
4. Reopen the probe and copy its JSON report.

Record `unsupported` as a valid result. A supported run passes only when the connectivity
request completes with zero visible window clients. A run that completes only after reopening
is `foreground-fallback`, not background delivery. Do not use viewport/device emulation as a
pass result.

The experiment permits a production spike only if supported browsers complete duplicate-safe
delivery without a visible client and unsupported browsers retain the Milestone 1 app-open
queue. Authentication expiry, explicit logout, account switching, and realistic photo sizes
remain mandatory staging tests before enabling real capture uploads in the worker.

Observed real-device results (2026-08-05):

| Browser | Mode | Service Worker | Background Sync | Result | Follow-up |
|---------|------|----------------|-----------------|--------|-----------|
| Android Firefox 153 / Android 17 | Browser tab | Supported | Unsupported | `unsupported` — final | Use Milestone 1 app-open/focus drain |
| Android Chrome 150 / Android 10 | Browser tab | Supported | Supported | `retrying` — inconclusive | Restore connectivity, close/lock without re-queuing, wait five minutes, then copy the updated report |

The Chrome run attempted sync 13 ms after queuing with one visible window client and its
connectivity request failed. It therefore proves registration and retry retention, but not
background execution. `navigator.onLine` reported online at queue time; treat that field as a
hint rather than proof of connectivity.

Milestone 2 tests cover storage-persistence denial, retention limits, multiple pending
items, auth expiration/recovery, oversized images, queue privacy, and duplicate-safe
service-worker delivery on browsers where that experiment is enabled.

### Milestone 3 — Interrupted server-work recovery

This milestone complements the infrastructure migration plan. It does not introduce an
outbox or replace the HTTP worker protocol before migration soak.

- Replace service-owned `CoroutineScope(Dispatchers.IO)` instances with the documented
  application-managed dispatch scope and graceful drain.
- Keep stale-session cleanup, but make `FAILED` visible to users and administrators.
- Record a failure code that distinguishes dispatch failure, provider failure, callback
  failure, invalid AI response, and stale timeout without exposing sensitive internals.
- Add admin visibility and the documented recovery/rescan path required by
  `docs/infra-migration.md`.
- Prove callback/status writes are idempotent around backend and worker restarts.
- After migration soak, separately evaluate a transactional outbox, database-polling
  worker, or managed task queue. Do not silently change that architecture in this work.

Retrying the same stored photo requires a server-owned way to read `storage_path` or mint
a fresh signed URL. Until that exists, the user recovery action remains Capture another
photo and the admin recovery path follows the infrastructure plan.

### Milestone 4 — Completion notifications

Add Web Push only after stable routes and session ownership are deployed:

- request permission contextually after a successful scan, never on first page load;
- store subscriptions per user/device and remove expired endpoints;
- send only when a session first transitions to `DONE`;
- deep-link to `/scans/:sessionId`;
- retain the Home active card as the non-notification fallback; and
- do not use notification delivery as evidence that processing succeeded.

### Delivery sequence

| Order | Deliverable | Area | Fixes |
|-------|-------------|------|-------|
| 1 | Status normalization, ownership, idempotency | DB/backend/worker | Security and duplicate safety |
| 2 | IndexedDB save-before-upload queue | Frontend | Immediate lock/reopen recovery |
| 3 | `/captures/:id` and `/scans/:id` detail pages | Frontend | Local and server reload recovery |
| 4 | Home actionable-capture card + UX copy | Frontend | Reported commute flow |
| 5 | Interrupted server-work recovery | Backend/worker/admin | Process/deploy interruption |
| 6 | Web Push | Frontend/backend | Completion convenience |

Milestone 1 is complete only when items 1–4 ship together. A server-only route does not
protect a photo whose upload has not finished; a local queue without Home discoverability
does not provide a return path.

## Acceptance criteria

### Reported locked-phone flow

- [ ] Immediately after snapping, the Blob is committed locally before upload begins.
- [ ] After the local commit, the UI explicitly says the user may lock the phone.
- [ ] Locking and reopening before upload completes restores `/captures/:id` and the
      queued capture beneath the primary quiz card.
- [ ] Reloading `/scans/:id` while processing restores the correct scan.
- [ ] Returning to Home shows the active scan directly below the primary quiz card and
      before secondary content.
- [ ] Processing, done, and failed cards are all tappable.
- [ ] Returning after completion opens the original results.
- [ ] No client timer silently abandons the scan or treats it as failed.

### Upload/offline flow

- [ ] The only unsafe window is the local IndexedDB transaction, shown as “Saving photo…”.
- [ ] A successfully persisted offline photo survives reload in Milestone 1.
- [ ] Reconnect or relaunch resumes upload without duplicate session creation.
- [ ] Storage/quota/auth failures have an explicit recovery action.

### Security and correctness

- [ ] A user cannot fetch another user's session, even with its UUID.
- [ ] Invalid session IDs return a controlled 4xx response.
- [ ] `FAILED` is used consistently by backend, worker, cleanup, and frontend.
- [ ] Failed sessions remain visible and actionable.
- [ ] Status and actions are understandable without relying on color.

### Mobile UX and accessibility

- [ ] Verify at 375 px width and mobile landscape.
- [ ] All card/actions have at least a 44×44 px target and visible focus state.
- [ ] Progress and completion changes are announced through an appropriate live region.
- [ ] Indeterminate motion respects `prefers-reduced-motion`.
- [ ] Fixed Home capture controls do not obscure the active-scan card.

## Non-goals

- No editing or explicit batch submission. Milestone 1 may contain multiple pending
  local records because retries can overlap with later captures, but drains one at a time.
- No offline *analysis* — analysis always requires the server + Gemini; only capture and
  upload are made offline-durable.
- No guaranteed upload while a mobile browser is fully closed.
- No outbox or worker-protocol replacement before the infrastructure migration soak.
- No fabricated percentage or processing-stage progress.
