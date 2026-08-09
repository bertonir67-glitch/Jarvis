package com.jarvis.assistant.skills

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import java.text.Normalizer
import java.util.Locale

/**
 * Abre apps instalados a partir do nome falado.
 *
 * A fala nunca bate exatamente com o rótulo do app ("zap" vs "WhatsApp Messenger"), então
 * combina um dicionário de apelidos com correspondência aproximada sobre os apps instalados.
 */
class AppLauncher(private val context: Context) {

    private data class Installed(val label: String, val normalized: String, val pkg: String)

    private val installed: List<Installed> by lazy { loadInstalled() }

    private fun loadInstalled(): List<Installed> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(intent, 0).mapNotNull { info ->
            val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
            val label = info.loadLabel(pm).toString()
            Installed(label, normalize(label), pkg)
        }.distinctBy { it.pkg }
    }

    /** @return o rótulo do app aberto, ou null se não achou nada parecido. */
    fun launch(spokenName: String): String? {
        val target = normalize(spokenName)
        if (target.isEmpty()) return null

        // 1. Apelido conhecido → pacote exato.
        ALIASES[target]?.let { pkg ->
            if (open(pkg)) return installed.firstOrNull { it.pkg == pkg }?.label ?: spokenName
        }

        // 2. Correspondência sobre os apps instalados.
        val best = installed
            .map { it to score(it.normalized, target) }
            .filter { it.second > 0 }
            .maxByOrNull { it.second }
            ?.first ?: return null

        return if (open(best.pkg)) best.label else null
    }

    private fun open(pkg: String): Boolean {
        val launch = context.packageManager.getLaunchIntentForPackage(pkg) ?: return false
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { context.startActivity(launch) }.isSuccess
    }

    private fun score(candidate: String, target: String): Int = when {
        candidate == target -> 100
        candidate.startsWith(target) -> 80
        candidate.split(" ").any { it == target } -> 70
        target.length >= 3 && candidate.contains(target) -> 50
        target.length >= 4 && candidate.isNotEmpty() &&
            target.contains(candidate.split(" ").first()) -> 30
        else -> 0
    }

    private fun normalize(s: String): String =
        Normalizer.normalize(s.lowercase(Locale("pt", "BR")), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    fun isInstalled(pkg: String): Boolean =
        runCatching {
            context.packageManager.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES)
        }.isSuccess

    private companion object {
        /** Como as pessoas realmente falam o nome dos apps. */
        val ALIASES = mapOf(
            "zap" to "com.whatsapp",
            "zapzap" to "com.whatsapp",
            "whats" to "com.whatsapp",
            "whatsapp" to "com.whatsapp",
            "insta" to "com.instagram.android",
            "instagram" to "com.instagram.android",
            "face" to "com.facebook.katana",
            "facebook" to "com.facebook.katana",
            "youtube" to "com.google.android.youtube",
            "yt" to "com.google.android.youtube",
            "spotify" to "com.spotify.music",
            "telegram" to "org.telegram.messenger",
            "gmail" to "com.google.android.gm",
            "email" to "com.google.android.gm",
            "maps" to "com.google.android.apps.maps",
            "mapa" to "com.google.android.apps.maps",
            "waze" to "com.waze",
            "uber" to "com.ubercab",
            "ifood" to "br.com.brainweb.ifood",
            "nubank" to "com.nu.production",
            "netflix" to "com.netflix.mediaclient",
            "camera" to "com.android.camera",
            "chrome" to "com.android.chrome",
            "navegador" to "com.android.chrome",
            "calculadora" to "com.google.android.calculator",
            "tiktok" to "com.zhiliaoapp.musically",
            "x" to "com.twitter.android",
            "twitter" to "com.twitter.android",
            "linkedin" to "com.linkedin.android"
        )
    }
}
