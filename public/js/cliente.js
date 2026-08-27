/* Portal do cliente — agendamento em 4 toques, assistente e meus horários */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const api = async (rota, opcoes = {}) => {
  const r = await fetch(rota, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Não foi possível concluir. Tente de novo.');
  return dados;
};

let recadoTimer;
function recado(texto, tipo = '') {
  const el = $('#recado');
  el.textContent = texto;
  el.className = `ver ${tipo}`;
  clearTimeout(recadoTimer);
  recadoTimer = setTimeout(() => el.className = tipo, 3600);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const dinheiro = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const soData = d => { const [a, m, dd] = d.split('-').map(Number); return new Date(a, m - 1, dd); };
const extenso = d => { const x = soData(d); return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}`; };
const curta = d => { const x = soData(d); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`; };

function mascaraTelefone(v) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

const ICONES = {
  cabelo: '✂️', barba: '🪒', combo: '💈', estetica: '✨',
  quimica: '🎨', unha: '💅', massagem: '💆', consulta: '🩺', padrao: '📋'
};

/* ------------------------------------------------------------- ESTADO */

const estado = {
  negocio: null,
  servicos: [],
  servico: null,
  profissional: null,
  data: null,
  hora: null,
  mesVisivel: null,
  passo: 1,
  conversaId: null,
  cliente: null,
  avaliando: null,
  notaEscolhida: 0
};

/* --------------------------------------------------------------- ABAS */

$$('.aba').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.aba)));

function trocarAba(nome) {
  $$('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === `painel-${nome}`));
  if (nome === 'assistente' && !estado.conversaId) iniciarChat();
  if (nome === 'meus') carregarSessao();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------- ETAPAS */

function irPara(n) {
  estado.passo = n;
  $$('.etapa').forEach(e => e.classList.toggle('ativa', Number(e.dataset.etapa) === n));
  $$('.passo').forEach(p => {
    const i = Number(p.dataset.passo);
    p.classList.toggle('atual', i === n);
    p.classList.toggle('feito', i < n);
  });
  $('#trilha').hidden = n === 5;
  $('.palco').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$$('.voltar').forEach(b => b.addEventListener('click', () => irPara(Number(b.dataset.voltar))));

/* ----------------------------------------------------------- 1. INICIO */

async function iniciar() {
  try {
    const [negocio, servicos] = await Promise.all([api('/api/negocio'), api('/api/servicos')]);
    estado.negocio = negocio;
    estado.servicos = servicos;

    document.title = `${negocio.nome} · Agendar horário`;
    $('#nomeNegocio').textContent = negocio.nome;
    $('#subNegocio').textContent = negocio.sobre || negocio.endereco || '';
    $('#rodapeNegocio').textContent = [negocio.endereco, negocio.telefone].filter(Boolean).join(' · ');
    if (negocio.cor) document.documentElement.style.setProperty('--marca', negocio.cor);

    if (negocio.endereco) {
      const l = $('#linkMapa');
      l.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.endereco)}`;
      l.hidden = false;
    }
    if (negocio.whatsapp) {
      const l = $('#linkZap');
      l.href = `https://wa.me/55${negocio.whatsapp.replace(/\D/g, '')}`;
      l.hidden = false;
    }
    desenharServicos();
    carregarSessao();
    conferirLinkDeAvaliacao();
  } catch (e) {
    $('#listaServicos').innerHTML = `<div class="aviso">${e.message}</div>`;
  }
}

function desenharServicos() {
  const alvo = $('#listaServicos');
  if (!estado.servicos.length) {
    alvo.innerHTML = `<div class="vazio"><span class="icone">📋</span>Nenhum serviço disponível no momento.</div>`;
    return;
  }
  alvo.innerHTML = estado.servicos.map(s => `
    <button class="item-servico" data-id="${s.id}">
      <span class="icone-servico">${ICONES[s.categoria] || ICONES.padrao}</span>
      <span class="info">
        <strong>${escapar(s.nome)}</strong>
        <small>${escapar(s.descricao || `${s.duracao_min} minutos`)}</small>
      </span>
      <span class="preco"><b>${dinheiro(s.preco)}</b><small>${s.duracao_min} min</small></span>
    </button>`).join('');

  $$('.item-servico', alvo).forEach(b => b.addEventListener('click', () => escolherServico(b.dataset.id)));
}

/* ----------------------------------------------------- 2. PROFISSIONAL */

async function escolherServico(id) {
  estado.servico = estado.servicos.find(s => s.id === id);
  estado.profissional = null;
  estado.data = null;
  estado.hora = null;

  const equipe = await api(`/api/profissionais?servico=${id}`);
  if (equipe.length <= 1) {
    estado.profissional = equipe[0] || null;
    return abrirCalendario();
  }
  $('#listaProfissionais').innerHTML = [
    ...equipe.map(p => `
      <button class="item-prof" data-id="${p.id}">
        <span class="inicial" style="background:${p.cor || 'var(--marca)'}">${iniciais(p.nome)}</span>
        <strong>${escapar(p.apelido || p.nome.split(' ')[0])}</strong>
        <small>${escapar(p.nome)}</small>
      </button>`),
    `<button class="item-prof" data-id="">
       <span class="inicial" style="background:var(--apagado)">?</span>
       <strong>Tanto faz</strong><small>Mais horários livres</small>
     </button>`
  ].join('');

  $$('#listaProfissionais .item-prof').forEach(b => b.addEventListener('click', () => {
    estado.profissional = equipe.find(p => p.id === b.dataset.id) || null;
    abrirCalendario();
  }));
  irPara(2);
}

const iniciais = n => n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/* ------------------------------------------------------- 3. CALENDARIO */

async function abrirCalendario() {
  irPara(3);
  $('#blocoHorarios').hidden = true;
  const hoje = new Date();
  estado.mesVisivel = estado.mesVisivel || { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  await desenharCalendario();
}

async function desenharCalendario() {
  const { ano, mes } = estado.mesVisivel;
  const grade = $('#gradeDias');
  grade.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:22px"><span class="carregando"></span></div>`;
  const nomeMes = MESES[mes - 1];
  $('#rotuloMes').textContent = `${nomeMes[0].toUpperCase()}${nomeMes.slice(1)} de ${ano}`;

  const hoje = new Date();
  const mesAtual = hoje.getFullYear() * 12 + hoje.getMonth();
  $('#mesAnterior').disabled = (ano * 12 + mes - 1) <= mesAtual;

  const params = new URLSearchParams({ servico: estado.servico.id, mes: `${ano}-${String(mes).padStart(2, '0')}` });
  if (estado.profissional) params.set('profissional', estado.profissional.id);

  let dias = [];
  try { dias = await api(`/api/dias-com-vaga?${params}`); }
  catch { grade.innerHTML = `<div class="aviso" style="grid-column:1/-1">Não foi possível carregar o calendário.</div>`; return; }

  const primeiroDow = new Date(ano, mes - 1, 1).getDay();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  grade.innerHTML =
    Array.from({ length: primeiroDow }, () => `<span class="dia oculto"></span>`).join('') +
    dias.map(d => {
      const num = Number(d.data.slice(-2));
      const livre = d.vagas > 0;
      return `<button class="dia ${d.data === hojeStr ? 'hoje' : ''} ${d.data === estado.data ? 'escolhido' : ''}"
                 data-data="${d.data}" ${livre ? '' : 'disabled'}
                 title="${livre ? `${d.vagas} horários livres` : 'Sem vaga'}">
                ${num}${livre ? '<i class="ponto"></i>' : ''}
              </button>`;
    }).join('');

  $$('.dia[data-data]', grade).forEach(b => b.addEventListener('click', () => escolherData(b.dataset.data)));
}

$('#mesAnterior').addEventListener('click', () => { mudarMes(-1); });
$('#mesSeguinte').addEventListener('click', () => { mudarMes(1); });

function mudarMes(delta) {
  let { ano, mes } = estado.mesVisivel;
  mes += delta;
  if (mes < 1) { mes = 12; ano--; }
  if (mes > 12) { mes = 1; ano++; }
  estado.mesVisivel = { ano, mes };
  desenharCalendario();
}

async function escolherData(data) {
  estado.data = data;
  estado.hora = null;
  $$('.dia[data-data]').forEach(b => b.classList.toggle('escolhido', b.dataset.data === data));

  const bloco = $('#blocoHorarios');
  bloco.hidden = false;
  $('#tituloHorarios').textContent = `Horários para ${extenso(data)}`;
  $('#periodos').innerHTML = `<div style="text-align:center;padding:22px"><span class="carregando"></span></div>`;
  bloco.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const params = new URLSearchParams({ data, servico: estado.servico.id });
  if (estado.profissional) params.set('profissional', estado.profissional.id);

  let slots = [];
  try { slots = await api(`/api/horarios-livres?${params}`); }
  catch { $('#periodos').innerHTML = `<div class="aviso">Erro ao buscar horários.</div>`; return; }

  if (!slots.length) {
    $('#periodos').innerHTML = `<div class="vazio"><span class="icone">😕</span>Sem horários livres nesse dia. Escolha outro no calendário.</div>`;
    return;
  }

  const grupos = { manhã: [], tarde: [], noite: [] };
  for (const s of slots) {
    const h = Number(s.hora.slice(0, 2));
    grupos[h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite'].push(s);
  }

  $('#periodos').innerHTML = Object.entries(grupos)
    .filter(([, lista]) => lista.length)
    .map(([nome, lista]) => `
      <div class="periodo">
        <h4>${nome.toUpperCase()} · ${lista.length} ${lista.length === 1 ? 'horário' : 'horários'}</h4>
        <div class="grade-horas">
          ${lista.map(s => `<button class="hora" data-hora="${s.hora}" data-prof="${s.profissionais[0]?.id || ''}">${s.hora}</button>`).join('')}
        </div>
      </div>`).join('');

  $$('.hora').forEach(b => b.addEventListener('click', () => {
    estado.hora = b.dataset.hora;
    if (!estado.profissional && b.dataset.prof) {
      estado.profissional = { id: b.dataset.prof, nome: slots.find(s => s.hora === b.dataset.hora)?.profissionais[0]?.nome };
    }
    montarResumo();
    irPara(4);
  }));
}

/* ------------------------------------------------------------ 4. DADOS */

function montarResumo() {
  $('#resumoReserva').innerHTML = `
    <div class="linha"><span>Serviço</span><strong>${escapar(estado.servico.nome)}</strong></div>
    <div class="linha"><span>Quando</span><strong>${extenso(estado.data)}, ${estado.hora}</strong></div>
    ${estado.profissional?.nome ? `<div class="linha"><span>Com</span><strong>${escapar(estado.profissional.nome)}</strong></div>` : ''}
    <div class="linha"><span>Duração</span><strong>${estado.servico.duracao_min} min</strong></div>
    <div class="linha total"><span>Valor</span><strong>${dinheiro(estado.servico.preco)}</strong></div>`;

  if (estado.cliente) {
    $('#cNome').value = estado.cliente.nome || '';
    $('#cTel').value = mascaraTelefone(estado.cliente.telefone || '');
  }
}

$('#cTel').addEventListener('input', e => e.target.value = mascaraTelefone(e.target.value));
$('#telConsulta').addEventListener('input', e => e.target.value = mascaraTelefone(e.target.value));

$('#formReserva').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#btnConfirmar');
  btn.disabled = true;
  btn.innerHTML = '<span class="carregando"></span> Confirmando…';

  try {
    const { agendamento } = await api('/api/agendar', {
      method: 'POST',
      corpo: {
        nome: $('#cNome').value.trim(),
        telefone: $('#cTel').value,
        servico_id: estado.servico.id,
        profissional_id: estado.profissional?.id || null,
        data: estado.data,
        hora: estado.hora,
        observacao: $('#cObs').value.trim() || null
      }
    });
    mostrarBilhete(agendamento);
    estado.cliente = { nome: agendamento.cliente_nome, telefone: agendamento.cliente_telefone };
    irPara(5);
  } catch (erro) {
    recado(erro.message, 'erro');
    if (/ocupad|acabou/i.test(erro.message)) { estado.hora = null; irPara(3); escolherData(estado.data); }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar agendamento';
  }
});

function mostrarBilhete(a) {
  $('#bilhete').innerHTML = `
    <div class="linha"><span>Serviço</span><strong>${escapar(a.servico_nome)}</strong></div>
    <div class="linha"><span>Data</span><strong>${extenso(a.data)}</strong></div>
    <div class="linha"><span>Horário</span><strong>${a.hora_inicio}</strong></div>
    ${a.profissional_nome ? `<div class="linha"><span>Com</span><strong>${escapar(a.profissional_nome)}</strong></div>` : ''}
    <div class="linha"><span>Valor</span><strong>${dinheiro(a.preco)}</strong></div>
    <div class="codigo"><small>Código do agendamento</small><br><b>${a.codigo}</b></div>`;
}

$('#btnAgendarOutro').addEventListener('click', () => {
  estado.servico = estado.profissional = estado.data = estado.hora = null;
  $('#formReserva').reset();
  $('#blocoHorarios').hidden = true;
  irPara(1);
});
$('#btnVerMeus').addEventListener('click', () => trocarAba('meus'));

/* ------------------------------------------------------ MEUS HORARIOS */

async function carregarSessao() {
  try {
    const r = await api('/api/sessao');
    if (r.cliente) { estado.cliente = r.cliente; mostrarMeus(r); }
  } catch { /* sem sessao, tudo bem */ }
}

$('#formConsulta').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const r = await api('/api/consultar', { method: 'POST', corpo: { telefone: $('#telConsulta').value } });
    if (!r.cliente) return recado('Não encontramos agendamentos para esse número.', 'erro');
    estado.cliente = r.cliente;
    mostrarMeus(r);
  } catch (erro) { recado(erro.message, 'erro'); }
});

function mostrarMeus({ cliente, agendamentos }) {
  $('#buscaMeus').hidden = true;
  const hoje = new Date().toISOString().slice(0, 10);
  const futuros = agendamentos.filter(a => a.data >= hoje && ['confirmado', 'pendente'].includes(a.status));
  const passados = agendamentos.filter(a => !futuros.includes(a));

  $('#resultadoMeus').innerHTML = `
    <div class="identificado">
      <div><strong>Olá, ${escapar(cliente.nome.split(' ')[0])}!</strong>
        <small>${mascaraTelefone(cliente.telefone)}</small></div>
      <button class="botao fantasma pequeno" id="btnTrocarCliente">Não sou eu</button>
    </div>

    <h2 style="margin-bottom:12px">Próximos horários</h2>
    ${futuros.length ? futuros.map(cartaoReserva).join('')
      : `<div class="vazio"><span class="icone">📭</span>Você não tem horários marcados.
           <br><button class="botao pequeno" style="margin-top:14px" onclick="document.querySelector('[data-aba=agendar]').click()">Marcar agora</button></div>`}

    ${passados.length ? `<h2 style="margin:26px 0 12px">Histórico</h2>${passados.slice(0, 8).map(cartaoReserva).join('')}` : ''}`;

  $('#btnTrocarCliente').addEventListener('click', async () => {
    await fetch('/api/sair', { method: 'POST' });
    estado.cliente = null;
    $('#buscaMeus').hidden = false;
    $('#resultadoMeus').innerHTML = '';
    $('#telConsulta').value = '';
  });

  $$('[data-cancelar]').forEach(b => b.addEventListener('click', () => cancelarReserva(b.dataset.cancelar)));
  $$('[data-avaliar]').forEach(b => b.addEventListener('click', () => abrirAvaliacao(b.dataset.avaliar, b.dataset.servico)));
}

const SELOS = {
  confirmado: ['verde', 'Confirmado'], pendente: ['ambar', 'Pendente'],
  concluido: ['cinza', 'Concluído'], cancelado: ['vermelho', 'Cancelado'],
  faltou: ['vermelho', 'Não compareceu']
};

function cartaoReserva(a) {
  const hoje = new Date().toISOString().slice(0, 10);
  const futuro = a.data >= hoje && ['confirmado', 'pendente'].includes(a.status);
  const [cor, rotulo] = SELOS[a.status] || ['cinza', a.status];
  return `
    <div class="reserva ${futuro ? '' : 'passada'}">
      <div class="reserva-topo">
        <div>
          <strong>${escapar(a.servico_nome)}</strong>
          <div class="quando">${extenso(a.data)} · ${a.hora_inicio}</div>
          <div class="detalhe">${a.profissional_nome ? `com ${escapar(a.profissional_nome)} · ` : ''}${dinheiro(a.preco)} · código ${a.codigo}</div>
        </div>
        <span class="selo ${cor}">${rotulo}</span>
      </div>
      <div class="reserva-acoes">
        ${futuro ? `<button class="botao neutro pequeno" data-cancelar="${a.codigo}">Cancelar</button>` : ''}
        ${a.status === 'concluido' ? `<button class="botao fantasma pequeno" data-avaliar="${a.codigo}" data-servico="${escapar(a.servico_nome)}">⭐ Avaliar</button>` : ''}
      </div>
    </div>`;
}

async function cancelarReserva(codigo) {
  if (!confirm('Tem certeza que quer cancelar este horário?')) return;
  try {
    await api('/api/cancelar', { method: 'POST', corpo: { codigo, telefone: estado.cliente?.telefone } });
    recado('Horário cancelado.', 'ok');
    const r = await api('/api/sessao');
    if (r.cliente) mostrarMeus(r);
  } catch (e) { recado(e.message, 'erro'); }
}

/* -------------------------------------------------------- AVALIACAO */

function abrirAvaliacao(codigo, servico) {
  estado.avaliando = codigo;
  estado.notaEscolhida = 0;
  $('#avaliarSub').textContent = servico ? `Sobre o seu ${servico}` : '';
  $('#avComentario').value = '';
  $('#btnEnviarAvaliacao').disabled = true;
  $('#escolhaEstrelas').innerHTML = [1, 2, 3, 4, 5]
    .map(n => `<button data-nota="${n}" aria-label="${n} estrelas">⭐</button>`).join('');
  $$('#escolhaEstrelas button').forEach(b => b.addEventListener('click', () => {
    estado.notaEscolhida = Number(b.dataset.nota);
    $$('#escolhaEstrelas button').forEach(x => x.classList.toggle('ativa', Number(x.dataset.nota) <= estado.notaEscolhida));
    $('#btnEnviarAvaliacao').disabled = false;
  }));
  $('#modalAvaliar').classList.add('ver');
}

$$('#modalAvaliar [data-fechar]').forEach(b => b.addEventListener('click', () => $('#modalAvaliar').classList.remove('ver')));

$('#btnEnviarAvaliacao').addEventListener('click', async () => {
  try {
    await api('/api/avaliar', {
      method: 'POST',
      corpo: { codigo: estado.avaliando, nota: estado.notaEscolhida, comentario: $('#avComentario').value.trim() }
    });
    $('#modalAvaliar').classList.remove('ver');
    recado('Obrigado pela avaliação! 💜', 'ok');
  } catch (e) { recado(e.message, 'erro'); }
});

function conferirLinkDeAvaliacao() {
  const m = location.pathname.match(/^\/avaliar\/([A-Z0-9]{6})$/i);
  if (!m) return;
  trocarAba('meus');
  abrirAvaliacao(m[1].toUpperCase(), '');
}

/* -------------------------------------------------------------- CHAT */

async function iniciarChat() {
  try {
    const r = await api('/api/chat/inicio');
    estado.conversaId = r.conversa_id;
    if (r.cliente) estado.cliente = r.cliente;
    $('#chatMensagens').innerHTML = '';
    r.mensagens.forEach(m => desenharBalao(m.autor, m.texto));
    mostrarOpcoes(r.mensagens[r.mensagens.length - 1]?.opcoes || []);
  } catch {
    $('#chatMensagens').innerHTML = `<div class="aviso">Não foi possível abrir o assistente.</div>`;
  }
}

function desenharBalao(autor, texto) {
  const div = document.createElement('div');
  div.className = `balao ${autor}`;
  div.textContent = texto;
  $('#chatMensagens').append(div);
  $('#chatMensagens').scrollTop = $('#chatMensagens').scrollHeight;
}

function mostrarOpcoes(opcoes) {
  const alvo = $('#chatOpcoes');
  alvo.innerHTML = (opcoes || []).map(o => o.tipo === 'link'
    ? `<a class="chip" href="${o.url}" target="_blank" rel="noopener">${o.rotulo}</a>`
    : `<button class="chip" data-valor="${escapar(o.valor)}">${o.rotulo}</button>`).join('');
  $$('.chip[data-valor]', alvo).forEach(b => b.addEventListener('click', () => enviarChat(b.dataset.valor)));
}

$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#chatTexto').value.trim();
  if (t) { $('#chatTexto').value = ''; enviarChat(t); }
});

let enviando = false;
async function enviarChat(texto) {
  if (enviando) return;
  enviando = true;
  desenharBalao('cliente', texto);
  mostrarOpcoes([]);

  const espera = document.createElement('div');
  espera.className = 'balao ia digitando';
  espera.innerHTML = '<i></i><i></i><i></i>';
  $('#chatMensagens').append(espera);
  $('#chatMensagens').scrollTop = $('#chatMensagens').scrollHeight;

  try {
    const r = await api('/api/chat', { method: 'POST', corpo: { conversa_id: estado.conversaId, texto } });
    espera.remove();
    estado.conversaId = r.conversa_id;
    desenharBalao('ia', r.texto);
    mostrarOpcoes(r.opcoes);
    if (r.acao === 'agendado') recado('Agendamento confirmado! 🎉', 'ok');
    if (r.acao === 'cancelado') recado('Horário cancelado.', 'ok');
  } catch (e) {
    espera.remove();
    desenharBalao('ia', 'Ops, tive um problema aqui. Pode repetir?');
    recado(e.message, 'erro');
  } finally {
    enviando = false;
  }
}

function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

iniciar();
