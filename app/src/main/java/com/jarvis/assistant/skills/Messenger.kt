package com.jarvis.assistant.skills

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.jarvis.assistant.accessibility.AutoSendRequest
import com.jarvis.assistant.data.Prefs
import java.net.URLEncoder

/**
 * Envio de mensagens.
 *
 * SMS sai direto pela [SmsManager]. WhatsApp e Telegram não expõem API de envio — o Android
 * só permite abrir a conversa com o texto já preenchido. Para completar o envio sem toque,
 * o [com.jarvis.assistant.accessibility.JarvisAccessibilityService] clica no botão de enviar,
 * quando o usuário habilita isso nas configurações.
 */
class Messenger(
    private val context: Context,
    private val prefs: Prefs,
    private val contacts: ContactResolver
) {

    sealed interface Outcome {
        data class Sent(val contactName: String, val via: String) : Outcome
        data class Opened(val contactName: String, val via: String) : Outcome
        data class Failed(val reason: String) : Outcome
    }

    fun send(app: String, contactQuery: String, message: String): Outcome {
        val contact = contacts.resolve(contactQuery)
            ?: return Outcome.Failed(
                if (contacts.hasPermission())
                    "Não encontrei ninguém chamado \"$contactQuery\" na agenda."
                else
                    "Permissão de acesso aos contatos não concedida."
            )

        return when (app.lowercase()) {
            "sms" -> sendSms(contact, message)
            "telegram" -> openTelegram(contact, message)
            else -> openWhatsApp(contact, message)
        }
    }

    private fun sendSms(contact: Contact, message: String): Outcome {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return Outcome.Failed("Permissão de envio de SMS não concedida.")
        }
        return runCatching {
            val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            // Mensagens longas precisam ser fatiadas: um SMS cabe 160 caracteres.
            val parts = sms.divideMessage(message)
            sms.sendMultipartTextMessage(contact.phone, null, parts, null, null)
            Outcome.Sent(contact.name, "SMS") as Outcome
        }.getOrElse { Outcome.Failed("Falha ao enviar o SMS: ${it.message}") }
    }

    private fun openWhatsApp(contact: Contact, message: String): Outcome {
        val number = contacts.toWhatsAppNumber(contact.phone)
        val url = "https://wa.me/$number?text=${URLEncoder.encode(message, "UTF-8")}"

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        if (!launch(intent)) return Outcome.Failed("WhatsApp não está instalado.")

        return if (prefs.autoSend && AutoSendRequest.isServiceEnabled(context)) {
            AutoSendRequest.arm()
            Outcome.Sent(contact.name, "WhatsApp")
        } else {
            Outcome.Opened(contact.name, "WhatsApp")
        }
    }

    private fun openTelegram(contact: Contact, message: String): Outcome {
        val number = contacts.toWhatsAppNumber(contact.phone)
        val url = "https://t.me/+$number?text=${URLEncoder.encode(message, "UTF-8")}"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .setPackage("org.telegram.messenger")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        if (!launch(intent)) return Outcome.Failed("Telegram não está instalado.")

        return if (prefs.autoSend && AutoSendRequest.isServiceEnabled(context)) {
            AutoSendRequest.arm()
            Outcome.Sent(contact.name, "Telegram")
        } else {
            Outcome.Opened(contact.name, "Telegram")
        }
    }

    private fun launch(intent: Intent): Boolean =
        runCatching { context.startActivity(intent) }.isSuccess
}
