package com.jarvis.assistant.core

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.util.Log
import com.jarvis.assistant.data.Prefs
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

/**
 * Fala do JARVIS.
 *
 * Caminho principal: ElevenLabs, que é o que dá a voz britânica grave parecida com a do filme.
 * Se a rede cair, a chave falhar ou os créditos acabarem, cai para o TTS do próprio Android
 * com tom mais grave — pior, mas o assistente continua respondendo em vez de ficar mudo.
 */
class VoiceEngine(
    private val context: Context,
    private val prefs: Prefs
) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private var androidTts: TextToSpeech? = null
    private var player: MediaPlayer? = null

    suspend fun speak(text: String) {
        if (text.isBlank()) return
        val spoken = stripForSpeech(text)

        val audio = synthesizeWithElevenLabs(spoken)
        if (audio != null) {
            playFile(audio)
        } else {
            speakWithAndroidTts(spoken)
        }
    }

    fun stop() {
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
        runCatching { androidTts?.stop() }
    }

    fun shutdown() {
        stop()
        runCatching { androidTts?.shutdown() }
        androidTts = null
    }

    // ---------------------------------------------------------------- ElevenLabs

    private suspend fun synthesizeWithElevenLabs(text: String): File? = withContext(Dispatchers.IO) {
        val key = prefs.elevenLabsKey
        if (key.isBlank()) return@withContext null

        val body = buildJsonObject {
            put("text", text)
            put("model_id", prefs.voiceModel)
            put("voice_settings", buildJsonObject {
                // Estabilidade alta + estilo baixo = entrega calma e uniforme, sem drama.
                put("stability", 0.55)
                put("similarity_boost", 0.85)
                put("style", 0.10)
                put("use_speaker_boost", true)
            })
        }

        val url = "https://api.elevenlabs.io/v1/text-to-speech/${prefs.voiceId}" +
            "?output_format=mp3_44100_128"

        val request = Request.Builder()
            .url(url)
            .addHeader("xi-api-key", key)
            .addHeader("accept", "audio/mpeg")
            .post(body.toString().toRequestBody(JSON_MEDIA))
            .build()

        runCatching {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "ElevenLabs HTTP ${response.code}: ${response.body?.string()}")
                    return@use null
                }
                val bytes = response.body?.bytes() ?: return@use null
                if (bytes.isEmpty()) return@use null

                File(context.cacheDir, "jarvis_tts.mp3").apply { writeBytes(bytes) }
            }
        }.getOrElse {
            Log.w(TAG, "ElevenLabs indisponível: ${it.message}")
            null
        }
    }

    private suspend fun playFile(file: File): Unit = suspendCancellableCoroutine<Unit> { cont ->
        stop()
        val mp = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            setOnCompletionListener { cont.resumeOnce(Unit) }
            setOnErrorListener { _, what, extra ->
                Log.w(TAG, "MediaPlayer erro $what/$extra")
                cont.resumeOnce(Unit)
                true
            }
        }
        player = mp

        runCatching {
            mp.setDataSource(file.absolutePath)
            mp.prepare()
            mp.start()
        }.onFailure {
            Log.w(TAG, "Falha ao tocar o áudio: ${it.message}")
            cont.resumeOnce(Unit)
        }

        cont.invokeOnCancellation { stop() }
    }

    // ---------------------------------------------------------------- Fallback local

    private suspend fun speakWithAndroidTts(text: String) {
        val tts = ensureAndroidTts() ?: return
        suspendCancellableCoroutine<Unit> { cont ->
            val id = "jarvis-${System.nanoTime()}"
            tts.setOnUtteranceProgressListener(
                object : android.speech.tts.UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit
                    override fun onDone(utteranceId: String?) = cont.resumeOnce(Unit)

                    @Suppress("OVERRIDE_DEPRECATION")
                    override fun onError(utteranceId: String?) = cont.resumeOnce(Unit)

                    override fun onError(utteranceId: String?, errorCode: Int) = cont.resumeOnce(Unit)
                }
            )
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
            cont.invokeOnCancellation { runCatching { tts.stop() } }
        }
    }

    private suspend fun ensureAndroidTts(): TextToSpeech? {
        androidTts?.let { return it }
        return suspendCancellableCoroutine<TextToSpeech?> { cont ->
            var engine: TextToSpeech? = null
            engine = TextToSpeech(context) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    val tts = engine
                    tts?.language = PT_BR
                    tts?.let { selectBestVoice(it) }
                    // Abaixo de 1.0 a voz fica mais grave, mais perto do timbre do JARVIS.
                    tts?.setPitch(prefs.ttsPitch)
                    tts?.setSpeechRate(prefs.ttsSpeed)
                    androidTts = tts
                    cont.resumeOnce(tts)
                } else {
                    cont.resumeOnce(null)
                }
            }
        }
    }

    /**
     * O conjunto de vozes varia muito entre fabricantes, e a voz padrão raramente é a melhor
     * instalada. Escolher explicitamente a de maior qualidade faz mais diferença no resultado
     * do que qualquer ajuste de tom.
     */
    private fun selectBestVoice(tts: TextToSpeech) {
        runCatching {
            val candidates = tts.voices
                ?.filter { it.locale.language == PT_BR.language }
                ?.filter { !it.isNetworkConnectionRequired }
                ?.filter { TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features.orEmpty() }
                ?: return

            val best = candidates
                .sortedWith(
                    compareByDescending<Voice> { it.locale.country == PT_BR.country }
                        .thenByDescending { it.quality }
                        .thenBy { it.latency }
                )
                .firstOrNull() ?: return

            tts.voice = best
            Log.d(TAG, "voz do Android escolhida: ${best.name} (qualidade ${best.quality})")
        }.onFailure { Log.w(TAG, "não consegui escolher a voz: ${it.message}") }
    }

    // ---------------------------------------------------------------- Utilidades

    /** Tira do texto o que não faz sentido em áudio, caso escape algo pelo prompt. */
    private fun stripForSpeech(text: String): String = text
        .replace(Regex("https?://\\S+"), "esse link")
        .replace(Regex("[*_`#>]"), "")
        .replace(Regex("^\\s*[-•]\\s*", RegexOption.MULTILINE), "")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun <T> CancellableContinuation<T>.resumeOnce(value: T) {
        if (isActive) resume(value)
    }

    private companion object {
        const val TAG = "VoiceEngine"
        val PT_BR: Locale = Locale("pt", "BR")
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
