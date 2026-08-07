package com.kanjimasta.quiz.generation

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class QuizGenerationValidationTest {
    @Test
    fun `accepts exactly one valid quiz of every type`() {
        val quizzes = parseAndValidateGeneratedQuizzes(validResponse())

        assertEquals(5, quizzes.size)
        assertEquals(5, quizzes.map { it.quizType }.toSet().size)
    }

    @Test
    fun `rejects missing or duplicate quiz types`() {
        val duplicate = validJson().replaceFirst("reading_recognition", "meaning_recall")

        assertFailsWith<IllegalArgumentException> {
            parseAndValidateGeneratedQuizzes(Json.parseToJsonElement(duplicate).jsonArray)
        }
    }

    @Test
    fun `rejects blank fields invalid distractors and invalid furigana shape`() {
        val blankAnswer = validJson().replaceFirst("\"answer\":\"train\"", "\"answer\":\" \"")
        val duplicateDistractor = validJson().replaceFirst(
            "\"distractors\":[\"bus\",\"taxi\",\"subway\"]",
            "\"distractors\":[\"bus\",\"bus\",\"train\"]",
        )
        val sentenceWithoutFurigana = validJson().replaceFirst("\"furigana\":\"でんしゃ\"", "\"furigana\":null")

        listOf(blankAnswer, duplicateDistractor, sentenceWithoutFurigana).forEach { response ->
            assertFailsWith<IllegalArgumentException> {
                parseAndValidateGeneratedQuizzes(Json.parseToJsonElement(response).jsonArray)
            }
        }
    }

    @Test
    fun `rejects explanations over twenty words`() {
        val tooLong = (1..21).joinToString(" ") { "word$it" }
        val response = validJson().replaceFirst(
            "電 and 車 combine without an irregular change",
            tooLong,
        )

        assertFailsWith<IllegalArgumentException> {
            parseAndValidateGeneratedQuizzes(Json.parseToJsonElement(response).jsonArray)
        }
    }

    @Test
    fun `prompt separates displayed facts from reasoning`() {
        val prompt = QuizGenerationPrompts.QUIZ_GENERATION

        assertTrue(prompt.contains("must NOT repeat"))
        assertTrue(prompt.contains("exactly 5 quizzes"))
        assertTrue(prompt.contains("clean standalone gloss"))
        assertTrue(prompt.contains("20 words or fewer"))
        assertTrue(prompt.contains("reread each explanation"))
    }

    private fun validResponse() = Json.parseToJsonElement(validJson()).jsonArray

    private fun validJson() = """[
      {"quiz_type":"meaning_recall","prompt":"電車","target":"電車","furigana":null,"answer":"train","distractors":["bus","taxi","subway"],"explanation":"電 and 車 combine without an irregular change"},
      {"quiz_type":"reading_recognition","prompt":"電車","target":"電車","furigana":null,"answer":"でんしゃ","distractors":["てつどう","でんわ","でんき"],"explanation":"でん and しゃ supply their regular on-yomi readings"},
      {"quiz_type":"reverse_reading","prompt":"でんしゃ","target":"でんしゃ","furigana":null,"answer":"電車","distractors":["電話","電気","電池"],"explanation":"しゃ distinguishes 車 from compounds ending in わ or き"},
      {"quiz_type":"bold_word_meaning","prompt":"電車、遅れてるじゃん。","target":"電車","furigana":"でんしゃ","answer":"train","distractors":["bus","taxi","subway"],"explanation":"The speaker is complaining that their ride is running late"},
      {"quiz_type":"fill_in_the_blank","prompt":"＿＿乗り換えどこだっけ？","target":"電車","furigana":"でんしゃ","answer":"電車","distractors":["急行","地下鉄","バス停"],"explanation":"乗り換え signals the general transport word rather than a specific service"}
    ]"""
}
