// Motor de disponibilidade: calcula horarios livres, valida e grava agendamentos.
import * as bd from './db.js';

const TZ = process.env.TZ_NEGOCIO || 'America/Sao_Paulo';

/* ------------------------------------------------------------- TEMPO */

/** Data de hoje (AAAA-MM-DD) no fuso do negocio. */
export function hojeLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/** Hora atual (HH:MM) no fuso do negocio. */
export function horaLocal() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

/** Converte data+hora do negócio para epoch em segundos (respeita o fuso). */
export function epochLocal(data, hora = '00:00') {
  const [a, m, d] = data.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const comoUtc = Date.UTC(a, m - 1, d, h, min);
  const ref = new Date(comoUtc);
  const local = new Date(ref.toLocaleString('en-US', { timeZone: TZ }));
  return Math.floor((comoUtc + (ref.getTime() - local.getTime())) / 1000);
}

/** Converte um instante (ms) para a data e hora locais do negócio. */
export function localDe(epochMs) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(epochMs)).map(p => [p.type, p.value]));
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour === '24' ? '00' : partes.hour}:${partes.minute}`
  };
}

export function minutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function hhmm(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Dia da semana 0=domingo ... 6=sabado, a partir de AAAA-MM-DD. */
export function diaSemana(data) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function somarDias(data, dias) {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export function diferencaDias(de, ate) {
  const ms = Date.UTC(...ate.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)))
           - Date.UTC(...de.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  return Math.round(ms / 86400000);
}

export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "2026-03-14" -> "sexta-feira, 14 de março" */
export function dataPorExtenso(data, comAno = false) {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [a, m, d] = data.split('-').map(Number);
  const base = `${DIAS[diaSemana(data)]}, ${d} de ${meses[m - 1]}`;
  return comAno ? `${base} de ${a}` : base;
}

/** Rotulo curto e humano: hoje / amanha / seg, 14/03 */
export function dataCurta(data, hoje = hojeLocal()) {
  if (data === hoje) return 'hoje';
  if (data === somarDias(hoje, 1)) return 'amanhã';
  const [, m, d] = data.split('-');
  return `${DIAS_CURTO[diaSemana(data)]}, ${d}/${m}`;
}

/* ----------------------------------------------------- EXPEDIENTE DO DIA */

/**
 * Faixas de trabalho de um profissional (ou do negocio) num dia,
 * ja descontando ferias/feriados/pausas.
 * @returns {{inicio:number, fim:number}[]} em minutos
 */
export function expediente(data, profissionalId = null) {
  const dow = diaSemana(data);
  const todos = bd.listarTodosHorarios();

  let faixas = profissionalId
    ? todos.filter(h => h.profissional_id === profissionalId && h.dia_semana === dow && h.ativo)
    : [];

  // Profissional sem grade propria herda o expediente do negocio
  if (!faixas.length) {
    faixas = todos.filter(h => h.profissional_id === null && h.dia_semana === dow && h.ativo);
  }

  let janelas = faixas.map(f => ({ inicio: minutos(f.abre), fim: minutos(f.fecha) }))
                      .filter(j => j.fim > j.inicio)
                      .sort((a, b) => a.inicio - b.inicio);

  for (const b of bd.bloqueiosNaData(data)) {
    if (b.profissional_id && b.profissional_id !== profissionalId) continue;
    const bi = b.hora_inicio ? minutos(b.hora_inicio) : 0;
    const bf = b.hora_fim ? minutos(b.hora_fim) : 24 * 60;
    janelas = subtrair(janelas, bi, bf);
  }

  // Compromissos do calendário pessoal importado ocupam a agenda igual a um bloqueio
  for (const e of bd.eventosExternosNaData(data)) {
    if (e.profissional_id && e.profissional_id !== profissionalId) continue;
    const ei = e.dia_inteiro || !e.hora_inicio ? 0 : minutos(e.hora_inicio);
    const ef = e.dia_inteiro || !e.hora_fim ? 24 * 60 : minutos(e.hora_fim);
    janelas = subtrair(janelas, ei, ef);
  }
  return janelas;
}

/** Remove o intervalo [ini,fim) de uma lista de janelas. */
function subtrair(janelas, ini, fim) {
  const saida = [];
  for (const j of janelas) {
    if (fim <= j.inicio || ini >= j.fim) { saida.push(j); continue; }
    if (ini > j.inicio) saida.push({ inicio: j.inicio, fim: Math.min(ini, j.fim) });
    if (fim < j.fim) saida.push({ inicio: Math.max(fim, j.inicio), fim: j.fim });
  }
  return saida.filter(j => j.fim > j.inicio);
}

/* --------------------------------------------------------------- SLOTS */

/**
 * Horarios livres para um servico numa data.
 * @returns {{hora:string, fim:string, profissionais:{id:string,nome:string}[]}[]}
 */
export function slotsLivres(data, servicoId, profissionalId = null) {
  const cfg = bd.lerNegocio();
  const servico = bd.buscarServico(servicoId);
  if (!servico) return [];

  const duracao = servico.duracao_min;
  const passo = Math.max(5, cfg.intervalo_slots || 30);
  const hoje = hojeLocal();

  if (data < hoje) return [];
  if (diferencaDias(hoje, data) > (cfg.antecedencia_max_d || 60)) return [];

  // Antecedencia minima: nada antes de agora + X horas
  const limiteMin = data === hoje ? minutos(horaLocal()) + (cfg.antecedencia_min_h || 0) * 60 : -1;

  const equipe = bd.profissionaisDoServico(servicoId)
    .filter(p => !profissionalId || p.id === profissionalId);

  // Negocio sem equipe cadastrada: agenda unica
  const alvos = equipe.length ? equipe : [{ id: null, nome: 'Atendimento' }];

  const ocupados = bd.ocupacaoDoDia(data);
  const mapa = new Map(); // hora -> profissionais livres

  for (const p of alvos) {
    const janelas = expediente(data, p.id);
    if (!janelas.length) continue;

    const agendaP = ocupados.filter(o => p.id === null || o.profissional_id === p.id || o.profissional_id === null);

    for (const j of janelas) {
      for (let t = alinhar(j.inicio, passo); t + duracao <= j.fim; t += passo) {
        if (t <= limiteMin) continue;
        const conflito = agendaP.some(o => t < minutos(o.hora_fim) && (t + duracao) > minutos(o.hora_inicio));
        if (conflito) continue;
        const hora = hhmm(t);
        if (!mapa.has(hora)) mapa.set(hora, []);
        mapa.get(hora).push({ id: p.id, nome: p.nome });
      }
    }
  }

  return [...mapa.entries()]
    .sort((a, b) => minutos(a[0]) - minutos(b[0]))
    .map(([hora, profs]) => ({
      hora,
      fim: hhmm(minutos(hora) + duracao),
      profissionais: profs
    }));
}

function alinhar(min, passo) {
  return Math.ceil(min / passo) * passo;
}

/** Proximos dias que tem pelo menos um horario livre. */
export function proximosDiasComVaga(servicoId, profissionalId = null, quantos = 5, apartirDe = null) {
  const cfg = bd.lerNegocio();
  const inicio = apartirDe || hojeLocal();
  const achados = [];
  for (let i = 0; i < (cfg.antecedencia_max_d || 60) && achados.length < quantos; i++) {
    const data = somarDias(inicio, i);
    const slots = slotsLivres(data, servicoId, profissionalId);
    if (slots.length) achados.push({ data, rotulo: dataCurta(data), slots });
  }
  return achados;
}

/** Panorama do mes para o calendario do cliente: dias com/sem vaga. */
export function mapaDoMes(ano, mes, servicoId, profissionalId = null) {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const hoje = hojeLocal();
  const dias = [];
  for (let d = 1; d <= ultimo; d++) {
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (data < hoje) { dias.push({ data, vagas: 0, passado: true }); continue; }
    const slots = slotsLivres(data, servicoId, profissionalId);
    dias.push({ data, vagas: slots.length, passado: false });
  }
  return dias;
}

/* ---------------------------------------------------------- AGENDAMENTO */

export class ErroAgenda extends Error {
  constructor(mensagem, codigo = 'invalido') {
    super(mensagem);
    this.codigo = codigo;
  }
}

/**
 * Cria um agendamento validando disponibilidade real no momento da gravacao.
 */
export function agendar({ nome, telefone, email, servico_id, profissional_id, data, hora, observacao, origem = 'site' }) {
  const servico = bd.buscarServico(servico_id);
  if (!servico || !servico.ativo) throw new ErroAgenda('Serviço indisponível.', 'servico');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) throw new ErroAgenda('Data inválida.', 'data');
  if (!/^\d{2}:\d{2}$/.test(hora || '')) throw new ErroAgenda('Horário inválido.', 'hora');

  const tel = bd.normalizarTelefone(telefone);
  if (tel.length < 10) throw new ErroAgenda('Informe um telefone válido com DDD.', 'telefone');
  if (!nome || nome.trim().length < 2) throw new ErroAgenda('Informe o nome do cliente.', 'nome');

  const livres = slotsLivres(data, servico_id, profissional_id || null);
  const slot = livres.find(s => s.hora === hora);
  if (!slot) throw new ErroAgenda('Esse horário acabou de ser ocupado. Escolha outro.', 'ocupado');

  const escolhido = profissional_id
    ? slot.profissionais.find(p => p.id === profissional_id)
    : slot.profissionais[0];
  if (!escolhido) throw new ErroAgenda('Profissional indisponível nesse horário.', 'profissional');

  const cliente = bd.garantirCliente(nome.trim(), tel, email);
  const ag = bd.criarAgendamento({
    cliente_id: cliente.id,
    servico_id,
    profissional_id: escolhido.id,
    data,
    hora_inicio: hora,
    hora_fim: hhmm(minutos(hora) + servico.duracao_min),
    preco: servico.preco,
    status: 'confirmado',
    origem,
    observacao: observacao || null
  });
  return ag;
}

export function cancelar(agendamentoId, porQuem = 'cliente') {
  const ag = bd.buscarAgendamento(agendamentoId);
  if (!ag) throw new ErroAgenda('Agendamento não encontrado.', 'nao_encontrado');
  if (ag.status === 'cancelado') return ag;

  if (porQuem === 'cliente') {
    const cfg = bd.lerNegocio();
    const limite = (cfg.cancelamento_min_h || 0) * 60;
    if (ag.data === hojeLocal() && minutos(ag.hora_inicio) - minutos(horaLocal()) < limite) {
      throw new ErroAgenda(
        `Cancelamentos pelo site só até ${cfg.cancelamento_min_h}h antes. Fale com a gente pelo WhatsApp.`,
        'prazo'
      );
    }
  }
  bd.cancelarOutboxDoAgendamento(agendamentoId);
  return bd.atualizarAgendamento(agendamentoId, { status: 'cancelado' });
}

export function remarcar(agendamentoId, data, hora, profissionalId = null) {
  const ag = bd.buscarAgendamento(agendamentoId);
  if (!ag) throw new ErroAgenda('Agendamento não encontrado.', 'nao_encontrado');

  const alvo = profissionalId || ag.profissional_id;
  const livres = slotsLivres(data, ag.servico_id, alvo);
  const slot = livres.find(s => s.hora === hora);
  if (!slot) throw new ErroAgenda('Horário indisponível.', 'ocupado');

  const servico = bd.buscarServico(ag.servico_id);
  bd.cancelarOutboxDoAgendamento(agendamentoId, ['lembrete']);
  return bd.atualizarAgendamento(agendamentoId, {
    data,
    hora_inicio: hora,
    hora_fim: hhmm(minutos(hora) + servico.duracao_min),
    profissional_id: slot.profissionais[0].id,
    status: 'confirmado'
  });
}

/** Marca como "faltou" agendamentos confirmados de dias que ja passaram. */
export function fecharDiasAnteriores() {
  const hoje = hojeLocal();
  const antigos = bd.listarAgendamentos({ ate: somarDias(hoje, -1), status: 'confirmado' });
  for (const a of antigos) bd.atualizarAgendamento(a.id, { status: 'concluido' });
  return antigos.length;
}
