// Camada de IA. Usa a API do Groq quando ha GROQ_API_KEY configurada;
// sem chave, tudo continua funcionando com os modelos de texto locais.
import * as bd from './db.js';
import { dataPorExtenso } from './agenda.js';

const CHAVE   = () => process.env.GROQ_API_KEY || '';
const MODELO  = () => process.env.GROQ_MODELO || 'llama-3.3-70b-versatile';
const URL     = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT = 12000;

export function iaAtiva() {
  return Boolean(CHAVE());
}

/** Chamada crua ao modelo. Devolve null em qualquer falha (o chamador tem plano B). */
async function chamar(mensagens, { json = false, temperatura = 0.4, maxTokens = 700 } = {}) {
  if (!CHAVE()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${CHAVE()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODELO(),
        messages: mensagens,
        temperature: temperatura,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {})
      })
    });
    if (!r.ok) {
      console.error('[ia] resposta', r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error('[ia] falhou:', e.name === 'AbortError' ? 'tempo esgotado' : e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const TOM = {
  simpatico:  'caloroso, proximo e otimista, como um bom atendente de bairro',
  formal:     'cordial, direto e profissional, tratando por senhor/senhora',
  descontraido: 'leve e bem-humorado, informal, sem exageros',
  objetivo:   'curto e pratico, sem rodeios'
};

function perfil() {
  const n = bd.lerNegocio();
  return { negocio: n, tom: TOM[n.personalidade_ia] || TOM.simpatico };
}

/* ------------------------------------------------ EXTRACAO DE ENTIDADES */

/**
 * Usa o modelo para entender a mensagem do cliente. O resultado alimenta a
 * maquina de estados do assistente; se vier null, valem as regras locais.
 */
export async function entender(texto, contexto = {}) {
  if (!CHAVE()) return null;
  const { negocio } = perfil();
  const servicos = bd.listarServicos().map(s => `- ${s.nome} (id: ${s.id}, ${s.duracao_min}min, R$ ${s.preco})`).join('\n');
  const equipe = bd.listarProfissionais().map(p => `- ${p.nome} (id: ${p.id})`).join('\n') || '- (sem equipe cadastrada)';

  const sistema = `Voce interpreta mensagens de clientes de "${negocio.nome}" e devolve APENAS JSON.

Catalogo de servicos:
${servicos}

Equipe:
${equipe}

Hoje e ${contexto.hoje} (${dataPorExtenso(contexto.hoje)}), agora sao ${contexto.hora}.

Devolva este JSON:
{
  "intencao": "agendar|cancelar|remarcar|consultar|preco|servicos|horario_fn|endereco|avaliar|humano|saudacao|duvida",
  "servico_id": "id do catalogo ou null",
  "profissional_id": "id da equipe, \\"qualquer\\" ou null",
  "data": "AAAA-MM-DD ou null",
  "hora": "HH:MM ou null",
  "periodo": "manha|tarde|noite|null",
  "nome": "nome do cliente se ele disser, senao null",
  "telefone": "so digitos, se ele disser, senao null",
  "confirmacao": true|false|null,
  "observacao": "pedido especial em uma frase, ou null"
}

Regras: nunca invente ids fora das listas. Datas sempre no futuro. Se o cliente
falar "amanha", "sexta", "dia 10", converta para AAAA-MM-DD. Sem certeza, use null.`;

  const historico = (contexto.historico || []).slice(-6)
    .map(m => `${m.autor === 'cliente' ? 'Cliente' : 'Assistente'}: ${m.texto}`).join('\n');

  const bruto = await chamar([
    { role: 'system', content: sistema },
    { role: 'user', content: `${historico ? `Conversa ate agora:\n${historico}\n\n` : ''}Mensagem nova do cliente: "${texto}"` }
  ], { json: true, temperatura: 0.1, maxTokens: 400 });

  if (!bruto) return null;
  try {
    const o = JSON.parse(bruto);
    return {
      intencao: o.intencao || null,
      servico_id: o.servico_id || null,
      profissional_id: o.profissional_id || null,
      data: /^\d{4}-\d{2}-\d{2}$/.test(o.data || '') ? o.data : null,
      hora: /^\d{2}:\d{2}$/.test(o.hora || '') ? o.hora : null,
      periodo: ['manha', 'tarde', 'noite'].includes(o.periodo) ? o.periodo : null,
      nome: o.nome || null,
      telefone: o.telefone ? String(o.telefone).replace(/\D/g, '') : null,
      confirmacao: typeof o.confirmacao === 'boolean' ? o.confirmacao : null,
      observacao: o.observacao || null
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- REESCRITA DE TOM */

/**
 * Reescreve uma resposta ja correta para soar humana, mantendo os fatos.
 * Se a IA nao responder, devolve o texto original — que ja e utilizavel.
 */
export async function humanizar(textoBase, { fatos = '', curto = true } = {}) {
  if (!CHAVE()) return textoBase;
  const { negocio, tom } = perfil();
  const saida = await chamar([
    {
      role: 'system',
      content: `Voce e o assistente virtual de "${negocio.nome}". Tom: ${tom}.
Reescreva a mensagem do sistema para soar natural no WhatsApp, em portugues do Brasil.
NUNCA altere datas, horarios, precos, nomes ou opcoes: eles vem do sistema e sao a verdade.
Nao invente informacao. Nao adicione promessas. ${curto ? 'Maximo 3 linhas.' : 'Maximo 6 linhas.'}
Nao use emojis. Responda apenas com a mensagem final.`
    },
    { role: 'user', content: `${fatos ? `Fatos do sistema:\n${fatos}\n\n` : ''}Mensagem a reescrever:\n${textoBase}` }
  ], { temperatura: 0.6, maxTokens: 300 });

  return saida && saida.length > 5 ? saida : textoBase;
}

/** Resposta livre para duvidas gerais, limitada aos dados do negocio. */
export async function responderDuvida(pergunta, historico = []) {
  const { negocio, tom } = perfil();
  const servicos = bd.listarServicos()
    .map(s => `${s.nome}: R$ ${Number(s.preco).toFixed(2)}, ${s.duracao_min} minutos${s.descricao ? ` — ${s.descricao}` : ''}`)
    .join('\n');
  const horarios = resumoHorarios();

  if (!CHAVE()) return null;

  const sistema = `Voce e o assistente de "${negocio.nome}".
Tom: ${tom}. Portugues do Brasil, no maximo 4 linhas. Nao use emojis.

O que voce sabe:
- Sobre: ${negocio.sobre || 'nao informado'}
- Endereco: ${negocio.endereco || 'nao informado'}
- Telefone/WhatsApp: ${negocio.whatsapp || negocio.telefone || 'nao informado'}
- Funcionamento:\n${horarios}
- Servicos:\n${servicos}

Se a pergunta pedir algo que NAO esta acima, diga que vai confirmar com a equipe.
Nunca invente preco, horario ou promocao. Se o cliente quiser marcar, convide a
dizer o servico e o dia preferido.`;

  const msgs = [{ role: 'system', content: sistema }];
  for (const h of historico.slice(-6)) {
    msgs.push({ role: h.autor === 'cliente' ? 'user' : 'assistant', content: h.texto });
  }
  msgs.push({ role: 'user', content: pergunta });

  return await chamar(msgs, { temperatura: 0.5, maxTokens: 300 });
}

function resumoHorarios() {
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const grade = bd.listarHorarios(null);
  if (!grade.length) return '  (nao configurado)';
  const porDia = {};
  for (const h of grade) (porDia[h.dia_semana] ||= []).push(`${h.abre}-${h.fecha}`);
  return dias.map((d, i) => `  ${d}: ${porDia[i] ? porDia[i].join(' e ') : 'fechado'}`).join('\n');
}

/* ------------------------------------------------------------ AVALIACOES */

/** Gera uma resposta publica humanizada para uma avaliacao. */
export async function respostaParaAvaliacao(avaliacao) {
  const { negocio, tom } = perfil();
  const nota = Number(avaliacao.nota);
  const primeiroNome = String(avaliacao.cliente_nome || 'cliente').split(' ')[0];

  const gerada = CHAVE() && await chamar([
    {
      role: 'system',
      content: `Voce responde avaliacoes publicas de "${negocio.nome}" (Google, Instagram).
Tom: ${tom}. Portugues do Brasil.
Regras:
- Comece agradecendo e cite o nome do cliente.
- 2 a 4 linhas. Nao use emojis.
- Nota 4-5: agradeca e convide a voltar.
- Nota 3: agradeca, reconheca o ponto levantado e diga que vai melhorar.
- Nota 1-2: peca desculpas com sinceridade, NAO justifique, e chame para
  resolver no privado pelo ${negocio.whatsapp || negocio.telefone || 'nosso contato'}.
- Nunca prometa reembolso, desconto ou brinde.
- Nunca soe automatico ou generico: cite o que a pessoa escreveu.
Responda apenas com o texto final.`
    },
    {
      role: 'user',
      content: `Cliente: ${primeiroNome}\nServico: ${avaliacao.servico_nome || 'nao informado'}\nNota: ${nota}/5\nComentario: "${avaliacao.comentario || '(sem comentario)'}"`
    }
  ], { temperatura: 0.7, maxTokens: 260 });

  return gerada || respostaAvaliacaoLocal(avaliacao, negocio);
}

/** Modelo local de resposta a avaliacao, usado quando nao ha IA configurada. */
export function respostaAvaliacaoLocal(av, negocio = bd.lerNegocio()) {
  const nome = String(av.cliente_nome || 'cliente').split(' ')[0];
  const contato = negocio.whatsapp || negocio.telefone || '';
  const servico = av.servico_nome ? ` no ${av.servico_nome}` : '';
  const nota = Number(av.nota);

  if (nota >= 4) {
    return `${nome}, muito obrigado pela avaliação! Ficamos felizes que sua experiência${servico} ` +
           `tenha sido boa. A equipe da ${negocio.nome} agradece a confiança e já está te esperando na próxima.`;
  }
  if (nota === 3) {
    return `Oi, ${nome}! Obrigado por dedicar um tempo pra avaliar. Anotamos seu comentário${servico} ` +
           `e já levamos pra equipe — queremos que a próxima visita seja bem melhor. ` +
           `Se quiser detalhar, é só chamar${contato ? ` no ${contato}` : ''}.`;
  }
  return `${nome}, sentimos muito que sua experiência${servico} não tenha sido boa. ` +
         `Isso não representa o padrão da ${negocio.nome} e queremos entender o que aconteceu. ` +
         `Pode falar com a gente${contato ? ` no ${contato}` : ''}? Vamos resolver.`;
}
