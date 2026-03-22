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

deploy-functions: ## Deploy Firebase Functions
	firebase deploy --only functions

deploy-dataconnect: ## Deploy Data Connect schema
	firebase deploy --only dataconnect

deploy-storage: ## Deploy Storage rules
	firebase deploy --only storage

deploy-all: ## Deploy all Firebase services
	firebase deploy --only functions,dataconnect,storage

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

psql: ## Connect to Data Connect emulator PostgreSQL
	psql -h 127.0.0.1 -p 5432 -U postgres

clean: ## Clean build artifacts
	cd backend && ./gradlew clean
	cd frontend && rm -rf dist node_modules/.vite
	rm -rf functions/venv

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
