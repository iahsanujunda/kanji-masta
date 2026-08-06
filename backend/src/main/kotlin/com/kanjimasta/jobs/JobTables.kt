package com.kanjimasta.jobs

import com.kanjimasta.db.*
import org.ktorm.schema.*

object JobAttemptTable : Table<Nothing>("job_attempt") {
    val id = uuid("id").primaryKey()
    val jobType = text("job_type")
    val jobId = uuid("job_id")
    val attemptNumber = int("attempt_number")
    val status = text("status")
    val trigger = text("trigger")
    val modelConfigVersion = long("model_config_version")
    val modelId = text("model_id")
    val claimToken = uuid("claim_token")
    val leaseUntil = timestamp("lease_until")
    val claimedBy = text("claimed_by")
    val failureCode = text("failure_code")
    val startedAt = timestamp("started_at")
    val finishedAt = timestamp("finished_at")
    val createdBy = text("created_by")
    val createdAt = timestamp("created_at")
}
