package com.kanjimasta.admin

import com.kanjimasta.ai.AiModelConfigTable
import com.kanjimasta.ai.UserCostTable
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.WordMasterTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.photo.PhotoSessionTaskTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.QuizDistractorTable
import com.kanjimasta.quiz.generation.JobStatus
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.insertReturning
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

class AdminRepository(private val db: Database) {

    fun saveActiveModelConfig(
        request: ModelConfigRequest,
        adminUserId: String,
    ): ModelConfigItem = db.useTransaction {
        val now = Instant.now()
        db.update(AiModelConfigTable) {
            set(it.status, "superseded")
            where { it.status eq "active" }
        }
        val version = db.insertReturning(AiModelConfigTable, AiModelConfigTable.version) {
            set(it.status, "active")
            set(it.photoAnalysisModel, request.photoAnalysisModel)
            set(it.photoAnalysisReasoning, request.photoAnalysisReasoning)
            set(it.quizGenerationModel, request.quizGenerationModel)
            set(it.quizGenerationReasoning, request.quizGenerationReasoning)
            set(it.wordDiscoveryModel, request.wordDiscoveryModel)
            set(it.wordDiscoveryReasoning, request.wordDiscoveryReasoning)
            set(it.translationModel, request.translationModel)
            set(it.translationReasoning, request.translationReasoning)
            set(it.validationStatus, "passed")
            set(it.failureCode, null)
            set(it.createdBy, adminUserId)
            set(it.validatedAt, now)
            set(it.activatedAt, now)
        } ?: error("Model configuration version was not generated")
        getModelConfig(version) ?: error("Saved model configuration is missing")
    }

    fun getModelConfigs(): List<ModelConfigItem> = db.from(AiModelConfigTable)
        .select()
        .orderBy(AiModelConfigTable.version.desc())
        .limit(20)
        .map(::mapModelConfig)

    fun getActiveModelConfig(): ModelConfigItem? = db.from(AiModelConfigTable)
        .select()
        .where { AiModelConfigTable.status eq "active" }
        .limit(1)
        .map(::mapModelConfig)
        .firstOrNull()

    private fun getModelConfig(version: Long): ModelConfigItem? = db.from(AiModelConfigTable)
        .select()
        .where { AiModelConfigTable.version eq version }
        .limit(1)
        .map(::mapModelConfig)
        .firstOrNull()

    private fun mapModelConfig(row: QueryRowSet): ModelConfigItem = ModelConfigItem(
        version = row[AiModelConfigTable.version] ?: 0,
        status = row[AiModelConfigTable.status] ?: "rejected",
        photoAnalysisModel = row[AiModelConfigTable.photoAnalysisModel] ?: "",
        photoAnalysisReasoning = row[AiModelConfigTable.photoAnalysisReasoning] ?: "",
        quizGenerationModel = row[AiModelConfigTable.quizGenerationModel] ?: "",
        quizGenerationReasoning = row[AiModelConfigTable.quizGenerationReasoning] ?: "",
        wordDiscoveryModel = row[AiModelConfigTable.wordDiscoveryModel] ?: "",
        wordDiscoveryReasoning = row[AiModelConfigTable.wordDiscoveryReasoning] ?: "",
        translationModel = row[AiModelConfigTable.translationModel] ?: "",
        translationReasoning = row[AiModelConfigTable.translationReasoning] ?: "",
        validationStatus = row[AiModelConfigTable.validationStatus] ?: "failed",
        failureCode = row[AiModelConfigTable.failureCode],
        createdBy = row[AiModelConfigTable.createdBy] ?: "system",
        createdAt = row[AiModelConfigTable.createdAt]?.toString() ?: "",
        validatedAt = row[AiModelConfigTable.validatedAt]?.toString(),
        activatedAt = row[AiModelConfigTable.activatedAt]?.toString(),
    )

    private val staleCutoff: Instant
        get() = Instant.now().minus(25, ChronoUnit.HOURS)

    fun getCostByUser(): List<CostByUser> {
        val photoCosts = mutableMapOf<String, Long>()
        val quizGenCosts = mutableMapOf<String, Long>()

        db.from(UserCostTable)
            .select(UserCostTable.userId, UserCostTable.operationType, UserCostTable.costMicrodollars)
            .map { row ->
                val uid = row[UserCostTable.userId] ?: return@map
                val opType = row[UserCostTable.operationType] ?: return@map
                val cost = row[UserCostTable.costMicrodollars] ?: 0L
                when (opType) {
                    "PHOTO_ANALYSIS" -> photoCosts[uid] = (photoCosts[uid] ?: 0L) + cost
                    else -> quizGenCosts[uid] = (quizGenCosts[uid] ?: 0L) + cost
                }
            }

        val allUsers = (photoCosts.keys + quizGenCosts.keys).toSet()
        return allUsers.map { uid ->
            val photo = photoCosts[uid] ?: 0L
            val quizGen = quizGenCosts[uid] ?: 0L
            CostByUser(uid, photo, quizGen, photo + quizGen)
        }.sortedByDescending { it.totalMicrodollars }
    }

    fun getCostByDay(days: Int): List<CostByDay> {
        val cutoff = Instant.now().minus(days.toLong(), ChronoUnit.DAYS)
        val dailyCosts = mutableMapOf<String, Long>()

        db.from(UserCostTable)
            .select(UserCostTable.createdAt, UserCostTable.costMicrodollars)
            .where { UserCostTable.createdAt greaterEq cutoff }
            .map { row ->
                val date = row[UserCostTable.createdAt]?.atOffset(ZoneOffset.UTC)?.toLocalDate()?.toString() ?: return@map
                val cost = row[UserCostTable.costMicrodollars] ?: 0L
                dailyCosts[date] = (dailyCosts[date] ?: 0L) + cost
            }

        return dailyCosts.entries
            .sortedBy { it.key }
            .map { CostByDay(it.key, it.value) }
    }

    fun getJobCounts(): JobCounts {
        var pending = 0; var processing = 0; var done = 0; var failed = 0
        db.from(PhotoSessionTable)
            .select(PhotoSessionTable.status)
            .map { row ->
                when (normalizePhotoStatus(row[PhotoSessionTable.status])) {
                    "pending" -> pending++
                    "processing" -> processing++
                    "done" -> done++
                    "failed" -> failed++
                }
            }
        db.from(QuizGenerationJobTable)
            .select(QuizGenerationJobTable.status)
            .map { row ->
                when (row[QuizGenerationJobTable.status]) {
                    JobStatus.PENDING -> pending++
                    JobStatus.PROCESSING -> processing++
                    JobStatus.DONE -> done++
                    JobStatus.FAILED -> failed++
                    null -> {}
                }
            }
        return JobCounts(pending, processing, done, failed)
    }

    fun getJobs(status: String?, type: String? = null, limit: Int = 100): List<JobItem> {
        val normalizedStatus = status?.lowercase()
        val photoJobs = if (type == null || type == "photo_analysis") getPhotoJobs() else emptyList()
        val quizJobs = if (type == null || type == "quiz_generation") getQuizJobs() else emptyList()
        return attachLatestAttempts(photoJobs + quizJobs)
            .asSequence()
            .filter {
                normalizedStatus == null ||
                    (normalizedStatus == "needs-action" && (it.status == "failed" || it.stale)) ||
                    it.status == normalizedStatus
            }
            .sortedByDescending { it.createdAt }
            .take(limit)
            .toList()
    }

    private fun getPhotoJobs(): List<JobItem> = db.from(PhotoSessionTable)
        .select()
        .orderBy(PhotoSessionTable.createdAt.desc())
        .limit(100)
        .map { row ->
            val status = normalizePhotoStatus(row[PhotoSessionTable.status])
            val updatedAt = row[PhotoSessionTable.updatedAt]
            JobItem(
                id = row[PhotoSessionTable.id].toString(),
                type = "photo_analysis",
                status = status,
                stale = status in setOf("pending", "processing") && updatedAt?.isBefore(staleCutoff) == true,
                attempts = row[PhotoSessionTable.attempts] ?: 0,
                maxAttempts = 3,
                userId = row[PhotoSessionTable.userId] ?: "",
                summary = "Photo analysis",
                costMicrodollars = row[PhotoSessionTable.costMicrodollars],
                createdAt = row[PhotoSessionTable.createdAt]?.toString() ?: "",
                updatedAt = updatedAt?.toString() ?: "",
                failureCode = row[PhotoSessionTable.failureCode],
            )
        }

    private fun getQuizJobs(): List<JobItem> {
        return db.from(QuizGenerationJobTable)
            .innerJoin(KanjiMasterTable, on = QuizGenerationJobTable.kanjiId eq KanjiMasterTable.id)
            .leftJoin(WordMasterTable, on = QuizGenerationJobTable.wordMasterId eq WordMasterTable.id)
            .select()
            .orderBy(QuizGenerationJobTable.createdAt.desc())
            .limit(100)
            .map { row ->
                val status = row[QuizGenerationJobTable.status]?.name?.lowercase() ?: "failed"
                val updatedAt = row[QuizGenerationJobTable.updatedAt]
                val character = row[KanjiMasterTable.character] ?: ""
                JobItem(
                    id = row[QuizGenerationJobTable.id].toString(),
                    type = "quiz_generation",
                    status = status,
                    stale = status in setOf("pending", "processing") && updatedAt?.isBefore(staleCutoff) == true,
                    attempts = row[QuizGenerationJobTable.attempts] ?: 0,
                    maxAttempts = 3,
                    kanji = character,
                    word = row[WordMasterTable.word],
                    userId = row[QuizGenerationJobTable.userId] ?: "",
                    summary = "Quiz generation · $character",
                    costMicrodollars = row[QuizGenerationJobTable.costMicrodollars],
                    createdAt = row[QuizGenerationJobTable.createdAt]?.toString() ?: "",
                    updatedAt = updatedAt?.toString() ?: "",
                )
            }
    }

    private data class AttemptSnapshot(
        val startedAt: String?,
        val finishedAt: String?,
        val modelId: String?,
        val modelConfigVersion: Long?,
    )

    private fun attachLatestAttempts(jobs: List<JobItem>): List<JobItem> {
        if (jobs.isEmpty()) return jobs
        val snapshots = mutableMapOf<Pair<String, UUID>, AttemptSnapshot>()
        db.from(JobAttemptTable)
            .select()
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .forEach { row ->
                val type = row[JobAttemptTable.jobType] ?: return@forEach
                val id = row[JobAttemptTable.jobId] ?: return@forEach
                snapshots.putIfAbsent(
                    type to id,
                    AttemptSnapshot(
                        startedAt = row[JobAttemptTable.startedAt]?.toString(),
                        finishedAt = row[JobAttemptTable.finishedAt]?.toString(),
                        modelId = row[JobAttemptTable.modelId],
                        modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                    ),
                )
            }
        return jobs.map { job ->
            val attempt = snapshots[job.type to UUID.fromString(job.id)] ?: return@map job
            job.copy(
                startedAt = attempt.startedAt,
                finishedAt = attempt.finishedAt,
                modelId = attempt.modelId,
                modelConfigVersion = attempt.modelConfigVersion,
            )
        }
    }

    fun hasHardStaleJobs(): Boolean = getJobs(null, null, 100)
        .any { it.status in setOf("pending", "processing") && it.stale }

    private fun normalizePhotoStatus(status: String?): String = when (status?.uppercase()) {
        "DONE", "INGESTED" -> "done"
        "FAILED", "ERROR" -> "failed"
        else -> "processing"
    }

    fun markFailed(type: String, id: UUID, adminUserId: String): JobCommandResult = db.useTransaction {
        val updated = when (type) {
            "photo_analysis" -> db.update(PhotoSessionTable) {
                set(it.status, "FAILED")
                set(it.failureCode, "admin_stopped")
                where {
                    (it.id eq id) and
                        (it.status inList listOf("PROCESSING"))
                }
            }
            "quiz_generation" -> db.update(QuizGenerationJobTable) {
                set(it.status, JobStatus.FAILED)
                where {
                    (it.id eq id) and
                        (it.status inList listOf(JobStatus.PENDING, JobStatus.PROCESSING))
                }
            }
            else -> return@useTransaction JobCommandResult.NotFound
        }
        if (updated == 0) {
            return@useTransaction if (jobExists(type, id)) JobCommandResult.Conflict else JobCommandResult.NotFound
        }

        terminalizeOrCreateAttempt(type, id, adminUserId, "admin_stopped")
        JobCommandResult.Applied(getJob(type, id) ?: return@useTransaction JobCommandResult.NotFound)
    }

    fun getJobDetail(type: String, id: UUID): JobDetailResponse? {
        val job = getJob(type, id) ?: return null
        return JobDetailResponse(job, getAttempts(type, id))
    }

    fun rerun(type: String, id: UUID, adminUserId: String): JobCommandResult = db.useTransaction {
        val before = getJob(type, id) ?: return@useTransaction JobCommandResult.NotFound
        if (before.status != "failed" && !before.stale) return@useTransaction JobCommandResult.Conflict

        val requiredPhotoTask = if (type == "photo_analysis") {
            db.from(PhotoSessionTaskTable)
                .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.taskType)
                .where {
                    (PhotoSessionTaskTable.photoSessionId eq id) and
                        (PhotoSessionTaskTable.requiredForReady eq true) and
                        (PhotoSessionTaskTable.status inList listOf("FAILED", "PROCESSING", "PENDING"))
                }
                .orderBy(PhotoSessionTaskTable.createdAt.asc())
                .limit(1)
                .map { it[PhotoSessionTaskTable.id]!! to it[PhotoSessionTaskTable.taskType].orEmpty() }
                .firstOrNull() ?: run {
                    // Legacy photo rows predate capture tasks. Materialize the current pipeline
                    // so an admin rerun enters the same task-scoped execution path.
                    val visualTaskId = UUID.randomUUID()
                    db.insert(PhotoSessionTaskTable) {
                        set(it.id, visualTaskId)
                        set(it.photoSessionId, id)
                        set(it.taskType, "VISUAL_ANALYSIS")
                        set(it.status, "PENDING")
                        set(it.requiredForReady, true)
                        set(it.pipelineVersion, 2)
                    }
                    db.insert(PhotoSessionTaskTable) {
                        set(it.id, UUID.randomUUID())
                        set(it.photoSessionId, id)
                        set(it.taskType, "TRANSLATION")
                        set(it.status, "BLOCKED")
                        set(it.requiredForReady, true)
                        set(it.pipelineVersion, 2)
                    }
                    visualTaskId to "VISUAL_ANALYSIS"
                }
        } else null

        val existingAttempts = getAttempts(type, id)
        if (existingAttempts.isEmpty()) {
            db.insert(JobAttemptTable) {
                set(it.id, UUID.randomUUID())
                set(it.jobType, type)
                set(it.jobId, id)
                set(it.attemptNumber, before.attempts.coerceAtLeast(1))
                set(it.status, "failed")
                set(it.trigger, "initial")
                set(it.failureCode, before.failureCode ?: "unknown")
                set(it.finishedAt, Instant.now())
                set(it.createdBy, "system")
            }
        } else if (existingAttempts.last().status in setOf("pending", "processing")) {
            terminalizeOrCreateAttempt(type, id, adminUserId, "admin_stopped")
        }

        val nextNumber = (getAttempts(type, id).maxOfOrNull { it.attemptNumber } ?: 0) + 1
        val sourceUpdated = when (type) {
            "photo_analysis" -> db.update(PhotoSessionTable) {
                set(it.status, "PROCESSING")
                set(it.processingStatus, "PROCESSING")
                set(it.failureCode, null)
                set(it.attempts, nextNumber)
                where {
                    (it.id eq id) and (
                        (it.status inList listOf("FAILED", "ERROR")) or
                            ((it.status eq "PROCESSING") and (it.updatedAt less staleCutoff))
                        )
                }
            }
            "quiz_generation" -> db.update(QuizGenerationJobTable) {
                set(it.status, JobStatus.PENDING)
                set(it.attempts, nextNumber)
                where {
                    (it.id eq id) and (
                        (it.status eq JobStatus.FAILED) or
                            ((it.status eq JobStatus.PROCESSING) and (it.updatedAt less staleCutoff))
                        )
                }
            }
            else -> 0
        }
        if (sourceUpdated == 0) return@useTransaction JobCommandResult.Conflict

        if (requiredPhotoTask != null) {
            db.update(PhotoSessionTaskTable) {
                set(it.status, "PENDING")
                set(it.failureCode, null)
                set(it.finishedAt, null)
                set(it.claimedBy, null)
                set(it.leaseUntil, null)
                where { it.id eq requiredPhotoTask.first }
            }
            if (requiredPhotoTask.second == "VISUAL_ANALYSIS") {
                db.update(PhotoSessionTaskTable) {
                    set(it.status, "BLOCKED")
                    set(it.failureCode, null)
                    set(it.finishedAt, null)
                    where {
                        (it.photoSessionId eq id) and
                            (it.taskType eq "TRANSLATION") and
                            (it.status neq "DONE")
                    }
                }
            }
        }

        val activeConfig = getActiveModelConfig()
        val modelId = when (type) {
            "photo_analysis" -> if (requiredPhotoTask?.second == "TRANSLATION") {
                activeConfig?.translationModel
            } else activeConfig?.photoAnalysisModel
            "quiz_generation" -> activeConfig?.quizGenerationModel
            else -> null
        }
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, type)
            set(it.jobId, id)
            if (requiredPhotoTask != null) set(it.taskId, requiredPhotoTask.first)
            set(it.attemptNumber, nextNumber)
            set(it.status, "pending")
            set(it.trigger, "admin_rerun")
            set(it.modelConfigVersion, activeConfig?.version)
            set(it.modelId, modelId)
            set(it.createdBy, adminUserId)
        }
        JobCommandResult.Applied(getJob(type, id) ?: return@useTransaction JobCommandResult.NotFound)
    }

    private fun getAttempts(type: String, id: UUID): List<JobAttemptItem> =
        db.from(JobAttemptTable)
            .select()
            .where { (JobAttemptTable.jobType eq type) and (JobAttemptTable.jobId eq id) }
            .orderBy(JobAttemptTable.attemptNumber.asc())
            .map { row ->
                JobAttemptItem(
                    id = row[JobAttemptTable.id].toString(),
                    attemptNumber = row[JobAttemptTable.attemptNumber] ?: 0,
                    status = row[JobAttemptTable.status] ?: "failed",
                    trigger = row[JobAttemptTable.trigger] ?: "initial",
                    modelConfigVersion = row[JobAttemptTable.modelConfigVersion],
                    modelId = row[JobAttemptTable.modelId],
                    failureCode = row[JobAttemptTable.failureCode],
                    startedAt = row[JobAttemptTable.startedAt]?.toString(),
                    finishedAt = row[JobAttemptTable.finishedAt]?.toString(),
                    createdBy = row[JobAttemptTable.createdBy] ?: "system",
                    createdAt = row[JobAttemptTable.createdAt]?.toString() ?: "",
                )
            }

    private fun jobExists(type: String, id: UUID): Boolean = when (type) {
        "photo_analysis" -> db.from(PhotoSessionTable).select(PhotoSessionTable.id)
            .where { PhotoSessionTable.id eq id }.limit(1).map { true }.firstOrNull() == true
        "quiz_generation" -> db.from(QuizGenerationJobTable).select(QuizGenerationJobTable.id)
            .where { QuizGenerationJobTable.id eq id }.limit(1).map { true }.firstOrNull() == true
        else -> false
    }

    private fun getJob(type: String, id: UUID): JobItem? = when (type) {
        "photo_analysis" -> attachLatestAttempts(getPhotoJobs().filter { it.id == id.toString() }).firstOrNull()
        "quiz_generation" -> attachLatestAttempts(getQuizJobs().filter { it.id == id.toString() }).firstOrNull()
        else -> null
    }

    private fun terminalizeOrCreateAttempt(
        type: String,
        id: UUID,
        adminUserId: String,
        failureCode: String,
    ) {
        val activeAttempt = db.from(JobAttemptTable)
            .select(JobAttemptTable.id)
            .where {
                (JobAttemptTable.jobType eq type) and
                    (JobAttemptTable.jobId eq id) and
                    (JobAttemptTable.status inList listOf("pending", "processing"))
            }
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .limit(1)
            .map { it[JobAttemptTable.id] }
            .firstOrNull()
        if (activeAttempt != null) {
            db.update(JobAttemptTable) {
                set(it.status, "failed")
                set(it.failureCode, failureCode)
                set(it.finishedAt, Instant.now())
                where { it.id eq activeAttempt }
            }
            return
        }
        val latestNumber = db.from(JobAttemptTable)
            .select(JobAttemptTable.attemptNumber)
            .where { (JobAttemptTable.jobType eq type) and (JobAttemptTable.jobId eq id) }
            .orderBy(JobAttemptTable.attemptNumber.desc())
            .limit(1)
            .map { it[JobAttemptTable.attemptNumber] ?: 0 }
            .firstOrNull() ?: 0
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, type)
            set(it.jobId, id)
            set(it.attemptNumber, latestNumber + 1)
            set(it.status, "failed")
            set(it.trigger, "initial")
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            set(it.createdBy, adminUserId)
        }
    }

    fun searchQuizzes(query: String?, limit: Int = 50): List<QuizItem> {
        return db.from(QuizBankTable)
            .innerJoin(KanjiMasterTable, on = QuizBankTable.kanjiId eq KanjiMasterTable.id)
            .innerJoin(WordMasterTable, on = QuizBankTable.wordId eq WordMasterTable.id)
            .select()
            .let { q ->
                if (!query.isNullOrBlank()) {
                    q.where {
                        (KanjiMasterTable.character like "%$query%") or
                            (WordMasterTable.word like "%$query%")
                    }
                } else q
            }
            .orderBy(QuizBankTable.servedCount.desc())
            .limit(limit)
            .map { row ->
                QuizItem(
                    id = row[QuizBankTable.id].toString(),
                    kanji = row[KanjiMasterTable.character] ?: "",
                    word = row[WordMasterTable.word] ?: "",
                    quizType = row[QuizBankTable.quizType]?.name ?: "",
                    prompt = row[QuizBankTable.prompt] ?: "",
                    answer = row[QuizBankTable.answer] ?: "",
                    servedCount = row[QuizBankTable.servedCount] ?: 0,
                )
            }
    }

    fun deleteQuiz(id: UUID) {
        db.delete(QuizDistractorTable) { it.quizId eq id }
        db.delete(QuizBankTable) { it.id eq id }
    }
}
