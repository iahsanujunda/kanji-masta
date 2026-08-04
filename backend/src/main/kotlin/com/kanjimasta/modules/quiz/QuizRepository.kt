package com.kanjimasta.modules.quiz

import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.support.postgresql.LockingMode
import org.ktorm.support.postgresql.locking
import java.time.Instant
import java.util.UUID

data class SlotRow(
    val id: String,
    val slotStart: Instant,
    val slotEnd: Instant,
    val completed: Int,
    val allowance: Int,
    val status: String,
    val version: Int,
)

data class UserWordRow(
    val id: String,
    val familiarity: Int,
    val currentTier: String,
    val kanjiIds: List<String>,
    val wordMasterId: String,
    val word: String,
    val reading: String,
    val meanings: List<String>,
    val nextReview: Instant? = null,
    val introducedAt: Instant? = null,
    val consecutiveFailures: Int = 0,
)

data class QuizBankRow(
    val id: String,
    val quizType: String,
    val prompt: String,
    val target: String,
    val furigana: String?,
    val answer: String,
    val explanation: String?,
    val servedCount: Int,
    val wordId: String,
    val kanjiId: String,
)

data class DistractorRow(val id: String, val distractors: List<String>, val generation: Int)
data class WordFamiliarityRow(val id: String, val familiarity: Int, val nextReview: Instant?)

data class SessionCardRow(
    val id: String,
    val slotId: String,
    val userId: String,
    val position: Int,
    val cardType: String,
    val status: String,
    val userWordId: String,
    val quizId: String?,
    val distractorSetId: String?,
    val learningStep: Int?,
    val introductionKind: String?,
    val options: List<String>,
    val submissionId: String?,
)

data class ServeRow(
    val cardId: String,
    val submissionId: String,
    val correct: Boolean,
)

data class SummaryRow(
    val cardId: String,
    val userWordId: String,
    val learningStep: Int?,
    val introductionKind: String?,
    val correct: Boolean,
)

class QuizRepository(private val db: Database) {
    fun <T> transaction(block: () -> T): T = db.useTransaction { block() }

    private fun mapSlot(row: QueryRowSet) = SlotRow(
        id = row[QuizSlotTable.id].toString(),
        slotStart = row[QuizSlotTable.slotStart]!!,
        slotEnd = row[QuizSlotTable.slotEnd]!!,
        completed = row[QuizSlotTable.completed] ?: 0,
        allowance = row[QuizSlotTable.allowance] ?: 5,
        status = row[QuizSlotTable.status]?.name ?: "ACTIVE",
        version = row[QuizSlotTable.version] ?: 0,
    )

    fun getActiveSlot(userId: String, lock: Boolean = false): SlotRow? {
        var query = db.from(QuizSlotTable)
            .select()
            .where {
                (QuizSlotTable.userId eq userId) and
                    (QuizSlotTable.status eq QuizSlotStatus.ACTIVE)
            }
            .orderBy(QuizSlotTable.slotEnd.desc())
            .limit(1)
        if (lock) query = query.locking(LockingMode.FOR_UPDATE)
        return query.map(::mapSlot).firstOrNull()
    }

    fun getSlot(userId: String, slotId: String, lock: Boolean = false): SlotRow? {
        var query = db.from(QuizSlotTable)
            .select()
            .where {
                (QuizSlotTable.userId eq userId) and
                    (QuizSlotTable.id eq UUID.fromString(slotId))
            }
            .limit(1)
        if (lock) query = query.locking(LockingMode.FOR_UPDATE)
        return query.map(::mapSlot).firstOrNull()
    }

    fun getLatestFinishedSlot(userId: String): SlotRow? = db.from(QuizSlotTable)
        .select()
        .where {
            (QuizSlotTable.userId eq userId) and
                (QuizSlotTable.status neq QuizSlotStatus.ACTIVE)
        }
        .orderBy(QuizSlotTable.slotEnd.desc())
        .limit(1)
        .map(::mapSlot)
        .firstOrNull()

    fun createSlot(userId: String, start: Instant, end: Instant, allowance: Int): SlotRow {
        val id = UUID.randomUUID()
        db.insert(QuizSlotTable) {
            set(it.id, id)
            set(it.userId, userId)
            set(it.slotStart, start)
            set(it.slotEnd, end)
            set(it.startedAt, start)
            set(it.completed, 0)
            set(it.allowance, allowance)
            set(it.status, QuizSlotStatus.ACTIVE)
            set(it.version, 0)
        }
        return SlotRow(id.toString(), start, end, 0, allowance, "ACTIVE", 0)
    }

    fun updateSlot(
        slotId: String,
        completed: Int,
        allowance: Int,
        status: QuizSlotStatus,
        version: Int,
        completedAt: Instant? = null,
    ) {
        db.update(QuizSlotTable) {
            set(it.completed, completed)
            set(it.allowance, allowance)
            set(it.status, status)
            set(it.version, version)
            set(it.completedAt, completedAt)
            where { it.id eq UUID.fromString(slotId) }
        }
    }

    fun expireSlot(slotId: String) {
        db.update(QuizSlotTable) {
            set(it.status, QuizSlotStatus.EXPIRED)
            set(it.version, it.version + 1)
            where { it.id eq UUID.fromString(slotId) }
        }
    }

    fun getUserSettings(userId: String): Pair<Int, Int> = db.from(UserSettingsTable)
        .select(UserSettingsTable.quizAllowancePerSlot, UserSettingsTable.slotDurationHours)
        .where { UserSettingsTable.userId eq userId }
        .map {
            (it[UserSettingsTable.quizAllowancePerSlot] ?: 5) to
                (it[UserSettingsTable.slotDurationHours] ?: 6)
        }
        .firstOrNull() ?: (5 to 6)

    private fun mapUserWord(row: QueryRowSet) = UserWordRow(
        id = row[UserWordsTable.id].toString(),
        familiarity = row[UserWordsTable.familiarity] ?: 0,
        currentTier = row[UserWordsTable.currentTier]?.name ?: "MEANING_RECALL",
        kanjiIds = row[UserWordsTable.kanjiIds] ?: emptyList(),
        wordMasterId = row[UserWordsTable.wordMasterId].toString(),
        word = row[WordMasterTable.word] ?: "",
        reading = row[WordMasterTable.reading] ?: "",
        meanings = row[WordMasterTable.meanings] ?: emptyList(),
        nextReview = row[UserWordsTable.nextReview],
        introducedAt = row[UserWordsTable.introducedAt],
        consecutiveFailures = row[UserWordsTable.consecutiveFailures] ?: 0,
    )

    fun getIntroductionWords(userId: String, limit: Int): List<UserWordRow> = db.from(UserWordsTable)
        .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
        .select()
        .where {
            (UserWordsTable.userId eq userId) and UserWordsTable.introducedAt.isNull()
        }
        .orderBy(UserWordsTable.consecutiveFailures.desc(), UserWordsTable.createdAt.asc())
        .limit(limit)
        .map(::mapUserWord)

    fun getOverdueWords(userId: String, limit: Int): List<UserWordRow> = db.from(UserWordsTable)
        .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
        .select()
        .where {
            (UserWordsTable.userId eq userId) and
                UserWordsTable.introducedAt.isNotNull() and
                (UserWordsTable.nextReview less Instant.now())
        }
        .orderBy(UserWordsTable.nextReview.asc())
        .limit(limit)
        .map(::mapUserWord)

    fun getLearningWords(userId: String, limit: Int): List<UserWordRow> = db.from(UserWordsTable)
        .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
        .select()
        .where {
            (UserWordsTable.userId eq userId) and UserWordsTable.introducedAt.isNotNull()
        }
        .orderBy(UserWordsTable.familiarity.asc(), UserWordsTable.nextReview.asc())
        .limit(limit)
        .map(::mapUserWord)

    fun getUserWord(userId: String, wordId: String): UserWordRow? = db.from(UserWordsTable)
        .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
        .select()
        .where {
            (UserWordsTable.userId eq userId) and
                (UserWordsTable.id eq UUID.fromString(wordId))
        }
        .limit(1)
        .map(::mapUserWord)
        .firstOrNull()

    private fun mapQuiz(row: QueryRowSet) = QuizBankRow(
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

    fun getQuizForWord(wordMasterId: String, quizType: String): QuizBankRow? = db.from(QuizBankTable)
        .select()
        .where {
            (QuizBankTable.wordId eq UUID.fromString(wordMasterId)) and
                (QuizBankTable.quizType eq QuizType.valueOf(quizType))
        }
        .limit(1)
        .map(::mapQuiz)
        .firstOrNull()

    fun getAnyQuizForWord(wordMasterId: String): QuizBankRow? = db.from(QuizBankTable)
        .select()
        .where { QuizBankTable.wordId eq UUID.fromString(wordMasterId) }
        .orderBy(QuizBankTable.servedCount.asc())
        .limit(1)
        .map(::mapQuiz)
        .firstOrNull()

    fun getQuiz(quizId: String): QuizBankRow? = db.from(QuizBankTable)
        .select()
        .where { QuizBankTable.id eq UUID.fromString(quizId) }
        .limit(1)
        .map(::mapQuiz)
        .firstOrNull()

    fun getExampleQuiz(wordMasterId: String): QuizBankRow? = getQuizForWord(wordMasterId, "BOLD_WORD_MEANING")

    private fun mapDistractor(row: QueryRowSet) = DistractorRow(
        id = row[QuizDistractorTable.id].toString(),
        distractors = row[QuizDistractorTable.distractors] ?: emptyList(),
        generation = row[QuizDistractorTable.generation] ?: 0,
    )

    fun getDistractor(quizId: String): DistractorRow? = db.from(QuizDistractorTable)
        .select()
        .where { QuizDistractorTable.quizId eq UUID.fromString(quizId) }
        .orderBy(QuizDistractorTable.servedAt.asc(), QuizDistractorTable.generation.desc())
        .limit(1)
        .map(::mapDistractor)
        .firstOrNull()

    fun getRandomMeanings(limit: Int): List<String> = db.from(KanjiMasterTable)
        .select(KanjiMasterTable.meanings).limit(limit * 3)
        .flatMap { it[KanjiMasterTable.meanings] ?: emptyList() }.shuffled().take(limit)

    fun getRandomReadings(limit: Int): List<String> = db.from(KanjiMasterTable)
        .select(KanjiMasterTable.onyomi, KanjiMasterTable.kunyomi).limit(limit * 3)
        .flatMap { (it[KanjiMasterTable.onyomi] ?: emptyList()) + (it[KanjiMasterTable.kunyomi] ?: emptyList()) }
        .shuffled().take(limit)

    fun getRandomCharacters(limit: Int): List<String> = db.from(KanjiMasterTable)
        .select(KanjiMasterTable.character).limit(limit * 3)
        .mapNotNull { it[KanjiMasterTable.character] }.shuffled().take(limit)

    fun getRandomUserWords(userId: String, limit: Int): List<String> = db.from(UserWordsTable)
        .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
        .select(WordMasterTable.word)
        .where { UserWordsTable.userId eq userId }
        .limit(limit * 3)
        .mapNotNull { it[WordMasterTable.word] }.shuffled().take(limit)

    fun getKanjiBreakdown(kanjiIds: List<String>): List<KanjiBreakdownItem> {
        if (kanjiIds.isEmpty()) return emptyList()
        val ids = kanjiIds.map(UUID::fromString)
        val rows = db.from(KanjiMasterTable)
            .select(KanjiMasterTable.id, KanjiMasterTable.character, KanjiMasterTable.meanings)
            .where { KanjiMasterTable.id inList ids }
            .map {
                it[KanjiMasterTable.id].toString() to KanjiBreakdownItem(
                    character = it[KanjiMasterTable.character] ?: "",
                    meaning = (it[KanjiMasterTable.meanings] ?: emptyList()).firstOrNull() ?: "",
                )
            }.toMap()
        return kanjiIds.mapNotNull(rows::get)
    }

    fun insertCard(
        slotId: String,
        userId: String,
        position: Int,
        cardType: SessionCardType,
        userWordId: String,
        quizId: String? = null,
        distractorSetId: String? = null,
        learningStep: Int? = null,
        introductionKind: IntroductionKind? = null,
        options: List<String> = emptyList(),
    ): String {
        val id = UUID.randomUUID()
        db.insert(QuizSessionCardTable) {
            set(it.id, id)
            set(it.slotId, UUID.fromString(slotId))
            set(it.userId, userId)
            set(it.position, position)
            set(it.cardType, cardType)
            set(it.status, SessionCardStatus.PENDING)
            set(it.userWordId, UUID.fromString(userWordId))
            quizId?.let { value -> set(it.quizId, UUID.fromString(value)) }
            distractorSetId?.let { value -> set(it.distractorSetId, UUID.fromString(value)) }
            learningStep?.let { value -> set(it.learningStep, value) }
            introductionKind?.let { value -> set(it.introductionKind, value) }
            set(it.options, options)
        }
        return id.toString()
    }

    private fun mapCard(row: QueryRowSet) = SessionCardRow(
        id = row[QuizSessionCardTable.id].toString(),
        slotId = row[QuizSessionCardTable.slotId].toString(),
        userId = row[QuizSessionCardTable.userId] ?: "",
        position = row[QuizSessionCardTable.position] ?: 0,
        cardType = row[QuizSessionCardTable.cardType]?.name ?: "QUIZ",
        status = row[QuizSessionCardTable.status]?.name ?: "PENDING",
        userWordId = row[QuizSessionCardTable.userWordId].toString(),
        quizId = row[QuizSessionCardTable.quizId]?.toString(),
        distractorSetId = row[QuizSessionCardTable.distractorSetId]?.toString(),
        learningStep = row[QuizSessionCardTable.learningStep],
        introductionKind = row[QuizSessionCardTable.introductionKind]?.name,
        options = row[QuizSessionCardTable.options] ?: emptyList(),
        submissionId = row[QuizSessionCardTable.submissionId]?.toString(),
    )

    fun countCards(slotId: String): Int = db.from(QuizSessionCardTable)
        .select(count())
        .where { QuizSessionCardTable.slotId eq UUID.fromString(slotId) }
        .map { it.getInt(1) }
        .first()

    fun getCurrentCard(slotId: String): SessionCardRow? = db.from(QuizSessionCardTable)
        .select()
        .where {
            (QuizSessionCardTable.slotId eq UUID.fromString(slotId)) and
                (QuizSessionCardTable.status eq SessionCardStatus.PENDING)
        }
        .orderBy(QuizSessionCardTable.position.asc())
        .limit(1)
        .map(::mapCard)
        .firstOrNull()

    fun getCards(slotId: String): List<SessionCardRow> = db.from(QuizSessionCardTable)
        .select()
        .where { QuizSessionCardTable.slotId eq UUID.fromString(slotId) }
        .orderBy(QuizSessionCardTable.position.asc())
        .map(::mapCard)

    fun getIntroductionBySubmission(slotId: String, submissionId: String): SessionCardRow? =
        db.from(QuizSessionCardTable).select().where {
            (QuizSessionCardTable.slotId eq UUID.fromString(slotId)) and
                (QuizSessionCardTable.submissionId eq UUID.fromString(submissionId))
        }.limit(1).map(::mapCard).firstOrNull()

    fun completeIntroduction(cardId: String, submissionId: String) {
        db.update(QuizSessionCardTable) {
            set(it.status, SessionCardStatus.COMPLETED)
            set(it.submissionId, UUID.fromString(submissionId))
            set(it.completedAt, Instant.now())
            where { it.id eq UUID.fromString(cardId) }
        }
    }

    fun completeQuizCard(cardId: String) {
        db.update(QuizSessionCardTable) {
            set(it.status, SessionCardStatus.COMPLETED)
            set(it.completedAt, Instant.now())
            where { it.id eq UUID.fromString(cardId) }
        }
    }

    fun dropCard(cardId: String) {
        db.update(QuizSessionCardTable) {
            set(it.status, SessionCardStatus.DROPPED)
            where { it.id eq UUID.fromString(cardId) }
        }
    }

    fun dropPendingLearningCards(slotId: String): Int = db.update(QuizSessionCardTable) {
        set(it.status, SessionCardStatus.DROPPED)
        where {
            (it.slotId eq UUID.fromString(slotId)) and
                (it.status eq SessionCardStatus.PENDING) and
                ((it.cardType eq SessionCardType.INTRODUCTION) or it.learningStep.isNotNull())
        }
    }

    fun acknowledgeWord(wordId: String, nextReview: Instant) {
        db.update(UserWordsTable) {
            set(it.introducedAt, Instant.now())
            set(it.consecutiveFailures, 0)
            set(it.nextReview, nextReview)
            where { it.id eq UUID.fromString(wordId) }
        }
    }

    fun updateWord(
        wordId: String,
        familiarity: Int,
        tier: String,
        nextReview: Instant?,
        failures: Int,
        introducedAt: Instant?,
    ) {
        db.update(UserWordsTable) {
            set(it.familiarity, familiarity)
            set(it.currentTier, QuizType.valueOf(tier))
            set(it.nextReview, nextReview)
            set(it.consecutiveFailures, failures)
            set(it.introducedAt, introducedAt)
            where { it.id eq UUID.fromString(wordId) }
        }
    }

    fun insertServe(
        card: SessionCardRow,
        slotId: String,
        userId: String,
        familiarity: Int,
        correct: Boolean,
        submissionId: String,
        answeredInMs: Int?,
    ) {
        db.insert(QuizServeTable) {
            set(it.quizId, UUID.fromString(card.quizId!!))
            card.distractorSetId?.let { value -> set(it.distractorSetId, UUID.fromString(value)) }
            set(it.slotId, UUID.fromString(slotId))
            set(it.userId, userId)
            set(it.wordFamiliarityAtServe, familiarity)
            set(it.correct, correct)
            set(it.sessionCardId, UUID.fromString(card.id))
            set(it.submissionId, UUID.fromString(submissionId))
            answeredInMs?.let { value -> set(it.answeredInMs, value.coerceAtLeast(0)) }
        }
    }

    fun getServeBySubmission(slotId: String, submissionId: String): ServeRow? = db.from(QuizServeTable)
        .select(QuizServeTable.sessionCardId, QuizServeTable.submissionId, QuizServeTable.correct)
        .where {
            (QuizServeTable.slotId eq UUID.fromString(slotId)) and
                (QuizServeTable.submissionId eq UUID.fromString(submissionId))
        }
        .limit(1)
        .map {
            ServeRow(
                cardId = it[QuizServeTable.sessionCardId].toString(),
                submissionId = it[QuizServeTable.submissionId].toString(),
                correct = it[QuizServeTable.correct] ?: false,
            )
        }.firstOrNull()

    fun incrementQuizServed(quizId: String) {
        db.update(QuizBankTable) {
            set(it.servedCount, it.servedCount + 1)
            where { it.id eq UUID.fromString(quizId) }
        }
    }

    fun markDistractorServed(distractorId: String?) {
        if (distractorId == null) return
        db.update(QuizDistractorTable) {
            set(it.servedAt, Instant.now())
            where { it.id eq UUID.fromString(distractorId) }
        }
    }

    fun getSummaryRows(slotId: String): List<SummaryRow> = db.from(QuizServeTable)
        .innerJoin(QuizSessionCardTable, on = QuizServeTable.sessionCardId eq QuizSessionCardTable.id)
        .select(
            QuizSessionCardTable.id,
            QuizSessionCardTable.userWordId,
            QuizSessionCardTable.learningStep,
            QuizSessionCardTable.introductionKind,
            QuizServeTable.correct,
        )
        .where { QuizServeTable.slotId eq UUID.fromString(slotId) }
        .map {
            SummaryRow(
                cardId = it[QuizSessionCardTable.id].toString(),
                userWordId = it[QuizSessionCardTable.userWordId].toString(),
                learningStep = it[QuizSessionCardTable.learningStep],
                introductionKind = it[QuizSessionCardTable.introductionKind]?.name,
                correct = it[QuizServeTable.correct] ?: false,
            )
        }

    fun getIntroductionKinds(slotId: String): Map<String, String> = db.from(QuizSessionCardTable)
        .select(QuizSessionCardTable.userWordId, QuizSessionCardTable.introductionKind)
        .where {
            (QuizSessionCardTable.slotId eq UUID.fromString(slotId)) and
                (QuizSessionCardTable.cardType eq SessionCardType.INTRODUCTION)
        }
        .mapNotNull {
            val kind = it[QuizSessionCardTable.introductionKind]?.name ?: return@mapNotNull null
            it[QuizSessionCardTable.userWordId].toString() to kind
        }.toMap()

    fun getWordsForKanji(userId: String, kanjiId: String): List<WordFamiliarityRow> = db.from(UserWordsTable)
        .select(UserWordsTable.id, UserWordsTable.familiarity, UserWordsTable.nextReview, UserWordsTable.kanjiIds)
        .where { UserWordsTable.userId eq userId }
        .limit(500)
        .mapNotNull { row ->
            val ids = row[UserWordsTable.kanjiIds] ?: emptyList()
            if (kanjiId !in ids) return@mapNotNull null
            WordFamiliarityRow(
                row[UserWordsTable.id].toString(),
                row[UserWordsTable.familiarity] ?: 0,
                row[UserWordsTable.nextReview],
            )
        }

    fun updateKanjiFamiliarity(userId: String, kanjiId: String, familiarity: Int, tier: String, nextReview: Instant?) {
        db.update(UserKanjiTable) {
            set(it.familiarity, familiarity)
            set(it.currentTier, QuizType.valueOf(tier))
            set(it.nextReview, nextReview)
            where {
                (it.userId eq userId) and (it.kanjiId eq UUID.fromString(kanjiId))
            }
        }
    }
}
