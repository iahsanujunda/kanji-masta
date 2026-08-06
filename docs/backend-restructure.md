# Backend Restructure: Abolish `core/`, Flatten Packages, Co-locate Tests

Status: **done** (2026-08-06) — executed on branch `refactor/abolish-core`, one commit per phase.

## Objective

Restructure `backend/src` so that:

1. There is no `core/` or `modules/` package. Every package sits directly under
   `com.kanjimasta` (feature packages + a few small shared capability packages).
2. Each database table definition lives in the feature or shared-capability package with the
   strongest **domain affinity**, instead of one central `Tables.kt`. This placement is for
   navigation only; it does not establish exclusive read/write ownership.
3. AI prompts live with the feature that uses them; `ai/` contains only provider mechanics.
4. Tests live in the same package as the unit they test (household-assistant style),
   with cross-feature journey tests at the package root and shared harness in `support/`.
5. An architecture test suite enforces package placement and cross-feature behaviour-import
   boundaries so the structure cannot silently rot.

This is a **pure refactor**. No behavior changes, no schema changes, no config changes,
and no dependency changes; Phase 5 adds test source only. The fat JAR entry
point (`com.kanjimasta.MainKt`) and Ktor module reference
(`com.kanjimasta.ApplicationKt.module` in `application.yaml`) do not change because
`Main.kt` and `Application.kt` stay in the root package.

### Explicit non-goal: data-asset modularization

This refactor does **not** modularize database ownership. Existing transactional workflows
intentionally write across the package where a table definition is placed: quiz updates kanji
progress, settings accepts invites, admin/internal recover photo and quiz jobs, and the AI
executors write shared attempts and costs. Preserve those writes exactly.

Moving cross-feature writes behind owner ports/repositories, defining read/write owners, and
enforcing data-asset boundaries belongs to a later dedicated modularization refactor. In this
document, “table placement” means only where the Ktorm mapping declaration is easiest to find.

## Reference projects

- `/home/junda/workspaces/household-assistant/ktor` — same stack (Ktor). Flat feature
  packages under `me.gpipi.*`, app plumbing as single root-level files, tests mirroring
  main packages, shared test harness in `support/`. This is the layout template.
- `/home/junda/workspaces/jepangpg/spring` — larger Spring app. Its `arch/` test package
  enforces module boundaries in CI. This is the guardrail template.

## Target structure

```
backend/src/main/kotlin/com/kanjimasta/
├── Main.kt                      # unchanged location
├── Application.kt               # unchanged location (composition root)
├── AiRuntime.kt                 # unchanged location (job-side composition root)
├── Routing.kt                   # was core/plugins/Routing.kt
├── Cors.kt                      # was core/plugins/Cors.kt
├── Observability.kt             # was core/plugins/Observability.kt
├── Serialization.kt             # was core/plugins/Serialization.kt
├── db/                          # persistence infrastructure ONLY (no table definitions)
│   ├── DatabaseConfig.kt
│   └── PgTypes.kt
├── auth/                        # Auth.kt, CloudRunAuth.kt
├── ai/                          # OpenRouter mechanics + primary home of model/cost mappings
│   ├── OpenRouterClient.kt, OpenRouterCatalogClient.kt, ModelCatalogGateway.kt
│   ├── AiModels.kt, AiModelConfigRepository.kt
│   └── AiTables.kt              # AiModelConfigTable, UserCostTable
├── jobs/                        # dispatchers + primary home of JobAttemptTable
├── kanji/                       # feature + KanjiTables.kt + WordDiscoveryPrompts.kt
├── photo/                       # feature + PhotoTables.kt + PhotoSessionState.kt +
│                                #   SupabaseStorageSigner.kt + PhotoPrompts.kt
├── quiz/                        # feature + QuizTables.kt
│   └── generation/              # was modules/worker/ + QuizGenerationTables.kt + prompts
├── user/                        # feature (owns no tables)
├── settings/                    # feature + SettingsTables.kt
├── invite/                      # feature + InviteTables.kt + ResendClient.kt
├── admin/                       # control plane; existing cross-domain reads/writes stay intact
└── internal/                    # legacy callbacks/cleanup; existing cross-domain writes stay intact
```

## Rules for the executor

- Work on a branch: `git checkout -b refactor/abolish-core`.
- **One commit per phase**, message given at the end of each phase. Conventional Commits
  (`refactor:` / `test:` / `docs:`), header ≤ 100 chars.
- **Do not commit `deploy-state.json`** — it has unrelated local modifications.
- Every command block starts from the repository root. Run
  `cd "$(git rev-parse --show-toplevel)"` before its commands; do not rely on the previous
  block's working directory.
- After every phase, run the verification commands given for the phase. Do not start the
  next phase until the current one is green.
- Apply the explicit import changes in each phase before compiling. If an unresolved import
  remains, look up the symbol in the Phase 1 rename map or Phase 2 import manifest. Do not
  move production code or change behaviour to make an import resolve.
- Never edit method bodies, SQL, prompts text, config values, or `supabase/` files.
  The only allowed edits are: file moves, `package` lines, `import` lines, splitting a
  file into several files (cut/paste of whole declarations, including the test-fixture
  declarations explicitly named in Phase 4), and the new files this doc tells you to create.

Verification commands (used repeatedly, defined once here):

```bash
# Quick: does it compile?
cd "$(git rev-parse --show-toplevel)"
(cd backend && ./gradlew compileKotlin compileTestKotlin)

# Full: do tests pass? (Testcontainers; no Supabase needed) — run from repo root
make test-backend
```

Run the full baseline before touching anything:

```bash
cd "$(git rev-parse --show-toplevel)"
make test-backend    # must pass; record the result. If it fails, STOP and report.
```

---

## Phase 1 — Flatten packages (pure moves + renames)

Goal: `core/` and `modules/` disappear. Nothing else changes.

### 1a. Move main-source directories

```bash
cd "$(git rev-parse --show-toplevel)"
cd backend/src/main/kotlin/com/kanjimasta

# Feature modules come up to the root package
git mv modules/kanji kanji
git mv modules/quiz quiz
git mv modules/photo photo
git mv modules/user user
git mv modules/settings settings
git mv modules/invite invite
git mv modules/admin admin
git mv modules/internal internal
mkdir quiz/generation
git mv modules/worker/QuizGenerationWorker.kt quiz/generation/
git mv modules/worker/QuizGenerationRepository.kt quiz/generation/
rmdir modules/worker modules

# core/ contents get real homes
git mv core/ai ai
git mv core/auth auth
git mv core/jobs jobs
git mv core/email/ResendClient.kt invite/          # single consumer: invite
git mv core/storage/SupabaseStorageSigner.kt photo/ # single consumer: photo
git mv core/db/PhotoSessionState.kt photo/          # photo domain, not db infra
git mv core/db db
git mv core/plugins/Cors.kt core/plugins/Observability.kt \
       core/plugins/Serialization.kt core/plugins/Routing.kt .
rmdir core/email core/storage core/plugins
rmdir core/client core/config    # empty dumping-ground dirs; delete
rmdir core
```

### 1b. Move test-source directories

```bash
cd "$(git rev-parse --show-toplevel)"
cd backend/src/test/kotlin/com/kanjimasta

git mv core/ai ai
git mv core/jobs jobs
git mv core/db db
mkdir photo
git mv core/storage/SupabaseStorageSignerTest.kt photo/
rmdir core/storage core
git mv modules/quiz quiz
rmdir modules
```

`support/` stays where it is. Root-level `*IntegrationTest.kt` files are handled in
Phase 4 — leave them at the root for now.

### 1c. Rewrite `package` and `import` lines

Package rename map (old → new). Apply to **every `.kt` file under `backend/src`**
(main and test). Order matters: run the replacements top to bottom, because the first
two are more specific than the later `core.db` rule.

| # | Old | New |
|---|-----|-----|
| 1 | `com.kanjimasta.core.db.PhotoSessionStatus` | `com.kanjimasta.photo.PhotoSessionStatus` |
| 2 | `com.kanjimasta.core.db.PhotoFailureCode` | `com.kanjimasta.photo.PhotoFailureCode` |
| 3 | `com.kanjimasta.core.ai` | `com.kanjimasta.ai` |
| 4 | `com.kanjimasta.core.auth` | `com.kanjimasta.auth` |
| 5 | `com.kanjimasta.core.db` | `com.kanjimasta.db` |
| 6 | `com.kanjimasta.core.email` | `com.kanjimasta.invite` |
| 7 | `com.kanjimasta.core.jobs` | `com.kanjimasta.jobs` |
| 8 | `com.kanjimasta.core.storage` | `com.kanjimasta.photo` |
| 9 | `com.kanjimasta.core.plugins` | `com.kanjimasta` |
| 10 | `com.kanjimasta.modules.worker` | `com.kanjimasta.quiz.generation` |
| 11 | `com.kanjimasta.modules` | `com.kanjimasta` |

```bash
cd "$(git rev-parse --show-toplevel)"
cd backend/src
for pair in \
  'com\.kanjimasta\.core\.db\.PhotoSessionStatus=com.kanjimasta.photo.PhotoSessionStatus' \
  'com\.kanjimasta\.core\.db\.PhotoFailureCode=com.kanjimasta.photo.PhotoFailureCode' \
  'com\.kanjimasta\.core\.ai=com.kanjimasta.ai' \
  'com\.kanjimasta\.core\.auth=com.kanjimasta.auth' \
  'com\.kanjimasta\.core\.db=com.kanjimasta.db' \
  'com\.kanjimasta\.core\.email=com.kanjimasta.invite' \
  'com\.kanjimasta\.core\.jobs=com.kanjimasta.jobs' \
  'com\.kanjimasta\.core\.storage=com.kanjimasta.photo' \
  'com\.kanjimasta\.core\.plugins=com.kanjimasta' \
  'com\.kanjimasta\.modules\.worker=com.kanjimasta.quiz.generation' \
  'com\.kanjimasta\.modules=com.kanjimasta' \
; do
  old="${pair%%=*}"; new="${pair#*=}"
  grep -rl "$old" . --include='*.kt' | xargs -r sed -i "s/$old/$new/g"
done
```

### 1d. Manual fixes the sed cannot do

1. `photo/PhotoSessionState.kt` — its package line is now `package com.kanjimasta.db`
   (rule 5 rewrote it) but the file lives in `photo/`. Change the first line to
   `package com.kanjimasta.photo`.
2. `invite/ResendClient.kt`, `photo/SupabaseStorageSigner.kt`, and the four moved
   plugin files (`Cors.kt`, `Observability.kt`, `Serialization.kt`, `Routing.kt`) —
   confirm each file's `package` line matches its new directory
   (`com.kanjimasta.invite`, `com.kanjimasta.photo`, `com.kanjimasta`). The sed rules
   should have handled them; fix any that are wrong.
3. Kotlin allows redundant same-package imports (e.g. `Application.kt` may now contain
   `import com.kanjimasta.configureCors`). These compile fine — leave them, or delete
   them if the compiler warns.
4. `internal/InternalService.kt` used `core.db.*`, so the two photo-state declarations
   moved out from under its wildcard. Add these exact imports:

   ```kotlin
   import com.kanjimasta.photo.PhotoFailureCode
   import com.kanjimasta.photo.PhotoSessionStatus
   ```

5. `InternalIntegrationTest.kt` also used `core.db.*`. Add this exact import while the
   test is still at the root; Phase 4 moves the file later:

   ```kotlin
   import com.kanjimasta.photo.PhotoFailureCode
   ```

### 1e. Verify and commit

```bash
cd "$(git rev-parse --show-toplevel)"
(cd backend && ./gradlew compileKotlin compileTestKotlin)
make test-backend
git add backend/src
git diff --cached --name-only
git commit -m "refactor: flatten backend packages, abolish core/ and modules/"
```

---

## Phase 2 — Split `db/Tables.kt` by domain placement

Goal: `db/` contains only infrastructure (`DatabaseConfig.kt`, `PgTypes.kt`). Every
table object and enum moves to its primary domain/capability package for navigation.
This phase does not change or restrict which repositories read or write a table.

### Placement map

Create each destination file with the listed `package` line, then **cut** (not copy) the
listed declarations out of `db/Tables.kt` into it. Use this import block in every new table
file; an unused wildcard in a file without a custom PG type is acceptable in this mechanical
refactor:

```kotlin
import com.kanjimasta.db.*
import org.ktorm.schema.*
```

| New file | Package | Declarations to move |
|----------|---------|----------------------|
| `kanji/KanjiTables.kt` | `com.kanjimasta.kanji` | `KanjiMasterTable`, `WordMasterTable`, `UserKanjiTable`, `UserWordsTable`, `enum UserKanjiStatus`, `enum WordSource` |
| `photo/PhotoTables.kt` | `com.kanjimasta.photo` | `PhotoSessionTable`, `UserPhotoActivityStateTable` |
| `quiz/QuizTables.kt` | `com.kanjimasta.quiz` | `QuizBankTable`, `QuizDistractorTable`, `QuizSlotTable`, `QuizServeTable`, `QuizSessionCardTable`, `ChallengeSessionTable`, `enum QuizType`, `enum QuizSlotStatus`, `enum SessionCardType`, `enum SessionCardStatus`, `enum IntroductionKind`, `enum DistractorTrigger` |
| `quiz/generation/QuizGenerationTables.kt` | `com.kanjimasta.quiz.generation` | `QuizGenerationJobTable`, `enum JobType`, `enum JobStatus` |
| `jobs/JobTables.kt` | `com.kanjimasta.jobs` | `JobAttemptTable` |
| `ai/AiTables.kt` | `com.kanjimasta.ai` | `AiModelConfigTable`, `UserCostTable` |
| `invite/InviteTables.kt` | `com.kanjimasta.invite` | `UserInviteTable`, `enum InviteStatus` |
| `settings/SettingsTables.kt` | `com.kanjimasta.settings` | `UserSettingsTable` |

Notes:

- `UserCostTable` goes to `ai/` because it is the AI-spend ledger. Photo execution, quiz
  generation, and the transitional internal callback path write it; admin reads it. This is
  placement by capability, not exclusive ownership.
- `ChallengeSessionTable` has **zero usages** outside `Tables.kt`. Move it to
  `quiz/QuizTables.kt` and add the comment `// unused as of 2026-08; kept to match live schema` above it.
- Enums used across features (e.g. `QuizType` referenced by `kanji/KanjiTables.kt`
  columns) are imported from their placement package. Cross-package table/enum imports
  may be used by existing reads **and writes**; data-asset ownership is a later refactor.
- Because `UserKanjiTable` and `UserWordsTable` use `QuizType`, add
  `import com.kanjimasta.quiz.QuizType` to `kanji/KanjiTables.kt`.
- When `Tables.kt` is empty, delete it: `git rm backend/src/main/kotlin/com/kanjimasta/db/Tables.kt`.

### Fix the importers

Files that used explicit imports (`import com.kanjimasta.db.QuizSlotTable` etc.):
rewrite each to the placement package per the map (`import com.kanjimasta.quiz.QuizSlotTable`).

Apply those explicit-import rewrites mechanically before handling wildcard files:

```bash
cd "$(git rev-parse --show-toplevel)"
for pair in \
  'AiModelConfigTable=com.kanjimasta.ai' \
  'UserCostTable=com.kanjimasta.ai' \
  'JobAttemptTable=com.kanjimasta.jobs' \
  'KanjiMasterTable=com.kanjimasta.kanji' \
  'WordMasterTable=com.kanjimasta.kanji' \
  'UserKanjiTable=com.kanjimasta.kanji' \
  'UserWordsTable=com.kanjimasta.kanji' \
  'UserKanjiStatus=com.kanjimasta.kanji' \
  'WordSource=com.kanjimasta.kanji' \
  'PhotoSessionTable=com.kanjimasta.photo' \
  'UserPhotoActivityStateTable=com.kanjimasta.photo' \
  'QuizBankTable=com.kanjimasta.quiz' \
  'QuizDistractorTable=com.kanjimasta.quiz' \
  'QuizSlotTable=com.kanjimasta.quiz' \
  'QuizServeTable=com.kanjimasta.quiz' \
  'QuizSessionCardTable=com.kanjimasta.quiz' \
  'ChallengeSessionTable=com.kanjimasta.quiz' \
  'QuizType=com.kanjimasta.quiz' \
  'QuizSlotStatus=com.kanjimasta.quiz' \
  'SessionCardType=com.kanjimasta.quiz' \
  'SessionCardStatus=com.kanjimasta.quiz' \
  'IntroductionKind=com.kanjimasta.quiz' \
  'DistractorTrigger=com.kanjimasta.quiz' \
  'QuizGenerationJobTable=com.kanjimasta.quiz.generation' \
  'JobType=com.kanjimasta.quiz.generation' \
  'JobStatus=com.kanjimasta.quiz.generation' \
  'UserInviteTable=com.kanjimasta.invite' \
  'InviteStatus=com.kanjimasta.invite' \
  'UserSettingsTable=com.kanjimasta.settings' \
; do
  symbol="${pair%%=*}"
  package="${pair#*=}"
  old="com.kanjimasta.db.$symbol"
  rg -l -F "$old" backend/src -g '*.kt' | xargs -r sed -i "s/com\\.kanjimasta\\.db\\.$symbol/$package.$symbol/g"
done
```

Files that used `import com.kanjimasta.db.*` can no longer obtain table declarations from
that wildcard. Remove that wildcard from every file below and add the exact imports shown.
Do not derive a different package from who currently writes the table; use the placement
map above.

#### Main-source wildcard replacements

`kanji/KanjiRepository.kt`:

```kotlin
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizType
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

`kanji/WordDiscoveryService.kt`:

```kotlin
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

`quiz/QuizRepository.kt`:

```kotlin
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserKanjiTable
import com.kanjimasta.kanji.UserWordsTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.settings.UserSettingsTable
```

`quiz/generation/QuizGenerationRepository.kt`:

```kotlin
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserKanjiTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.quiz.DistractorTrigger
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.QuizType
```

`admin/AdminRepository.kt`:

```kotlin
import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

`internal/InternalService.kt`:

```kotlin
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.quiz.DistractorTrigger
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.QuizType
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

Keep the two explicit photo-state imports added in Phase 1.

#### Test-source wildcard replacements

These files are still at `backend/src/test/kotlin/com/kanjimasta/` during Phase 2.

`AddKanjiIntegrationTest.kt`:

```kotlin
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserKanjiTable
import com.kanjimasta.kanji.UserWordsTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizType
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

`WordDiscoveryIntegrationTest.kt`:

```kotlin
import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserWordsTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

`OnboardingIntegrationTest.kt`:

```kotlin
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserKanjiTable
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
import com.kanjimasta.settings.UserSettingsTable
```

`WordsIntegrationTest.kt`:

```kotlin
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserWordsTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.kanji.WordSource
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizType
```

`QuizIntegrationTest.kt`:

```kotlin
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserWordsTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.kanji.WordSource
import com.kanjimasta.quiz.DistractorTrigger
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.QuizServeTable
import com.kanjimasta.quiz.QuizSessionCardTable
import com.kanjimasta.quiz.QuizSlotTable
import com.kanjimasta.quiz.QuizType
```

`PhotoAnalysisExecutorIntegrationTest.kt`:

```kotlin
import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.photo.PhotoSessionTable
```

`QuizGenerationWorkerIntegrationTest.kt`:

```kotlin
import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.QuizType
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

`InternalIntegrationTest.kt`:

```kotlin
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.quiz.DistractorTrigger
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.QuizType
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
```

Keep its explicit `PhotoFailureCode` import from Phase 1. Files that already used explicit
`com.kanjimasta.db.Xxx` imports are handled mechanically by the placement map; do not add a
second import for those symbols.

### Verify and commit

```bash
cd "$(git rev-parse --show-toplevel)"
(cd backend && ./gradlew compileKotlin compileTestKotlin)
make test-backend
git add backend/src
git diff --cached --name-only
git commit -m "refactor: place table definitions with their primary domains"
```

---

## Phase 3 — Split `ai/AiPrompts.kt` to its consumers

Goal: `ai/` keeps provider mechanics only; prompt text lives with the feature that owns
the workflow.

`ai/AiPrompts.kt` is one object with four string constants. Split it:

| New file | Package | Object name | Constants moved (text unchanged, byte for byte) |
|----------|---------|-------------|------------------------------------------------|
| `photo/PhotoPrompts.kt` | `com.kanjimasta.photo` | `object PhotoPrompts` | `PHOTO_ANALYSIS` |
| `quiz/generation/QuizGenerationPrompts.kt` | `com.kanjimasta.quiz.generation` | `object QuizGenerationPrompts` | `QUIZ_GENERATION`, `DISTRACTOR_REGENERATION` |
| `kanji/WordDiscoveryPrompts.kt` | `com.kanjimasta.kanji` | `object WordDiscoveryPrompts` | `WORD_DISCOVERY` |

Cut each complete constant/property declaration, including its existing string literal, into
the destination object. Do not retype, reformat, reindent, or otherwise edit text inside a
prompt string.

Then update the (three) files that import `AiPrompts`: replace
`AiPrompts.PHOTO_ANALYSIS` → `PhotoPrompts.PHOTO_ANALYSIS`, and so on, matching each
constant to its new object. Delete `ai/AiPrompts.kt` when empty.

```bash
cd "$(git rev-parse --show-toplevel)"
(cd backend && ./gradlew compileKotlin compileTestKotlin)
make test-backend
git add backend/src
git diff --cached --name-only
git commit -m "refactor: move AI prompts to the features that own them"
```

---

## Phase 4 — Move tests next to their subjects

Goal: household-assistant layout — each test in the package of the unit it exercises.

### 4a. Extract the shared integration-test harness

The shared fixtures currently live in `ApplicationTest.kt` only because all integration tests
were once in `com.kanjimasta`. Moving those tests without first extracting the fixtures causes
unresolved references to `TestDatabase`, `testModule`, `jsonClient`, and `TEST_USER_ID`.

Create `backend/src/test/kotlin/com/kanjimasta/support/IntegrationTestSupport.kt` with package
`com.kanjimasta.support`. Cut these **whole declarations, bodies unchanged**, from
`ApplicationTest.kt` into that file:

- `TEST_USER_ID`
- `TEST_USER_EMAIL`
- `TestDatabase`
- the private `testLogger`
- `Application.testModule(...)`
- `ApplicationTestBuilder.jsonClient()`

Use this exact import block in the new support file after Phases 1–3:

```kotlin
import com.kanjimasta.ai.ModelCatalogGateway
import com.kanjimasta.ai.UnavailableModelCatalogGateway
import com.kanjimasta.auth.AuthUser
import com.kanjimasta.configureRouting
import com.kanjimasta.configureSerialization
import com.kanjimasta.jobs.JobDispatcher
import com.kanjimasta.kanji.KanjiRepository
import com.kanjimasta.kanji.KanjiService
import com.kanjimasta.photo.PhotoRepository
import com.kanjimasta.photo.PhotoService
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.response.*
import io.ktor.server.testing.*
import org.ktorm.database.Database
import org.slf4j.LoggerFactory
```

`TestPostgres` needs no import because it is already in `com.kanjimasta.support`. Do not
rewrite the harness body. `ApplicationTest.kt` retains only the imports needed by its test
class plus `import com.kanjimasta.support.*`; do not blindly remove Ktor request/response
imports that its test methods still use.

Add `import com.kanjimasta.support.*` to these fixture consumers at their Phase 4 starting
paths:

- root: `ApplicationTest.kt`, `OnboardingIntegrationTest.kt`,
  `AddKanjiIntegrationTest.kt`, `AdminIntegrationTest.kt`, `InternalIntegrationTest.kt`,
  `InviteIntegrationTest.kt`, `KanjiIntegrationTest.kt`, `PhotoIntegrationTest.kt`,
  `QuizIntegrationTest.kt`, `SettingsIntegrationTest.kt`, `UserIntegrationTest.kt`,
  `WordsIntegrationTest.kt`
- already co-located by Phase 1: `quiz/QuizRoutesTest.kt`

Remove now-unused imports from `ApplicationTest.kt`; its test methods stay unchanged.

Compile before moving any test package:

```bash
cd "$(git rev-parse --show-toplevel)"
(cd backend && ./gradlew compileTestKotlin)
```

### 4b. Move feature tests

Move each file with `git mv` **and** update its `package` line to match. Test bodies do not
change; the support import added in 4a follows the file.

| Test file (currently at `test/kotlin/com/kanjimasta/`) | New directory | New package |
|---|---|---|
| `AddKanjiIntegrationTest.kt` | `kanji/` | `com.kanjimasta.kanji` |
| `KanjiIntegrationTest.kt` | `kanji/` | `com.kanjimasta.kanji` |
| `WordDiscoveryIntegrationTest.kt` | `kanji/` | `com.kanjimasta.kanji` |
| `WordsIntegrationTest.kt` | `kanji/` | `com.kanjimasta.kanji` |
| `QuizIntegrationTest.kt` | `quiz/` | `com.kanjimasta.quiz` |
| `QuizGenerationWorkerIntegrationTest.kt` | `quiz/generation/` | `com.kanjimasta.quiz.generation` |
| `PhotoIntegrationTest.kt` | `photo/` | `com.kanjimasta.photo` |
| `PhotoAnalysisExecutorIntegrationTest.kt` | `photo/` | `com.kanjimasta.photo` |
| `UserIntegrationTest.kt` | `user/` | `com.kanjimasta.user` |
| `SettingsIntegrationTest.kt` | `settings/` | `com.kanjimasta.settings` |
| `InviteIntegrationTest.kt` | `invite/` | `com.kanjimasta.invite` |
| `AdminIntegrationTest.kt` | `admin/` | `com.kanjimasta.admin` |
| `InternalIntegrationTest.kt` | `internal/` | `com.kanjimasta.internal` |
| `LegacyCallbackFencingIntegrationTest.kt` | `internal/` | `com.kanjimasta.internal` |

Stay at the root (cross-feature journeys / whole-app tests): `ApplicationTest.kt`,
`ProductionApplicationTest.kt`, `ProductionSchemaIntegrationTest.kt`,
`OnboardingIntegrationTest.kt`. `support/` stays as the shared harness.

Apply the moves and package declarations exactly:

```bash
cd "$(git rev-parse --show-toplevel)"
base=backend/src/test/kotlin/com/kanjimasta
mkdir -p "$base/kanji" "$base/quiz/generation" "$base/photo" "$base/user" \
  "$base/settings" "$base/invite" "$base/admin" "$base/internal"

for spec in \
  'AddKanjiIntegrationTest.kt kanji com.kanjimasta.kanji' \
  'KanjiIntegrationTest.kt kanji com.kanjimasta.kanji' \
  'WordDiscoveryIntegrationTest.kt kanji com.kanjimasta.kanji' \
  'WordsIntegrationTest.kt kanji com.kanjimasta.kanji' \
  'QuizIntegrationTest.kt quiz com.kanjimasta.quiz' \
  'QuizGenerationWorkerIntegrationTest.kt quiz/generation com.kanjimasta.quiz.generation' \
  'PhotoIntegrationTest.kt photo com.kanjimasta.photo' \
  'PhotoAnalysisExecutorIntegrationTest.kt photo com.kanjimasta.photo' \
  'UserIntegrationTest.kt user com.kanjimasta.user' \
  'SettingsIntegrationTest.kt settings com.kanjimasta.settings' \
  'InviteIntegrationTest.kt invite com.kanjimasta.invite' \
  'AdminIntegrationTest.kt admin com.kanjimasta.admin' \
  'InternalIntegrationTest.kt internal com.kanjimasta.internal' \
  'LegacyCallbackFencingIntegrationTest.kt internal com.kanjimasta.internal'
do
  set -- $spec
  git mv "$base/$1" "$base/$2/$1"
  sed -i "1s/^package .*/package $3/" "$base/$2/$1"
done
```

```bash
cd "$(git rev-parse --show-toplevel)"
(cd backend && ./gradlew compileTestKotlin)
make test-backend
git add backend/src/test
git diff --cached --name-only
git commit -m "test: co-locate tests with the packages they exercise"
```

---

## Phase 5 — Architecture guardrail tests

Goal: the boundary rules live in CI, not in prose (jepangpg's `arch/` idea). Use a
dependency-free source-scanning JUnit test — no new libraries, nothing to misconfigure.

Create `backend/src/test/kotlin/com/kanjimasta/arch/ArchitectureTest.kt` with exactly
this content:

```kotlin
package com.kanjimasta.arch

import org.junit.jupiter.api.Test
import java.io.File
import kotlin.test.fail

/**
 * Structure rules for backend/src/main/kotlin. Enforced by scanning source text so the
 * rules hold even for code paths no unit test touches. If a rule blocks a legitimate
 * new dependency, the fix is a port interface wired in Application.kt — not an
 * allowlist entry.
 */
class ArchitectureTest {

    private val sourceRoot = File("src/main/kotlin/com/kanjimasta")

    private val featurePackages = listOf(
        "kanji", "quiz", "photo", "user", "settings", "invite", "admin", "internal",
    )

    // Legacy direct cross-feature dependencies, wired in Application.kt. Shrink over
    // time by introducing ports; never grow.
    private val allowedCrossFeatureImports = setOf(
        "kanji -> com.kanjimasta.photo.PhotoRepository",
        "kanji -> com.kanjimasta.settings.SettingsRepository",
        "user -> com.kanjimasta.quiz.QuizRepository",
        "user -> com.kanjimasta.settings.SettingsRepository",
    )

    private val expectedTableFiles = mapOf(
        "AiModelConfigTable" to "ai/AiTables.kt",
        "UserCostTable" to "ai/AiTables.kt",
        "JobAttemptTable" to "jobs/JobTables.kt",
        "KanjiMasterTable" to "kanji/KanjiTables.kt",
        "WordMasterTable" to "kanji/KanjiTables.kt",
        "UserKanjiTable" to "kanji/KanjiTables.kt",
        "UserWordsTable" to "kanji/KanjiTables.kt",
        "PhotoSessionTable" to "photo/PhotoTables.kt",
        "UserPhotoActivityStateTable" to "photo/PhotoTables.kt",
        "QuizBankTable" to "quiz/QuizTables.kt",
        "QuizDistractorTable" to "quiz/QuizTables.kt",
        "QuizSlotTable" to "quiz/QuizTables.kt",
        "QuizServeTable" to "quiz/QuizTables.kt",
        "QuizSessionCardTable" to "quiz/QuizTables.kt",
        "ChallengeSessionTable" to "quiz/QuizTables.kt",
        "QuizGenerationJobTable" to "quiz/generation/QuizGenerationTables.kt",
        "UserInviteTable" to "invite/InviteTables.kt",
        "UserSettingsTable" to "settings/SettingsTables.kt",
    )

    private val mainSources: List<File> =
        sourceRoot.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .toList()

    private fun packageOf(file: File): String =
        file.readLines().first { it.startsWith("package ") }.removePrefix("package ").trim()

    private fun importsOf(file: File): List<String> =
        file.readLines().filter { it.startsWith("import com.kanjimasta.") }
            .map { it.removePrefix("import ").trim() }

    private fun featureOf(pkg: String): String? =
        featurePackages.firstOrNull { pkg == "com.kanjimasta.$it" || pkg.startsWith("com.kanjimasta.$it.") }

    @Test
    fun `source scan is active`() {
        if (!sourceRoot.isDirectory) fail("Main source root does not exist: ${sourceRoot.absolutePath}")
        if (mainSources.isEmpty()) fail("No Kotlin sources found under ${sourceRoot.absolutePath}")
    }

    @Test
    fun `package declarations match source directories`() {
        val violations = mainSources.mapNotNull { file ->
            val relativeParent = file.parentFile.relativeTo(sourceRoot).invariantSeparatorsPath
            val expected = if (relativeParent.isBlank()) {
                "com.kanjimasta"
            } else {
                "com.kanjimasta.${relativeParent.replace('/', '.')}"
            }
            val actual = packageOf(file)
            if (actual == expected) null else "${file.path}: expected $expected, found $actual"
        }
        if (violations.isNotEmpty()) fail("Package/path mismatches:\n" + violations.joinToString("\n"))
    }

    @Test
    fun `no core or modules packages exist`() {
        val offenders = mainSources.map { packageOf(it) }
            .filter { it.contains(".core") || it.contains(".modules") }
        if (offenders.isNotEmpty()) fail("Forbidden package names: $offenders")
    }

    @Test
    fun `features do not import other features' services, repositories, or routes`() {
        val violations = mutableListOf<String>()
        for (file in mainSources) {
            val fromFeature = featureOf(packageOf(file)) ?: continue
            for (imp in importsOf(file)) {
                val toFeature = featureOf(imp) ?: continue
                if (toFeature == fromFeature) continue
                val symbol = imp.substringAfterLast('.')
                val isBehaviour = symbol.endsWith("Service") || symbol.endsWith("Repository") ||
                    symbol.endsWith("Routes") || symbol.first().isLowerCase()
                if (isBehaviour && "$fromFeature -> $imp" !in allowedCrossFeatureImports) {
                    violations += "${file.path}: $fromFeature imports $imp"
                }
            }
        }
        if (violations.isNotEmpty()) fail(
            "Cross-feature behaviour imports (tables/enums/models are fine; " +
                "services/repositories/routes are not):\n" + violations.joinToString("\n"),
        )
    }

    @Test
    fun `routes files do not touch the database directly`() {
        val violations = mainSources
            .filter { it.name.endsWith("Routes.kt") }
            .filter { f -> f.readLines().any { it.startsWith("import org.ktorm.") } }
        if (violations.isNotEmpty()) fail("Routes must go through services/repositories: $violations")
    }

    @Test
    fun `table mappings are declared once in their planned files`() {
        val declarationPattern = Regex("object\\s+(\\w+Table)\\s*:\\s*Table<Nothing>\\(")
        val actual = mainSources.flatMap { file ->
            declarationPattern.findAll(file.readText()).map { match ->
                match.groupValues[1] to file.relativeTo(sourceRoot).invariantSeparatorsPath
            }.toList()
        }
        val violations = mutableListOf<String>()
        for ((table, expectedFile) in expectedTableFiles) {
            val locations = actual.filter { it.first == table }.map { it.second }
            if (locations != listOf(expectedFile)) {
                violations += "$table: expected [$expectedFile], found $locations"
            }
        }
        val unexpected = actual.filter { it.first !in expectedTableFiles }
        if (unexpected.isNotEmpty()) violations += "Unexpected mappings: $unexpected"
        if (violations.isNotEmpty()) fail(
            "Table placement mismatches (placement is organizational, not write ownership):\n" +
                violations.joinToString("\n"),
        )
    }
}
```

Notes for the executor:

- The scan runs relative to the `backend/` Gradle project dir (Gradle's default test
  working directory). `source scan is active` deliberately fails closed if that assumption
  ever changes; do not remove that test to make the suite green.
- If `features do not import…` fails on an import this doc created (check Phases 1–3
  first), the import is probably a table/enum whose symbol name confusingly ends in
  `Service`/`Repository` — it isn't; re-read the failure and fix the actual offender.
- From the repository root, run
  `(cd backend && ./gradlew test --tests 'com.kanjimasta.arch.*')` until green.

```bash
cd "$(git rev-parse --show-toplevel)"
make test-backend
git add backend/src/test
git diff --cached --name-only
git commit -m "test: add architecture guardrails for package boundaries"
```

---

## Phase 6 — Update documentation

1. **`AGENTS.md` and `CLAUDE.md`** — replace the Backend section bullets that mention
   `core/` and `modules/` with the same text in both files:

   ```markdown
   ### Backend (Ktor + Kotlin)
   - Feature packages directly under `backend/src/main/kotlin/com/kanjimasta/{name}/` — Routes, Service, Repository, Models, Tables
   - Each Ktorm table mapping lives in the `*Tables.kt` of its primary domain/capability package for navigation. Placement does not imply exclusive data ownership; existing cross-feature reads and transactional writes are allowed until the dedicated data-asset modularization refactor.
   - Do not add new imports of another feature's Service/Repository/Routes. New cross-feature behaviour goes through a small interface (port) defined by the consumer and wired in `Application.kt`. Four existing exceptions are allowlisted in `arch/ArchitectureTest.kt` — shrink that list, never grow it.
   - Shared capability packages (each must have ≥2 consumers and zero domain logic): `db/` (DatabaseConfig, PgTypes), `ai/` (OpenRouter mechanics, model config, cost ledger), `jobs/` (dispatchers, job_attempt leases), `auth/`. Single-consumer helpers live inside their consumer (ResendClient → `invite/`, SupabaseStorageSigner → `photo/`).
   - App plumbing as single files at the package root: `Routing.kt`, `Cors.kt`, `Serialization.kt`, `Observability.kt`. `Application.kt` is the only composition root (plus `AiRuntime.kt` for job roles).
   - All DB access via Ktorm ORM (`org.ktorm.dsl.*`). No raw SQL strings in repositories. Custom PG types in `db/PgTypes.kt`: `textArray()`, `uuidArray()`, `pgEnum<T>()`
   - Auth via Supabase JWT (HS256). Provider name: `"supabase"`. Principal: `AuthUser(uid, email)`
   - Services take repository + config via constructor. Wired in `Application.kt`, passed to `configureRouting()`.
   - Tests live in the package of the unit they test; whole-app journey tests at the package root; shared harness in `support/`. Architecture rules enforced by `arch/ArchitectureTest.kt`.
   ```

   In both files, replace the old AI Runtime location bullets with:

   ```markdown
   - OpenRouter mechanics live in `ai/`; prompts live with their feature (`photo/PhotoPrompts.kt`, `quiz/generation/QuizGenerationPrompts.kt`, `kanji/WordDiscoveryPrompts.kt`); model IDs come from active `ai_model_config`.
   - Photo execution lives in `photo/`; quiz execution in `quiz/generation/`; word discovery in `kanji/`.
   ```

2. **`README.md` and `docs/architecture.md`** — update their backend project trees and
   table/prompt descriptions to the target layout. In `docs/architecture.md`, also replace
   the stale statement that a local backend executes a Job inline: local development always
   dispatches to the Compose `job-dispatcher`, which starts a fresh JVM Job process.

3. **Live documentation links and “as-built” paths** — update old `core/`/`modules/`
   references in:

   - `docs/infra-migration.md`
   - `docs/test.md`
   - the “As-built” notes in `docs/phase1.md`
   - `docs/admin-control-plane.md`
   - `docs/capture-resilience.md`

   Use the final target paths. Where an old `core/db/Tables.kt` reference names multiple
   tables, replace it with the specific new `*Tables.kt` files involved rather than inventing
   another central table file.

4. **This file** — change Status at the top to `done` with the date.

Audit documentation after editing. The restructure plan itself is excluded because its move
maps intentionally contain the old names:

```bash
cd "$(git rev-parse --show-toplevel)"
rg -n 'com\.kanjimasta\.(core|modules)|core/(ai|auth|db|email|jobs|plugins|storage)|modules/(admin|internal|invite|kanji|photo|quiz|settings|user|worker)' \
  AGENTS.md CLAUDE.md README.md docs \
  -g '!backend-restructure.md'
```

Expected result: zero hits. If a deliberately historical passage must retain an old path,
label it explicitly as a pre-restructure path and narrow the audit exclusion to that exact
line; do not leave an unexplained stale reference.

```bash
cd "$(git rev-parse --show-toplevel)"
git add AGENTS.md CLAUDE.md README.md \
  docs/architecture.md docs/infra-migration.md docs/test.md docs/phase1.md \
  docs/admin-control-plane.md docs/capture-resilience.md docs/backend-restructure.md
git diff --cached --name-only
git commit -m "docs: describe flattened backend structure and boundary rules"
```

---

## Final acceptance checklist

Run all of these; every one must pass before merging:

1. `make test-backend` — green.
2. `make test` — green (frontend untouched, but confirm no accidental breakage).
3. `rg -n 'com\.kanjimasta\.(core|modules)' backend/src` — zero hits.
4. `ls backend/src/main/kotlin/com/kanjimasta` — no `core/`, no `modules/`; matches the
   target tree above.
5. `backend/src/main/kotlin/com/kanjimasta/db/` contains exactly `DatabaseConfig.kt`
   and `PgTypes.kt`.
6. `git diff --stat main...HEAD` — committed changes are confined to `backend/src`,
   `AGENTS.md`, `CLAUDE.md`, `README.md`, and the explicitly listed documentation files.
   `git diff --name-only main...HEAD -- deploy-state.json` returns no output, proving the
   pre-existing local deployment-state change was not committed. `git status --short` may
   still show ` M deploy-state.json`; that is expected and must be preserved.
7. From the repository root,
   `(cd backend && ./gradlew test --tests 'com.kanjimasta.arch.*')` — green.
8. The documentation audit from Phase 6 returns zero unexplained old-layout references.
9. The app still boots locally: run `make supabase-start`, run `make backend` in a second
   terminal, then `curl -s localhost:8080/health` from a third shell. It returns
   `{"status":"ok"}` (port per `application.yaml`).

No deployment is needed; this refactor does not change runtime behavior. Do not run any
`make deploy-*` command.
