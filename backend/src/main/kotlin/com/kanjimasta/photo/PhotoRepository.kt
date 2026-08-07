package com.kanjimasta.photo

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.kanji.KanjiMasterTable
import com.kanjimasta.kanji.UserKanjiTable
import com.kanjimasta.photo.PhotoSessionTable
import com.kanjimasta.photo.PhotoSessionStatus
import com.kanjimasta.photo.UserPhotoActivityStateTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.insertOrUpdateReturning
import org.ktorm.support.postgresql.insertReturning
import java.time.Instant
import java.util.UUID

class PhotoRepository(private val db: Database) {

    fun createSession(
        userId: String,
        imageUrl: String,
        storagePath: String? = null,
        clientCaptureId: UUID? = null,
    ): PhotoSessionCreation = db.useTransaction {
        val id = UUID.randomUUID()
        if (clientCaptureId == null) {
            val insertedId = db.insertReturning(PhotoSessionTable, PhotoSessionTable.id) {
                set(it.id, id)
                set(it.userId, userId)
                set(it.imageUrl, imageUrl)
                if (storagePath != null) set(it.storagePath, storagePath)
            }
            val persistedId = checkNotNull(insertedId) { "Photo session insert did not return an id" }
            val visualTaskId = createCaptureTasks(persistedId)
            createInitialAttempt(persistedId, visualTaskId)
            return@useTransaction PhotoSessionCreation(insertedId.toString(), created = true, shouldDispatch = true)
        }

        val returnedId = db.insertOrUpdateReturning(PhotoSessionTable, PhotoSessionTable.id) {
            set(it.id, id)
            set(it.userId, userId)
            set(it.imageUrl, imageUrl)
            set(it.clientCaptureId, clientCaptureId)
            if (storagePath != null) set(it.storagePath, storagePath)
            onConflict(PhotoSessionTable.userId, PhotoSessionTable.clientCaptureId) {
                set(PhotoSessionTable.imageUrl, excluded(PhotoSessionTable.imageUrl))
                if (storagePath != null) {
                    set(PhotoSessionTable.storagePath, excluded(PhotoSessionTable.storagePath))
                }
            }
        } ?: error("Photo session upsert did not return an id")
        val created = returnedId == id
        if (created) {
            val visualTaskId = createCaptureTasks(returnedId)
            createInitialAttempt(returnedId, visualTaskId)
        }
        val shouldDispatch = created || db.from(PhotoSessionTable)
            .select(PhotoSessionTable.status, PhotoSessionTable.attempts)
            .where { PhotoSessionTable.id eq returnedId }
            .map { row ->
                row[PhotoSessionTable.status] == PhotoSessionStatus.PROCESSING.name &&
                    row[PhotoSessionTable.attempts] == 0
            }
            .firstOrNull() == true
        PhotoSessionCreation(returnedId.toString(), created, shouldDispatch)
    }

    private fun createInitialAttempt(sessionId: UUID, taskId: UUID) {
        val config = AiModelConfigRepository(db).getActive()
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "photo_analysis")
            set(it.jobId, sessionId)
            set(it.taskId, taskId)
            set(it.attemptNumber, 1)
            set(it.status, "pending")
            set(it.trigger, "initial")
            set(it.modelConfigVersion, config?.version)
            set(it.modelId, config?.photoAnalysisModel)
            set(it.createdBy, "system")
        }
    }

    private fun createCaptureTasks(sessionId: UUID): UUID {
        val visualTaskId = UUID.randomUUID()
        db.insert(PhotoSessionTaskTable) {
            set(it.id, visualTaskId)
            set(it.photoSessionId, sessionId)
            set(it.taskType, "VISUAL_ANALYSIS")
            set(it.status, "PENDING")
            set(it.requiredForReady, true)
            set(it.pipelineVersion, 2)
        }
        db.insert(PhotoSessionTaskTable) {
            set(it.id, UUID.randomUUID())
            set(it.photoSessionId, sessionId)
            set(it.taskType, "TRANSLATION")
            set(it.status, "BLOCKED")
            set(it.requiredForReady, true)
            set(it.pipelineVersion, 2)
        }
        return visualTaskId
    }

    fun pendingRequiredTask(sessionId: UUID): RequiredCaptureTask? = db.from(PhotoSessionTaskTable)
        .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.taskType, PhotoSessionTaskTable.status)
        .where {
            (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                (PhotoSessionTaskTable.requiredForReady eq true) and
                (PhotoSessionTaskTable.status inList listOf("PENDING", "PROCESSING"))
        }
        .orderBy(PhotoSessionTaskTable.createdAt.asc())
        .limit(1)
        .map { row ->
            RequiredCaptureTask(
                id = row[PhotoSessionTaskTable.id]!!,
                type = row[PhotoSessionTaskTable.taskType].orEmpty(),
                status = row[PhotoSessionTaskTable.status].orEmpty(),
            )
        }
        .firstOrNull()

    fun failedRequiredTask(sessionId: UUID, userId: String): RequiredCaptureTask? = db.from(PhotoSessionTaskTable)
        .innerJoin(PhotoSessionTable, on = PhotoSessionTaskTable.photoSessionId eq PhotoSessionTable.id)
        .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.taskType, PhotoSessionTaskTable.status)
        .where {
            (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                (PhotoSessionTable.userId eq userId) and
                (PhotoSessionTaskTable.requiredForReady eq true) and
                (PhotoSessionTaskTable.status eq "FAILED")
        }
        .orderBy(PhotoSessionTaskTable.createdAt.asc())
        .limit(1)
        .map { row ->
            RequiredCaptureTask(
                id = row[PhotoSessionTaskTable.id]!!,
                type = row[PhotoSessionTaskTable.taskType].orEmpty(),
                status = row[PhotoSessionTaskTable.status].orEmpty(),
            )
        }
        .firstOrNull()

    fun requiredTaskStates(sessionId: UUID, userId: String): List<CaptureTaskState> = db.from(PhotoSessionTaskTable)
        .innerJoin(PhotoSessionTable, on = PhotoSessionTaskTable.photoSessionId eq PhotoSessionTable.id)
        .select(PhotoSessionTaskTable.taskType, PhotoSessionTaskTable.status, PhotoSessionTaskTable.failureCode)
        .where {
            (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                (PhotoSessionTable.userId eq userId) and
                (PhotoSessionTaskTable.requiredForReady eq true)
        }
        .orderBy(PhotoSessionTaskTable.createdAt.asc())
        .map { row ->
            CaptureTaskState(
                taskType = row[PhotoSessionTaskTable.taskType].orEmpty(),
                status = row[PhotoSessionTaskTable.status].orEmpty().lowercase(),
                failureCode = row[PhotoSessionTaskTable.failureCode],
            )
        }

    fun validateCaptureSelection(sessionId: UUID, userId: String, kanjiIds: Set<UUID>): Boolean {
        if (kanjiIds.isEmpty()) return true
        val matching = db.from(PhotoSessionKanjiTable)
            .innerJoin(PhotoSessionTable, on = PhotoSessionKanjiTable.photoSessionId eq PhotoSessionTable.id)
            .select(PhotoSessionKanjiTable.kanjiMasterId)
            .where {
                (PhotoSessionKanjiTable.photoSessionId eq sessionId) and
                    (PhotoSessionTable.userId eq userId) and
                    PhotoSessionKanjiTable.excludedAt.isNull() and
                    (PhotoSessionKanjiTable.kanjiMasterId inList kanjiIds.toList())
            }
            .mapNotNull { it[PhotoSessionKanjiTable.kanjiMasterId] }
            .toSet()
        return matching == kanjiIds
    }

    fun appendSelectionDecision(
        sessionId: UUID,
        kanjiId: UUID,
        batchId: UUID,
        decision: String,
        source: String,
    ) {
        db.insert(PhotoSessionKanjiDecisionTable) {
            set(it.id, UUID.randomUUID())
            set(it.photoSessionId, sessionId)
            set(it.kanjiMasterId, kanjiId)
            set(it.batchId, batchId)
            set(it.decision, decision)
            set(it.decisionSource, source)
        }
    }

    fun getSession(sessionId: UUID, userId: String): PhotoSessionRow? =
        db.from(PhotoSessionTable)
            .select()
            .where { (PhotoSessionTable.id eq sessionId) and (PhotoSessionTable.userId eq userId) }
            .map(::toPhotoSessionRow)
            .firstOrNull()

    fun getRecentSessions(userId: String): List<PhotoSessionRow> =
        db.from(PhotoSessionTable)
            .select()
            .where {
                (PhotoSessionTable.userId eq userId) and
                    (PhotoSessionTable.status inList listOf("PROCESSING", "DONE", "FAILED", "ERROR"))
            }
            .orderBy(PhotoSessionTable.createdAt.desc())
            .limit(10)
            .map(::toPhotoSessionRow)

    fun getCaptureSessions(userId: String): List<PhotoSessionRow> =
        db.from(PhotoSessionTable)
            .select()
            .where { PhotoSessionTable.userId eq userId }
            .orderBy(PhotoSessionTable.createdAt.desc(), PhotoSessionTable.id.desc())
            .map(::toPhotoSessionRow)

    fun getCaptureKanji(sessionId: UUID, userId: String): List<CaptureKanjiRow>? {
        val owned = db.from(PhotoSessionTable)
            .select(PhotoSessionTable.id)
            .where { (PhotoSessionTable.id eq sessionId) and (PhotoSessionTable.userId eq userId) }
            .limit(1)
            .map { true }
            .firstOrNull() == true
        if (!owned) return null

        return db.from(PhotoSessionKanjiTable)
            .innerJoin(KanjiMasterTable, on = PhotoSessionKanjiTable.kanjiMasterId eq KanjiMasterTable.id)
            .leftJoin(
                UserKanjiTable,
                on = (UserKanjiTable.kanjiId eq PhotoSessionKanjiTable.kanjiMasterId) and
                    (UserKanjiTable.userId eq userId),
            )
            .select(
                PhotoSessionKanjiTable.kanjiMasterId,
                PhotoSessionKanjiTable.firstSeenOrder,
                PhotoSessionKanjiTable.recommendationRank,
                PhotoSessionKanjiTable.whyUseful,
                PhotoSessionKanjiTable.excludedAt,
                KanjiMasterTable.character,
                KanjiMasterTable.onyomi,
                KanjiMasterTable.kunyomi,
                KanjiMasterTable.meanings,
                KanjiMasterTable.frequency,
                UserKanjiTable.familiarity,
            )
            .where { PhotoSessionKanjiTable.photoSessionId eq sessionId }
            .orderBy(
                PhotoSessionKanjiTable.recommendationRank.asc(),
                KanjiMasterTable.frequency.asc(),
                PhotoSessionKanjiTable.firstSeenOrder.asc(),
                PhotoSessionKanjiTable.kanjiMasterId.asc(),
            )
            .map { row ->
                CaptureKanjiRow(
                    kanjiMasterId = row[PhotoSessionKanjiTable.kanjiMasterId]!!,
                    character = row[KanjiMasterTable.character].orEmpty(),
                    onyomi = row[KanjiMasterTable.onyomi].orEmpty(),
                    kunyomi = row[KanjiMasterTable.kunyomi].orEmpty(),
                    meanings = row[KanjiMasterTable.meanings].orEmpty(),
                    whyUseful = row[PhotoSessionKanjiTable.whyUseful].orEmpty(),
                    familiarity = row[UserKanjiTable.familiarity],
                    excludedAt = row[PhotoSessionKanjiTable.excludedAt],
                )
            }
    }

    fun hasIncompleteCaptureLearningBatch(sessionId: UUID, userId: String): Boolean =
        db.from(PhotoSessionKanjiDecisionTable)
            .innerJoin(
                PhotoSessionKanjiTable,
                on = (PhotoSessionKanjiTable.photoSessionId eq PhotoSessionKanjiDecisionTable.photoSessionId) and
                    (PhotoSessionKanjiTable.kanjiMasterId eq PhotoSessionKanjiDecisionTable.kanjiMasterId),
            )
            .leftJoin(
                UserKanjiTable,
                on = (UserKanjiTable.kanjiId eq PhotoSessionKanjiDecisionTable.kanjiMasterId) and
                    (UserKanjiTable.userId eq userId),
            )
            .select(PhotoSessionKanjiDecisionTable.id)
            .where {
                (PhotoSessionKanjiDecisionTable.photoSessionId eq sessionId) and
                    (PhotoSessionKanjiDecisionTable.decision eq "LEARNING") and
                    PhotoSessionKanjiTable.excludedAt.isNull() and
                    ((UserKanjiTable.familiarity.isNull()) or (UserKanjiTable.familiarity less 5))
            }
            .limit(1)
            .map { true }
            .firstOrNull() == true

    fun hasCaptureSelectionDecisions(sessionId: UUID): Boolean =
        db.from(PhotoSessionKanjiDecisionTable)
            .select(PhotoSessionKanjiDecisionTable.id)
            .where {
                (PhotoSessionKanjiDecisionTable.photoSessionId eq sessionId) and
                    (PhotoSessionKanjiDecisionTable.decision inList listOf("LEARNING", "FAMILIAR"))
            }
            .limit(1)
            .map { true }
            .firstOrNull() == true

    fun setKanjiExcluded(sessionId: UUID, kanjiId: UUID, userId: String, excluded: Boolean): Boolean =
        db.useTransaction {
            val belongs = db.from(PhotoSessionKanjiTable)
                .innerJoin(PhotoSessionTable, on = PhotoSessionKanjiTable.photoSessionId eq PhotoSessionTable.id)
                .select(PhotoSessionKanjiTable.kanjiMasterId)
                .where {
                    (PhotoSessionKanjiTable.photoSessionId eq sessionId) and
                        (PhotoSessionKanjiTable.kanjiMasterId eq kanjiId) and
                        (PhotoSessionTable.userId eq userId)
                }
                .limit(1)
                .map { true }
                .firstOrNull() == true
            if (!belongs) return@useTransaction false
            val changedAt = Instant.now()
            db.update(PhotoSessionKanjiTable) {
                set(it.excludedAt, if (excluded) changedAt else null)
                where { (it.photoSessionId eq sessionId) and (it.kanjiMasterId eq kanjiId) }
            }
            db.insert(PhotoSessionKanjiDecisionTable) {
                set(it.id, UUID.randomUUID())
                set(it.photoSessionId, sessionId)
                set(it.kanjiMasterId, kanjiId)
                set(it.batchId, UUID.randomUUID())
                set(it.decision, if (excluded) "EXCLUDED_FALSE_POSITIVE" else "RESTORED")
                set(it.decisionSource, "REVISIT")
            }
            true
        }

    fun markRevisited(sessionId: UUID, userId: String, revisitedAt: Instant): Boolean =
        db.update(PhotoSessionTable) {
            set(it.lastRevisitedAt, revisitedAt)
            where { (it.id eq sessionId) and (it.userId eq userId) }
        } == 1

    fun getActivitySessions(
        userId: String,
        limit: Int,
        beforeCreatedAt: Instant? = null,
        beforeId: UUID? = null,
    ): List<PhotoSessionRow> {
        var condition = PhotoSessionTable.userId eq userId
        if (beforeCreatedAt != null && beforeId != null) {
            condition = condition and (
                (PhotoSessionTable.createdAt less beforeCreatedAt) or
                    ((PhotoSessionTable.createdAt eq beforeCreatedAt) and (PhotoSessionTable.id less beforeId))
                )
        }
        return db.from(PhotoSessionTable)
            .select()
            .where { condition }
            .orderBy(PhotoSessionTable.createdAt.desc(), PhotoSessionTable.id.desc())
            .limit(limit)
            .map(::toPhotoSessionRow)
    }

    fun getLatestTerminalActivityAt(userId: String): Instant? {
        val latestUpdatedAt = max(PhotoSessionTable.updatedAt).aliased("latest_terminal_at")
        return db.from(PhotoSessionTable)
            .select(latestUpdatedAt)
            .where {
                (PhotoSessionTable.userId eq userId) and
                    (PhotoSessionTable.status inList listOf("DONE", "FAILED", "ERROR"))
            }
            .map { it[latestUpdatedAt] }
            .firstOrNull()
    }

    fun getActivitySeenThrough(userId: String): Instant? =
        db.from(UserPhotoActivityStateTable)
            .select(UserPhotoActivityStateTable.seenThrough)
            .where { UserPhotoActivityStateTable.userId eq userId }
            .map { it[UserPhotoActivityStateTable.seenThrough] }
            .firstOrNull()

    fun markActivitySeen(userId: String, seenThrough: Instant) {
        val updated = db.update(UserPhotoActivityStateTable) {
            set(it.seenThrough, seenThrough)
            where { (it.userId eq userId) and (it.seenThrough less seenThrough) }
        }
        if (updated > 0) return

        val exists = db.from(UserPhotoActivityStateTable)
            .select(UserPhotoActivityStateTable.userId)
            .where { UserPhotoActivityStateTable.userId eq userId }
            .limit(1)
            .totalRecordsInAllPages > 0
        if (exists) return

        try {
            db.insert(UserPhotoActivityStateTable) {
                set(it.userId, userId)
                set(it.seenThrough, seenThrough)
            }
        } catch (error: Exception) {
            // A concurrent first acknowledgement won the insert. The condition
            // keeps this retry monotonic if our watermark is newer.
            val racedUpdate = db.update(UserPhotoActivityStateTable) {
                set(it.seenThrough, seenThrough)
                where { (it.userId eq userId) and (it.seenThrough less seenThrough) }
            }
            if (racedUpdate == 0 && getActivitySeenThrough(userId) == null) throw error
        }
    }

    fun updateSessionStatus(sessionId: String, userId: String, status: PhotoSessionStatus) {
        db.update(PhotoSessionTable) {
            set(it.status, status.name)
            where { (it.id eq UUID.fromString(sessionId)) and (it.userId eq userId) }
        }
    }

    fun markFailed(sessionId: String, userId: String, failureCode: String) {
        db.useTransaction {
            val id = UUID.fromString(sessionId)
            db.update(PhotoSessionTable) {
                set(it.status, PhotoSessionStatus.FAILED.name)
                set(it.failureCode, failureCode)
                where { (it.id eq id) and (it.userId eq userId) }
            }
            val activeAttempt = db.from(JobAttemptTable)
                .select(JobAttemptTable.id)
                .where {
                    (JobAttemptTable.jobType eq "photo_analysis") and
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
            }
        }
    }

    fun markRequiredTaskDispatchFailed(
        taskId: UUID,
        sessionId: UUID,
        userId: String,
        failureCode: String,
    ) = db.useTransaction {
        val ownsSession = db.from(PhotoSessionTable)
            .select(PhotoSessionTable.id)
            .where { (PhotoSessionTable.id eq sessionId) and (PhotoSessionTable.userId eq userId) }
            .limit(1)
            .totalRecordsInAllPages > 0
        if (!ownsSession) return@useTransaction
        db.update(PhotoSessionTaskTable) {
            set(it.status, "FAILED")
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            where {
                (it.id eq taskId) and
                    (it.photoSessionId eq sessionId) and
                    (it.status inList listOf("PENDING", "PROCESSING"))
            }
        }
        db.update(JobAttemptTable) {
            set(it.status, "failed")
            set(it.failureCode, failureCode)
            set(it.finishedAt, Instant.now())
            where {
                (it.taskId eq taskId) and
                    (it.status inList listOf("pending", "processing"))
            }
        }
        db.update(PhotoSessionTable) {
            set(it.status, PhotoSessionStatus.FAILED.name)
            set(it.processingStatus, "NEEDS_ATTENTION")
            set(it.failureCode, failureCode)
            where { (it.id eq sessionId) and (it.userId eq userId) }
        }
    }

    fun updateImageUrl(sessionId: UUID, userId: String, imageUrl: String) {
        db.update(PhotoSessionTable) {
            set(it.imageUrl, imageUrl)
            where { (it.id eq sessionId) and (it.userId eq userId) }
        }
    }

    fun prepareUserRetry(sessionId: UUID, userId: String): RequiredCaptureTask? = db.useTransaction {
        val session = db.from(PhotoSessionTable)
            .select(PhotoSessionTable.status, PhotoSessionTable.attempts)
            .where { (PhotoSessionTable.id eq sessionId) and (PhotoSessionTable.userId eq userId) }
            .map { (it[PhotoSessionTable.status].orEmpty()) to (it[PhotoSessionTable.attempts] ?: 0) }
            .firstOrNull() ?: return@useTransaction null
        if (session.first !in setOf("FAILED", "ERROR")) return@useTransaction null
        val failedTask = db.from(PhotoSessionTaskTable)
            .select(PhotoSessionTaskTable.id, PhotoSessionTaskTable.taskType)
            .where {
                (PhotoSessionTaskTable.photoSessionId eq sessionId) and
                    (PhotoSessionTaskTable.requiredForReady eq true) and
                    (PhotoSessionTaskTable.status eq "FAILED")
            }
            .orderBy(PhotoSessionTaskTable.createdAt.asc())
            .limit(1)
            .map { row -> RequiredCaptureTask(row[PhotoSessionTaskTable.id]!!, row[PhotoSessionTaskTable.taskType].orEmpty(), "FAILED") }
            .firstOrNull() ?: return@useTransaction null
        val config = AiModelConfigRepository(db).requireActive()
        val latestAttemptNumber = max(JobAttemptTable.attemptNumber).aliased("latest_photo_attempt")
        val nextAttemptNumber = (db.from(JobAttemptTable)
            .select(latestAttemptNumber)
            .where { (JobAttemptTable.jobType eq "photo_analysis") and (JobAttemptTable.jobId eq sessionId) }
            .map { it[latestAttemptNumber] }
            .firstOrNull() ?: session.second) + 1
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "photo_analysis")
            set(it.jobId, sessionId)
            set(it.taskId, failedTask.id)
            set(it.attemptNumber, nextAttemptNumber)
            set(it.status, "pending")
            set(it.trigger, "platform_retry")
            set(it.modelConfigVersion, config.version)
            set(it.modelId, if (failedTask.type == "TRANSLATION") config.translationModel else config.photoAnalysisModel)
            set(it.createdBy, userId)
        }
        db.update(PhotoSessionTable) {
            set(it.status, PhotoSessionStatus.PROCESSING.name)
            set(it.processingStatus, "PROCESSING")
            set(it.failureCode, null)
            where { it.id eq sessionId }
        }
        db.update(PhotoSessionTaskTable) {
            set(it.status, "PENDING")
            set(it.failureCode, null)
            set(it.finishedAt, null)
            where {
                (it.photoSessionId eq sessionId) and
                    (it.id eq failedTask.id)
            }
        }
        if (failedTask.type == "VISUAL_ANALYSIS") {
            db.update(PhotoSessionTaskTable) {
                set(it.status, "BLOCKED")
                set(it.failureCode, null)
                set(it.finishedAt, null)
                where {
                    (it.photoSessionId eq sessionId) and
                        (it.taskType eq "TRANSLATION") and
                        (it.status neq "DONE")
                }
            }
        }
        failedTask.copy(status = "PENDING")
    }

    private fun toPhotoSessionRow(row: QueryRowSet) = PhotoSessionRow(
        id = row[PhotoSessionTable.id].toString(),
        userId = row[PhotoSessionTable.userId] ?: "",
        imageUrl = row[PhotoSessionTable.imageUrl] ?: "",
        rawAiResponse = row[PhotoSessionTable.rawAiResponse],
        status = PhotoSessionStatus.fromDatabase(row[PhotoSessionTable.status] ?: "PROCESSING"),
        costMicrodollars = row[PhotoSessionTable.costMicrodollars],
        storagePath = row[PhotoSessionTable.storagePath],
        failureCode = row[PhotoSessionTable.failureCode],
        processingStatus = row[PhotoSessionTable.processingStatus],
        pipelineVersion = row[PhotoSessionTable.pipelineVersion],
        fullText = row[PhotoSessionTable.fullText],
        translation = row[PhotoSessionTable.translation],
        translationLanguage = row[PhotoSessionTable.translationLanguage],
        readyAt = row[PhotoSessionTable.readyAt],
        lastRevisitedAt = row[PhotoSessionTable.lastRevisitedAt],
        createdAt = row[PhotoSessionTable.createdAt],
        updatedAt = row[PhotoSessionTable.updatedAt],
    )
}

data class PhotoSessionCreation(
    val id: String,
    val created: Boolean,
    val shouldDispatch: Boolean,
)

data class RequiredCaptureTask(
    val id: UUID,
    val type: String,
    val status: String,
)

data class PhotoSessionRow(
    val id: String,
    val userId: String,
    val imageUrl: String,
    val rawAiResponse: String?,
    val status: PhotoSessionStatus,
    val costMicrodollars: Long?,
    val storagePath: String? = null,
    val failureCode: String? = null,
    val processingStatus: String? = null,
    val pipelineVersion: Int? = null,
    val fullText: String? = null,
    val translation: String? = null,
    val translationLanguage: String? = null,
    val readyAt: Instant? = null,
    val lastRevisitedAt: Instant? = null,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
)

data class CaptureKanjiRow(
    val kanjiMasterId: UUID,
    val character: String,
    val onyomi: List<String>,
    val kunyomi: List<String>,
    val meanings: List<String>,
    val whyUseful: String,
    val familiarity: Int?,
    val excludedAt: Instant?,
)
