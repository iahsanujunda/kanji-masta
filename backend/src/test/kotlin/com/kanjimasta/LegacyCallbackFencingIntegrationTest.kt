package com.kanjimasta

import com.kanjimasta.db.JobAttemptTable
import com.kanjimasta.db.PhotoSessionTable
import com.kanjimasta.internal.InternalService
import com.kanjimasta.internal.KotlinClaimConflictException
import com.kanjimasta.internal.PhotoResultRequest
import com.kanjimasta.support.PersistenceTest
import org.ktorm.dsl.*
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class LegacyCallbackFencingIntegrationTest : PersistenceTest() {
    @Test
    fun `legacy callback cannot publish over a Kotlin claim`() {
        val sessionId = UUID.randomUUID()
        db.insert(PhotoSessionTable) {
            set(it.id, sessionId)
            set(it.userId, "fenced-user")
            set(it.imageUrl, "https://images.test/fenced.jpg")
            set(it.status, "PROCESSING")
        }
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "photo_analysis")
            set(it.jobId, sessionId)
            set(it.attemptNumber, 1)
            set(it.status, "processing")
            set(it.trigger, "initial")
            set(it.claimToken, UUID.randomUUID())
            set(it.leaseUntil, Instant.now().plusSeconds(300))
            set(it.claimedBy, "kotlin-test")
            set(it.createdBy, "system")
        }

        assertFailsWith<KotlinClaimConflictException> {
            InternalService(db).handlePhotoResult(
                PhotoResultRequest(sessionId.toString(), "fenced-user", "[]", 0),
            )
        }
        assertEquals(
            "PROCESSING",
            db.from(PhotoSessionTable).select(PhotoSessionTable.status)
                .map { it[PhotoSessionTable.status] }.single(),
        )
    }
}
