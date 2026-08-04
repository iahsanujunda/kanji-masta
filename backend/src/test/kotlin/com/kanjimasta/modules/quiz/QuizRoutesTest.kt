package com.kanjimasta.modules.quiz

import com.kanjimasta.jsonClient
import com.kanjimasta.support.configureIsolatedKtor
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlin.test.Test
import kotlin.test.assertEquals
import java.util.UUID

class QuizRoutesTest {

    private val slotId = UUID.randomUUID().toString()

    private fun snapshot(version: Int = 0) = SessionSnapshot(
        slotId = slotId,
        status = "ACTIVE",
        version = version,
        slotEndsAt = "2026-08-04T14:00:00Z",
        progress = SessionProgress(completed = 0, allowance = 6, remaining = 6),
        summary = SessionSummary(),
    )

    @Test
    fun `availability returns the authenticated learner's authoritative session state`() = testApplication {
        val service = mockk<QuizService>()
        val availability = SessionAvailabilityResponse(
            state = "ACTIVE",
            slotId = "slot-1",
            availableAt = "2026-08-04T14:00:00Z",
            remaining = 3,
        )
        every { service.getAvailability("route-test-user") } returns availability
        configureIsolatedKtor { quizRoutes(service) }

        val response = jsonClient().get("/api/quiz/availability") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(availability, response.body())
        verify(exactly = 1) { service.getAvailability("route-test-user") }
    }

    @Test
    fun `session lookup rejects a malformed slot id before calling session logic`() = testApplication {
        val service = mockk<QuizService>()
        configureIsolatedKtor { quizRoutes(service) }

        val response = jsonClient().get("/api/quiz/session/not-a-uuid") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        verify(exactly = 0) { service.getSession(any(), any()) }
    }

    @Test
    fun `start returns the session selected for the authenticated learner`() = testApplication {
        val service = mockk<QuizService>()
        val expected = SessionResponse(snapshot())
        every { service.startSession("route-test-user") } returns expected
        configureIsolatedKtor { quizRoutes(service) }

        val response = jsonClient().post("/api/quiz/session/start") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(expected, response.body())
        verify(exactly = 1) { service.startSession("route-test-user") }
    }

    @Test
    fun `missing session lookup and exit return not found`() = testApplication {
        val service = mockk<QuizService>()
        every { service.getSession("route-test-user", slotId) } returns null
        every { service.exit("route-test-user", slotId) } returns null
        configureIsolatedKtor { quizRoutes(service) }
        val client = jsonClient()

        val lookup = client.get("/api/quiz/session/$slotId") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
        }
        val exit = client.post("/api/quiz/session/$slotId/exit") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
        }

        assertEquals(HttpStatusCode.NotFound, lookup.status)
        assertEquals(HttpStatusCode.NotFound, exit.status)
    }

    @Test
    fun `stale answer returns the authoritative snapshot as a conflict`() = testApplication {
        val service = mockk<QuizService>()
        val authoritative = snapshot(version = 4)
        every {
            service.answer("route-test-user", slotId, any())
        } returns SessionCommandResult.Advanced(authoritative)
        configureIsolatedKtor { quizRoutes(service) }

        val response = jsonClient().post("/api/quiz/session/$slotId/answer") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
            contentType(ContentType.Application.Json)
            setBody(
                AnswerRequest(
                    cardId = UUID.randomUUID().toString(),
                    submissionId = UUID.randomUUID().toString(),
                    expectedVersion = 3,
                    answer = "train",
                ),
            )
        }

        assertEquals(HttpStatusCode.Conflict, response.status)
        assertEquals(SessionAdvancedResponse(session = authoritative), response.body())
    }

    @Test
    fun `invalid introduction command returns bad request`() = testApplication {
        val service = mockk<QuizService>()
        every {
            service.acknowledgeIntroduction("route-test-user", slotId, any())
        } returns SessionCommandResult.Invalid
        configureIsolatedKtor { quizRoutes(service) }

        val response = jsonClient().post("/api/quiz/session/$slotId/introduction") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
            contentType(ContentType.Application.Json)
            setBody(
                IntroductionRequest(
                    cardId = UUID.randomUUID().toString(),
                    submissionId = UUID.randomUUID().toString(),
                    expectedVersion = 0,
                ),
            )
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `session commands reject a malformed slot id before applying a command`() = testApplication {
        val service = mockk<QuizService>()
        configureIsolatedKtor { quizRoutes(service) }
        val client = jsonClient()

        val introduction = client.post("/api/quiz/session/not-a-uuid/introduction") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
            contentType(ContentType.Application.Json)
            setBody(
                IntroductionRequest(
                    cardId = "card-id",
                    submissionId = "submission-id",
                    expectedVersion = 0,
                ),
            )
        }
        val answer = client.post("/api/quiz/session/not-a-uuid/answer") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
            contentType(ContentType.Application.Json)
            setBody(
                AnswerRequest(
                    cardId = "card-id",
                    submissionId = "submission-id",
                    expectedVersion = 0,
                    answer = "answer",
                ),
            )
        }
        val exit = client.post("/api/quiz/session/not-a-uuid/exit") {
            header(HttpHeaders.Authorization, "Bearer route-test-token")
        }

        assertEquals(
            listOf(HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, HttpStatusCode.BadRequest),
            listOf(introduction.status, answer.status, exit.status),
        )
        verify(exactly = 0) { service.acknowledgeIntroduction(any(), any(), any()) }
        verify(exactly = 0) { service.answer(any(), any(), any()) }
        verify(exactly = 0) { service.exit(any(), any()) }
    }
}
