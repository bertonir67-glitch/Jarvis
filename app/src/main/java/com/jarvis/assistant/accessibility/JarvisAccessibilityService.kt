package com.jarvis.assistant.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Janela de autorização para o clique automático em "enviar".
 *
 * O serviço só age quando o [Messenger][com.jarvis.assistant.skills.Messenger] acabou de abrir
 * uma conversa com o texto preenchido, e a autorização expira sozinha em poucos segundos. Sem
 * isso, um serviço de acessibilidade que clica em "enviar" sempre que vê o botão acabaria
 * disparando mensagens que o usuário estava escrevendo à mão.
 */
object AutoSendRequest {

    private const val WINDOW_MS = 10_000L

    @Volatile
    private var armedAt = 0L

    fun arm() {
        armedAt = System.currentTimeMillis()
    }

    fun disarm() {
        armedAt = 0L
    }

    /** Consome a autorização: só o primeiro chamador dentro da janela recebe `true`. */
    fun consume(): Boolean {
        val at = armedAt
        if (at == 0L) return false
        if (System.currentTimeMillis() - at > WINDOW_MS) {
            armedAt = 0L
            return false
        }
        armedAt = 0L
        return true
    }

    fun isServiceEnabled(context: Context): Boolean {
        val expected = ComponentName(context, JarvisAccessibilityService::class.java)
            .flattenToString()
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }
}

class JarvisAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString() ?: return
        if (pkg !in SUPPORTED) return

        val root = rootInActiveWindow ?: return
        val sendButton = findSendButton(root, pkg) ?: return

        if (!AutoSendRequest.consume()) return

        val clicked = sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK) ||
            sendButton.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true

        Log.d(TAG, "envio automático em $pkg: ${if (clicked) "ok" else "falhou"}")
        if (!clicked) AutoSendRequest.arm() // deixa a próxima atualização de tela tentar de novo
    }

    private fun findSendButton(root: AccessibilityNodeInfo, pkg: String): AccessibilityNodeInfo? {
        VIEW_IDS[pkg]?.forEach { id ->
            root.findAccessibilityNodeInfosByViewId(id)
                ?.firstOrNull { it.isVisibleToUser }
                ?.let { return it }
        }
        // Telegram e variantes não expõem id estável — cai para a descrição do botão.
        return findByDescription(root)
    }

    private fun findByDescription(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        val desc = node.contentDescription?.toString()?.lowercase()
        if (desc != null && DESCRIPTIONS.any { desc == it || desc.startsWith("$it ") }) {
            return node
        }
        for (i in 0 until node.childCount) {
            findByDescription(node.getChild(i))?.let { return it }
        }
        return null
    }

    override fun onInterrupt() {
        AutoSendRequest.disarm()
    }

    private companion object {
        const val TAG = "JarvisA11y"

        val SUPPORTED = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "org.telegram.messenger.web"
        )

        val VIEW_IDS = mapOf(
            "com.whatsapp" to listOf("com.whatsapp:id/send"),
            "com.whatsapp.w4b" to listOf("com.whatsapp.w4b:id/send")
        )

        val DESCRIPTIONS = setOf("enviar", "send")
    }
}
