# Deployment Guide

## Prerequisites

- Firebase project on **Blaze plan** (required for Functions + Cloud SQL)
- `firebase` CLI installed and logged in (`firebase login`)
- `gcloud` CLI installed (for Cloud SQL access)
- Domain configured (optional — can use Firebase Hosting default domain)

---

## 1. Firebase Project Setup

### 1.1 Create project (if not done)
```bash
firebase projects:create kanji-masta
firebase use kanji-masta
```

### 1.2 Enable services
In Firebase Console (https://console.firebase.google.com):
- **Authentication** → Enable Email/Password sign-in
- **Cloud Storage** → Create default bucket
- **Data Connect** → Enable (creates Cloud SQL instance)

### 1.3 Set secrets
```bash
# Gemini API key for Firebase Functions
firebase functions:secrets:set GEMINI_API_KEY
# Enter your key when prompted
```

---

## 2. Deploy Data Connect Schema

```bash
firebase deploy --only dataconnect
```

This creates/updates all PostgreSQL tables from `dataconnect/schema/schema.gql`.

Verify:
```bash
# Connect to Cloud SQL (requires gcloud auth)
gcloud sql connect kanji-masta --user=postgres
\dt public.*
```

---

## 3. Seed KanjiMaster Data

```bash
# From scripts/ directory
cd scripts
python seed.py --file data/kanjidic2.xml --freq-limit 1500 --persist --prod
```

This inserts ~1500 kanji with readings, meanings, JLPT levels, and frequency ranks.

### Optional: Seed global quizzes (WordMaster + QuizBank)
```bash
python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --prod --resume
python seed_quizzes.py --file data/kanjidic2.xml --jlpt 4 --persist --prod --resume
```

This creates WordMaster entries + global quizzes (userId=null) for N5/N4 kanji via Gemini (~$2-5 per JLPT level). Quizzes are shared across all users.

---

## 4. Deploy Firebase Functions

```bash
cd functions
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..
firebase deploy --only functions
```

Functions deployed:
- `analyze_photo` — HTTP trigger for photo analysis (Gemini vision)
- `generate_quizzes_http` — HTTP trigger for immediate quiz generation
- `generate_quizzes` — Scheduled (every 2 min) for background generation
- `check_regen_triggers` — Scheduled (daily) for distractor regen
- `discover_words` — HTTP trigger for word discovery

---

## 5. Deploy Storage Rules

```bash
firebase deploy --only storage
```

Rules in `storage.rules` enforce auth — users can only write to `photos/{userId}/**`.

---

## 6. Build & Deploy Backend (Ktor)

### 6.1 Build
```bash
cd backend
./gradlew build
```

The fat JAR is at `backend/build/libs/kanji-masta.jar`.

### 6.2 Environment variables (production)
```bash
# Required
FIREBASE_PROJECT_ID=kanji-masta
PORT=8080
LOG_LEVEL=INFO

# These should NOT be set in production (no emulators):
# FIREBASE_AUTH_EMULATOR_HOST=
# FIREBASE_DATACONNECT_HOST=
# FIREBASE_FUNCTIONS_HOST=

# For Firebase Admin SDK auth (auto-detected on GCP, or set manually):
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 6.3 Deploy options

**Cloud Run (recommended):**
```bash
# Build container
docker build -t gcr.io/kanji-masta/backend ./backend
docker push gcr.io/kanji-masta/backend

# Deploy
gcloud run deploy kanji-masta-backend \
  --image gcr.io/kanji-masta/backend \
  --region asia-east1 \
  --set-env-vars FIREBASE_PROJECT_ID=kanji-masta,LOG_LEVEL=INFO \
  --allow-unauthenticated
```

**Or use the existing Dockerfile:**
```bash
docker compose -f docker-compose.yml up -d backend
```

### 6.4 Production Configuration

All config is via environment variables — **no manual editing of `application.yaml` needed**. The YAML reads from env vars with local defaults:

```yaml
# application.yaml already does this:
firebase:
  projectId: "$FIREBASE_PROJECT_ID:kanji-masta"
  authEmulatorHost: "$FIREBASE_AUTH_EMULATOR_HOST:"   # empty = production
  dataConnectHost: "$FIREBASE_DATACONNECT_HOST:"      # empty = production
  functionsHost: "$FIREBASE_FUNCTIONS_HOST:"          # empty = production
```

For Cloud Run, just set the env vars:
```bash
gcloud run deploy kanji-masta-backend \
  --set-env-vars \
    FIREBASE_PROJECT_ID=kanji-masta,\
    FIREBASE_FUNCTIONS_HOST=asia-east1-kanji-masta.cloudfunctions.net,\
    FIREBASE_FUNCTIONS_REGION=asia-east1,\
    LOG_LEVEL=INFO
```

When `FIREBASE_AUTH_EMULATOR_HOST` is empty, the Firebase Admin SDK uses real credentials (auto-detected on GCP). When `FIREBASE_DATACONNECT_HOST` is empty, the backend uses the production Data Connect endpoint.

---

## 7. Build & Deploy Frontend

### 7.1 Production environment
Create `frontend/.env.production`:
```bash
VITE_API_URL=https://your-backend-url.com
VITE_FIREBASE_API_KEY=AIza...your-real-key
VITE_FIREBASE_AUTH_DOMAIN=kanji-masta.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kanji-masta
VITE_FIREBASE_STORAGE_BUCKET=kanji-masta.appspot.com
# NO emulator hosts — connects to real Firebase
```

### 7.2 Build
```bash
cd frontend
npm run build
```

Output in `frontend/dist/`.

### 7.3 Deploy via Firebase Hosting

Firebase Hosting is already configured in `firebase.json` — SPA rewrite rule routes all paths to `index.html` for React Router.

```bash
# Build with production env vars
cd frontend && npm run build
cd ..

# Deploy
firebase deploy --only hosting
```

Your site will be available at `https://kanji-masta.web.app` (or your custom domain).

To set up a custom domain: Firebase Console → Hosting → Add custom domain.

---

## 8. CORS Configuration

### Cloud Storage CORS
CORS config is committed in `storage-cors.json`. Apply it:
```bash
make deploy-cors
# or manually:
gcloud storage buckets update gs://YOUR_BUCKET_NAME --cors-file=storage-cors.json
```

Update origins in `storage-cors.json` if you add a custom domain.

### Backend CORS
The backend uses `anyHost()` — works for any frontend domain. Optionally restrict via env var in production (not yet implemented).

---

## 9. Post-Deployment Checklist

- [ ] `firebase deploy --only dataconnect` — schema deployed
- [ ] `firebase deploy --only functions` — all 5 functions deployed
- [ ] `firebase deploy --only storage` — rules deployed
- [ ] KanjiMaster seeded (~1500 rows)
- [ ] System quizzes seeded (optional, N5/N4)
- [ ] Backend deployed and healthy (`curl https://backend-url/health`)
- [ ] Frontend deployed and loading
- [ ] Create test account in Firebase Auth console
- [ ] Login works
- [ ] Onboarding flow works (kanji cards appear)
- [ ] Photo capture → upload to Storage → Gemini analysis → results
- [ ] Quiz session works (Start Session → answer → familiarity updates)
- [ ] Settings save persists
- [ ] `costMicrodollars` tracked on PhotoSession after Gemini calls

---

## 10. Monitoring

### Logs
- Backend: Cloud Run logs or `docker compose logs backend`
- Functions: Firebase Console → Functions → Logs
- Format: `[callId] [userId] LEVEL message` (trace correlation)

### Costs
- Gemini API: track via `costMicrodollars` on `PhotoSession` and `QuizGenerationJob`
- Cloud SQL: Firebase Data Connect pricing
- Cloud Run: per-request pricing
- Storage: minimal for photos

### Database
```bash
# Connect to production Cloud SQL
gcloud sql connect kanji-masta --user=postgres

# Useful queries
SELECT count(*) FROM kanji_master;
SELECT user_id, count(*) FROM user_kanji GROUP BY user_id;
SELECT status, count(*) FROM quiz_generation_job GROUP BY status;
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `firebase deploy --only dataconnect` | Deploy schema |
| `firebase deploy --only functions` | Deploy functions |
| `firebase deploy --only storage` | Deploy storage rules |
| `firebase deploy --only hosting` | Deploy frontend |
| `firebase deploy` | Deploy everything |
| `firebase functions:secrets:set KEY` | Set a secret |
| `firebase functions:log` | View function logs |
