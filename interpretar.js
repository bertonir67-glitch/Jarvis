// Interpretador de portugues do dia a dia: intencoes, datas, horarios e servicos.
// Roda 100% local. E a base do assistente e tambem a rede de seguranca quando a IA
// externa nao esta configurada ou falha.
import { hojeLocal, somarDias, diaSemana, minutos, hhmm } from './agenda.js';

/* --------------------------------------------------------- NORMALIZACAO */

export function semAcento(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

/* -------------------------------------------------------------- DATAS */

const SEMANA = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1, 'segunda-feira': 1,
  terca: 2, ter: 2, 'terca-feira': 2,
  quarta: 3, qua: 3, 'quarta-feira': 3,
  quinta: 4, qui: 4, 'quinta-feira': 4,
  sexta: 5, sex: 5, 'sexta-feira': 5,
  sabado: 6, sab: 6
};

const MESES = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
  maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
  setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12
};

/**
 * Extrai uma data (AAAA-MM-DD) de um texto livre em portugues.
 * @returns {string|null}
 */
export function extrairData(texto, hoje = hojeLocal()) {
  const t = semAcento(texto);
  const [anoHoje] = hoje.split('-').map(Number);

  // Data ja no formato do sistema (vem dos botoes de atalho do chat)
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  if (/\bdepois de amanha\b/.test(t)) return somarDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somarDias(hoje, 1);
  if (/\bhoje\b|\bagora\b|\bhoje ainda\b/.test(t)) return hoje;

  // 15/03 ou 15/03/2026 ou 15-03
  const barra = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (barra) {
    const d = Number(barra[1]), m = Number(barra[2]);
    let a = barra[3] ? Number(barra[3]) : anoHoje;
    if (a < 100) a += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const data = fmt(a, m, d);
      return (!barra[3] && data < hoje) ? fmt(a + 1, m, d) : data;
    }
  }

  // 15 de marco / 15 de mar
  const porMes = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})\b/);
  if (porMes && MESES[porMes[2]]) {
    const d = Number(porMes[1]), m = MESES[porMes[2]];
    const data = fmt(anoHoje, m, d);
    return data < hoje ? fmt(anoHoje + 1, m, d) : data;
  }

  // dia 15
  const soDia = t.match(/\bdia\s+(\d{1,2})\b/);
  if (soDia) {
    const d = Number(soDia[1]);
    const [a, m] = hoje.split('-').map(Number);
    const data = fmt(a, m, d);
    if (data >= hoje) return data;
    return m === 12 ? fmt(a + 1, 1, d) : fmt(a, m + 1, d);
  }

  // segunda / terca que vem / proxima sexta
  for (const [nome, dow] of Object.entries(SEMANA)) {
    const re = new RegExp(`\\b${nome}(?:-feira)?\\b`);
    if (!re.test(t)) continue;
    const proxima = /\b(que vem|proxim[ao]|semana que vem)\b/.test(t);
    let d = proximoDiaDaSemana(hoje, dow);
    if (proxima && d === hoje) d = somarDias(d, 7);
    if (proxima) {
      const diff = Math.round((Date.parse(d) - Date.parse(hoje)) / 86400000);
      if (diff < 7) d = somarDias(d, 7);
    }
    return d;
  }

  if (/\bfim de semana\b/.test(t)) return proximoDiaDaSemana(hoje, 6);
  if (/\bsemana que vem\b/.test(t)) return somarDias(hoje, 7);
  return null;
}

function fmt(a, m, d) {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function proximoDiaDaSemana(hoje, dow) {
  for (let i = 0; i <= 7; i++) {
    const data = somarDias(hoje, i);
    if (diaSemana(data) === dow) return data;
  }
  return hoje;
}

/* ------------------------------------------------------------ HORARIOS */

/**
 * Extrai um horario (HH:MM) do texto.
 * Entende "14h", "14:30", "14h30", "as 9", "9 da manha", "meio-dia".
 */
export function extrairHora(texto) {
  const t = semAcento(texto);
  if (/\bmeio[\s-]?dia\b/.test(t)) return '12:00';

  let m = t.match(/\b(\d{1,2})\s*[h:]\s*(\d{2})\b/);
  if (m) return ajustar(Number(m[1]), Number(m[2]), t);

  m = t.match(/\b(\d{1,2})\s*h(?:oras?)?\b/);
  if (m) return ajustar(Number(m[1]), 0, t);

  m = t.match(/\b(?:as|às|pras|para as|ao meio das)\s+(\d{1,2})\b/);
  if (m) return ajustar(Number(m[1]), 0, t);

  m = t.match(/\b(\d{1,2})\s*(?:da|de)\s*(manha|tarde|noite)\b/);
  if (m) return ajustar(Number(m[1]), 0, t);

  return null;
}

function ajustar(h, min, t) {
  if (h < 12 && /\b(tarde|noite|da tarde|da noite)\b/.test(t)) h += 12;
  if (h === 12 && /\bda manha\b/.test(t)) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Periodo do dia mencionado: manha | tarde | noite | null */
export function extrairPeriodo(texto) {
  const t = semAcento(texto);
  if (/\bmanha\b|\bcedo\b|\bde manha\b/.test(t)) return 'manha';
  if (/\btarde\b/.test(t)) return 'tarde';
  if (/\bnoite\b|\bfim do dia\b|\bdepois do trabalho\b/.test(t)) return 'noite';
  return null;
}

export function dentroDoPeriodo(hora, periodo) {
  if (!periodo) return true;
  const m = minutos(hora);
  if (periodo === 'manha') return m < 12 * 60;
  if (periodo === 'tarde') return m >= 12 * 60 && m < 18 * 60;
  return m >= 18 * 60;
}

/* ----------------------------------------------------------- INTENCOES */

const REGRAS = [
  ['cancelar',   /\b(cancel(ar|a|o)|desmarc(ar|a|o)|nao vou poder|nao poderei|desisti)\b/],
  ['remarcar',   /\b(remarc(ar|a|o)|reagend(ar|a|o)|mud(ar|a) (o )?(horario|dia)|troc(ar|a) (o )?(horario|dia)|adiar|antecipar|passar para)\b/],
  ['consultar',  /\b(meu (agendamento|horario)|meus (agendamentos|horarios)|quando (e|eh|sera) meu|confirmar meu|ta marcado|esta marcado)\b/],
  ['preco',      /\b(preco|precos|quanto custa|quanto fica|quanto e|valor|valores|tabela|orcamento)\b/],
  ['servicos',   /\b(quais servicos|o que voces fazem|lista de servicos|servicos|catalogo|cardapio)\b/],
  ['horario_fn', /\b(que horas (abre|fecha)|horario de (funcionamento|atendimento)|voces abrem|estao abertos|funciona (hoje|amanha|no)|ate que horas)\b/],
  ['endereco',   /\b(onde (fica|voces ficam|e)|endereco|localizacao|como chego|como chegar|maps)\b/],
  ['humano',     /\b(falar com (alguem|atendente|humano|pessoa)|atendente|quero falar com|me liga)\b/],
  ['avaliar',    /\b(avaliar|deixar (uma )?avaliacao|dar nota|feedback)\b/],
  ['agendar',    /\b(agend(ar|a|e)|marc(ar|a|e)|quero (um|uma|marcar|agendar)|tem (vaga|horario|disponivel)|disponibilidade|reserv(ar|a)|encaix(e|ar)|consulta|horario para)\b/],
  ['saudacao',   /^(oi+|ola|bom dia|boa tarde|boa noite|e ai|eae|opa|hey|hi|tudo bem)\b/]
];

/** Detecta a intencao principal da mensagem. */
export function detectarIntencao(texto) {
  const t = semAcento(texto);
  for (const [nome, re] of REGRAS) if (re.test(t)) return nome;
  if (extrairData(texto) || extrairHora(texto)) return 'agendar';
  return 'duvida';
}

/* ------------------------------------------------------------ SERVICOS */

/** Casa o texto com um servico do catalogo (nome, palavras ou categoria). */
export function casarServico(texto, servicos) {
  const t = semAcento(texto);
  let melhor = null, melhorNota = 0;

  for (const s of servicos) {
    const nome = semAcento(s.nome);
    let nota = 0;
    if (t.includes(nome)) nota = nome.length * 2;
    else {
      const palavras = nome.split(/\s+/).filter(p => p.length > 3);
      for (const p of palavras) if (t.includes(p)) nota += p.length;
      if (s.categoria && t.includes(semAcento(s.categoria))) nota += 2;
    }
    if (nota > melhorNota) { melhorNota = nota; melhor = s; }
  }
  return melhorNota >= 4 ? melhor : null;
}

/** Casa o texto com um profissional da equipe. */
export function casarProfissional(texto, profissionais) {
  const t = semAcento(texto);
  for (const p of profissionais) {
    const nome = semAcento(p.nome);
    const primeiro = nome.split(/\s+/)[0];
    if (primeiro.length >= 3 && new RegExp(`\\b${primeiro}\\b`).test(t)) return p;
    if (p.apelido && t.includes(semAcento(p.apelido))) return p;
  }
  if (/\b(tanto faz|qualquer um|quem estiver|nao importa|indiferente)\b/.test(t)) return 'qualquer';
  return null;
}

/* -------------------------------------------------------------- OUTROS */

export function extrairTelefone(texto) {
  const m = String(texto || '').match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[\s-]?\d{4}/);
  if (!m) return null;
  const so = m[0].replace(/\D/g, '');
  return so.length >= 10 ? (so.startsWith('55') && so.length > 11 ? so.slice(2) : so) : null;
}

export function extrairNome(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/(?:meu nome (?:e|eh|é)|me chamo|sou (?:a|o)?|aqui (?:e|eh|é) (?:a|o)?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,40})/i);
  if (m) return limpar(m[1]);
  // Mensagem curta so com palavras: provavelmente o nome
  if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,40}$/.test(t) && t.split(/\s+/).length <= 4) {
    const t2 = semAcento(t);
    if (!/^(sim|nao|ok|certo|confirmo|pode ser|isso|beleza|obrigad[oa]|valeu|manha|tarde|noite|qualquer um|tanto faz)$/.test(t2)) {
      return limpar(t);
    }
  }
  return null;
}

function limpar(nome) {
  return nome.trim().replace(/\s+/g, ' ')
    .split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

/** Remove pontuacao e emojis do inicio para o teste de sim/nao. */
function inicioLimpo(texto) {
  return semAcento(texto).replace(/^[^a-z0-9]+/, '');
}

export function ehConfirmacao(texto) {
  const t = inicioLimpo(texto);
  if (/^(nao|n)\b/.test(t)) return false;
  return /^(sim|s|isso|confirm\w*|pode ser|pode|ok|okey|okay|beleza|blz|claro|perfeito|fechado|combinado|ta bom|tudo bem|quero|aceito|vamos|bora|manda|exato|correto|positivo|show|top|1)\b/.test(t)
      || /^(\u{1F44D}|\u2705|\u{1F44C})/u.test(texto.trim());
}

export function ehNegacao(texto) {
  const t = inicioLimpo(texto);
  return /^(nao|n|nops|negativo|outro|outra|nenhum|nenhuma|cancela|deixa|melhor nao|mudei de ideia|troca|trocar|muda|mudar|2)\b/.test(t)
      || /^(\u{1F44E}|\u274C)/u.test(texto.trim());
}

export function extrairNota(texto) {
  const t = semAcento(texto);
  const estrelas = (t.match(/⭐|★/g) || []).length;
  if (estrelas >= 1 && estrelas <= 5) return estrelas;
  const m = t.match(/\b([1-5])\s*(?:estrelas?|\/\s*5)?\b/);
  if (m) return Number(m[1]);
  if (/\b(otimo|excelente|perfeito|amei|maravilhoso|nota (10|dez))\b/.test(t)) return 5;
  if (/\b(bom|gostei|legal)\b/.test(t)) return 4;
  if (/\b(ruim|pessimo|horrivel|nao gostei|decepcion)\b/.test(t)) return 2;
  return null;
}
