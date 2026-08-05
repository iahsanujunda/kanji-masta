package com.kanjimasta.modules.photo

import com.kanjimasta.core.db.PhotoSessionTable
import com.kanjimasta.core.db.PhotoSessionStatus
import com.kanjimasta.core.db.UserPhotoActivityStateTable
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
    ): PhotoSessionCreation {
        val id = UUID.randomUUID()
        if (clientCaptureId == null) {
            val insertedId = db.insertReturning(PhotoSessionTable, PhotoSessionTable.id) {
                set(it.id, id)
                set(it.userId, userId)
                set(it.imageUrl, imageUrl)
                if (storagePath != null) set(it.storagePath, storagePath)
            }
            return PhotoSessionCreation(insertedId.toString(), created = true, shouldDispatch = true)
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
        val shouldDispatch = created || db.from(PhotoSessionTable)
            .select(PhotoSessionTable.status, PhotoSessionTable.attempts)
            .where { PhotoSessionTable.id eq returnedId }
            .map { row ->
                row[PhotoSessionTable.status] == PhotoSessionStatus.PROCESSING.name &&
                    row[PhotoSessionTable.attempts] == 0
            }
            .firstOrNull() == true
        return PhotoSessionCreation(returnedId.toString(), created, shouldDispatch)
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
        db.update(PhotoSessionTable) {
            set(it.status, PhotoSessionStatus.FAILED.name)
            set(it.failureCode, failureCode)
            set(it.attempts, it.attempts + 1)
            where { (it.id eq UUID.fromString(sessionId)) and (it.userId eq userId) }
        }
    }

    fun updateImageUrl(sessionId: UUID, userId: String, imageUrl: String) {
        db.update(PhotoSessionTable) {
            set(it.imageUrl, imageUrl)
            where { (it.id eq sessionId) and (it.userId eq userId) }
        }
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
        createdAt = row[PhotoSessionTable.createdAt],
        updatedAt = row[PhotoSessionTable.updatedAt],
    )
}

data class PhotoSessionCreation(
    val id: String,
    val created: Boolean,
    val shouldDispatch: Boolean,
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
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null,
)
