package com.jarvis.assistant.skills

import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Volume, lanterna, telas de configuração e leitura do estado do aparelho. */
class SystemControl(private val context: Context) {

    private val audio get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val cameras get() = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager

    fun volumeStep(up: Boolean): String {
        audio.adjustStreamVolume(
            AudioManager.STREAM_MUSIC,
            if (up) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER,
            0
        )
        return "Volume agora em ${volumePercent()}%."
    }

    fun volumeSet(percent: Int): String {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = (percent.coerceIn(0, 100) * max / 100.0).toInt().coerceIn(0, max)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
        return "Volume ajustado para ${volumePercent()}%."
    }

    fun mute(silent: Boolean): String {
        audio.adjustStreamVolume(
            AudioManager.STREAM_MUSIC,
            if (silent) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE,
            0
        )
        return if (silent) "Áudio silenciado." else "Áudio reativado."
    }

    private fun volumePercent(): Int {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / max
    }

    fun flashlight(on: Boolean): String {
        val id = cameras.cameraIdList.firstOrNull { cam ->
            cameras.getCameraCharacteristics(cam)
                .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        } ?: return "Este aparelho não tem lanterna."

        return runCatching {
            cameras.setTorchMode(id, on)
            if (on) "Lanterna ligada." else "Lanterna desligada."
        }.getOrElse { "Não consegui controlar a lanterna: ${it.message}" }
    }

    fun openSettings(section: String): String {
        val action = when (section) {
            "wifi" -> Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        return runCatching {
            context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            "Configurações abertas."
        }.getOrElse { "Não consegui abrir as configurações." }
    }

    fun openUrl(url: String): String {
        val normalized = if (url.startsWith("http")) url else "https://$url"
        return runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, android.net.Uri.parse(normalized))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            "Aberto no navegador."
        }.getOrElse { "Não consegui abrir esse endereço." }
    }

    /** Resumo curto do aparelho — também vai no prompt de sistema como contexto. */
    fun status(): String {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val charging = bm.isCharging

        val stat = StatFs(Environment.getDataDirectory().path)
        val freeGb = stat.availableBytes / 1_000_000_000.0

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val network = when {
            caps == null -> "sem conexão"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "dados móveis"
            else -> "conectado"
        }

        val hora = SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(Date())

        return buildString {
            append("Bateria: $level%")
            append(if (charging) " (carregando)" else "")
            append(". Volume: ${volumePercent()}%")
            append(". Rede: $network")
            append(". Espaço livre: ${"%.1f".format(freeGb)} GB")
            append(". Hora: $hora")
            append(". Aparelho: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}")
            append(".")
        }
    }

    fun shortSummary(): String =
        "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}"
}
