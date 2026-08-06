# Kanji Masta testing guide

The repository has three test harnesses:

- Backend: JUnit 5, Ktor `testApplication`, MockK, Ktorm, and Testcontainers Postgres.
- Frontend components: Vitest, jsdom, and Testing Library.
- Frontend browser: Playwright Firefox with a deterministic fake API.

The SQL files in `supabase/migrations/` are the schema authority in production and tests. Backend persistence tests apply every migration, in order, to fresh Postgres. There is no handwritten test schema.

## Quick verification

```bash
make test                 # backend + frontend components
make test-backend         # Docker required
make test-frontend
make test-frontend-e2e    # starts fake API and Vite
```

Install Playwright Firefox once with `cd frontend && npx playwright install firefox`.

## Test pyramid and context loading

“Context” means a production boundary that must be assembled for the behavior under test: a route tree, service graph, database, browser, or external adapter. Use the smallest number of contexts that can disprove the behavior.

| Kind | Contexts loaded | Nature | How many are needed |
|---|---:|---|---|
| Pure unit | None | Parsing, mapping, scheduling rules, validation, provider response handling | One test per meaningful branch and boundary value; usually 3–8 per rule-bearing function |
| Isolated route/component | One | HTTP path/status/body/auth mapping, or one React page interaction state | One happy path plus each distinct public error/recovery contract; usually 2–5 per endpoint or interaction |
| Persistence/module integration | Two | Service/repository plus real migrated Postgres; constraints, transactions, ordering, idempotency, concurrency | One focused test per database guarantee; add a second only for a materially different failure/concurrent path |
| Full application | Many | Production composition, configuration, plugin wiring, startup | A small smoke set: normally 3–6 for the whole application, not per endpoint |
| Browser journey | Many | Browser, built UI, fake API, routing, responsive CSS, focus and motion | One critical happy journey plus essential recovery or responsive variants; normally 1–3 per user journey |

Do not target a test count in isolation. A behavior that is fully proved by four pure tests and one persistence test does not need a full-application duplicate. As the suite evolves, roughly 70–80% of tests should be pure or single-context, 15–25% persistence/module integration, and 5–10% full-application or browser journeys.

The August 2026 audit found the backend inverted: most endpoint tests booted the shared database and every hand-wired module. New coverage should therefore favor pure rules and isolated routes. Existing broad integration tests remain as a safety net while they are replaced by focused route and persistence tests; do not add more broad tests unless the production composition itself is the subject.

## Backend harness

### Production migrations and shared Postgres

[`TestPostgres.kt`](../backend/src/test/kotlin/com/kanjimasta/support/TestPostgres.kt) lazily starts one `postgres:16-alpine` container per test JVM. It creates the minimal Supabase-owned `auth` and `storage` objects referenced by migrations, then applies every file under `supabase/migrations/` in filename order.

[`ProductionSchemaIntegrationTest.kt`](../backend/src/test/kotlin/com/kanjimasta/ProductionSchemaIntegrationTest.kt) is the schema sentinel. It proves that a Phase 3 constraint exists in the test database; deleting or skipping that migration must make the test fail.

### Database isolation

Persistence tests extend [`PersistenceTest.kt`](../backend/src/test/kotlin/com/kanjimasta/support/PersistenceTest.kt). Before every test it discovers every table in `public` and executes `TRUNCATE ... RESTART IDENTITY CASCADE`.

Do not add a hard-coded cleanup list when a migration introduces a table. Tests deliberately commit rather than relying on rollback so that production transaction and concurrency boundaries are exercised.

### Isolated Ktor routes

[`IsolatedKtorTest.kt`](../backend/src/test/kotlin/com/kanjimasta/support/IsolatedKtorTest.kt) installs only serialization, deterministic bearer authentication, and the selected routes. Inject a mocked service and use it for path parsing, authentication, status, serialization, and command-result mapping. It does not start Docker.

Use [`QuizRoutesTest.kt`](../backend/src/test/kotlin/com/kanjimasta/modules/quiz/QuizRoutesTest.kt) as the reference. Keep business rules out of route tests.

### Persistence behavior

Use a service plus its real repository and migrated Postgres when correctness depends on:

- a unique/check/foreign-key constraint;
- row locking or an atomic update;
- idempotent retries or simultaneous commands;
- transaction rollback and committed state;
- database ordering or query selection.

[`QuizSessionBehaviorTest.kt`](../backend/src/test/kotlin/com/kanjimasta/modules/quiz/QuizSessionBehaviorTest.kt) covers the Phase 3 selection cap, ordered summary semantics, simultaneous starts, and simultaneous answers.

### Full production application

[`TestApp.kt`](../backend/src/test/kotlin/com/kanjimasta/support/TestApp.kt) runs the real `Application.module()` with the Testcontainers database and inert test configuration. Use it only when testing the production composition root. [`ProductionApplicationTest.kt`](../backend/src/test/kotlin/com/kanjimasta/ProductionApplicationTest.kt) is the current startup smoke test.

The older `testModule` harness is retained for broad integration coverage. Its HTTP client uses Ktor `MockEngine`; automated tests must never contact Cloud metadata, Resend, OpenRouter, or any paid provider.

### Kotlin AI-runtime coverage

AI execution is part of the backend Gradle project and uses the same persistence harness.
[`OpenRouterClientTest.kt`](../backend/src/test/kotlin/com/kanjimasta/core/ai/OpenRouterClientTest.kt)
covers provider request/response behavior with Ktor `MockEngine`.
[`PhotoAnalysisExecutorIntegrationTest.kt`](../backend/src/test/kotlin/com/kanjimasta/PhotoAnalysisExecutorIntegrationTest.kt),
[`QuizGenerationWorkerIntegrationTest.kt`](../backend/src/test/kotlin/com/kanjimasta/QuizGenerationWorkerIntegrationTest.kt),
and [`WordDiscoveryIntegrationTest.kt`](../backend/src/test/kotlin/com/kanjimasta/WordDiscoveryIntegrationTest.kt)
exercise the shared Ktorm persistence layer against migrated PostgreSQL.

[`LocalJobDispatchTest.kt`](../backend/src/test/kotlin/com/kanjimasta/core/jobs/LocalJobDispatchTest.kt)
proves the mandatory local dispatch boundary: authenticated request construction, role/environment
forwarding, accepted process starts, and explicit rejection when no worker process starts.

Use pure tests for JSON parsing, cost calculations, and request construction. Use migrated
PostgreSQL when claim fencing, direct result writes, attempt-level cost, or transactional
enqueueing is part of the behavior. MockEngine must terminate every OpenRouter or image request.

## Frontend tests

Vitest covers application state and semantics: loading, empty, success, error, retry, authoritative-conflict replacement, accessible controls, and query/mutation effects. Prefer role/name queries and `userEvent`.

Playwright covers facts jsdom cannot prove: responsive layout, actual routing, focus, browser timing, geometry, and motion. The suite starts [`fake-api.mjs`](../frontend/tests/e2e/fake-api.mjs) on port `18080` and Vite on `4173`; it does not require Ktor, Supabase, or OpenRouter.

When an API response or mutation contract changes, update the fake API in the same change. Keep browser journeys few, deterministic, and centered on user-visible outcomes.

## Adding or fixing behavior

1. Write the narrowest failing test that expresses the intended behavior.
2. Confirm that it fails for the intended reason.
3. Implement the behavior rather than weakening the assertion or production constraint.
4. Add a persistence test only when the database owns part of the guarantee.
5. Add a route/component test only when the public contract adds information.
6. Add a browser/full-app test only when narrower contexts cannot prove the requirement.
7. Run the focused test, then the owning stack, then `make test` for cross-stack changes.

For concurrent commands, assert both the returned outcomes and the single committed state. For time-sensitive rules, inject or bound time rather than sleeping. Any query whose result depends on first/last order must have an explicit `ORDER BY`.

## Focused commands

```bash
cd backend
./gradlew test --tests '*QuizRoutesTest*'
./gradlew test --tests '*QuizSessionBehaviorTest*simultaneous answers*'

cd frontend
npm run test:run -- src/pages/__tests__/Quiz.test.tsx
npm run test:e2e -- tests/e2e/home.spec.js
```
