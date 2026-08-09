package com.jarvis.assistant.core

import android.content.Context
import android.util.Log
import ai.picovoice.porcupine.Porcupine
import ai.picovoice.porcupine.PorcupineManager
import com.jarvis.assistant.data.Prefs

/**
 * Escuta contínua pela palavra "Jarvis".
 *
 * Usa o Porcupine porque a detecção roda inteiramente no aparelho: nenhum áudio sai do
 * celular enquanto ele está em espera, e o consumo de bateria é de um detector dedicado,
 * não de um reconhecedor de fala completo rodando o dia inteiro.
 *
 * "Jarvis" já é uma palavra-chave nativa da biblioteca — não precisa treinar modelo.
 */
class PorcupineWakeWord(
    private val context: Context,
    private val prefs: Prefs,
    private val onWake: () -> Unit
) : WakeWord {

    override val label = "Porcupine"


    private var manager: PorcupineManager? = null
    private var running = false

    /** @return null em caso de sucesso, ou a mensagem de erro para mostrar ao usuário. */
    override fun start(): String? {
        if (running) return null

        val key = prefs.picovoiceKey
        if (key.isBlank()) return "Chave do Picovoice não configurada."

        return try {
            manager = PorcupineManager.Builder()
                .setAccessKey(key)
                .setKeyword(Porcupine.BuiltInKeyword.JARVIS)
                .setSensitivity(prefs.wakeSensitivity)
                .build(context) { _ ->
                    Log.d(TAG, "palavra de ativação detectada")
                    onWake()
                }
            manager?.start()
            running = true
            null
        } catch (e: Exception) {
            Log.e(TAG, "falha ao iniciar o Porcupine", e)
            manager = null
            translateError(e)
        }
    }

    /** Pausa a detecção — usado enquanto o JARVIS ouve o comando ou fala, para não se auto-ativar. */
    override fun pause() {
        if (!running) return
        runCatching { manager?.stop() }
        running = false
    }

    override fun resume(): String? {
        if (running) return null
        val existing = manager ?: return start()
        return try {
            existing.start()
            running = true
            null
        } catch (e: Exception) {
            Log.e(TAG, "falha ao retomar o Porcupine", e)
            translateError(e)
        }
    }

    override fun release() {
        runCatching { manager?.stop() }
        runCatching { manager?.delete() }
        manager = null
        running = false
    }

    private fun translateError(e: Exception): String {
        val msg = e.message.orEmpty()
        return when {
            msg.contains("Activation", true) || msg.contains("AccessKey", true) ->
                "Chave do Picovoice inválida ou expirada."
            msg.contains("limit", true) ->
                "Limite de ativações do Picovoice atingido."
            else -> "Não consegui iniciar a escuta: ${e.message}"
        }
    }

    private companion object {
        const val TAG = "WakeWord"
    }
}
