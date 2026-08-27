/* Painel do dono — tudo que o negócio precisa administrar em um só lugar */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function api(rota, opcoes = {}) {
  const r = await fetch(rota, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
  });
  if (r.status === 401) { location.href = '/login'; throw new Error('Sessão expirada'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Não foi possível concluir a ação.');
  return d;
}

let recadoTimer;
function recado(texto, tipo = 'ok') {
  const el = $('#recado');
  el.textContent = texto;
  el.className = `ver ${tipo}`;
  clearTimeout(recadoTimer);
  recadoTimer = setTimeout(() => el.className = tipo, 3400);
}

const escapar = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const dinheiro = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const soData = d => { const [a, m, dd] = String(d).split('-').map(Number); return new Date(a, m - 1, dd); };
const extenso = d => { const x = soData(d); return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}`; };
const curta = d => { const x = soData(d); return `${DIAS_CURTO[x.getDay()]} ${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`; };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const somarDias = (data, n) => { const d = soData(data); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const telFmt = t => { const n = String(t || '').replace(/\D/g, '');
  return n.length === 11 ? `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
       : n.length === 10 ? `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}` : t; };
const maiuscula = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
const estrelas = n => `<span class="estrelas">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
const desde = ts => {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
};

const SELOS = {
  confirmado: ['verde', 'Confirmado'], pendente: ['ambar', 'Pendente'],
  concluido: ['cinza', 'Concluído'], cancelado: ['vermelho', 'Cancelado'],
  faltou: ['vermelho', 'Faltou']
};
const selo = st => { const [c, r] = SELOS[st] || ['cinza', st]; return `<span class="selo ${c}">${r}</span>`; };

const vazio = (icone, texto, extra = '') =>
  `<div class="vazio"><span class="icone">${icone}</span>${texto}${extra ? `<div style="margin-top:14px">${extra}</div>` : ''}</div>`;

/* ---------------------------------------------------------------- MODAL */

function abrirModal(titulo, corpo, botoes = []) {
  $('#modalTitulo').textContent = titulo;
  $('#modalCorpo').innerHTML = corpo;
  $('#modalRodape').innerHTML = botoes
    .map((b, i) => `<button class="botao ${b.classe || ''}" data-acao="${i}">${b.rotulo}</button>`).join('');
  $$('#modalRodape button').forEach((el, i) => el.addEventListener('click', () => botoes[i].aoClicar?.()));
  $('#modal').classList.add('ver');
}
const fecharModal = () => $('#modal').classList.remove('ver');
$('#modalFechar').addEventListener('click', fecharModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

/* ------------------------------------------------------------- NAVEGAÇÃO */

const TITULOS = {
  painel: 'Painel', agenda: 'Agenda', conversas: 'Conversas', mensagens: 'Central de mensagens',
  clientes: 'Clientes', avaliacoes: 'Avaliações', servicos: 'Serviços', equipe: 'Equipe',
  horarios: 'Horários de atendimento', ajustes: 'Ajustes do negócio'
};

const cache = { servicos: [], equipe: [], negocio: null };

$$('.menu-item[data-tela]').forEach(b => b.addEventListener('click', () => abrirTela(b.dataset.tela)));

async function abrirTela(nome) {
  $$('.menu-item[data-tela]').forEach(b => b.classList.toggle('ativo', b.dataset.tela === nome));
  $$('.tela').forEach(t => t.classList.toggle('ativa', t.id === `tela-${nome}`));
  $('#tituloTela').textContent = TITULOS[nome] || nome;
  $('#barraAcoes').innerHTML = '';
  $('#lateral').classList.remove('aberta');
  $('#sombraLateral').classList.remove('ver');
  location.hash = nome;
  const alvo = $(`#tela-${nome}`);
  alvo.innerHTML = `<div style="text-align:center;padding:60px"><span class="carregando"></span></div>`;
  try { await TELAS[nome](alvo); }
  catch (e) { alvo.innerHTML = `<div class="aviso">${escapar(e.message)}</div>`; }
}

$('#abrirMenu').addEventListener('click', () => {
  $('#lateral').classList.add('aberta');
  $('#sombraLateral').classList.add('ver');
});
$('#sombraLateral').addEventListener('click', () => {
  $('#lateral').classList.remove('aberta');
  $('#sombraLateral').classList.remove('ver');
});
$('#btnSair').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login';
});

/* ================================================================ PAINEL */

const TELAS = {};

TELAS.painel = async (alvo) => {
  const d = await api('/api/admin/painel');
  const i = d.indicadores;

  alvo.innerHTML = `
    <div class="resumo-ia" id="resumoIA">
      <div class="brilho">✨</div>
      <div><strong>Resumo do dia</strong><p>Carregando…</p></div>
    </div>

    <div class="indicadores">
      ${cartaoIndicador('Hoje', i.hoje, `${i.proximos_7_dias} nos próximos 7 dias`, '')}
      ${cartaoIndicador('Receita do mês', dinheiro(i.receita_mes), `${dinheiro(i.receita_prevista)} previstos`, 'verde')}
      ${cartaoIndicador('Nota média', i.nota_media || '—', `${i.total_avaliacoes} avaliações`, i.nota_media >= 4 ? 'verde' : 'ambar')}
      ${cartaoIndicador('Agendado pela IA', `${i.taxa_ia}%`, `${i.agendados_pela_ia} de ${i.total_mes} no mês`, '')}
      ${cartaoIndicador('Clientes novos', i.clientes_novos_mes, 'neste mês', '')}
      ${cartaoIndicador('Faltas e cancelamentos', i.faltas_mes + i.cancelados_mes, `${i.faltas_mes} faltas · ${i.cancelados_mes} cancelados`, (i.faltas_mes + i.cancelados_mes) > 6 ? 'vermelho' : 'ambar')}
    </div>

    ${(!d.integracoes.ia || !d.integracoes.whatsapp) ? `
      <div class="aviso info" style="margin-bottom:20px">
        <strong>Você pode turbinar o assistente.</strong>
        ${!d.integracoes.ia ? ' Configure <code>GROQ_API_KEY</code> para respostas ainda mais naturais.' : ''}
        ${!d.integracoes.whatsapp ? ' Configure <code>WHATSAPP_TOKEN</code> para o envio automático — por enquanto as mensagens ficam na Central de Mensagens.' : ''}
      </div>` : ''}

    <div class="paineis">
      <div>
        <div class="bloco">
          <div class="bloco-topo">
            <h3>Agenda de hoje</h3>
            <button class="botao pequeno" id="btnNovoAgendamento">+ Encaixar</button>
          </div>
          <div class="bloco-corpo sem-espaco">
            ${d.agenda_hoje.length
              ? d.agenda_hoje.map(linhaAgenda).join('')
              : vazio('☕', 'Nenhum atendimento hoje.')}
          </div>
        </div>

        <div class="bloco" style="margin-top:16px">
          <div class="bloco-topo"><h3>Movimento dos últimos 14 dias</h3></div>
          <div class="bloco-corpo">
            ${grafico(d.serie)}
            <div class="legenda-grafico">
              <span><i style="background:var(--marca-suave)"></i>Total</span>
              <span><i style="background:var(--marca)"></i>Marcados pelo assistente</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="bloco">
          <div class="bloco-topo"><h3>Próximos dias</h3></div>
          <div class="bloco-corpo sem-espaco">
            ${d.proximos.length
              ? d.proximos.slice(0, 8).map(a => `
                  <div class="linha-lista">
                    <span class="horario" style="min-width:62px;font-size:.78rem">${curta(a.data)}</span>
                    <div class="principal">
                      <strong>${escapar(a.servico_nome)}</strong>
                      <small>${a.hora_inicio} · ${escapar(a.cliente_nome)}</small>
                    </div>
                  </div>`).join('')
              : vazio('📭', 'Agenda livre pela frente.')}
          </div>
        </div>

        <div class="bloco" style="margin-top:16px">
          <div class="bloco-topo">
            <h3>Serviços do mês</h3>
          </div>
          <div class="bloco-corpo sem-espaco">
            ${d.ranking.length ? d.ranking.map(r => `
              <div class="linha-lista">
                <div class="principal">
                  <strong>${escapar(r.nome)}</strong>
                  <small>${r.total} atendimento${r.total > 1 ? 's' : ''}</small>
                </div>
                <div class="fim"><strong>${dinheiro(r.receita)}</strong></div>
              </div>`).join('') : vazio('📊', 'Sem dados ainda.')}
          </div>
        </div>

        ${d.avaliacoes_pendentes.length ? `
          <div class="bloco" style="margin-top:16px">
            <div class="bloco-topo">
              <h3>Avaliações esperando resposta</h3>
              <button class="botao pequeno fantasma" onclick="abrirTela('avaliacoes')">Ver todas</button>
            </div>
            <div class="bloco-corpo sem-espaco">
              ${d.avaliacoes_pendentes.map(av => `
                <div class="linha-lista">
                  <div class="principal">
                    <strong>${escapar(av.cliente_nome || 'Cliente')} ${estrelas(av.nota)}</strong>
                    <small>${escapar((av.comentario || '').slice(0, 62))}${(av.comentario || '').length > 62 ? '…' : ''}</small>
                  </div>
                </div>`).join('')}
            </div>
          </div>` : ''}
      </div>
    </div>`;

  $('#dataHoje').textContent = `${maiuscula(extenso(d.hoje))} · ${d.hora}`;
  $('#btnNovoAgendamento')?.addEventListener('click', () => modalNovoAgendamento());
  ligarAcoesAgenda();

  api('/api/admin/resumo')
    .then(r => { $('#resumoIA p').textContent = r.texto; })
    .catch(() => { $('#resumoIA').remove(); });
};

const cartaoIndicador = (rotulo, valor, nota, cor) => `
  <div class="indicador ${cor}">
    <div class="rotulo">${rotulo}</div>
    <div class="valor">${valor}</div>
    <div class="nota">${nota}</div>
  </div>`;

function grafico(serie) {
  if (!serie.length) return vazio('📈', 'Sem movimento registrado ainda.');
  const max = Math.max(...serie.map(s => s.total), 1);
  return `<div class="grafico">${serie.map(s => `
    <div class="coluna" title="${curta(s.data)}: ${s.total} agendamentos (${s.por_ia} pelo assistente)">
      <div class="barra-viz" style="height:${Math.round((s.total / max) * 118)}px">
        <div class="parte-ia" style="height:${Math.round((s.por_ia / Math.max(s.total, 1)) * 100)}%"></div>
      </div>
      <small>${s.data.slice(8)}</small>
    </div>`).join('')}</div>`;
}

function linhaAgenda(a) {
  return `
    <div class="linha-lista" data-agendamento="${a.id}">
      <span class="marca-prof" style="background:${a.profissional_cor || 'var(--marca)'}"></span>
      <span class="horario">${a.hora_inicio}</span>
      <div class="principal">
        <strong>${escapar(a.cliente_nome)}</strong>
        <small>${escapar(a.servico_nome)}${a.profissional_nome ? ` · ${escapar(a.profissional_nome)}` : ''} · ${dinheiro(a.preco)}</small>
      </div>
      <div class="fim">
        ${selo(a.status)}
        <button class="botao fantasma pequeno" data-detalhe="${a.id}">Abrir</button>
      </div>
    </div>`;
}

function ligarAcoesAgenda() {
  $$('[data-detalhe]').forEach(b => b.addEventListener('click', () => modalAgendamento(b.dataset.detalhe)));
}

/* ================================================================ AGENDA */

let filtroAgenda = { de: null, ate: null, status: '', profissional: '' };

TELAS.agenda = async (alvo) => {
  filtroAgenda.de = filtroAgenda.de || hojeISO();
  filtroAgenda.ate = filtroAgenda.ate || somarDias(filtroAgenda.de, 13);
  await carregarBase();

  $('#barraAcoes').innerHTML = `<button class="botao" id="btnNovo">+ Novo agendamento</button>`;
  $('#btnNovo').addEventListener('click', () => modalNovoAgendamento());

  alvo.innerHTML = `
    <div class="filtros">
      <input type="date" id="fDe" value="${filtroAgenda.de}">
      <span style="color:var(--apagado)">até</span>
      <input type="date" id="fAte" value="${filtroAgenda.ate}">
      <select id="fProf">
        <option value="">Toda a equipe</option>
        ${cache.equipe.map(p => `<option value="${p.id}" ${filtroAgenda.profissional === p.id ? 'selected' : ''}>${escapar(p.nome)}</option>`).join('')}
      </select>
      <div class="pilulas">
        ${['', 'confirmado', 'concluido', 'cancelado', 'faltou'].map(s => `
          <button class="pilula-filtro ${filtroAgenda.status === s ? 'ativa' : ''}" data-status="${s}">
            ${s ? (SELOS[s]?.[1] || s) : 'Todos'}
          </button>`).join('')}
      </div>
    </div>
    <div id="listaAgenda"></div>`;

  $('#fDe').addEventListener('change', e => { filtroAgenda.de = e.target.value; desenharAgenda(); });
  $('#fAte').addEventListener('change', e => { filtroAgenda.ate = e.target.value; desenharAgenda(); });
  $('#fProf').addEventListener('change', e => { filtroAgenda.profissional = e.target.value; desenharAgenda(); });
  $$('[data-status]').forEach(b => b.addEventListener('click', () => {
    filtroAgenda.status = b.dataset.status;
    $$('[data-status]').forEach(x => x.classList.toggle('ativa', x === b));
    desenharAgenda();
  }));

  await desenharAgenda();
};

async function desenharAgenda() {
  const alvo = $('#listaAgenda');
  if (!alvo) return;
  alvo.innerHTML = `<div style="text-align:center;padding:40px"><span class="carregando"></span></div>`;

  const p = new URLSearchParams({ de: filtroAgenda.de, ate: filtroAgenda.ate });
  if (filtroAgenda.status) p.set('status', filtroAgenda.status);
  if (filtroAgenda.profissional) p.set('profissional', filtroAgenda.profissional);

  const lista = await api(`/api/admin/agenda?${p}`);
  if (!lista.length) {
    alvo.innerHTML = vazio('📭', 'Nenhum agendamento nesse período.');
    return;
  }

  const porDia = {};
  for (const a of lista) (porDia[a.data] ||= []).push(a);

  alvo.innerHTML = Object.entries(porDia).map(([data, itens]) => {
    const receita = itens.filter(i => i.status !== 'cancelado').reduce((s, i) => s + Number(i.preco), 0);
    return `
      <div class="bloco" style="margin-bottom:14px">
        <div class="bloco-topo">
          <h3>${maiuscula(extenso(data))}${data === hojeISO() ? ' · <span class="selo">hoje</span>' : ''}</h3>
          <small style="color:var(--apagado)">${itens.length} atendimento${itens.length > 1 ? 's' : ''} · ${dinheiro(receita)}</small>
        </div>
        <div class="bloco-corpo sem-espaco">${itens.map(linhaAgenda).join('')}</div>
      </div>`;
  }).join('');

  ligarAcoesAgenda();
}

async function modalAgendamento(id) {
  let a;
  try { a = await api(`/api/admin/agendamentos/${id}`); }
  catch { return recado('Agendamento não encontrado.', 'erro'); }

  abrirModal(`${a.servico_nome} · ${a.codigo}`, `
    <div class="resumo" style="background:var(--fundo);border-radius:var(--r-m);padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Cliente</span><strong>${escapar(a.cliente_nome)}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>WhatsApp</span><strong>${telFmt(a.cliente_telefone)}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Quando</span><strong style="text-transform:capitalize">${extenso(a.data)}, ${a.hora_inicio}</strong></div>
      ${a.profissional_nome ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Profissional</span><strong>${escapar(a.profissional_nome)}</strong></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Valor</span><strong>${dinheiro(a.preco)}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Origem</span><strong>${({ chat: 'Assistente IA', site: 'Site', admin: 'Painel' })[a.origem] || a.origem}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Situação</span>${selo(a.status)}</div>
      ${a.observacao ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--linha)"><small>Observação: ${escapar(a.observacao)}</small></div>` : ''}
    </div>

    <div class="campo">
      <label>Mudar situação</label>
      <div class="pilulas">
        ${['confirmado', 'concluido', 'faltou', 'cancelado'].map(s =>
          `<button class="pilula-filtro ${a.status === s ? 'ativa' : ''}" data-mudar="${s}">${SELOS[s][1]}</button>`).join('')}
      </div>
    </div>

    <div class="campo">
      <label>Remarcar</label>
      <div style="display:flex;gap:8px">
        <input type="date" id="novaData" value="${a.data}" min="${hojeISO()}">
        <select id="novaHora" style="min-width:120px"><option value="">Escolha o dia</option></select>
      </div>
      <p class="dica">Ao remarcar, o cliente recebe uma nova confirmação.</p>
    </div>

    <a class="botao neutro bloco" href="https://wa.me/55${a.cliente_telefone}" target="_blank" rel="noopener">💬 Falar com ${escapar(a.cliente_nome.split(' ')[0])}</a>
  `, [
    { rotulo: 'Fechar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Salvar remarcação', aoClicar: () => salvarRemarcacao(a.id) }
  ]);

  $$('[data-mudar]').forEach(b => b.addEventListener('click', async () => {
    try {
      await api(`/api/admin/agendamentos/${a.id}`, { method: 'PATCH', corpo: { status: b.dataset.mudar } });
      recado('Situação atualizada.');
      fecharModal();
      abrirTela(location.hash.slice(1) || 'painel');
    } catch (e) { recado(e.message, 'erro'); }
  }));

  const carregarHoras = async () => {
    const sel = $('#novaHora');
    sel.innerHTML = `<option>Carregando…</option>`;
    const p = new URLSearchParams({ data: $('#novaData').value, servico: a.servico_id });
    if (a.profissional_id) p.set('profissional', a.profissional_id);
    const slots = await api(`/api/admin/horarios-livres?${p}`);
    sel.innerHTML = slots.length
      ? `<option value="">Escolha…</option>` + slots.map(s => `<option value="${s.hora}">${s.hora}</option>`).join('')
      : `<option value="">Sem vagas nesse dia</option>`;
  };
  $('#novaData').addEventListener('change', carregarHoras);
  carregarHoras();
}

async function salvarRemarcacao(id) {
  const data = $('#novaData').value, hora = $('#novaHora').value;
  if (!data || !hora) return recado('Escolha a nova data e o horário.', 'erro');
  try {
    await api(`/api/admin/agendamentos/${id}`, { method: 'PATCH', corpo: { data, hora } });
    recado('Agendamento remarcado.');
    fecharModal();
    abrirTela(location.hash.slice(1) || 'agenda');
  } catch (e) { recado(e.message, 'erro'); }
}

async function modalNovoAgendamento() {
  await carregarBase();
  abrirModal('Novo agendamento', `
    <div class="campo">
      <label for="nNome">Nome do cliente</label>
      <input id="nNome" type="text" placeholder="Nome completo" required>
    </div>
    <div class="campo">
      <label for="nTel">WhatsApp com DDD</label>
      <input id="nTel" type="tel" placeholder="(11) 98765-4321" required>
    </div>
    <div class="campo">
      <label for="nServico">Serviço</label>
      <select id="nServico">${cache.servicos.filter(s => s.ativo).map(s =>
        `<option value="${s.id}">${escapar(s.nome)} · ${dinheiro(s.preco)} · ${s.duracao_min}min</option>`).join('')}</select>
    </div>
    <div class="campo">
      <label for="nProf">Profissional</label>
      <select id="nProf"><option value="">Qualquer um disponível</option>
        ${cache.equipe.filter(p => p.ativo).map(p => `<option value="${p.id}">${escapar(p.nome)}</option>`).join('')}</select>
    </div>
    <div class="duas-colunas">
      <div class="campo">
        <label for="nData">Data</label>
        <input type="date" id="nData" value="${hojeISO()}" min="${hojeISO()}">
      </div>
      <div class="campo">
        <label for="nHora">Horário</label>
        <select id="nHora"><option value="">Carregando…</option></select>
      </div>
    </div>
    <div class="campo">
      <label for="nObs">Observação</label>
      <input id="nObs" type="text" placeholder="Opcional">
    </div>
    <label style="display:flex;align-items:center;gap:9px;font-size:.87rem;cursor:pointer">
      <input type="checkbox" id="nAvisar" checked style="width:auto"> Enviar confirmação para o cliente
    </label>
  `, [
    { rotulo: 'Cancelar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Agendar', aoClicar: salvarNovoAgendamento }
  ]);

  const buscarSlots = async (data) => {
    const p = new URLSearchParams({ data, servico: $('#nServico').value });
    if ($('#nProf').value) p.set('profissional', $('#nProf').value);
    return api(`/api/admin/horarios-livres?${p}`);
  };

  /** Carrega os horários do dia. Se pularProLivre, avança até achar vaga. */
  const atualizar = async (pularProLivre = false) => {
    const sel = $('#nHora');
    sel.innerHTML = `<option>Carregando…</option>`;
    try {
      let data = $('#nData').value;
      let slots = await buscarSlots(data);

      // O dono costuma abrir isso no fim do dia: leva direto pro próximo dia com vaga
      for (let i = 0; pularProLivre && !slots.length && i < 14; i++) {
        data = somarDias(data, 1);
        slots = await buscarSlots(data);
      }
      if (data !== $('#nData').value) $('#nData').value = data;

      sel.innerHTML = slots.length
        ? slots.map(s => `<option value="${s.hora}">${s.hora}</option>`).join('')
        : `<option value="">Sem vagas nesse dia</option>`;
    } catch { sel.innerHTML = `<option value="">Erro ao carregar</option>`; }
  };
  ['#nData', '#nServico', '#nProf'].forEach(s => $(s).addEventListener('change', () => atualizar()));
  atualizar(true);
}

async function salvarNovoAgendamento() {
  try {
    await api('/api/admin/agendamentos', {
      method: 'POST',
      corpo: {
        nome: $('#nNome').value.trim(),
        telefone: $('#nTel').value,
        servico_id: $('#nServico').value,
        profissional_id: $('#nProf').value || null,
        data: $('#nData').value,
        hora: $('#nHora').value,
        observacao: $('#nObs').value.trim() || null,
        avisar: $('#nAvisar').checked
      }
    });
    recado('Agendamento criado!');
    fecharModal();
    abrirTela(location.hash.slice(1) || 'agenda');
  } catch (e) { recado(e.message, 'erro'); }
}

/* ============================================================= CONVERSAS */

TELAS.conversas = async (alvo) => {
  const lista = await api('/api/admin/conversas');
  alvo.innerHTML = `
    <div class="bloco">
      <div class="inbox">
        <div class="inbox-lista" id="inboxLista">
          ${lista.length ? lista.map(c => `
            <div class="inbox-item" data-conversa="${c.id}">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <strong>${escapar(c.nome || telFmt(c.telefone) || 'Visitante')}</strong>
                <span class="quando">${desde(c.ultima_em)}</span>
              </div>
              <p>${escapar(c.ultima_msg || 'Sem mensagens')}</p>
            </div>`).join('') : vazio('💬', 'Nenhuma conversa ainda.')}
        </div>
        <div class="inbox-conversa" id="inboxConversa">
          ${vazio('👈', 'Escolha uma conversa para ler.')}
        </div>
      </div>
    </div>`;

  $$('[data-conversa]').forEach(el => el.addEventListener('click', () => {
    $$('.inbox-item').forEach(x => x.classList.toggle('ativo', x === el));
    abrirConversa(el.dataset.conversa);
  }));
};

async function abrirConversa(id) {
  const alvo = $('#inboxConversa');
  alvo.innerHTML = `<div style="text-align:center;padding:50px"><span class="carregando"></span></div>`;
  const c = await api(`/api/admin/conversas/${id}`);

  const AUTOR = { cliente: 'Cliente', ia: 'Assistente IA', humano: 'Você' };
  alvo.innerHTML = `
    <div class="bloco-topo">
      <div>
        <h3>${escapar(c.nome || telFmt(c.telefone) || 'Visitante')}</h3>
        <small style="color:var(--apagado)">${c.telefone ? telFmt(c.telefone) : 'sem telefone'} · canal ${c.canal}</small>
      </div>
      ${c.telefone ? `<a class="botao pequeno neutro" href="https://wa.me/55${c.telefone}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
    </div>
    <div class="inbox-msgs" id="msgs">
      ${c.mensagens.map(m => `
        <div class="msg ${m.autor}"><span class="autor">${AUTOR[m.autor] || m.autor}</span>${escapar(m.texto)}</div>`).join('')}
    </div>
    <form class="inbox-responder" id="formResponder">
      <input type="text" placeholder="Responder como atendente…" id="respostaTexto" maxlength="800">
      <button class="botao" type="submit">Enviar</button>
    </form>`;

  $('#msgs').scrollTop = $('#msgs').scrollHeight;
  $('#formResponder').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = $('#respostaTexto').value.trim();
    if (!texto) return;
    try {
      await api(`/api/admin/conversas/${id}/responder`, { method: 'POST', corpo: { texto } });
      $('#respostaTexto').value = '';
      abrirConversa(id);
      recado('Resposta enviada para a fila de mensagens.');
    } catch (err) { recado(err.message, 'erro'); }
  });
}

/* ============================================================= MENSAGENS */

TELAS.mensagens = async (alvo) => {
  const lista = await api('/api/admin/mensagens');
  const TIPOS = {
    confirmacao: ['verde', 'Confirmação'], lembrete: ['ambar', 'Lembrete'],
    avaliacao: ['', 'Pedido de avaliação'], cancelamento: ['vermelho', 'Cancelamento'],
    atendimento: ['', 'Atendimento']
  };
  const ESTADOS = {
    pendente: ['ambar', 'Na fila'], aguardando_envio: ['ambar', 'Envie você'],
    enviado: ['verde', 'Enviada'], erro: ['vermelho', 'Erro'], cancelado: ['cinza', 'Cancelada']
  };

  const agora = Math.floor(Date.now() / 1000);
  const naFila = m => ['pendente', 'aguardando_envio'].includes(m.status);
  const aEnviar = lista.filter(m => naFila(m) && (m.agendado_para || 0) <= agora);
  const programadas = lista.filter(m => naFila(m) && (m.agendado_para || 0) > agora);

  alvo.innerHTML = `
    <div class="aviso info" style="margin-bottom:18px">
      Sem a integração automática do WhatsApp, as mensagens ficam aqui prontinhas.
      Clique em <strong>Enviar pelo WhatsApp</strong> — o texto já vai preenchido.
    </div>
    <div class="bloco">
      <div class="bloco-topo">
        <h3>Para enviar agora (${aEnviar.length})</h3>
      </div>
      <div class="bloco-corpo sem-espaco">
        ${aEnviar.length ? aEnviar.map(m => cartaoMensagem(m, TIPOS, ESTADOS)).join('')
          : vazio('✅', 'Tudo em dia! Nenhuma mensagem pendente.')}
      </div>
    </div>

    <div class="bloco" style="margin-top:16px">
      <div class="bloco-topo">
        <h3>Programadas (${programadas.length})</h3>
        <small style="color:var(--apagado)">saem sozinhas na hora certa</small>
      </div>
      <div class="bloco-corpo sem-espaco">
        ${programadas.length ? programadas.slice(0, 20).map(m => `
          <div class="linha-lista">
            <div class="principal">
              <strong>${escapar(m.nome || telFmt(m.telefone))}</strong>
              <small>${(TIPOS[m.tipo] || ['', m.tipo])[1]} · ${new Date(m.agendado_para * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
            </div>
            <div class="fim"><span class="selo cinza">Agendada</span></div>
          </div>`).join('') : vazio('⏰', 'Nada programado.')}
      </div>
    </div>

    <div class="bloco" style="margin-top:16px">
      <div class="bloco-topo"><h3>Histórico</h3></div>
      <div class="bloco-corpo sem-espaco">
        ${lista.filter(m => !naFila(m)).slice(0, 40).map(m => `
          <div class="linha-lista">
            <div class="principal">
              <strong>${escapar(m.nome || telFmt(m.telefone))}</strong>
              <small>${(TIPOS[m.tipo] || ['', m.tipo])[1]} · ${escapar(m.texto.slice(0, 58))}…</small>
            </div>
            <div class="fim"><span class="selo ${(ESTADOS[m.status] || ['cinza'])[0]}">${(ESTADOS[m.status] || ['', m.status])[1]}</span></div>
          </div>`).join('') || vazio('📭', 'Sem histórico ainda.')}
      </div>
    </div>`;

  $$('[data-enviada]').forEach(b => b.addEventListener('click', async () => {
    await api(`/api/admin/mensagens/${b.dataset.enviada}/enviada`, { method: 'POST' });
    recado('Marcada como enviada.');
    abrirTela('mensagens');
  }));
  atualizarContadores();
};

const cartaoMensagem = (m, TIPOS, ESTADOS) => `
  <div class="msg-fila">
    <div class="msg-fila-topo">
      <div>
        <strong>${escapar(m.nome || telFmt(m.telefone))}</strong>
        <small style="color:var(--apagado);display:block">${telFmt(m.telefone)}</small>
      </div>
      <div style="display:flex;gap:6px">
        <span class="selo ${(TIPOS[m.tipo] || ['cinza'])[0]}">${(TIPOS[m.tipo] || ['', m.tipo])[1]}</span>
        <span class="selo ${(ESTADOS[m.status] || ['cinza'])[0]}">${(ESTADOS[m.status] || ['', m.status])[1]}</span>
      </div>
    </div>
    <div class="texto">${escapar(m.texto)}</div>
    <div class="msg-fila-acoes">
      <a class="botao pequeno" href="${m.link}" target="_blank" rel="noopener">💬 Enviar pelo WhatsApp</a>
      <button class="botao pequeno neutro" data-enviada="${m.id}">Marcar como enviada</button>
    </div>
  </div>`;

/* ============================================================== CLIENTES */

TELAS.clientes = async (alvo) => {
  alvo.innerHTML = `
    <div class="filtros">
      <input type="text" id="buscaCliente" placeholder="Buscar por nome ou telefone…" style="min-width:280px">
    </div>
    <div class="bloco"><div class="bloco-corpo sem-espaco" id="listaClientes"></div></div>`;

  const desenhar = async (busca = '') => {
    const alvo2 = $('#listaClientes');
    alvo2.innerHTML = `<div style="text-align:center;padding:40px"><span class="carregando"></span></div>`;
    const lista = await api(`/api/admin/clientes?busca=${encodeURIComponent(busca)}`);
    alvo2.innerHTML = lista.length ? `
      <table class="tabela">
        <thead><tr><th>Cliente</th><th>WhatsApp</th><th>Visitas</th><th>Faltas</th><th>Última visita</th><th></th></tr></thead>
        <tbody>${lista.map(c => `
          <tr>
            <td><strong>${escapar(c.nome)}</strong></td>
            <td>${telFmt(c.telefone)}</td>
            <td>${c.total_visitas}</td>
            <td>${c.total_faltas > 2 ? `<span class="selo vermelho">${c.total_faltas}</span>` : c.total_faltas}</td>
            <td>${c.ultima_visita ? curta(c.ultima_visita) : '—'}</td>
            <td style="text-align:right"><button class="botao fantasma pequeno" data-cliente="${c.id}">Ver ficha</button></td>
          </tr>`).join('')}</tbody>
      </table>` : vazio('👥', 'Nenhum cliente encontrado.');

    $$('[data-cliente]').forEach(b => b.addEventListener('click', () => modalCliente(b.dataset.cliente)));
  };

  let t;
  $('#buscaCliente').addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => desenhar(e.target.value.trim()), 280);
  });
  await desenhar();
};

async function modalCliente(id) {
  const c = await api(`/api/admin/clientes/${id}`);
  const gasto = c.agendamentos.filter(a => a.status === 'concluido').reduce((s, a) => s + Number(a.preco), 0);

  abrirModal(c.nome, `
    <div class="indicadores" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      ${cartaoIndicador('Visitas', c.total_visitas, '', 'verde')}
      ${cartaoIndicador('Faltas', c.total_faltas, '', c.total_faltas > 2 ? 'vermelho' : '')}
      ${cartaoIndicador('Total gasto', dinheiro(gasto), '', '')}
    </div>
    <div class="campo">
      <label>WhatsApp</label>
      <div style="display:flex;gap:8px;align-items:center">
        <strong>${telFmt(c.telefone)}</strong>
        <a class="botao pequeno neutro" href="https://wa.me/55${c.telefone}" target="_blank" rel="noopener">💬 Chamar</a>
      </div>
    </div>
    <div class="campo">
      <label for="notasCliente">Anotações internas</label>
      <textarea id="notasCliente" placeholder="Preferências, alergias, histórico… (só você vê)">${escapar(c.notas || '')}</textarea>
    </div>
    <div class="campo">
      <label>Histórico (${c.agendamentos.length})</label>
      <div style="max-height:210px;overflow-y:auto;border:1px solid var(--linha);border-radius:var(--r-m)">
        ${c.agendamentos.length ? c.agendamentos.map(a => `
          <div class="linha-lista" style="padding:10px 14px">
            <div class="principal">
              <strong>${escapar(a.servico_nome)}</strong>
              <small>${curta(a.data)} · ${a.hora_inicio} · ${dinheiro(a.preco)}</small>
            </div>
            <div class="fim">${selo(a.status)}</div>
          </div>`).join('') : vazio('📭', 'Sem histórico.')}
      </div>
    </div>
  `, [
    { rotulo: 'Fechar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Salvar anotações', aoClicar: async () => {
      await api(`/api/admin/clientes/${id}/notas`, { method: 'POST', corpo: { notas: $('#notasCliente').value } });
      recado('Anotações salvas.');
      fecharModal();
    } }
  ]);
}

/* ============================================================ AVALIAÇÕES */

TELAS.avaliacoes = async (alvo) => {
  const lista = await api('/api/admin/avaliacoes');
  const media = lista.length ? (lista.reduce((s, a) => s + a.nota, 0) / lista.length).toFixed(1) : 0;
  const pendentes = lista.filter(a => a.resposta_status !== 'publicada');

  alvo.innerHTML = `
    <div class="indicadores">
      ${cartaoIndicador('Nota média', media || '—', `${lista.length} avaliações`, media >= 4 ? 'verde' : 'ambar')}
      ${cartaoIndicador('Sem resposta', pendentes.length, 'aguardando você', pendentes.length ? 'ambar' : 'verde')}
      ${cartaoIndicador('Promotores', lista.filter(a => a.nota >= 4).length, 'notas 4 e 5', 'verde')}
      ${cartaoIndicador('Críticas', lista.filter(a => a.nota <= 2).length, 'notas 1 e 2', 'vermelho')}
    </div>
    <div class="bloco">
      <div class="bloco-topo">
        <h3>Todas as avaliações</h3>
        <small style="color:var(--apagado)">A IA escreve a resposta — você revisa e publica</small>
      </div>
      <div class="bloco-corpo sem-espaco">
        ${lista.length ? lista.map(cartaoAvaliacao).join('') : vazio('⭐', 'Nenhuma avaliação ainda.')}
      </div>
    </div>`;

  $$('[data-gerar]').forEach(b => b.addEventListener('click', () => gerarResposta(b.dataset.gerar, b)));
  $$('[data-editar]').forEach(b => b.addEventListener('click', () => editarResposta(b.dataset.editar)));
  $$('[data-publicar]').forEach(b => b.addEventListener('click', async () => {
    const av = lista.find(a => a.id === b.dataset.publicar);
    await api(`/api/admin/avaliacoes/${b.dataset.publicar}/responder`,
      { method: 'POST', corpo: { resposta: av.resposta, status: 'publicada' } });
    recado('Resposta marcada como publicada.');
    abrirTela('avaliacoes');
  }));
  atualizarContadores();
};

function cartaoAvaliacao(av) {
  const publicada = av.resposta_status === 'publicada';
  return `
    <div class="avaliacao" id="av-${av.id}">
      <div class="avaliacao-topo">
        <div>
          <strong>${escapar(av.cliente_nome || 'Cliente')}</strong> ${estrelas(av.nota)}
          <small>${av.servico_nome ? escapar(av.servico_nome) + ' · ' : ''}${new Date(av.criado_em * 1000).toLocaleDateString('pt-BR')} · via ${av.canal}</small>
        </div>
        <span class="selo ${publicada ? 'verde' : av.resposta ? 'ambar' : 'cinza'}">
          ${publicada ? 'Respondida' : av.resposta ? 'Rascunho' : 'Sem resposta'}
        </span>
      </div>
      ${av.comentario ? `<div class="comentario">"${escapar(av.comentario)}"</div>` : ''}
      ${av.resposta ? `
        <div class="resposta" id="resp-${av.id}">
          <span class="etiqueta">Sua resposta</span>${escapar(av.resposta)}
        </div>` : ''}
      <div class="avaliacao-acoes">
        <button class="botao pequeno ${av.resposta ? 'neutro' : ''}" data-gerar="${av.id}">
          ✨ ${av.resposta ? 'Gerar outra' : 'Gerar resposta com IA'}
        </button>
        ${av.resposta ? `<button class="botao pequeno neutro" data-editar="${av.id}">Editar</button>` : ''}
        ${av.resposta && !publicada ? `<button class="botao pequeno sucesso" data-publicar="${av.id}">Marcar como publicada</button>` : ''}
      </div>
    </div>`;
}

async function gerarResposta(id, botao) {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<span class="carregando"></span> Escrevendo…';
  try {
    const r = await api('/api/admin/avaliacoes/gerar-resposta', { method: 'POST', corpo: { id } });
    recado(r.gerado_por_ia ? 'Resposta gerada pela IA.' : 'Resposta gerada (modelo local).');
    abrirTela('avaliacoes');
    setTimeout(() => $(`#av-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  } catch (e) {
    recado(e.message, 'erro');
    botao.disabled = false;
    botao.innerHTML = original;
  }
}

function editarResposta(id) {
  const atual = $(`#resp-${id}`)?.textContent.replace('Sua resposta', '').trim() || '';
  abrirModal('Editar resposta', `
    <div class="campo">
      <label for="respTexto">Texto que será publicado</label>
      <textarea id="respTexto" style="min-height:150px">${escapar(atual)}</textarea>
      <p class="dica">Revise antes de publicar no Google ou nas redes sociais.</p>
    </div>`, [
    { rotulo: 'Cancelar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Salvar rascunho', classe: 'neutro', aoClicar: () => salvarResposta(id, 'rascunho') },
    { rotulo: 'Salvar e marcar publicada', aoClicar: () => salvarResposta(id, 'publicada') }
  ]);
}

async function salvarResposta(id, status) {
  await api(`/api/admin/avaliacoes/${id}/responder`,
    { method: 'POST', corpo: { resposta: $('#respTexto').value, status } });
  recado('Resposta salva.');
  fecharModal();
  abrirTela('avaliacoes');
}

/* ============================================================== SERVIÇOS */

TELAS.servicos = async (alvo) => {
  const lista = await api('/api/admin/servicos');
  cache.servicos = lista;

  $('#barraAcoes').innerHTML = `<button class="botao" id="btnNovoServico">+ Novo serviço</button>`;
  $('#btnNovoServico').addEventListener('click', () => modalServico());

  alvo.innerHTML = lista.length ? `<div class="grade-cartoes">${lista.map(s => `
    <div class="cartao-item ${s.ativo ? '' : 'inativo'}">
      <h4>${escapar(s.nome)}</h4>
      <p class="desc">${escapar(s.descricao || 'Sem descrição')}</p>
      <div class="metricas">
        <span>💰 <b>${dinheiro(s.preco)}</b></span>
        <span>⏱ <b>${s.duracao_min} min</b></span>
      </div>
      <div class="acoes">
        <button class="botao pequeno neutro" data-editar-servico="${s.id}">Editar</button>
        ${s.ativo ? `<button class="botao pequeno fantasma" data-remover-servico="${s.id}">Desativar</button>`
                  : `<span class="selo cinza">Inativo</span>`}
      </div>
    </div>`).join('')}</div>`
    : vazio('✂️', 'Nenhum serviço cadastrado.', '<button class="botao" onclick="modalServico()">Criar o primeiro</button>');

  $$('[data-editar-servico]').forEach(b =>
    b.addEventListener('click', () => modalServico(lista.find(s => s.id === b.dataset.editarServico))));
  $$('[data-remover-servico]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Desativar este serviço? Ele some da página do cliente, mas o histórico continua.')) return;
    await api(`/api/admin/servicos/${b.dataset.removerServico}`, { method: 'DELETE' });
    recado('Serviço desativado.');
    abrirTela('servicos');
  }));
};

function modalServico(s = null) {
  abrirModal(s ? 'Editar serviço' : 'Novo serviço', `
    <div class="campo">
      <label for="sNome">Nome</label>
      <input id="sNome" type="text" value="${escapar(s?.nome || '')}" placeholder="Ex: Corte masculino" required>
    </div>
    <div class="campo">
      <label for="sDesc">Descrição curta</label>
      <input id="sDesc" type="text" value="${escapar(s?.descricao || '')}" placeholder="Aparece na página do cliente">
    </div>
    <div class="duas-colunas">
      <div class="campo">
        <label for="sDuracao">Duração (minutos)</label>
        <input id="sDuracao" type="number" min="5" step="5" value="${s?.duracao_min || 30}">
      </div>
      <div class="campo">
        <label for="sPreco">Preço (R$)</label>
        <input id="sPreco" type="number" min="0" step="0.01" value="${s?.preco || 0}">
      </div>
    </div>
    <div class="duas-colunas">
      <div class="campo">
        <label for="sCategoria">Categoria (ícone)</label>
        <select id="sCategoria">
          ${['cabelo', 'barba', 'combo', 'estetica', 'quimica', 'unha', 'massagem', 'consulta', 'padrao']
            .map(c => `<option value="${c}" ${s?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="sOrdem">Ordem de exibição</label>
        <input id="sOrdem" type="number" min="0" value="${s?.ordem || 0}">
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:9px;font-size:.87rem;cursor:pointer">
      <input type="checkbox" id="sAtivo" ${s?.ativo !== 0 ? 'checked' : ''} style="width:auto">
      Disponível para agendamento
    </label>
  `, [
    { rotulo: 'Cancelar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Salvar', aoClicar: async () => {
      if (!$('#sNome').value.trim()) return recado('Dê um nome ao serviço.', 'erro');
      await api('/api/admin/servicos', { method: 'POST', corpo: {
        id: s?.id, nome: $('#sNome').value.trim(), descricao: $('#sDesc').value.trim(),
        duracao_min: Number($('#sDuracao').value), preco: Number($('#sPreco').value),
        categoria: $('#sCategoria').value, ordem: Number($('#sOrdem').value), ativo: $('#sAtivo').checked
      } });
      recado('Serviço salvo.');
      fecharModal();
      abrirTela('servicos');
    } }
  ]);
}

/* ================================================================ EQUIPE */

TELAS.equipe = async (alvo) => {
  const [lista, servicos] = await Promise.all([
    api('/api/admin/profissionais'), api('/api/admin/servicos')
  ]);
  cache.equipe = lista;
  cache.servicos = servicos;

  $('#barraAcoes').innerHTML = `<button class="botao" id="btnNovoProf">+ Adicionar pessoa</button>`;
  $('#btnNovoProf').addEventListener('click', () => modalProfissional());

  alvo.innerHTML = lista.length ? `<div class="grade-cartoes">${lista.map(p => `
    <div class="cartao-item ${p.ativo ? '' : 'inativo'}">
      <div class="avatar-prof" style="background:${p.cor}">${p.nome.split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase()}</div>
      <h4>${escapar(p.nome)}</h4>
      <p class="desc">${p.servicos.length ? `${p.servicos.length} serviços` : 'Atende todos os serviços'}${p.telefone ? ` · ${telFmt(p.telefone)}` : ''}</p>
      <div class="acoes">
        <button class="botao pequeno neutro" data-editar-prof="${p.id}">Editar</button>
        ${p.ativo ? `<button class="botao pequeno fantasma" data-remover-prof="${p.id}">Desativar</button>`
                  : `<span class="selo cinza">Inativo</span>`}
      </div>
    </div>`).join('')}</div>`
    : vazio('🧑‍🔧', 'Nenhuma pessoa na equipe.',
        '<p style="font-size:.85rem">Sem equipe cadastrada o sistema trabalha com uma agenda única.</p>');

  $$('[data-editar-prof]').forEach(b =>
    b.addEventListener('click', () => modalProfissional(lista.find(p => p.id === b.dataset.editarProf))));
  $$('[data-remover-prof]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Desativar esta pessoa? Ela some da agenda, mas o histórico continua.')) return;
    await api(`/api/admin/profissionais/${b.dataset.removerProf}`, { method: 'DELETE' });
    recado('Profissional desativado.');
    abrirTela('equipe');
  }));
};

function modalProfissional(p = null) {
  const cores = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#e84393', '#f59f00', '#00838f'];
  let corEscolhida = p?.cor || cores[0];
  abrirModal(p ? 'Editar pessoa' : 'Nova pessoa na equipe', `
    <div class="campo">
      <label for="pNome">Nome completo</label>
      <input id="pNome" type="text" value="${escapar(p?.nome || '')}" required>
    </div>
    <div class="duas-colunas">
      <div class="campo">
        <label for="pApelido">Como o cliente chama</label>
        <input id="pApelido" type="text" value="${escapar(p?.apelido || '')}" placeholder="Ex: Rafa">
      </div>
      <div class="campo">
        <label for="pTel">WhatsApp</label>
        <input id="pTel" type="tel" value="${escapar(p?.telefone || '')}">
      </div>
    </div>
    <div class="campo">
      <label>Cor na agenda</label>
      <div style="display:flex;gap:8px">
        ${cores.map(c => `
          <button type="button" data-cor="${c}" class="escolha-cor"
            style="width:32px;height:32px;border-radius:50%;background:${c};border:3px solid ${(p?.cor || cores[0]) === c ? 'var(--tinta)' : 'transparent'};cursor:pointer"></button>`).join('')}
      </div>
    </div>
    <div class="campo">
      <label>Serviços que atende</label>
      <p class="dica" style="margin-bottom:8px">Nenhum marcado = atende todos.</p>
      <div style="display:grid;gap:6px;max-height:190px;overflow-y:auto">
        ${cache.servicos.filter(s => s.ativo).map(s => `
          <label style="display:flex;align-items:center;gap:9px;font-size:.87rem;cursor:pointer">
            <input type="checkbox" class="serv-check" value="${s.id}" style="width:auto"
              ${p?.servicos?.includes(s.id) ? 'checked' : ''}> ${escapar(s.nome)}
          </label>`).join('')}
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:9px;font-size:.87rem;cursor:pointer;margin-top:12px">
      <input type="checkbox" id="pAtivo" ${p?.ativo !== 0 ? 'checked' : ''} style="width:auto"> Atendendo normalmente
    </label>
  `, [
    { rotulo: 'Cancelar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Salvar', aoClicar: async () => {
      if (!$('#pNome').value.trim()) return recado('Informe o nome.', 'erro');
      await api('/api/admin/profissionais', { method: 'POST', corpo: {
        id: p?.id, nome: $('#pNome').value.trim(), apelido: $('#pApelido').value.trim(),
        telefone: $('#pTel').value.trim(), cor: corEscolhida || p?.cor || cores[0],
        ativo: $('#pAtivo').checked,
        servicos: $$('.serv-check:checked').map(c => c.value)
      } });
      recado('Equipe atualizada.');
      fecharModal();
      abrirTela('equipe');
    } }
  ]);

  $$('.escolha-cor').forEach(b => b.addEventListener('click', () => {
    corEscolhida = b.dataset.cor;
    $$('.escolha-cor').forEach(x => x.style.border = `3px solid ${x.dataset.cor === corEscolhida ? 'var(--tinta)' : 'transparent'}`);
  }));
}

/* ============================================================== HORÁRIOS */

TELAS.horarios = async (alvo) => {
  const [grade, equipe, bloqueios] = await Promise.all([
    api('/api/admin/horarios'), api('/api/admin/profissionais'), api('/api/admin/bloqueios')
  ]);
  cache.equipe = equipe;

  alvo.innerHTML = `
    <div class="bloco">
      <div class="bloco-topo">
        <h3>Expediente</h3>
        <select id="quemHorario" style="width:auto;min-width:200px">
          <option value="">Horário padrão do negócio</option>
          ${equipe.filter(p => p.ativo).map(p => `<option value="${p.id}">${escapar(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="bloco-corpo">
        <p class="dica" id="dicaHorario" style="margin-bottom:14px">
          Este é o horário usado por quem não tem grade própria.
        </p>
        <div class="grade-expediente" id="gradeExpediente"></div>
        <button class="botao" id="btnSalvarHorarios" style="margin-top:16px">Salvar expediente</button>
      </div>
    </div>

    <div class="bloco" style="margin-top:16px">
      <div class="bloco-topo">
        <h3>Folgas, férias e feriados</h3>
        <button class="botao pequeno" id="btnNovoBloqueio">+ Bloquear período</button>
      </div>
      <div class="bloco-corpo sem-espaco">
        ${bloqueios.length ? bloqueios.map(b => `
          <div class="linha-lista">
            <div class="principal">
              <strong>${escapar(b.motivo || 'Bloqueio')}</strong>
              <small>${curta(b.data_inicio)}${b.data_fim !== b.data_inicio ? ` até ${curta(b.data_fim)}` : ''}
                ${b.hora_inicio ? ` · ${b.hora_inicio} às ${b.hora_fim}` : ' · dia inteiro'}
                · ${b.profissional_nome ? escapar(b.profissional_nome) : 'toda a equipe'}</small>
            </div>
            <div class="fim"><button class="botao fantasma pequeno" data-remover-bloqueio="${b.id}">Remover</button></div>
          </div>`).join('') : vazio('🏖️', 'Nenhum período bloqueado.')}
      </div>
    </div>`;

  let atual = grade.negocio;
  const desenhar = (faixas) => {
    $('#gradeExpediente').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(dia => {
      const doDia = faixas.filter(f => f.dia_semana === dia);
      return `
        <div class="dia-expediente ${doDia.length ? '' : 'fechado'}" data-dia="${dia}">
          <span class="nome-dia">${maiuscula(DIAS[dia])}</span>
          <label class="interruptor">
            <input type="checkbox" class="abre-dia" ${doDia.length ? 'checked' : ''}><span></span>
          </label>
          <div class="faixas-dia">
            ${doDia.length
              ? doDia.map(f => faixaHtml(f.abre, f.fecha)).join('')
              : faixaHtml('09:00', '18:00')}
            <button type="button" class="botao fantasma pequeno add-faixa">+ intervalo</button>
          </div>
        </div>`;
    }).join('');
    ligarExpediente();
  };

  const faixaHtml = (abre, fecha) => `
    <span class="faixa">
      <input type="time" class="abre" value="${abre}">
      <span style="color:var(--apagado)">–</span>
      <input type="time" class="fecha" value="${fecha}">
      <button type="button" class="remover" title="Remover">&times;</button>
    </span>`;

  function ligarExpediente() {
    $$('.abre-dia').forEach(c => c.addEventListener('change', e =>
      e.target.closest('.dia-expediente').classList.toggle('fechado', !e.target.checked)));
    $$('.add-faixa').forEach(b => b.addEventListener('click', e => {
      const cont = e.target.closest('.faixas-dia');
      e.target.insertAdjacentHTML('beforebegin', faixaHtml('13:00', '18:00'));
      cont.querySelectorAll('.remover').forEach(r => r.onclick = ev => ev.target.closest('.faixa').remove());
    }));
    $$('.faixas-dia .remover').forEach(r => r.onclick = e => {
      const cont = e.target.closest('.faixas-dia');
      if (cont.querySelectorAll('.faixa').length > 1) e.target.closest('.faixa').remove();
      else recado('Desligue o dia para fechá-lo.', 'erro');
    });
  }

  desenhar(atual);

  $('#quemHorario').addEventListener('change', async e => {
    const id = e.target.value;
    atual = id ? (grade.equipe[id] || []) : grade.negocio;
    $('#dicaHorario').textContent = id
      ? 'Grade individual. Deixe todos os dias desligados para esta pessoa seguir o horário do negócio.'
      : 'Este é o horário usado por quem não tem grade própria.';
    desenhar(atual);
  });

  $('#btnSalvarHorarios').addEventListener('click', async () => {
    const faixas = [];
    $$('.dia-expediente').forEach(el => {
      if (!$('.abre-dia', el).checked) return;
      const dia = Number(el.dataset.dia);
      $$('.faixa', el).forEach(f => {
        const abre = $('.abre', f).value, fecha = $('.fecha', f).value;
        if (abre && fecha && fecha > abre) faixas.push({ dia_semana: dia, abre, fecha });
      });
    });
    await api('/api/admin/horarios', {
      method: 'POST', corpo: { profissional_id: $('#quemHorario').value || null, faixas }
    });
    recado('Expediente salvo.');
    abrirTela('horarios');
  });

  $('#btnNovoBloqueio').addEventListener('click', () => modalBloqueio());
  $$('[data-remover-bloqueio]').forEach(b => b.addEventListener('click', async () => {
    await api(`/api/admin/bloqueios/${b.dataset.removerBloqueio}`, { method: 'DELETE' });
    recado('Bloqueio removido.');
    abrirTela('horarios');
  }));
};

function modalBloqueio() {
  abrirModal('Bloquear período', `
    <div class="campo">
      <label for="bMotivo">Motivo</label>
      <input id="bMotivo" type="text" placeholder="Ex: Feriado, férias, treinamento">
    </div>
    <div class="campo">
      <label for="bQuem">Quem fica indisponível</label>
      <select id="bQuem">
        <option value="">Todo o negócio</option>
        ${cache.equipe.filter(p => p.ativo).map(p => `<option value="${p.id}">${escapar(p.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="duas-colunas">
      <div class="campo"><label for="bDe">De</label><input type="date" id="bDe" value="${hojeISO()}"></div>
      <div class="campo"><label for="bAte">Até</label><input type="date" id="bAte" value="${hojeISO()}"></div>
    </div>
    <div class="duas-colunas">
      <div class="campo"><label for="bHi">Das (opcional)</label><input type="time" id="bHi"></div>
      <div class="campo"><label for="bHf">Às (opcional)</label><input type="time" id="bHf"></div>
    </div>
    <p class="dica">Deixe os horários em branco para bloquear o dia inteiro.</p>
  `, [
    { rotulo: 'Cancelar', classe: 'neutro', aoClicar: fecharModal },
    { rotulo: 'Bloquear', aoClicar: async () => {
      await api('/api/admin/bloqueios', { method: 'POST', corpo: {
        motivo: $('#bMotivo').value.trim() || 'Indisponível',
        profissional_id: $('#bQuem').value || null,
        data_inicio: $('#bDe').value, data_fim: $('#bAte').value || $('#bDe').value,
        hora_inicio: $('#bHi').value || null, hora_fim: $('#bHf').value || null
      } });
      recado('Período bloqueado.');
      fecharModal();
      abrirTela('horarios');
    } }
  ]);
}

/* =============================================================== AJUSTES */

TELAS.ajustes = async (alvo) => {
  const n = await api('/api/admin/negocio');
  cache.negocio = n;

  alvo.innerHTML = `
    <div class="duas-colunas">
      <div class="bloco">
        <div class="bloco-topo"><h3>Identidade do negócio</h3></div>
        <div class="bloco-corpo">
          <div class="campo"><label for="aNome">Nome</label><input id="aNome" type="text" value="${escapar(n.nome)}"></div>
          <div class="campo"><label for="aSobre">Sobre (aparece na página do cliente)</label>
            <textarea id="aSobre">${escapar(n.sobre || '')}</textarea></div>
          <div class="campo"><label for="aEndereco">Endereço</label><input id="aEndereco" type="text" value="${escapar(n.endereco || '')}"></div>
          <div class="duas-colunas">
            <div class="campo"><label for="aTelefone">Telefone</label><input id="aTelefone" type="tel" value="${escapar(n.telefone || '')}"></div>
            <div class="campo"><label for="aWhatsapp">WhatsApp</label><input id="aWhatsapp" type="tel" value="${escapar(n.whatsapp || '')}"></div>
          </div>
          <div class="duas-colunas">
            <div class="campo"><label for="aInstagram">Instagram</label><input id="aInstagram" type="text" value="${escapar(n.instagram || '')}"></div>
            <div class="campo"><label for="aCor">Cor da marca</label>
              <input id="aCor" type="color" value="${n.cor || '#6c5ce7'}" style="height:44px;padding:4px"></div>
          </div>
        </div>
      </div>

      <div>
        <div class="bloco">
          <div class="bloco-topo"><h3>Assistente virtual</h3></div>
          <div class="bloco-corpo">
            <div class="campo">
              <label for="aPersonalidade">Jeito de falar</label>
              <select id="aPersonalidade">
                ${[['simpatico', 'Simpático e próximo'], ['descontraido', 'Descontraído e leve'],
                   ['formal', 'Formal e cordial'], ['objetivo', 'Objetivo e direto']]
                  .map(([v, r]) => `<option value="${v}" ${n.personalidade_ia === v ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div class="campo">
              <label for="aBoasVindas">Mensagem de boas-vindas</label>
              <textarea id="aBoasVindas" placeholder="A primeira frase que o cliente lê">${escapar(n.boas_vindas || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="bloco" style="margin-top:16px">
          <div class="bloco-topo"><h3>Regras da agenda</h3></div>
          <div class="bloco-corpo">
            <div class="duas-colunas">
              <div class="campo">
                <label for="aIntervalo">Intervalo entre horários</label>
                <select id="aIntervalo">
                  ${[10, 15, 20, 30, 60].map(v => `<option value="${v}" ${n.intervalo_slots === v ? 'selected' : ''}>${v} minutos</option>`).join('')}
                </select>
              </div>
              <div class="campo">
                <label for="aAntMin">Antecedência mínima</label>
                <select id="aAntMin">
                  ${[0, 1, 2, 4, 12, 24].map(v => `<option value="${v}" ${n.antecedencia_min_h === v ? 'selected' : ''}>${v === 0 ? 'Sem limite' : v + ' hora' + (v > 1 ? 's' : '')}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="duas-colunas">
              <div class="campo">
                <label for="aAntMax">Agenda aberta por</label>
                <select id="aAntMax">
                  ${[7, 15, 30, 45, 60, 90].map(v => `<option value="${v}" ${n.antecedencia_max_d === v ? 'selected' : ''}>${v} dias</option>`).join('')}
                </select>
              </div>
              <div class="campo">
                <label for="aCancel">Cancelar até</label>
                <select id="aCancel">
                  ${[0, 1, 2, 3, 6, 12, 24].map(v => `<option value="${v}" ${n.cancelamento_min_h === v ? 'selected' : ''}>${v === 0 ? 'Sem limite' : v + 'h antes'}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="campo">
              <label for="aLembrete">Lembrete automático</label>
              <select id="aLembrete">
                ${[0, 2, 4, 12, 24, 48].map(v => `<option value="${v}" ${n.lembrete_h === v ? 'selected' : ''}>${v === 0 ? 'Não enviar' : v + 'h antes'}</option>`).join('')}
              </select>
            </div>
            <label style="display:flex;align-items:center;gap:9px;font-size:.87rem;cursor:pointer">
              <input type="checkbox" id="aAvaliacao" ${n.pedir_avaliacao ? 'checked' : ''} style="width:auto">
              Pedir avaliação depois do atendimento
            </label>
          </div>
        </div>
      </div>
    </div>

    <button class="botao" id="btnSalvarAjustes" style="margin-top:18px">Salvar tudo</button>`;

  $('#btnSalvarAjustes').addEventListener('click', async () => {
    await api('/api/admin/negocio', { method: 'POST', corpo: {
      nome: $('#aNome').value.trim(), sobre: $('#aSobre').value.trim(),
      endereco: $('#aEndereco').value.trim(), telefone: $('#aTelefone').value.trim(),
      whatsapp: $('#aWhatsapp').value.trim(), instagram: $('#aInstagram').value.trim(),
      cor: $('#aCor').value, personalidade_ia: $('#aPersonalidade').value,
      boas_vindas: $('#aBoasVindas').value.trim(),
      intervalo_slots: Number($('#aIntervalo').value),
      antecedencia_min_h: Number($('#aAntMin').value),
      antecedencia_max_d: Number($('#aAntMax').value),
      cancelamento_min_h: Number($('#aCancel').value),
      lembrete_h: Number($('#aLembrete').value),
      pedir_avaliacao: $('#aAvaliacao').checked ? 1 : 0
    } });
    recado('Ajustes salvos!');
    carregarBase(true);
  });
};

/* ---------------------------------------------------------------- APOIO */

async function carregarBase(forcar = false) {
  if (!forcar && cache.servicos.length && cache.negocio) return;
  const [servicos, equipe, negocio] = await Promise.all([
    api('/api/admin/servicos'), api('/api/admin/profissionais'), api('/api/admin/negocio')
  ]);
  cache.servicos = servicos;
  cache.equipe = equipe;
  cache.negocio = negocio;
  $('#lateralNome').textContent = negocio.nome;
  if (negocio.cor) document.documentElement.style.setProperty('--marca', negocio.cor);
}

async function atualizarContadores() {
  try {
    const [conversas, avaliacoes, mensagens] = await Promise.all([
      api('/api/admin/conversas'),
      api('/api/admin/avaliacoes?status=pendente'),
      api('/api/admin/mensagens')
    ]);
    const agora = Math.floor(Date.now() / 1000);
    const pendentes = mensagens.filter(m =>
      ['pendente', 'aguardando_envio'].includes(m.status) && (m.agendado_para || 0) <= agora).length;
    marcar('#contaConversas', conversas.filter(c => c.status === 'aberta' &&
      Date.now() / 1000 - c.ultima_em < 86400).length);
    marcar('#contaAvaliacoes', avaliacoes.length);
    marcar('#contaMensagens', pendentes);
  } catch { /* silencioso */ }
}

function marcar(seletor, n) {
  const el = $(seletor);
  if (!el) return;
  el.textContent = n > 99 ? '99+' : n;
  el.classList.toggle('ver', n > 0);
}

/* ---------------------------------------------------------------- INÍCIO */

window.abrirTela = abrirTela;
window.modalServico = modalServico;

(async () => {
  const d = new Date();
  $('#dataHoje').textContent = maiuscula(`${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`);
  await carregarBase();
  atualizarContadores();
  await abrirTela(location.hash.slice(1) || 'painel');
  setInterval(atualizarContadores, 60000);
})();
