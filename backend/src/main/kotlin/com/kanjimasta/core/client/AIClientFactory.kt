package com.kanjimasta.core.client

import ai.koog.agents.core.agent.AIAgent
import ai.koog.prompt.executor.llms.all.simpleAnthropicExecutor
import ai.koog.prompt.executor.llms.all.simpleGoogleAIExecutor
import ai.koog.prompt.llm.LLMProvider
import ai.koog.prompt.llm.LLModel
import io.ktor.server.application.*

fun anthropicModel(id: String) = LLModel(LLMProvider.Anthropic, id)
fun googleModel(id: String) = LLModel(LLMProvider.Google, id)

class AIClientFactory(
    anthropicKey: String,
    geminiKey: String,
) {
    private val anthropicExecutor = simpleAnthropicExecutor(anthropicKey)
    private val geminiExecutor = simpleGoogleAIExecutor(geminiKey)

    fun anthropicAgent(model: LLModel = CLAUDE_SONNET) = AIAgent.builder()
        .promptExecutor(anthropicExecutor)
        .llmModel(model)

    fun geminiAgent(model: LLModel = GEMINI_FLASH) = AIAgent.builder()
        .promptExecutor(geminiExecutor)
        .llmModel(model)

    companion object {
        val CLAUDE_SONNET = anthropicModel("claude-sonnet-4-20250514")
        val CLAUDE_OPUS = anthropicModel("claude-opus-4-20250918")
        val GEMINI_PRO = googleModel("gemini-3.1-pro-preview")
        val GEMINI_3_FLASH = googleModel("gemini-3-flash-preview")
    }
}

fun Application.configureAIClients(): AIClientFactory {
    val anthropicKey = environment.config.property("claude.apiKey").getString()
    val geminiKey = environment.config.property("gemini.apiKey").getString()
    return AIClientFactory(anthropicKey, geminiKey)
}