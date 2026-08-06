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
        "PhotoSessionTaskTable" to "photo/PhotoTables.kt",
        "PhotoSessionKanjiTable" to "photo/PhotoTables.kt",
        "PhotoSessionKanjiDecisionTable" to "photo/PhotoTables.kt",
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
