package com.jarvis.assistant.brain

import android.util.Log
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.skills.ToolExecutor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Ponte com a Claude API.
 *
 * O laço aqui é o padrão de tool use: manda a conversa, se o modelo pedir uma ferramenta
 * a gente executa no aparelho, devolve o resultado e repete até ele parar de pedir.
 */
class ClaudeClient(
    private val prefs: Prefs,
    private val executor: ToolExecutor
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /** Histórico da conversa, no formato exato que a API espera. */
    private val history = mutableListOf<JsonObject>()

    /** Desligado automaticamente se a conta não tiver esse beta liberado. */
    private var useFallbacks = true

    fun resetConversation() = history.clear()

    /**
     * Manda o que o usuário falou e devolve o texto que o JARVIS deve falar de volta.
     * @throws JarvisApiException em falha de rede ou erro da API.
     */
    suspend fun ask(userText: String, deviceSummary: String): String = withContext(Dispatchers.IO) {
        val apiKey = prefs.anthropicKey
        if (apiKey.isBlank()) throw JarvisApiException("Chave da Anthropic não configurada.")

        history.add(
            buildJsonObject {
                put("role", "user")
                put("content", userText)
            }
        )

        val system = SystemPrompt.build(prefs.addressee, deviceSummary)

        repeat(MAX_STEPS) {
            val response = post(apiKey, system)

            val stopReason = response["stop_reason"]?.jsonPrimitive?.contentOrNull
            val content = response["content"]?.jsonArray ?: JsonArray(emptyList())

            if (stopReason == "refusal") {
                // A recusa contamina o histórico — descarta o turno inteiro.
                dropLastUserTurn()
                return@withContext "Isso eu não posso fazer, ${prefs.addressee}."
            }

            // O bloco assistant volta verbatim: blocos de raciocínio precisam ir de volta intactos.
            history.add(
                buildJsonObject {
                    put("role", "assistant")
                    put("content", content)
                }
            )

            // O modelo pausou no meio de uma ferramenta de servidor (busca). Reenvia para continuar.
            if (stopReason == "pause_turn") return@repeat

            val toolCalls = content.filter { it.jsonObject.typeIs("tool_use") }

            if (toolCalls.isEmpty()) {
                val text = content
                    .filter { it.jsonObject.typeIs("text") }
                    .mapNotNull { it.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                    .joinToString(" ")
                    .trim()

                trimHistory()
                return@withContext text.ifBlank { "Pronto, ${prefs.addressee}." }
            }

            val results = buildJsonArray {
                for (call in toolCalls) {
                    val obj = call.jsonObject
                    val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: continue
                    val name = obj["name"]?.jsonPrimitive?.contentOrNull ?: continue
                    val input = obj["input"] as? JsonObject ?: JsonObject(emptyMap())

                    val outcome = runCatching { executor.execute(name, input) }
                        .getOrElse { ToolExecutor.Result("Falha ao executar: ${it.message}", isError = true) }

                    addJsonObject {
                        put("type", "tool_result")
                        put("tool_use_id", id)
                        put("content", outcome.text)
                        if (outcome.isError) put("is_error", true)
                    }
                }
            }

            history.add(
                buildJsonObject {
                    put("role", "user")
                    put("content", results)
                }
            )
        }

        trimHistory()
        "Me perdi no meio da tarefa, ${prefs.addressee}. Pode repetir?"
    }

    private fun post(apiKey: String, system: String): JsonObject {
        val attempt = execute(apiKey, system, withFallbacks = useFallbacks)
        if (attempt != null) return attempt

        // O beta de fallback não está liberado nessa conta — segue sem ele.
        useFallbacks = false
        return execute(apiKey, system, withFallbacks = false)
            ?: throw JarvisApiException("A API recusou a requisição.")
    }

    /** @return null se o erro for especificamente o parâmetro `fallbacks`. */
    private fun execute(apiKey: String, system: String, withFallbacks: Boolean): JsonObject? {
        val body = buildJsonObject {
            put("model", MODEL)
            put("max_tokens", 8192)
            put("system", system)
            put("output_config", buildJsonObject { put("effort", EFFORT) })
            put("tools", Tools.definitions)
            put("messages", JsonArray(history))
            if (withFallbacks) put("fallbacks", "default")
        }

        val request = Request.Builder()
            .url(ENDPOINT)
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .apply {
                if (withFallbacks) addHeader("anthropic-beta", FALLBACK_BETA)
            }
            .post(body.toString().toRequestBody(JSON_MEDIA))
            .build()

        val (code, payload) = try {
            http.newCall(request).execute().use { it.code to (it.body?.string() ?: "") }
        } catch (e: IOException) {
            throw JarvisApiException("Sem conexão com a Anthropic.", e)
        }

        if (code in 200..299) return json.parseToJsonElement(payload).jsonObject

        Log.w(TAG, "HTTP $code: $payload")

        if (code == 400 && withFallbacks && payload.contains("fallback", ignoreCase = true)) {
            return null
        }

        val detail = runCatching {
            json.parseToJsonElement(payload).jsonObject["error"]
                ?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
        }.getOrNull()

        throw JarvisApiException(
            when (code) {
                401 -> "Chave da Anthropic inválida."
                429 -> "Limite de uso da API atingido."
                else -> detail ?: "Erro $code na Claude API."
            }
        )
    }

    private fun dropLastUserTurn() {
        for (i in history.indices.reversed()) {
            if (history[i]["role"]?.jsonPrimitive?.contentOrNull == "user") {
                while (history.size > i) history.removeAt(history.size - 1)
                return
            }
        }
    }

    /**
     * Corta o histórico antigo sem quebrar pares tool_use/tool_result — só descarta a partir
     * de um turno de usuário "limpo" (conteúdo em texto puro, não resultado de ferramenta).
     */
    private fun trimHistory() {
        if (history.size <= MAX_HISTORY) return
        for (i in 1 until history.size) {
            val m = history[i]
            val isPlainUserTurn = m["role"]?.jsonPrimitive?.contentOrNull == "user" &&
                m["content"] is JsonPrimitive
            if (isPlainUserTurn && history.size - i <= MAX_HISTORY) {
                repeat(i) { history.removeAt(0) }
                return
            }
        }
    }

    private fun JsonObject.typeIs(t: String) =
        this["type"]?.jsonPrimitive?.contentOrNull == t

    companion object {
        private const val TAG = "ClaudeClient"
        private const val ENDPOINT = "https://api.anthropic.com/v1/messages"
        private const val MODEL = "claude-opus-5"

        /**
         * O raciocínio fica ligado (padrão no Opus 5) de propósito: com `thinking` desligado,
         * o modelo às vezes escreve a chamada de ferramenta como texto comum e a ação nunca
         * roda — falha silenciosa fatal num assistente de voz. Esforço baixo mantém a latência
         * curta sem cair nesse buraco.
         */
        private const val EFFORT = "low"

        private const val FALLBACK_BETA = "server-side-fallback-2026-07-01"
        private const val MAX_STEPS = 8
        private const val MAX_HISTORY = 24
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}

class JarvisApiException(message: String, cause: Throwable? = null) : Exception(message, cause)
