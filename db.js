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

db.exec(`INSERT OR IGNORE INTO negocio (id) VALUES (1)`);

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
    'lembrete_h', 'pedir_avaliacao'
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
                categoria=?, ordem=?, ativo=? WHERE id=?`)
      .run(s.nome, s.descricao || null, Number(s.duracao_min) || 30, Number(s.preco) || 0,
           s.categoria || null, Number(s.ordem) || 0, s.ativo ? 1 : 0, s.id);
    return buscarServico(s.id);
  }
  const novo = s.id || id();
  db.prepare(`INSERT INTO servicos (id, nome, descricao, duracao_min, preco, categoria, ordem, ativo)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(novo, s.nome, s.descricao || null, Number(s.duracao_min) || 30, Number(s.preco) || 0,
         s.categoria || null, Number(s.ordem) || 0, s.ativo === undefined ? 1 : (s.ativo ? 1 : 0));
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
    db.prepare('UPDATE profissionais SET nome=?, apelido=?, telefone=?, cor=?, ativo=? WHERE id=?')
      .run(p.nome, p.apelido || null, p.telefone || null, p.cor || '#6c5ce7', p.ativo ? 1 : 0, pid);
  } else {
    db.prepare('INSERT INTO profissionais (id, nome, apelido, telefone, cor, ativo) VALUES (?,?,?,?,?,?)')
      .run(pid, p.nome, p.apelido || null, p.telefone || null, p.cor || '#6c5ce7',
           p.ativo === undefined ? 1 : (p.ativo ? 1 : 0));
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
    (id, codigo, cliente_id, servico_id, profissional_id, data, hora_inicio, hora_fim, preco, status, origem, observacao)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(aid, codigo, a.cliente_id, a.servico_id, a.profissional_id || null, a.data,
         a.hora_inicio, a.hora_fim, Number(a.preco) || 0, a.status || 'confirmado',
         a.origem || 'site', a.observacao || null);
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
  const permitidos = ['data', 'hora_inicio', 'hora_fim', 'status', 'observacao', 'profissional_id', 'servico_id', 'preco'];
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
