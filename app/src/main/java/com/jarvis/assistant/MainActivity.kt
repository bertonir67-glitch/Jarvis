package com.jarvis.assistant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.jarvis.assistant.core.JarvisService
import com.jarvis.assistant.core.JarvisState
import com.jarvis.assistant.core.Phase
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.ui.JarvisScreen
import com.jarvis.assistant.ui.SettingsDialog
import com.jarvis.assistant.ui.theme.JarvisTheme

class MainActivity : ComponentActivity() {

    private lateinit var prefs: Prefs

    /** O que fazer assim que as permissões voltarem concedidas. */
    private var pendingAction: (() -> Unit)? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted[Manifest.permission.RECORD_AUDIO] == true) {
            pendingAction?.invoke()
        } else {
            JarvisState.reportError(
                "Sem acesso ao microfone o JARVIS não consegue ouvir você."
            )
        }
        pendingAction = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        prefs = Prefs(this)

        setContent {
            JarvisTheme {
                var showSettings by remember { mutableStateOf(!prefs.isConfigured) }

                JarvisScreen(
                    onStart = { withPermissions { JarvisService.start(this) } },
                    onStop = { JarvisService.stop(this) },
                    onTalk = { withPermissions { JarvisService.trigger(this) } },
                    onOpenSettings = { showSettings = true }
                )

                if (showSettings) {
                    SettingsDialog(
                        prefs = prefs,
                        onDismiss = { showSettings = false },
                        onSaved = {
                            showSettings = false
                            JarvisState.reportError(null)
                            // Reinicia o serviço para pegar as chaves novas.
                            if (JarvisState.phase.value != Phase.OFF) {
                                JarvisService.stop(this)
                                withPermissions { JarvisService.start(this) }
                            }
                        }
                    )
                }
            }
        }

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Segurar o botão home dispara ACTION_ASSIST: começa a ouvir na hora. */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_ASSIST) {
            withPermissions { JarvisService.trigger(this) }
        }
    }

    private fun withPermissions(action: () -> Unit) {
        if (!prefs.isConfigured) {
            // Dizer exatamente o que falta, e em qual campo: colar a chave certa no
            // fornecedor errado é o engano mais fácil de cometer nessa tela.
            JarvisState.reportError(
                "Falta a chave do ${prefs.brainLabel}. Abra Configurações, confirme que o " +
                    "cérebro selecionado é \"${prefs.brainLabel}\" e cole a chave nesse campo."
            )
            return
        }

        val missing = requiredPermissions().filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            action()
        } else {
            pendingAction = action
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    private fun requiredPermissions(): List<String> = buildList {
        add(Manifest.permission.RECORD_AUDIO)
        add(Manifest.permission.READ_CONTACTS)
        add(Manifest.permission.SEND_SMS)
        add(Manifest.permission.CALL_PHONE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
