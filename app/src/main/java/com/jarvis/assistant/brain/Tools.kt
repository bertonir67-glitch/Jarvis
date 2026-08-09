package com.jarvis.assistant.brain

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Descrição das ferramentas independente de fornecedor.
 *
 * O Gemini e a Anthropic pedem esquemas em formatos diferentes, então as ferramentas são
 * descritas uma vez aqui e traduzidas para cada API — trocar de cérebro não exige reescrever
 * o que o JARVIS sabe fazer.
 */
object Tools {

    const val OPEN_APP = "open_app"
    const val SEND_MESSAGE = "send_message"
    const val OPEN_URL = "open_url"
    const val DEVICE_ACTION = "device_action"
    const val DEVICE_STATUS = "device_status"
    const val WEB_SEARCH = "web_search"

    data class Param(
        val name: String,
        val type: String,
        val description: String,
        val required: Boolean = false,
        val values: List<String>? = null
    )

    data class Spec(
        val name: String,
        val description: String,
        val params: List<Param> = emptyList()
    )

    /** Ferramentas que o próprio aparelho executa. */
    val device: List<Spec> = listOf(
        Spec(
            name = OPEN_APP,
            description = "Abre um aplicativo instalado no celular. Aceita o nome como a pessoa " +
                "fala (\"zap\", \"whats\", \"spotify\", \"insta\"); a correspondência é aproximada. " +
                "Use para qualquer pedido de abrir, iniciar ou chamar um app.",
            params = listOf(
                Param("app_name", "string", "Nome do app como o usuário falou.", required = true)
            )
        ),
        Spec(
            name = SEND_MESSAGE,
            description = "Envia uma mensagem de texto para um contato, resolvendo o nome pela " +
                "agenda do celular. Se o usuário não disser por onde mandar, use whatsapp. " +
                "Escreva a mensagem em primeira pessoa, como se fosse o próprio usuário " +
                "escrevendo — sem aspas e sem dizer que foi um assistente que mandou.",
            params = listOf(
                Param(
                    "app", "string", "Por onde mandar. Padrão: whatsapp.",
                    values = listOf("whatsapp", "sms", "telegram")
                ),
                Param("contact", "string", "Nome do contato na agenda, ou um número de telefone.", required = true),
                Param("message", "string", "Texto da mensagem, já pronto para enviar.", required = true)
            )
        ),
        Spec(
            name = OPEN_URL,
            description = "Abre um endereço no navegador. Use apenas quando o usuário pedir " +
                "explicitamente para abrir um site ou ver algo na tela. Para responder " +
                "perguntas, prefira $WEB_SEARCH.",
            params = listOf(
                Param("url", "string", "URL completa, começando com https://", required = true)
            )
        ),
        Spec(
            name = DEVICE_ACTION,
            description = "Controla o aparelho: volume, lanterna, modo silencioso, e abre telas " +
                "de configuração do Android.",
            params = listOf(
                Param(
                    "action", "string", "A ação a executar.", required = true,
                    values = listOf(
                        "volume_up", "volume_down", "volume_set", "mute", "unmute",
                        "flashlight_on", "flashlight_off",
                        "open_wifi_settings", "open_bluetooth_settings", "open_settings"
                    )
                ),
                Param("value", "integer", "Só para volume_set: percentual de 0 a 100.")
            )
        ),
        Spec(
            name = DEVICE_STATUS,
            description = "Lê o estado do aparelho: bateria, se está carregando, volume atual, " +
                "rede, espaço livre e hora. Use quando o usuário perguntar sobre o próprio celular."
        )
    )

    /**
     * Busca na web. Na Anthropic isso é uma ferramenta de servidor; no Gemini é uma função
     * que o app atende fazendo uma segunda chamada com o Google Search ligado.
     */
    val webSearch = Spec(
        name = WEB_SEARCH,
        description = "Pesquisa na internet. Use sempre que a resposta depender de informação " +
            "atual — notícias, cotações, clima, resultados, horários, preços — em vez de " +
            "responder de memória.",
        params = listOf(
            Param("query", "string", "O que pesquisar, em linguagem natural.", required = true)
        )
    )

    // ------------------------------------------------------------------ Anthropic

    /** Formato da Claude API, com a busca rodando no servidor da Anthropic. */
    fun anthropicDefinitions(): JsonArray = buildJsonArray {
        addJsonObject {
            put("type", "web_search_20260209")
            put("name", "web_search")
            put("max_uses", 4)
        }
        device.forEach { spec ->
            addJsonObject {
                put("name", spec.name)
                put("description", spec.description)
                put("input_schema", jsonSchema(spec, uppercaseTypes = false))
            }
        }
    }

    // ------------------------------------------------------------------ Gemini

    /** Formato do Gemini: uma lista única de `function_declarations`. */
    fun geminiDeclarations(): JsonArray = buildJsonArray {
        (device + webSearch).forEach { spec ->
            addJsonObject {
                put("name", spec.name)
                put("description", spec.description)
                if (spec.params.isNotEmpty()) {
                    put("parameters", jsonSchema(spec, uppercaseTypes = true))
                }
            }
        }
    }

    // ------------------------------------------------------------------ comum

    /**
     * O Gemini espera os tipos do JSON Schema em maiúsculas ("STRING", "OBJECT");
     * a Anthropic espera minúsculas.
     */
    private fun jsonSchema(spec: Spec, uppercaseTypes: Boolean): JsonObject = buildJsonObject {
        fun t(v: String) = if (uppercaseTypes) v.uppercase() else v

        put("type", t("object"))
        putJsonObject("properties") {
            spec.params.forEach { p ->
                putJsonObject(p.name) {
                    put("type", t(p.type))
                    put("description", p.description)
                    p.values?.let { options ->
                        putJsonArray("enum") { options.forEach { add(it) } }
                    }
                }
            }
        }
        val required = spec.params.filter { it.required }.map { it.name }
        if (required.isNotEmpty()) {
            putJsonArray("required") { required.forEach { add(it) } }
        }
    }
}
