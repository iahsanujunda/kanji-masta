package com.kanjimasta.modules.quiz

import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.time.Instant
import java.util.UUID

// Data classes for typed results
data class SlotRow(val id: String, val slotStart: Instant, val slotEnd: Instant, val completed: Int, val allowance: Int)
data class UserWordRow(
    val id: String, val familiarity: Int, val currentTier: String,
    val kanjiIds: List<String>, val wordMasterId: String,
    val word: String, val reading: String, val meanings: List<String>,
    val nextReview: Instant? = null,
)
data class QuizBankRow(
    val id: String, val quizType: String, val prompt: String, val target: String,
    val furigana: String?, val answer: String, val explanation: String?,
    val servedCount: Int, val wordId: String, val kanjiId: String,
)
data class DistractorRow(val id: String, val distractors: List<String>, val generation: Int)
data class WordFamiliarityRow(val id: String, val familiarity: Int, val nextReview: Instant?)

class QuizRepository(private val db: Database) {

    // --- Slot ---

    fun getActiveSlot(userId: String): SlotRow? {
        return db.from(QuizSlotTable)
            .select()
            .where { QuizSlotTable.userId eq userId }
            .orderBy(QuizSlotTable.slotEnd.desc())
            .limit(1)
            .map { row ->
                SlotRow(
                    id = row[QuizSlotTable.id].toString(),
                    slotStart = row[QuizSlotTable.slotStart]!!,
                    slotEnd = row[QuizSlotTable.slotEnd]!!,
                    completed = row[QuizSlotTable.completed] ?: 0,
                    allowance = row[QuizSlotTable.allowance] ?: 5,
                )
            }
            .firstOrNull()
    }

    fun createSlot(userId: String, slotStart: String, slotEnd: String, allowance: Int): String? {
        val id = UUID.randomUUID()
        db.insert(QuizSlotTable) {
            set(it.id, id)
            set(it.userId, userId)
            set(it.slotStart, Instant.parse(slotStart))
            set(it.slotEnd, Instant.parse(slotEnd))
            set(it.startedAt, Instant.parse(slotStart))
            set(it.allowance, allowance)
        }
        return id.toString()
    }

    fun incrementSlotCompleted(slotId: String) {
        db.update(QuizSlotTable) {
            set(it.completed, it.completed + 1)
            where { it.id eq UUID.fromString(slotId) }
        }
    }

    // --- Settings ---

    fun getUserSettings(userId: String): Pair<Int, Int> {
        val row = db.from(UserSettingsTable)
            .select()
            .where { UserSettingsTable.userId eq userId }
            .map { r ->
                (r[UserSettingsTable.quizAllowancePerSlot] ?: 5) to (r[UserSettingsTable.slotDurationHours] ?: 6)
            }
            .firstOrNull()
        return row ?: (5 to 6)
    }

    // --- Word Selection ---

    private fun mapUserWordRow(row: QueryRowSet): UserWordRow {
        return UserWordRow(
            id = row[UserWordsTable.id].toString(),
            familiarity = row[UserWordsTable.familiarity] ?: 0,
            currentTier = row[UserWordsTable.currentTier]?.name ?: "MEANING_RECALL",
            kanjiIds = row[UserWordsTable.kanjiIds] ?: emptyList(),
            wordMasterId = row[UserWordsTable.wordMasterId].toString(),
            word = row[WordMasterTable.word] ?: "",
            reading = row[WordMasterTable.reading] ?: "",
            meanings = row[WordMasterTable.meanings] ?: emptyList(),
            nextReview = row[UserWordsTable.nextReview],
        )
    }

    fun getOverdueWords(userId: String, limit: Int): List<UserWordRow> {
        val now = Instant.now()
        return db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select()
            .where {
                (UserWordsTable.userId eq userId) and
                    (UserWordsTable.nextReview less now)
            }
            .orderBy(UserWordsTable.nextReview.asc())
            .limit(limit)
            .map(::mapUserWordRow)
    }

    fun getNewWords(userId: String, limit: Int): List<UserWordRow> {
        return db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select()
            .where {
                (UserWordsTable.userId eq userId) and
                    (UserWordsTable.familiarity eq 0)
            }
            .limit(limit)
            .map(::mapUserWordRow)
    }

    fun getLearningWords(userId: String, limit: Int): List<UserWordRow> {
        return db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select()
            .where { UserWordsTable.userId eq userId }
            .limit(limit)
            .map(::mapUserWordRow)
    }

    // --- Quiz Lookup ---

    private fun mapQuizBankRow(row: QueryRowSet): QuizBankRow {
        return QuizBankRow(
            id = row[QuizBankTable.id].toString(),
            quizType = row[QuizBankTable.quizType]?.name ?: "MEANING_RECALL",
            prompt = row[QuizBankTable.prompt] ?: "",
            target = row[QuizBankTable.target] ?: "",
            furigana = row[QuizBankTable.furigana],
            answer = row[QuizBankTable.answer] ?: "",
            explanation = row[QuizBankTable.explanation],
            servedCount = row[QuizBankTable.servedCount] ?: 0,
            wordId = row[QuizBankTable.wordId].toString(),
            kanjiId = row[QuizBankTable.kanjiId].toString(),
        )
    }

    fun getQuizForWordMaster(wordMasterId: String, quizType: String): QuizBankRow? {
        return db.from(QuizBankTable)
            .select()
            .where {
                (QuizBankTable.wordId eq UUID.fromString(wordMasterId)) and
                    (QuizBankTable.quizType eq QuizType.valueOf(quizType))
            }
            .limit(1)
            .map(::mapQuizBankRow)
            .firstOrNull()
    }

    fun getAnyQuizForWordMaster(wordMasterId: String): QuizBankRow? {
        return db.from(QuizBankTable)
            .select()
            .where { QuizBankTable.wordId eq UUID.fromString(wordMasterId) }
            .limit(1)
            .map(::mapQuizBankRow)
            .firstOrNull()
    }

    // --- Distractor ---

    private fun mapDistractorRow(row: QueryRowSet): DistractorRow {
        return DistractorRow(
            id = row[QuizDistractorTable.id].toString(),
            distractors = row[QuizDistractorTable.distractors] ?: emptyList(),
            generation = row[QuizDistractorTable.generation] ?: 0,
        )
    }

    fun getUnservedDistractor(quizId: String): DistractorRow? {
        return db.from(QuizDistractorTable)
            .select()
            .where {
                (QuizDistractorTable.quizId eq UUID.fromString(quizId)) and
                    (QuizDistractorTable.servedAt.isNull())
            }
            .orderBy(QuizDistractorTable.generation.desc())
            .limit(1)
            .map(::mapDistractorRow)
            .firstOrNull()
    }

    fun getLatestDistractor(quizId: String): DistractorRow? {
        return db.from(QuizDistractorTable)
            .select()
            .where { QuizDistractorTable.quizId eq UUID.fromString(quizId) }
            .orderBy(QuizDistractorTable.generation.desc())
            .limit(1)
            .map(::mapDistractorRow)
            .firstOrNull()
    }

    fun markDistractorServed(distractorId: String) {
        db.update(QuizDistractorTable) {
            set(it.servedAt, Instant.now())
            where { it.id eq UUID.fromString(distractorId) }
        }
    }

    // --- Random candidates for distractor augmentation ---

    fun getRandomMeanings(limit: Int): List<String> {
        return db.from(KanjiMasterTable)
            .select(KanjiMasterTable.meanings)
            .limit(limit)
            .flatMap { it[KanjiMasterTable.meanings] ?: emptyList() }
            .shuffled()
            .take(limit * 2)
    }

    fun getRandomReadings(limit: Int): List<String> {
        return db.from(KanjiMasterTable)
            .select(KanjiMasterTable.onyomi, KanjiMasterTable.kunyomi)
            .limit(limit)
            .flatMap {
                (it[KanjiMasterTable.onyomi] ?: emptyList()) +
                    (it[KanjiMasterTable.kunyomi] ?: emptyList())
            }
            .shuffled()
            .take(limit * 2)
    }

    fun getRandomCharacters(limit: Int): List<String> {
        return db.from(KanjiMasterTable)
            .select(KanjiMasterTable.character)
            .limit(limit * 3)
            .mapNotNull { it[KanjiMasterTable.character] }
            .shuffled()
            .take(limit * 2)
    }

    fun getRandomUserWords(userId: String, limit: Int): List<String> {
        return db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select(WordMasterTable.word)
            .where { UserWordsTable.userId eq userId }
            .limit(limit * 3)
            .mapNotNull { it[WordMasterTable.word] }
            .shuffled()
            .take(limit * 2)
    }

    // --- Result submission ---

    fun getQuizById(quizId: String): QuizBankRow? {
        return db.from(QuizBankTable)
            .select()
            .where { QuizBankTable.id eq UUID.fromString(quizId) }
            .map(::mapQuizBankRow)
            .firstOrNull()
    }

    fun getUserWordByWordMaster(userId: String, wordMasterId: String): UserWordRow? {
        return db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select()
            .where {
                (UserWordsTable.userId eq userId) and
                    (UserWordsTable.wordMasterId eq UUID.fromString(wordMasterId))
            }
            .limit(1)
            .map(::mapUserWordRow)
            .firstOrNull()
    }

    fun getUserWordById(wordId: String): UserWordRow? {
        return db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select()
            .where { UserWordsTable.id eq UUID.fromString(wordId) }
            .map(::mapUserWordRow)
            .firstOrNull()
    }

    fun incrementServedCount(quizId: String) {
        db.update(QuizBankTable) {
            set(it.servedCount, it.servedCount + 1)
            where { it.id eq UUID.fromString(quizId) }
        }
    }

    fun insertQuizServe(
        quizId: String, distractorSetId: String, slotId: String,
        userId: String, wordFamiliarityAtServe: Int, correct: Boolean,
    ) {
        db.insert(QuizServeTable) {
            set(it.quizId, UUID.fromString(quizId))
            set(it.distractorSetId, UUID.fromString(distractorSetId))
            set(it.slotId, UUID.fromString(slotId))
            set(it.userId, userId)
            set(it.wordFamiliarityAtServe, wordFamiliarityAtServe)
            set(it.correct, correct)
        }
    }

    fun updateWordFamiliarity(wordId: String, familiarity: Int, currentTier: String, nextReview: String) {
        db.update(UserWordsTable) {
            set(it.familiarity, familiarity)
            set(it.currentTier, QuizType.valueOf(currentTier))
            set(it.nextReview, Instant.parse(nextReview))
            where { it.id eq UUID.fromString(wordId) }
        }
    }

    fun getWordsForKanji(userId: String, kanjiId: String): List<WordFamiliarityRow> {
        // Fetch user words and filter by kanjiIds array containing this kanjiId
        return db.from(UserWordsTable)
            .select(UserWordsTable.id, UserWordsTable.familiarity, UserWordsTable.nextReview, UserWordsTable.kanjiIds)
            .where { UserWordsTable.userId eq userId }
            .limit(100)
            .mapNotNull { row ->
                val kanjiIds = row[UserWordsTable.kanjiIds] ?: emptyList()
                if (kanjiId !in kanjiIds) return@mapNotNull null
                WordFamiliarityRow(
                    id = row[UserWordsTable.id].toString(),
                    familiarity = row[UserWordsTable.familiarity] ?: 0,
                    nextReview = row[UserWordsTable.nextReview],
                )
            }
    }

    fun updateKanjiFamiliarity(userId: String, kanjiId: String, familiarity: Int, currentTier: String, nextReview: String?) {
        db.update(UserKanjiTable) {
            set(it.familiarity, familiarity)
            set(it.currentTier, QuizType.valueOf(currentTier))
            if (nextReview != null) set(it.nextReview, Instant.parse(nextReview))
            where {
                (it.userId eq userId) and (it.kanjiId eq UUID.fromString(kanjiId))
            }
        }
    }
}
