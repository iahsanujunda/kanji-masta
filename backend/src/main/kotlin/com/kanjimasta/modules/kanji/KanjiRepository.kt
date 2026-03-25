package com.kanjimasta.modules.kanji

import com.kanjimasta.core.db.*
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.UUID

private val logger = LoggerFactory.getLogger("com.kanjimasta.modules.kanji.KanjiRepository")

class KanjiRepository(private val db: Database) {

    // --- UserKanji ---

    fun insertUserKanji(userId: String, kanjiMasterId: String, status: String, sourcePhotoId: String?) {
        val isFamiliar = status.uppercase() == "FAMILIAR"
        db.insert(UserKanjiTable) {
            set(it.userId, userId)
            set(it.kanjiId, UUID.fromString(kanjiMasterId))
            set(it.status, UserKanjiStatus.valueOf(status.uppercase()))
            set(it.familiarity, if (isFamiliar) 5 else 0)
            set(it.currentTier, if (isFamiliar) QuizType.FILL_IN_THE_BLANK else QuizType.MEANING_RECALL)
            if (sourcePhotoId != null) set(it.sourcePhotoId, UUID.fromString(sourcePhotoId))
        }
    }

    // --- WordMaster ---

    fun findWordMasterByWord(word: String): String? {
        return db.from(WordMasterTable)
            .select(WordMasterTable.id)
            .where { WordMasterTable.word eq word }
            .limit(1)
            .map { it[WordMasterTable.id]?.toString() }
            .firstOrNull()
    }

    fun findOrCreateWordMaster(word: String, reading: String, meaning: String, kanjiMasterId: String): String {
        val existing = findWordMasterByWord(word)
        if (existing != null) return existing

        val id = UUID.randomUUID()
        db.insert(WordMasterTable) {
            set(it.id, id)
            set(it.word, word)
            set(it.reading, reading)
            set(it.meanings, listOf(meaning))
            set(it.kanjiIds, listOf(kanjiMasterId))
        }
        return id.toString()
    }

    fun getWordMasterById(id: String): WordMasterRow? {
        return db.from(WordMasterTable)
            .select()
            .where { WordMasterTable.id eq UUID.fromString(id) }
            .map { row ->
                WordMasterRow(
                    id = row[WordMasterTable.id].toString(),
                    word = row[WordMasterTable.word] ?: "",
                    reading = row[WordMasterTable.reading] ?: "",
                    meanings = row[WordMasterTable.meanings] ?: emptyList(),
                    kanjiIds = row[WordMasterTable.kanjiIds] ?: emptyList(),
                )
            }
            .firstOrNull()
    }

    fun getWordMastersForKanji(kanjiMasterId: String): List<WordMasterItem> {
        // Use PostgreSQL array contains: kanjiMasterId = ANY(kanji_ids)
        // Ktorm doesn't have native array-contains, so use raw SQL expression
        return db.from(WordMasterTable)
            .select()
            .where {
                WordMasterTable.word.isNotNull() and
                    (WordMasterTable.kanjiIds.isNotNull())
            }
            .map { row ->
                val kanjiIds = row[WordMasterTable.kanjiIds] ?: emptyList()
                if (kanjiMasterId !in kanjiIds) return@map null
                WordMasterItem(
                    id = row[WordMasterTable.id].toString(),
                    word = row[WordMasterTable.word] ?: "",
                    reading = row[WordMasterTable.reading] ?: "",
                    meaning = (row[WordMasterTable.meanings] ?: emptyList()).firstOrNull() ?: "",
                )
            }
            .filterNotNull()
    }

    fun getWordMastersByKanjiChar(character: String): List<WordMasterItem> {
        return db.from(WordMasterTable)
            .select()
            .where { WordMasterTable.word like "%$character%" }
            .map { row ->
                WordMasterItem(
                    id = row[WordMasterTable.id].toString(),
                    word = row[WordMasterTable.word] ?: "",
                    reading = row[WordMasterTable.reading] ?: "",
                    meaning = (row[WordMasterTable.meanings] ?: emptyList()).firstOrNull() ?: "",
                )
            }
    }

    fun getWordMasterIndex(): Map<String, List<WordMasterItem>> {
        val index = mutableMapOf<String, MutableList<WordMasterItem>>()
        db.from(WordMasterTable)
            .select()
            .forEach { row ->
                val item = WordMasterItem(
                    id = row[WordMasterTable.id].toString(),
                    word = row[WordMasterTable.word] ?: "",
                    reading = row[WordMasterTable.reading] ?: "",
                    meaning = (row[WordMasterTable.meanings] ?: emptyList()).firstOrNull() ?: "",
                )
                val kanjiIds = row[WordMasterTable.kanjiIds] ?: return@forEach
                for (kid in kanjiIds) {
                    index.getOrPut(kid) { mutableListOf() }.add(item)
                }
            }
        return index
    }

    // --- UserWords ---

    fun insertUserWord(userId: String, wordMasterId: String, kanjiMasterId: String, source: String = "PHOTO"): String? {
        return try {
            val id = UUID.randomUUID()
            db.insert(UserWordsTable) {
                set(it.id, id)
                set(it.userId, userId)
                set(it.wordMasterId, UUID.fromString(wordMasterId))
                set(it.kanjiIds, listOf(kanjiMasterId))
                set(it.source, WordSource.valueOf(source))
                set(it.unlocked, true)
            }
            id.toString()
        } catch (e: Exception) {
            logger.debug("UserWord insert issue: {}", e.message)
            null
        }
    }

    fun findUserWordByWordMaster(userId: String, wordMasterId: String): String? {
        return db.from(UserWordsTable)
            .select(UserWordsTable.id)
            .where {
                (UserWordsTable.userId eq userId) and
                    (UserWordsTable.wordMasterId eq UUID.fromString(wordMasterId))
            }
            .limit(1)
            .map { it[UserWordsTable.id]?.toString() }
            .firstOrNull()
    }

    // --- Global Quiz Check ---

    fun hasGlobalQuizzes(wordMasterId: String): Boolean {
        return db.from(QuizBankTable)
            .select(QuizBankTable.id)
            .where {
                (QuizBankTable.wordId eq UUID.fromString(wordMasterId)) and
                    (QuizBankTable.userId.isNull())
            }
            .limit(1)
            .totalRecordsInAllPages > 0
    }

    // --- QuizGenerationJob ---

    fun insertQuizGenerationJob(userId: String, kanjiMasterId: String, wordMasterId: String? = null) {
        db.insert(QuizGenerationJobTable) {
            set(it.userId, userId)
            set(it.kanjiId, UUID.fromString(kanjiMasterId))
            if (wordMasterId != null) set(it.wordMasterId, UUID.fromString(wordMasterId))
        }
    }

    fun countPendingJobs(userId: String): Int {
        return db.from(QuizGenerationJobTable)
            .select(QuizGenerationJobTable.id)
            .where {
                (QuizGenerationJobTable.userId eq userId) and
                    (QuizGenerationJobTable.status inList listOf(JobStatus.PENDING, JobStatus.PROCESSING))
            }
            .totalRecordsInAllPages
    }

    // --- Onboarding ---

    private data class KanjiMasterRow(
        val id: UUID, val character: String, val onyomi: List<String>,
        val kunyomi: List<String>, val meanings: List<String>, val jlpt: Int?, val frequency: Int?,
    )

    fun getOnboardingKanji(userId: String, offset: Int, limit: Int): Pair<List<OnboardingKanjiItem>, Boolean> {
        // Get existing user kanji IDs
        val existingKanjiIds = db.from(UserKanjiTable)
            .select(UserKanjiTable.kanjiId)
            .where { UserKanjiTable.userId eq userId }
            .mapNotNull { it[UserKanjiTable.kanjiId] }
            .toSet()

        // Get JLPT 5-4 kanji — extract all values eagerly to avoid cursor issues
        val fetchLimit = offset + limit + 1
        val allKanji = db.from(KanjiMasterTable)
            .select()
            .where { KanjiMasterTable.jlpt inList listOf(5, 4) }
            .orderBy(KanjiMasterTable.frequency.asc())
            .limit(fetchLimit)
            .map { row ->
                KanjiMasterRow(
                    id = row[KanjiMasterTable.id]!!,
                    character = row[KanjiMasterTable.character] ?: "",
                    onyomi = row[KanjiMasterTable.onyomi] ?: emptyList(),
                    kunyomi = row[KanjiMasterTable.kunyomi] ?: emptyList(),
                    meanings = row[KanjiMasterTable.meanings] ?: emptyList(),
                    jlpt = row[KanjiMasterTable.jlpt],
                    frequency = row[KanjiMasterTable.frequency],
                )
            }
            .filter { it.id !in existingKanjiIds }

        val hasMore = allKanji.size > offset + limit
        val paged = allKanji.drop(offset).take(limit)

        // Build word index once for the batch
        val wordIndex = getWordMasterIndex()

        val items = paged.map { km ->
            val kmId = km.id.toString()
            val wm = wordIndex[kmId]?.firstOrNull()
            OnboardingKanjiItem(
                kanjiMasterId = kmId,
                character = km.character,
                onyomi = km.onyomi,
                kunyomi = km.kunyomi,
                meanings = km.meanings,
                jlpt = km.jlpt,
                frequency = km.frequency,
                seenAs = wm?.let { SeenAs(word = it.word, reading = it.reading, meaning = it.meaning) },
            )
        }

        return items to hasMore
    }

    // --- List queries ---

    fun getAllUserKanji(userId: String): List<KanjiListItem> {
        return db.from(UserKanjiTable)
            .innerJoin(KanjiMasterTable, on = UserKanjiTable.kanjiId eq KanjiMasterTable.id)
            .select()
            .where { UserKanjiTable.userId eq userId }
            .limit(500)
            .map { row ->
                KanjiListItem(
                    id = row[UserKanjiTable.id].toString(),
                    kanjiMasterId = row[KanjiMasterTable.id].toString(),
                    character = row[KanjiMasterTable.character] ?: "",
                    onyomi = row[KanjiMasterTable.onyomi] ?: emptyList(),
                    kunyomi = row[KanjiMasterTable.kunyomi] ?: emptyList(),
                    meanings = row[KanjiMasterTable.meanings] ?: emptyList(),
                    familiarity = row[UserKanjiTable.familiarity] ?: 0,
                    status = row[UserKanjiTable.status]?.name ?: "LEARNING",
                )
            }
    }

    fun getUserWords(userId: String, searchQuery: String?, offset: Int, limit: Int): WordListResponse {
        var items = db.from(UserWordsTable)
            .innerJoin(WordMasterTable, on = UserWordsTable.wordMasterId eq WordMasterTable.id)
            .select()
            .where { UserWordsTable.userId eq userId }
            .orderBy(WordMasterTable.reading.asc())
            .limit(500)
            .map { row ->
                WordListItem(
                    id = row[UserWordsTable.id].toString(),
                    word = row[WordMasterTable.word] ?: "",
                    reading = row[WordMasterTable.reading] ?: "",
                    meaning = (row[WordMasterTable.meanings] ?: emptyList()).firstOrNull() ?: "",
                    familiarity = row[UserWordsTable.familiarity] ?: 0,
                    nextReview = row[UserWordsTable.nextReview]?.toString(),
                )
            }

        if (!searchQuery.isNullOrBlank()) {
            val q = searchQuery.lowercase()
            items = items.filter { item ->
                item.word.contains(q) ||
                    item.reading.contains(q) ||
                    item.meaning.lowercase().contains(q) ||
                    toRomaji(item.reading).contains(q)
            }
        }

        val total = items.size
        val paged = items.drop(offset).take(limit)
        return WordListResponse(paged, total, offset + limit < total)
    }
}

data class WordMasterRow(
    val id: String, val word: String, val reading: String,
    val meanings: List<String>, val kanjiIds: List<String>,
)

data class WordMasterItem(val id: String, val word: String, val reading: String, val meaning: String)

data class ExampleWord(val word: String, val reading: String, val meaning: String)

// Simple hiragana -> romaji conversion
private val KANA_ROMAJI = mapOf(
    "あ" to "a", "い" to "i", "う" to "u", "え" to "e", "お" to "o",
    "か" to "ka", "き" to "ki", "く" to "ku", "け" to "ke", "こ" to "ko",
    "さ" to "sa", "し" to "shi", "す" to "su", "せ" to "se", "そ" to "so",
    "た" to "ta", "ち" to "chi", "つ" to "tsu", "て" to "te", "と" to "to",
    "な" to "na", "に" to "ni", "ぬ" to "nu", "ね" to "ne", "の" to "no",
    "は" to "ha", "ひ" to "hi", "ふ" to "fu", "へ" to "he", "ほ" to "ho",
    "ま" to "ma", "み" to "mi", "む" to "mu", "め" to "me", "も" to "mo",
    "や" to "ya", "ゆ" to "yu", "よ" to "yo",
    "ら" to "ra", "り" to "ri", "る" to "ru", "れ" to "re", "ろ" to "ro",
    "わ" to "wa", "を" to "wo", "ん" to "n",
    "が" to "ga", "ぎ" to "gi", "ぐ" to "gu", "げ" to "ge", "ご" to "go",
    "ざ" to "za", "じ" to "ji", "ず" to "zu", "ぜ" to "ze", "ぞ" to "zo",
    "だ" to "da", "ぢ" to "di", "づ" to "du", "で" to "de", "ど" to "do",
    "ば" to "ba", "び" to "bi", "ぶ" to "bu", "べ" to "be", "ぼ" to "bo",
    "ぱ" to "pa", "ぴ" to "pi", "ぷ" to "pu", "ぺ" to "pe", "ぽ" to "po",
    "きゃ" to "kya", "きゅ" to "kyu", "きょ" to "kyo",
    "しゃ" to "sha", "しゅ" to "shu", "しょ" to "sho",
    "ちゃ" to "cha", "ちゅ" to "chu", "ちょ" to "cho",
    "にゃ" to "nya", "にゅ" to "nyu", "にょ" to "nyo",
    "ひゃ" to "hya", "ひゅ" to "hyu", "ひょ" to "hyo",
    "みゃ" to "mya", "みゅ" to "myu", "みょ" to "myo",
    "りゃ" to "rya", "りゅ" to "ryu", "りょ" to "ryo",
    "ぎゃ" to "gya", "ぎゅ" to "gyu", "ぎょ" to "gyo",
    "じゃ" to "ja", "じゅ" to "ju", "じょ" to "jo",
    "びゃ" to "bya", "びゅ" to "byu", "びょ" to "byo",
    "ぴゃ" to "pya", "ぴゅ" to "pyu", "ぴょ" to "pyo",
    "っ" to "", "ー" to "",
)

private fun toRomaji(hiragana: String): String {
    val sb = StringBuilder()
    var i = 0
    while (i < hiragana.length) {
        if (i + 1 < hiragana.length) {
            val two = hiragana.substring(i, i + 2)
            val r = KANA_ROMAJI[two]
            if (r != null) { sb.append(r); i += 2; continue }
        }
        val one = hiragana[i].toString()
        val r = KANA_ROMAJI[one]
        if (r != null) {
            if (one == "っ" && i + 1 < hiragana.length) {
                val next = KANA_ROMAJI[hiragana[i + 1].toString()]
                if (next != null && next.isNotEmpty()) sb.append(next[0])
            } else sb.append(r)
        } else sb.append(one)
        i++
    }
    return sb.toString()
}
