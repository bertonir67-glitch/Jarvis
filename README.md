# Jarvis — Agenda com IA para negócios locais

Sistema completo de **agendamento inteligente e atendimento automático** para
barbearias, salões, clínicas, estúdios e prestadores de serviço.

O cliente marca sozinho — pelo site ou conversando com o assistente — e o dono
só administra. Sem fila de WhatsApp, sem horário perdido, sem agenda de papel.

```
┌─────────────────────────┐        ┌─────────────────────────┐
│   PORTAL DO CLIENTE     │        │    PAINEL DO DONO       │
│   /  (aberto)           │        │    /admin  (com senha)  │
├─────────────────────────┤        ├─────────────────────────┤
│ • Agendar em 4 toques   │        │ • Painel com números    │
│ • Assistente que        │        │ • Agenda e encaixes     │
│   entende português     │◄──────►│ • Conversas do assist.  │
│ • Meus horários         │        │ • Avaliações com IA     │
│ • Cancelar / avaliar    │        │ • Clientes e histórico  │
└─────────────────────────┘        │ • Serviços, equipe,     │
                                   │   horários e ajustes    │
                                   └─────────────────────────┘
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

### 🟣 Cliente — fácil de usar, sem cadastro

1. **Agendar** — escolhe o serviço, o profissional (ou "tanto faz"), vê o
   calendário com os dias que têm vaga, pega o horário e pronto. Nome e
   WhatsApp só na hora de confirmar.
2. **Assistente** — conversa em português natural:
   *"tem horário pra corte e barba sexta de tarde?"*. O assistente entende,
   consulta a agenda de verdade e fecha o horário sozinho.
3. **Meus horários** — digita o WhatsApp e vê tudo: próximos atendimentos,
   histórico, cancelar e avaliar.

O navegador guarda quem é o cliente (cookie assinado), então na segunda visita
ele já entra identificado.

### 🔵 Dono — tudo em um lugar

| Tela | O que resolve |
|------|---------------|
| **Painel** | Quanto entrou, quantos vêm aí, nota média, quanto a IA agendou, resumo do dia |
| **Agenda** | Todos os atendimentos por período, encaixe manual, remarcar, marcar concluído/faltou |
| **Conversas** | Tudo que o assistente conversou; o dono pode assumir e responder |
| **Mensagens** | Confirmações, lembretes e pedidos de avaliação prontos para enviar |
| **Clientes** | Ficha com histórico, total gasto, faltas e anotações internas |
| **Avaliações** | Nota, comentário e resposta escrita pela IA para revisar e publicar |
| **Serviços** | Nome, preço, duração, categoria e ordem |
| **Equipe** | Quem trabalha, quais serviços cada um faz, cor na agenda |
| **Horários** | Expediente por dia (com intervalo de almoço), grade individual, férias e feriados |
| **Ajustes** | Identidade do negócio, jeito do assistente falar e regras da agenda |

---

## Como o assistente funciona

A parte que entende conversa e a parte que grava na agenda são separadas de
propósito:

```
mensagem do cliente
        │
        ├─► interpretar.js   regras locais de português (datas, horas, intenção)
        ├─► ia.js            modelo de linguagem, quando há chave configurada
        │
        ▼
  assistente.js  ── máquina de estados: serviço → profissional → dia → hora → dados
        │
        ▼
    agenda.js    ── única porta de entrada da agenda: valida e grava
```

**A IA entende; o código decide.** O modelo nunca escreve direto no banco —
ele só ajuda a interpretar o pedido e a deixar a resposta natural. Toda
disponibilidade é recalculada no momento da gravação, então nunca sai
agendamento em cima de outro, fora do expediente ou em período bloqueado.

**Funciona sem IA externa.** Sem `GROQ_API_KEY` o assistente roda no modo
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
| `URL_PUBLICA` | link de avaliação enviado ao cliente | o pedido vai sem link |
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
ia.js             camada de IA (Groq) com plano B local
assistente.js     máquina de estados da conversa
mensagens.js      confirmações, lembretes e integração WhatsApp
seed.js           negócio de demonstração
testes/           testes do núcleo — node --test "testes/*.test.js"
public/           portal do cliente, painel e login
```

## Testes

```bash
node --test "testes/*.test.js"
```

21 testes cobrem a interpretação de português, o motor de horários
(conflito, duração, bloqueio, antecedência, cancelar, remarcar) e o
fluxo completo do assistente até o horário confirmado.

---

## Adaptar para outro negócio

Nada é fixo no código. Pelo painel:

1. **Ajustes** — nome, endereço, WhatsApp, cor da marca e jeito de falar.
2. **Serviços** — apague os da demonstração e crie os seus.
3. **Equipe** — cadastre quem atende e marque os serviços de cada um.
   Sem equipe cadastrada, o sistema trabalha com agenda única.
4. **Horários** — expediente de cada dia, com quantos intervalos precisar.

Serve para barbearia, salão, clínica, estúdio de tatuagem, oficina,
petshop, consultório — qualquer negócio que trabalhe com hora marcada.
