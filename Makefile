.PHONY: dev emulators backend frontend seed clean build check

# --- Local Development (run each in a separate terminal) ---

dev: ## Start all services for local dev (requires 3 terminals)
	@echo "Run these in separate terminals:"
	@echo "  make emulators"
	@echo "  make backend"
	@echo "  make frontend"

emulators: ## Start Firebase emulators (Auth, Data Connect, Functions, Storage)
	firebase emulators:start

backend: ## Start Ktor backend (connects to local emulators)
	cd backend && \
	FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
	FIREBASE_DATACONNECT_HOST=127.0.0.1:9399 \
	FIREBASE_FUNCTIONS_HOST=127.0.0.1:5001 \
	./gradlew run

frontend: ## Start React dev server
	cd frontend && npm run dev

# --- Setup ---

setup: ## Install all dependencies
	cd frontend && npm install
	cd functions && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
	cd backend && ./gradlew build

seed: ## Seed KanjiMaster data into local emulator
	cd scripts && python seed.py --file data/kanjidic2.xml --freq-limit 1500 --clear-and-persist

seed-quizzes: ## Generate quizzes for JLPT kanji (usage: make seed-quizzes JLPT=5 LIMIT=500)
	cd scripts && python seed_quizzes.py --file data/kanjidic2.xml --jlpt $(or $(JLPT),5) $(if $(LIMIT),--limit $(LIMIT)) --persist --resume

seed-prod: ## Seed KanjiMaster data into production
	cd scripts && python seed.py --file data/kanjidic2.xml --freq-limit 1500 --clear-and-persist --prod

# --- Build & Check ---

build: ## Build all projects
	cd backend && ./gradlew build
	cd frontend && npm run build

check: ## Type-check and compile without running
	cd backend && ./gradlew build
	cd frontend && npx tsc -b --noEmit

# --- Docker (production) ---

docker-up: ## Start production Docker services
	docker compose up -d --build

docker-down: ## Stop Docker services
	docker compose down

# --- Deploy ---

DEPLOY_STATE = deploy-state.json
COMMIT = $(shell git rev-parse --short HEAD)
TIMESTAMP = $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

_mark-deploy = python3 -c "import json; f=open('$(DEPLOY_STATE)'); d=json.load(f); f.close(); d['$(1)']={'commit':'$(COMMIT)','deployedAt':'$(TIMESTAMP)'}; f=open('$(DEPLOY_STATE)','w'); json.dump(d,f,indent=2); f.close(); print('  Marked $(1) deployed at $(COMMIT)')"

deploy-frontend: ## Build + deploy frontend to Firebase Hosting
	cd frontend && npm run build
	firebase deploy --only hosting
	@$(call _mark-deploy,frontend)

deploy-backend: ## Build + deploy backend to Cloud Run
	cd backend && ./gradlew build
	docker build -t asia-east1-docker.pkg.dev/kanji-masta/kanji-masta-backend/backend ./backend
	docker push asia-east1-docker.pkg.dev/kanji-masta/kanji-masta-backend/backend
	gcloud run deploy kanji-masta-backend \
		--image asia-east1-docker.pkg.dev/kanji-masta/kanji-masta-backend/backend \
		--region asia-east1 \
		--set-env-vars "FIREBASE_PROJECT_ID=kanji-masta,FIREBASE_FUNCTIONS_HOST=asia-east1-kanji-masta.cloudfunctions.net,FIREBASE_FUNCTIONS_REGION=asia-east1,LOG_LEVEL=INFO" \
		--allow-unauthenticated
	@$(call _mark-deploy,backend)

deploy-functions: ## Deploy Firebase Functions
	firebase deploy --only functions
	@$(call _mark-deploy,functions)

deploy-dataconnect: ## Deploy Data Connect schema
	firebase deploy --only dataconnect
	@$(call _mark-deploy,dataconnect)

deploy-storage: ## Deploy Storage rules + CORS
	firebase deploy --only storage
	gcloud storage buckets update gs://$(or $(STORAGE_BUCKET),kanji-masta.firebasestorage.app) --cors-file=storage-cors.json
	@$(call _mark-deploy,storage)

deploy-all: ## Deploy all Firebase services + CORS
	firebase deploy --only functions,dataconnect,storage,hosting
	gcloud storage buckets update gs://$(or $(STORAGE_BUCKET),kanji-masta.firebasestorage.app) --cors-file=storage-cors.json
	@$(call _mark-deploy,frontend)
	@$(call _mark-deploy,functions)
	@$(call _mark-deploy,dataconnect)
	@$(call _mark-deploy,storage)

deploy-status: ## Show deployment state for all components
	@python3 -c "import json; d=json.load(open('deploy-state.json')); print(); [print(f'  {k:<14} {v.get(\"commit\",\"\") or \"never\":>8}  {v.get(\"deployedAt\",\"\") or \"-\"}') for k,v in d.items()]; print()"

# --- Utilities ---

query: ## Query Data Connect tables (usage: make query Q="userKanjis { id status kanji { character } }")
	@curl -s http://127.0.0.1:9399/v1alpha/projects/kanji-masta/locations/asia-east1/services/kanji-masta:executeGraphql \
		-H "Content-Type: application/json" \
		-d "{\"query\": \"query { $(Q) }\"}" | python3 -m json.tool

db: ## Show key table counts
	@echo "=== Photo Sessions ===" && \
	curl -s http://127.0.0.1:9399/v1alpha/projects/kanji-masta/locations/asia-east1/services/kanji-masta:executeGraphql \
		-H "Content-Type: application/json" \
		-d '{"query": "query { photoSessions { id } }"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  {len(d[\"data\"][\"photoSessions\"])} rows')" && \
	echo "=== User Kanji ===" && \
	curl -s http://127.0.0.1:9399/v1alpha/projects/kanji-masta/locations/asia-east1/services/kanji-masta:executeGraphql \
		-H "Content-Type: application/json" \
		-d '{"query": "query { userKanjis { id status kanji { character } } }"}' | python3 -c "import sys,json; d=json.load(sys.stdin); rows=d['data']['userKanjis']; print(f'  {len(rows)} rows'); [print(f'    {r[\"kanji\"][\"character\"]} — {r[\"status\"]}') for r in rows]" && \
	echo "=== Quiz Generation Jobs ===" && \
	curl -s http://127.0.0.1:9399/v1alpha/projects/kanji-masta/locations/asia-east1/services/kanji-masta:executeGraphql \
		-H "Content-Type: application/json" \
		-d '{"query": "query { quizGenerationJobs { id status kanji { character } } }"}' | python3 -c "import sys,json; d=json.load(sys.stdin); rows=d['data']['quizGenerationJobs']; print(f'  {len(rows)} rows'); [print(f'    {r[\"kanji\"][\"character\"]} — {r[\"status\"]}') for r in rows]"

reset-all: ## Reset ALL user data (back to zero state, keeps KanjiMaster)
	@psql -h 127.0.0.1 -p 5432 -U postgres -c "\
		TRUNCATE quiz_serve, quiz_distractor, quiz_bank, quiz_generation_job, quiz_slot, user_kanji, user_words, photo_session CASCADE; \
		SELECT 'All user data cleared' as status;"

reset-quiz: ## Reset quiz progress (keep generated quizzes, reset familiarity/slots/serves)
	@psql -h 127.0.0.1 -p 5432 -U postgres -c "\
		TRUNCATE quiz_serve, quiz_slot CASCADE; \
		UPDATE quiz_bank SET served_count = 0, served_at = NULL; \
		UPDATE quiz_distractor SET served_at = NULL; \
		UPDATE user_words SET familiarity = 0, current_tier = 'MEANING_RECALL', next_review = NULL; \
		SELECT count(*) as ready_quizzes FROM quiz_bank WHERE user_id != 'system';"

trigger-quizzes: ## Trigger quiz generation function manually
	curl -s -X POST http://127.0.0.1:5001/kanji-masta/us-central1/generate_quizzes_http | python3 -m json.tool

psql: ## Connect to Data Connect emulator PostgreSQL
	psql -h 127.0.0.1 -p 5432 -U postgres

test-frontend: ## Run frontend unit tests
	cd frontend && npx vitest run

test-frontend-watch: ## Run frontend tests in watch mode
	cd frontend && npx vitest

clean: ## Clean build artifacts
	cd backend && ./gradlew clean
	cd frontend && rm -rf dist node_modules/.vite
	rm -rf functions/venv

check-deploy: ## Show what needs deploying based on changes since last deploy
	@python3 scripts/check_deploy.py

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
