package com.kanjimasta.photo

import com.kanjimasta.ai.AiProviderException
import com.kanjimasta.ai.OpenRouterClient
import com.kanjimasta.language.WordIdentity
import com.kanjimasta.language.normalizeJapaneseText
import com.kanjimasta.language.normalizedCodePointIndexOf
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.nio.charset.StandardCharsets
import java.util.UUID

class CaptureWordDiscoveryExecutor(
    private val repository: CaptureWordDiscoveryRepository,
    private val openRouter: OpenRouterClient,
    private val leaseSeconds: Long = 300,
) {
    suspend fun run(taskId: UUID, claimedBy: String = "local-word-discovery-job"): Boolean {
        val claim = repository.claim(taskId, claimedBy, leaseSeconds)
            ?: return true.also { logger.info("Capture word task {} has no claimable work", taskId) }
        val result = try {
            openRouter.completeText(
                CaptureWordDiscoveryPrompts.DISCOVER.format(claim.fullText),
                claim.modelId,
                reasoningEffort = claim.reasoningEffort,
            )
        } catch (error: AiProviderException) {
            logger.error("Capture word discovery failed for task={}: {}", taskId, error.message)
            repository.fail(claim, "provider_failed")
            return false
        }
        val words = try {
            publications(claim, result.data)
        } catch (error: Exception) {
            logger.error("Capture word discovery validation failed for task={}", taskId, error)
            repository.fail(claim, "invalid_response", result.costMicrodollars)
            return false
        }
        return repository.complete(claim, words, result.costMicrodollars)
    }

    private fun publications(claim: CaptureWordDiscoveryClaim, data: JsonArray): List<CapturedWordPublication> {
        val candidates = data.mapNotNull { element ->
            val item = element.jsonObject
            val surface = normalizeJapaneseText(item["surfaceText"]?.jsonPrimitive?.contentOrNull.orEmpty()).trim()
            val lemma = item["lemma"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
            val reading = item["reading"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
            val meaning = item["meaning"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
            val position = normalizedCodePointIndexOf(claim.fullText, surface) ?: return@mapNotNull null
            val identity = WordIdentity.from(lemma, reading)
            if (identity.normalizedLemma.isBlank() || identity.normalizedReading.isBlank() || meaning.isBlank()) {
                return@mapNotNull null
            }
            Candidate(surface, lemma, reading, meaning, identity, position)
        }
        val characters = candidates.flatMap { candidate ->
            candidate.surface.codePoints().toArray().map { String(Character.toChars(it)) }
        }.distinct()
        val kanji = repository.lookupKanjiIds(characters)
        val tieBreaker = compareBy<Candidate>(
            { it.firstSeenOrder },
            { it.surface },
            { it.lemma },
            { it.reading },
            { it.meaning },
        )
        return candidates
            .groupBy { it.identity }
            .values
            .map { duplicates -> duplicates.minWith(tieBreaker) }
            .mapNotNull { candidate ->
                val ids = candidate.surface.codePoints().toArray()
                    .map { String(Character.toChars(it)) }
                    .mapNotNull(kanji::get)
                    .distinct()
                if (ids.isEmpty()) return@mapNotNull null
                CapturedWordPublication(
                    id = stableCandidateId(claim, candidate.identity),
                    surfaceText = candidate.surface,
                    lemma = candidate.lemma,
                    normalizedLemma = candidate.identity.normalizedLemma,
                    reading = candidate.reading,
                    normalizedReading = candidate.identity.normalizedReading,
                    meaning = candidate.meaning,
                    firstSeenOrder = candidate.firstSeenOrder,
                    kanjiIds = ids,
                )
            }
            .sortedWith(compareBy({ it.firstSeenOrder }, { it.normalizedLemma }, { it.normalizedReading }))
    }

    private fun stableCandidateId(claim: CaptureWordDiscoveryClaim, identity: WordIdentity): UUID =
        UUID.nameUUIDFromBytes(
            "capture-word:${claim.sessionId}:${claim.pipelineVersion}:${identity.normalizedLemma}:${identity.normalizedReading}"
                .toByteArray(StandardCharsets.UTF_8),
        )

    private data class Candidate(
        val surface: String,
        val lemma: String,
        val reading: String,
        val meaning: String,
        val identity: WordIdentity,
        val firstSeenOrder: Int,
    )

    private companion object {
        val logger = LoggerFactory.getLogger(CaptureWordDiscoveryExecutor::class.java)
    }
}
