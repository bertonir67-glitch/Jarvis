# JARVIS

Assistente pessoal por voz para Android, no espírito do JARVIS dos filmes: fica em espera
ouvindo o próprio nome, entende o que você pede em português, **age no aparelho de verdade**
e responde com voz masculina britânica.

```
"Jarvis"  →  ele acorda
"abre o Spotify"                                  →  abre o app
"manda mensagem pro João dizendo que atraso 10"   →  manda no WhatsApp
"o que aconteceu na bolsa hoje?"                  →  pesquisa e responde falando
"aumenta o volume" / "liga a lanterna"            →  controla o celular
"quanto tem de bateria?"                          →  lê o estado do aparelho
```

---

## Como funciona

| Camada | O que usa | Custo |
|---|---|---|
| Palavra de ativação | **Porcupine** (Picovoice), palavra nativa `JARVIS` | **Grátis.** Roda 100% no aparelho: nenhum áudio sai do celular enquanto ele está em espera, e o gasto de bateria é de um detector dedicado — não de um reconhecedor de fala ligado o dia inteiro. |
| Entender o que você falou | `SpeechRecognizer` do Android, pt-BR | **Grátis.** Já vem no celular e nos aparelhos atuais roda no próprio dispositivo. |
| Decidir e agir | **Google Gemini** (`gemini-2.5-flash`) com *function calling* | **Grátis, sem cartão.** O modelo escolhe a ação e chama a ferramenta. Não é lista de comandos fixos: "manda um zap pro meu irmão avisando que cheguei" funciona sem ninguém ter programado essa frase. |
| Pesquisar | **Google Search** acoplado ao Gemini | **Grátis.** Ele pesquisa e devolve a resposta pronta para falar, em vez de abrir o navegador. |
| Falar | **Voz do Android** (padrão) ou **ElevenLabs** | **Grátis** nas duas opções — veja abaixo. |

### Sobre a voz

Aqui está o único lugar onde grátis custa qualidade, então vale escolher com consciência:

- **Sem chave nenhuma** (padrão): usa o TTS do próprio Android, com o tom mais grave. Grátis,
  offline, ilimitado — e claramente sintético. Não é a voz do filme.
- **Com chave do ElevenLabs**: voz britânica grave, bem mais próxima do original. O plano
  gratuito dá cerca de 10 mil caracteres por mês, o que é mais ou menos 100 respostas curtas.
  Quando a cota acaba, o app **volta sozinho** para a voz do Android — ele nunca fica mudo e
  nunca gera cobrança.

Ou seja: dá para usar as duas e nunca pagar nada. A voz boa entra enquanto tem cota, a local
cobre o resto do mês.

### Trocar para o Claude (opcional, pago)

O app aceita a Claude API como cérebro alternativo — as respostas são melhores em pedidos
ambíguos ou de várias etapas. É só escolher em `Configurações → Cérebro → Claude` e colar a
chave. **Só ligue isso se você quiser pagar por uso**; no Gemini o app funciona inteiro sem
custo. O prompt, as ferramentas e o comportamento são exatamente os mesmos nos dois.

---

## O que você precisa antes de começar

**Duas chaves, as duas gratuitas, nenhuma pede cartão de crédito.**

| # | Serviço | Onde pegar | Custo |
|---|---|---|---|
| 1 | **Google Gemini** — o cérebro | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → *Create API key* | Grátis. 250 pedidos/dia no `gemini-2.5-flash`; 1.000/dia no `gemini-2.5-flash-lite` |
| 2 | **Picovoice** — a palavra "Jarvis" | [console.picovoice.ai](https://console.picovoice.ai) → *AccessKey* | Grátis para uso pessoal |

Opcional, também grátis:

| Serviço | Para quê | Custo |
|---|---|---|
| **ElevenLabs** | Voz britânica em vez da voz do Android | Grátis até ~10 mil caracteres/mês; depois volta sozinho para a voz local |
| **Anthropic** | Cérebro alternativo, melhor em pedidos complexos | **Pago** — só use se quiser |

> **Não é preciso cadastrar cartão em lugar nenhum** para o app funcionar inteiro. Se você
> estourar a cota diária do Gemini, ele avisa por voz e volta a funcionar sozinho depois de
> alguns minutos — não vira cobrança.

---

## Instalação

### Opção A — pegar o APK pronto do GitHub Actions (recomendado, não precisa instalar nada)

1. Faça um push desta branch. A action **Gerar APK** roda sozinha.
2. Abra a aba **Actions** do repositório → a execução mais recente → baixe o artefato `jarvis-apk`.
3. Descompacte e transfira o `.apk` para o celular.
4. Instale (o Android vai pedir para permitir "instalar apps de fontes desconhecidas").
5. Abra o app. Ele já abre na tela de **Configurações**. Cole a chave do Gemini e a do
   Picovoice e salve — só isso é obrigatório.

As chaves ficam guardadas no aparelho — **não** vão para o APK nem para o repositório.

### Opção B — compilar no seu computador

Precisa do Android Studio (ou só do SDK do Android) e JDK 17.

```bash
git clone https://github.com/bertonir67-glitch/Jarvis.git
cd Jarvis
```

Crie um arquivo `local.properties` na raiz (ele já está no `.gitignore`):

```properties
sdk.dir=/caminho/para/o/Android/Sdk

GEMINI_API_KEY=...
PICOVOICE_ACCESS_KEY=...

# Opcionais
ELEVENLABS_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
./gradlew assembleRelease
# APK em app/build/outputs/apk/release/
```

---

## Primeira execução

1. **Permissões.** Ao tocar em ATIVAR, o app pede microfone, contatos, SMS e notificações.
   Microfone é obrigatório; os outros só limitam funções específicas se você recusar.
2. Toque em **ATIVAR**. O reator acende e aparece `EM ESPERA` — pronto, ele está ouvindo.
3. Diga **"Jarvis"**, espere o reator mudar para `OUVINDO`, e fale o comando.

### Dois ajustes que fazem diferença

**Tirar o app da otimização de bateria.** Sem isso o Android mata o serviço depois de algumas
horas e ele para de ouvir.
`Configurações → Apps → JARVIS → Bateria → Sem restrições`
(em Xiaomi/Samsung/Motorola o caminho muda de nome, procure por "bateria" ou "início automático").

**Envio automático de mensagens.** Por padrão o JARVIS abre a conversa com o texto já escrito
e você toca em enviar — o Android não deixa nenhum app enviar no WhatsApp por conta própria.
Para o envio ficar realmente sem toque, ligue em `Configurações → Enviar mensagens automaticamente`
e habilite o serviço de acessibilidade do JARVIS quando ele pedir. SMS já sai direto, sem isso.

> O serviço de acessibilidade só age numa janela de 10 segundos depois que o próprio JARVIS
> abriu a conversa. Ele não fica clicando em "enviar" sozinho enquanto você escreve à mão.

### Botão home = JARVIS (opcional)

Em `Configurações do Android → Apps → Assistente digital padrão`, escolha JARVIS. Aí segurar o
botão home chama ele direto, sem precisar falar o nome.

---

## Ajustando a voz

Sem chave do ElevenLabs, ele fala com a voz do Android (grátis e ilimitada). Com a chave, a
voz padrão é a **Daniel** (britânica, grave, tom de locutor). Para trocar:

1. Entre em [elevenlabs.io/voice-library](https://elevenlabs.io/app/voice-lab), escolha ou clone
   uma voz.
2. Copie o **Voice ID**.
3. Cole em `Configurações → ID da voz`.

Para chegar mais perto do original, clonar uma voz a partir de áudios do filme dá o resultado
mais fiel — mas cuidado, o ElevenLabs não permite clonar a voz de uma pessoa real sem
autorização dela, e a voz do JARVIS é a do ator Paul Bettany. Uma voz britânica grave da
biblioteca é a opção segura.

**Latência:** `eleven_multilingual_v2` (padrão) soa melhor; `eleven_turbo_v2_5` responde bem
mais rápido. Troque em `Configurações → Modelo de voz`.

---

## O que ele sabe fazer

| Ferramenta | Exemplos |
|---|---|
| `open_app` | "abre o Spotify", "chama o zap", "abre o insta" |
| `send_message` | "manda mensagem pro João dizendo que atraso 10 minutos", "manda um SMS pra minha mãe avisando que cheguei" |
| `web_search` | "o que aconteceu na bolsa hoje?", "vai chover amanhã?", "quem ganhou o jogo?" |
| `open_url` | "abre o site do banco" |
| `device_action` | "aumenta o volume", "põe o volume em 30%", "liga a lanterna", "abre o wi-fi" |
| `device_status` | "quanto tem de bateria?", "quanto de espaço sobrou?" |

Se ele fizer uma pergunta de volta, continua ouvindo sem você precisar dizer "Jarvis" de novo.

---

## Estrutura do código

```
app/src/main/java/com/jarvis/assistant/
├── MainActivity.kt              tela principal e permissões
├── core/
│   ├── JarvisService.kt         serviço em primeiro plano; ciclo ouvir→pensar→agir→falar
│   ├── WakeWordDetector.kt      Porcupine ("Jarvis")
│   ├── SpeechInput.kt           reconhecimento de fala pt-BR
│   ├── VoiceEngine.kt           ElevenLabs + fallback do Android
│   └── JarvisState.kt           estado compartilhado com a interface
├── brain/
│   ├── ClaudeClient.kt          laço de tool use da Claude API
│   ├── Tools.kt                 definição das ferramentas
│   └── SystemPrompt.kt          a personalidade
├── skills/                      o que ele consegue fazer no aparelho
├── accessibility/               clique automático em "enviar"
└── ui/                          HUD (reator arc em Compose)
```

---

## Limites que vale conhecer antes de se frustrar

- **Só WhatsApp/Telegram/SMS.** Instagram, Messenger e afins não têm como receber mensagem
  de outro app no Android.
- **O reconhecimento de fala precisa da tela ligada** em muitos aparelhos. A palavra de
  ativação funciona com a tela apagada; o comando depois dela nem sempre.
- **Falsos positivos acontecem.** Palavras parecidas com "Jarvis" acordam ele. Baixe a
  sensibilidade nas configurações se incomodar.
- **Fabricantes agressivos com bateria** (Xiaomi, Oppo, Vivo) matam serviços em segundo plano
  mesmo com a otimização desligada. Procure "início automático" nas configurações do fabricante.
- **Nada de controlar apps por dentro.** Abrir o Spotify sim; mandar o Spotify tocar uma
  música específica não — isso exigiria a API de cada app.
