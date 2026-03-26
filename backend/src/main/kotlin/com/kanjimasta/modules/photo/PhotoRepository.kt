package com.kanjimasta.modules.photo

import com.kanjimasta.core.db.PhotoSessionTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.util.UUID

class PhotoRepository(private val db: Database) {

    fun createSession(userId: String, imageUrl: String): String {
        val id = UUID.randomUUID()
        db.insert(PhotoSessionTable) {
            set(it.id, id)
            set(it.userId, userId)
            set(it.imageUrl, imageUrl)
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
                )
            }
            .firstOrNull()
    }
}

data class PhotoSessionRow(
    val id: String,
    val rawAiResponse: String?,
    val status: String,
    val costMicrodollars: Long?,
)
