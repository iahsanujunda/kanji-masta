# Kanji Masta

Photo-driven kanji learning app for people living in Japan. Capture signs and menus → select kanji to learn → get spaced-repetition quizzes powered by Gemini.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + MUI + Vite |
| Backend | Ktor (Kotlin) |
| Auth | Firebase Auth |
| Database | Firebase Data Connect (PostgreSQL) |
| Storage | Firebase Cloud Storage |
| Functions | Firebase Functions (Python) |
| AI | Gemini 3.1 Pro |
| Hosting | Firebase Hosting (frontend) + Cloud Run (backend) |

## Local Development

Requires 3 terminals:

```bash
make emulators   # Terminal 1: Firebase emulators
make backend     # Terminal 2: Ktor backend (port 8080)
make frontend    # Terminal 3: React dev server (port 5173)
```

### First-time setup

```bash
make setup                  # Install all dependencies
make seed                   # Seed KanjiMaster (1800 kanji from kanjidic2)
make seed-quizzes JLPT=5    # Generate quizzes for N5 kanji (requires GEMINI_API_KEY in functions/.env)
```

### Useful commands

```bash
make help           # Show all commands
make check          # Type-check frontend + build backend
make psql           # Connect to local Data Connect PostgreSQL
make reset-all      # Clear all user data (back to zero state)
make reset-quiz     # Reset quiz progress only
make trigger-quizzes  # Manually trigger quiz generation
make db             # Show key table counts
```

---

## Deployment

### Prerequisites

- Firebase project on Blaze plan
- `firebase` and `gcloud` CLIs installed and authenticated
- `gcloud config set project kanji-masta`

### Check what needs deploying

```bash
make check-deploy     # Shows what changed since last deploy
make deploy-status    # Shows last deployed commit per component
```

### Deploy Frontend (when frontend code changes)

```bash
make deploy-frontend  # Builds + deploys + records commit
```

Frontend is a static SPA on Firebase Hosting. The `.env.prod` file (gitignored) contains:

```
VITE_API_URL=https://your-backend.asia-east1.run.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=kanji-masta.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kanji-masta
VITE_FIREBASE_STORAGE_BUCKET=kanji-masta.firebasestorage.app
```

### Deploy Backend (when backend code changes)

```bash
make deploy-backend   # Builds + pushes Docker + deploys to Cloud Run + records commit
```

### Deploy Functions (when functions/main.py changes)

```bash
make deploy-functions   # Deploys + records commit
```

Secrets are set separately (one-time):

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

### Deploy Schema (when dataconnect/schema/schema.gql changes)

```bash
make deploy-dataconnect
```

### Deploy Storage Rules + CORS

```bash
make deploy-storage
```

### Deploy Everything (except backend)

```bash
make deploy-all       # functions + dataconnect + storage + hosting + CORS
make deploy-backend   # backend separately (Cloud Run)
```

### Seed Data (first-time or after schema changes)

```bash
cd scripts
python seed.py --file data/kanjidic2.xml --freq-limit 1800 --persist --prod
python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --prod --resume
python seed_quizzes.py --file data/kanjidic2.xml --jlpt 4 --persist --prod --resume
```

### Run Migration (when upgrading from Phase 1 to Phase 2)

```bash
cd scripts
python migrate_phase2.py --prod
```

---

## What to Deploy When

| Changed | Command |
|---------|---------|
| `frontend/src/**` | `make deploy-frontend` |
| `backend/src/**` | `make deploy-backend` |
| `functions/main.py` | `make deploy-functions` |
| `dataconnect/schema/**` | `make deploy-dataconnect` |
| `storage.rules` / `storage-cors.json` | `make deploy-storage` |
| `scripts/seed*.py` | Re-run seed commands with `--prod` |
| Not sure what changed? | `make check-deploy` |

---

## Project Structure

```
kanji-masta/
├── backend/          # Ktor API server (Kotlin)
├── frontend/         # React SPA (TypeScript + MUI)
├── functions/        # Firebase Functions (Python)
├── dataconnect/      # Data Connect schema + connectors
├── scripts/          # Seed + migration scripts
├── docs/             # Architecture, phase plans, prototypes, deploy guide
├── firebase.json     # Firebase project config
├── storage.rules     # Cloud Storage security rules
├── storage-cors.json # Cloud Storage CORS config
├── Makefile          # Dev + deploy commands
└── docker-compose.yml # Docker setup (production)
```

## Docs

- [Architecture](docs/architecture.md) — system design, data flow, schema
- [Phase 1 Plan](docs/phase1.md) — iteration details for core features
- [Phase 2 Plan](docs/phase2.md) — multi-user, shared quiz bank, invites
- [Deployment Guide](docs/deploy.md) — detailed deployment instructions
