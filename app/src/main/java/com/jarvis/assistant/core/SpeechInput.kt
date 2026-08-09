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
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.Locale
import kotlin.coroutines.resume

/**
 * Captura o comando falado depois que a palavra de ativação disparou.
 *
 * Usa o reconhecedor do próprio Android: nos aparelhos atuais ele roda no dispositivo,
 * é gratuito e responde mais rápido do que mandar o áudio para uma API.
 *
 * A [SpeechRecognizer] só pode ser criada e chamada na thread principal — daí o Handler.
 */
class SpeechInput(private val context: Context) {

    private val main = Handler(Looper.getMainLooper())

    val isAvailable: Boolean
        get() = SpeechRecognizer.isRecognitionAvailable(context)

    /** @return o que foi entendido, ou null se não deu para entender nada. */
    suspend fun listen(): String? = suspendCancellableCoroutine<String?> { cont ->
        main.post {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                cont.resumeOnce(null)
                return@post
            }

            val recognizer = SpeechRecognizer.createSpeechRecognizer(context)

            fun finish(result: String?) {
                runCatching { recognizer.destroy() }
                JarvisState.setAmplitude(0f)
                cont.resumeOnce(result)
            }

            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) = Unit
                override fun onBeginningOfSpeech() = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
                override fun onPartialResults(partialResults: Bundle?) = Unit

                override fun onRmsChanged(rmsdB: Float) {
                    // O SDK entrega algo entre -2 e 10 dB; normaliza para animar a interface.
                    JarvisState.setAmplitude((rmsdB + 2f) / 12f)
                }

                override fun onResults(results: Bundle?) {
                    val text = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.trim()
                    finish(text?.takeIf { it.isNotBlank() })
                }

                override fun onError(error: Int) {
                    Log.d(TAG, "erro de reconhecimento: ${describe(error)}")
                    finish(null)
                }
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, LANGUAGE)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, LANGUAGE)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                // Fecha a captura rápido depois que a pessoa para de falar: é uma ordem
                // curta, não um ditado.
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)
            }

            runCatching { recognizer.startListening(intent) }
                .onFailure {
                    Log.w(TAG, "não consegui iniciar a captura: ${it.message}")
                    finish(null)
                }

            cont.invokeOnCancellation {
                main.post {
                    runCatching { recognizer.cancel() }
                    runCatching { recognizer.destroy() }
                }
            }
        }
    }

    private fun describe(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "áudio"
        SpeechRecognizer.ERROR_CLIENT -> "cliente"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "sem permissão de microfone"
        SpeechRecognizer.ERROR_NETWORK -> "rede"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "timeout de rede"
        SpeechRecognizer.ERROR_NO_MATCH -> "nada reconhecido"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "reconhecedor ocupado"
        SpeechRecognizer.ERROR_SERVER -> "servidor"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "silêncio"
        else -> "código $error"
    }

    private fun <T> CancellableContinuation<T>.resumeOnce(value: T) {
        if (isActive) resume(value)
    }

    private companion object {
        const val TAG = "SpeechInput"
        val LANGUAGE: String = Locale("pt", "BR").toLanguageTag()
    }
}
