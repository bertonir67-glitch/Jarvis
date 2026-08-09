package com.jarvis.assistant.skills

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import java.util.Locale

/**
 * Despertadores e cronômetros.
 *
 * Usa as intents padrão do Android, então o alarme entra no app de relógio que o usuário já
 * usa — nada de o JARVIS manter um agendamento próprio que morre junto com o processo.
 * `EXTRA_SKIP_UI` faz o relógio criar sem abrir a tela, que é o ponto de pedir por voz.
 */
class Scheduler(private val context: Context) {

    fun setAlarm(hour: Int, minute: Int, label: String?): String {
        if (hour !in 0..23 || minute !in 0..59) {
            return "Horário inválido: $hour:$minute."
        }

        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour)
            .putExtra(AlarmClock.EXTRA_MINUTES, minute)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .apply { if (!label.isNullOrBlank()) putExtra(AlarmClock.EXTRA_MESSAGE, label) }

        return runCatching {
            context.startActivity(intent)
            val hhmm = String.format(Locale.US, "%02d:%02d", hour, minute)
            if (label.isNullOrBlank()) "Despertador criado para $hhmm."
            else "Despertador criado para $hhmm: $label."
        }.getOrElse { "Não achei um app de relógio que aceite criar alarmes." }
    }

    fun setTimer(seconds: Int, label: String?): String {
        if (seconds <= 0) return "Duração inválida."

        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .apply { if (!label.isNullOrBlank()) putExtra(AlarmClock.EXTRA_MESSAGE, label) }

        return runCatching {
            context.startActivity(intent)
            "Timer de ${describe(seconds)} iniciado."
        }.getOrElse { "Não achei um app de relógio que aceite criar timers." }
    }

    /** Texto que soa natural falado: "1 hora e 30 minutos", não "5400 segundos". */
    private fun describe(seconds: Int): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60

        val parts = buildList {
            if (h > 0) add(if (h == 1) "1 hora" else "$h horas")
            if (m > 0) add(if (m == 1) "1 minuto" else "$m minutos")
            if (s > 0 && h == 0) add(if (s == 1) "1 segundo" else "$s segundos")
        }

        return when (parts.size) {
            0 -> "$seconds segundos"
            1 -> parts[0]
            else -> parts.dropLast(1).joinToString(", ") + " e " + parts.last()
        }
    }
}
