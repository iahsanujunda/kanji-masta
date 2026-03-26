package com.kanjimasta.modules.photo

import com.kanjimasta.core.db.PhotoSessionTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.time.Instant
import java.util.UUID

class PhotoRepository(private val db: Database) {

    fun createSession(userId: String, imageUrl: String, storagePath: String? = null): String {
        val id = UUID.randomUUID()
        db.insert(PhotoSessionTable) {
            set(it.id, id)
            set(it.userId, userId)
            set(it.imageUrl, imageUrl)
            if (storagePath != null) set(it.storagePath, storagePath)
        }
        return id.toString()
    }

    fun getSession(sessionId: String): PhotoSessionRow? {
        return db.from(PhotoSessionTable)
            .select()
            .where { PhotoSessionTable.id eq UUID.fromString(sessionId) }
            .map { row ->
                PhotoSessionRow(
                    id = row[PhotoSessionTable.id].toString(),
                    rawAiResponse = row[PhotoSessionTable.rawAiResponse],
                    status = row[PhotoSessionTable.status] ?: "PROCESSING",
                    costMicrodollars = row[PhotoSessionTable.costMicrodollars],
                    storagePath = row[PhotoSessionTable.storagePath],
                    createdAt = row[PhotoSessionTable.createdAt],
                )
            }
            .firstOrNull()
    }

    fun getRecentSessions(userId: String): List<PhotoSessionRow> {
        return db.from(PhotoSessionTable)
            .select()
            .where {
                (PhotoSessionTable.userId eq userId) and
                    ((PhotoSessionTable.status eq "PROCESSING") or (PhotoSessionTable.status eq "DONE"))
            }
            .orderBy(PhotoSessionTable.createdAt.desc())
            .limit(10)
            .map { row ->
                PhotoSessionRow(
                    id = row[PhotoSessionTable.id].toString(),
                    rawAiResponse = row[PhotoSessionTable.rawAiResponse],
                    status = row[PhotoSessionTable.status] ?: "PROCESSING",
                    costMicrodollars = row[PhotoSessionTable.costMicrodollars],
                    storagePath = row[PhotoSessionTable.storagePath],
                    createdAt = row[PhotoSessionTable.createdAt],
                )
            }
    }

    fun updateSessionStatus(sessionId: String, status: String) {
        db.update(PhotoSessionTable) {
            set(it.status, status)
            where { it.id eq UUID.fromString(sessionId) }
        }
    }
}

data class PhotoSessionRow(
    val id: String,
    val rawAiResponse: String?,
    val status: String,
    val costMicrodollars: Long?,
    val storagePath: String? = null,
    val createdAt: Instant? = null,
)
