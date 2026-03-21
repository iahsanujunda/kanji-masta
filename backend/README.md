# Kanji Masta — Backend

Ktor backend for the Kanji Masta app. Connects to a local Supabase instance managed via the Supabase CLI.

## Prerequisites

- Java 21+
- Docker & Docker Compose
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Local Supabase

Start Supabase first — the backend depends on it for Postgres and Auth:

```bash
# From the project root
supabase start
```

This starts Postgres on port `54322` (default). Verify with `supabase status`.

## Run with Docker Compose

```bash
# From the project root
docker compose up --build
```

The backend starts on `http://localhost:8080`. It connects to your local Supabase Postgres via `host.docker.internal`.

Override defaults with environment variables or a `.env` file at the project root:

```
SUPABASE_DB_HOST=host.docker.internal
SUPABASE_DB_PORT=54322
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=postgres
CLAUDE_API_KEY=sk-ant-...
```

Health check:

```bash
curl http://localhost:8080/health
```

## Run without Docker

```bash
cd backend
./gradlew run
```

Uses config from `src/main/resources/application.yaml` with env var overrides.

## Tests

```bash
cd backend
./gradlew test
```

Test results are written to `build/reports/tests/test/index.html`.