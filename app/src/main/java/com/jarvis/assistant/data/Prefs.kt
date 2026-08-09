package com.jarvis.assistant.data

import android.content.Context
import android.content.SharedPreferences
import com.jarvis.assistant.BuildConfig
import com.jarvis.assistant.brain.BrainProvider

/**
 * Configuração do JARVIS.
 *
 * As chaves de API vêm do `local.properties` no momento do build (BuildConfig) e podem ser
 * sobrescritas em tempo de execução pela tela de Configurações — assim dá para instalar o APK
 * do CI e colar as chaves direto no aparelho, sem recompilar.
 */
class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("jarvis", Context.MODE_PRIVATE)

    private fun read(key: String, fallback: String): String {
        val stored = sp.getString(key, null)
        return if (stored.isNullOrBlank()) fallback else stored
    }

    /**
     * Qual API responde. Padrão: Groq — gratuito como o Gemini, mas o cadastro é só e-mail,
     * sem depender de uma conta Google que pode estar bloqueada pelo administrador.
     */
    var brainProvider: BrainProvider
        get() = BrainProvider.from(read(KEY_PROVIDER, BrainProvider.GROQ.id))
        set(v) = sp.edit().putString(KEY_PROVIDER, v.id).apply()

    var groqKey: String
        get() = read(KEY_GROQ, BuildConfig.GROQ_API_KEY)
        set(v) = sp.edit().putString(KEY_GROQ, v.trim()).apply()

    /** Se o ID sair de circulação, o app tenta sozinho os substitutos conhecidos. */
    var groqModel: String
        get() = read(KEY_GROQ_MODEL, DEFAULT_GROQ_MODEL)
        set(v) = sp.edit().putString(KEY_GROQ_MODEL, v.trim()).apply()

    var geminiKey: String
        get() = read(KEY_GEMINI, BuildConfig.GEMINI_API_KEY)
        set(v) = sp.edit().putString(KEY_GEMINI, v.trim()).apply()

    /**
     * `gemini-2.5-flash` é o padrão da camada gratuita. `gemini-2.5-flash-lite` tem cota
     * diária bem maior e responde mais rápido, com um pouco menos de precisão.
     */
    var geminiModel: String
        get() = read(KEY_GEMINI_MODEL, DEFAULT_GEMINI_MODEL)
        set(v) = sp.edit().putString(KEY_GEMINI_MODEL, v.trim()).apply()

    var anthropicKey: String
        get() = read(KEY_ANTHROPIC, BuildConfig.ANTHROPIC_API_KEY)
        set(v) = sp.edit().putString(KEY_ANTHROPIC, v.trim()).apply()

    var elevenLabsKey: String
        get() = read(KEY_ELEVENLABS, BuildConfig.ELEVENLABS_API_KEY)
        set(v) = sp.edit().putString(KEY_ELEVENLABS, v.trim()).apply()

    var picovoiceKey: String
        get() = read(KEY_PICOVOICE, BuildConfig.PICOVOICE_ACCESS_KEY)
        set(v) = sp.edit().putString(KEY_PICOVOICE, v.trim()).apply()

    /** Voz do ElevenLabs. Padrão: "Daniel" — masculina, britânica, grave. */
    var voiceId: String
        get() = read(KEY_VOICE_ID, DEFAULT_VOICE_ID)
        set(v) = sp.edit().putString(KEY_VOICE_ID, v.trim()).apply()

    /**
     * `eleven_multilingual_v2` soa melhor; `eleven_turbo_v2_5` responde bem mais rápido.
     * Ambos falam português.
     */
    var voiceModel: String
        get() = read(KEY_VOICE_MODEL, DEFAULT_VOICE_MODEL)
        set(v) = sp.edit().putString(KEY_VOICE_MODEL, v.trim()).apply()

    /** Como o JARVIS deve te chamar. Nos filmes: "senhor". */
    var addressee: String
        get() = read(KEY_ADDRESSEE, "senhor")
        set(v) = sp.edit().putString(KEY_ADDRESSEE, v.trim()).apply()

    /** Sensibilidade do detector da palavra "Jarvis" (0.0 = conservador, 1.0 = sensível). */
    var wakeSensitivity: Float
        get() = sp.getFloat(KEY_SENSITIVITY, 0.6f)
        set(v) = sp.edit().putFloat(KEY_SENSITIVITY, v).apply()

    /** Enviar mensagens automaticamente (exige o serviço de acessibilidade ligado). */
    var autoSend: Boolean
        get() = sp.getBoolean(KEY_AUTO_SEND, false)
        set(v) = sp.edit().putBoolean(KEY_AUTO_SEND, v).apply()

    /** Ligar o JARVIS sozinho quando o celular reiniciar. */
    var startOnBoot: Boolean
        get() = sp.getBoolean(KEY_BOOT, true)
        set(v) = sp.edit().putBoolean(KEY_BOOT, v).apply()

    /**
     * Só a chave do cérebro é obrigatória.
     *
     * A do Picovoice dá a palavra de ativação, e a do ElevenLabs dá a voz melhor — mas exigir
     * qualquer uma das duas para deixar o app ligar só trava quem quer testar: sem Picovoice
     * ele funciona pelo botão, e sem ElevenLabs fala com a voz do Android.
     */
    val isConfigured: Boolean
        get() = brainKey.isNotBlank()

    /**
     * Palavra de ativação sem chave, pelo reconhecedor do Android. Ligada por padrão: um
     * assistente que só responde a botão não é o que se espera do JARVIS. Custa bateria, e
     * quem preferir economizar desliga aqui.
     */
    var freeWakeWord: Boolean
        get() = sp.getBoolean(KEY_FREE_WAKE, true)
        set(v) = sp.edit().putBoolean(KEY_FREE_WAKE, v).apply()

    /** Há alguma forma de palavra de ativação disponível. */
    val wakeWordAvailable: Boolean
        get() = picovoiceKey.isNotBlank() || freeWakeWord

    /** Gravidade da voz do Android. Abaixo de 1.0 fica mais grave, mais perto do JARVIS. */
    var ttsPitch: Float
        get() = sp.getFloat(KEY_TTS_PITCH, 0.85f)
        set(v) = sp.edit().putFloat(KEY_TTS_PITCH, v).apply()

    var ttsSpeed: Float
        get() = sp.getFloat(KEY_TTS_SPEED, 1.0f)
        set(v) = sp.edit().putFloat(KEY_TTS_SPEED, v).apply()

    /** Nome do fornecedor em uso, para mensagens que precisam ser específicas. */
    val brainLabel: String
        get() = when (brainProvider) {
            BrainProvider.GROQ -> "Groq"
            BrainProvider.GEMINI -> "Gemini"
            BrainProvider.CLAUDE -> "Anthropic"
        }

    /** A chave do cérebro em uso. */
    val brainKey: String
        get() = when (brainProvider) {
            BrainProvider.GROQ -> groqKey
            BrainProvider.GEMINI -> geminiKey
            BrainProvider.CLAUDE -> anthropicKey
        }

    companion object {
        const val DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9" // Daniel (britânico, grave)
        const val DEFAULT_VOICE_MODEL = "eleven_multilingual_v2"
        const val DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
        const val DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"

        private const val KEY_PROVIDER = "brain_provider"
        private const val KEY_GROQ = "groq_key"
        private const val KEY_GROQ_MODEL = "groq_model"
        private const val KEY_GEMINI = "gemini_key"
        private const val KEY_GEMINI_MODEL = "gemini_model"
        private const val KEY_ANTHROPIC = "anthropic_key"
        private const val KEY_ELEVENLABS = "elevenlabs_key"
        private const val KEY_PICOVOICE = "picovoice_key"
        private const val KEY_VOICE_ID = "voice_id"
        private const val KEY_VOICE_MODEL = "voice_model"
        private const val KEY_ADDRESSEE = "addressee"
        private const val KEY_SENSITIVITY = "wake_sensitivity"
        private const val KEY_AUTO_SEND = "auto_send"
        private const val KEY_BOOT = "start_on_boot"
        private const val KEY_FREE_WAKE = "free_wake_word_v2"
        private const val KEY_TTS_PITCH = "tts_pitch"
        private const val KEY_TTS_SPEED = "tts_speed"
    }
}
