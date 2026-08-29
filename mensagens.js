// Central de mensagens: monta e enfileira confirmacoes, lembretes e pedidos
// de avaliacao. Se houver credencial do WhatsApp Cloud API, envia sozinho;
// senao, tudo fica na Central de Mensagens do painel para envio com 1 clique.
import * as bd from './db.js';
import * as ag from './agenda.js';

const TOKEN    = () => process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = () => process.env.WHATSAPP_PHONE_ID || '';

export function whatsappAtivo() {
  return Boolean(TOKEN() && PHONE_ID());
}

const agora = () => Math.floor(Date.now() / 1000);

const epochDe = (data, hora) => ag.epochLocal(data, hora);

/* ------------------------------------------------------------- MODELOS */

export function textoConfirmacao(a) {
  const n = bd.lerNegocio();
  const primeiro = String(a.cliente_nome).split(' ')[0];
  return `Oi, ${primeiro}! Seu horário na ${n.nome} está confirmado.\n\n` +
         `${a.servico_nome}\n` +
         `${ag.dataPorExtenso(a.data)}, às ${a.hora_inicio}\n` +
         (a.profissional_nome ? `com ${a.profissional_nome}\n` : '') +
         (n.endereco ? `${n.endereco}\n` : '') +
         `\nCódigo: ${a.codigo}\n` +
         `Precisa remarcar? É só responder esta mensagem.`;
}

export function textoLembrete(a) {
  const n = bd.lerNegocio();
  const primeiro = String(a.cliente_nome).split(' ')[0];
  return `Oi, ${primeiro}! Passando pra lembrar do seu horário na ${n.nome}.\n\n` +
         `${a.servico_nome}\n` +
         `${ag.dataCurta(a.data)} às ${a.hora_inicio}\n` +
         (a.profissional_nome ? `com ${a.profissional_nome}\n` : '') +
         `\nConfirma pra gente? Se não puder vir, avisa que a gente remarca.`;
}

export function textoCancelamento(a) {
  const n = bd.lerNegocio();
  const primeiro = String(a.cliente_nome).split(' ')[0];
  return `${primeiro}, seu horário de ${ag.dataCurta(a.data)} às ${a.hora_inicio} ` +
         `(${a.servico_nome}) foi cancelado.\n\nQuando quiser voltar, é só chamar. ` +
         `A ${n.nome} te espera!`;
}

export function textoAvaliacao(a, urlBase = '') {
  const n = bd.lerNegocio();
  const primeiro = String(a.cliente_nome).split(' ')[0];
  return `${primeiro}, tudo bem? Como foi seu ${a.servico_nome} na ${n.nome}?\n\n` +
         `Sua opinião leva 10 segundos e ajuda muito a gente.\n` +
         (urlBase ? `${urlBase}/avaliar/${a.codigo}` : `Responda com uma nota de 1 a 5.`);
}

/* ------------------------------------------------------------ ENFILEIRA */

/** Confirmacao imediata + lembrete programado + pedido de avaliacao. */
export function notificarAgendamento(a) {
  const n = bd.lerNegocio();
  const base = process.env.URL_PUBLICA || '';

  bd.enfileirar({
    agendamento_id: a.id, telefone: a.cliente_telefone, nome: a.cliente_nome,
    tipo: 'confirmacao', texto: textoConfirmacao(a), agendado_para: agora()
  });

  const inicio = epochDe(a.data, a.hora_inicio);
  const quandoLembrar = inicio - (n.lembrete_h || 24) * 3600;
  if (quandoLembrar > agora()) {
    bd.enfileirar({
      agendamento_id: a.id, telefone: a.cliente_telefone, nome: a.cliente_nome,
      tipo: 'lembrete', texto: textoLembrete(a), agendado_para: quandoLembrar
    });
  }

  if (n.pedir_avaliacao) {
    const fim = epochDe(a.data, a.hora_fim);
    bd.enfileirar({
      agendamento_id: a.id, telefone: a.cliente_telefone, nome: a.cliente_nome,
      tipo: 'avaliacao', texto: textoAvaliacao(a, base), agendado_para: fim + 2 * 3600
    });
  }
  return true;
}

export function notificarCancelamento(a) {
  bd.cancelarOutboxDoAgendamento(a.id);
  bd.enfileirar({
    agendamento_id: a.id, telefone: a.cliente_telefone, nome: a.cliente_nome,
    tipo: 'cancelamento', texto: textoCancelamento(a), agendado_para: agora()
  });
}

export function notificarRemarcacao(a) {
  bd.cancelarOutboxDoAgendamento(a.id, ['lembrete', 'avaliacao']);
  bd.enfileirar({
    agendamento_id: a.id, telefone: a.cliente_telefone, nome: a.cliente_nome,
    tipo: 'confirmacao',
    texto: `Prontinho! Seu horário foi remarcado:\n\n${a.servico_nome}\n${ag.dataPorExtenso(a.data)}, às ${a.hora_inicio}\n\nCódigo: ${a.codigo}`,
    agendado_para: agora()
  });
  notificarAgendamento(a);
}

/* --------------------------------------------------------------- ENVIO */

/** Envia uma mensagem pelo WhatsApp Cloud API. */
export async function enviarWhatsApp(telefone, texto) {
  if (!whatsappAtivo()) return { ok: false, motivo: 'sem_credencial' };
  const numero = '55' + bd.normalizarTelefone(telefone);
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID()}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { preview_url: false, body: texto }
      })
    });
    if (!r.ok) return { ok: false, motivo: (await r.text()).slice(0, 300) };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

/** Processa a fila. Chamado pelo agendador interno a cada minuto. */
export async function processarFila() {
  const pendentes = bd.pendentesParaEnvio();
  if (!pendentes.length) return { processadas: 0, enviadas: 0 };

  let enviadas = 0;
  for (const m of pendentes) {
    if (!whatsappAtivo()) {
      // Sem integracao: fica aguardando o envio manual pelo painel
      bd.marcarOutbox(m.id, 'aguardando_envio');
      continue;
    }
    const r = await enviarWhatsApp(m.telefone, m.texto);
    if (r.ok) { bd.marcarOutbox(m.id, 'enviado'); enviadas++; }
    else bd.marcarOutbox(m.id, 'erro', r.motivo);
  }
  return { processadas: pendentes.length, enviadas };
}

/** Link wa.me pronto para o dono enviar manualmente com 1 clique. */
export function linkWhatsApp(telefone, texto) {
  return `https://wa.me/55${bd.normalizarTelefone(telefone)}?text=${encodeURIComponent(texto)}`;
}
