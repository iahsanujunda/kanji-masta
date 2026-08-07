package com.kanjimasta.quiz.generation

import com.kanjimasta.ai.AiProviderException
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.quiz.QuizType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory

internal fun parseAndValidateGeneratedQuizzes(data: JsonArray): List<GeneratedQuiz> {
    require(data.size == QuizType.entries.size) { "AI must return exactly five quizzes" }
    val quizzes = data.map { element ->
        val item = element.jsonObject
        GeneratedQuiz(
            quizType = parseQuizType(item.getValue("quiz_type").jsonPrimitive.content),
            prompt = item["prompt"]?.jsonPrimitive?.contentOrNull.orEmpty().trim(),
            target = item["target"]?.jsonPrimitive?.contentOrNull.orEmpty().trim(),
            answer = item["answer"]?.jsonPrimitive?.contentOrNull.orEmpty().trim(),
            furigana = item["furigana"]?.jsonPrimitive?.contentOrNull?.trim(),
            explanation = item["explanation"]?.jsonPrimitive?.contentOrNull?.trim(),
            distractors = item["distractors"]?.jsonArray
                ?.mapNotNull { it.jsonPrimitive.contentOrNull?.trim() }.orEmpty(),
        )
    }
    require(quizzes.map { it.quizType }.toSet() == QuizType.entries.toSet()) {
        "AI must return exactly one quiz of every type"
    }
    quizzes.forEach { quiz ->
        require(quiz.prompt.isNotBlank()) { "Quiz prompt must not be blank" }
        require(quiz.target.isNotBlank()) { "Quiz target must not be blank" }
        require(quiz.answer.isNotBlank()) { "Quiz answer must not be blank" }
        val explanation = requireNotNull(quiz.explanation?.takeIf { it.isNotBlank() }) {
            "Quiz explanation must not be blank"
        }
        require(explanation.split(Regex("\\s+")).size <= 20) { "Quiz explanation must be at most twenty words" }
        require(quiz.distractors.size == 3) { "Quiz must have exactly three distractors" }
        require(quiz.distractors.none { it.isBlank() }) { "Quiz distractors must not be blank" }
        require(quiz.distractors.distinctBy { it.lowercase() }.size == 3) { "Quiz distractors must be distinct" }
        require(quiz.distractors.none { it.equals(quiz.answer, ignoreCase = true) }) {
            "Quiz distractors must not equal the answer"
        }
        val sentenceType = quiz.quizType == QuizType.BOLD_WORD_MEANING || quiz.quizType == QuizType.FILL_IN_THE_BLANK
        if (sentenceType) {
            require(!quiz.furigana.isNullOrBlank()) { "Sentence quiz furigana must not be blank" }
        } else {
            require(quiz.furigana == null) { "Word-level quiz furigana must be null" }
        }
    }
    return quizzes
}

private fun parseQuizType(raw: String): QuizType = when (raw.uppercase()) {
    "MEANING_RECALL" -> QuizType.MEANING_RECALL
    "READING_RECOGNITION" -> QuizType.READING_RECOGNITION
    "REVERSE_READING" -> QuizType.REVERSE_READING
    "BOLD_WORD_MEANING" -> QuizType.BOLD_WORD_MEANING
    "FILL_IN_THE_BLANK" -> QuizType.FILL_IN_THE_BLANK
    else -> error("Unknown quiz type: $raw")
}

class QuizGenerationWorker(
    private val repository: QuizGenerationRepository,
    private val openRouter: OpenRouterClient,
    private val batchSize: Int = 10,
    private val leaseSeconds: Long = 300,
) {
    suspend fun drain(claimedBy: String = "local-quiz-job"): Int {
        var processed = 0
        repeat(batchSize.coerceAtLeast(1)) {
            val claim = repository.claimNext(claimedBy, leaseSeconds) ?: return processed
            process(claim)
            processed++
        }
        return processed
    }

    fun checkRegeneration(): Int = repository.enqueueEligibleRegenerations()

    private suspend fun process(claim: QuizGenerationClaim) {
        try {
            if (claim.jobType == com.kanjimasta.quiz.generation.JobType.REGEN) {
                processRegeneration(claim)
            } else {
                processInitial(claim)
            }
        } catch (error: AiProviderException) {
            logger.error("AI quiz generation failed for job={}: {}", claim.jobId, error.message)
            repository.fail(claim, if (error.message?.contains("JSON", true) == true) "invalid_response" else "provider_failed")
        } catch (error: Exception) {
            logger.error("Quiz generation failed for job={}", claim.jobId, error)
            repository.fail(claim, "provider_failed")
        }
    }

    private suspend fun processInitial(claim: QuizGenerationClaim): Long {
        val word = claim.word
        val reading = claim.reading
        val wordMasterId = claim.wordMasterId
        if (word.isNullOrBlank() || reading.isNullOrBlank() || wordMasterId == null) {
            repository.fail(claim, "source_missing")
            return 0
        }
        val prompt = QuizGenerationPrompts.QUIZ_GENERATION.format(
            word,
            reading,
            claim.meanings.firstOrNull() ?: "?",
        )
        val result = openRouter.completeText(prompt, claim.modelId, reasoningEffort = claim.reasoningEffort)
        repository.recordProviderCost(claim, result.costMicrodollars)
        val quizzes = try {
            parseAndValidateGeneratedQuizzes(result.data)
        } catch (error: Exception) {
            logger.error("Quiz response validation failed for job={}", claim.jobId, error)
            repository.fail(claim, "invalid_response", result.costMicrodollars)
            return result.costMicrodollars
        }
        repository.completeInitial(claim, quizzes, result.costMicrodollars)
        return result.costMicrodollars
    }

    private suspend fun processRegeneration(claim: QuizGenerationClaim): Long {
        val context = repository.regenerationContext(claim)
        if (context == null) {
            repository.fail(claim, "source_missing")
            return 0
        }
        val prompt = QuizGenerationPrompts.DISTRACTOR_REGENERATION.format(
            context.familiarity,
            context.quizType.name,
            context.prompt,
            context.answer,
            Json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(
                    kotlinx.serialization.builtins.ListSerializer(kotlinx.serialization.serializer<String>()),
                ),
                context.previousDistractors,
            ),
        )
        val result = openRouter.completeText(prompt, claim.modelId, reasoningEffort = claim.reasoningEffort)
        repository.recordProviderCost(claim, result.costMicrodollars)
        val distractors = try {
            result.data.mapNotNull { it.jsonPrimitive.contentOrNull }
                .also { require(it.size == 3) { "AI must return exactly three distractors" } }
        } catch (error: Exception) {
            logger.error("Regeneration response validation failed for job={}", claim.jobId, error)
            repository.fail(claim, "invalid_response", result.costMicrodollars)
            return result.costMicrodollars
        }
        repository.completeRegeneration(claim, context, distractors, result.costMicrodollars)
        return result.costMicrodollars
    }

    private companion object {
        val logger = LoggerFactory.getLogger(QuizGenerationWorker::class.java)
    }
}
