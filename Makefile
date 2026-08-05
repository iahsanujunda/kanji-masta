-include .env
export

AI_PROVIDER ?= gemini
OPENROUTER_SITE_URL ?= https://shuukanhq.com
OPENROUTER_APP_NAME ?= Kanji Masta
OPENROUTER_REASONING_EFFORT ?= medium

.PHONY: dev up down backend frontend seed clean build check deploy-db

# --- Local Development ---

dev: ## Start everything (Supabase + app stack via Docker Compose)
	@echo "Step 1: make supabase-start"
	@echo "Step 2: make up"
	@echo ""
	@echo "Or run services individually:"
	@echo "  make supabase-start  (database + auth + storage)"
	@echo "  make ai-worker       (AI worker)"
	@echo "  make backend         (Ktor backend)"
	@echo "  make frontend        (React dev server)"

up: ## Start app services via Docker Compose (run supabase-start first)
	docker compose up --build

down: ## Stop app services
	docker compose down

supabase-start: ## Start local Supabase (PostgreSQL on port 54322)
	npx supabase start

supabase-stop: ## Stop local Supabase
	npx supabase stop

supabase-reset: ## Reset Supabase DB (reapply migrations + seed)
	npx supabase db reset

ai-worker: ## Start AI worker (quiz gen, photo analysis, word discovery)
	cd services/ai-worker && \
	DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
	AI_PROVIDER=$(AI_PROVIDER) \
	GEMINI_API_KEY=$(GEMINI_API_KEY) \
	OPENROUTER_API_KEY=$(OPENROUTER_API_KEY) \
	OPENROUTER_MODEL=$(OPENROUTER_MODEL) \
	OPENROUTER_REASONING_EFFORT=$(OPENROUTER_REASONING_EFFORT) \
	OPENROUTER_ANALYZE_MODEL=$(OPENROUTER_ANALYZE_MODEL) \
	OPENROUTER_QUIZ_MODEL=$(OPENROUTER_QUIZ_MODEL) \
	OPENROUTER_DISCOVERY_MODEL=$(OPENROUTER_DISCOVERY_MODEL) \
	OPENROUTER_SITE_URL=$(OPENROUTER_SITE_URL) \
	OPENROUTER_APP_NAME='$(OPENROUTER_APP_NAME)' \
	uvicorn app.main:app --reload --port 5001

backend: ## Start Ktor backend (connects to local Supabase + AI worker)
	cd backend && \
	DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
	SUPABASE_URL=http://127.0.0.1:54321 \
	AI_WORKER_URL=http://127.0.0.1:5001 \
	./gradlew run

frontend: ## Start React dev server
	cd frontend && npm run dev

# --- Setup ---

setup: ## Install all dependencies
	cd frontend && npm install
	cd services/ai-worker && pip install -r requirements.txt
	cd backend && ./gradlew build

# --- Build & Check ---

build: ## Build all projects
	cd backend && ./gradlew build
	cd frontend && npm run build

check: ## Type-check and compile without running
	cd backend && ./gradlew build
	cd frontend && npx tsc -b --noEmit

# --- Test ---

test: ## Run all tests
	cd backend && ./gradlew test
	cd services/ai-worker && pytest tests/ -v
	cd frontend && npx vitest run

test-backend: ## Run backend integration tests
	cd backend && ./gradlew test

test-ai-worker: ## Run AI worker tests
	cd services/ai-worker && pytest tests/ -v

test-frontend: ## Run frontend unit tests
	cd frontend && npx vitest run

test-frontend-e2e: ## Run frontend browser tests (Playwright + fake API)
	cd frontend && npm run test:e2e

test-frontend-watch: ## Run frontend tests in watch mode
	cd frontend && npx vitest

# --- Deploy ---

DEPLOY_STATE = deploy-state.json
COMMIT = $(shell git rev-parse --short HEAD)
TIMESTAMP = $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GCS_BUCKET = gs://shuukanhq.com
CLOUD_RUN_REGION = asia-east1
GCP_PROJECT_ID = kanji-masta
ARTIFACT_REGISTRY = asia-east1-docker.pkg.dev/kanji-masta
PHOTO_ANALYSIS_JOB = kanji-masta-photo-analysis
PHOTO_ANALYSIS_JOB_RESOURCE = projects/$(GCP_PROJECT_ID)/locations/$(CLOUD_RUN_REGION)/jobs/$(PHOTO_ANALYSIS_JOB)

_mark-deploy = python3 -c "import json; f=open('$(DEPLOY_STATE)'); d=json.load(f); f.close(); d['$(1)']={'commit':'$(COMMIT)','deployedAt':'$(TIMESTAMP)'}; f=open('$(DEPLOY_STATE)','w'); json.dump(d,f,indent=2); f.close(); print('  Marked $(1) deployed at $(COMMIT)')"

deploy-db: ## Apply pending Supabase migrations to production
	test -n "$(PROD_SUPABASE_DB_URI)"
	npx supabase db push --db-url "$(shell echo '$(PROD_SUPABASE_DB_URI)' | sed 's|^jdbc:||')" --include-all

deploy-frontend: ## Build + deploy frontend to GCS (Cloudflare CDN)
	cd frontend && npm run build
	gcloud storage rsync --recursive --delete-unmatched-destination-objects frontend/dist $(GCS_BUCKET)
	@$(call _mark-deploy,frontend)

deploy-backend: ## Build + deploy backend to Cloud Run
	cd backend && ./gradlew build
	docker build -t $(ARTIFACT_REGISTRY)/kanji-masta-backend/backend ./backend
	docker push $(ARTIFACT_REGISTRY)/kanji-masta-backend/backend
	$(eval AI_WORKER_SVC_URL := $(shell gcloud run services describe kanji-masta-ai-worker --region $(CLOUD_RUN_REGION) --format='value(status.url)' 2>/dev/null || echo 'http://NOT_DEPLOYED'))
	$(eval BACKEND_SVC_URL := $(shell gcloud run services describe kanji-masta-backend --region $(CLOUD_RUN_REGION) --format='value(status.url)' 2>/dev/null || echo 'http://NOT_DEPLOYED'))
	gcloud run deploy kanji-masta-backend \
		--image $(ARTIFACT_REGISTRY)/kanji-masta-backend/backend \
		--region $(CLOUD_RUN_REGION) \
		--set-env-vars "DATABASE_URL=$(PROD_SUPABASE_DB_URI),SUPABASE_URL=$(PROD_SUPABASE_URL),AI_WORKER_URL=$(AI_WORKER_SVC_URL),PHOTO_ANALYSIS_JOB=$(PHOTO_ANALYSIS_JOB_RESOURCE),CORS_ALLOWED_ORIGINS=shuukanhq.com,LOG_LEVEL=INFO,RESEND_API_KEY=$(RESEND_API_KEY),ADMIN_USER_ID=$(ADMIN_USER_ID),INTERNAL_API_KEY=$(INTERNAL_API_KEY),SELF_URL=$(BACKEND_SVC_URL)" \
		--allow-unauthenticated
	@$(call _mark-deploy,backend)

deploy-ai-worker: ## Build + deploy AI worker to Cloud Run
	docker build -t $(ARTIFACT_REGISTRY)/kanji-masta-ai-worker/ai-worker ./services/ai-worker
	docker push $(ARTIFACT_REGISTRY)/kanji-masta-ai-worker/ai-worker
	$(eval BACKEND_SVC_URL := $(shell gcloud run services describe kanji-masta-backend --region $(CLOUD_RUN_REGION) --format='value(status.url)'))
	$(eval BACKEND_SERVICE_ACCOUNT := $(shell gcloud run services describe kanji-masta-backend --region $(CLOUD_RUN_REGION) --format='value(spec.template.spec.serviceAccountName)'))
	gcloud run deploy kanji-masta-ai-worker \
		--image $(ARTIFACT_REGISTRY)/kanji-masta-ai-worker/ai-worker \
		--region $(CLOUD_RUN_REGION) \
		--set-env-vars "DATABASE_URL=$(shell echo '$(PROD_SUPABASE_DB_URI)' | sed 's|^jdbc:||'),AI_PROVIDER=$(AI_PROVIDER),GEMINI_API_KEY=$(GEMINI_API_KEY),OPENROUTER_API_KEY=$(OPENROUTER_API_KEY),OPENROUTER_MODEL=$(OPENROUTER_MODEL),OPENROUTER_REASONING_EFFORT=$(OPENROUTER_REASONING_EFFORT),OPENROUTER_ANALYZE_MODEL=$(OPENROUTER_ANALYZE_MODEL),OPENROUTER_QUIZ_MODEL=$(OPENROUTER_QUIZ_MODEL),OPENROUTER_DISCOVERY_MODEL=$(OPENROUTER_DISCOVERY_MODEL),OPENROUTER_SITE_URL=$(OPENROUTER_SITE_URL),OPENROUTER_APP_NAME=$(OPENROUTER_APP_NAME)" \
		--no-allow-unauthenticated
	test -n "$(BACKEND_SVC_URL)"
	test -n "$(BACKEND_SERVICE_ACCOUNT)"
	gcloud run jobs deploy $(PHOTO_ANALYSIS_JOB) \
		--image $(ARTIFACT_REGISTRY)/kanji-masta-ai-worker/ai-worker \
		--region $(CLOUD_RUN_REGION) \
		--command python \
		--args=-m,app.photo_job \
		--task-timeout=24h \
		--max-retries=1 \
		--set-env-vars "DATABASE_URL=$(shell echo '$(PROD_SUPABASE_DB_URI)' | sed 's|^jdbc:||'),BACKEND_CALLBACK_URL=$(BACKEND_SVC_URL)/api/internal/photo-result,INTERNAL_API_KEY=$(INTERNAL_API_KEY),AI_PROVIDER=$(AI_PROVIDER),GEMINI_API_KEY=$(GEMINI_API_KEY),OPENROUTER_API_KEY=$(OPENROUTER_API_KEY),OPENROUTER_MODEL=$(OPENROUTER_MODEL),OPENROUTER_REASONING_EFFORT=$(OPENROUTER_REASONING_EFFORT),OPENROUTER_ANALYZE_MODEL=$(OPENROUTER_ANALYZE_MODEL),OPENROUTER_SITE_URL=$(OPENROUTER_SITE_URL),OPENROUTER_APP_NAME=$(OPENROUTER_APP_NAME)"
	gcloud run jobs add-iam-policy-binding $(PHOTO_ANALYSIS_JOB) \
		--region $(CLOUD_RUN_REGION) \
		--member serviceAccount:$(BACKEND_SERVICE_ACCOUNT) \
		--role roles/run.developer
	@$(call _mark-deploy,ai-worker)

deploy-all: ## Deploy all services
	$(MAKE) deploy-db
	$(MAKE) deploy-ai-worker
	$(MAKE) deploy-backend
	$(MAKE) deploy-frontend

deploy-status: ## Show deployment state for all components
	@python3 -c "import json; d=json.load(open('deploy-state.json')); print(); [print(f'  {k:<14} {v.get(\"commit\",\"\") or \"never\":>8}  {v.get(\"deployedAt\",\"\") or \"-\"}') for k,v in d.items()]; print()"

# --- Utilities ---

db: ## Show key table counts
	@psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\
		SELECT 'photo_session' as tbl, count(*) FROM photo_session UNION ALL \
		SELECT 'user_kanji', count(*) FROM user_kanji UNION ALL \
		SELECT 'user_words', count(*) FROM user_words UNION ALL \
		SELECT 'quiz_bank', count(*) FROM quiz_bank UNION ALL \
		SELECT 'quiz_generation_job', count(*) FROM quiz_generation_job \
		ORDER BY tbl;"

reset-all: ## Reset ALL user data (back to zero state, keeps KanjiMaster)
	@psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\
		TRUNCATE quiz_serve, quiz_distractor, quiz_bank, quiz_generation_job, quiz_slot, user_kanji, user_words, photo_session CASCADE; \
		SELECT 'All user data cleared' as status;"

reset-quiz: ## Reset quiz progress (keep generated quizzes, reset familiarity/slots/serves)
	@psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\
		TRUNCATE quiz_serve, quiz_slot CASCADE; \
		UPDATE quiz_bank SET served_count = 0, served_at = NULL; \
		UPDATE quiz_distractor SET served_at = NULL; \
		UPDATE user_words SET familiarity = 0, current_tier = 'MEANING_RECALL', next_review = NULL; \
		SELECT count(*) as ready_quizzes FROM quiz_bank;"

trigger-quizzes: ## Trigger quiz generation manually (ai-worker must be running)
	curl -s -X POST http://localhost:5001/generate-quizzes | python3 -m json.tool

trigger-regen: ## Trigger regen check manually (ai-worker must be running)
	curl -s -X POST http://localhost:5001/cron/check-regen | python3 -m json.tool

trigger-cron: ## Trigger scheduled quiz generation cron (ai-worker must be running)
	curl -s -X POST http://localhost:5001/cron/generate-quizzes | python3 -m json.tool

psql: ## Connect to local Supabase PostgreSQL
	psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

seed: ## Seed KanjiMaster data into local DB
	cd scripts && python seed.py --file data/kanjidic2.xml --freq-limit 1500 --clear-and-persist

seed-quizzes: ## Generate quizzes for JLPT kanji (usage: make seed-quizzes JLPT=5 LIMIT=500)
	cd scripts && python seed_quizzes.py --file data/kanjidic2.xml --jlpt $(or $(JLPT),5) $(if $(LIMIT),--limit $(LIMIT)) --persist --resume

clean: ## Clean build artifacts
	cd backend && ./gradlew clean
	cd frontend && rm -rf dist node_modules/.vite

check-deploy: ## Show what needs deploying based on changes since last deploy
	@python3 scripts/check_deploy.py

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
