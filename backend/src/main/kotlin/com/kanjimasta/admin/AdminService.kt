package com.kanjimasta.admin

import com.kanjimasta.ai.ModelCatalogGateway
import java.time.Instant
import java.util.UUID

class AdminService(
    private val adminRepository: AdminRepository,
    private val jobDispatcher: suspend (String, UUID, String) -> Boolean = { _, _, _ -> true },
    private val modelCatalogGateway: ModelCatalogGateway,
) {

    suspend fun searchModels(workload: String, query: String?): ModelsResponse =
        ModelsResponse(modelCatalogGateway.search(workload, query))

    suspend fun saveModelConfig(request: ModelConfigRequest, adminUserId: String): ModelConfigItem? {
        val validation = modelCatalogGateway.validate(request.asWorkloads())
        if (!validation.valid) return null
        return adminRepository.saveActiveModelConfig(request, adminUserId)
    }

    fun getModelConfigs(): ModelConfigsResponse = ModelConfigsResponse(adminRepository.getModelConfigs())

    fun getStatus(): AdminStatusResponse = AdminStatusResponse(
        status = runCatching {
            adminRepository.getActiveModelConfig() != null &&
                !adminRepository.hasHardStaleJobs()
        }.getOrDefault(false).let { if (it) "operational" else "down" },
        checkedAt = Instant.now().toString(),
    )

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

    fun getJobs(status: String?, type: String? = null): JobsResponse {
        return JobsResponse(
            jobs = adminRepository.getJobs(status, type),
            counts = adminRepository.getJobCounts(),
        )
    }

    fun markFailed(type: String, id: UUID, adminUserId: String): JobCommandResult =
        adminRepository.markFailed(type, id, adminUserId)

    fun getJobDetail(type: String, id: UUID): JobDetailResponse? = adminRepository.getJobDetail(type, id)

    suspend fun rerun(type: String, id: UUID, adminUserId: String): JobCommandResult {
        val result = adminRepository.rerun(type, id, adminUserId)
        if (result is JobCommandResult.Applied) {
            val dispatched = runCatching {
                jobDispatcher(type, id, result.job.userId)
            }.getOrDefault(false)
            if (!dispatched) return adminRepository.markFailed(type, id, "system")
        }
        return result
    }

    fun searchQuizzes(query: String?): QuizzesResponse {
        val quizzes = adminRepository.searchQuizzes(query)
        return QuizzesResponse(quizzes = quizzes, total = quizzes.size)
    }

    fun deleteQuiz(id: UUID) {
        adminRepository.deleteQuiz(id)
    }
}
