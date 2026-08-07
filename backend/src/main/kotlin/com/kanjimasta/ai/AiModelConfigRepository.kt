package com.kanjimasta.ai

import com.kanjimasta.ai.AiModelConfigTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.schema.ColumnDeclaring

class AiModelConfigRepository(private val db: Database) {
    fun getActive(): ActiveAiModelConfig? = find {
        (AiModelConfigTable.status eq "active") and
            (AiModelConfigTable.validationStatus eq "passed")
    }

    fun get(version: Long): ActiveAiModelConfig? = find {
        (AiModelConfigTable.version eq version) and
            (AiModelConfigTable.validationStatus eq "passed")
    }

    private fun find(predicate: () -> ColumnDeclaring<Boolean>): ActiveAiModelConfig? =
        db.from(AiModelConfigTable)
        .select(
            AiModelConfigTable.version,
            AiModelConfigTable.photoAnalysisModel,
            AiModelConfigTable.photoAnalysisReasoning,
            AiModelConfigTable.quizGenerationModel,
            AiModelConfigTable.quizGenerationReasoning,
            AiModelConfigTable.wordDiscoveryModel,
            AiModelConfigTable.wordDiscoveryReasoning,
            AiModelConfigTable.translationModel,
            AiModelConfigTable.translationReasoning,
        )
        .where(predicate)
        .limit(1)
        .map { row ->
            ActiveAiModelConfig(
                version = row[AiModelConfigTable.version] ?: error("Active model config has no version"),
                photoAnalysisModel = row[AiModelConfigTable.photoAnalysisModel].orEmpty(),
                photoAnalysisReasoning = row[AiModelConfigTable.photoAnalysisReasoning].orEmpty(),
                quizGenerationModel = row[AiModelConfigTable.quizGenerationModel].orEmpty(),
                quizGenerationReasoning = row[AiModelConfigTable.quizGenerationReasoning].orEmpty(),
                wordDiscoveryModel = row[AiModelConfigTable.wordDiscoveryModel].orEmpty(),
                wordDiscoveryReasoning = row[AiModelConfigTable.wordDiscoveryReasoning].orEmpty(),
                translationModel = row[AiModelConfigTable.translationModel].orEmpty(),
                translationReasoning = row[AiModelConfigTable.translationReasoning].orEmpty(),
            )
        }
        .firstOrNull()

    fun requireActive(): ActiveAiModelConfig =
        getActive() ?: error("An active validated AI model configuration is required")
}
