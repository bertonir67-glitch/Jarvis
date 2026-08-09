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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Cérebro rodando na camada gratuita do Groq.
 *
 * Existe porque o Gemini depende de uma conta Google que nem todo mundo consegue usar —
 * contas corporativas e escolares costumam ter o AI Studio bloqueado pelo administrador.
 * O cadastro do Groq é só e-mail.
 *
 * A API é compatível com a da OpenAI. A busca na web usa o `groq/compound-mini`, que já vem
 * com busca embutida e resolve o laço internamente — mesma separação usada no Gemini: o
 * modelo principal cuida das ferramentas do aparelho, e a busca é uma segunda chamada.
 */
class GroqClient(
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

    /** Preenchido quando o modelo configurado é recusado e um substituto funciona. */
    private var activeModel: String? = null

    override fun resetConversation() = history.clear()

    override suspend fun ask(userText: String, deviceSummary: String): String =
        withContext(Dispatchers.IO) {
            val key = prefs.groqKey
            if (key.isBlank()) throw JarvisApiException("Chave do Groq não configurada.")

            if (history.isEmpty()) {
                history.add(message("system", SystemPrompt.build(prefs.addressee, deviceSummary)))
            }
            history.add(message("user", userText))

            repeat(MAX_STEPS) {
                val choice = complete(key)
                val assistant = choice["message"]?.jsonObject
                    ?: return@withContext "Não recebi resposta, ${prefs.addressee}."

                // A mensagem do assistente volta verbatim: a API casa cada tool_call com o
                // resultado pelo id, e reconstruir o objeto quebraria esse par.
                history.add(assistant)

                val toolCalls = assistant["tool_calls"]?.jsonArray ?: JsonArray(emptyList())

                if (toolCalls.isEmpty()) {
                    val text = assistant["content"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
                    trimHistory()
                    return@withContext text.ifBlank { "Pronto, ${prefs.addressee}." }
                }

                for (call in toolCalls) {
                    val obj = call.jsonObject
                    val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: continue
                    val fn = obj["function"]?.jsonObject ?: continue
                    val name = fn["name"]?.jsonPrimitive?.contentOrNull ?: continue

                    // `arguments` vem como string JSON, não como objeto.
                    val args = runCatching {
                        val raw = fn["arguments"]?.jsonPrimitive?.contentOrNull.orEmpty()
                        if (raw.isBlank()) JsonObject(emptyMap())
                        else json.parseToJsonElement(raw).jsonObject
                    }.getOrElse { JsonObject(emptyMap()) }

                    val result = if (name == Tools.WEB_SEARCH) {
                        groundedSearch(key, args["query"]?.jsonPrimitive?.contentOrNull.orEmpty())
                    } else {
                        runCatching { executor.execute(name, args).text }
                            .getOrElse { "Falha ao executar: ${it.message}" }
                    }

                    history.add(
                        buildJsonObject {
                            put("role", "tool")
                            put("tool_call_id", id)
                            put("name", name)
                            put("content", result)
                        }
                    )
                }
            }

            trimHistory()
            "Me perdi no meio da tarefa, ${prefs.addressee}. Pode repetir?"
        }

    /** Busca com o modelo agêntico do Groq, que já traz busca web embutida. */
    private fun groundedSearch(key: String, query: String): String {
        if (query.isBlank()) return "Consulta vazia."

        return runCatching {
            val body = buildJsonObject {
                put("model", SEARCH_MODEL)
                putJsonArray("messages") {
                    addJsonObject {
                        put("role", "system")
                        put(
                            "content",
                            "Responda em português do Brasil, em no máximo duas frases, com os " +
                                "dados concretos que a busca trouxer. Sem links e sem listas."
                        )
                    }
                    addJsonObject {
                        put("role", "user")
                        put("content", query)
                    }
                }
                put("temperature", 0.2)
            }

            val choice = post(key, body)["choices"]?.jsonArray?.firstOrNull()?.jsonObject
                ?: return "A busca não retornou resultados."

            choice["message"]?.jsonObject?.get("content")?.jsonPrimitive?.contentOrNull
                ?.trim()
                ?.ifBlank { null }
                ?: "A busca não retornou resultados."
        }.getOrElse {
            Log.w(TAG, "busca falhou: ${it.message}")
            "Não consegui pesquisar agora: ${it.message}"
        }
    }

    /**
     * IDs de modelo do Groq saem de circulação com alguma frequência. Em vez de deixar o
     * assistente mudo quando isso acontece, tenta os substitutos conhecidos e passa a usar
     * o que responder.
     */
    private fun complete(key: String): JsonObject {
        val candidates = buildList {
            activeModel?.let { add(it) }
            add(prefs.groqModel)
            addAll(FALLBACK_MODELS)
        }.distinct()

        var lastError: JarvisApiException? = null

        for (model in candidates) {
            val body = buildJsonObject {
                put("model", model)
                put("messages", JsonArray(history))
                put("tools", Tools.groqDeclarations())
                put("tool_choice", "auto")
                put("temperature", 0.4)
                put("max_tokens", 1024)
            }

            try {
                val choice = post(key, body)["choices"]?.jsonArray?.firstOrNull()?.jsonObject
                if (choice != null) {
                    if (activeModel != model) {
                        Log.i(TAG, "usando o modelo $model")
                        activeModel = model
                    }
                    return choice
                }
            } catch (e: JarvisApiException) {
                if (!e.isModelUnavailable) throw e
                Log.w(TAG, "modelo $model indisponível, tentando o próximo")
                lastError = e
            }
        }

        throw lastError ?: JarvisApiException("Nenhum modelo do Groq respondeu.")
    }

    private fun post(key: String, body: JsonObject): JsonObject {
        val request = Request.Builder()
            .url(ENDPOINT)
            .addHeader("Authorization", "Bearer $key")
            .addHeader("content-type", "application/json")
            .post(body.toString().toRequestBody(JSON_MEDIA))
            .build()

        val (code, payload) = try {
            http.newCall(request).execute().use { it.code to (it.body?.string() ?: "") }
        } catch (e: IOException) {
            throw JarvisApiException("Sem conexão com o Groq.", e)
        }

        if (code in 200..299) return json.parseToJsonElement(payload).jsonObject

        Log.w(TAG, "HTTP $code: $payload")

        val detail = runCatching {
            json.parseToJsonElement(payload).jsonObject["error"]
                ?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
        }.getOrNull()

        val unavailable = code == 404 ||
            (detail?.contains("model", ignoreCase = true) == true &&
                (detail.contains("decommission", ignoreCase = true) ||
                    detail.contains("not found", ignoreCase = true) ||
                    detail.contains("does not exist", ignoreCase = true)))

        throw JarvisApiException(
            when {
                unavailable -> "Modelo indisponível no Groq."
                code == 401 -> "Chave do Groq inválida."
                code == 429 -> "Cota gratuita do Groq esgotada por agora. Tente em alguns minutos."
                code == 503 -> "O Groq está sobrecarregado. Tente de novo."
                else -> detail ?: "Erro $code na API do Groq."
            },
            isModelUnavailable = unavailable
        )
    }

    private fun message(role: String, content: String): JsonObject = buildJsonObject {
        put("role", role)
        put("content", content)
    }

    /**
     * Corta o histórico antigo preservando o prompt de sistema na primeira posição e sem
     * separar um tool_call do seu resultado — a API rejeita o par quebrado.
     */
    private fun trimHistory() {
        if (history.size <= MAX_HISTORY) return
        for (i in 1 until history.size) {
            val role = history[i]["role"]?.jsonPrimitive?.contentOrNull
            if (role == "user" && history.size - i <= MAX_HISTORY) {
                val system = history.firstOrNull()
                repeat(i) { history.removeAt(0) }
                if (system != null &&
                    system["role"]?.jsonPrimitive?.contentOrNull == "system"
                ) {
                    history.add(0, system)
                }
                return
            }
        }
    }

    private companion object {
        const val TAG = "GroqClient"
        const val ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

        /** Traz busca web embutida e resolve o laço agêntico do lado do servidor. */
        const val SEARCH_MODEL = "groq/compound-mini"

        val FALLBACK_MODELS = listOf(
            "llama-3.3-70b-versatile",
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "llama-3.1-8b-instant"
        )

        const val MAX_STEPS = 8
        const val MAX_HISTORY = 24
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
