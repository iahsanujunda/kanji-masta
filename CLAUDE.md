# Kanji Masta

## Commit Convention

Commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint:
`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`, `deploy:`, `style:`, `test:`

Max header: 100 chars. Always include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.

## Code Patterns

### Backend (Ktor + Kotlin)
- Modules at `backend/src/main/kotlin/com/kanjimasta/modules/{name}/` — Routes, Service, Repository, Models
- Modules import only from `core/`. Never from each other.
- All DB access via `DataConnectClient.executeGraphql()` with inline GraphQL strings
- Data Connect enums must be unquoted in queries: `status: PENDING` not `status: "PENDING"`
- Nullable JSON fields: always use `dataOrNull()` helper or check `is JsonObject` before `.jsonObject`
- Services take repository + config via constructor. Wired in `Application.kt`, passed to `configureRouting()`.

### Frontend (React + MUI + TypeScript)
- Import alias: `@/` maps to `src/` — always use `@/components/`, `@/pages/`, `@/lib/`
- Routes are lazy-loaded via `React.lazy()` in `App.tsx` — only Home + Login are eager
- API caching via `@tanstack/react-query` — use `useQuery` for GET endpoints, not manual `useState` + `useEffect` + `apiFetch`
- Shared components: `PageHeader` (all pages), `FamiliarityDots` (kanji/word lists)
- Dark theme with indigo `#4338ca` accent. Mobile-first `maxWidth: 480`.
- No AppBar — pages manage own headers via `PageHeader`

### Firebase Functions (Python)
- All in `functions/main.py`. Region: `asia-east1`.
- Use `TraceContext.from_request(req)` for structured logging with `[callId] [userId]` prefix
- Data Connect emulator auto-detected via `FUNCTIONS_EMULATOR` env var
- Global quizzes: `userId=null` (not `userId="system"`)

### Schema
- Single source of truth: `dataconnect/schema/schema.gql`
- WordMaster = shared word table. UserWords = personal progress referencing WordMaster.
- QuizBank with `userId=null` = global (shared). `userId` set = personal override.

## Build & Run

```
make emulators   # Terminal 1
make backend     # Terminal 2
make frontend    # Terminal 3
```

`make help` for all commands. `make check-deploy` to see what needs deploying.

## Key Docs
- `README.md` — setup, deployment commands, project structure
- `docs/architecture.md` — full system design + schema
- `docs/phase1.md` / `docs/phase2.md` — iteration plans
- `docs/deploy.md` — detailed deployment guide
