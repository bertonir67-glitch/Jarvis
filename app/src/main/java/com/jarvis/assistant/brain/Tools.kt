package com.jarvis.assistant.brain

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Definições das ferramentas mandadas para a API.
 *
 * `web_search` roda no servidor da Anthropic — o modelo pesquisa e já devolve a resposta
 * pronta, sem round-trip para o aparelho. As demais são executadas aqui pelo [com.jarvis.assistant.skills.ToolExecutor].
 */
object Tools {

    const val OPEN_APP = "open_app"
    const val SEND_MESSAGE = "send_message"
    const val OPEN_URL = "open_url"
    const val DEVICE_ACTION = "device_action"
    const val DEVICE_STATUS = "device_status"

    val definitions: JsonArray = buildJsonArray {

        // Ferramenta server-side da Anthropic: busca na web com filtragem dinâmica.
        addJsonObject {
            put("type", "web_search_20260209")
            put("name", "web_search")
            put("max_uses", 4)
        }

        addJsonObject {
            put("name", OPEN_APP)
            put(
                "description",
                "Abre um aplicativo instalado no celular. Aceita o nome como a pessoa fala " +
                    "(\"zap\", \"whats\", \"spotify\", \"insta\"); a correspondência é aproximada. " +
                    "Use para qualquer pedido de abrir/iniciar/chamar um app."
            )
            putJsonObject("input_schema") {
                put("type", "object")
                putJsonObject("properties") {
                    putJsonObject("app_name") {
                        put("type", "string")
                        put("description", "Nome do app como o usuário falou.")
                    }
                }
                putJsonArray("required") { add("app_name") }
            }
        }

        addJsonObject {
            put("name", SEND_MESSAGE)
            put(
                "description",
                "Envia uma mensagem de texto para um contato. Resolve o contato pela agenda do " +
                    "celular. Se o usuário não disser por onde mandar, use whatsapp. Escreva a " +
                    "mensagem em primeira pessoa, como se fosse o próprio usuário escrevendo — " +
                    "não use aspas nem diga que foi o assistente que mandou."
            )
            putJsonObject("input_schema") {
                put("type", "object")
                putJsonObject("properties") {
                    putJsonObject("app") {
                        put("type", "string")
                        putJsonArray("enum") { add("whatsapp"); add("sms"); add("telegram") }
                        put("description", "Por onde mandar. Padrão: whatsapp.")
                    }
                    putJsonObject("contact") {
                        put("type", "string")
                        put("description", "Nome do contato na agenda, ou um número de telefone.")
                    }
                    putJsonObject("message") {
                        put("type", "string")
                        put("description", "Texto da mensagem, já pronto para enviar.")
                    }
                }
                putJsonArray("required") { add("contact"); add("message") }
            }
        }

        addJsonObject {
            put("name", OPEN_URL)
            put(
                "description",
                "Abre um endereço no navegador. Use só quando o usuário pedir explicitamente para " +
                    "abrir um site ou ver algo na tela. Para responder perguntas, prefira web_search."
            )
            putJsonObject("input_schema") {
                put("type", "object")
                putJsonObject("properties") {
                    putJsonObject("url") {
                        put("type", "string")
                        put("description", "URL completa, com https://")
                    }
                }
                putJsonArray("required") { add("url") }
            }
        }

        addJsonObject {
            put("name", DEVICE_ACTION)
            put(
                "description",
                "Controla o aparelho: volume, lanterna, modo silencioso, e abre telas de " +
                    "configuração do Android."
            )
            putJsonObject("input_schema") {
                put("type", "object")
                putJsonObject("properties") {
                    putJsonObject("action") {
                        put("type", "string")
                        putJsonArray("enum") {
                            add("volume_up"); add("volume_down"); add("volume_set")
                            add("mute"); add("unmute")
                            add("flashlight_on"); add("flashlight_off")
                            add("open_wifi_settings"); add("open_bluetooth_settings")
                            add("open_settings")
                        }
                    }
                    putJsonObject("value") {
                        put("type", "integer")
                        put("description", "Só para volume_set: percentual de 0 a 100.")
                    }
                }
                putJsonArray("required") { add("action") }
            }
        }

        addJsonObject {
            put("name", DEVICE_STATUS)
            put(
                "description",
                "Lê o estado do aparelho: bateria, se está carregando, volume atual, rede, " +
                    "espaço livre e hora. Use quando o usuário perguntar sobre o próprio celular."
            )
            putJsonObject("input_schema") {
                put("type", "object")
                putJsonObject("properties") {}
            }
        }
    }
}
