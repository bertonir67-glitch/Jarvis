package com.jarvis.assistant.brain

/**
 * O cérebro do JARVIS: recebe o que o usuário falou, decide o que fazer (podendo executar
 * ferramentas no aparelho) e devolve a frase que deve ser falada de volta.
 *
 * Existe como interface para que o app funcione tanto no Gemini (camada gratuita) quanto na
 * Claude API (paga) sem que nenhuma outra parte do código precise saber qual está em uso.
 */
interface Brain {

    suspend fun ask(userText: String, deviceSummary: String): String

    fun resetConversation()
}

class JarvisApiException(
    message: String,
    cause: Throwable? = null,
    /** Sinaliza que vale tentar outro modelo em vez de desistir. */
    val isModelUnavailable: Boolean = false
) : Exception(message, cause)

enum class BrainProvider(val id: String, val label: String) {
    /** Padrão: cadastro só com e-mail, sem depender de conta Google. */
    GROQ("groq", "Groq (grátis)"),
    GEMINI("gemini", "Google Gemini (grátis)"),
    CLAUDE("claude", "Anthropic Claude (pago)");

    companion object {
        fun from(id: String): BrainProvider =
            entries.firstOrNull { it.id == id } ?: GROQ
    }
}
