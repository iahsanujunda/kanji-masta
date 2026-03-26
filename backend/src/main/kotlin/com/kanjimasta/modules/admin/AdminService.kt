package com.kanjimasta.modules.admin

import java.util.UUID

class AdminService(private val adminRepository: AdminRepository) {

    fun getCost(): CostResponse {
        val byUser = adminRepository.getCostByUser()
        val byDay = adminRepository.getCostByDay(14)
        val total = byUser.sumOf { it.totalMicrodollars }
        return CostResponse(
            totalMicrodollars = total,
            totalDollars = "%.2f".format(total / 1_000_000.0),
            byUser = byUser,
            byDay = byDay,
        )
    }

    fun getJobs(status: String?): JobsResponse {
        return JobsResponse(
            jobs = adminRepository.getJobs(status),
            counts = adminRepository.getJobCounts(),
        )
    }

    fun retryJob(id: UUID) {
        adminRepository.retryJob(id)
    }

    fun retryAllFailed(): Int {
        return adminRepository.retryAllFailed()
    }

    fun searchQuizzes(query: String?): QuizzesResponse {
        val quizzes = adminRepository.searchQuizzes(query)
        return QuizzesResponse(quizzes = quizzes, total = quizzes.size)
    }

    fun deleteQuiz(id: UUID) {
        adminRepository.deleteQuiz(id)
    }
}
