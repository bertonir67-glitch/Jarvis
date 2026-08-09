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

| Camada | O que usa | Por quê |
|---|---|---|
| Palavra de ativação | **Porcupine** (Picovoice), palavra nativa `JARVIS` | Roda 100% no aparelho. Nenhum áudio sai do celular enquanto ele está em espera, e o gasto de bateria é de um detector dedicado — não de um reconhecedor de fala ligado o dia inteiro. |
| Entender o que você falou | `SpeechRecognizer` do Android, pt-BR | Grátis, e nos aparelhos atuais roda no próprio dispositivo. |
| Decidir e agir | **Claude API** (`claude-opus-5`) com *tool use* | O modelo escolhe a ação e chama a ferramenta. Não é uma lista de comandos fixos: "manda um zap pro meu irmão avisando que cheguei" funciona sem ninguém ter programado essa frase. |
| Pesquisar | ferramenta `web_search` da própria Anthropic | Roda no servidor. Ele pesquisa e já devolve a resposta pronta e resumida para falar, em vez de abrir o navegador. |
| Falar | **ElevenLabs** (voz *Daniel*, britânica grave) | É o que dá o timbre parecido com o do filme. Se a rede ou os créditos falharem, cai para o TTS do Android com tom grave — pior, mas ele não fica mudo. |

O raciocínio do modelo fica **ligado** de propósito, com esforço baixo. Desligar deixaria mais
rápido, mas no Opus 5 as chamadas de ferramenta às vezes viram texto solto e a ação **nunca
executa** — falha silenciosa que num assistente de voz é fatal (você acha que mandou a mensagem
e não mandou).

---

## O que você precisa antes de começar

Três contas. As duas primeiras têm plano gratuito suficiente para uso pessoal.

| Serviço | Onde pegar | Custo |
|---|---|---|
| **Picovoice** (palavra de ativação) | [console.picovoice.ai](https://console.picovoice.ai) → *AccessKey* | Grátis para uso pessoal |
| **ElevenLabs** (voz) | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key | Grátis até ~10 mil caracteres/mês |
| **Anthropic** (cérebro) | [console.anthropic.com](https://console.anthropic.com) → API Keys | Pago por uso |

> **Sobre o custo da Anthropic:** cada comando curto gasta poucos centavos. O app usa
> `effort: low` e histórico curto justamente para segurar isso. Coloque um limite de gasto
> mensal no console da Anthropic se quiser dormir tranquilo.

---

## Instalação

### Opção A — pegar o APK pronto do GitHub Actions (recomendado, não precisa instalar nada)

1. Faça um push desta branch. A action **Gerar APK** roda sozinha.
2. Abra a aba **Actions** do repositório → a execução mais recente → baixe o artefato `jarvis-apk`.
3. Descompacte e transfira o `.apk` para o celular.
4. Instale (o Android vai pedir para permitir "instalar apps de fontes desconhecidas").
5. Abra o app. Ele já abre na tela de **Configurações** pedindo as três chaves. Cole e salve.

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

ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
PICOVOICE_ACCESS_KEY=...
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

A voz padrão é a **Daniel** do ElevenLabs (britânica, grave, tom de locutor). Para trocar:

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
