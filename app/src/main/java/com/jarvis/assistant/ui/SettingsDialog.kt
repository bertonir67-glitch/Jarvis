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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import com.jarvis.assistant.brain.BrainProvider
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.ui.theme.JarvisColors

@Composable
fun SettingsDialog(
    prefs: Prefs,
    onDismiss: () -> Unit,
    onSaved: () -> Unit
) {
    val context = LocalContext.current

    var provider by remember { mutableStateOf(prefs.brainProvider) }
    var groq by remember { mutableStateOf(prefs.groqKey) }
    var groqModel by remember { mutableStateOf(prefs.groqModel) }
    var gemini by remember { mutableStateOf(prefs.geminiKey) }
    var geminiModel by remember { mutableStateOf(prefs.geminiModel) }
    var anthropic by remember { mutableStateOf(prefs.anthropicKey) }
    var picovoice by remember { mutableStateOf(prefs.picovoiceKey) }
    var eleven by remember { mutableStateOf(prefs.elevenLabsKey) }
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
                // Estado real do que está salvo — evita o caso de colar a chave certa
                // no fornecedor errado e não entender por que continua travado.
                Status("Cérebro (${prefs.brainLabel})", prefs.brainKey.isNotBlank())
                Status("Palavra de ativação (Picovoice)", prefs.wakeWordAvailable)
                Status("Voz do ElevenLabs", prefs.elevenLabsKey.isNotBlank())
                Hint(
                    "Só o cérebro é obrigatório. Sem Picovoice o JARVIS funciona pelo botão " +
                        "FALAR; sem ElevenLabs ele fala com a voz do Android."
                )

                HorizontalDivider(color = JarvisColors.CyanDim)
                Section("Cérebro")

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BrainProvider.entries.forEach { option ->
                        FilterChip(
                            selected = provider == option,
                            onClick = { provider = option },
                            label = {
                                Text(
                                    when (option) {
                                        BrainProvider.GROQ -> "Groq"
                                        BrainProvider.GEMINI -> "Gemini"
                                        BrainProvider.CLAUDE -> "Claude"
                                    }
                                )
                            }
                        )
                    }
                }

                when (provider) {
                    BrainProvider.GROQ -> {
                        Secret("Chave do Groq", groq) { groq = it }
                        Field("Modelo", groqModel) { groqModel = it }
                        Hint(
                            "Grátis, sem cartão, e o cadastro é só e-mail — não precisa de " +
                                "conta Google. Pegue em console.groq.com/keys.\n" +
                                "Se o modelo sair de circulação, o app troca sozinho por um " +
                                "equivalente."
                        )
                    }

                    BrainProvider.GEMINI -> {
                        Secret("Chave do Gemini", gemini) { gemini = it }
                        Field("Modelo", geminiModel) { geminiModel = it }
                        Hint(
                            "Grátis, sem cartão. Pegue em aistudio.google.com/apikey.\n" +
                                "gemini-2.5-flash: 250 pedidos/dia.\n" +
                                "gemini-2.5-flash-lite: 1.000 pedidos/dia, mais rápido."
                        )
                    }

                    BrainProvider.CLAUDE -> {
                        Secret("Chave da Anthropic", anthropic) { anthropic = it }
                        Hint("Pago por uso. Respostas melhores, mas gera custo.")
                    }
                }

                HorizontalDivider(color = JarvisColors.CyanDim)
                Section("Palavra de ativação")

                Secret("Chave do Picovoice", picovoice) { picovoice = it }
                Hint("Grátis para uso pessoal, em console.picovoice.ai.")

                Text(
                    "Sensibilidade: ${"%.2f".format(sensitivity)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = JarvisColors.TextPrimary
                )
                Slider(
                    value = sensitivity,
                    onValueChange = { sensitivity = it },
                    valueRange = 0.2f..0.95f
                )
                Hint("Mais alto detecta melhor, mas dispara sozinho com mais frequência.")

                HorizontalDivider(color = JarvisColors.CyanDim)
                Section("Voz")

                Secret("Chave do ElevenLabs (opcional)", eleven) { eleven = it }
                Hint(
                    "Deixe em branco para usar a voz do próprio Android — grátis, offline e " +
                        "ilimitada, mas bem menos parecida com a do filme. Com a chave, ele usa " +
                        "a voz britânica do ElevenLabs (plano grátis: ~10 mil caracteres/mês) e " +
                        "volta sozinho para a voz local quando a cota acabar."
                )
                Field("ID da voz", voiceId) { voiceId = it }
                Field("Modelo de voz", voiceModel) { voiceModel = it }

                HorizontalDivider(color = JarvisColors.CyanDim)
                Section("Comportamento")

                Field("Como ele deve te chamar", addressee) { addressee = it }

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

                Spacer(Modifier.height(4.dp))
            }
        },
        confirmButton = {
            TextButton(onClick = {
                prefs.brainProvider = provider
                prefs.groqKey = groq
                prefs.groqModel = groqModel
                prefs.geminiKey = gemini
                prefs.geminiModel = geminiModel
                prefs.anthropicKey = anthropic
                prefs.picovoiceKey = picovoice
                prefs.elevenLabsKey = eleven
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
private fun Status(label: String, ok: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = JarvisColors.TextPrimary)
        Text(
            text = if (ok) "configurado" else "faltando",
            style = MaterialTheme.typography.bodyMedium,
            color = if (ok) JarvisColors.CyanSoft else JarvisColors.Amber
        )
    }
}

@Composable
private fun Section(title: String) {
    Text(
        text = title.uppercase(),
        style = MaterialTheme.typography.labelLarge,
        color = JarvisColors.CyanSoft
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
