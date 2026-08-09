package com.jarvis.assistant.ui

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.jarvis.assistant.accessibility.AutoSendRequest
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.ui.theme.JarvisColors

@Composable
fun SettingsDialog(
    prefs: Prefs,
    onDismiss: () -> Unit,
    onSaved: () -> Unit
) {
    val context = LocalContext.current

    var anthropic by remember { mutableStateOf(prefs.anthropicKey) }
    var eleven by remember { mutableStateOf(prefs.elevenLabsKey) }
    var picovoice by remember { mutableStateOf(prefs.picovoiceKey) }
    var voiceId by remember { mutableStateOf(prefs.voiceId) }
    var voiceModel by remember { mutableStateOf(prefs.voiceModel) }
    var addressee by remember { mutableStateOf(prefs.addressee) }
    var sensitivity by remember { mutableFloatStateOf(prefs.wakeSensitivity) }
    var autoSend by remember { mutableStateOf(prefs.autoSend) }
    var startOnBoot by remember { mutableStateOf(prefs.startOnBoot) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = JarvisColors.Panel,
        title = { Text("Configurações", color = JarvisColors.Cyan) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Secret("Chave da Anthropic", anthropic) { anthropic = it }
                Secret("Chave do ElevenLabs", eleven) { eleven = it }
                Secret("Chave do Picovoice", picovoice) { picovoice = it }

                Field("ID da voz (ElevenLabs)", voiceId) { voiceId = it }
                Field("Modelo de voz", voiceModel) { voiceModel = it }
                Hint("eleven_multilingual_v2 soa melhor. eleven_turbo_v2_5 responde mais rápido.")

                Field("Como ele deve te chamar", addressee) { addressee = it }

                Spacer(Modifier.height(4.dp))
                Text(
                    "Sensibilidade da palavra \"Jarvis\": ${"%.2f".format(sensitivity)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = JarvisColors.TextPrimary
                )
                Slider(
                    value = sensitivity,
                    onValueChange = { sensitivity = it },
                    valueRange = 0.2f..0.95f
                )
                Hint("Mais alto detecta melhor, mas dispara sozinho com mais frequência.")

                Toggle(
                    label = "Enviar mensagens automaticamente",
                    checked = autoSend,
                    onChange = { autoSend = it }
                )
                Hint(
                    if (AutoSendRequest.isServiceEnabled(context))
                        "Serviço de acessibilidade ativo."
                    else
                        "Requer o serviço de acessibilidade do JARVIS ligado. Sem ele, a conversa " +
                            "abre com a mensagem escrita e você toca em enviar."
                )
                TextButton(onClick = { openAccessibilitySettings(context) }) {
                    Text("Abrir acessibilidade do Android", color = JarvisColors.CyanSoft)
                }

                Toggle(
                    label = "Ligar sozinho ao reiniciar",
                    checked = startOnBoot,
                    onChange = { startOnBoot = it }
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                prefs.anthropicKey = anthropic
                prefs.elevenLabsKey = eleven
                prefs.picovoiceKey = picovoice
                prefs.voiceId = voiceId
                prefs.voiceModel = voiceModel
                prefs.addressee = addressee
                prefs.wakeSensitivity = sensitivity
                prefs.autoSend = autoSend
                prefs.startOnBoot = startOnBoot
                onSaved()
            }) { Text("Salvar", color = JarvisColors.Cyan) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar", color = JarvisColors.TextMuted)
            }
        }
    )
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun Secret(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun Toggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = JarvisColors.TextPrimary)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = JarvisColors.TextMuted)
}

private fun openAccessibilitySettings(context: Context) {
    runCatching {
        context.startActivity(
            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
