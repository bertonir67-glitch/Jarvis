package com.jarvis.assistant.skills

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import java.text.Normalizer
import java.util.Locale

data class Contact(val name: String, val phone: String)

/**
 * Resolve "manda mensagem pro joão" em um número de telefone.
 *
 * Fala reconhecida vem sem acento consistente e com grafia variável, então a comparação
 * ignora acento, caixa e pontuação, e aceita correspondência por primeiro nome.
 */
class ContactResolver(private val context: Context) {

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED

    /** Se [query] já for um número, devolve direto sem tocar na agenda. */
    fun resolve(query: String): Contact? {
        val digits = query.filter { it.isDigit() || it == '+' }
        if (digits.count { it.isDigit() } >= 8 && query.none { it.isLetter() }) {
            return Contact(query.trim(), digits)
        }
        if (!hasPermission()) return null

        val target = normalize(query)
        if (target.isEmpty()) return null

        val candidates = mutableListOf<Contact>()

        context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            null, null, null
        )?.use { cursor ->
            val nameCol = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val numCol = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (cursor.moveToNext()) {
                val name = cursor.getString(nameCol) ?: continue
                val number = cursor.getString(numCol) ?: continue
                candidates += Contact(name, number)
            }
        } ?: return null

        return candidates
            .map { it to score(normalize(it.name), target) }
            .filter { it.second > 0 }
            .maxByOrNull { it.second }
            ?.first
    }

    private fun score(candidate: String, target: String): Int = when {
        candidate == target -> 100
        candidate.startsWith("$target ") -> 90            // primeiro nome bate
        candidate.split(" ").any { it == target } -> 80   // qualquer nome bate inteiro
        candidate.contains(target) && target.length >= 3 -> 50
        else -> 0
    }

    private fun normalize(s: String): String =
        Normalizer.normalize(s.lowercase(Locale("pt", "BR")), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .replace(Regex("[^a-z0-9 ]"), "")
            .replace(Regex("\\s+"), " ")
            .trim()

    /** Formata para o padrão internacional que o WhatsApp exige (E.164 sem o "+"). */
    fun toWhatsAppNumber(raw: String): String {
        var digits = raw.filter { it.isDigit() }
        if (raw.trim().startsWith("+")) return digits
        // Número brasileiro sem DDI: 10 (fixo) ou 11 (celular) dígitos → prefixa 55.
        if (digits.length in 10..11) digits = "55$digits"
        return digits
    }
}
