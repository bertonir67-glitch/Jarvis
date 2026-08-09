package com.jarvis.assistant.core

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import java.util.Locale

/**
 * Palavra de ativação sem chave nenhuma, usando o reconhecedor de fala do próprio Android
 * num laço: escuta um trecho curto, verifica se ouviu "Jarvis", e recomeça.
 *
 * É a alternativa ao Porcupine para quem não consegue uma conta Picovoice. Funciona em
 * qualquer aparelho e não exige cadastro, mas gasta mais bateria — o Porcupine é um detector
 * dedicado de uma palavra só, enquanto aqui roda um reconhecedor de fala completo o tempo
 * todo. Vem ligado, e quem preferir economizar bateria desliga nas configurações.
 */
class AndroidWakeWord(
    private val context: Context,
    private val onWake: () -> Unit
) : WakeWord {

    override val label = "reconhecedor do Android"

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null

    @Volatile
    private var running = false

    override fun start(): String? {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            return "Este aparelho não tem reconhecimento de fala disponível."
        }
        if (running) return null
        running = true
        main.post { listenOnce() }
        return null
    }

    override fun pause() {
        running = false
        main.post { destroy() }
    }

    override fun resume(): String? = start()

    override fun release() {
        running = false
        main.post { destroy() }
    }

    private fun destroy() {
        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    private fun listenOnce() {
        if (!running) return
        destroy()

        val sr = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = sr

        sr.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit

            /**
             * Os parciais chegam bem antes do resultado final. Reagir a eles corta quase um
             * segundo do tempo entre falar "Jarvis" e o assistente acordar.
             */
            override fun onPartialResults(partialResults: Bundle?) {
                val heard = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                if (WakeWordMatcher.matches(heard)) fire()
            }

            override fun onResults(results: Bundle?) {
                val heard = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                if (WakeWordMatcher.matches(heard)) fire() else restart(QUICK_RETRY_MS)
            }

            override fun onError(error: Int) {
                // Silêncio e "não entendi" são o caso normal deste laço: recomeça rápido.
                // Os demais erros pedem uma pausa, para não entrar em laço apertado.
                val delay = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH,
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> QUICK_RETRY_MS

                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> BUSY_RETRY_MS

                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                        Log.w(TAG, "sem permissão de microfone; encerrando o laço")
                        running = false
                        return
                    }

                    else -> ERROR_RETRY_MS
                }
                restart(delay)
            }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, LANGUAGE)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            // Manter tudo no aparelho: é o que evita mandar áudio da casa da pessoa para um
            // servidor o dia inteiro, e o que faz este laço não consumir rede.
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
        }

        runCatching { sr.startListening(intent) }
            .onFailure {
                Log.w(TAG, "não consegui iniciar a escuta: ${it.message}")
                restart(ERROR_RETRY_MS)
            }
    }

    private fun fire() {
        if (!running) return
        running = false
        // Destruir a SpeechRecognizer de dentro do callback dela mesma trava em alguns
        // aparelhos; enfileirar evita isso.
        main.post { destroy() }
        onWake()
    }

    private fun restart(delayMs: Long) {
        if (!running) return
        main.postDelayed({ listenOnce() }, delayMs)
    }

    private companion object {
        const val TAG = "AndroidWakeWord"
        const val QUICK_RETRY_MS = 250L
        const val BUSY_RETRY_MS = 1_000L
        const val ERROR_RETRY_MS = 2_000L
        val LANGUAGE: String = Locale("pt", "BR").toLanguageTag()
    }
}
