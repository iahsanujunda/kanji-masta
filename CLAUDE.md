# Kanji Masta

## Project Overview

Photo-driven kanji learning app. React + Ktor + Firebase (Auth, Data Connect, Functions, Storage, Hosting). AI via Gemini 3.1 Pro. See `README.md` for full setup and `docs/` for architecture.

## UI Design

### Color Theme
- MUI dark mode as base
- Primary accent: indigo `#4338ca` (hover: `#3730a3`)
- Used for: quiz slot cards, login form background, highlighted sections
- Prominent action buttons (Capture Kanji, Sign In): light style — `grey.100` bg with indigo or dark text, pill-shaped (`borderRadius: 6-8`)
- Inner buttons on accent sections (Start Session): white bg with indigo text

### Button Patterns
- **Full-width action buttons** (Capture Kanji, Sign In): rounded pill shape, bold text, letter-spacing
- **Capture Kanji**: fixed bottom, light button (`grey.100`/`grey.900`), camera icon in translucent circle
- **Start Session**: white on indigo card, `ChevronRight` end icon
- **Sign In**: light button (`grey.100`/indigo) inside indigo form card

### Layout
- No AppBar — pages manage their own headers via shared `PageHeader` component
- Mobile-first: `maxWidth: 480`, centered
- Settings accessed via gear icon in page header, dedicated `/settings` page
- Bottom action bar with gradient fade from transparent to background
- `@` path alias for imports (`@/components/`, `@/pages/`, `@/lib/`)

## Build & Run

Run `make help` for all commands. Local dev requires 3 terminals:

```
make emulators   # Terminal 1: Firebase emulators (Auth:9099, DC:9399, Functions:5001, Storage:9199)
make backend     # Terminal 2: Ktor backend (port 8080, auto-connects to emulators)
make frontend    # Terminal 3: React dev server (port 5173)
```

### Useful commands
- `make setup` — install all dependencies (npm, pip, gradle)
- `make seed` — seed KanjiMaster data into local emulator
- `make seed-quizzes JLPT=5` — generate quizzes for N5 kanji (requires GEMINI_API_KEY)
- `make check` — type-check frontend + build backend
- `make psql` — connect to local Data Connect PostgreSQL
- `make reset-all` — clear all user data (back to zero state)
- `make reset-quiz` — reset quiz progress only (keep generated quizzes)
- `make trigger-quizzes` — manually trigger quiz generation function
- `make check-deploy` — show what needs deploying
- `make deploy-status` — show last deployed commit per component

## Deployment

All deploy commands auto-record state in `deploy-state.json`:

```
make deploy-frontend    # Build + deploy to Firebase Hosting
make deploy-backend     # Build + push Docker + deploy to Cloud Run
make deploy-functions   # Deploy Firebase Functions to asia-east1
make deploy-dataconnect # Deploy Data Connect schema
make deploy-storage     # Deploy storage rules + CORS
make deploy-all         # All Firebase services (not backend)
```

See `README.md` and `docs/deploy.md` for full deployment guide.

## Architecture

- **Backend** (Ktor): API gateway + slot engine. Reads/writes Data Connect via `executeGraphql` REST API. No direct Gemini calls.
- **Functions** (Python): All Gemini API calls — photo analysis, quiz generation, word discovery. Run in asia-east1.
- **Schema**: `dataconnect/schema/schema.gql` is single source of truth. Key tables: KanjiMaster, WordMaster, UserKanji, UserWords, QuizBank, QuizDistractor.
- **WordMaster**: Shared canonical word list. QuizBank rows with `userId=null` are global (shared across users).
- **Frontend**: React + MUI + Vite. Lazy-loaded routes. `@tanstack/react-query` for API caching.

### Backend module pattern
```
modules/{name}/
  {Name}Routes.kt    — route handlers
  {Name}Service.kt   — business logic
  {Name}Repository.kt — Data Connect queries
  {Name}Models.kt    — request/response data classes
```

Modules import only from `core/`. Never from each other.

### Key env vars (backend)
- `FIREBASE_PROJECT_ID` — Firebase project
- `FIREBASE_AUTH_EMULATOR_HOST` — empty = production
- `FIREBASE_DATACONNECT_HOST` — empty = production
- `FIREBASE_FUNCTIONS_HOST` — empty = production
- `FIREBASE_FUNCTIONS_REGION` — `us-central1` (local) or `asia-east1` (prod)
- `LOG_LEVEL` — `DEBUG` (local) or `INFO` (prod)

## Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint + husky:

```
feat: add onboarding flow
fix: quiz tier gating at familiarity 0
docs: update deploy guide
chore: bump dependencies
deploy: frontend at abc123
refactor: extract WordMaster from UserWords
perf: lazy load routes
```

## Docs

- `docs/architecture.md` — system design, data flow, full schema
- `docs/phase1.md` — iteration plan for core features
- `docs/phase2.md` — multi-user, shared quiz bank, invites
- `docs/deploy.md` — detailed deployment instructions
- `docs/proto/` — Tailwind prototypes (reference only, not used in app)
