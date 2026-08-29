# Jarvis — Agenda com IA para negócios locais

Sistema completo de **agendamento inteligente e atendimento automático** para
barbearias, salões, clínicas, estúdios e prestadores de serviço.

O cliente marca sozinho — pelo site ou conversando com o assistente — e o dono
só administra. Sem fila de WhatsApp, sem horário perdido, sem agenda de papel.

```
PORTAL DO CLIENTE  /                PAINEL DO DONO  /admin
aberto, sem senha                   protegido por senha

  Agendar em 4 passos                 Painel com os números
  Conversar e marcar pelo chat        Agenda e encaixes
  Meus horários                       Conversas do atendimento
  Cancelar e avaliar                  Avaliações e respostas
  Salvar no próprio calendário        Clientes e histórico
                                      Serviços, equipe, horários
                                      Aparência e calendário
```

---

## Começar em 3 comandos

```bash
node seed.js      # cria um negócio de demonstração completo
node index.js     # sobe o servidor
```

| Onde | Endereço | Acesso |
|------|----------|--------|
| Portal do cliente | http://localhost:3000/ | aberto, sem senha |
| Painel do dono | http://localhost:3000/admin | senha em `ADMIN_SENHA` (padrão `admin123`) |

> **Troque a senha antes de publicar:** defina `ADMIN_SENHA` nas variáveis de
> ambiente (ou nos *Secrets* do Replit).

**Requisito:** Node.js 22.5 ou superior. **Zero dependências** — usa só o que
vem no Node (`node:sqlite`, `node:http`, `fetch`).

---

## As duas formas de acesso

### Cliente — fácil de usar, sem cadastro

1. **Agendar** — escolhe o serviço, o profissional (ou "tanto faz"), vê o
   calendário com os dias que têm vaga, pega o horário e pronto. Nome e
   WhatsApp só na hora de confirmar.
2. **Conversar** — atendimento em português natural:
   *"tem horário pra corte e barba sexta de tarde?"*. O sistema entende,
   consulta a agenda de verdade e fecha o horário sozinho.
3. **Meus horários** — digita o WhatsApp e vê tudo: próximos atendimentos,
   histórico, cancelar e avaliar.

O navegador guarda quem é o cliente (cookie assinado), então na segunda visita
ele já entra identificado.

### Dono — tudo em um lugar

| Tela | O que resolve |
|------|---------------|
| **Painel** | Quanto entrou, quantos vêm aí, nota média, quantos foram marcados sozinhos |
| **Agenda** | Todos os atendimentos por período, encaixe manual, remarcar, marcar concluído/faltou |
| **Conversas** | Tudo que o atendimento automático conversou; o dono pode assumir e responder |
| **Mensagens** | Confirmações, lembretes e pedidos de avaliação prontos para enviar |
| **Clientes** | Ficha com histórico, total gasto, faltas e anotações internas |
| **Avaliações** | Nota, comentário e resposta sugerida para revisar e publicar |
| **Caixa** | Fechamento do dia, comissão por profissional, formas de pagamento |
| **Retenção** | Lista de espera, clientes sumidos e vagas ociosas |
| **Serviços** | Nome, preço, duração, sinal, categoria e ordem |
| **Aparência** | Logo, capa, cores, fonte, cantos e textos — com prévia ao vivo |
| **Calendário** | Assinar a agenda no Google/Apple/Outlook e importar o calendário pessoal |
| **Equipe** | Quem trabalha, quais serviços cada um faz, cor na agenda |
| **Horários** | Expediente por dia (com intervalo de almoço), grade individual, férias e feriados |
| **Ajustes** | Contato do negócio, jeito do atendimento falar e regras da agenda |

---

## Como o atendimento funciona

A parte que entende conversa e a parte que grava na agenda são separadas de
propósito:

```
mensagem do cliente
      |
      +--> interpretar.js   regras locais de português (datas, horas, intenção)
      +--> ia.js            modelo de linguagem, quando há chave configurada
      |
      v
 assistente.js   máquina de estados: serviço, profissional, dia, hora, dados
      |
      v
   agenda.js     única porta de entrada da agenda: valida e grava
```

**A IA entende; o código decide.** O modelo nunca escreve direto no banco —
ele só ajuda a interpretar o pedido e a deixar a resposta natural. Toda
disponibilidade é recalculada no momento da gravação, então nunca sai
agendamento em cima de outro, fora do expediente ou em período bloqueado.

**Funciona sem IA externa.** Sem `GROQ_API_KEY` o atendimento roda no modo
local: entende datas ("amanhã", "sexta que vem", "dia 15", "depois de amanhã"),
horários ("15h", "14:30", "3 da tarde", "meio-dia"), períodos ("de manhã") e
intenções (agendar, cancelar, remarcar, preço, endereço, falar com humano).
Com a chave, as mesmas respostas ficam mais soltas e naturais.

---

## Configuração

Copie `.env.exemplo` para `.env` (ou use os *Secrets* do Replit):

| Variável | Para quê | Sem ela |
|----------|----------|---------|
| `ADMIN_SENHA` | senha do painel | usa `admin123` — **troque** |
| `GROQ_API_KEY` | respostas mais naturais ([grátis no console.groq.com](https://console.groq.com)) | modo local por regras |
| `GROQ_MODELO` | modelo usado | `llama-3.3-70b-versatile` |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | envio automático pelo WhatsApp Cloud API | mensagens ficam na Central para envio com 1 clique |
| `URL_PUBLICA` | links de calendário e de avaliação | usa o endereço da requisição |
| `TZ_NEGOCIO` | fuso do negócio | `America/Sao_Paulo` |
| `PORT` | porta do servidor | `3000` |

---

## Mensagens automáticas

Todo agendamento gera três mensagens na fila:

1. **Confirmação** — na hora, com serviço, dia, horário, endereço e código.
2. **Lembrete** — X horas antes (configurável em Ajustes).
3. **Pedido de avaliação** — 2h depois do atendimento.

Com o WhatsApp Cloud API configurado, saem sozinhas. Sem ele, aparecem na
**Central de Mensagens** com o texto pronto e um botão que abre o WhatsApp
já preenchido — a experiência do cliente é a mesma, só o disparo é manual.

---

## Arquivos

```
index.js          servidor HTTP, rotas e as duas autenticações
db.js             banco SQLite: schema e todas as consultas
agenda.js         motor de disponibilidade — o coração do sistema
interpretar.js    português do dia a dia: datas, horas, intenções
ia.js             camada de linguagem (Groq) com plano B local
assistente.js     máquina de estados da conversa
mensagens.js      confirmações, lembretes e integração WhatsApp
tema.js           aparência: transforma os Ajustes em CSS
calendario.js     geração e leitura de .ics, sincronização
pix.js            BR Code do Banco Central para o sinal
risco.js          risco de falta e quando cobrar sinal
receita.js        lista de espera, reativação e fidelidade
seed.js           negócio de demonstração
testes/           testes do núcleo — node --test "testes/*.test.js"
public/           portal do cliente, painel, login e ícones SVG
```

## Testes

```bash
node --test "testes/*.test.js"
```

59 testes cobrem a interpretação de português, o motor de horários
(conflito, duração, bloqueio, antecedência, cancelar, remarcar), o
fluxo completo da conversa até o horário confirmado, a geração e a
leitura de arquivos `.ics` (fuso, dia inteiro, repetição, escape), o
motor de aparência com a correção automática de contraste, o BR Code do
PIX contra o vetor canônico do CRC, a lista de espera, a reativação pelo
ritmo de cada cliente e o fechamento de caixa com comissão.

---

## Adaptar para outro negócio

Nada é fixo no código. Pelo painel:

1. **Ajustes** — nome, endereço, WhatsApp e as regras da agenda.
2. **Aparência** — logo, cores, fonte e os textos da página do cliente.
3. **Serviços** — apague os da demonstração e crie os seus, com seus preços.
4. **Equipe** — cadastre quem atende e marque os serviços de cada um.
   Sem equipe cadastrada, o sistema trabalha com agenda única.
5. **Horários** — expediente de cada dia, com quantos intervalos precisar.
6. **Calendário** — assine a agenda no seu celular e conecte o calendário pessoal.

Serve para barbearia, salão, clínica, estúdio de tatuagem, oficina,
petshop, consultório — qualquer negócio que trabalhe com hora marcada.

---

## Onde este produto ganha

Marcar horário virou commodity. O que este sistema faz de diferente é
**proteger e recuperar a receita que a agenda perde**:

| Frente | O que acontece |
|--------|----------------|
| **Falta** | Sinal por PIX (BR Code gerado aqui, sem gateway e sem taxa), cobrado só de quem já faltou ou vem pela primeira vez |
| **Cancelamento** | Lista de espera avisada automaticamente quando a vaga abre, respeitando período e ordem de chegada |
| **Sumiço** | Reativação pelo ritmo de cada cliente, não por uma regra fixa de dias |
| **Cegueira** | Caixa do dia com comissão da equipe e formas de pagamento |

A decisão de produto e o que ainda falta estão em [ESTRATEGIA.md](ESTRATEGIA.md).

---

## Personalização

Tudo o que dá a cara do negócio se muda pelo painel, sem tocar em código.

**Aparência** (`/admin#aparencia`) tem uma prévia ao vivo da página do cliente
ao lado dos controles — cada vez que você salva, a prévia recarrega:

| O que | Opções |
|-------|--------|
| Logotipo e capa | Envio direto pelo painel (PNG, JPG, WEBP ou SVG) |
| Cor da marca | 12 sugestões ou qualquer código hexadecimal |
| Base de cores | Areia, Neve, Linho ou Noite (tema escuro) |
| Fonte | Do sistema, Plus Jakarta Sans, Inter, DM Sans, Lora ou Poppins |
| Cantos | Retos, suaves ou arredondados |
| Textos | Título da página, rodapé e política de cancelamento |
| O que o cliente vê | Mostrar preços; deixar escolher o profissional |

**Preços e serviços** ficam em *Serviços*: nome, descrição, duração, valor,
categoria e ordem de exibição, com ativar/desativar sem perder o histórico.

Nos bastidores, `tema.js` transforma essas escolhas em variáveis CSS servidas
em `/tema.css`, e as duas interfaces leem dessas variáveis. Duas garantias
embutidas: uma cor clara demais é **escurecida automaticamente** até o texto
branco passar de 4,5:1 de contraste, e as cores de estado são derivadas do
fundo com `color-mix`, então continuam legíveis no tema escuro.

---

## Calendário

Vai nos dois sentidos, e funciona com qualquer aplicativo — não exige conta
Google nem autorização de app.

### A sua agenda, dentro do seu calendário

O painel gera um link privado `.ics` (completo e um por profissional). Você
assina uma vez e todo agendamento novo aparece lá sozinho, com cliente,
telefone, valor e código:

- **Google Agenda:** Outras agendas → De URL
- **iPhone / Mac:** Ajustes → Calendário → Adicionar calendário assinado
- **Outlook:** Adicionar calendário → Assinar da Web

O link é secreto; se vazar, o botão *Gerar um link novo* revoga o antigo.

### Os seus compromissos, dentro da agenda

Cole o **endereço secreto no formato iCal** do seu calendário pessoal (o
Google mostra em Configurações da agenda). A cada 15 minutos o sistema lê esse
feed e transforma o que estiver marcado lá em horário indisponível — o cliente
simplesmente não vê aquela vaga, e não vê o que é o compromisso. Dá para
configurar um calendário para o negócio inteiro e um para cada profissional.

O leitor entende fuso horário (`TZID`), eventos de dia inteiro, eventos que
viram a noite e repetições (`RRULE` diária, semanal com `BYDAY`, e mensal).
Ignora o que está cancelado e o que está marcado como *disponível*. Se o feed
cair, a falha fica registrada e **a agenda continua com os horários que tinha** —
nunca zera por causa de um erro de rede.

### Para o cliente

Na confirmação e em *Meus horários* aparecem os botões **Google Agenda** e
**Baixar (.ics)**, para o cliente guardar o horário no celular dele.

---

## Aparência do código

Visual minimalista: tons neutros quentes, um único acento verde-sálvia
dessaturado, linhas de 1px no lugar de sombras e nenhum emoji — os ícones
são SVG de traço fino em `public/js/icones.js`.

Para adotar a cor da marca do negócio, mude **Ajustes → Cor da marca**:
ela substitui a variável `--acento` nas duas interfaces. Todo o resto do
sistema visual está em `public/css/estilo.css`.

A fonte (Plus Jakarta Sans) é carregada sem bloquear a página: se a CDN
demorar, o navegador renderiza na hora com a pilha do sistema e troca depois.
