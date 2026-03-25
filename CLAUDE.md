# Kanji Masta

## Commit Convention

Commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint:
`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`, `deploy:`, `style:`, `test:`

Max header: 100 chars. Always include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.

## Code Patterns

### Backend (Ktor + Kotlin)
- Modules at `backend/src/main/kotlin/com/kanjimasta/modules/{name}/` — Routes, Service, Repository, Models
- Modules import only from `core/`. Never from each other.
- All DB access via Ktorm ORM (`org.ktorm.dsl.*`). No raw SQL strings in repositories.
- Custom PG types in `core/db/PgTypes.kt`: `textArray()`, `uuidArray()`, `pgEnum<T>()`
- Table definitions in `core/db/Tables.kt` — one `Table<Nothing>` object per table
- Auth via Supabase JWT (HS256). Provider name: `"supabase"`. Principal: `AuthUser(uid, email)`
- Services take repository + config via constructor. Wired in `Application.kt`, passed to `configureRouting()`.

### Frontend (React + MUI + TypeScript)
- Import alias: `@/` maps to `src/` — always use `@/components/`, `@/pages/`, `@/lib/`
- Routes are lazy-loaded via `React.lazy()` in `App.tsx` — only Home + Login are eager
- Auth via `@supabase/supabase-js` — `supabase.ts` exports the client
- API token: `supabase.auth.getSession()` → `session.access_token` in `api.ts`
- Storage: `supabase.storage.from('photos')` for photo uploads
- API caching via `@tanstack/react-query` — use `useQuery` for GET endpoints, not manual `useState` + `useEffect` + `apiFetch`
- Shared components: `PageHeader` (all pages), `FamiliarityDots` (kanji/word lists)
- Dark theme with indigo `#4338ca` accent. Mobile-first `maxWidth: 480`.
- No AppBar — pages manage own headers via `PageHeader`

### AI Worker (FastAPI + Python)
- Located at `services/ai-worker/app/`
- Routes: `/analyze-photo`, `/generate-quizzes`, `/discover-words`, `/cron/generate-quizzes`, `/cron/check-regen`
- DB access via psycopg2 connection pool in `db.py`. All queries parameterized.
- Gemini API calls in `gemini.py`. Prompts in `prompts.py`.
- TraceContext for structured logging with `[callId] [userId]` prefix

### Schema
- Single source of truth: `supabase/migrations/` (SQL DDL)
- Seed data: `supabase/seed.sql` (kanji, words, quizzes from Data Connect backup)
- WordMaster = shared word table. UserWords = personal progress referencing WordMaster.
- QuizBank with `user_id IS NULL` = global (shared). `user_id` set = personal override.

## Build & Run

```
make supabase-start   # Terminal 1 (or: make up for Docker Compose)
make ai-worker        # Terminal 2
make backend          # Terminal 3
make frontend         # Terminal 4
```

Or all-in-one with Docker Compose:
```
make supabase-start
make up
```

`make help` for all commands. `make check-deploy` to see what needs deploying.

## Testing

```
make test             # Run all tests (backend + ai-worker + frontend)
make test-backend     # 17 integration tests (requires local Supabase)
make test-ai-worker   # 21 pytest tests (requires local Supabase)
make test-frontend    # Frontend unit tests
```

## Deploy

```
make deploy-all       # Deploy ai-worker → backend → frontend
make deploy-frontend  # GCS bucket + Cloudflare CDN (shuukanhq.com)
make deploy-backend   # Cloud Run (asia-east1)
make deploy-ai-worker # Cloud Run (asia-east1)
make deploy-status    # Show what's deployed
make check-deploy     # Show what needs deploying
```

## Key Docs
- `README.md` — setup, deployment commands, project structure
- `docs/architecture.md` — full system design + schema
- `docs/phase1.md` / `docs/phase2.md` — iteration plans
- `docs/migration_phase.md` — Firebase → Supabase migration plan
