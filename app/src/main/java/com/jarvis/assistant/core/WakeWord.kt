package com.jarvis.assistant.core

import java.text.Normalizer
import java.util.Locale

/**
 * Detector da palavra de ativação.
 *
 * Existe em duas implementações porque o Porcupine, apesar de ser tecnicamente melhor, exige
 * uma conta Picovoice cujo plano gratuito pede e-mail corporativo — o que exclui boa parte das
 * pessoas. A implementação sobre o reconhecedor do Android não precisa de cadastro nenhum e
 * funciona em qualquer aparelho, ao custo de bateria.
 */
interface WakeWord {

    /** @return null em caso de sucesso, ou a mensagem de erro para mostrar ao usuário. */
    fun start(): String?

    /** Solta o microfone — ele é exclusivo e o reconhecedor de comando precisa dele. */
    fun pause()

    fun resume(): String?

    fun release()

    /** Nome curto para a interface dizer qual detector está em uso. */
    val label: String
}

/**
 * O reconhecedor de fala erra o nome com frequência — "Jarvis" sai como "jarvez", "charles",
 * "javes". Aceitar só a grafia exata deixaria o assistente praticamente surdo, então a
 * comparação é por variantes conhecidas, sem acento e sem pontuação.
 */
object WakeWordMatcher {

    private val VARIANTS = listOf(
        "jarvis", "jarves", "jarvez", "jarvis", "jervis", "jarvix",
        "charles", "javes", "jarbas", "harvey", "jarvi"
    )

    fun matches(heard: String): Boolean {
        val text = normalize(heard)
        if (text.isEmpty()) return false
        return text.split(" ").any { word -> VARIANTS.any { word == it } } ||
            VARIANTS.any { text.contains(it) }
    }

    private fun normalize(s: String): String =
        Normalizer.normalize(s.lowercase(Locale("pt", "BR")), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
}
