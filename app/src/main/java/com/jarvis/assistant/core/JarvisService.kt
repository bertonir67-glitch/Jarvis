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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.jarvis.assistant.MainActivity
import com.jarvis.assistant.R
import com.jarvis.assistant.brain.ClaudeClient
import com.jarvis.assistant.brain.JarvisApiException
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.skills.ToolExecutor
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * O JARVIS em si: fica vivo em primeiro plano, escuta o nome dele e conduz o ciclo
 * ouvir → pensar → agir → falar.
 */
class JarvisService : LifecycleService() {

    private lateinit var prefs: Prefs
    private lateinit var voice: VoiceEngine
    private lateinit var speech: SpeechInput
    private lateinit var executor: ToolExecutor
    private lateinit var claude: ClaudeClient
    private lateinit var wakeWord: WakeWordDetector

    /** Um turno por vez — um segundo "Jarvis" no meio da resposta não pode abrir outro ciclo. */
    private var conversation: Job? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        voice = VoiceEngine(this, prefs)
        speech = SpeechInput(this)
        executor = ToolExecutor(this, prefs)
        claude = ClaudeClient(prefs, executor)
        wakeWord = WakeWordDetector(this, prefs) { onWakeWord() }
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

        val error = wakeWord.start()
        if (error != null) {
            JarvisState.reportError(error)
            JarvisState.setPhase(Phase.OFF)
            stopSelf()
            return START_NOT_STICKY
        }

        JarvisState.reportError(null)
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
            wakeWord.pause()
            try {
                runTurn(allowFollowUp = true)
            } catch (e: Exception) {
                Log.e(TAG, "erro no turno", e)
                JarvisState.reportError(e.message)
                speakSafely("Alguma coisa deu errado, ${prefs.addressee}.")
            } finally {
                JarvisState.setPhase(Phase.STANDBY)
                wakeWord.resume()?.let { JarvisState.reportError(it) }
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
            claude.ask(heard, executor.deviceSummary())
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

    private suspend fun speakSafely(text: String) {
        runCatching {
            JarvisState.setPhase(Phase.SPEAKING)
            voice.speak(text)
        }
    }

    // ------------------------------------------------------------------ infra

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

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JARVIS em espera")
            .setContentText("Diga \"Jarvis\" para começar.")
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
        wakeWord.release()
        voice.shutdown()
        JarvisState.setPhase(Phase.OFF)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "JarvisService"
        private const val CHANNEL_ID = "jarvis_listening"
        private const val NOTIFICATION_ID = 4200

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
