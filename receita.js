// A parte que separa "marcar horário" de "ganhar dinheiro com a agenda":
//   lista de espera  — transforma cancelamento em atendimento
//   sinal por PIX    — reduz falta sem gateway de pagamento
//   risco de falta   — decide de quem cobrar sinal
//   reativação       — traz de volta quem parou de vir
import * as bd from './db.js';
import * as ag from './agenda.js';
import * as pix from './pix.js';
import { riscoDeFalta, sinalDevido } from './risco.js';

export { riscoDeFalta, sinalDevido };

/** Código PIX copia e cola de um agendamento com sinal pendente. */
export function cobrancaDoAgendamento(agendamento, negocio = bd.lerNegocio()) {
  const valor = Number(agendamento?.sinal) || 0;
  if (!valor || !negocio.pix_chave) return null;
  try {
    return {
      valor,
      codigo: pix.gerarCodigo({
        chave: negocio.pix_chave,
        nome: negocio.pix_nome || negocio.nome,
        cidade: negocio.pix_cidade || 'BRASIL',
        valor,
        txid: agendamento.codigo
      }),
      pago: Boolean(agendamento.sinal_pago)
    };
  } catch {
    return null;
  }
}

export function textoDoSinal(agendamento, negocio = bd.lerNegocio()) {
  const c = cobrancaDoAgendamento(agendamento, negocio);
  if (!c || c.pago) return null;
  return `Para garantir o horário, falta o sinal de ${reais(c.valor)}.\n\n` +
         `Pague no PIX copia e cola abaixo:\n\n${c.codigo}\n\n` +
         `Assim que cair, seu horário fica confirmado.`;
}
import * as bdEnfileirar from './db.js';
const enfileirar = (m) => bdEnfileirar.enfileirar(m);

const agora = () => Math.floor(Date.now() / 1000);
const reais = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

/* ====================================================== LISTA DE ESPERA */

/**
 * Coloca o cliente na fila de um período que está cheio.
 * @returns {object} a entrada criada
 */
export function entrarNaEspera({ nome, telefone, servico_id, profissional_id, data_de, data_ate, periodos, observacao }) {
  const servico = bd.buscarServico(servico_id);
  if (!servico) throw new Error('Serviço indisponível.');
  const tel = bd.normalizarTelefone(telefone);
  if (tel.length < 10) throw new Error('Informe um telefone válido com DDD.');
  if (!nome || nome.trim().length < 2) throw new Error('Informe o seu nome.');

  const cliente = bd.garantirCliente(nome.trim(), tel);
  const jaEstá = bd.esperaDoCliente(cliente.id)
    .find(e => e.servico_id === servico_id && e.status === 'aguardando');
  if (jaEstá) return jaEstá;

  return bd.criarEspera({
    cliente_id: cliente.id,
    servico_id,
    profissional_id: profissional_id || null,
    data_de: data_de || ag.hojeLocal(),
    data_ate: data_ate || ag.somarDias(data_de || ag.hojeLocal(), 14),
    periodos: Array.isArray(periodos) ? periodos.join(',') : (periodos || null),
    observacao
  });
}

const DENTRO_DO_PERIODO = {
  manha: (h) => ag.minutos(h) < 12 * 60,
  tarde: (h) => ag.minutos(h) >= 12 * 60 && ag.minutos(h) < 18 * 60,
  noite: (h) => ag.minutos(h) >= 18 * 60
};

/**
 * Uma vaga abriu. Avisa quem está na fila, na ordem de chegada.
 * Chamado sempre que um agendamento é cancelado.
 * @returns {number} quantas pessoas foram avisadas
 */
export function avisarEspera({ data, hora, servico_id, profissional_id }, limite = 3) {
  const negocio = bd.lerNegocio();
  const fila = bd.esperaCompativel(data, servico_id, profissional_id);
  const base = process.env.URL_PUBLICA || '';
  let avisados = 0;

  for (const e of fila) {
    if (avisados >= limite) break;

    const periodos = (e.periodos || '').split(',').filter(Boolean);
    if (periodos.length && !periodos.some(p => DENTRO_DO_PERIODO[p]?.(hora))) continue;

    enfileirar({
      telefone: e.cliente_telefone,
      nome: e.cliente_nome,
      tipo: 'espera',
      texto:
        `Oi, ${String(e.cliente_nome).split(' ')[0]}! Abriu uma vaga na ${negocio.nome} ` +
        `que combina com o que você queria:\n\n` +
        `${e.servico_nome}\n${ag.dataPorExtenso(data)}, às ${hora}\n\n` +
        `Quer? Responde aqui${base ? ` ou marque em ${base}` : ''} — é por ordem de chegada.`
    });

    bd.atualizarEspera(e.id, {
      status: 'avisado', avisado_em: agora(), vaga_data: data, vaga_hora: hora
    });
    avisados++;
  }
  return avisados;
}

/** Vagas de hoje em diante que ainda não têm ninguém marcado. */
export function buracosDaAgenda(dias = 7) {
  const hoje = ag.hojeLocal();
  const servicos = bd.listarServicos();
  if (!servicos.length) return [];

  const curto = servicos.reduce((a, b) => (a.duracao_min <= b.duracao_min ? a : b));
  const saida = [];

  for (let i = 0; i < dias; i++) {
    const data = ag.somarDias(hoje, i);
    const livres = ag.slotsLivres(data, curto.id);
    if (!livres.length) continue;
    const ocupados = bd.ocupacaoDoDia(data).length;
    saida.push({ data, rotulo: ag.dataCurta(data), livres: livres.length, ocupados });
  }
  return saida;
}

/* ============================================================= REATIVAÇÃO */

/** Quem sumiu, com o texto pronto para o dono revisar e disparar. */
export function paraReativar() {
  const negocio = bd.lerNegocio();
  const hoje = ag.hojeLocal();

  return bd.clientesParaReativar(hoje).map(c => {
    const primeiro = String(c.nome).split(' ')[0];
    const fid = negocio.fidelidade_meta > 0 ? bd.progressoFidelidade(c.id) : null;
    const faltam = fid ? negocio.fidelidade_meta - (fid.disponivel % negocio.fidelidade_meta) : null;

    return {
      ...c,
      risco: riscoDeFalta(c),
      texto:
        `Oi, ${primeiro}! Aqui é da ${negocio.nome}. ` +
        `Faz ${c.dias_sumido} dias que a gente não te vê por aqui — ` +
        `normalmente você vem a cada ${c.media_dias} dias.\n\n` +
        (faltam && faltam <= 2
          ? `Além disso, faltam só ${faltam} atendimento${faltam > 1 ? 's' : ''} para você ganhar ${negocio.fidelidade_premio}.\n\n`
          : '') +
        `Quer que eu separe um horário pra você esta semana?`
    };
  });
}

/** Coloca as mensagens de reativação na fila de envio. */
export function dispararReativacao(clienteIds) {
  const alvos = paraReativar().filter(c => clienteIds.includes(c.id));
  for (const c of alvos) {
    enfileirar({ telefone: c.telefone, nome: c.nome, tipo: 'reativacao', texto: c.texto });
  }
  return alvos.length;
}

/* ============================================================= FIDELIDADE */

/** Situação do cartão de fidelidade de um cliente. */
export function fidelidade(clienteId, negocio = bd.lerNegocio()) {
  const meta = Number(negocio.fidelidade_meta) || 0;
  if (!meta) return null;
  const p = bd.progressoFidelidade(clienteId);
  if (!p) return null;
  return {
    meta,
    premio: negocio.fidelidade_premio || 'um mimo da casa',
    feitos: p.disponivel % meta,
    premios_disponiveis: Math.floor(p.disponivel / meta),
    faltam: meta - (p.disponivel % meta)
  };
}

/* ================================================================ RESUMO */

/** Os números que o dono precisa ver antes de qualquer gráfico. */
export function pulso() {
  const hoje = ag.hojeLocal();
  const espera = bd.listarEspera('aguardando');
  const reativar = bd.clientesParaReativar(hoje);
  const caixa = bd.fechamentoDoDia(hoje);
  const buracos = buracosDaAgenda(3);
  const semSinal = bd.listarAgendamentos({ de: hoje, status: 'pendente', limite: 200 })
    .filter(a => a.sinal > 0 && !a.sinal_pago);

  return {
    na_espera: espera.length,
    para_reativar: reativar.length,
    caixa_hoje: caixa.total,
    vagas_ociosas: buracos.reduce((s, b) => s + b.livres, 0),
    sinal_pendente: semSinal.length,
    valor_sinal_pendente: semSinal.reduce((s, a) => s + Number(a.sinal), 0)
  };
}
