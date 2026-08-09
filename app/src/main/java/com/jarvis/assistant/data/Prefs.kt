package com.jarvis.assistant.data

import android.content.Context
import android.content.SharedPreferences
import com.jarvis.assistant.BuildConfig

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

    val isConfigured: Boolean
        get() = anthropicKey.isNotBlank() && picovoiceKey.isNotBlank()

    companion object {
        const val DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9" // Daniel (britânico, grave)
        const val DEFAULT_VOICE_MODEL = "eleven_multilingual_v2"

        private const val KEY_ANTHROPIC = "anthropic_key"
        private const val KEY_ELEVENLABS = "elevenlabs_key"
        private const val KEY_PICOVOICE = "picovoice_key"
        private const val KEY_VOICE_ID = "voice_id"
        private const val KEY_VOICE_MODEL = "voice_model"
        private const val KEY_ADDRESSEE = "addressee"
        private const val KEY_SENSITIVITY = "wake_sensitivity"
        private const val KEY_AUTO_SEND = "auto_send"
        private const val KEY_BOOT = "start_on_boot"
    }
}
