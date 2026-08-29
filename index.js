// Servidor HTTP. Duas portas de entrada:
//   /        -> Portal do Cliente (aberto, sem senha)
//   /admin   -> Painel do Dono (protegido por senha)
import http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, timingSafeEqual } from 'crypto';

import * as bd from './db.js';
import * as ag from './agenda.js';
import * as ia from './ia.js';
import * as msg from './mensagens.js';
import * as tema from './tema.js';
import * as cal from './calendario.js';
import { conversar, saudacaoInicial } from './assistente.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(__dirname, 'public');
const PORTA = Number(process.env.PORT) || 3000;
const SENHA = process.env.ADMIN_SENHA || 'admin123';

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const TOKEN_ADM = sha(`adm:${SENHA}`);

/* ------------------------------------------------------------ UTILITARIOS */

function cookie(req, nome) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const ehAdmin = (req) => {
  const t = cookie(req, 'jarvis_adm');
  return Boolean(t && igual(t, TOKEN_ADM));
};

/** Sessao do cliente: telefone assinado, para nao precisar digitar de novo. */
function assinarCliente(telefone) {
  const tel = bd.normalizarTelefone(telefone);
  return `${tel}.${sha(`cli:${tel}:${SENHA}`).slice(0, 24)}`;
}

function clienteDaSessao(req) {
  const t = cookie(req, 'jarvis_cli');
  if (!t || !t.includes('.')) return null;
  const [tel, assin] = t.split('.');
  if (!igual(assin, sha(`cli:${tel}:${SENHA}`).slice(0, 24))) return null;
  return bd.buscarClientePorTelefone(tel);
}

function corpo(req, limite = 1_000_000) {
  return new Promise((resolve, reject) => {
    let d = '', tam = 0;
    req.on('data', c => {
      tam += c.length;
      if (tam > limite) { reject(new Error('corpo grande demais')); req.destroy(); return; }
      d += c;
    });
    req.on('end', () => {
      if (!d) return resolve({});
      try { resolve(JSON.parse(d)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, dados, status = 200) {
  const corpoStr = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpoStr),
    'Cache-Control': 'no-store'
  });
  res.end(corpoStr);
}

const erro = (res, mensagem, status = 400) => json(res, { erro: mensagem }, status);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

/** Devolve uma imagem guardada como data URI no banco. */
function imagemDoBanco(res, dataUri, versao) {
  const m = /^data:([\w./+-]+);base64,(.+)$/s.exec(String(dataUri || ''));
  if (!m) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Sem imagem');
  }
  const corpoImg = Buffer.from(m[2], 'base64');
  res.writeHead(200, {
    'Content-Type': m[1],
    'Content-Length': corpoImg.length,
    'Cache-Control': 'public, max-age=60',
    'ETag': `"${versao || 0}"`
  });
  res.end(corpoImg);
}

function texto(res, conteudo, tipo, extras = {}) {
  const buf = Buffer.from(conteudo, 'utf8');
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': buf.length, ...extras });
  res.end(buf);
}

function estatico(res, arquivo, cache = false) {
  if (!existsSync(arquivo) || !statSync(arquivo).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Pagina nao encontrada');
  }
  const ext = path.extname(arquivo).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TIPOS[ext] || 'application/octet-stream',
    'Cache-Control': cache ? 'public, max-age=300' : 'no-cache'
  });
  res.end(readFileSync(arquivo));
}

/* -------------------------------------------------------------- ROTEAMENTO */

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rota = url.pathname.replace(/\/+$/, '') || '/';
  const met = req.method;
  const q = url.searchParams;

  try {
    /* ---------------------------------------------------------- PAGINAS */

    if (met === 'GET' && (rota === '/' || rota === '/agendar')) {
      return estatico(res, path.join(PUBLICO, 'cliente.html'));
    }
    if (met === 'GET' && rota.startsWith('/avaliar/')) {
      // Link enviado no WhatsApp: abre o portal ja com a janela de avaliacao
      return estatico(res, path.join(PUBLICO, 'cliente.html'));
    }
    if (met === 'GET' && rota === '/admin') {
      return ehAdmin(req)
        ? estatico(res, path.join(PUBLICO, 'admin.html'))
        : estatico(res, path.join(PUBLICO, 'login.html'));
    }
    if (met === 'GET' && rota === '/login') {
      return estatico(res, path.join(PUBLICO, 'login.html'));
    }
    if (met === 'GET' && (rota.startsWith('/css/') || rota.startsWith('/js/') || rota.startsWith('/img/'))) {
      const seguro = path.normalize(path.join(PUBLICO, rota));
      if (!seguro.startsWith(PUBLICO)) return erro(res, 'caminho invalido', 403);
      return estatico(res, seguro, true);
    }
    /* Folha de estilo gerada a partir dos Ajustes: personaliza as duas telas */
    if (met === 'GET' && rota === '/tema.css') {
      return texto(res, tema.gerarCss(), 'text/css; charset=utf-8', { 'Cache-Control': 'no-cache' });
    }
    if (met === 'GET' && (rota === '/logo' || rota === '/capa')) {
      const n = bd.lerNegocio();
      return imagemDoBanco(res, rota === '/logo' ? n.logo : n.capa, n.atualizado_em);
    }

    /* Feed privado para o dono assinar no Google, Apple ou Outlook */
    if (met === 'GET' && (rota === '/agenda.ics' || /^\/agenda\/[\w-]+\.ics$/.test(rota))) {
      const n = bd.lerNegocio();
      const tok = q.get('token');
      if (!n.feed_token || !tok || !igual(tok, n.feed_token)) {
        return erro(res, 'Link do calendario invalido ou revogado.', 403);
      }
      const profId = rota === '/agenda.ics' ? null : rota.slice('/agenda/'.length, -4);
      const prof = profId ? bd.buscarProfissional(profId) : null;
      if (profId && !prof) return erro(res, 'Profissional nao encontrado.', 404);

      const hoje = ag.hojeLocal();
      const lista = bd.listarAgendamentos({
        de: ag.somarDias(hoje, -60),
        ate: ag.somarDias(hoje, (n.antecedencia_max_d || 60) + 30),
        profissional_id: profId,
        limite: 2000
      }).filter(a => a.status !== 'cancelado');

      return texto(res,
        cal.gerarIcs(lista, n, prof ? `${n.nome} — ${prof.nome}` : n.nome),
        'text/calendar; charset=utf-8',
        { 'Cache-Control': 'no-cache', 'Content-Disposition': 'inline; filename="agenda.ics"' });
    }

    /* Um agendamento avulso, para o cliente salvar no celular */
    if (met === 'GET' && rota === '/agendamento.ics') {
      const a = bd.buscarAgendamentoPorCodigo(q.get('codigo'));
      if (!a) return erro(res, 'Agendamento nao encontrado.', 404);
      return texto(res, cal.gerarIcs([a]), 'text/calendar; charset=utf-8',
        { 'Content-Disposition': `attachment; filename="${a.codigo}.ics"` });
    }

    if (met === 'GET' && rota === '/saude') {
      return json(res, { ok: true, ia: ia.iaAtiva(), whatsapp: msg.whatsappAtivo(), hoje: ag.hojeLocal() });
    }

    /* ------------------------------------------------------------ LOGIN */

    if (met === 'POST' && rota === '/api/login') {
      const { senha } = await corpo(req);
      if (!senha || !igual(sha(`adm:${senha}`), TOKEN_ADM)) {
        await new Promise(r => setTimeout(r, 600)); // desacelera tentativas
        return erro(res, 'Senha incorreta.', 401);
      }
      res.setHeader('Set-Cookie',
        `jarvis_adm=${TOKEN_ADM}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
      return json(res, { ok: true });
    }

    if (met === 'POST' && rota === '/api/logout') {
      res.setHeader('Set-Cookie', 'jarvis_adm=; Path=/; HttpOnly; Max-Age=0');
      return json(res, { ok: true });
    }

    /* --------------------------------------------------- API DO CLIENTE */

    if (met === 'GET' && rota === '/api/negocio') {
      const n = bd.lerNegocio();
      const grade = bd.listarHorarios(null).map(h => ({ dia: h.dia_semana, abre: h.abre, fecha: h.fecha }));
      return json(res, {
        nome: n.nome, sobre: n.sobre, endereco: n.endereco, telefone: n.telefone,
        whatsapp: n.whatsapp, instagram: n.instagram, cor: n.cor, segmento: n.segmento,
        boas_vindas: n.boas_vindas, cancelamento_min_h: n.cancelamento_min_h,
        titulo_portal: n.titulo_portal, rodape: n.rodape, politica: n.politica,
        mostrar_precos: n.mostrar_precos, mostrar_equipe: n.mostrar_equipe,
        tem_logo: Boolean(n.logo), tem_capa: Boolean(n.capa),
        fonte_url: tema.urlDaFonte(n.fonte), versao: n.atualizado_em,
        horarios: grade
      });
    }

    if (met === 'GET' && rota === '/api/servicos') {
      return json(res, bd.listarServicos());
    }

    if (met === 'GET' && rota === '/api/profissionais') {
      const servico = q.get('servico');
      return json(res, servico ? bd.profissionaisDoServico(servico) : bd.listarProfissionais());
    }

    if (met === 'GET' && rota === '/api/horarios-livres') {
      const data = q.get('data'), servico = q.get('servico');
      if (!data || !servico) return erro(res, 'Informe data e servico.');
      return json(res, ag.slotsLivres(data, servico, q.get('profissional') || null));
    }

    if (met === 'GET' && rota === '/api/dias-com-vaga') {
      const servico = q.get('servico');
      if (!servico) return erro(res, 'Informe o servico.');
      const hoje = ag.hojeLocal();
      const [anoP, mesP] = (q.get('mes') || hoje.slice(0, 7)).split('-').map(Number);
      return json(res, ag.mapaDoMes(anoP, mesP, servico, q.get('profissional') || null));
    }

    if (met === 'POST' && rota === '/api/agendar') {
      const d = await corpo(req);
      try {
        const agendamento = ag.agendar({ ...d, origem: d.origem === 'chat' ? 'chat' : 'site' });
        msg.notificarAgendamento(agendamento);
        res.setHeader('Set-Cookie',
          `jarvis_cli=${assinarCliente(agendamento.cliente_telefone)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`);
        return json(res, { ok: true, agendamento });
      } catch (e) {
        return erro(res, e.message, e.codigo === 'ocupado' ? 409 : 400);
      }
    }

    if (met === 'POST' && rota === '/api/consultar') {
      const { telefone } = await corpo(req);
      const cliente = telefone && bd.buscarClientePorTelefone(telefone);
      if (!cliente) return json(res, { cliente: null, agendamentos: [] });
      res.setHeader('Set-Cookie',
        `jarvis_cli=${assinarCliente(cliente.telefone)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`);
      return json(res, {
        cliente: { nome: cliente.nome, telefone: cliente.telefone },
        agendamentos: bd.agendamentosDoCliente(cliente.id)
      });
    }

    if (met === 'GET' && rota === '/api/sessao') {
      const cliente = clienteDaSessao(req);
      if (!cliente) return json(res, { cliente: null, agendamentos: [] });
      return json(res, {
        cliente: { nome: cliente.nome, telefone: cliente.telefone },
        agendamentos: bd.agendamentosDoCliente(cliente.id)
      });
    }

    if (met === 'POST' && rota === '/api/sair') {
      res.setHeader('Set-Cookie', 'jarvis_cli=; Path=/; Max-Age=0');
      return json(res, { ok: true });
    }

    if (met === 'POST' && rota === '/api/cancelar') {
      const { codigo, telefone } = await corpo(req);
      const a = bd.buscarAgendamentoPorCodigo(codigo);
      if (!a) return erro(res, 'Agendamento nao encontrado.', 404);
      const sessao = clienteDaSessao(req);
      const autorizado = (sessao && sessao.id === a.cliente_id) ||
        (telefone && bd.normalizarTelefone(telefone) === a.cliente_telefone);
      if (!autorizado) return erro(res, 'Confirme seu telefone para cancelar.', 403);
      try {
        ag.cancelar(a.id, 'cliente');
        msg.notificarCancelamento(a);
        return json(res, { ok: true });
      } catch (e) {
        return erro(res, e.message, 400);
      }
    }

    if (met === 'GET' && rota === '/api/agendamento') {
      const a = bd.buscarAgendamentoPorCodigo(q.get('codigo'));
      if (!a) return erro(res, 'Agendamento nao encontrado.', 404);
      const avaliacao = bd.avaliacaoDoAgendamento(a.id);
      return json(res, {
        codigo: a.codigo, servico_nome: a.servico_nome, profissional_nome: a.profissional_nome,
        data: a.data, hora_inicio: a.hora_inicio, status: a.status,
        cliente_nome: a.cliente_nome, ja_avaliado: Boolean(avaliacao),
        link_google: cal.linkGoogle(a)
      });
    }

    if (met === 'POST' && rota === '/api/avaliar') {
      const { codigo, nota, comentario } = await corpo(req);
      const n = Number(nota);
      if (!(n >= 1 && n <= 5)) return erro(res, 'A nota precisa ser de 1 a 5.');
      const a = codigo ? bd.buscarAgendamentoPorCodigo(codigo) : null;
      if (codigo && !a) return erro(res, 'Agendamento nao encontrado.', 404);
      if (a && bd.avaliacaoDoAgendamento(a.id)) return erro(res, 'Este atendimento ja foi avaliado. Obrigado!', 409);
      bd.criarAvaliacao({
        agendamento_id: a?.id || null, cliente_id: a?.cliente_id || null,
        nota: n, comentario: (comentario || '').slice(0, 1000), canal: 'portal'
      });
      return json(res, { ok: true });
    }

    /* ---------------------------------------------------------- CHAT IA */

    if (met === 'GET' && rota === '/api/chat/inicio') {
      const cliente = clienteDaSessao(req);
      const conversa = bd.abrirConversa({
        telefone: cliente?.telefone || null,
        nome: cliente?.nome || null,
        cliente_id: cliente?.id || null,
        canal: 'portal'
      });
      const saudacao = saudacaoInicial();
      const historico = bd.historicoConversa(conversa.id, 30);
      if (!historico.length) bd.gravarMensagem(conversa.id, 'ia', saudacao.texto, { opcoes: saudacao.opcoes });
      return json(res, {
        conversa_id: conversa.id,
        cliente: cliente ? { nome: cliente.nome, telefone: cliente.telefone } : null,
        mensagens: historico.length
          ? historico.map(m => ({ autor: m.autor, texto: m.texto, opcoes: parseMeta(m.meta) }))
          : [{ autor: 'ia', texto: saudacao.texto, opcoes: saudacao.opcoes }]
      });
    }

    if (met === 'POST' && rota === '/api/chat') {
      const { conversa_id, texto } = await corpo(req);
      if (!texto || !String(texto).trim()) return erro(res, 'Mensagem vazia.');
      if (String(texto).length > 1000) return erro(res, 'Mensagem muito longa.');
      const cliente = clienteDaSessao(req);
      let conversa = conversa_id && bd.buscarConversa(conversa_id);
      if (!conversa) {
        conversa = bd.abrirConversa({
          telefone: cliente?.telefone || null, nome: cliente?.nome || null,
          cliente_id: cliente?.id || null, canal: 'portal'
        });
      }
      const r = await conversar(conversa.id, String(texto).trim(), {
        telefone: cliente?.telefone, nome: cliente?.nome
      });
      if (r.acao === 'agendado' && r.agendamento) {
        res.setHeader('Set-Cookie',
          `jarvis_cli=${assinarCliente(r.agendamento.cliente_telefone)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`);
      }
      return json(res, { ...r, conversa_id: conversa.id });
    }

    /* ----------------------------------------------------- API DO PAINEL */

    if (rota.startsWith('/api/admin')) {
      if (!ehAdmin(req)) return erro(res, 'Faca login para continuar.', 401);
      return await rotasAdmin(req, res, rota, met, q);
    }

    return erro(res, 'Rota nao encontrada.', 404);
  } catch (e) {
    console.error('[erro]', met, rota, e);
    return erro(res, 'Erro interno. Tente novamente.', 500);
  }
});

function parseMeta(meta) {
  if (!meta) return [];
  try { return JSON.parse(meta).opcoes || []; } catch { return []; }
}

/* ------------------------------------------------------------ ROTAS ADMIN */

async function rotasAdmin(req, res, rota, met, q) {
  const sub = rota.replace('/api/admin', '') || '/';
  const partes = sub.split('/').filter(Boolean);

  /* Painel */
  if (met === 'GET' && sub === '/painel') {
    const hoje = ag.hojeLocal();
    return json(res, {
      hoje,
      hora: ag.horaLocal(),
      indicadores: bd.indicadores(hoje),
      agenda_hoje: bd.listarAgendamentos({ de: hoje, ate: hoje }),
      proximos: bd.listarAgendamentos({ de: ag.somarDias(hoje, 1), ate: ag.somarDias(hoje, 7), status: 'confirmado', limite: 30 }),
      serie: bd.serieAgendamentos(13, hoje),
      ranking: bd.rankingServicos(hoje.slice(0, 8) + '01'),
      avaliacoes_pendentes: bd.listarAvaliacoes({ status: 'pendente', limite: 5 }),
      integracoes: { ia: ia.iaAtiva(), whatsapp: msg.whatsappAtivo() }
    });
  }

  /* Aparencia: catalogo de opcoes para montar a tela */
  if (met === 'GET' && sub === '/aparencia') {
    return json(res, { ...tema.opcoesDeAparencia(), negocio: bd.lerNegocio() });
  }

  /* Logo e capa: chegam como data URI do navegador */
  if (met === 'POST' && sub === '/imagem') {
    const { campo, dados } = await corpo(req, 6_000_000);
    if (!['logo', 'capa'].includes(campo)) return erro(res, 'Campo invalido.');
    if (dados && !/^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,/.test(dados)) {
      return erro(res, 'Envie uma imagem PNG, JPG, WEBP ou SVG.');
    }
    const limite = campo === 'logo' ? 400_000 : 1_200_000;
    if (dados && dados.length > limite) {
      return erro(res, `Imagem grande demais. Limite de ${Math.round(limite / 1000)} KB depois da codificacao.`);
    }
    return json(res, { ok: true, negocio: bd.salvarNegocio({ [campo]: dados || null }) });
  }

  /* Calendario: feeds de saida e de entrada */
  if (met === 'GET' && sub === '/calendario') {
    const st = cal.statusCalendario();
    const base = process.env.URL_PUBLICA || `http://${req.headers.host}`;
    return json(res, {
      ...st,
      feed_negocio: `${base}/agenda.ics?token=${st.feed_token}`,
      feeds_equipe: st.profissionais.map(p => ({
        ...p, feed: `${base}/agenda/${p.id}.ics?token=${st.feed_token}`
      }))
    });
  }
  if (met === 'POST' && sub === '/calendario/sincronizar') {
    const d = await corpo(req);
    if (d.profissional_id !== undefined || d.url !== undefined) {
      const r = await cal.sincronizarUm(d.profissional_id || null, d.url ?? null);
      return json(res, r, r.ok ? 200 : 400);
    }
    return json(res, { resultados: await cal.sincronizarTudo() });
  }
  if (met === 'POST' && sub === '/calendario/renovar-token') {
    return json(res, { feed_token: bd.renovarFeedToken() });
  }

  /* Negocio */
  if (sub === '/negocio') {
    if (met === 'GET') return json(res, bd.lerNegocio());
    if (met === 'POST') return json(res, bd.salvarNegocio(await corpo(req)));
  }

  /* Servicos */
  if (sub === '/servicos') {
    if (met === 'GET') return json(res, bd.listarServicos(true));
    if (met === 'POST') {
      const d = await corpo(req);
      if (!d.nome) return erro(res, 'O servico precisa de um nome.');
      return json(res, bd.salvarServico(d));
    }
  }
  if (met === 'DELETE' && partes[0] === 'servicos' && partes[1]) {
    return json(res, bd.removerServico(partes[1]));
  }

  /* Profissionais */
  if (sub === '/profissionais') {
    if (met === 'GET') return json(res, bd.listarProfissionais(true));
    if (met === 'POST') {
      const d = await corpo(req);
      if (!d.nome) return erro(res, 'O profissional precisa de um nome.');
      return json(res, bd.salvarProfissional(d));
    }
  }
  if (met === 'DELETE' && partes[0] === 'profissionais' && partes[1]) {
    return json(res, bd.removerProfissional(partes[1]));
  }

  /* Horarios */
  if (sub === '/horarios') {
    if (met === 'GET') {
      return json(res, {
        negocio: bd.listarHorarios(null),
        equipe: Object.fromEntries(bd.listarProfissionais(true).map(p => [p.id, bd.listarHorarios(p.id)]))
      });
    }
    if (met === 'POST') {
      const { profissional_id, faixas } = await corpo(req);
      if (!Array.isArray(faixas)) return erro(res, 'Envie a lista de faixas.');
      return json(res, bd.definirHorarios(profissional_id || null, faixas));
    }
  }

  /* Bloqueios */
  if (sub === '/bloqueios') {
    if (met === 'GET') return json(res, bd.listarBloqueios());
    if (met === 'POST') {
      const d = await corpo(req);
      if (!d.data_inicio) return erro(res, 'Informe a data.');
      return json(res, bd.salvarBloqueio(d));
    }
  }
  if (met === 'DELETE' && partes[0] === 'bloqueios' && partes[1]) {
    return json(res, bd.removerBloqueio(partes[1]));
  }

  /* Agenda */
  if (met === 'GET' && sub === '/agenda') {
    const hoje = ag.hojeLocal();
    return json(res, bd.listarAgendamentos({
      de: q.get('de') || hoje,
      ate: q.get('ate') || ag.somarDias(q.get('de') || hoje, 30),
      status: q.get('status') || null,
      profissional_id: q.get('profissional') || null
    }));
  }

  if (met === 'GET' && sub === '/horarios-livres') {
    const data = q.get('data'), servico = q.get('servico');
    if (!data || !servico) return erro(res, 'Informe data e servico.');
    return json(res, ag.slotsLivres(data, servico, q.get('profissional') || null));
  }

  if (met === 'POST' && sub === '/agendamentos') {
    const d = await corpo(req);
    try {
      const a = ag.agendar({ ...d, origem: 'admin' });
      if (d.avisar !== false) msg.notificarAgendamento(a);
      return json(res, { ok: true, agendamento: a });
    } catch (e) {
      return erro(res, e.message, e.codigo === 'ocupado' ? 409 : 400);
    }
  }

  if (partes[0] === 'agendamentos' && partes[1]) {
    const aid = partes[1];
    const alvo = bd.buscarAgendamento(aid);
    if (!alvo) return erro(res, 'Agendamento nao encontrado.', 404);

    if (met === 'GET') return json(res, alvo);

    if (met === 'PATCH') {
      const d = await corpo(req);
      if (d.data && d.hora) {
        try {
          const a = ag.remarcar(aid, d.data, d.hora, d.profissional_id || null);
          msg.notificarRemarcacao(a);
          return json(res, { ok: true, agendamento: a });
        } catch (e) {
          return erro(res, e.message, 409);
        }
      }
      const a = bd.atualizarAgendamento(aid, d);
      if (d.status === 'cancelado') msg.notificarCancelamento(a);
      return json(res, { ok: true, agendamento: a });
    }
    if (met === 'DELETE') {
      const a = ag.cancelar(aid, 'admin');
      msg.notificarCancelamento(a);
      return json(res, { ok: true });
    }
  }

  /* Clientes */
  if (met === 'GET' && sub === '/clientes') {
    return json(res, bd.listarClientes(q.get('busca') || ''));
  }
  if (met === 'GET' && partes[0] === 'clientes' && partes[1]) {
    const c = bd.buscarCliente(partes[1]);
    if (!c) return erro(res, 'Cliente nao encontrado.', 404);
    return json(res, { ...c, agendamentos: bd.agendamentosDoCliente(c.id) });
  }
  if (met === 'POST' && partes[0] === 'clientes' && partes[1] && partes[2] === 'notas') {
    const { notas } = await corpo(req);
    return json(res, bd.atualizarNotasCliente(partes[1], notas));
  }

  /* Avaliacoes */
  if (met === 'GET' && sub === '/avaliacoes') {
    return json(res, bd.listarAvaliacoes({ status: q.get('status') || null }));
  }
  if (met === 'POST' && partes[0] === 'avaliacoes' && partes[1] === 'gerar-resposta') {
    const { id: avid } = await corpo(req);
    const av = bd.buscarAvaliacao(avid);
    if (!av) return erro(res, 'Avaliacao nao encontrada.', 404);
    const texto = await ia.respostaParaAvaliacao(av);
    bd.responderAvaliacao(avid, texto, 'rascunho');
    return json(res, { texto, gerado_por_ia: ia.iaAtiva() });
  }
  if (met === 'POST' && partes[0] === 'avaliacoes' && partes[1] && partes[2] === 'responder') {
    const { resposta, status } = await corpo(req);
    return json(res, bd.responderAvaliacao(partes[1], resposta, status || 'publicada'));
  }

  /* Conversas */
  if (met === 'GET' && sub === '/conversas') {
    return json(res, bd.listarConversas());
  }
  if (met === 'GET' && partes[0] === 'conversas' && partes[1]) {
    const c = bd.buscarConversa(partes[1]);
    if (!c) return erro(res, 'Conversa nao encontrada.', 404);
    return json(res, {
      ...c,
      mensagens: bd.historicoConversa(partes[1], 200)
        .map(m => ({ ...m, opcoes: parseMeta(m.meta) }))
    });
  }
  if (met === 'POST' && partes[0] === 'conversas' && partes[1] && partes[2] === 'responder') {
    const { texto } = await corpo(req);
    if (!texto) return erro(res, 'Escreva a mensagem.');
    bd.gravarMensagem(partes[1], 'humano', texto);
    const c = bd.buscarConversa(partes[1]);
    if (c?.telefone) {
      bd.enfileirar({ telefone: c.telefone, nome: c.nome, tipo: 'atendimento', texto });
    }
    return json(res, { ok: true });
  }

  /* Central de mensagens */
  if (met === 'GET' && sub === '/mensagens') {
    const lista = bd.listarOutbox({ status: q.get('status') || null });
    return json(res, lista.map(m => ({ ...m, link: msg.linkWhatsApp(m.telefone, m.texto) })));
  }
  if (met === 'POST' && partes[0] === 'mensagens' && partes[1] && partes[2] === 'enviada') {
    bd.marcarOutbox(partes[1], 'enviado');
    return json(res, { ok: true });
  }
  if (met === 'POST' && sub === '/mensagens/processar') {
    return json(res, await msg.processarFila());
  }

  return erro(res, 'Rota administrativa nao encontrada.', 404);
}

/* ------------------------------------------------------- TAREFAS DE FUNDO */

let ultimoFechamento = '';
let ultimaSincronia = 0;
const INTERVALO_SINCRONIA = 15 * 60 * 1000;

async function tarefas() {
  try {
    await msg.processarFila();
    const hoje = ag.hojeLocal();
    if (ultimoFechamento !== hoje) {
      ultimoFechamento = hoje;
      const n = ag.fecharDiasAnteriores();
      if (n) console.log(`[tarefas] ${n} atendimento(s) de dias anteriores marcados como concluidos`);
    }
    if (Date.now() - ultimaSincronia > INTERVALO_SINCRONIA) {
      ultimaSincronia = Date.now();
      const r = await cal.sincronizarTudo();
      const total = r.reduce((s, x) => s + (x.eventos || 0), 0);
      if (r.length) console.log(`[calendario] ${r.length} feed(s), ${total} compromisso(s) importado(s)`);
    }
  } catch (e) {
    console.error('[tarefas]', e.message);
  }
}

servidor.listen(PORTA, () => {
  const n = bd.lerNegocio();
  console.log(`
  Jarvis  ·  agenda para negocios locais

  Negocio ......... ${n.nome}
  Portal cliente .. http://localhost:${PORTA}/
  Painel do dono .. http://localhost:${PORTA}/admin
  Atendimento ..... ${ia.iaAtiva() ? 'Groq conectado' : 'modo local, sem GROQ_API_KEY'}
  WhatsApp ........ ${msg.whatsappAtivo() ? 'Cloud API conectada' : 'envio manual pelo painel'}
`);
  tarefas();
  setInterval(tarefas, 60_000);
});

process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
process.on('SIGINT', () => servidor.close(() => process.exit(0)));
