package com.jarvis.assistant.brain

import android.util.Log
import com.jarvis.assistant.data.Prefs
import com.jarvis.assistant.skills.ToolExecutor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Cérebro rodando na camada gratuita do Google Gemini.
 *
 * A busca na web é feita numa segunda chamada, com o Google Search ligado e sem declarar
 * funções: combinar as duas coisas no mesmo pedido só funciona nos modelos mais novos, e
 * separar mantém o app compatível com o modelo gratuito estável.
 */
class GeminiClient(
    private val prefs: Prefs,
    private val executor: ToolExecutor
) : Brain {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val history = mutableListOf<JsonObject>()

    /** Desligado sozinho se o modelo escolhido não aceitar configuração de raciocínio. */
    private var useThinkingConfig = true

    override fun resetConversation() = history.clear()

    override suspend fun ask(userText: String, deviceSummary: String): String =
        withContext(Dispatchers.IO) {
            val key = prefs.geminiKey
            if (key.isBlank()) throw JarvisApiException("Chave do Gemini não configurada.")

            history.add(userTurn(userText))
            val system = SystemPrompt.build(prefs.addressee, deviceSummary)

            repeat(MAX_STEPS) {
                val response = generate(key, system, history, Tools.geminiDeclarations())
                val candidate = response["candidates"]?.jsonArray?.firstOrNull()?.jsonObject

                if (candidate == null) {
                    dropLastUserTurn()
                    return@withContext blockedMessage(response)
                }

                val parts = candidate["content"]?.jsonObject?.get("parts")?.jsonArray
                    ?: JsonArray(emptyList())

                // O turno do modelo volta verbatim: o Gemini precisa ver a própria chamada
                // de função para casar com a resposta dela.
                history.add(
                    buildJsonObject {
                        put("role", "model")
                        put("parts", parts)
                    }
                )

                val calls = parts.mapNotNull { it.jsonObject["functionCall"] as? JsonObject }

                if (calls.isEmpty()) {
                    val text = parts
                        .mapNotNull { it.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                        .joinToString(" ")
                        .trim()

                    trimHistory()
                    return@withContext text.ifBlank { "Pronto, ${prefs.addressee}." }
                }

                val responses = buildJsonArray {
                    for (call in calls) {
                        val name = call["name"]?.jsonPrimitive?.contentOrNull ?: continue
                        val args = call["args"] as? JsonObject ?: JsonObject(emptyMap())

                        val result = if (name == Tools.WEB_SEARCH) {
                            groundedSearch(key, args["query"]?.jsonPrimitive?.contentOrNull.orEmpty())
                        } else {
                            runCatching { executor.execute(name, args).text }
                                .getOrElse { "Falha ao executar: ${it.message}" }
                        }

                        addJsonObject {
                            putJsonObject("functionResponse") {
                                put("name", name)
                                putJsonObject("response") { put("result", result) }
                            }
                        }
                    }
                }

                history.add(
                    buildJsonObject {
                        put("role", "user")
                        put("parts", responses)
                    }
                )
            }

            trimHistory()
            "Me perdi no meio da tarefa, ${prefs.addressee}. Pode repetir?"
        }

    /**
     * Segunda chamada, só com o Google Search. Devolve texto puro para entrar como resultado
     * da função — falhas viram uma frase que o modelo consegue repassar ao usuário.
     */
    private fun groundedSearch(key: String, query: String): String {
        if (query.isBlank()) return "Consulta vazia."

        return runCatching {
            val body = buildJsonObject {
                putJsonArray("contents") {
                    addJsonObject {
                        put("role", "user")
                        putJsonArray("parts") {
                            addJsonObject { put("text", query) }
                        }
                    }
                }
                putJsonArray("tools") {
                    addJsonObject { putJsonObject("google_search") {} }
                }
            }

            val response = post(key, prefs.geminiModel, body)
            val parts = response["candidates"]?.jsonArray?.firstOrNull()
                ?.jsonObject?.get("content")?.jsonObject?.get("parts")?.jsonArray
                ?: return "A busca não retornou resultados."

            parts.mapNotNull { it.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                .joinToString(" ")
                .trim()
                .ifBlank { "A busca não retornou resultados." }
        }.getOrElse {
            Log.w(TAG, "busca falhou: ${it.message}")
            "Não consegui pesquisar agora: ${it.message}"
        }
    }

    private fun generate(
        key: String,
        system: String,
        contents: List<JsonObject>,
        declarations: JsonArray
    ): JsonObject {
        val body = { withThinking: Boolean ->
            buildJsonObject {
                putJsonObject("system_instruction") {
                    putJsonArray("parts") {
                        addJsonObject { put("text", system) }
                    }
                }
                put("contents", JsonArray(contents))
                putJsonArray("tools") {
                    addJsonObject { put("function_declarations", declarations) }
                }
                putJsonObject("generationConfig") {
                    put("temperature", 0.4)
                    put("maxOutputTokens", 1024)
                    if (withThinking) {
                        // Resposta falada: latência importa mais do que raciocínio profundo.
                        putJsonObject("thinkingConfig") { put("thinkingBudget", 0) }
                    }
                }
            }
        }

        return try {
            post(key, prefs.geminiModel, body(useThinkingConfig))
        } catch (e: JarvisApiException) {
            if (useThinkingConfig && e.message?.contains("thinking", ignoreCase = true) == true) {
                useThinkingConfig = false
                post(key, prefs.geminiModel, body(false))
            } else {
                throw e
            }
        }
    }

    private fun post(key: String, model: String, body: JsonObject): JsonObject {
        val request = Request.Builder()
            .url("$ENDPOINT/$model:generateContent")
            .addHeader("x-goog-api-key", key)
            .addHeader("content-type", "application/json")
            .post(body.toString().toRequestBody(JSON_MEDIA))
            .build()

        val (code, payload) = try {
            http.newCall(request).execute().use { it.code to (it.body?.string() ?: "") }
        } catch (e: IOException) {
            throw JarvisApiException("Sem conexão com o Google.", e)
        }

        if (code in 200..299) return json.parseToJsonElement(payload).jsonObject

        Log.w(TAG, "HTTP $code: $payload")

        val detail = runCatching {
            json.parseToJsonElement(payload).jsonObject["error"]
                ?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
        }.getOrNull()

        throw JarvisApiException(
            when (code) {
                400 -> detail ?: "Requisição inválida."
                401, 403 -> "Chave do Gemini inválida ou sem permissão."
                429 -> "Cota gratuita do Gemini esgotada por agora. Tente de novo em alguns minutos."
                503 -> "O Gemini está sobrecarregado. Tente de novo."
                else -> detail ?: "Erro $code na API do Gemini."
            }
        )
    }

    /** Sem candidatos normalmente significa filtro de segurança. */
    private fun blockedMessage(response: JsonObject): String {
        val reason = response["promptFeedback"]?.jsonObject
            ?.get("blockReason")?.jsonPrimitive?.contentOrNull
        Log.w(TAG, "resposta sem candidatos (motivo: $reason)")
        return "Isso eu não posso responder, ${prefs.addressee}."
    }

    private fun userTurn(text: String): JsonObject = buildJsonObject {
        put("role", "user")
        putJsonArray("parts") {
            addJsonObject { put("text", text) }
        }
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
     * Corta o histórico antigo sem separar uma chamada de função da sua resposta — só descarta
     * a partir de um turno de usuário que seja texto de verdade, não resultado de ferramenta.
     */
    private fun trimHistory() {
        if (history.size <= MAX_HISTORY) return
        for (i in 1 until history.size) {
            val m = history[i]
            val isPlainUserTurn = m["role"]?.jsonPrimitive?.contentOrNull == "user" &&
                m["parts"]?.jsonArray?.all { it.jsonObject.containsKey("text") } == true
            if (isPlainUserTurn && history.size - i <= MAX_HISTORY) {
                repeat(i) { history.removeAt(0) }
                return
            }
        }
    }

    private companion object {
        const val TAG = "GeminiClient"
        const val ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
        const val MAX_STEPS = 8
        const val MAX_HISTORY = 24
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
