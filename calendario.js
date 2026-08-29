// Ponte com o calendário do dono, nos dois sentidos:
//   saída  — feed .ics assinado que Google, Apple e Outlook assinam e atualizam sozinhos
//   entrada — o calendário pessoal dele vira bloqueio na agenda de atendimento
import * as bd from './db.js';
import * as ag from './agenda.js';

const TZ = () => process.env.TZ_NEGOCIO || 'America/Sao_Paulo';
const TIMEOUT = 15000;

/* ============================================================== SAÍDA */

const escapar = (t) => String(t ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** Quebra linhas em 74 octetos, como manda o RFC 5545. */
function dobrar(linha) {
  const bytes = Buffer.from(linha, 'utf8');
  if (bytes.length <= 74) return linha;
  const partes = [];
  let atual = Buffer.alloc(0);
  const chars = [...linha];
  for (let i = 0; i < chars.length; i++) {
    const b = Buffer.from(chars[i], 'utf8');
    const limite = partes.length === 0 ? 74 : 73;
    // Nunca quebrar entre a barra invertida e o caractere que ela escapa
    const preso = chars[i] === '\\' && i + 1 < chars.length;
    const extra = preso ? Buffer.byteLength(chars[i + 1], 'utf8') : 0;
    if (atual.length + b.length + extra > limite && atual.length) {
      partes.push(atual.toString('utf8'));
      atual = Buffer.alloc(0);
    }
    atual = Buffer.concat([atual, b]);
  }
  if (atual.length) partes.push(atual.toString('utf8'));
  return partes.join('\r\n ');
}

/** Instante local do negócio no formato UTC do iCalendar. */
function carimbo(data, hora) {
  return new Date(ag.epochLocal(data, hora) * 1000)
    .toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const agoraUtc = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function evento(a, negocio) {
  const titulo = [a.servico_nome, a.cliente_nome].filter(Boolean).join(' — ');
  const detalhes = [
    `Cliente: ${a.cliente_nome}`,
    a.cliente_telefone ? `WhatsApp: ${a.cliente_telefone}` : null,
    a.profissional_nome ? `Profissional: ${a.profissional_nome}` : null,
    `Valor: R$ ${Number(a.preco).toFixed(2)}`,
    `Código: ${a.codigo}`,
    a.observacao ? `Observação: ${a.observacao}` : null
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:${a.id}@jarvis`,
    `DTSTAMP:${agoraUtc()}`,
    `DTSTART:${carimbo(a.data, a.hora_inicio)}`,
    `DTEND:${carimbo(a.data, a.hora_fim)}`,
    `SUMMARY:${escapar(titulo)}`,
    `DESCRIPTION:${escapar(detalhes)}`,
    negocio.endereco ? `LOCATION:${escapar(negocio.endereco)}` : null,
    `STATUS:${a.status === 'cancelado' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${a.atualizado_em || 0}`,
    'END:VEVENT'
  ].filter(Boolean);
}

/** Monta o arquivo .ics de uma lista de agendamentos. */
export function gerarIcs(agendamentos, negocio = bd.lerNegocio(), nomeFeed = null) {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jarvis//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nomeFeed || negocio.nome)}`,
    `X-WR-TIMEZONE:${TZ()}`,
    'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    ...agendamentos.flatMap(a => evento(a, negocio)),
    'END:VCALENDAR'
  ];
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

/** Link "adicionar ao Google Agenda" para o cliente. */
export function linkGoogle(a, negocio = bd.lerNegocio()) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${a.servico_nome} — ${negocio.nome}`,
    dates: `${carimbo(a.data, a.hora_inicio)}/${carimbo(a.data, a.hora_fim)}`,
    details: [`Código: ${a.codigo}`, a.profissional_nome ? `Com ${a.profissional_nome}` : null,
              negocio.whatsapp ? `Contato: ${negocio.whatsapp}` : null].filter(Boolean).join('\n'),
    location: negocio.endereco || ''
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/* ============================================================ ENTRADA */

/** Junta as linhas continuadas do iCalendar (dobra RFC 5545). */
function desdobrar(texto) {
  const linhas = [];
  for (const bruta of String(texto).split(/\r\n|\n|\r/)) {
    if (/^[ \t]/.test(bruta) && linhas.length) linhas[linhas.length - 1] += bruta.slice(1);
    else linhas.push(bruta);
  }
  return linhas;
}

const desescapar = (t) => String(t ?? '')
  .replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');

/** Converte um valor DTSTART/DTEND para { epochMs, diaInteiro }. */
function lerInstante(params, valor) {
  const bruto = valor.trim();
  const diaInteiro = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(bruto);

  if (diaInteiro) {
    const [, a, m, d] = bruto.match(/^(\d{4})(\d{2})(\d{2})/) || [];
    if (!a) return null;
    return { epochMs: ag.epochLocal(`${a}-${m}-${d}`, '00:00') * 1000, diaInteiro: true };
  }

  const m = bruto.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, ano, mes, dia, hh, mm, , zulu] = m;

  if (zulu) return { epochMs: Date.UTC(+ano, +mes - 1, +dia, +hh, +mm), diaInteiro: false };

  const tzid = (params.match(/TZID=([^;:]+)/i) || [])[1];
  return {
    epochMs: epochEmZona(`${ano}-${mes}-${dia}`, `${hh}:${mm}`, tzid) * 1000,
    diaInteiro: false
  };
}

/** Como epochLocal, mas para um fuso arbitrário vindo do arquivo. */
function epochEmZona(data, hora, zona) {
  if (!zona || zona === TZ()) return ag.epochLocal(data, hora);
  try {
    const [a, m, d] = data.split('-').map(Number);
    const [h, min] = hora.split(':').map(Number);
    const comoUtc = Date.UTC(a, m - 1, d, h, min);
    const ref = new Date(comoUtc);
    const local = new Date(ref.toLocaleString('en-US', { timeZone: zona }));
    return Math.floor((comoUtc + (ref.getTime() - local.getTime())) / 1000);
  } catch {
    return ag.epochLocal(data, hora); // fuso desconhecido: assume o do negócio
  }
}

const DIA_MS = 86400000;
const CODIGO_DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Expande um RRULE simples dentro da janela pedida. */
function repeticoes(inicioMs, rrule, janelaFim) {
  const r = Object.fromEntries(
    rrule.split(';').map(p => p.split('=')).filter(p => p.length === 2)
         .map(([k, v]) => [k.toUpperCase(), v]));

  const freq = r.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) return [inicioMs];

  const intervalo = Math.max(1, Number(r.INTERVAL) || 1);
  const limite = Math.min(Number(r.COUNT) || 400, 400);
  const ate = r.UNTIL ? (lerInstante('', r.UNTIL)?.epochMs ?? janelaFim) : janelaFim;
  const fim = Math.min(ate, janelaFim);

  const dias = r.BYDAY
    ? r.BYDAY.split(',').map(d => CODIGO_DOW[d.replace(/^[+-]?\d/, '').toUpperCase()]).filter(d => d !== undefined)
    : null;

  const saida = [];
  const base = new Date(inicioMs);

  if (freq === 'WEEKLY' && dias?.length) {
    // Semana a semana, marcando cada dia listado no BYDAY
    const domingoDaSemana = inicioMs - base.getUTCDay() * DIA_MS;
    for (let semana = 0; saida.length < limite; semana += intervalo) {
      const inicioSemana = domingoDaSemana + semana * 7 * DIA_MS;
      if (inicioSemana > fim) break;
      for (const d of dias.sort((x, y) => x - y)) {
        const t = inicioSemana + d * DIA_MS;
        if (t >= inicioMs && t <= fim) saida.push(t);
      }
      if (semana > 520) break;
    }
    return saida.length ? saida : [inicioMs];
  }

  for (let i = 0; saida.length < limite; i++) {
    let t;
    if (freq === 'DAILY') t = inicioMs + i * intervalo * DIA_MS;
    else if (freq === 'WEEKLY') t = inicioMs + i * intervalo * 7 * DIA_MS;
    else {
      const d = new Date(inicioMs);
      d.setUTCMonth(d.getUTCMonth() + i * intervalo);
      t = d.getTime();
    }
    if (t > fim) break;
    saida.push(t);
    if (i > 800) break;
  }
  return saida;
}

/**
 * Lê um arquivo .ics e devolve os compromissos que ocupam a agenda,
 * já convertidos para a data e a hora do negócio.
 */
export function lerIcs(texto, { de, ate } = {}) {
  const inicioJanela = ag.epochLocal(de || ag.hojeLocal(), '00:00') * 1000;
  const fimJanela = ag.epochLocal(ate || ag.somarDias(ag.hojeLocal(), 90), '23:59') * 1000;

  const linhas = desdobrar(texto);
  const eventos = [];
  let atual = null;

  for (const linha of linhas) {
    if (/^BEGIN:VEVENT/i.test(linha)) { atual = {}; continue; }
    if (/^END:VEVENT/i.test(linha)) {
      if (atual) eventos.push(...materializar(atual, inicioJanela, fimJanela));
      atual = null;
      continue;
    }
    if (!atual) continue;

    const sep = linha.indexOf(':');
    if (sep < 0) continue;
    const cabeca = linha.slice(0, sep);
    const valor = linha.slice(sep + 1);
    const nome = cabeca.split(';')[0].toUpperCase();
    const params = cabeca.slice(nome.length);

    if (nome === 'DTSTART') atual.inicio = lerInstante(params, valor);
    else if (nome === 'DTEND') atual.fim = lerInstante(params, valor);
    else if (nome === 'DURATION') atual.duracao = duracaoEmMs(valor);
    else if (nome === 'SUMMARY') atual.titulo = desescapar(valor);
    else if (nome === 'UID') atual.uid = valor.trim();
    else if (nome === 'RRULE') atual.rrule = valor.trim();
    else if (nome === 'STATUS') atual.status = valor.trim().toUpperCase();
    else if (nome === 'TRANSP') atual.transp = valor.trim().toUpperCase();
    else if (nome === 'EXDATE') (atual.exdate ||= []).push(lerInstante(params, valor.split(',')[0])?.epochMs);
  }
  return eventos;
}

function duracaoEmMs(valor) {
  const m = String(valor).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const [, d, h, mi, s] = m.map(v => Number(v) || 0);
  return ((d * 24 + h) * 3600 + mi * 60 + s) * 1000;
}

/** Transforma um VEVENT (com ou sem repetição) em linhas prontas para o banco. */
function materializar(ev, inicioJanela, fimJanela) {
  if (!ev.inicio) return [];
  if (ev.status === 'CANCELLED') return [];
  if (ev.transp === 'TRANSPARENT') return [];   // marcado como "livre": não bloqueia

  const duracao = ev.fim
    ? Math.max(0, ev.fim.epochMs - ev.inicio.epochMs)
    : (ev.duracao ?? (ev.inicio.diaInteiro ? DIA_MS : 3600000));

  const ocorrencias = ev.rrule
    ? repeticoes(ev.inicio.epochMs, ev.rrule, fimJanela)
    : [ev.inicio.epochMs];

  const excluidas = new Set(ev.exdate || []);
  const saida = [];

  for (const inicio of ocorrencias) {
    if (excluidas.has(inicio)) continue;
    const fim = inicio + duracao;
    if (fim <= inicioJanela || inicio > fimJanela) continue;

    const a = ag.localDe(inicio);
    const b = ag.localDe(fim);

    if (ev.inicio.diaInteiro) {
      // Um evento de dia inteiro pode cobrir vários dias
      let dia = a.data;
      const ultimo = duracao > DIA_MS ? ag.somarDias(b.data, -1) : a.data;
      for (let i = 0; i < 60; i++) {
        saida.push({ uid: ev.uid, titulo: ev.titulo, data: dia, dia_inteiro: 1,
                     hora_inicio: null, hora_fim: null });
        if (dia >= ultimo) break;
        dia = ag.somarDias(dia, 1);
      }
      continue;
    }

    if (b.data !== a.data) {
      // Atravessa a meia-noite: bloqueia até o fim do primeiro dia e o começo do seguinte
      saida.push({ uid: ev.uid, titulo: ev.titulo, data: a.data, dia_inteiro: 0,
                   hora_inicio: a.hora, hora_fim: '23:59' });
      saida.push({ uid: ev.uid, titulo: ev.titulo, data: b.data, dia_inteiro: 0,
                   hora_inicio: '00:00', hora_fim: b.hora });
      continue;
    }
    saida.push({ uid: ev.uid, titulo: ev.titulo, data: a.data, dia_inteiro: 0,
                 hora_inicio: a.hora, hora_fim: b.hora });
  }
  return saida;
}

/* ========================================================= SINCRONIZAÇÃO */

/** webcal:// e o formato do Google viram https normal. */
export function normalizarUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  return u.replace(/^webcal:\/\//i, 'https://');
}

async function baixar(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Jarvis/1.0 (agenda)', 'Accept': 'text/calendar, text/plain' },
      redirect: 'follow'
    });
    if (!r.ok) throw new Error(`o calendário respondeu ${r.status}`);
    const texto = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(texto)) throw new Error('a resposta não é um arquivo de calendário');
    return texto;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Puxa um calendário e grava os compromissos como ocupação.
 * @param {string|null} profissionalId  null = agenda do negócio inteiro
 */
export async function sincronizarUm(profissionalId, url) {
  const alvo = normalizarUrl(url);
  if (!alvo) {
    bd.trocarAgendaExterna(profissionalId, []);
    return { ok: true, eventos: 0, limpo: true };
  }
  const cfg = bd.lerNegocio();
  try {
    const texto = await baixar(alvo);
    const eventos = lerIcs(texto, {
      de: ag.hojeLocal(),
      ate: ag.somarDias(ag.hojeLocal(), cfg.antecedencia_max_d || 60)
    });
    bd.trocarAgendaExterna(profissionalId, eventos);
    bd.registrarSincronizacao(profissionalId, alvo, eventos.length, null);
    return { ok: true, eventos: eventos.length };
  } catch (e) {
    bd.registrarSincronizacao(profissionalId, alvo, 0, e.message);
    return { ok: false, erro: e.message };
  }
}

/** Sincroniza o calendário do negócio e o de cada profissional. */
export async function sincronizarTudo() {
  const cfg = bd.lerNegocio();
  const resultados = [];

  if (cfg.calendario_url) {
    resultados.push({ quem: 'negocio', ...(await sincronizarUm(null, cfg.calendario_url)) });
  }
  for (const p of bd.listarProfissionais(true)) {
    if (!p.calendario_url) continue;
    resultados.push({ quem: p.nome, ...(await sincronizarUm(p.id, p.calendario_url)) });
  }
  return resultados;
}

export function statusCalendario() {
  const cfg = bd.lerNegocio();
  const resumo = bd.resumoAgendaExterna();
  const porQuem = Object.fromEntries(resumo.map(r => [r.profissional_id || 'negocio', r]));
  return {
    negocio_url: cfg.calendario_url || '',
    sincronizado_em: cfg.calendario_sync_em || null,
    feed_token: cfg.feed_token,
    importados: porQuem,
    profissionais: bd.listarProfissionais(true)
      .map(p => ({ id: p.id, nome: p.nome, calendario_url: p.calendario_url || '' })),
    historico: bd.ultimasSincronizacoes(8)
  };
}
