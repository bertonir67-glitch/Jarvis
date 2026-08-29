// Camada de dados — SQLite nativo do Node (sem dependencias externas)
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'jarvis.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  -- Configuracao do negocio (linha unica, id = 1)
  CREATE TABLE IF NOT EXISTS negocio (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    nome                TEXT NOT NULL DEFAULT 'Meu Negocio',
    segmento            TEXT DEFAULT 'servicos',
    telefone            TEXT,
    whatsapp            TEXT,
    endereco            TEXT,
    instagram           TEXT,
    cor                 TEXT DEFAULT '#6c5ce7',
    sobre               TEXT,
    boas_vindas         TEXT,
    personalidade_ia    TEXT DEFAULT 'simpatico',
    intervalo_slots     INTEGER DEFAULT 30,
    antecedencia_min_h  INTEGER DEFAULT 2,
    antecedencia_max_d  INTEGER DEFAULT 60,
    cancelamento_min_h  INTEGER DEFAULT 4,
    lembrete_h          INTEGER DEFAULT 24,
    pedir_avaliacao     INTEGER DEFAULT 1,
    atualizado_em       INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS servicos (
    id          TEXT PRIMARY KEY,
    nome        TEXT NOT NULL,
    descricao   TEXT,
    duracao_min INTEGER NOT NULL DEFAULT 30,
    preco       REAL DEFAULT 0,
    categoria   TEXT,
    ordem       INTEGER DEFAULT 0,
    ativo       INTEGER DEFAULT 1,
    criado_em   INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS profissionais (
    id         TEXT PRIMARY KEY,
    nome       TEXT NOT NULL,
    apelido    TEXT,
    telefone   TEXT,
    cor        TEXT DEFAULT '#6c5ce7',
    ativo      INTEGER DEFAULT 1,
    criado_em  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS profissional_servico (
    profissional_id TEXT NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    servico_id      TEXT NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
    PRIMARY KEY (profissional_id, servico_id)
  );

  -- Expediente. profissional_id NULL = horario padrao do negocio
  CREATE TABLE IF NOT EXISTS horarios (
    id              TEXT PRIMARY KEY,
    profissional_id TEXT REFERENCES profissionais(id) ON DELETE CASCADE,
    dia_semana      INTEGER NOT NULL,
    abre            TEXT NOT NULL,
    fecha           TEXT NOT NULL,
    ativo           INTEGER DEFAULT 1
  );

  -- Ferias, feriados e pausas
  CREATE TABLE IF NOT EXISTS bloqueios (
    id              TEXT PRIMARY KEY,
    profissional_id TEXT REFERENCES profissionais(id) ON DELETE CASCADE,
    data_inicio     TEXT NOT NULL,
    data_fim        TEXT NOT NULL,
    hora_inicio     TEXT,
    hora_fim        TEXT,
    motivo          TEXT,
    criado_em       INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id             TEXT PRIMARY KEY,
    nome           TEXT NOT NULL,
    telefone       TEXT NOT NULL UNIQUE,
    email          TEXT,
    notas          TEXT,
    total_visitas  INTEGER DEFAULT 0,
    total_faltas   INTEGER DEFAULT 0,
    criado_em      INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS agendamentos (
    id              TEXT PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    cliente_id      TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    servico_id      TEXT NOT NULL REFERENCES servicos(id),
    profissional_id TEXT REFERENCES profissionais(id),
    data            TEXT NOT NULL,
    hora_inicio     TEXT NOT NULL,
    hora_fim        TEXT NOT NULL,
    preco           REAL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'confirmado',
    origem          TEXT DEFAULT 'site',
    observacao      TEXT,
    criado_em       INTEGER DEFAULT (unixepoch()),
    atualizado_em   INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_agenda_data ON agendamentos(data, status);
  CREATE INDEX IF NOT EXISTS idx_agenda_prof ON agendamentos(profissional_id, data);

  CREATE TABLE IF NOT EXISTS avaliacoes (
    id              TEXT PRIMARY KEY,
    agendamento_id  TEXT REFERENCES agendamentos(id) ON DELETE SET NULL,
    cliente_id      TEXT REFERENCES clientes(id) ON DELETE SET NULL,
    nota            INTEGER NOT NULL,
    comentario      TEXT,
    resposta        TEXT,
    resposta_status TEXT DEFAULT 'pendente',
    canal           TEXT DEFAULT 'portal',
    criado_em       INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversas (
    id            TEXT PRIMARY KEY,
    cliente_id    TEXT REFERENCES clientes(id) ON DELETE SET NULL,
    telefone      TEXT,
    nome          TEXT,
    canal         TEXT DEFAULT 'portal',
    status        TEXT DEFAULT 'aberta',
    estado        TEXT,
    criado_em     INTEGER DEFAULT (unixepoch()),
    ultima_em     INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS mensagens (
    id          TEXT PRIMARY KEY,
    conversa_id TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    autor       TEXT NOT NULL,
    texto       TEXT NOT NULL,
    meta        TEXT,
    criado_em   INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_msg_conversa ON mensagens(conversa_id, criado_em);

  -- Fila de mensagens para o cliente (confirmacao, lembrete, pedido de avaliacao)
  CREATE TABLE IF NOT EXISTS outbox (
    id             TEXT PRIMARY KEY,
    agendamento_id TEXT REFERENCES agendamentos(id) ON DELETE CASCADE,
    telefone       TEXT NOT NULL,
    nome           TEXT,
    tipo           TEXT NOT NULL,
    texto          TEXT NOT NULL,
    status         TEXT DEFAULT 'pendente',
    agendado_para  INTEGER,
    enviado_em     INTEGER,
    erro           TEXT,
    criado_em      INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, agendado_para);
`);

db.exec(`
  -- Compromissos vindos do calendario pessoal do dono (feed .ics assinado).
  -- Cache local: e reescrito inteiro a cada sincronizacao.
  CREATE TABLE IF NOT EXISTS agenda_externa (
    id              TEXT PRIMARY KEY,
    profissional_id TEXT REFERENCES profissionais(id) ON DELETE CASCADE,
    uid             TEXT,
    titulo          TEXT,
    data            TEXT NOT NULL,
    hora_inicio     TEXT,
    hora_fim        TEXT,
    dia_inteiro     INTEGER DEFAULT 0,
    criado_em       INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_externa_data ON agenda_externa(data);

  -- Historico das sincronizacoes, para o painel mostrar o que aconteceu
  CREATE TABLE IF NOT EXISTS sincronizacoes (
    id              TEXT PRIMARY KEY,
    profissional_id TEXT,
    url             TEXT,
    eventos         INTEGER DEFAULT 0,
    erro            TEXT,
    criado_em       INTEGER DEFAULT (unixepoch())
  );
`);

db.exec(`
  -- Fila de quem quer um horario que ainda nao existe.
  -- Quando alguem cancela, esta lista vira receita de volta.
  CREATE TABLE IF NOT EXISTS espera (
    id              TEXT PRIMARY KEY,
    cliente_id      TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    servico_id      TEXT NOT NULL REFERENCES servicos(id),
    profissional_id TEXT REFERENCES profissionais(id) ON DELETE SET NULL,
    data_de         TEXT NOT NULL,
    data_ate        TEXT NOT NULL,
    periodos        TEXT,
    observacao      TEXT,
    status          TEXT DEFAULT 'aguardando',
    avisado_em      INTEGER,
    vaga_data       TEXT,
    vaga_hora       TEXT,
    criado_em       INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_espera_status ON espera(status, data_de);

  -- Cada movimento de dinheiro do dia (atendimento, produto, ajuste)
  CREATE TABLE IF NOT EXISTS lancamentos (
    id              TEXT PRIMARY KEY,
    agendamento_id  TEXT REFERENCES agendamentos(id) ON DELETE SET NULL,
    profissional_id TEXT REFERENCES profissionais(id) ON DELETE SET NULL,
    data            TEXT NOT NULL,
    tipo            TEXT NOT NULL DEFAULT 'servico',
    descricao       TEXT,
    valor           REAL NOT NULL DEFAULT 0,
    forma           TEXT,
    criado_em       INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_lanc_data ON lancamentos(data);
`);

/** Adiciona colunas novas em bases que ja existem, sem perder dados. */
function garantirColuna(tabela, coluna, definicao) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some(c => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

// Aparencia e identidade visual
garantirColuna('negocio', 'logo',            'TEXT');
garantirColuna('negocio', 'capa',            'TEXT');
garantirColuna('negocio', 'base_neutra',     `TEXT DEFAULT 'areia'`);
garantirColuna('negocio', 'fonte',           `TEXT DEFAULT 'jakarta'`);
garantirColuna('negocio', 'cantos',          `TEXT DEFAULT 'suave'`);
garantirColuna('negocio', 'titulo_portal',   'TEXT');
garantirColuna('negocio', 'rodape',          'TEXT');
garantirColuna('negocio', 'politica',        'TEXT');
garantirColuna('negocio', 'mostrar_precos',  'INTEGER DEFAULT 1');
garantirColuna('negocio', 'mostrar_equipe',  'INTEGER DEFAULT 1');

// Sinal por PIX: evita a falta sem depender de gateway de pagamento
garantirColuna('negocio', 'pix_chave',   'TEXT');
garantirColuna('negocio', 'pix_nome',    'TEXT');
garantirColuna('negocio', 'pix_cidade',  'TEXT');
garantirColuna('negocio', 'sinal_ativo',   'INTEGER DEFAULT 0');
garantirColuna('negocio', 'sinal_so_risco','INTEGER DEFAULT 1');
garantirColuna('servicos', 'sinal', 'REAL DEFAULT 0');
garantirColuna('agendamentos', 'sinal',      'REAL DEFAULT 0');
garantirColuna('agendamentos', 'sinal_pago', 'INTEGER DEFAULT 0');

// Confirmacao ativa do cliente
garantirColuna('agendamentos', 'confirmado_em', 'INTEGER');
garantirColuna('agendamentos', 'valor_extra',   'REAL DEFAULT 0');
garantirColuna('agendamentos', 'forma_pagamento', 'TEXT');

// Comissao da equipe e fidelidade
garantirColuna('profissionais', 'comissao', 'REAL DEFAULT 0');
garantirColuna('negocio', 'fidelidade_meta',   'INTEGER DEFAULT 0');
garantirColuna('negocio', 'fidelidade_premio', 'TEXT');
garantirColuna('clientes', 'fidelidade_usada', 'INTEGER DEFAULT 0');

// Integracao de calendario
garantirColuna('negocio', 'feed_token',        'TEXT');
garantirColuna('negocio', 'calendario_url',    'TEXT');
garantirColuna('negocio', 'calendario_sync_em','INTEGER');
garantirColuna('profissionais', 'calendario_url', 'TEXT');

db.exec(`INSERT OR IGNORE INTO negocio (id) VALUES (1)`);

// Token do feed privado: gerado uma vez e reutilizado
if (!db.prepare('SELECT feed_token FROM negocio WHERE id = 1').get()?.feed_token) {
  db.prepare('UPDATE negocio SET feed_token = ? WHERE id = 1')
    .run(randomUUID().replace(/-/g, ''));
}

const id = () => randomUUID();
const agora = () => Math.floor(Date.now() / 1000);

function codigoCurto() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += letras[Math.floor(Math.random() * letras.length)];
  return c;
}

/* ---------------------------------------------------------------- NEGOCIO */

export function lerNegocio() {
  return db.prepare('SELECT * FROM negocio WHERE id = 1').get();
}

export function salvarNegocio(dados) {
  const permitidos = [
    'nome', 'segmento', 'telefone', 'whatsapp', 'endereco', 'instagram', 'cor',
    'sobre', 'boas_vindas', 'personalidade_ia', 'intervalo_slots',
    'antecedencia_min_h', 'antecedencia_max_d', 'cancelamento_min_h',
    'lembrete_h', 'pedir_avaliacao',
    'logo', 'capa', 'base_neutra', 'fonte', 'cantos', 'titulo_portal',
    'rodape', 'politica', 'mostrar_precos', 'mostrar_equipe', 'calendario_url',
    'pix_chave', 'pix_nome', 'pix_cidade', 'sinal_ativo', 'sinal_so_risco',
    'fidelidade_meta', 'fidelidade_premio'
  ];
  const campos = permitidos.filter(c => dados[c] !== undefined);
  if (!campos.length) return lerNegocio();
  const sets = campos.map(c => `${c} = ?`).join(', ');
  const vals = campos.map(c => dados[c]);
  db.prepare(`UPDATE negocio SET ${sets}, atualizado_em = ? WHERE id = 1`).run(...vals, agora());
  return lerNegocio();
}

/* --------------------------------------------------------------- SERVICOS */

export function listarServicos(incluirInativos = false) {
  const sql = incluirInativos
    ? 'SELECT * FROM servicos ORDER BY ordem, nome'
    : 'SELECT * FROM servicos WHERE ativo = 1 ORDER BY ordem, nome';
  return db.prepare(sql).all();
}

export function buscarServico(servicoId) {
  return db.prepare('SELECT * FROM servicos WHERE id = ?').get(servicoId);
}

export function salvarServico(s) {
  if (s.id && buscarServico(s.id)) {
    db.prepare(`UPDATE servicos SET nome=?, descricao=?, duracao_min=?, preco=?,
                categoria=?, ordem=?, ativo=?, sinal=? WHERE id=?`)
      .run(s.nome, s.descricao || null, Number(s.duracao_min) || 30, Number(s.preco) || 0,
           s.categoria || null, Number(s.ordem) || 0, s.ativo ? 1 : 0,
           Number(s.sinal) || 0, s.id);
    return buscarServico(s.id);
  }
  const novo = s.id || id();
  db.prepare(`INSERT INTO servicos (id, nome, descricao, duracao_min, preco, categoria, ordem, ativo, sinal)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(novo, s.nome, s.descricao || null, Number(s.duracao_min) || 30, Number(s.preco) || 0,
         s.categoria || null, Number(s.ordem) || 0, s.ativo === undefined ? 1 : (s.ativo ? 1 : 0),
         Number(s.sinal) || 0);
  return buscarServico(novo);
}

export function removerServico(servicoId) {
  // Nao apaga: desativa, para nao quebrar historico de agendamentos
  db.prepare('UPDATE servicos SET ativo = 0 WHERE id = ?').run(servicoId);
  return { ok: true };
}

/* ---------------------------------------------------------- PROFISSIONAIS */

export function listarProfissionais(incluirInativos = false) {
  const sql = incluirInativos
    ? 'SELECT * FROM profissionais ORDER BY nome'
    : 'SELECT * FROM profissionais WHERE ativo = 1 ORDER BY nome';
  const lista = db.prepare(sql).all();
  const vinc = db.prepare('SELECT servico_id FROM profissional_servico WHERE profissional_id = ?');
  return lista.map(p => ({ ...p, servicos: vinc.all(p.id).map(r => r.servico_id) }));
}

export function buscarProfissional(profId) {
  const p = db.prepare('SELECT * FROM profissionais WHERE id = ?').get(profId);
  if (!p) return null;
  p.servicos = db.prepare('SELECT servico_id FROM profissional_servico WHERE profissional_id = ?')
    .all(profId).map(r => r.servico_id);
  return p;
}

export function salvarProfissional(p) {
  const existe = p.id && db.prepare('SELECT id FROM profissionais WHERE id = ?').get(p.id);
  const pid = p.id || id();
  if (existe) {
    const anterior = buscarProfissional(pid);
    db.prepare(`UPDATE profissionais SET nome=?, apelido=?, telefone=?, cor=?, ativo=?,
                calendario_url=?, comissao=? WHERE id=?`)
      .run(p.nome, p.apelido || null, p.telefone || null, p.cor || '#5f7a6e', p.ativo ? 1 : 0,
           p.calendario_url === undefined ? (anterior?.calendario_url || null) : (p.calendario_url || null),
           p.comissao === undefined ? (anterior?.comissao || 0) : Number(p.comissao) || 0,
           pid);
  } else {
    db.prepare(`INSERT INTO profissionais (id, nome, apelido, telefone, cor, ativo, calendario_url, comissao)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(pid, p.nome, p.apelido || null, p.telefone || null, p.cor || '#5f7a6e',
           p.ativo === undefined ? 1 : (p.ativo ? 1 : 0), p.calendario_url || null,
           Number(p.comissao) || 0);
  }
  if (Array.isArray(p.servicos)) {
    db.prepare('DELETE FROM profissional_servico WHERE profissional_id = ?').run(pid);
    const ins = db.prepare('INSERT OR IGNORE INTO profissional_servico VALUES (?,?)');
    for (const sid of p.servicos) ins.run(pid, sid);
  }
  return buscarProfissional(pid);
}

export function removerProfissional(profId) {
  db.prepare('UPDATE profissionais SET ativo = 0 WHERE id = ?').run(profId);
  return { ok: true };
}

/** Profissionais aptos a executar um servico (sem vinculo = atende tudo). */
export function profissionaisDoServico(servicoId) {
  const todos = listarProfissionais();
  const comVinculo = todos.filter(p => p.servicos.length > 0);
  if (!comVinculo.length) return todos;
  return todos.filter(p => p.servicos.length === 0 || p.servicos.includes(servicoId));
}

/* --------------------------------------------------------------- HORARIOS */

export function listarHorarios(profissionalId = null) {
  return profissionalId
    ? db.prepare('SELECT * FROM horarios WHERE profissional_id = ? ORDER BY dia_semana, abre').all(profissionalId)
    : db.prepare('SELECT * FROM horarios WHERE profissional_id IS NULL ORDER BY dia_semana, abre').all();
}

export function listarTodosHorarios() {
  return db.prepare('SELECT * FROM horarios ORDER BY dia_semana, abre').all();
}

export function definirHorarios(profissionalId, faixas) {
  if (profissionalId) {
    db.prepare('DELETE FROM horarios WHERE profissional_id = ?').run(profissionalId);
  } else {
    db.prepare('DELETE FROM horarios WHERE profissional_id IS NULL').run();
  }
  const ins = db.prepare(`INSERT INTO horarios (id, profissional_id, dia_semana, abre, fecha, ativo)
                          VALUES (?,?,?,?,?,?)`);
  for (const f of faixas) {
    if (!f.abre || !f.fecha || f.ativo === 0 || f.ativo === false) continue;
    ins.run(id(), profissionalId || null, Number(f.dia_semana), f.abre, f.fecha, 1);
  }
  return listarHorarios(profissionalId);
}

/* -------------------------------------------------------------- BLOQUEIOS */

export function listarBloqueios() {
  return db.prepare(`SELECT b.*, p.nome AS profissional_nome FROM bloqueios b
                     LEFT JOIN profissionais p ON p.id = b.profissional_id
                     ORDER BY b.data_inicio DESC`).all();
}

export function salvarBloqueio(b) {
  const bid = b.id || id();
  db.prepare(`INSERT OR REPLACE INTO bloqueios
              (id, profissional_id, data_inicio, data_fim, hora_inicio, hora_fim, motivo)
              VALUES (?,?,?,?,?,?,?)`)
    .run(bid, b.profissional_id || null, b.data_inicio, b.data_fim || b.data_inicio,
         b.hora_inicio || null, b.hora_fim || null, b.motivo || null);
  return db.prepare('SELECT * FROM bloqueios WHERE id = ?').get(bid);
}

export function removerBloqueio(bid) {
  db.prepare('DELETE FROM bloqueios WHERE id = ?').run(bid);
  return { ok: true };
}

export function bloqueiosNaData(data) {
  return db.prepare('SELECT * FROM bloqueios WHERE data_inicio <= ? AND data_fim >= ?').all(data, data);
}

/* --------------------------------------------------------------- CLIENTES */

export function normalizarTelefone(tel) {
  const so = String(tel || '').replace(/\D/g, '');
  return so.startsWith('55') && so.length > 11 ? so.slice(2) : so;
}

export function buscarClientePorTelefone(tel) {
  return db.prepare('SELECT * FROM clientes WHERE telefone = ?').get(normalizarTelefone(tel));
}

export function buscarCliente(cid) {
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(cid);
}

export function garantirCliente(nome, telefone, email) {
  const tel = normalizarTelefone(telefone);
  const achado = buscarClientePorTelefone(tel);
  if (achado) {
    if (nome && nome !== achado.nome) {
      db.prepare('UPDATE clientes SET nome = ? WHERE id = ?').run(nome, achado.id);
      achado.nome = nome;
    }
    if (email && !achado.email) {
      db.prepare('UPDATE clientes SET email = ? WHERE id = ?').run(email, achado.id);
      achado.email = email;
    }
    return achado;
  }
  const cid = id();
  db.prepare('INSERT INTO clientes (id, nome, telefone, email) VALUES (?,?,?,?)')
    .run(cid, nome || 'Cliente', tel, email || null);
  return buscarCliente(cid);
}

export function listarClientes(busca = '') {
  const sql = `SELECT c.*,
      (SELECT COUNT(*) FROM agendamentos a WHERE a.cliente_id = c.id) AS agendamentos,
      (SELECT MAX(data) FROM agendamentos a WHERE a.cliente_id = c.id AND a.status IN ('concluido','confirmado')) AS ultima_visita
    FROM clientes c
    ${busca ? 'WHERE c.nome LIKE ? OR c.telefone LIKE ?' : ''}
    ORDER BY c.criado_em DESC LIMIT 300`;
  return busca ? db.prepare(sql).all(`%${busca}%`, `%${busca}%`) : db.prepare(sql).all();
}

export function atualizarNotasCliente(cid, notas) {
  db.prepare('UPDATE clientes SET notas = ? WHERE id = ?').run(notas || null, cid);
  return buscarCliente(cid);
}

/**
 * LGPD: apaga os dados pessoais do cliente mantendo o histórico contábil.
 * O agendamento continua existindo para o fechamento do caixa, mas deixa
 * de apontar para uma pessoa identificável.
 */
export function anonimizarCliente(clienteId) {
  const c = buscarCliente(clienteId);
  if (!c) return { ok: false };
  const apelido = `Cliente removido ${String(clienteId).slice(0, 6)}`;
  db.prepare(`UPDATE clientes SET nome = ?, telefone = ?, email = NULL, notas = NULL
              WHERE id = ?`).run(apelido, `removido-${clienteId.slice(0, 12)}`, clienteId);
  db.prepare(`UPDATE conversas SET nome = NULL, telefone = NULL WHERE cliente_id = ?`).run(clienteId);
  db.prepare(`UPDATE espera SET status = 'cancelado' WHERE cliente_id = ? AND status = 'aguardando'`).run(clienteId);
  db.prepare(`UPDATE outbox SET status = 'cancelado', telefone = 'removido', nome = NULL
              WHERE telefone = ? AND status IN ('pendente','aguardando_envio')`).run(c.telefone);
  db.prepare(`UPDATE avaliacoes SET comentario = comentario WHERE cliente_id = ?`).run(clienteId);
  return { ok: true };
}

/** Tudo que o sistema guarda sobre um cliente, para ele levar embora. */
export function dadosDoCliente(clienteId) {
  const c = buscarCliente(clienteId);
  if (!c) return null;
  return {
    cliente: { nome: c.nome, telefone: c.telefone, email: c.email, desde: c.criado_em },
    agendamentos: agendamentosDoCliente(c.id).map(a => ({
      codigo: a.codigo, servico: a.servico_nome, data: a.data,
      hora: a.hora_inicio, valor: a.preco, situacao: a.status
    })),
    avaliacoes: db.prepare('SELECT nota, comentario, criado_em FROM avaliacoes WHERE cliente_id = ?').all(c.id),
    lista_de_espera: esperaDoCliente(c.id).map(e => ({
      servico: e.servico_nome, de: e.data_de, ate: e.data_ate, situacao: e.status
    }))
  };
}

/* ----------------------------------------------------------- AGENDAMENTOS */

const SQL_AGENDA = `
  SELECT a.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
         s.nome AS servico_nome, s.duracao_min,
         p.nome AS profissional_nome, p.cor AS profissional_cor
  FROM agendamentos a
  JOIN clientes c ON c.id = a.cliente_id
  JOIN servicos s ON s.id = a.servico_id
  LEFT JOIN profissionais p ON p.id = a.profissional_id`;

export function criarAgendamento(a) {
  const aid = a.id || id();
  let codigo = a.codigo || codigoCurto();
  while (db.prepare('SELECT id FROM agendamentos WHERE codigo = ?').get(codigo)) codigo = codigoCurto();
  db.prepare(`INSERT INTO agendamentos
    (id, codigo, cliente_id, servico_id, profissional_id, data, hora_inicio, hora_fim,
     preco, status, origem, observacao, sinal)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(aid, codigo, a.cliente_id, a.servico_id, a.profissional_id || null, a.data,
         a.hora_inicio, a.hora_fim, Number(a.preco) || 0, a.status || 'confirmado',
         a.origem || 'site', a.observacao || null, Number(a.sinal) || 0);
  return buscarAgendamento(aid);
}

export function buscarAgendamento(aid) {
  return db.prepare(`${SQL_AGENDA} WHERE a.id = ?`).get(aid);
}

export function buscarAgendamentoPorCodigo(codigo) {
  return db.prepare(`${SQL_AGENDA} WHERE a.codigo = ?`).get(String(codigo || '').toUpperCase());
}

export function listarAgendamentos({ de, ate, status, profissional_id, cliente_id, limite = 500 } = {}) {
  const where = [];
  const args = [];
  if (de)  { where.push('a.data >= ?'); args.push(de); }
  if (ate) { where.push('a.data <= ?'); args.push(ate); }
  if (status) { where.push('a.status = ?'); args.push(status); }
  if (profissional_id) { where.push('a.profissional_id = ?'); args.push(profissional_id); }
  if (cliente_id) { where.push('a.cliente_id = ?'); args.push(cliente_id); }
  const sql = `${SQL_AGENDA} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY a.data, a.hora_inicio LIMIT ${Number(limite)}`;
  return db.prepare(sql).all(...args);
}

/** Agendamentos que ocupam a agenda (usado pelo motor de horarios). */
export function ocupacaoDoDia(data, profissionalId = null) {
  const base = `SELECT a.id, a.data, a.hora_inicio, a.hora_fim, a.profissional_id
                FROM agendamentos a
                WHERE a.data = ? AND a.status IN ('confirmado','pendente')`;
  return profissionalId
    ? db.prepare(`${base} AND (a.profissional_id = ? OR a.profissional_id IS NULL)`).all(data, profissionalId)
    : db.prepare(base).all(data);
}

export function atualizarAgendamento(aid, campos) {
  const permitidos = ['data', 'hora_inicio', 'hora_fim', 'status', 'observacao',
    'profissional_id', 'servico_id', 'preco', 'sinal', 'sinal_pago', 'confirmado_em',
    'valor_extra', 'forma_pagamento'];
  const usar = permitidos.filter(c => campos[c] !== undefined);
  if (!usar.length) return buscarAgendamento(aid);
  const sets = usar.map(c => `${c} = ?`).join(', ');
  db.prepare(`UPDATE agendamentos SET ${sets}, atualizado_em = ? WHERE id = ?`)
    .run(...usar.map(c => campos[c]), agora(), aid);
  if (campos.status === 'concluido') {
    const ag = buscarAgendamento(aid);
    db.prepare('UPDATE clientes SET total_visitas = total_visitas + 1 WHERE id = ?').run(ag.cliente_id);
  }
  if (campos.status === 'faltou') {
    const ag = buscarAgendamento(aid);
    db.prepare('UPDATE clientes SET total_faltas = total_faltas + 1 WHERE id = ?').run(ag.cliente_id);
  }
  return buscarAgendamento(aid);
}

export function agendamentosDoCliente(clienteId) {
  return db.prepare(`${SQL_AGENDA} WHERE a.cliente_id = ? ORDER BY a.data DESC, a.hora_inicio DESC LIMIT 100`)
    .all(clienteId);
}

/* -------------------------------------------------------------- AVALIACOES */

export function criarAvaliacao(av) {
  const avid = av.id || id();
  db.prepare(`INSERT INTO avaliacoes (id, agendamento_id, cliente_id, nota, comentario, canal)
              VALUES (?,?,?,?,?,?)`)
    .run(avid, av.agendamento_id || null, av.cliente_id || null, Number(av.nota),
         av.comentario || null, av.canal || 'portal');
  return buscarAvaliacao(avid);
}

export function buscarAvaliacao(avid) {
  return db.prepare(`SELECT av.*, c.nome AS cliente_nome, s.nome AS servico_nome
                     FROM avaliacoes av
                     LEFT JOIN clientes c ON c.id = av.cliente_id
                     LEFT JOIN agendamentos a ON a.id = av.agendamento_id
                     LEFT JOIN servicos s ON s.id = a.servico_id
                     WHERE av.id = ?`).get(avid);
}

export function listarAvaliacoes({ status, limite = 200 } = {}) {
  const where = status ? 'WHERE av.resposta_status = ?' : '';
  const sql = `SELECT av.*, c.nome AS cliente_nome, s.nome AS servico_nome
               FROM avaliacoes av
               LEFT JOIN clientes c ON c.id = av.cliente_id
               LEFT JOIN agendamentos a ON a.id = av.agendamento_id
               LEFT JOIN servicos s ON s.id = a.servico_id
               ${where} ORDER BY av.criado_em DESC LIMIT ${Number(limite)}`;
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function avaliacaoDoAgendamento(agendamentoId) {
  return db.prepare('SELECT * FROM avaliacoes WHERE agendamento_id = ?').get(agendamentoId);
}

export function responderAvaliacao(avid, resposta, status = 'rascunho') {
  db.prepare('UPDATE avaliacoes SET resposta = ?, resposta_status = ? WHERE id = ?')
    .run(resposta, status, avid);
  return buscarAvaliacao(avid);
}

/* --------------------------------------------------------------- CONVERSAS */

export function abrirConversa({ telefone, nome, canal = 'portal', cliente_id = null }) {
  const tel = telefone ? normalizarTelefone(telefone) : null;
  if (tel) {
    const existente = db.prepare(
      `SELECT * FROM conversas WHERE telefone = ? AND status = 'aberta' ORDER BY ultima_em DESC`
    ).get(tel);
    if (existente) return existente;
  }
  const cid = id();
  db.prepare('INSERT INTO conversas (id, cliente_id, telefone, nome, canal) VALUES (?,?,?,?,?)')
    .run(cid, cliente_id, tel, nome || null, canal);
  return db.prepare('SELECT * FROM conversas WHERE id = ?').get(cid);
}

export function buscarConversa(cid) {
  return db.prepare('SELECT * FROM conversas WHERE id = ?').get(cid);
}

export function salvarEstadoConversa(cid, estado, extras = {}) {
  const campos = ['estado = ?', 'ultima_em = ?'];
  const args = [JSON.stringify(estado || {}), agora()];
  if (extras.nome) { campos.push('nome = ?'); args.push(extras.nome); }
  if (extras.telefone) { campos.push('telefone = ?'); args.push(normalizarTelefone(extras.telefone)); }
  if (extras.cliente_id) { campos.push('cliente_id = ?'); args.push(extras.cliente_id); }
  if (extras.status) { campos.push('status = ?'); args.push(extras.status); }
  db.prepare(`UPDATE conversas SET ${campos.join(', ')} WHERE id = ?`).run(...args, cid);
}

export function lerEstadoConversa(cid) {
  const c = buscarConversa(cid);
  if (!c || !c.estado) return {};
  try { return JSON.parse(c.estado); } catch { return {}; }
}

export function gravarMensagem(conversaId, autor, texto, meta = null) {
  const mid = id();
  db.prepare('INSERT INTO mensagens (id, conversa_id, autor, texto, meta) VALUES (?,?,?,?,?)')
    .run(mid, conversaId, autor, texto, meta ? JSON.stringify(meta) : null);
  db.prepare('UPDATE conversas SET ultima_em = ? WHERE id = ?').run(agora(), conversaId);
  return db.prepare('SELECT * FROM mensagens WHERE id = ?').get(mid);
}

export function historicoConversa(conversaId, limite = 50) {
  return db.prepare('SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY criado_em, rowid LIMIT ?')
    .all(conversaId, limite);
}

export function listarConversas(limite = 100) {
  return db.prepare(`
    SELECT c.*,
      (SELECT texto FROM mensagens m WHERE m.conversa_id = c.id ORDER BY m.criado_em DESC, m.rowid DESC LIMIT 1) AS ultima_msg,
      (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id) AS total_msgs
    FROM conversas c ORDER BY c.ultima_em DESC LIMIT ?`).all(limite);
}

/* ----------------------------------------------------------------- OUTBOX */

export function enfileirar(msg) {
  const oid = id();
  db.prepare(`INSERT INTO outbox (id, agendamento_id, telefone, nome, tipo, texto, agendado_para)
              VALUES (?,?,?,?,?,?,?)`)
    .run(oid, msg.agendamento_id || null, normalizarTelefone(msg.telefone), msg.nome || null,
         msg.tipo, msg.texto, msg.agendado_para || agora());
  return db.prepare('SELECT * FROM outbox WHERE id = ?').get(oid);
}

export function listarOutbox({ status, limite = 200 } = {}) {
  const sql = status
    ? 'SELECT * FROM outbox WHERE status = ? ORDER BY agendado_para DESC LIMIT ?'
    : 'SELECT * FROM outbox ORDER BY criado_em DESC LIMIT ?';
  return status ? db.prepare(sql).all(status, limite) : db.prepare(sql).all(limite);
}

export function pendentesParaEnvio() {
  return db.prepare(`SELECT * FROM outbox WHERE status = 'pendente' AND agendado_para <= ?
                     ORDER BY agendado_para LIMIT 20`).all(agora());
}

export function marcarOutbox(oid, status, erro = null) {
  db.prepare('UPDATE outbox SET status = ?, enviado_em = ?, erro = ? WHERE id = ?')
    .run(status, status === 'enviado' ? agora() : null, erro, oid);
}

export function cancelarOutboxDoAgendamento(agendamentoId, tipos = null) {
  if (tipos) {
    const marks = tipos.map(() => '?').join(',');
    db.prepare(`UPDATE outbox SET status = 'cancelado' WHERE agendamento_id = ?
                AND status = 'pendente' AND tipo IN (${marks})`).run(agendamentoId, ...tipos);
  } else {
    db.prepare(`UPDATE outbox SET status = 'cancelado' WHERE agendamento_id = ? AND status = 'pendente'`)
      .run(agendamentoId);
  }
}

/* -------------------------------------------------------- LISTA DE ESPERA */

export function criarEspera(e) {
  const eid = e.id || id();
  db.prepare(`INSERT INTO espera
    (id, cliente_id, servico_id, profissional_id, data_de, data_ate, periodos, observacao)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(eid, e.cliente_id, e.servico_id, e.profissional_id || null,
         e.data_de, e.data_ate, e.periodos || null, e.observacao || null);
  return buscarEspera(eid);
}

const SQL_ESPERA = `
  SELECT e.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
         s.nome AS servico_nome, s.duracao_min, s.preco,
         p.nome AS profissional_nome
  FROM espera e
  JOIN clientes c ON c.id = e.cliente_id
  JOIN servicos s ON s.id = e.servico_id
  LEFT JOIN profissionais p ON p.id = e.profissional_id`;

export function buscarEspera(eid) {
  return db.prepare(`${SQL_ESPERA} WHERE e.id = ?`).get(eid);
}

export function listarEspera(status = null) {
  const sql = status
    ? `${SQL_ESPERA} WHERE e.status = ? ORDER BY e.criado_em`
    : `${SQL_ESPERA} ORDER BY (e.status = 'aguardando') DESC, e.criado_em DESC LIMIT 200`;
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

/** Quem está esperando por uma vaga que acabou de abrir, na ordem da fila. */
export function esperaCompativel(data, servicoId, profissionalId) {
  return db.prepare(`${SQL_ESPERA}
    WHERE e.status = 'aguardando'
      AND e.servico_id = ?
      AND e.data_de <= ? AND e.data_ate >= ?
      AND (e.profissional_id IS NULL OR e.profissional_id = ?)
    ORDER BY e.criado_em`).all(servicoId, data, data, profissionalId || null);
}

export function atualizarEspera(eid, campos) {
  const permitidos = ['status', 'avisado_em', 'vaga_data', 'vaga_hora', 'observacao'];
  const usar = permitidos.filter(c => campos[c] !== undefined);
  if (!usar.length) return buscarEspera(eid);
  db.prepare(`UPDATE espera SET ${usar.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...usar.map(c => campos[c]), eid);
  return buscarEspera(eid);
}

export function esperaDoCliente(clienteId) {
  return db.prepare(`${SQL_ESPERA} WHERE e.cliente_id = ? AND e.status IN ('aguardando','avisado')
                     ORDER BY e.criado_em`).all(clienteId);
}

/* ------------------------------------------------------------- LANÇAMENTOS */

export function criarLancamento(l) {
  const lid = l.id || id();
  db.prepare(`INSERT INTO lancamentos
    (id, agendamento_id, profissional_id, data, tipo, descricao, valor, forma)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(lid, l.agendamento_id || null, l.profissional_id || null, l.data,
         l.tipo || 'extra', l.descricao || null, Number(l.valor) || 0, l.forma || null);
  return db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(lid);
}

export function listarLancamentos(data) {
  return db.prepare(`SELECT l.*, p.nome AS profissional_nome FROM lancamentos l
                     LEFT JOIN profissionais p ON p.id = l.profissional_id
                     WHERE l.data = ? ORDER BY l.criado_em`).all(data);
}

export function removerLancamento(lid) {
  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(lid);
  return { ok: true };
}

/* ---------------------------------------------------------------- RETENÇÃO */

/**
 * Clientes que costumavam vir e pararam. O intervalo é o do próprio cliente,
 * não uma regra fixa: quem vem a cada 15 dias some antes de quem vem a cada 60.
 */
export function clientesParaReativar(hoje, folga = 1.5) {
  return db.prepare(`
    WITH visitas AS (
      SELECT a.cliente_id, a.data,
             LAG(a.data) OVER (PARTITION BY a.cliente_id ORDER BY a.data) AS anterior
      FROM agendamentos a WHERE a.status = 'concluido'
    ),
    ritmo AS (
      SELECT cliente_id,
             COUNT(*) AS idas,
             AVG(julianday(data) - julianday(anterior)) AS media_dias,
             MAX(data) AS ultima
      FROM visitas WHERE anterior IS NOT NULL GROUP BY cliente_id
    )
    SELECT c.id, c.nome, c.telefone, c.total_visitas, c.total_faltas,
           r.idas, ROUND(r.media_dias) AS media_dias, r.ultima,
           CAST(julianday(?) - julianday(r.ultima) AS INTEGER) AS dias_sumido
    FROM ritmo r JOIN clientes c ON c.id = r.cliente_id
    WHERE r.idas >= 2
      AND r.media_dias > 0
      AND julianday(?) - julianday(r.ultima) > r.media_dias * ?
      AND NOT EXISTS (
        SELECT 1 FROM agendamentos f
        WHERE f.cliente_id = c.id AND f.data >= ? AND f.status IN ('confirmado','pendente'))
    ORDER BY dias_sumido DESC LIMIT 100`).all(hoje, hoje, folga, hoje);
}

/** Quantos atendimentos o cliente já fez desde o último prêmio de fidelidade. */
export function progressoFidelidade(clienteId) {
  const c = buscarCliente(clienteId);
  if (!c) return null;
  const concluidos = db.prepare(
    `SELECT COUNT(*) n FROM agendamentos WHERE cliente_id = ? AND status = 'concluido'`
  ).get(clienteId).n;
  return { concluidos, usados: c.fidelidade_usada || 0, disponivel: concluidos - (c.fidelidade_usada || 0) };
}

export function marcarPremioUsado(clienteId, meta) {
  db.prepare('UPDATE clientes SET fidelidade_usada = fidelidade_usada + ? WHERE id = ?')
    .run(Number(meta) || 0, clienteId);
  return buscarCliente(clienteId);
}

/* ------------------------------------------------------------------ CAIXA */

/** Tudo que entrou num dia, por atendimento e por profissional. */
export function fechamentoDoDia(data) {
  const atendimentos = db.prepare(`
    SELECT a.*, c.nome AS cliente_nome, s.nome AS servico_nome,
           p.nome AS profissional_nome, p.comissao
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN profissionais p ON p.id = a.profissional_id
    WHERE a.data = ? AND a.status = 'concluido'
    ORDER BY a.hora_inicio`).all(data);

  const extras = listarLancamentos(data).filter(l => l.tipo !== 'servico');

  const porProfissional = {};
  for (const a of atendimentos) {
    const chave = a.profissional_id || 'sem';
    const p = (porProfissional[chave] ||= {
      id: a.profissional_id, nome: a.profissional_nome || 'Sem profissional',
      comissao: a.comissao || 0, atendimentos: 0, servicos: 0, extras: 0
    });
    p.atendimentos++;
    p.servicos += Number(a.preco) || 0;
    p.extras += Number(a.valor_extra) || 0;
  }
  for (const l of extras) {
    const chave = l.profissional_id || 'sem';
    const p = (porProfissional[chave] ||= {
      id: l.profissional_id, nome: l.profissional_nome || 'Sem profissional',
      comissao: 0, atendimentos: 0, servicos: 0, extras: 0
    });
    p.extras += Number(l.valor) || 0;
  }

  const equipe = Object.values(porProfissional).map(p => {
    const bruto = p.servicos + p.extras;
    return { ...p, bruto, comissao_valor: bruto * (Number(p.comissao) || 0) / 100 };
  }).sort((a, b) => b.bruto - a.bruto);

  const porForma = {};
  for (const a of atendimentos) {
    const f = a.forma_pagamento || 'nao_informado';
    porForma[f] = (porForma[f] || 0) + Number(a.preco) + Number(a.valor_extra || 0);
  }
  for (const l of extras) {
    const f = l.forma || 'nao_informado';
    porForma[f] = (porForma[f] || 0) + Number(l.valor);
  }

  const total = equipe.reduce((s, p) => s + p.bruto, 0);
  const comissoes = equipe.reduce((s, p) => s + p.comissao_valor, 0);

  return {
    data, atendimentos, extras, equipe, por_forma: porForma,
    total, comissoes, liquido: total - comissoes,
    pendentes: db.prepare(`SELECT COUNT(*) n FROM agendamentos
                           WHERE data = ? AND status IN ('confirmado','pendente')`).get(data).n
  };
}

/* -------------------------------------------------------- AGENDA EXTERNA */

/** Substitui todos os eventos importados de um calendario. */
export function trocarAgendaExterna(profissionalId, eventos) {
  const apagar = profissionalId
    ? db.prepare('DELETE FROM agenda_externa WHERE profissional_id = ?')
    : db.prepare('DELETE FROM agenda_externa WHERE profissional_id IS NULL');
  profissionalId ? apagar.run(profissionalId) : apagar.run();

  const ins = db.prepare(`INSERT INTO agenda_externa
    (id, profissional_id, uid, titulo, data, hora_inicio, hora_fim, dia_inteiro)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const e of eventos) {
    ins.run(id(), profissionalId || null, e.uid || null, e.titulo || null,
            e.data, e.hora_inicio || null, e.hora_fim || null, e.dia_inteiro ? 1 : 0);
  }
  return eventos.length;
}

export function eventosExternosNaData(data) {
  return db.prepare('SELECT * FROM agenda_externa WHERE data = ?').all(data);
}

export function resumoAgendaExterna() {
  return db.prepare(`
    SELECT profissional_id, COUNT(*) total, MIN(data) primeira, MAX(data) ultima
    FROM agenda_externa GROUP BY profissional_id`).all();
}

export function registrarSincronizacao(profissionalId, url, eventos, erro = null) {
  db.prepare(`INSERT INTO sincronizacoes (id, profissional_id, url, eventos, erro)
              VALUES (?,?,?,?,?)`)
    .run(id(), profissionalId || null, url || null, eventos || 0, erro);
  db.prepare('UPDATE negocio SET calendario_sync_em = ? WHERE id = 1').run(agora());
}

export function ultimasSincronizacoes(limite = 10) {
  return db.prepare(`SELECT s.*, p.nome AS profissional_nome FROM sincronizacoes s
                     LEFT JOIN profissionais p ON p.id = s.profissional_id
                     ORDER BY s.criado_em DESC, s.rowid DESC LIMIT ?`).all(limite);
}

/** Renova o token do feed privado (invalida os links antigos). */
export function renovarFeedToken() {
  const token = randomUUID().replace(/-/g, '');
  db.prepare('UPDATE negocio SET feed_token = ? WHERE id = 1').run(token);
  return token;
}

/* ------------------------------------------------------------ INDICADORES */

export function indicadores(hoje) {
  const inicioMes = hoje.slice(0, 8) + '01';
  const q = (sql, ...a) => db.prepare(sql).get(...a);

  const hojeTotal = q(`SELECT COUNT(*) n FROM agendamentos WHERE data = ? AND status IN ('confirmado','pendente','concluido')`, hoje).n;
  const semana = q(`SELECT COUNT(*) n FROM agendamentos WHERE data >= ? AND data <= date(?, '+7 day') AND status IN ('confirmado','pendente')`, hoje, hoje).n;
  const mesReceita = q(`SELECT COALESCE(SUM(preco),0) v FROM agendamentos WHERE data >= ? AND data <= ? AND status = 'concluido'`, inicioMes, hoje).v;
  const previsto = q(`SELECT COALESCE(SUM(preco),0) v FROM agendamentos WHERE data >= ? AND status IN ('confirmado','pendente')`, hoje).v;
  const novos = q(`SELECT COUNT(*) n FROM clientes WHERE criado_em >= unixepoch(?)`, inicioMes).n;
  const nota = q(`SELECT ROUND(AVG(nota),1) v, COUNT(*) n FROM avaliacoes`);
  const semResposta = q(`SELECT COUNT(*) n FROM avaliacoes WHERE resposta_status IN ('pendente','rascunho')`).n;
  const porIA = q(`SELECT COUNT(*) n FROM agendamentos WHERE origem = 'chat' AND data >= ?`, inicioMes).n;
  const totalMes = q(`SELECT COUNT(*) n FROM agendamentos WHERE data >= ?`, inicioMes).n;
  const faltas = q(`SELECT COUNT(*) n FROM agendamentos WHERE data >= ? AND status = 'faltou'`, inicioMes).n;
  const cancelados = q(`SELECT COUNT(*) n FROM agendamentos WHERE data >= ? AND status = 'cancelado'`, inicioMes).n;

  return {
    hoje: hojeTotal,
    proximos_7_dias: semana,
    receita_mes: mesReceita,
    receita_prevista: previsto,
    clientes_novos_mes: novos,
    nota_media: nota.v || 0,
    total_avaliacoes: nota.n || 0,
    avaliacoes_sem_resposta: semResposta,
    agendados_pela_ia: porIA,
    total_mes: totalMes,
    faltas_mes: faltas,
    cancelados_mes: cancelados,
    taxa_ia: totalMes ? Math.round((porIA / totalMes) * 100) : 0
  };
}

export function serieAgendamentos(dias = 14, ate) {
  return db.prepare(`
    SELECT data, COUNT(*) total,
           SUM(CASE WHEN origem = 'chat' THEN 1 ELSE 0 END) por_ia
    FROM agendamentos
    WHERE data <= ? AND data >= date(?, '-' || ? || ' day') AND status <> 'cancelado'
    GROUP BY data ORDER BY data`).all(ate, ate, dias);
}

export function rankingServicos(desde) {
  return db.prepare(`
    SELECT s.nome, COUNT(*) total, COALESCE(SUM(a.preco),0) receita
    FROM agendamentos a JOIN servicos s ON s.id = a.servico_id
    WHERE a.data >= ? AND a.status <> 'cancelado'
    GROUP BY s.id ORDER BY total DESC LIMIT 8`).all(desde);
}

export default db;
