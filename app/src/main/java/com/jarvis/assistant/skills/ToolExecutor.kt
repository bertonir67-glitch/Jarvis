package com.jarvis.assistant.skills

import android.content.Context
import com.jarvis.assistant.brain.Tools
import com.jarvis.assistant.data.Prefs
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Executa no aparelho as ferramentas que o modelo pediu, e devolve para ele um texto curto
 * descrevendo o que aconteceu. Esse texto é o que o modelo usa para redigir a fala final —
 * então ele precisa ser factual e específico ("Spotify aberto"), não genérico ("ok").
 */
class ToolExecutor(
    context: Context,
    prefs: Prefs
) {

    data class Result(val text: String, val isError: Boolean = false)

    private val appContext = context.applicationContext
    private val contacts = ContactResolver(appContext)
    private val launcher = AppLauncher(appContext)
    private val messenger = Messenger(appContext, prefs, contacts)
    private val system = SystemControl(appContext)
    private val scheduler = Scheduler(appContext)
    private val music = MusicControl(appContext)

    fun deviceSummary(): String = system.shortSummary()

    fun execute(name: String, input: JsonObject): Result = when (name) {

        Tools.OPEN_APP -> {
            val appName = input.str("app_name").orEmpty()
            when (val label = launcher.launch(appName)) {
                null -> Result("Não encontrei nenhum app instalado parecido com \"$appName\".", isError = true)
                else -> Result("Abri o $label.")
            }
        }

        Tools.SEND_MESSAGE -> {
            val app = input.str("app") ?: "whatsapp"
            val contact = input.str("contact").orEmpty()
            val message = input.str("message").orEmpty()
            when (val outcome = messenger.send(app, contact, message)) {
                is Messenger.Outcome.Sent ->
                    Result("Mensagem enviada para ${outcome.contactName} pelo ${outcome.via}.")
                is Messenger.Outcome.Opened ->
                    Result(
                        "Abri a conversa com ${outcome.contactName} no ${outcome.via} com a " +
                            "mensagem já escrita. O envio automático está desligado, então o " +
                            "usuário precisa tocar em enviar. Avise isso a ele."
                    )
                is Messenger.Outcome.Failed ->
                    Result(outcome.reason, isError = true)
            }
        }

        Tools.OPEN_URL -> Result(system.openUrl(input.str("url").orEmpty()))

        Tools.DEVICE_ACTION -> when (val action = input.str("action")) {
            "volume_up" -> Result(system.volumeStep(up = true))
            "volume_down" -> Result(system.volumeStep(up = false))
            "volume_set" -> Result(system.volumeSet(input.int("value") ?: 50))
            "mute" -> Result(system.mute(silent = true))
            "unmute" -> Result(system.mute(silent = false))
            "flashlight_on" -> Result(system.flashlight(on = true))
            "flashlight_off" -> Result(system.flashlight(on = false))
            "open_wifi_settings" -> Result(system.openSettings("wifi"))
            "open_bluetooth_settings" -> Result(system.openSettings("bluetooth"))
            "open_settings" -> Result(system.openSettings("geral"))
            else -> Result("Ação desconhecida: $action", isError = true)
        }

        Tools.DEVICE_STATUS -> Result(system.status())

        Tools.SET_ALARM -> when (val hour = input.int("hour")) {
            null -> Result("O horário do despertador não veio.", isError = true)
            else -> Result(
                scheduler.setAlarm(
                    hour = hour,
                    minute = input.int("minute") ?: 0,
                    label = input.str("label")
                )
            )
        }

        Tools.SET_TIMER -> when (val seconds = input.int("seconds")) {
            null -> Result("A duração do timer não veio.", isError = true)
            else -> Result(scheduler.setTimer(seconds, input.str("label")))
        }

        Tools.CONTROL_MUSIC -> when (val action = input.str("action")) {
            "play" -> Result(music.play(input.str("query"), input.str("app")))
            "play_pause" -> Result(music.playPause())
            "next" -> Result(music.next())
            "previous" -> Result(music.previous())
            "stop" -> Result(music.stop())
            else -> Result("Ação de música desconhecida: $action", isError = true)
        }

        Tools.MAKE_CALL -> when (val outcome = messenger.call(input.str("contact").orEmpty())) {
            is Messenger.Outcome.Sent -> Result("Ligando para ${outcome.contactName}.")
            is Messenger.Outcome.Opened -> Result(
                "Abri o discador com o número de ${outcome.contactName}. A permissão de " +
                    "telefone não foi concedida, então o usuário precisa tocar para completar " +
                    "a ligação. Avise isso a ele."
            )
            is Messenger.Outcome.Failed -> Result(outcome.reason, isError = true)
        }

        else -> Result("Ferramenta desconhecida: $name", isError = true)
    }

    private fun JsonObject.str(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.int(key: String): Int? =
        this[key]?.jsonPrimitive?.intOrNull
}
