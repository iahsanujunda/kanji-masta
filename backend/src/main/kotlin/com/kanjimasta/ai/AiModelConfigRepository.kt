package com.kanjimasta.ai

import com.kanjimasta.ai.AiModelConfigTable
import org.ktorm.database.Database
import org.ktorm.dsl.*

class AiModelConfigRepository(private val db: Database) {
    fun getActive(): ActiveAiModelConfig? = db.from(AiModelConfigTable)
        .select(
            AiModelConfigTable.version,
            AiModelConfigTable.photoAnalysisModel,
            AiModelConfigTable.quizGenerationModel,
            AiModelConfigTable.wordDiscoveryModel,
        )
        .where {
            (AiModelConfigTable.status eq "active") and
                (AiModelConfigTable.validationStatus eq "passed")
        }
        .limit(1)
        .map { row ->
            ActiveAiModelConfig(
                version = row[AiModelConfigTable.version] ?: error("Active model config has no version"),
                photoAnalysisModel = row[AiModelConfigTable.photoAnalysisModel].orEmpty(),
                quizGenerationModel = row[AiModelConfigTable.quizGenerationModel].orEmpty(),
                wordDiscoveryModel = row[AiModelConfigTable.wordDiscoveryModel].orEmpty(),
            )
        }
        .firstOrNull()

    fun requireActive(): ActiveAiModelConfig =
        getActive() ?: error("An active validated AI model configuration is required")
}
