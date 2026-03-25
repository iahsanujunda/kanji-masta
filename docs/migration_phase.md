# Phase 3 — Firebase Exit: Migrate to Supabase + Cloud Run + Render

_Vendor-agnostic stack. Incremental migration. Zero downtime._

---

## Context

Firebase locks in auth, database, storage, functions, and hosting into a single vendor. This phase incrementally replaces every Firebase service with open/portable alternatives:

| Firebase Service | Replacement | Why |
|-----------------|-------------|-----|
| Data Connect (GraphQL over Postgres) | **Supabase PostgreSQL + Ktorm** | Direct SQL, type-safe Kotlin ORM, no GraphQL indirection |
| Firebase Auth | **Supabase Auth** | Open-source (GoTrue), same JWT flow, social login support |
| Firebase Storage | **Supabase Storage** | S3-compatible, row-level security, same bucket model |
| Firebase Functions (Python) | **Cloud Run services** | Already containerized pattern, no cold-start tax, longer timeouts |
| Firebase Hosting | **Render Static Site** | Git-deploy, free tier, no Firebase CLI dependency |

**Guiding principle:** Each iteration produces a working app. No big-bang cutover. Backend already runs on Cloud Run in production — that's the model for functions too.

### Iteration Order Rationale

| # | Scope | Why This Order |
|---|-------|----------------|
| 3.1 | Database: Supabase PostgreSQL + Ktorm | Foundation — every other service reads/writes the DB |
| 3.2 | Functions to Cloud Run | Depends on direct DB access (no more Data Connect from Python) |
| 3.3 | Auth: Supabase Auth | Can swap auth after DB + functions are stable on new stack |
| 3.4 | Storage: Supabase Storage | Independent of auth provider, but easier after auth is settled |
| 3.5 | Hosting: Render Static Site | Last — purely a deployment target change, zero code impact |
| 3.6 | Firebase Teardown | Remove all Firebase config, SDKs, emulators |
| 3.7 | Docker Compose Local Dev | Single `docker compose up` replaces multi-terminal setup |

---

# Iteration 3.1 — Database: Supabase PostgreSQL + Ktorm

Replace Firebase Data Connect (GraphQL-over-Postgres) with direct PostgreSQL access via Ktorm in the Ktor backend. This is the largest iteration — every repository class must be rewritten.

### 3.1.1 Supabase Project Setup

- Create Supabase project (region: `ap-northeast-1` / Tokyo for latency)
- Note connection string, anon key, service role key
- Enable connection pooling (PgBouncer) for Cloud Run compatibility

### 3.1.2 SQL Schema Migration

Translate `dataconnect/schema/schema.gql` into SQL DDL. Data Connect was already backed by Postgres, so this is a 1:1 mapping.

**Key files:**
- Create `supabase/migrations/001_initial_schema.sql` — all tables, enums, indexes
- Preserve existing table structure: `kanji_master`, `user_kanji`, `quiz_bank`, `quiz_distractor`, `quiz_serve`, `quiz_slot`, `photo_session`, `quiz_generation_job`, `user_words`, `challenge_session`, `user_settings`
- Add proper foreign keys (Data Connect had these as references, now explicit FK constraints)
- Add indexes on frequently queried columns (`userId`, `status`, `kanjiId`, `nextReview`)

**Enum mapping:**
```sql
CREATE TYPE quiz_type AS ENUM ('MEANING_RECALL', 'READING_RECOGNITION', 'REVERSE_READING', 'BOLD_WORD_MEANING', 'FILL_IN_THE_BLANK');
CREATE TYPE user_kanji_status AS ENUM ('FAMILIAR', 'LEARNING');
CREATE TYPE job_type AS ENUM ('INITIAL', 'REGEN');
CREATE TYPE job_status AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE distractor_trigger AS ENUM ('INITIAL', 'MILESTONE', 'SERVE_COUNT');
CREATE TYPE word_source AS ENUM ('PHOTO', 'QUIZ', 'CHALLENGE');
```

### 3.1.3 Data Migration

- Export existing data from Firebase Data Connect Postgres instance
- Transform and import into Supabase Postgres
- Verify row counts and data integrity

### 3.1.4 Ktorm Integration in Backend

**New dependencies** (`backend/gradle/libs.versions.toml`):
- `org.ktorm:ktorm-core`
- `org.ktorm:ktorm-support-postgresql`
- `org.postgresql:postgresql` (JDBC driver)
- `com.zaxxer:HikariCP` (connection pooling)

**New core files:**
- `backend/src/main/kotlin/com/kanjimasta/core/db/Database.kt` — HikariCP datasource + Ktorm `Database.connect()`
- `backend/src/main/kotlin/com/kanjimasta/core/db/Tables.kt` — Ktorm table objects for all entities

**Rewrite every repository** (6 files) to replace `dc.executeGraphql(graphqlString)` with Ktorm queries:
- `KanjiRepository.kt` — `KanjiMaster` reads, `UserKanji` writes
- `QuizRepository.kt` — `QuizBank`, `QuizDistractor`, `QuizServe`, `QuizSlot` operations
- `PhotoRepository.kt` — `PhotoSession` CRUD
- `UserRepository.kt` — `UserWords` operations
- `SettingsRepository.kt` — `UserSettings` CRUD
- `QuizGenerationRepository.kt` — `QuizGenerationJob` queue operations

**Remove:**
- `core/db/DataConnectClient.kt` — no longer needed
- Firebase Admin SDK dependency from `libs.versions.toml` (after auth migration, but Data Connect usage stops here)

### 3.1.5 Backend Config Update

Update `application.yaml`:
```yaml
database:
  url: ${DATABASE_URL}
  # or individual: host, port, name, user, password
```

Remove `firebase.dataConnectHost` config.

### Definition of Done

- [ ] Supabase project created with Postgres schema matching Data Connect
- [ ] All existing data migrated from Firebase Data Connect to Supabase
- [ ] Ktorm table definitions for all entities
- [ ] All 6 repository classes rewritten to use Ktorm (no GraphQL)
- [ ] `DataConnectClient.kt` deleted
- [ ] Backend connects to Supabase Postgres via HikariCP
- [ ] All existing API endpoints work against new database
- [ ] Local dev uses Supabase local dev (`supabase start`) instead of Data Connect emulator

---

# Iteration 3.2 — Functions to Cloud Run

Move all Firebase Functions (Python) to Cloud Run services. The backend already runs on Cloud Run — functions follow the same pattern.

### 3.2.1 Restructure Functions as Cloud Run Services

Current Firebase Functions in `functions/main.py`:
1. `analyze_photo` — HTTP trigger (Gemini vision)
2. `generate_quizzes_http` — HTTP trigger (quiz generation)
3. `generate_quizzes` — Scheduler (every 2 min)
4. `check_regen_triggers` — Scheduler (daily)
5. `discover_words` — HTTP trigger (word discovery)

**New structure:**
```
services/
  ai-worker/
    Dockerfile
    requirements.txt
    main.py           # Flask/FastAPI app with routes for each function
    db.py             # Direct Postgres connection (replaces Data Connect GraphQL calls)
    gemini.py         # Gemini API client (unchanged)
```

### 3.2.2 Replace Data Connect Calls with Direct Postgres

Current functions use `_execute_graphql()` to talk to Data Connect. Replace with `psycopg2` / `asyncpg` direct Postgres queries against Supabase.

### 3.2.3 HTTP Endpoints (Replace HTTP Triggers)

The backend already calls functions via HTTP POST. Keep the same pattern — just point to Cloud Run URL instead of Firebase Functions URL.

| Old Firebase Function | New Cloud Run Route |
|----------------------|---------------------|
| `analyze_photo` | `POST /analyze-photo` |
| `generate_quizzes_http` | `POST /generate-quizzes` |
| `discover_words` | `POST /discover-words` |

### 3.2.4 Scheduled Jobs (Replace Scheduler Triggers)

Firebase scheduler triggers become Cloud Scheduler -> Cloud Run:

| Old Trigger | New Setup |
|-------------|-----------|
| `generate_quizzes` (every 2 min) | Cloud Scheduler -> `POST /cron/generate-quizzes` |
| `check_regen_triggers` (daily) | Cloud Scheduler -> `POST /cron/check-regen` |

Alternatively, these could be cron jobs within the Cloud Run service itself using APScheduler, or called from the Ktor backend on a schedule.

### 3.2.5 Backend Config Update

Update `application.yaml`:
```yaml
aiWorker:
  baseUrl: ${AI_WORKER_URL}  # Cloud Run service URL
```

Remove `firebase.functionsHost` and `firebase.functionsRegion`.

### 3.2.6 Deploy

- Build Docker image for `services/ai-worker/`
- Deploy to Cloud Run (same region: `asia-east1`)
- Set up Cloud Scheduler jobs for cron endpoints
- Update backend env vars to point to new Cloud Run URL

### Definition of Done

- [ ] All 5 Firebase Functions migrated to single Cloud Run service
- [ ] Direct Postgres access replaces all Data Connect GraphQL calls in Python
- [ ] HTTP trigger functions accessible via Cloud Run routes
- [ ] Cloud Scheduler configured for cron jobs (generate_quizzes, check_regen)
- [ ] Backend updated to call Cloud Run instead of Firebase Functions
- [ ] `functions/` directory removed (or archived)
- [ ] `firebase.json` functions config removed
- [ ] No `firebase-functions` or `firebase-admin` Python dependency

---

# Iteration 3.3 — Auth: Supabase Auth

Replace Firebase Auth with Supabase Auth (GoTrue). Affects frontend login/signup, backend token verification, and the auth state management.

### 3.3.1 Supabase Auth Setup

- Enable email/password auth in Supabase dashboard
- Enable Google OAuth provider (same Google Cloud OAuth credentials)
- Configure redirect URLs for the frontend

### 3.3.2 Frontend Migration

**Replace Firebase Auth SDK with Supabase JS client:**

Files to modify:
- `frontend/src/lib/firebase.ts` -> `frontend/src/lib/supabase.ts`
  - `createClient(supabaseUrl, supabaseAnonKey)` replaces `initializeApp(firebaseConfig)`
- `frontend/src/hooks/useAuth.ts`
  - `supabase.auth.onAuthStateChange()` replaces `onAuthStateChanged()`
  - `supabase.auth.getSession()` replaces `auth.currentUser`
- `frontend/src/pages/Login.tsx`
  - `supabase.auth.signInWithPassword()` replaces `signInWithEmailAndPassword()`
- `frontend/src/pages/Settings.tsx`
  - `supabase.auth.signOut()` replaces `signOut()`
- `frontend/src/pages/ChangePassword.tsx`
  - `supabase.auth.updateUser({ password })` replaces `updatePassword()`
- `frontend/src/lib/api.ts`
  - `supabase.auth.getSession()` -> `session.access_token` replaces `auth.currentUser.getIdToken()`
- `frontend/src/components/ProtectedRoute.tsx`
  - Use Supabase `User` type

**Remove:** `firebase` npm package from `package.json`.

### 3.3.3 Backend Migration

**Replace Firebase Admin Auth with Supabase JWT verification:**

Files to modify:
- `core/auth/Auth.kt`
  - Verify Supabase JWT using the project's JWT secret (HS256) or JWKS endpoint
  - Extract `sub` (user ID) and `email` from JWT claims
  - No Firebase Admin SDK needed
- `core/db/Firebase.kt` -> delete entirely (was only for Firebase init)

**New file:** `core/auth/JwtAuth.kt` — Ktor authentication plugin using `ktor-server-auth-jwt`:
```kotlin
// Verify Supabase JWT, extract user principal
install(Authentication) {
    jwt("supabase") {
        verifier(jwkProvider) // or HS256 with SUPABASE_JWT_SECRET
        validate { credential ->
            UserPrincipal(uid = credential.subject, email = credential["email"])
        }
    }
}
```

**Remove:** `firebase-admin` from `libs.versions.toml` (fully unused after this).

### 3.3.4 User Migration

- Export Firebase Auth users (`firebase auth:export`)
- Import into Supabase Auth via admin API or SQL insert into `auth.users`
- Preserve user IDs if possible (Firebase UIDs -> Supabase user IDs)
  - If UIDs differ: run a data migration to update all `userId` columns in the database

### Definition of Done

- [ ] Supabase Auth configured (email/password + Google OAuth)
- [ ] Frontend uses `@supabase/supabase-js` for all auth operations
- [ ] `firebase` npm package removed
- [ ] Backend verifies Supabase JWTs (no Firebase Admin SDK)
- [ ] `Firebase.kt` deleted, `firebase-admin` Kotlin dependency removed
- [ ] Existing users migrated to Supabase Auth
- [ ] All userId references consistent between auth and database
- [ ] Login, logout, password change, protected routes all working

---

# Iteration 3.4 — Storage: Supabase Storage

Replace Firebase Cloud Storage with Supabase Storage for photo uploads.

### 3.4.1 Supabase Storage Setup

- Create `photos` bucket in Supabase Storage
- Configure RLS policy: users can read/write `photos/{userId}/*`
- Set max file size (10MB for photos)

### 3.4.2 Frontend Migration

**File:** `frontend/src/pages/Capture.tsx`

Replace:
```typescript
// Old: Firebase Storage
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
const storageRef = ref(storage, `photos/${userId}/${filename}`)
await uploadBytes(storageRef, file)
const url = await getDownloadURL(storageRef)
```

With:
```typescript
// New: Supabase Storage
const { data } = await supabase.storage
  .from('photos')
  .upload(`${userId}/${filename}`, file)
const { data: { publicUrl } } = supabase.storage
  .from('photos')
  .getPublicUrl(`${userId}/${filename}`)
```

### 3.4.3 AI Worker Update

The `analyze_photo` function downloads images from a URL. If using public URLs from Supabase Storage, no change needed in the AI worker — it just fetches a URL. If using signed URLs, generate them in the backend before passing to the worker.

### 3.4.4 Migrate Existing Photos

- Download all photos from Firebase Storage
- Upload to Supabase Storage preserving path structure (`photos/{userId}/*`)
- Update `PhotoSession.imageUrl` rows in database to new URLs

### Definition of Done

- [ ] Supabase Storage `photos` bucket created with RLS policies
- [ ] Frontend uploads photos to Supabase Storage
- [ ] Photo URLs work for AI worker image analysis
- [ ] Existing photos migrated to Supabase Storage
- [ ] `PhotoSession.imageUrl` updated in database
- [ ] `storage.rules` (Firebase) no longer needed
- [ ] No `firebase/storage` imports in frontend

---

# Iteration 3.5 — Hosting: Render Static Site

Replace Firebase Hosting with Render for the React frontend.

### 3.5.1 Render Setup

- Create Render Static Site, connect to git repo
- Build command: `cd frontend && npm ci && npm run build`
- Publish directory: `frontend/dist`
- Add environment variables (Supabase URL, anon key, API URL)
- Configure SPA rewrite rule: `/* -> /index.html` (replaces Firebase Hosting rewrites)

### 3.5.2 Custom Domain

- Point domain DNS to Render
- Render handles SSL automatically
- Update Supabase Auth redirect URLs to new domain

### 3.5.3 Remove Firebase Hosting Config

- Remove `hosting` section from `firebase.json`
- Remove `deploy-frontend` Makefile target (replace with Render auto-deploy)

### Definition of Done

- [ ] Frontend deployed on Render Static Site
- [ ] SPA routing works (all paths serve index.html)
- [ ] Custom domain configured with SSL
- [ ] Auth redirect URLs updated
- [ ] Firebase Hosting config removed

---

# Iteration 3.6 — Firebase Teardown

Remove all remaining Firebase dependencies and configuration.

### 3.6.1 Remove Firebase Config Files

- Delete `firebase.json`
- Delete `.firebaserc`
- Delete `storage.rules`
- Delete `storage-cors.json`
- Delete `dataconnect/` directory
- Delete `functions/` directory (if not already removed)

### 3.6.2 Remove Firebase Dependencies

- Backend: confirm `firebase-admin` removed from `libs.versions.toml`
- Frontend: confirm `firebase` removed from `package.json`
- Functions: directory deleted

### 3.6.3 Update Makefile

Replace Firebase emulator commands with Supabase local dev:
```makefile
local-db:    supabase start          # replaces emulators
backend:     # same, but DATABASE_URL points to local Supabase
frontend:    # same, env vars point to local Supabase
```

### 3.6.4 Update Documentation

- Update `docs/architecture.md` — new stack table, remove all Firebase references
- Update `CLAUDE.md` — remove Firebase-specific patterns, add Supabase + Ktorm patterns
- Update `README.md` — new setup instructions

### 3.6.5 Decommission Firebase Project

- Disable Firebase services (Auth, Storage, Functions, Data Connect, Hosting)
- Keep project alive briefly for rollback safety, then delete

### Definition of Done

- [ ] Zero Firebase imports, config files, or dependencies in codebase
- [ ] `make help` shows updated commands
- [ ] Local dev workflow uses `supabase start`
- [ ] All documentation updated
- [ ] Firebase project decommissioned

---

# Iteration 3.7 — Docker Compose Local Dev

Unify all local services under a single `docker-compose.yml`. Firebase emulators could never play nicely with Docker — now that everything runs on Supabase + Cloud Run, the whole stack is containerizable.

### 3.7.1 Docker Compose Services

```yaml
services:
  supabase-db:       # PostgreSQL 17
  supabase-auth:     # GoTrue (Supabase Auth)
  supabase-storage:  # Supabase Storage
  supabase-studio:   # Supabase Studio (optional, for DB inspection)
  backend:           # Ktor backend (Cloud Run image)
  ai-worker:         # Python AI worker (Cloud Run image, after 3.2)
  frontend:          # React dev server (or nginx for production-like)
```

### 3.7.2 Approach

- Use Supabase's official Docker images (same as `supabase start` uses internally)
- Backend and AI worker build from local Dockerfiles
- Frontend runs as Vite dev server with hot reload
- All services on a shared Docker network
- Environment variables injected via `.env` file
- Single command: `docker compose up`

### 3.7.3 Benefits Over Current Setup

| Before | After |
|--------|-------|
| 3-4 terminal tabs (`supabase start`, `make emulators`, `make backend`, `make frontend`) | `docker compose up` |
| Firebase emulators conflict with Docker networking | No Firebase — everything is Docker-native |
| Manual env var management per terminal | Single `.env` file |
| Different runtime between local and production | Same containers locally and in prod |

### Definition of Done

- [ ] `docker compose up` starts all services
- [ ] Backend connects to Supabase DB inside Docker network
- [ ] Frontend proxies API requests to backend container
- [ ] Auth flow works end-to-end inside Docker
- [ ] Photo upload to Supabase Storage works inside Docker
- [ ] `docker compose down` cleans up all containers
- [ ] README updated with new local dev instructions

---

# Final Stack

| Layer | Before (Firebase) | After |
|-------|-------------------|-------|
| Frontend | React on Firebase Hosting | React on **Render Static Site** |
| Backend | Ktor on Cloud Run | Ktor on Cloud Run _(unchanged)_ |
| Auth | Firebase Auth | **Supabase Auth** (GoTrue) |
| Database | Firebase Data Connect (GraphQL) | **Supabase PostgreSQL + Ktorm** |
| Storage | Firebase Cloud Storage | **Supabase Storage** (S3-compatible) |
| Functions | Firebase Functions (Python) | **Cloud Run** (Python, same container model) |
| AI | Gemini API | Gemini API _(unchanged)_ |
| Local Dev | Firebase Emulators | **Supabase CLI** (`supabase start`) |
