package com.kanjimasta.photo

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SupabaseStorageSignerTest {
    @Test
    fun `sign creates a fresh server-side photo URL`() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("https://project.supabase.co/storage/v1/object/sign/photos/user/photo.jpg", request.url.toString())
            assertEquals("Bearer service-role", request.headers[HttpHeaders.Authorization])
            assertEquals("service-role", request.headers["apikey"])
            assertTrue(request.body.toString().contains("expiresIn"))
            respond(
                content = """{"signedURL":"/object/sign/photos/user/photo.jpg?token=fresh"}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val signer = SupabaseStorageSigner(HttpClient(engine), "https://project.supabase.co", "service-role")

        assertEquals(
            "https://project.supabase.co/storage/v1/object/sign/photos/user/photo.jpg?token=fresh",
            signer.signPhoto("user/photo.jpg"),
        )
    }
}
