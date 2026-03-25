package com.kanjimasta.modules.user

import com.kanjimasta.core.db.QuizSlotTable
import com.kanjimasta.core.db.UserKanjiTable
import com.kanjimasta.core.db.UserKanjiStatus
import com.kanjimasta.core.db.UserWordsTable
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class UserRepository(private val db: Database) {

    fun getKanjiCounts(userId: String): Pair<Int, Int> {
        var learning = 0
        var familiar = 0
        db.from(UserKanjiTable)
            .select(UserKanjiTable.status)
            .where { UserKanjiTable.userId eq userId }
            .forEach { row ->
                when (row[UserKanjiTable.status]) {
                    UserKanjiStatus.LEARNING -> learning++
                    UserKanjiStatus.FAMILIAR -> familiar++
                    null -> {}
                }
            }
        return learning to familiar
    }

    fun getWordCount(userId: String): Int {
        return db.from(UserWordsTable)
            .select(UserWordsTable.id)
            .where { UserWordsTable.userId eq userId }
            .totalRecordsInAllPages
    }

    fun getStreak(userId: String): Int {
        val zone = ZoneId.of("Asia/Tokyo")
        val today = LocalDate.now(zone)

        val dateHasActivity = mutableSetOf<LocalDate>()
        db.from(QuizSlotTable)
            .select(QuizSlotTable.slotStart, QuizSlotTable.completed)
            .where { QuizSlotTable.userId eq userId }
            .orderBy(QuizSlotTable.slotStart.desc())
            .limit(100)
            .forEach { row ->
                val completed = row[QuizSlotTable.completed] ?: 0
                if (completed > 0) {
                    val start = row[QuizSlotTable.slotStart] ?: return@forEach
                    val date = start.atZone(zone).toLocalDate()
                    dateHasActivity.add(date)
                }
            }

        var streak = 0
        var expectedDate = today
        while (dateHasActivity.contains(expectedDate)) {
            streak++
            expectedDate = expectedDate.minusDays(1)
        }
        return streak
    }
}
