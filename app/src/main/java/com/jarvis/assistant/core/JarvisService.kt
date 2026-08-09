package com.jarvis.assistant.core

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.jarvis.assistant.MainActivity
import com.jarvis.assistant.R
import com.jarvis.assistant.brain.Brain
import com.jarvis.assistant.brain.BrainProvider
import com.jarvis.assistant.brain.ClaudeClient
import com.jarvis.assistant.brain.GeminiClient
import com.jarvis.assistant.brain.GroqClient
import com.jarvis.assistant.brain.JarvisApiException
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.skills.ToolExecutor
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * O JARVIS em si: fica vivo em primeiro plano, escuta o nome dele e conduz o ciclo
 * ouvir → pensar → agir → falar.
 */
class JarvisService : LifecycleService() {

    private lateinit var prefs: Prefs
    private lateinit var voice: VoiceEngine
    private lateinit var speech: SpeechInput
    private lateinit var executor: ToolExecutor
    private lateinit var wakeWord: WakeWord

    private var brain: Brain? = null
    private var brainProvider: BrainProvider? = null

    /** Um turno por vez — um segundo "Jarvis" no meio da resposta não pode abrir outro ciclo. */
    private var conversation: Job? = null

    /**
     * Sem isto o Android suspende a CPU com a tela apagada e o detector simplesmente para de
     * ouvir — o app parece ligado, com notificação e tudo, e não responde. É o preço de um
     * assistente que fica de prontidão: mantém a CPU acordada, não a tela.
     */
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        voice = VoiceEngine(this, prefs)
        speech = SpeechInput(this)
        executor = ToolExecutor(this, prefs)
        // Porcupine quando há chave (melhor bateria); senão o reconhecedor do Android,
        // que não exige cadastro nenhum.
        wakeWord = if (prefs.picovoiceKey.isNotBlank()) {
            PorcupineWakeWord(this, prefs) { onWakeWord() }
        } else {
            AndroidWakeWord(this) { onWakeWord() }
        }
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_TRIGGER -> {
                startInForeground()
                onWakeWord()
                return START_STICKY
            }
        }

        startInForeground()

        if (!hasMicPermission()) {
            JarvisState.reportError("Permissão de microfone não concedida.")
            stopSelf()
            return START_NOT_STICKY
        }

        // Sem chave do Picovoice o app não morre: passa a responder só pelo botão.
        // Falhar aqui deixaria o usuário sem nada, sendo que o resto funciona.
        var listening = false
        if (prefs.wakeWordAvailable) {
            val error = wakeWord.start()
            if (error == null) {
                listening = true
                JarvisState.reportError(null)
            } else {
                JarvisState.reportError("$error Use o botão FALAR enquanto isso.")
            }
        } else {
            JarvisState.reportError(null)
        }

        JarvisState.setWakeWordActive(listening)
        if (listening) acquireWakeLock()
        // A notificação foi montada antes de sabermos se a escuta subiu — reescreve agora,
        // senão ela diria "toque em Falar" mesmo com a palavra de ativação funcionando.
        refreshNotification()
        JarvisState.setPhase(Phase.STANDBY)
        return START_STICKY
    }

    private fun startInForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    // ------------------------------------------------------------------ ciclo

    private fun onWakeWord() {
        if (conversation?.isActive == true) return

        conversation = lifecycleScope.launch {
            // O microfone é exclusivo: o detector precisa soltá-lo antes do reconhecedor abrir.
            if (JarvisState.wakeWordActive.value) wakeWord.pause()
            try {
                // Se qualquer etapa travar, o turno morre sozinho e a escuta volta — sem isso
                // um travamento deixaria o JARVIS surdo até alguém reiniciar o serviço.
                withTimeoutOrNull(TURN_TIMEOUT_MS) { runTurn(allowFollowUp = true) }
            } catch (e: Exception) {
                Log.e(TAG, "erro no turno", e)
                JarvisState.reportError(e.message)
                speakSafely("Alguma coisa deu errado, ${prefs.addressee}.")
            } finally {
                JarvisState.setPhase(Phase.STANDBY)
                if (JarvisState.wakeWordActive.value) {
                    wakeWord.resume()?.let { JarvisState.reportError(it) }
                }
            }
        }
    }

    private suspend fun runTurn(allowFollowUp: Boolean) {
        JarvisState.setPhase(Phase.LISTENING)

        val heard = speech.listen()
        if (heard.isNullOrBlank()) {
            // Silêncio depois do nome geralmente é falso positivo do detector.
            // Voltar calado é menos irritante do que responder "não entendi" à toa.
            return
        }

        JarvisState.addTurn(fromUser = true, text = heard)
        JarvisState.setPhase(Phase.THINKING)

        val reply = try {
            brain().ask(heard, executor.deviceSummary())
        } catch (e: JarvisApiException) {
            JarvisState.reportError(e.message)
            e.message ?: "Não consegui falar com o servidor, ${prefs.addressee}."
        }

        JarvisState.addTurn(fromUser = false, text = reply)
        JarvisState.setPhase(Phase.SPEAKING)
        voice.speak(reply)

        // Se o JARVIS fez uma pergunta, continua ouvindo sem exigir o nome de novo —
        // é assim que a conversa flui nos filmes.
        if (allowFollowUp && reply.trimEnd().endsWith("?")) {
            runTurn(allowFollowUp = false)
        }
    }

    /** Recria o cérebro se o usuário trocou de fornecedor nas configurações. */
    private fun brain(): Brain {
        val provider = prefs.brainProvider
        val current = brain
        if (current != null && brainProvider == provider) return current

        val created: Brain = when (provider) {
            BrainProvider.GROQ -> GroqClient(prefs, executor)
            BrainProvider.GEMINI -> GeminiClient(prefs, executor)
            BrainProvider.CLAUDE -> ClaudeClient(prefs, executor)
        }
        brain = created
        brainProvider = provider
        return created
    }

    private suspend fun speakSafely(text: String) {
        runCatching {
            JarvisState.setPhase(Phase.SPEAKING)
            voice.speak(text)
        }
    }

    // ------------------------------------------------------------------ infra

    private fun refreshNotification() {
        runCatching {
            getSystemService(NotificationManager::class.java)
                .notify(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
        wakeLock = null
    }

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Mantém o JARVIS ouvindo em segundo plano."
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE
        )

        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, JarvisService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )

        val trigger = PendingIntent.getService(
            this, 2,
            Intent(this, JarvisService::class.java).setAction(ACTION_TRIGGER),
            PendingIntent.FLAG_IMMUTABLE
        )

        val hint = if (JarvisState.wakeWordActive.value) {
            "Diga \"Jarvis\" para começar."
        } else {
            "Toque em Falar para começar."
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JARVIS em espera")
            .setContentText(hint)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(open)
            .addAction(0, "Falar", trigger)
            .addAction(0, "Desligar", stop)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    override fun onDestroy() {
        conversation?.cancel()
        releaseWakeLock()
        JarvisState.setWakeWordActive(false)
        wakeWord.release()
        voice.shutdown()
        JarvisState.setPhase(Phase.OFF)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "JarvisService"
        private const val CHANNEL_ID = "jarvis_listening"
        private const val NOTIFICATION_ID = 4200
        private const val WAKE_LOCK_TAG = "jarvis:listening"
        private const val TURN_TIMEOUT_MS = 120_000L

        const val ACTION_STOP = "com.jarvis.assistant.STOP"
        const val ACTION_TRIGGER = "com.jarvis.assistant.TRIGGER"

        fun start(context: Context) {
            val intent = Intent(context, JarvisService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun trigger(context: Context) {
            val intent = Intent(context, JarvisService::class.java).setAction(ACTION_TRIGGER)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, JarvisService::class.java))
        }
    }
}
