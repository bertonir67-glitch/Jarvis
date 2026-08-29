# Onde este produto ganha

Documento de decisão, não de marketing. O que está escrito aqui em
"Construído" existe no código e tem teste.

---

## A tese

**Marcar horário virou commodity.** Booksy, Trinks, Agendor, Calendly e uma
dúzia de planilhas fazem isso. Competir em "agendamento online" é competir em
preço contra empresa com dez anos de vantagem.

O que quase ninguém faz para o negócio local brasileiro é o passo seguinte:

> **Proteger e recuperar a receita que a agenda perde todo dia.**

Um salão com 30 atendimentos por semana perde, tipicamente, 3 a 5 por falta e
cancelamento em cima da hora. A R$ 60 cada, são R$ 900 a R$ 1.500 por mês
escorrendo pelo ralo — mais do que qualquer mensalidade de software. É aí que
está o valor, e é um problema que o concorrente trata com um lembrete
automático e nada mais.

Quatro frentes atacam esse dinheiro:

| Frente | O buraco | O que fazemos |
|--------|----------|---------------|
| **Falta** | O cliente não aparece e o horário morre | Sinal por PIX de quem tem histórico de falta |
| **Cancelamento** | Vaga abre e ninguém ocupa | Lista de espera avisada automaticamente |
| **Sumiço** | O cliente para de vir e ninguém percebe | Reativação pelo ritmo de cada um |
| **Cegueira** | O dono não sabe quanto entrou | Caixa do dia com comissão da equipe |

---

## Construído

### 1. Sinal por PIX, sem gateway

`pix.js` gera o BR Code (padrão EMV do Banco Central) direto do código. O dono
põe a chave PIX dele e o dinheiro cai na conta dele.

**Por que isso é uma vantagem real:** todo concorrente que cobra sinal passa
por gateway — Stripe, Mercado Pago, Pagar.me — e come 3% a 5% mais taxa fixa.
Nós cobramos **zero** e não precisamos de licença de instituição de pagamento,
porque nunca tocamos no dinheiro. O CRC16 é validado contra o vetor canônico do
padrão nos testes.

O sinal é **seletivo por padrão**: só de quem já faltou ou está vindo pela
primeira vez. Cliente fiel não é tratado como suspeito.

### 2. Lista de espera automática

O cliente que não achou horário entra na fila dizendo até quando pode esperar e
em que períodos. Quando alguém cancela — pelo portal, pelo chat ou pelo painel —
o sistema procura na fila quem serve para aquela vaga e manda a mensagem, por
ordem de chegada, respeitando o período pedido.

**O cancelamento deixa de ser prejuízo e vira uma segunda venda.**

### 3. Reativação pelo ritmo de cada cliente

Não é "quem não vem há 60 dias". É uma janela SQL que calcula o intervalo médio
de cada pessoa e aponta quem passou de 1,5× o próprio ritmo. Quem vem a cada 15
dias entra na lista aos 23; quem vem a cada 90 só aos 135. Quem já tem horário
marcado sai da lista sozinho.

A mensagem cita o ritmo real ("você costuma vir a cada 21 dias") e vai para a
Central de Mensagens, para o dono revisar antes de enviar.

### 4. Caixa do dia e comissão

Quanto entrou, por profissional, por forma de pagamento, com a comissão de cada
um já calculada. Venda de produto entra como lançamento avulso.

**Este é o recurso que barbearia e salão mais pedem e que os concorrentes
tratam como relatório de fim de mês.** É o que o dono olha às 19h para fechar
o caixa e pagar a equipe.

### 5. O resto da base

Agendamento em 4 passos, atendimento por conversa em português (sem depender de
IA externa), personalização visual completa com prévia ao vivo, feed `.ics` nos
dois sentidos, avaliações com resposta sugerida, WhatsApp, fidelidade, risco de
falta por cliente, exportação e exclusão de dados pela LGPD, instalável no
celular.

---

## O que falta, por ordem de importância

### Bloqueia a venda

1. **Multi-negócio.** Hoje é uma instância por cliente. Funciona, e até tem
   vantagem (dados isolados, sem vizinho barulhento), mas cada venda exige um
   deploy. Ou automatiza-se o provisionamento, ou parte-se para multi-tenant
   com `negocio_id` em todas as tabelas. **É a decisão arquitetural mais cara
   de adiar** — quanto mais dados existirem, pior a migração.

2. **Cobrança da assinatura.** Não existe. Sem isso não há SaaS, só software.

3. **WhatsApp oficial.** A Cloud API está integrada, mas exige conta Meta
   Business verificada e *templates* aprovados para mensagem proativa fora da
   janela de 24h. Sem isso, confirmação e lembrete continuam saindo no clique.

4. **Backup automático.** O banco é um arquivo SQLite. Perder o servidor hoje é
   perder tudo. Precisa de cópia diária fora da máquina.

### Aumenta o valor

5. **Agendamento recorrente.** "Toda quinta às 15h." Cliente fiel de barbearia
   quer isso e nenhum concorrente pequeno faz bem.
6. **Pacotes e assinatura do cliente final.** "4 cortes por R$ 160/mês" —
   receita previsível para o dono, fidelidade real.
7. **Relatório mensal por WhatsApp.** O dono recebe o fechamento sem abrir o
   painel.
8. **Múltiplas unidades** para quem tem mais de um endereço.
9. **Página pública com SEO e link para bio** — hoje o portal não é indexável.

### Higiene técnica

10. **Log estruturado e monitoramento.** Hoje é `console.log`.
11. **Limite de requisições** no login e nas rotas públicas.
12. **Testes de carga.** `node:sqlite` é síncrono; sob concorrência real o
    limite precisa ser medido, não presumido.

---

## Riscos que valem dizer em voz alta

- **O PIX é confirmado no olho.** O dono marca "sinal recebido" à mão, porque
  não há webhook de banco. Para a maioria dos negócios isso é aceitável e
  evita taxa; para volume alto, vira gargalo e aí compensa um gateway.
- **A leitura de calendário externo é polida, não perfeita.** `RRULE` cobre
  diária, semanal com `BYDAY` e mensal — regras exóticas (5ª sexta do mês) não
  são expandidas.
- **SQLite é ótimo até certo ponto.** Para um negócio, sobra. Para multi-tenant
  com centenas de negócios num processo só, não serve.
- **A IA é opcional de propósito.** Sem `GROQ_API_KEY` tudo funciona. Isso é
  força (custo zero, sem dependência), mas significa que "IA" não pode ser o
  argumento de venda — o argumento é o dinheiro recuperado.
