package com.kanjimasta.language

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class WordIdentityTest {
    @Test
    fun `normalizes compatibility forms whitespace and katakana readings`() {
        val fullWidth = WordIdentity.from("  運転　見合わせ  ", "ウンテン ミアワセ")
        val canonical = WordIdentity.from("運転 見合わせ", "うんてんみあわせ")

        assertEquals(canonical, fullWidth)
    }

    @Test
    fun `keeps homographs with different readings distinct`() {
        assertNotEquals(
            WordIdentity.from("生物", "せいぶつ"),
            WordIdentity.from("生物", "なまもの"),
        )
    }

    @Test
    fun `finds surface positions by unicode code point`() {
        assertEquals(2, normalizedCodePointIndexOf("𠀋々運転見合わせ", "運転見合わせ"))
    }
}
