package com.jarvis.assistant.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class Phase {
    /** Serviço parado. */
    OFF,

    /** Ouvindo em segundo plano, esperando a palavra "Jarvis". */
    STANDBY,

    /** Ouviu o nome; captando o comando. */
    LISTENING,

    /** Pensando / executando ações. */
    THINKING,

    /** Falando a resposta. */
    SPEAKING
}

data class Turn(val fromUser: Boolean, val text: String)

/**
 * Estado compartilhado entre o serviço em background e a interface.
 * Singleton simples — o serviço escreve, a UI observa.
 */
object JarvisState {

    private val _phase = MutableStateFlow(Phase.OFF)
    val phase: StateFlow<Phase> = _phase.asStateFlow()

    private val _transcript = MutableStateFlow<List<Turn>>(emptyList())
    val transcript: StateFlow<List<Turn>> = _transcript.asStateFlow()

    /** Nível de áudio captado (0..1), usado para animar o reator arc. */
    private val _amplitude = MutableStateFlow(0f)
    val amplitude: StateFlow<Float> = _amplitude.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    /**
     * Falso quando não há chave do Picovoice: o app segue funcionando, mas só pelo botão.
     * A interface precisa saber disso para não mandar o usuário falar "Jarvis" à toa.
     */
    private val _wakeWordActive = MutableStateFlow(false)
    val wakeWordActive: StateFlow<Boolean> = _wakeWordActive.asStateFlow()

    fun setPhase(p: Phase) {
        _phase.value = p
        if (p != Phase.LISTENING) _amplitude.value = 0f
    }

    fun setAmplitude(v: Float) {
        _amplitude.value = v.coerceIn(0f, 1f)
    }

    fun addTurn(fromUser: Boolean, text: String) {
        if (text.isBlank()) return
        _transcript.update { (it + Turn(fromUser, text)).takeLast(40) }
    }

    fun setWakeWordActive(active: Boolean) {
        _wakeWordActive.value = active
    }

    fun reportError(message: String?) {
        _lastError.value = message
    }

    fun clearTranscript() {
        _transcript.value = emptyList()
    }
}
