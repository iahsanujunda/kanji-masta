package com.kanjimasta.ai

import com.kanjimasta.db.*
import org.ktorm.schema.*

object AiModelConfigTable : Table<Nothing>("ai_model_config") {
    val version = long("version").primaryKey()
    val status = text("status")
    val photoAnalysisModel = text("photo_analysis_model")
    val quizGenerationModel = text("quiz_generation_model")
    val wordDiscoveryModel = text("word_discovery_model")
    val validationStatus = text("validation_status")
    val failureCode = text("failure_code")
    val createdBy = text("created_by")
    val createdAt = timestamp("created_at")
    val validatedAt = timestamp("validated_at")
    val activatedAt = timestamp("activated_at")
}

object UserCostTable : Table<Nothing>("user_cost") {
    val id = uuid("id").primaryKey()
    val userId = text("user_id")
    val operationType = text("operation_type")
    val operationId = uuid("operation_id")
    val jobAttemptId = uuid("job_attempt_id")
    val costMicrodollars = long("cost_microdollars")
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
}
