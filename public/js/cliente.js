/* Portal do cliente — agendamento em 4 passos, atendimento e meus horários */

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

const vazio = (icone, texto, extra = '') => `
  <div class="vazio">
    <span class="icone-vazio">${ICONE[icone](26)}</span>${texto}
    ${extra ? `<div style="margin-top:14px">${extra}</div>` : ''}
  </div>`;

function mascaraTelefone(v) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

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
  if (nome === 'conversar' && !estado.conversaId) iniciarChat();
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

    const titulo = negocio.titulo_portal || negocio.nome;
    document.title = `${titulo} · Agendar horário`;
    $('#nomeNegocio').textContent = titulo;
    $('#subNegocio').textContent = negocio.sobre || negocio.endereco || '';
    $('#rodapeNegocio').textContent =
      negocio.rodape || [negocio.endereco, negocio.telefone].filter(Boolean).join(' · ');
    $('#politicaNegocio').textContent = negocio.politica || '';

    // A fonte escolhida entra depois da primeira pintura, sem travar nada
    if (negocio.fonte_url) $('#fonteWeb').href = negocio.fonte_url;

    if (negocio.tem_logo) {
      const img = $('#logoNegocio');
      img.src = `/logo?v=${negocio.versao || 0}`;
      img.alt = titulo;
      img.hidden = false;
    }
    if (negocio.tem_capa) {
      const capa = $('#capaNegocio');
      capa.style.backgroundImage = `url('/capa?v=${negocio.versao || 0}')`;
      capa.hidden = false;
    }

    if (negocio.endereco) {
      const l = $('#linkMapa');
      l.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.endereco)}`;
      l.innerHTML = `${ICONE.mapa(15)} Como chegar`;
      l.hidden = false;
    }
    if (negocio.whatsapp) {
      const l = $('#linkZap');
      l.href = `https://wa.me/55${negocio.whatsapp.replace(/\D/g, '')}`;
      l.innerHTML = `${ICONE.telefone(15)} WhatsApp`;
      l.hidden = false;
    }
    if (negocio.instagram) {
      const l = $('#linkInsta');
      const perfil = negocio.instagram.replace(/^@/, '');
      l.href = `https://instagram.com/${perfil}`;
      l.innerHTML = `${ICONE.imagem(15)} ${escapar(negocio.instagram)}`;
      l.hidden = false;
    }
    $('#mesAnterior').innerHTML = ICONE.esquerda(17);
    $('#mesSeguinte').innerHTML = ICONE.direita(17);
    $('#btnEnviarChat').innerHTML = ICONE.enviar(17);
    $('#marcaSucesso').innerHTML = ICONE.check(20);
    $$('[data-fechar]').forEach(b => { if (!b.textContent.trim()) b.innerHTML = ICONE.fechar(18); });
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
    alvo.innerHTML = vazio('vazio', 'Nenhum serviço disponível no momento.');
    return;
  }
  const comPreco = estado.negocio?.mostrar_precos !== 0;
  alvo.innerHTML = estado.servicos.map(s => `
    <button class="item-servico" data-id="${s.id}">
      <span class="info">
        <strong>${escapar(s.nome)}</strong>
        <small>${escapar(s.descricao || `${s.duracao_min} minutos`)}</small>
      </span>
      <span class="preco">
        <b>${comPreco ? dinheiro(s.preco) : 'Sob consulta'}</b>
        <small>${s.duracao_min} min</small>
      </span>
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
  if (equipe.length <= 1 || estado.negocio?.mostrar_equipe === 0) {
    estado.profissional = equipe.length === 1 ? equipe[0] : null;
    return abrirCalendario();
  }
  $('#listaProfissionais').innerHTML = [
    ...equipe.map(p => `
      <button class="item-prof" data-id="${p.id}">
        <span class="inicial" style="background:${p.cor || 'var(--acento)'}">${iniciais(p.nome)}</span>
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

async function desenharCalendario(pulosRestantes = 2) {
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

  // Mês inteiro sem vaga (serviço longo, profissional de folga): pula para o próximo
  if (pulosRestantes > 0 && dias.every(d => d.vagas === 0)) {
    mudarMes(1, pulosRestantes - 1);
    return;
  }

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

  const semVaga = dias.every(d => d.vagas === 0);
  $('.legenda-calendario').textContent = semVaga
    ? 'Nenhum horário livre neste mês. Use a seta para ver o próximo.'
    : '';
  if (!semVaga) $('.legenda-calendario').innerHTML = '<i class="ponto"></i> dias com horário livre';
}

// Navegação manual não pula meses vazios: o cliente pediu para ver aquele mês
$('#btnEsperaGeral').addEventListener('click', () => {
  if (!estado.servico) return recado('Escolha o serviço primeiro.', 'erro');
  abrirModalEspera(estado.data || hojeISO());
});

$('#mesAnterior').addEventListener('click', () => mudarMes(-1, 0));
$('#mesSeguinte').addEventListener('click', () => mudarMes(1, 0));

function mudarMes(delta, pulosRestantes = 2) {
  let { ano, mes } = estado.mesVisivel;
  mes += delta;
  if (mes < 1) { mes = 12; ano--; }
  if (mes > 12) { mes = 1; ano++; }
  estado.mesVisivel = { ano, mes };
  desenharCalendario(pulosRestantes);
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
    $('#periodos').innerHTML = `
      ${vazio('calendario', 'Sem horários livres nesse dia.')}
      <div class="oferta-espera">
        <strong>Quer que a gente te avise?</strong>
        <p>Entramos em contato assim que alguém desmarcar nesse período — por ordem de chegada.</p>
        <button class="botao" id="btnEntrarEspera">Entrar na lista de espera</button>
      </div>`;
    $('#btnEntrarEspera').addEventListener('click', () => abrirModalEspera(data));
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
    ${estado.negocio?.mostrar_precos !== 0
      ? `<div class="linha total"><span>Valor</span><strong>${dinheiro(estado.servico.preco)}</strong></div>` : ''}`;

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
    ${estado.negocio?.mostrar_precos !== 0
      ? `<div class="linha"><span>Valor</span><strong>${dinheiro(a.preco)}</strong></div>` : ''}
    <div class="codigo"><small>Código do agendamento</small><br><b>${a.codigo}</b></div>`;

  // Salvar no calendário do próprio cliente
  $('#calendarioAcoes').innerHTML = `
    <span class="titulo-secao" style="margin:0 0 8px">Salvar no seu calendário</span>
    <div class="botoes-linha">
      <a class="botao neutro pequeno" id="linkGoogleCal" target="_blank" rel="noopener">Google Agenda</a>
      <a class="botao neutro pequeno" href="/agendamento.ics?codigo=${a.codigo}" download>Baixar (.ics)</a>
    </div>`;
  api(`/api/agendamento?codigo=${a.codigo}`)
    .then(d => {
      if (d.link_google) $('#linkGoogleCal').href = d.link_google;
      if (d.cobranca && !d.cobranca.pago) {
        $('#tituloSucesso').textContent = 'Horário reservado';
        const sub = $('#subSucesso');
        sub.textContent = 'Ele fica guardado assim que o sinal cair.';
        sub.hidden = false;
        $('#bilhete').insertAdjacentHTML('afterend', blocoPix(d.cobranca));
        ligarCopiaPix();
      }
    })
    .catch(() => $('#linkGoogleCal')?.remove());
}

$('#btnAgendarOutro').addEventListener('click', () => {
  $('#tituloSucesso').textContent = 'Horário confirmado';
  $('#subSucesso').hidden = true;
  $('.bloco-pix')?.remove();
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

function mostrarMeus({ cliente, agendamentos, espera = [], fidelidade = null }) {
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

    ${fidelidade ? `
      <div class="cartao-fidelidade">
        <div>
          <strong>Cartão fidelidade</strong>
          <small>${fidelidade.premios_disponiveis
            ? `Você já tem ${fidelidade.premios_disponiveis} ${fidelidade.premio} para usar!`
            : `Faltam ${fidelidade.faltam} para ganhar ${escapar(fidelidade.premio)}`}</small>
        </div>
        <div class="selos-fidelidade">
          ${Array.from({ length: fidelidade.meta }, (_, i) =>
            `<i class="${i < fidelidade.feitos ? 'cheio' : ''}"></i>`).join('')}
        </div>
      </div>` : ''}

    ${espera.length ? `
      <p class="titulo-secao">Na lista de espera</p>
      ${espera.map(e => `
        <div class="reserva">
          <div class="reserva-topo">
            <div>
              <strong>${escapar(e.servico_nome)}</strong>
              <div class="quando">${extenso(e.data_de)} a ${extenso(e.data_ate)}</div>
              <div class="detalhe">${e.status === 'avisado'
                ? `Abriu vaga em ${extenso(e.vaga_data)} às ${e.vaga_hora} — corre!`
                : 'Avisamos assim que abrir uma vaga'}</div>
            </div>
            <span class="selo ${e.status === 'avisado' ? 'verde' : 'ambar'}">
              ${e.status === 'avisado' ? 'Vaga aberta' : 'Aguardando'}</span>
          </div>
          <div class="reserva-acoes">
            <button class="botao neutro pequeno" data-sair-espera="${e.id}">Sair da lista</button>
          </div>
        </div>`).join('')}` : ''}

    <p class="titulo-secao">Próximos horários</p>
    ${futuros.length ? futuros.map(cartaoReserva).join('')
      : vazio('vazio', 'Você não tem horários marcados.',
              '<button class="botao pequeno" data-ir-agendar>Marcar agora</button>')}

    ${passados.length ? `<p class="titulo-secao">Histórico</p>${passados.slice(0, 8).map(cartaoReserva).join('')}` : ''}`;

  $('#btnTrocarCliente').addEventListener('click', async () => {
    await fetch('/api/sair', { method: 'POST' });
    estado.cliente = null;
    $('#buscaMeus').hidden = false;
    $('#resultadoMeus').innerHTML = '';
    $('#telConsulta').value = '';
  });

  $('#resultadoMeus').insertAdjacentHTML('beforeend', `
    <details class="privacidade">
      <summary>Meus dados e privacidade</summary>
      <p>Guardamos seu nome, telefone e histórico de atendimentos para poder te
         atender. Você pode levar tudo embora ou apagar quando quiser.</p>
      <div class="botoes-linha">
        <a class="botao neutro pequeno" href="/api/meus-dados" download>Baixar meus dados</a>
        <button class="botao neutro pequeno" id="btnApagarDados">Apagar meus dados</button>
      </div>
    </details>`);

  $('#btnApagarDados')?.addEventListener('click', async () => {
    if (!confirm('Isso apaga seu nome e telefone do sistema e não dá para desfazer. Continuar?')) return;
    await api('/api/meus-dados/excluir', { method: 'POST' });
    estado.cliente = null;
    $('#buscaMeus').hidden = false;
    $('#resultadoMeus').innerHTML = '';
    recado('Seus dados foram apagados.', 'ok');
  });

  $$('[data-ir-agendar]').forEach(b => b.addEventListener('click', () => trocarAba('agendar')));
  $$('[data-sair-espera]').forEach(b => b.addEventListener('click', async () => {
    await api('/api/espera/sair', { method: 'POST', corpo: { id: b.dataset.sairEspera } });
    recado('Removido da lista.', 'ok');
    carregarSessao();
  }));
  $$('[data-confirmar]').forEach(b => b.addEventListener('click', () => abrirConfirmacao(b.dataset.confirmar)));
  $$('[data-cancelar]').forEach(b => b.addEventListener('click', () => cancelarReserva(b.dataset.cancelar)));
  $$('[data-avaliar]').forEach(b => b.addEventListener('click', () => abrirAvaliacao(b.dataset.avaliar, b.dataset.servico)));
}

const SELOS = {
  confirmado: ['verde', 'Confirmado'], pendente: ['ambar', 'Aguardando sinal'],
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
          <div class="detalhe">${a.profissional_nome ? `com ${escapar(a.profissional_nome)} · ` : ''}${estado.negocio?.mostrar_precos !== 0 ? dinheiro(a.preco) + ' · ' : ''}código ${a.codigo}</div>
        </div>
        <span class="selo ${cor}">${rotulo}</span>
      </div>
      <div class="reserva-acoes">
        ${futuro ? `<button class="botao ${a.sinal > 0 && !a.sinal_pago ? '' : 'neutro'} pequeno" data-confirmar="${a.codigo}">
            ${a.sinal > 0 && !a.sinal_pago ? 'Pagar sinal' : (a.confirmado_em ? 'Ver detalhes' : 'Confirmar presença')}
          </button>` : ''}
        ${futuro ? `<a class="botao neutro pequeno" href="/agendamento.ics?codigo=${a.codigo}" download>Salvar no calendário</a>` : ''}
        ${futuro ? `<button class="botao neutro pequeno" data-cancelar="${a.codigo}">Cancelar</button>` : ''}
        ${a.status === 'concluido' ? `<button class="botao neutro pequeno" data-avaliar="${a.codigo}" data-servico="${escapar(a.servico_nome)}">Avaliar</button>` : ''}
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
  $('#escolhaEstrelas').innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button data-nota="${n}" aria-label="${n} de 5">
       <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
         <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8z"/>
       </svg>
     </button>`).join('');
  $$('#escolhaEstrelas button').forEach(b => b.addEventListener('click', () => {
    estado.notaEscolhida = Number(b.dataset.nota);
    $$('#escolhaEstrelas button').forEach(x => x.classList.toggle('ativa', Number(x.dataset.nota) <= estado.notaEscolhida));
    $('#btnEnviarAvaliacao').disabled = false;
  }));
  $('#modalAvaliar').classList.add('ver');
}

$$('#modalAvaliar [data-fechar]').forEach(b => b.addEventListener('click', () => $('#modalAvaliar').classList.remove('ver')));
$$('[data-fechar-espera]').forEach(b => b.addEventListener('click', () => $('#modalEspera').classList.remove('ver')));
$$('[data-fechar-confirmar]').forEach(b => b.addEventListener('click', () => $('#modalConfirmar').classList.remove('ver')));

$('#btnEnviarAvaliacao').addEventListener('click', async () => {
  try {
    await api('/api/avaliar', {
      method: 'POST',
      corpo: { codigo: estado.avaliando, nota: estado.notaEscolhida, comentario: $('#avComentario').value.trim() }
    });
    $('#modalAvaliar').classList.remove('ver');
    recado('Obrigado pela avaliação.', 'ok');
  } catch (e) { recado(e.message, 'erro'); }
});

function conferirLinkDeAvaliacao() {
  const avaliar = location.pathname.match(/^\/avaliar\/([A-Z0-9]{6})$/i);
  if (avaliar) {
    trocarAba('meus');
    return abrirAvaliacao(avaliar[1].toUpperCase(), '');
  }
  const confirmar = location.pathname.match(/^\/confirmar\/([A-Z0-9]{6})$/i);
  if (confirmar) abrirConfirmacao(confirmar[1].toUpperCase());
}

/* --------------------------------------------------- LISTA DE ESPERA */

function abrirModalEspera(dataAlvo) {
  const fim = somarDiasISO(dataAlvo, 14);
  $('#modalEsperaCorpo').innerHTML = `
    <p class="legenda">
      ${escapar(estado.servico.nome)} · a partir de ${extenso(dataAlvo)}
    </p>
    <div class="campo">
      <label for="eNome">Seu nome</label>
      <input id="eNome" type="text" value="${escapar(estado.cliente?.nome || '')}" placeholder="Como podemos te chamar?">
    </div>
    <div class="campo">
      <label for="eTel">WhatsApp com DDD</label>
      <input id="eTel" type="tel" value="${estado.cliente ? mascaraTelefone(estado.cliente.telefone) : ''}"
             placeholder="(11) 98765-4321" inputmode="numeric">
    </div>
    <div class="campo">
      <label>Até quando você pode esperar</label>
      <input id="eAte" type="date" value="${fim}" min="${dataAlvo}">
    </div>
    <div class="campo">
      <label>Melhores períodos <span class="opcional">opcional</span></label>
      <div class="periodos-escolha">
        ${[['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']].map(([v, r]) =>
          `<label class="marcador-periodo"><input type="checkbox" value="${v}" class="periodo-espera"> ${r}</label>`).join('')}
      </div>
    </div>`;
  $('#eTel').addEventListener('input', e => e.target.value = mascaraTelefone(e.target.value));
  $('#modalEspera').classList.add('ver');
  $('#btnConfirmarEspera').onclick = () => enviarEspera(dataAlvo);
}

async function enviarEspera(dataAlvo) {
  const btn = $('#btnConfirmarEspera');
  btn.disabled = true;
  try {
    await api('/api/espera', { method: 'POST', corpo: {
      nome: $('#eNome').value.trim(),
      telefone: $('#eTel').value,
      servico_id: estado.servico.id,
      profissional_id: estado.profissional?.id || null,
      data_de: dataAlvo,
      data_ate: $('#eAte').value || somarDiasISO(dataAlvo, 14),
      periodos: $$('.periodo-espera:checked').map(c => c.value)
    } });
    $('#modalEspera').classList.remove('ver');
    recado('Pronto! Avisamos assim que abrir vaga.', 'ok');
  } catch (e) {
    recado(e.message, 'erro');
  } finally {
    btn.disabled = false;
  }
}

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const somarDiasISO = (data, n) => {
  const d = soData(data);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ----------------------------------------------------- CONFIRMAR / PIX */

async function abrirConfirmacao(codigo) {
  trocarAba('meus');
  try {
    const a = await api(`/api/agendamento?codigo=${codigo}`);
    const cobrar = a.cobranca && !a.cobranca.pago;

    $('#modalConfirmarCorpo').innerHTML = `
      <div class="bilhete" style="margin:0 0 16px">
        <div class="linha"><span>Serviço</span><strong>${escapar(a.servico_nome)}</strong></div>
        <div class="linha"><span>Quando</span><strong>${extenso(a.data)}, ${a.hora_inicio}</strong></div>
        ${a.profissional_nome ? `<div class="linha"><span>Com</span><strong>${escapar(a.profissional_nome)}</strong></div>` : ''}
      </div>
      ${cobrar ? blocoPix(a.cobranca) : ''}
      ${a.confirmado ? '<div class="aviso ok">Presença já confirmada. Até lá!</div>' : ''}`;

    $('#btnConfirmarPresenca').hidden = Boolean(a.confirmado);
    $('#btnConfirmarPresenca').onclick = async () => {
      try {
        await api('/api/confirmar', { method: 'POST', corpo: { codigo } });
        $('#modalConfirmar').classList.remove('ver');
        recado('Presença confirmada. Obrigado!', 'ok');
        carregarSessao();
      } catch (e) { recado(e.message, 'erro'); }
    };
    $('#modalConfirmar').classList.add('ver');
    ligarCopiaPix();
  } catch (e) {
    recado(e.message, 'erro');
  }
}

const blocoPix = (c) => `
  <div class="bloco-pix">
    <strong>Falta o sinal de ${dinheiro(c.valor)}</strong>
    <p>Copie o código abaixo e cole no seu banco, na opção PIX copia e cola.</p>
    <code class="codigo-pix" id="codigoPix">${escapar(c.codigo)}</code>
    <button class="botao bloco" data-copiar-pix="${escapar(c.codigo)}">Copiar código PIX</button>
  </div>`;

function ligarCopiaPix() {
  $$('[data-copiar-pix]').forEach(b => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copiarPix);
      recado('Código copiado. Cole no app do seu banco.', 'ok');
    } catch {
      const el = $('#codigoPix');
      if (el) { const r = document.createRange(); r.selectNode(el); getSelection().removeAllRanges(); getSelection().addRange(r); }
      recado('Selecione e copie o código.', 'erro');
    }
  }));
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
    $('#chatMensagens').innerHTML = `<div class="aviso">Não foi possível abrir o atendimento.</div>`;
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
    if (r.acao === 'agendado') recado('Agendamento confirmado.', 'ok');
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
