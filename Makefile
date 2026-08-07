-include .env

# Accept Supabase's current server-secret naming while keeping the deployed runtime name stable.
PROD_SUPABASE_SERVICE_ROLE_KEY ?= $(PROD_SUPABASE_KEY)
export

OPENROUTER_SITE_URL ?= https://shuukanhq.com
OPENROUTER_APP_NAME ?= Kanji Masta
OPENROUTER_REASONING_EFFORT ?= medium

.PHONY: dev up down backend frontend seed clean build check \
	deploy deploy-db deploy-backend deploy-photo-job deploy-quiz-job deploy-kotlin-jobs \
	deploy-frontend deploy-all deploy-status publish-kotlin-image stage-kotlin-runtime \
	smoke smoke-production promote promote-kotlin-backend scheduler \
	pause-kotlin-schedulers deploy-scheduler-targets resume-kotlin-schedulers

# --- Local Development ---

dev: ## Start everything (Supabase + app stack via Docker Compose)
	@echo "Step 1: make supabase-start"
	@echo "Step 2: make up"
	@echo ""
	@echo "Or run services individually:"
	@echo "  make supabase-start  (database + auth + storage)"
	@echo "  make backend         (Ktor API + local Kotlin jobs)"
	@echo "  make frontend        (React dev server)"

up: ## Start app services via Docker Compose (run supabase-start first)
	docker compose up --build --remove-orphans

down: ## Stop app services
	docker compose down --remove-orphans

supabase-start: ## Start local Supabase (PostgreSQL on port 54322)
	npx supabase start
	npx supabase migration up --local

supabase-migrate: ## Apply pending migrations to the running local Supabase database
	npx supabase migration up --local

supabase-stop: ## Stop local Supabase
	npx supabase stop

supabase-reset: ## Reset Supabase DB (reapply migrations + seed)
	npx supabase db reset

backend: ## Start the Ktor API and mandatory local Job dispatcher as separate processes
	docker compose up --build --remove-orphans backend job-dispatcher

photo-job: ## Run one pending capture task by CAPTURE_TASK_ID using the shared Kotlin artifact
	cd backend && \
	DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
	OPENROUTER_API_KEY=$(OPENROUTER_API_KEY) \
	CAPTURE_TASK_ID=$(CAPTURE_TASK_ID) \
	./gradlew run --args=photo-job

quiz-job: ## Drain a bounded quiz batch using the shared Kotlin artifact
	cd backend && \
	DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
	OPENROUTER_API_KEY=$(OPENROUTER_API_KEY) \
	./gradlew run --args='quiz-job drain'

check-regen: ## Enqueue eligible distractor regeneration jobs
	cd backend && \
	DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
	OPENROUTER_API_KEY=$(OPENROUTER_API_KEY) \
	./gradlew run --args='quiz-job check-regen'

frontend: ## Start React dev server
	cd frontend && npm run dev

# --- Setup ---

setup: ## Install all dependencies
	cd frontend && npm install
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
	cd frontend && npx vitest run

test-backend: ## Run backend integration tests
	cd backend && ./gradlew test

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
PHOTO_ANALYSIS_JOB = photo-analysis-kotlin
QUIZ_GENERATION_JOB = quiz-generation-kotlin
PHOTO_ANALYSIS_JOB_RESOURCE = projects/$(GCP_PROJECT_ID)/locations/$(CLOUD_RUN_REGION)/jobs/$(PHOTO_ANALYSIS_JOB)
QUIZ_GENERATION_JOB_RESOURCE = projects/$(GCP_PROJECT_ID)/locations/$(CLOUD_RUN_REGION)/jobs/$(QUIZ_GENERATION_JOB)
BACKEND_IMAGE_REPOSITORY = $(ARTIFACT_REGISTRY)/kanji-masta-backend/backend
BACKEND_IMAGE = $(BACKEND_IMAGE_REPOSITORY):$(COMMIT)
KOTLIN_CANDIDATE_TAG ?= kotlin-candidate
SCHEDULER_LOCATION ?= asia-east1
GENERATE_QUIZZES_SCHEDULER ?= kanji-masta-generate-quizzes
CHECK_REGEN_SCHEDULER ?= kanji-masta-check-regen
SCHEDULER_SERVICE_ACCOUNT ?= 414186780678-compute@developer.gserviceaccount.com

_mark-deploy = python3 -c "import json; f=open('$(DEPLOY_STATE)'); d=json.load(f); f.close(); d['$(1)']={'commit':'$(COMMIT)','deployedAt':'$(TIMESTAMP)'}; f=open('$(DEPLOY_STATE)','w'); json.dump(d,f,indent=2); f.close(); print('  Marked $(1) deployed at $(COMMIT)')"

deploy-db: ## Apply pending Supabase migrations to production
	test -n "$(PROD_SUPABASE_DB_URI)"
	npx supabase db push --db-url "$(shell echo '$(PROD_SUPABASE_DB_URI)' | sed 's|^jdbc:||')" --include-all
	@$(call _mark-deploy,database)

deploy-frontend: ## Build + deploy frontend to GCS (Cloudflare CDN)
	cd frontend && npm run build
	gcloud storage rsync --recursive --delete-unmatched-destination-objects frontend/dist $(GCS_BUCKET)
	@$(call _mark-deploy,frontend)

publish-kotlin-image: ## Test, build, and push the shared Kotlin image under an immutable commit tag
	cd backend && ./gradlew build
	docker build -t $(BACKEND_IMAGE) ./backend
	docker push $(BACKEND_IMAGE)

deploy-photo-job: publish-kotlin-image ## Deploy only the Kotlin photo-analysis Cloud Run Job
	$(eval BACKEND_SERVICE_ACCOUNT := $(shell gcloud run services describe kanji-masta-backend --region $(CLOUD_RUN_REGION) --format='value(spec.template.spec.serviceAccountName)'))
	test -n "$(BACKEND_SERVICE_ACCOUNT)"
	test -n "$(PROD_SUPABASE_SERVICE_ROLE_KEY)"
	@image_digest=$$(gcloud artifacts docker images describe $(BACKEND_IMAGE) --format='value(image_summary.digest)'); \
		test -n "$$image_digest"; \
		image_ref="$(BACKEND_IMAGE_REPOSITORY)@$$image_digest"; \
		gcloud run jobs deploy $(PHOTO_ANALYSIS_JOB) \
		--image "$$image_ref" \
		--region $(CLOUD_RUN_REGION) \
		--args=photo-job \
		--task-timeout=24h \
		--max-retries=1 \
		--memory=1Gi \
		--set-env-vars "DATABASE_URL=$(PROD_SUPABASE_DB_URI),SUPABASE_URL=$(PROD_SUPABASE_URL),SUPABASE_SERVICE_ROLE_KEY=$(PROD_SUPABASE_SERVICE_ROLE_KEY),PHOTO_ANALYSIS_JOB=$(PHOTO_ANALYSIS_JOB_RESOURCE),OPENROUTER_API_KEY=$(OPENROUTER_API_KEY),OPENROUTER_REASONING_EFFORT=$(OPENROUTER_REASONING_EFFORT),OPENROUTER_SITE_URL=$(OPENROUTER_SITE_URL),OPENROUTER_APP_NAME=$(OPENROUTER_APP_NAME),OPENROUTER_TIMEOUT_SECONDS=600,HIKARI_MAX_POOL_SIZE=5,JOB_LEASE_SECONDS=1500,PHOTO_MAX_IMAGE_BYTES=10485760,JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=55 -XX:MaxDirectMemorySize=128m -XX:+ExitOnOutOfMemoryError"
	gcloud run jobs add-iam-policy-binding $(PHOTO_ANALYSIS_JOB) --region $(CLOUD_RUN_REGION) --member serviceAccount:$(BACKEND_SERVICE_ACCOUNT) --role roles/run.developer
	@$(call _mark-deploy,photo-job)

deploy-quiz-job: publish-kotlin-image ## Deploy only the Kotlin quiz-generation Cloud Run Job
	$(eval BACKEND_SERVICE_ACCOUNT := $(shell gcloud run services describe kanji-masta-backend --region $(CLOUD_RUN_REGION) --format='value(spec.template.spec.serviceAccountName)'))
	test -n "$(BACKEND_SERVICE_ACCOUNT)"
	@image_digest=$$(gcloud artifacts docker images describe $(BACKEND_IMAGE) --format='value(image_summary.digest)'); \
		test -n "$$image_digest"; \
		image_ref="$(BACKEND_IMAGE_REPOSITORY)@$$image_digest"; \
		gcloud run jobs deploy $(QUIZ_GENERATION_JOB) \
		--image "$$image_ref" \
		--region $(CLOUD_RUN_REGION) \
		--args=quiz-job,drain \
		--task-timeout=30m \
		--max-retries=1 \
		--memory=512Mi \
		--set-env-vars "DATABASE_URL=$(PROD_SUPABASE_DB_URI),OPENROUTER_API_KEY=$(OPENROUTER_API_KEY),OPENROUTER_REASONING_EFFORT=$(OPENROUTER_REASONING_EFFORT),OPENROUTER_SITE_URL=$(OPENROUTER_SITE_URL),OPENROUTER_APP_NAME=$(OPENROUTER_APP_NAME),HIKARI_MAX_POOL_SIZE=5,JOB_LEASE_SECONDS=300,QUIZ_JOB_BATCH_SIZE=10,JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=55 -XX:MaxDirectMemorySize=64m -XX:+ExitOnOutOfMemoryError"
	gcloud run jobs add-iam-policy-binding $(QUIZ_GENERATION_JOB) --region $(CLOUD_RUN_REGION) --member serviceAccount:$(BACKEND_SERVICE_ACCOUNT) --role roles/run.developer
	@$(call _mark-deploy,quiz-job)

deploy-kotlin-jobs: deploy-photo-job deploy-quiz-job ## Deploy both Kotlin Cloud Run Jobs without changing schedulers
	@$(call _mark-deploy,kotlin-jobs)

deploy-backend: publish-kotlin-image ## Deploy a tagged Kotlin backend revision with no production traffic
	test -n "$(PROD_SUPABASE_SERVICE_ROLE_KEY)"
	@image_digest=$$(gcloud artifacts docker images describe $(BACKEND_IMAGE) --format='value(image_summary.digest)'); \
		test -n "$$image_digest"; \
		image_ref="$(BACKEND_IMAGE_REPOSITORY)@$$image_digest"; \
		gcloud run deploy kanji-masta-backend \
		--image "$$image_ref" \
		--region $(CLOUD_RUN_REGION) \
		--args=web \
		--tag=$(KOTLIN_CANDIDATE_TAG) \
		--no-traffic \
		--memory=1Gi \
		--set-env-vars "DATABASE_URL=$(PROD_SUPABASE_DB_URI),SUPABASE_URL=$(PROD_SUPABASE_URL),SUPABASE_SERVICE_ROLE_KEY=$(PROD_SUPABASE_SERVICE_ROLE_KEY),PHOTO_ANALYSIS_JOB=$(PHOTO_ANALYSIS_JOB_RESOURCE),QUIZ_GENERATION_JOB=$(QUIZ_GENERATION_JOB_RESOURCE),CORS_ALLOWED_ORIGINS=shuukanhq.com,LOG_LEVEL=INFO,RESEND_API_KEY=$(RESEND_API_KEY),ADMIN_USER_ID=$(ADMIN_USER_ID),INTERNAL_API_KEY=$(INTERNAL_API_KEY),OPENROUTER_API_KEY=$(OPENROUTER_API_KEY),OPENROUTER_REASONING_EFFORT=$(OPENROUTER_REASONING_EFFORT),OPENROUTER_SITE_URL=$(OPENROUTER_SITE_URL),OPENROUTER_APP_NAME=$(OPENROUTER_APP_NAME),HIKARI_MAX_POOL_SIZE=7,JOB_LEASE_SECONDS=300,QUIZ_JOB_BATCH_SIZE=10,PHOTO_MAX_IMAGE_BYTES=10485760,JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=55 -XX:MaxDirectMemorySize=128m -XX:+ExitOnOutOfMemoryError" \
		--allow-unauthenticated
	@$(call _mark-deploy,backend-candidate)

promote-kotlin-backend: ## Route production traffic to the verified tagged Kotlin revision
	gcloud run services update-traffic kanji-masta-backend \
		--region $(CLOUD_RUN_REGION) \
		--to-tags=$(KOTLIN_CANDIDATE_TAG)=100
	@$(call _mark-deploy,backend)

pause-kotlin-schedulers: ## Pause both Kotlin quiz scheduler triggers
	gcloud scheduler jobs pause $(GENERATE_QUIZZES_SCHEDULER) --location $(SCHEDULER_LOCATION)
	gcloud scheduler jobs pause $(CHECK_REGEN_SCHEDULER) --location $(SCHEDULER_LOCATION)

deploy-scheduler-targets: ## Pause and retarget quiz schedulers to the Kotlin Job; leaves them paused
	$(MAKE) pause-kotlin-schedulers
	gcloud scheduler jobs update http $(GENERATE_QUIZZES_SCHEDULER) \
		--location $(SCHEDULER_LOCATION) \
		--uri "https://run.googleapis.com/v2/$(QUIZ_GENERATION_JOB_RESOURCE):run" \
		--http-method POST \
		--oauth-service-account-email "$(SCHEDULER_SERVICE_ACCOUNT)" \
		--update-headers Content-Type=application/json \
		--message-body '{}'
	gcloud scheduler jobs update http $(CHECK_REGEN_SCHEDULER) \
		--location $(SCHEDULER_LOCATION) \
		--uri "https://run.googleapis.com/v2/$(QUIZ_GENERATION_JOB_RESOURCE):run" \
		--http-method POST \
		--oauth-service-account-email "$(SCHEDULER_SERVICE_ACCOUNT)" \
		--update-headers Content-Type=application/json \
		--message-body '{"overrides":{"containerOverrides":[{"args":["quiz-job","check-regen"]}]}}'

resume-kotlin-schedulers: ## Resume both verified Kotlin quiz scheduler targets
	gcloud scheduler jobs resume $(GENERATE_QUIZZES_SCHEDULER) --location $(SCHEDULER_LOCATION)
	gcloud scheduler jobs resume $(CHECK_REGEN_SCHEDULER) --location $(SCHEDULER_LOCATION)

smoke-production: ## Check the tagged backend health endpoint; candidate URL is discovered automatically
	@candidate_url="$(BACKEND_CANDIDATE_URL)"; \
		if [ -z "$$candidate_url" ]; then \
			candidate_url=$$(gcloud run services describe kanji-masta-backend --region $(CLOUD_RUN_REGION) --format='value(status.traffic.url)'); \
		fi; \
		test -n "$$candidate_url"; \
		echo "Checking $$candidate_url/health"; \
		curl --fail --silent --show-error "$$candidate_url/health"; \
		echo

# Unified action + component interface. The explicit targets above remain available for
# scripts and rollback procedures.
deploy: ## Deploy one component (COMPONENT=db|backend|photo-job|quiz-job|workers|frontend|all)
	@case "$(COMPONENT)" in \
		db) $(MAKE) deploy-db ;; \
		backend) $(MAKE) deploy-backend ;; \
		photo-job) $(MAKE) deploy-photo-job ;; \
		quiz-job) $(MAKE) deploy-quiz-job ;; \
		workers) $(MAKE) deploy-kotlin-jobs ;; \
		frontend) $(MAKE) deploy-frontend ;; \
		all) $(MAKE) deploy-all ;; \
		*) echo "COMPONENT must be one of: db, backend, photo-job, quiz-job, workers, frontend, all"; exit 2 ;; \
	esac

smoke: ## Smoke-test one component (currently COMPONENT=backend)
	@case "$(COMPONENT)" in \
		backend) $(MAKE) smoke-production ;; \
		*) echo "COMPONENT must be: backend"; exit 2 ;; \
	esac

promote: ## Promote one staged component (currently COMPONENT=backend)
	@case "$(COMPONENT)" in \
		backend) $(MAKE) promote-kotlin-backend ;; \
		*) echo "COMPONENT must be: backend"; exit 2 ;; \
	esac

scheduler: ## Operate quiz schedules (ACTION=pause|retarget|resume)
	@case "$(ACTION)" in \
		pause) $(MAKE) pause-kotlin-schedulers ;; \
		retarget) $(MAKE) deploy-scheduler-targets ;; \
		resume) $(MAKE) resume-kotlin-schedulers ;; \
		*) echo "ACTION must be one of: pause, retarget, resume"; exit 2 ;; \
	esac

stage-kotlin-runtime: deploy-kotlin-jobs deploy-backend ## Build once and stage Jobs plus a no-traffic API revision

deploy-all: ## Apply DB changes and stage Kotlin Jobs/backend plus frontend; does not promote traffic
	$(MAKE) deploy-db
	$(MAKE) stage-kotlin-runtime
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

trigger-quizzes: quiz-job ## Alias for running the Kotlin quiz drainer

trigger-regen: check-regen ## Alias for the Kotlin regeneration eligibility pass

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
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
