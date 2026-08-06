package com.kanjimasta

import com.kanjimasta.db.UserWordsTable
import com.kanjimasta.db.WordMasterTable
import com.kanjimasta.db.WordSource
import com.kanjimasta.support.PersistenceTest
import org.ktorm.dsl.insert
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertFails

class ProductionSchemaIntegrationTest : PersistenceTest() {

    @Test
    fun `a learner cannot persist a negative consecutive failure count`() {
        val wordMasterId = UUID.randomUUID()
        db.insert(WordMasterTable) {
            set(it.id, wordMasterId)
            set(it.word, "schema-${wordMasterId.toString().take(8)}")
            set(it.reading, "schema")
        }

        assertFails {
            db.insert(UserWordsTable) {
                set(it.userId, "schema-test-user")
                set(it.wordMasterId, wordMasterId)
                set(it.source, WordSource.PHOTO)
                set(it.consecutiveFailures, -1)
            }
        }
    }
}
