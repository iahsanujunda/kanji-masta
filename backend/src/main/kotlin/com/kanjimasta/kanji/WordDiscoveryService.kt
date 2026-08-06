package com.kanjimasta.kanji

import com.kanjimasta.ai.AiModelConfigRepository
import com.kanjimasta.ai.AiPrompts
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.jobs.JobAttemptTable
import com.kanjimasta.quiz.QuizBankTable
import com.kanjimasta.quiz.generation.QuizGenerationJobTable
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.ktorm.database.Database
import org.ktorm.dsl.*
import java.util.UUID

data class WordDiscoveryRequest(
    val userId: String,
    val kanjiId: UUID,
    val character: String,
    val knownWords: List<String> = emptyList(),
)

class WordDiscoveryService(
    private val repository: WordDiscoveryRepository,
    private val modelConfigs: AiModelConfigRepository,
    private val openRouter: OpenRouterClient,
) {
    suspend fun discover(request: WordDiscoveryRequest): Int {
        val model = modelConfigs.requireActive().wordDiscoveryModel
        val prompt = AiPrompts.WORD_DISCOVERY.format(
            request.character,
            request.knownWords.ifEmpty { listOf("(none)") }.joinToString("、"),
            request.character,
        )
        val result = openRouter.completeText(prompt, model)
        val words = result.data.mapNotNull { element ->
            val item = element.jsonObject
            val word = item["word"]?.jsonPrimitive?.contentOrNull.orEmpty()
            if (word.isBlank()) return@mapNotNull null
            DiscoveredWord(
                word = word,
                reading = item["reading"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                meaning = item["meaning"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        }
        return repository.apply(request.userId, request.kanjiId, words)
    }
}

data class DiscoveredWord(val word: String, val reading: String, val meaning: String)

class WordDiscoveryRepository(
    private val db: Database,
    private val modelConfigs: AiModelConfigRepository = AiModelConfigRepository(db),
) {
    fun apply(userId: String, kanjiId: UUID, words: List<DiscoveredWord>): Int = db.useTransaction {
        var inserted = 0
        words.forEach { word ->
            val wordMasterId = findWord(word.word) ?: createWord(word, kanjiId)
            if (hasUserWord(userId, wordMasterId)) return@forEach
            db.insert(UserWordsTable) {
                set(it.id, UUID.randomUUID())
                set(it.userId, userId)
                set(it.wordMasterId, wordMasterId)
                set(it.kanjiIds, listOf(kanjiId.toString()))
                set(it.source, WordSource.DISCOVERY)
                set(it.discoveredViaKanjiId, kanjiId)
                set(it.unlocked, true)
            }
            if (!hasGlobalQuizzes(wordMasterId)) enqueueQuiz(userId, kanjiId, wordMasterId)
            inserted++
        }
        inserted
    }

    private fun findWord(word: String): UUID? = db.from(WordMasterTable)
        .select(WordMasterTable.id)
        .where { WordMasterTable.word eq word }
        .limit(1)
        .map { it[WordMasterTable.id] }
        .firstOrNull()

    private fun createWord(word: DiscoveredWord, kanjiId: UUID): UUID {
        val id = UUID.randomUUID()
        db.insert(WordMasterTable) {
            set(it.id, id)
            set(it.word, word.word)
            set(it.reading, word.reading)
            set(it.meanings, listOf(word.meaning))
            set(it.kanjiIds, listOf(kanjiId.toString()))
        }
        return id
    }

    private fun hasUserWord(userId: String, wordMasterId: UUID): Boolean = db.from(UserWordsTable)
        .select(UserWordsTable.id)
        .where {
            (UserWordsTable.userId eq userId) and
                (UserWordsTable.wordMasterId eq wordMasterId)
        }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun hasGlobalQuizzes(wordMasterId: UUID): Boolean = db.from(QuizBankTable)
        .select(QuizBankTable.id)
        .where { (QuizBankTable.wordId eq wordMasterId) and QuizBankTable.userId.isNull() }
        .limit(1)
        .map { true }
        .firstOrNull() == true

    private fun enqueueQuiz(userId: String, kanjiId: UUID, wordMasterId: UUID) {
        val jobId = UUID.randomUUID()
        db.insert(QuizGenerationJobTable) {
            set(it.id, jobId)
            set(it.userId, userId)
            set(it.kanjiId, kanjiId)
            set(it.wordMasterId, wordMasterId)
        }
        val config = modelConfigs.getActive()
        db.insert(JobAttemptTable) {
            set(it.id, UUID.randomUUID())
            set(it.jobType, "quiz_generation")
            set(it.jobId, jobId)
            set(it.attemptNumber, 1)
            set(it.status, "pending")
            set(it.trigger, "initial")
            set(it.modelConfigVersion, config?.version)
            set(it.modelId, config?.quizGenerationModel)
            set(it.createdBy, "system")
        }
    }
}
