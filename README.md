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

### Deploy Frontend (when frontend code changes)

```bash
cd frontend
npm run build         # Uses .env.prod for production config
cd ..
firebase deploy --only hosting
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
cd backend && ./gradlew build && cd ..
docker build -t asia-east1-docker.pkg.dev/kanji-masta/kanji-masta-backend/backend ./backend
docker push asia-east1-docker.pkg.dev/kanji-masta/kanji-masta-backend/backend

gcloud run deploy kanji-masta-backend \
  --image asia-east1-docker.pkg.dev/kanji-masta/kanji-masta-backend/backend \
  --region asia-east1 \
  --set-env-vars "FIREBASE_PROJECT_ID=kanji-masta,FIREBASE_FUNCTIONS_HOST=asia-east1-kanji-masta.cloudfunctions.net,FIREBASE_FUNCTIONS_REGION=asia-east1,LOG_LEVEL=INFO" \
  --allow-unauthenticated
```

Or use Cloud Build (no local Docker needed):

```bash
gcloud run deploy kanji-masta-backend \
  --source ./backend \
  --region asia-east1 \
  --set-env-vars "FIREBASE_PROJECT_ID=kanji-masta,FIREBASE_FUNCTIONS_HOST=asia-east1-kanji-masta.cloudfunctions.net,FIREBASE_FUNCTIONS_REGION=asia-east1,LOG_LEVEL=INFO" \
  --allow-unauthenticated
```

### Deploy Functions (when functions/main.py changes)

```bash
firebase deploy --only functions
```

Functions run in **asia-east1**. Secrets are set separately:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

### Deploy Schema (when dataconnect/schema/schema.gql changes)

```bash
firebase deploy --only dataconnect
```

### Deploy Storage Rules (when storage.rules changes)

```bash
firebase deploy --only storage
```

### Deploy Storage CORS (when storage-cors.json changes)

```bash
make deploy-cors
```

### Deploy Everything

```bash
make deploy-all    # functions + dataconnect + storage + hosting + CORS
```

Backend must be deployed separately via `gcloud run deploy`.

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

| Changed | Deploy |
|---------|--------|
| `frontend/src/**` | `npm run build` → `firebase deploy --only hosting` |
| `backend/src/**` | `./gradlew build` → `gcloud run deploy` |
| `functions/main.py` | `firebase deploy --only functions` |
| `dataconnect/schema/schema.gql` | `firebase deploy --only dataconnect` |
| `storage.rules` | `firebase deploy --only storage` |
| `storage-cors.json` | `make deploy-cors` |
| `scripts/seed*.py` | Re-run seed commands with `--prod` |

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
