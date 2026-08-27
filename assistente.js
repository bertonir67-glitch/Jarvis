// Assistente de atendimento: maquina de estados que conduz o cliente ate o
// agendamento. A IA entende e conversa; a maquina de estados garante que o
// que for gravado na agenda esteja sempre correto.
import * as bd from './db.js';
import * as ag from './agenda.js';
import * as nlu from './interpretar.js';
import * as ia from './ia.js';
import { notificarAgendamento, notificarCancelamento } from './mensagens.js';

const MAX_OPCOES = 6;

/**
 * Processa uma mensagem do cliente e devolve a resposta do assistente.
 * @returns {Promise<{texto:string, opcoes:Array, estado:string, acao:string|null, agendamento:object|null}>}
 */
export async function conversar(conversaId, texto, extras = {}) {
  const conversa = bd.buscarConversa(conversaId);
  if (!conversa) throw new Error('Conversa nao encontrada');

  bd.gravarMensagem(conversaId, 'cliente', texto);

  const estado = bd.lerEstadoConversa(conversaId);
  const historico = bd.historicoConversa(conversaId, 12);
  const hoje = ag.hojeLocal();

  // Dados que ja conhecemos do cliente: primeiro a sessao, depois a propria
  // conversa (no WhatsApp, por exemplo, o numero e a identidade).
  if (extras.telefone && !estado.telefone) estado.telefone = bd.normalizarTelefone(extras.telefone);
  if (extras.nome && !estado.nome) estado.nome = extras.nome;
  if (!estado.telefone && conversa.telefone) estado.telefone = conversa.telefone;
  if (!estado.nome && conversa.nome) estado.nome = conversa.nome;

  const dados = await extrair(texto, { hoje, hora: ag.horaLocal(), historico });
  const resposta = await rotear(conversaId, texto, estado, dados, conversa);

  bd.salvarEstadoConversa(conversaId, resposta.estadoNovo || estado, {
    nome: estado.nome, telefone: estado.telefone
  });
  bd.gravarMensagem(conversaId, 'ia', resposta.texto, { opcoes: resposta.opcoes });

  return {
    texto: resposta.texto,
    opcoes: resposta.opcoes || [],
    estado: (resposta.estadoNovo || estado).etapa || 'inicio',
    acao: resposta.acao || null,
    agendamento: resposta.agendamento || null
  };
}

/* ------------------------------------------------ ENTENDIMENTO DA MENSAGEM */

/** Combina o que a IA entendeu com o que as regras locais entendem. */
async function extrair(texto, ctx) {
  const servicos = bd.listarServicos();
  const equipe = bd.listarProfissionais();

  const local = {
    intencao: nlu.detectarIntencao(texto),
    data: nlu.extrairData(texto, ctx.hoje),
    hora: nlu.extrairHora(texto),
    periodo: nlu.extrairPeriodo(texto),
    telefone: nlu.extrairTelefone(texto),
    servico_id: nlu.casarServico(texto, servicos)?.id || null,
    profissional_id: (() => {
      const p = nlu.casarProfissional(texto, equipe);
      return p === 'qualquer' ? 'qualquer' : (p?.id || null);
    })(),
    confirmacao: nlu.ehConfirmacao(texto) ? true : (nlu.ehNegacao(texto) ? false : null),
    nota: nlu.extrairNota(texto)
  };

  const doModelo = await ia.entender(texto, ctx).catch(() => null);
  if (!doModelo) return local;

  // Regras locais tem prioridade em data/hora (deterministicas e auditaveis);
  // o modelo preenche o que elas nao acharam.
  const idsServico = new Set(servicos.map(s => s.id));
  const idsEquipe = new Set(equipe.map(p => p.id));
  return {
    intencao: local.intencao !== 'duvida' ? local.intencao : (doModelo.intencao || 'duvida'),
    data: local.data || (doModelo.data >= ctx.hoje ? doModelo.data : null),
    hora: local.hora || doModelo.hora,
    periodo: local.periodo || doModelo.periodo,
    telefone: local.telefone || doModelo.telefone,
    nome: doModelo.nome,
    servico_id: local.servico_id || (idsServico.has(doModelo.servico_id) ? doModelo.servico_id : null),
    profissional_id: local.profissional_id ||
      (doModelo.profissional_id === 'qualquer' ? 'qualquer'
        : (idsEquipe.has(doModelo.profissional_id) ? doModelo.profissional_id : null)),
    confirmacao: local.confirmacao ?? doModelo.confirmacao,
    observacao: doModelo.observacao,
    nota: local.nota
  };
}

/* ------------------------------------------------------------- ROTEAMENTO */

async function rotear(conversaId, texto, estado, d, conversa) {
  // Comandos que interrompem qualquer fluxo
  if (/^(recome[cç]ar|reiniciar|voltar ao in[ií]cio|menu)$/i.test(texto.trim())) {
    return await menuInicial({}, 'Sem problema, vamos do começo.');
  }
  if (d.intencao === 'humano') return await falarComHumano(conversaId, estado);

  // Fluxos em andamento tem prioridade
  if (estado.etapa === 'cancelando')  return await passoCancelar(estado, d, texto);
  if (estado.etapa === 'avaliando')   return await passoAvaliar(estado, d, texto, conversa);

  switch (d.intencao) {
    case 'cancelar':   return await iniciarCancelamento(estado, d);
    case 'remarcar':   return await iniciarRemarcacao(estado, d);
    case 'consultar':  return await consultarAgendamentos(estado, d);
    case 'preco':      return await tabelaPrecos(estado);
    case 'servicos':   return await listaServicos(estado);
    case 'horario_fn': return await horarioFuncionamento(estado);
    case 'endereco':   return await ondeFica(estado);
    case 'avaliar':    return await iniciarAvaliacao(estado, conversa);
    case 'saudacao':
      if (!estado.etapa || estado.etapa === 'inicio') return await menuInicial(estado);
      break;
  }

  // Tudo mais cai no fluxo de agendamento
  return await fluxoAgendamento(estado, d, texto);
}

/* -------------------------------------------------------- MENU E RESPOSTAS */

async function menuInicial(estado, prefixo = '') {
  const n = bd.lerNegocio();
  const boas = n.boas_vindas || `Oi! Sou o assistente da ${n.nome}. Posso te ajudar a marcar um horário agora mesmo.`;
  return {
    texto: await ia.humanizar(`${prefixo ? prefixo + ' ' : ''}${boas} O que você precisa?`, { curto: true }),
    opcoes: [
      { rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' },
      { rotulo: '🔎 Ver meus horários', valor: 'quero ver meus agendamentos' },
      { rotulo: '💰 Preços', valor: 'quais são os preços' },
      { rotulo: '📍 Onde fica', valor: 'onde vocês ficam' }
    ],
    estadoNovo: { ...estado, etapa: 'inicio' }
  };
}

async function tabelaPrecos(estado) {
  const servicos = bd.listarServicos();
  if (!servicos.length) return { texto: 'Ainda estamos montando a tabela. Me chama que a gente te passa!', opcoes: [], estadoNovo: estado };
  const linhas = servicos.map(s =>
    `• ${s.nome} — R$ ${Number(s.preco).toFixed(2).replace('.', ',')} (${s.duracao_min} min)`).join('\n');
  return {
    texto: `Nossos valores:\n\n${linhas}\n\nQuer marcar algum?`,
    opcoes: servicos.slice(0, MAX_OPCOES).map(s => ({ rotulo: s.nome, valor: `quero marcar ${s.nome}` })),
    estadoNovo: { ...estado, etapa: 'inicio' }
  };
}

async function listaServicos(estado) {
  return await tabelaPrecos(estado);
}

async function horarioFuncionamento(estado) {
  const grade = bd.listarHorarios(null);
  if (!grade.length) return { texto: 'Nosso horário ainda não está publicado aqui. Me diz o dia que você prefere que eu confirmo.', opcoes: [], estadoNovo: estado };
  const porDia = {};
  for (const h of grade) (porDia[h.dia_semana] ||= []).push(`${h.abre} as ${h.fecha}`);
  const linhas = ag.DIAS.map((nome, i) =>
    `• ${nome.charAt(0).toUpperCase() + nome.slice(1)}: ${porDia[i] ? porDia[i].join(' e ') : 'fechado'}`).join('\n');
  return {
    texto: await ia.humanizar(`Funcionamos assim:\n\n${linhas}`, { fatos: linhas, curto: false }),
    opcoes: [{ rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' }],
    estadoNovo: { ...estado, etapa: 'inicio' }
  };
}

async function ondeFica(estado) {
  const n = bd.lerNegocio();
  const partes = [];
  if (n.endereco) partes.push(`📍 ${n.endereco}`);
  if (n.whatsapp || n.telefone) partes.push(`📞 ${n.whatsapp || n.telefone}`);
  if (n.instagram) partes.push(`📷 ${n.instagram}`);
  const texto = partes.length ? partes.join('\n') : 'Nosso endereço ainda não está cadastrado aqui, mas posso confirmar com a equipe.';
  const opcoes = [{ rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' }];
  if (n.endereco) {
    opcoes.unshift({ rotulo: '🗺️ Abrir no mapa', valor: 'mapa', tipo: 'link',
                     url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.endereco)}` });
  }
  return { texto, opcoes, estadoNovo: { ...estado, etapa: 'inicio' } };
}

async function falarComHumano(conversaId, estado) {
  const n = bd.lerNegocio();
  bd.salvarEstadoConversa(conversaId, { ...estado, etapa: 'humano' }, { status: 'aberta' });
  return {
    texto: `Claro! Já avisei a equipe da ${n.nome} — alguém te responde por aqui.` +
           (n.whatsapp ? `\n\nSe preferir, chama direto no ${n.whatsapp}.` : ''),
    opcoes: n.whatsapp
      ? [{ rotulo: '💬 Abrir WhatsApp', valor: 'whatsapp', tipo: 'link',
           url: `https://wa.me/55${bd.normalizarTelefone(n.whatsapp)}` }]
      : [],
    estadoNovo: { ...estado, etapa: 'humano', aguardando_humano: true }
  };
}

/* --------------------------------------------------- FLUXO DE AGENDAMENTO */

async function fluxoAgendamento(estado, d, texto) {
  const e = { ...estado, etapa: estado.etapa || 'inicio' };

  // Absorve o que veio na mensagem
  if (d.servico_id) e.servico_id = d.servico_id;
  if (d.profissional_id) e.profissional_id = d.profissional_id;
  if (d.data) e.data = d.data;
  if (d.hora) e.hora = d.hora;
  if (d.periodo) e.periodo = d.periodo;
  if (d.observacao && !e.observacao) e.observacao = d.observacao;
  if (d.telefone) e.telefone = d.telefone;
  if (d.nome) e.nome = d.nome;

  // Nas etapas de identificacao, a mensagem inteira pode ser o dado
  if (e.etapa === 'pedindo_nome' && !d.nome) {
    const n = nlu.extrairNome(texto);
    if (n) e.nome = n;
  }
  if (e.etapa === 'pedindo_telefone' && !e.telefone) {
    const t = nlu.extrairTelefone(texto) || texto.replace(/\D/g, '');
    if (t && t.length >= 10) e.telefone = bd.normalizarTelefone(t);
  }

  // O telefone foi pedido para consultar/cancelar/remarcar: retoma aquele fluxo
  if (e.telefone && e.voltar_para) {
    const destino = e.voltar_para;
    delete e.voltar_para;
    e.etapa = 'inicio';
    if (destino === 'consultar') return await consultarAgendamentos(e, d);
    if (destino === 'cancelar')  return await iniciarCancelamento(e, d);
    if (destino === 'remarcar')  return await iniciarRemarcacao(e, d);
  }

  // Confirmacao final
  if (e.etapa === 'confirmando') {
    if (d.confirmacao === true) return await gravar(e);
    if (d.confirmacao === false) {
      delete e.hora; delete e.data;
      return await pedirData({ ...e, etapa: 'escolhendo_data' }, 'Sem problema!');
    }
  }

  return await proximoPasso(e);
}

/** Descobre o que falta e pergunta. */
async function proximoPasso(e) {
  if (!e.servico_id)      return await pedirServico(e);
  if (precisaProfissional(e)) return await pedirProfissional(e);
  if (!e.data)            return await pedirData(e);
  if (!e.hora)            return await pedirHora(e);
  if (!e.nome)            return await pedirNome(e);
  if (!e.telefone)        return await pedirTelefone(e);
  return await confirmar(e);
}

function precisaProfissional(e) {
  if (e.profissional_id) return false;
  const equipe = bd.profissionaisDoServico(e.servico_id);
  if (equipe.length <= 1) {
    e.profissional_id = equipe[0]?.id || 'qualquer';
    return false;
  }
  return true;
}

async function pedirServico(e) {
  const servicos = bd.listarServicos();
  if (!servicos.length) {
    return { texto: 'Ainda não temos serviços cadastrados. Me chama no WhatsApp que a gente resolve!', opcoes: [], estadoNovo: e };
  }
  const lista = servicos.slice(0, 10)
    .map(s => `• ${s.nome} — R$ ${Number(s.preco).toFixed(2).replace('.', ',')} (${s.duracao_min} min)`).join('\n');
  return {
    texto: await ia.humanizar(`Qual serviço você quer marcar?\n\n${lista}`, { fatos: lista, curto: false }),
    opcoes: servicos.slice(0, MAX_OPCOES).map(s => ({ rotulo: s.nome, valor: s.nome })),
    estadoNovo: { ...e, etapa: 'escolhendo_servico' }
  };
}

async function pedirProfissional(e) {
  const equipe = bd.profissionaisDoServico(e.servico_id);
  const servico = bd.buscarServico(e.servico_id);
  return {
    texto: `Boa escolha: ${servico.nome}. Com quem você prefere ser atendido?`,
    opcoes: [
      ...equipe.slice(0, MAX_OPCOES - 1).map(p => ({ rotulo: p.nome, valor: p.nome })),
      { rotulo: 'Tanto faz', valor: 'tanto faz' }
    ],
    estadoNovo: { ...e, etapa: 'escolhendo_profissional' }
  };
}

async function pedirData(e, prefixo = '') {
  const profId = e.profissional_id === 'qualquer' ? null : e.profissional_id;
  const dias = ag.proximosDiasComVaga(e.servico_id, profId, 5);
  if (!dias.length) {
    const n = bd.lerNegocio();
    return {
      texto: `Poxa, não encontrei vagas nos próximos dias. ${n.whatsapp ? `Chama no ${n.whatsapp} que a gente dá um jeito!` : 'Tenta outro serviço ou fala com a equipe.'}`,
      opcoes: [{ rotulo: '↩️ Escolher outro serviço', valor: 'quero marcar outro serviço' }],
      estadoNovo: { ...e, etapa: 'escolhendo_servico', servico_id: null }
    };
  }
  return {
    texto: `${prefixo ? prefixo + ' ' : ''}Para que dia você quer?`,
    opcoes: dias.map(d => ({ rotulo: d.rotulo, valor: d.data, tipo: 'data' }))
      .concat([{ rotulo: '📆 Outra data', valor: 'quero outra data', tipo: 'calendário' }]),
    estadoNovo: { ...e, etapa: 'escolhendo_data' }
  };
}

async function pedirHora(e) {
  const profId = e.profissional_id === 'qualquer' ? null : e.profissional_id;
  let slots = ag.slotsLivres(e.data, e.servico_id, profId);

  if (e.periodo) {
    const filtrados = slots.filter(s => nlu.dentroDoPeriodo(s.hora, e.periodo));
    if (filtrados.length) slots = filtrados;
  }

  if (!slots.length) {
    const alternativas = ag.proximosDiasComVaga(e.servico_id, profId, 3, ag.somarDias(e.data, 1));
    if (!alternativas.length) {
      return {
        texto: `Não temos horário em ${ag.dataCurta(e.data)} nem nos dias seguintes. Quer tentar outro serviço?`,
        opcoes: [{ rotulo: '↩️ Recomeçar', valor: 'menu' }],
        estadoNovo: { ...e, etapa: 'escolhendo_data', data: null }
      };
    }
    const fechado = !ag.expediente(e.data, profId).length;
    return {
      texto: fechado
        ? `Não abrimos ${ag.dataCurta(e.data)}. Esses são os dias mais próximos com vaga:`
        : `${ag.dataCurta(e.data)} ficou lotado. Os dias mais próximos com vaga são esses:`,
      opcoes: alternativas.map(a => ({ rotulo: a.rotulo, valor: a.data, tipo: 'data' })),
      estadoNovo: { ...e, etapa: 'escolhendo_data', data: null }
    };
  }

  const amostra = distribuir(slots, 8);
  return {
    texto: `Para ${ag.dataCurta(e.data)} tenho esses horários${e.periodo ? ` de ${e.periodo}` : ''}:`,
    opcoes: amostra.map(s => ({ rotulo: s.hora, valor: s.hora, tipo: 'hora' })),
    estadoNovo: { ...e, etapa: 'escolhendo_hora' }
  };
}

/** Pega horarios espalhados pelo dia em vez dos primeiros da manha. */
function distribuir(slots, quantos) {
  if (slots.length <= quantos) return slots;
  const passo = slots.length / quantos;
  return Array.from({ length: quantos }, (_, i) => slots[Math.floor(i * passo)]);
}

async function pedirNome(e) {
  return {
    texto: 'Fechou! Qual é o seu nome?',
    opcoes: [],
    estadoNovo: { ...e, etapa: 'pedindo_nome' }
  };
}

async function pedirTelefone(e) {
  return {
    texto: `Prazer, ${String(e.nome).split(' ')[0]}! Me passa um WhatsApp com DDD pra eu enviar a confirmação.`,
    opcoes: [],
    estadoNovo: { ...e, etapa: 'pedindo_telefone' }
  };
}

async function confirmar(e) {
  const servico = bd.buscarServico(e.servico_id);
  const profId = e.profissional_id === 'qualquer' ? null : e.profissional_id;
  const slots = ag.slotsLivres(e.data, e.servico_id, profId);
  const slot = slots.find(s => s.hora === e.hora);

  if (!slot) {
    return await pedirHora({ ...e, hora: null });
  }
  const prof = profId ? bd.buscarProfissional(profId) : slot.profissionais[0];

  const resumo =
    `${servico.nome}\n` +
    `${ag.dataPorExtenso(e.data)} às ${e.hora}\n` +
    (prof?.nome ? `com ${prof.nome}\n` : '') +
    `R$ ${Number(servico.preco).toFixed(2).replace('.', ',')} · ${servico.duracao_min} min`;

  return {
    texto: `Confere pra mim:\n\n${resumo}\n\nPosso confirmar?`,
    opcoes: [
      { rotulo: '✅ Confirmar', valor: 'sim, confirmar' },
      { rotulo: '🔄 Trocar horário', valor: 'não, quero outro horário' }
    ],
    estadoNovo: { ...e, etapa: 'confirmando', profissional_id: prof?.id || null }
  };
}

async function gravar(e) {
  try {
    const agendamento = ag.agendar({
      nome: e.nome,
      telefone: e.telefone,
      servico_id: e.servico_id,
      profissional_id: e.profissional_id === 'qualquer' ? null : e.profissional_id,
      data: e.data,
      hora: e.hora,
      observacao: e.observacao,
      origem: 'chat'
    });
    notificarAgendamento(agendamento);

    const texto =
      `Pronto, ${String(e.nome).split(' ')[0]}! Seu horário está confirmado. 🎉\n\n` +
      `${agendamento.servico_nome}\n` +
      `${ag.dataPorExtenso(agendamento.data)} às ${agendamento.hora_inicio}\n` +
      (agendamento.profissional_nome ? `com ${agendamento.profissional_nome}\n` : '') +
      `Código: ${agendamento.codigo}\n\n` +
      `Vou te mandar um lembrete antes. Se precisar mudar, é só falar comigo.`;

    return {
      texto,
      opcoes: [
        { rotulo: '📅 Marcar outro', valor: 'quero marcar outro horário' },
        { rotulo: '🔎 Meus horários', valor: 'ver meus agendamentos' }
      ],
      estadoNovo: { etapa: 'inicio', nome: e.nome, telefone: e.telefone },
      acao: 'agendado',
      agendamento
    };
  } catch (erro) {
    if (erro.codigo === 'ocupado') {
      return await pedirHora({ ...e, hora: null });
    }
    return {
      texto: `Ops: ${erro.message}`,
      opcoes: [{ rotulo: '↩️ Tentar de novo', valor: 'quero marcar um horário' }],
      estadoNovo: { ...e, etapa: 'inicio' }
    };
  }
}

/* ------------------------------------------------- CONSULTA E CANCELAMENTO */

function meusAgendamentos(estado) {
  if (!estado.telefone) return null;
  const cliente = bd.buscarClientePorTelefone(estado.telefone);
  if (!cliente) return [];
  const hoje = ag.hojeLocal();
  return bd.agendamentosDoCliente(cliente.id)
    .filter(a => a.data >= hoje && ['confirmado', 'pendente'].includes(a.status));
}

async function consultarAgendamentos(estado, d) {
  if (d.telefone) estado.telefone = d.telefone;
  const lista = meusAgendamentos(estado);

  if (lista === null) {
    return {
      texto: 'Claro! Me passa o seu WhatsApp com DDD que eu procuro aqui.',
      opcoes: [],
      estadoNovo: { ...estado, etapa: 'pedindo_telefone', voltar_para: 'consultar' }
    };
  }
  if (!lista.length) {
    return {
      texto: 'Não encontrei nenhum horário marcado no seu nome. Quer marcar um agora?',
      opcoes: [{ rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' }],
      estadoNovo: { ...estado, etapa: 'inicio' }
    };
  }
  const linhas = lista.map(a =>
    `• ${a.servico_nome} — ${ag.dataCurta(a.data)} às ${a.hora_inicio}` +
    `${a.profissional_nome ? ` com ${a.profissional_nome}` : ''} (código ${a.codigo})`).join('\n');

  return {
    texto: `Você tem ${lista.length === 1 ? 'este horário marcado' : `${lista.length} horários marcados`}:\n\n${linhas}`,
    opcoes: [
      { rotulo: '📅 Marcar outro', valor: 'quero marcar outro horário' },
      { rotulo: '❌ Cancelar um', valor: 'quero cancelar' }
    ],
    estadoNovo: { ...estado, etapa: 'inicio' }
  };
}

async function iniciarCancelamento(estado, d) {
  if (d.telefone) estado.telefone = d.telefone;
  const lista = meusAgendamentos(estado);

  if (lista === null) {
    return {
      texto: 'Sem problema. Me passa o seu WhatsApp com DDD pra eu localizar o horário.',
      opcoes: [],
      estadoNovo: { ...estado, etapa: 'pedindo_telefone', voltar_para: 'cancelar' }
    };
  }
  if (!lista.length) {
    return {
      texto: 'Não achei nenhum horário ativo no seu nome pra cancelar.',
      opcoes: [{ rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' }],
      estadoNovo: { ...estado, etapa: 'inicio' }
    };
  }
  if (lista.length === 1) {
    return await efetivarCancelamento(estado, lista[0]);
  }
  return {
    texto: 'Qual deles você quer cancelar?',
    opcoes: lista.slice(0, MAX_OPCOES).map(a => ({
      rotulo: `${a.servico_nome} · ${ag.dataCurta(a.data)} ${a.hora_inicio}`,
      valor: a.codigo
    })),
    estadoNovo: { ...estado, etapa: 'cancelando', candidatos: lista.map(a => a.codigo) }
  };
}

async function passoCancelar(estado, d, texto) {
  const codigo = String(texto).trim().toUpperCase().match(/[A-Z0-9]{6}/)?.[0];
  const alvo = codigo && bd.buscarAgendamentoPorCodigo(codigo);
  if (!alvo || !(estado.candidatos || []).includes(alvo.codigo)) {
    return {
      texto: 'Não identifiquei qual horário. Toca em um dos botões, por favor.',
      opcoes: (estado.candidatos || []).map(c => {
        const a = bd.buscarAgendamentoPorCodigo(c);
        return { rotulo: `${a.servico_nome} · ${ag.dataCurta(a.data)} ${a.hora_inicio}`, valor: c };
      }),
      estadoNovo: estado
    };
  }
  return await efetivarCancelamento(estado, alvo);
}

async function efetivarCancelamento(estado, agendamento) {
  try {
    ag.cancelar(agendamento.id, 'cliente');
    notificarCancelamento(agendamento);
    return {
      texto: `Cancelado: ${agendamento.servico_nome} de ${ag.dataCurta(agendamento.data)} às ${agendamento.hora_inicio}. ` +
             `Quando quiser voltar, é só me chamar. 😉`,
      opcoes: [{ rotulo: '📅 Marcar outro dia', valor: 'quero marcar um horário' }],
      estadoNovo: { etapa: 'inicio', nome: estado.nome, telefone: estado.telefone },
      acao: 'cancelado',
      agendamento
    };
  } catch (erro) {
    return {
      texto: erro.message,
      opcoes: [{ rotulo: '💬 Falar com a equipe', valor: 'quero falar com um atendente' }],
      estadoNovo: { ...estado, etapa: 'inicio' }
    };
  }
}

async function iniciarRemarcacao(estado, d) {
  const lista = meusAgendamentos(estado);
  if (lista === null) {
    return {
      texto: 'Vamos remarcar! Me passa o seu WhatsApp com DDD.',
      opcoes: [],
      estadoNovo: { ...estado, etapa: 'pedindo_telefone', voltar_para: 'remarcar' }
    };
  }
  if (!lista.length) {
    return {
      texto: 'Não encontrei horário ativo pra remarcar. Quer marcar um novo?',
      opcoes: [{ rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' }],
      estadoNovo: { ...estado, etapa: 'inicio' }
    };
  }
  // Cancela o antigo e conduz para um novo, mantendo o servico escolhido
  const alvo = lista[0];
  try { ag.cancelar(alvo.id, 'admin'); } catch { /* fora do prazo: segue mesmo assim */ }
  return await pedirData(
    { ...estado, etapa: 'escolhendo_data', servico_id: alvo.servico_id, profissional_id: alvo.profissional_id, data: d.data || null },
    `Vamos remarcar seu ${alvo.servico_nome}.`
  );
}

/* -------------------------------------------------------------- AVALIACAO */

async function iniciarAvaliacao(estado, conversa) {
  const cliente = estado.telefone ? bd.buscarClientePorTelefone(estado.telefone) : null;
  const ultimo = cliente
    ? bd.agendamentosDoCliente(cliente.id).find(a => a.status === 'concluido' && !bd.avaliacaoDoAgendamento(a.id))
    : null;
  return {
    texto: ultimo
      ? `Que bom! Como foi seu ${ultimo.servico_nome}? Dá uma nota de 1 a 5. ⭐`
      : 'Adoraríamos saber sua opinião! Dê uma nota de 1 a 5 para o seu último atendimento.',
    opcoes: [1, 2, 3, 4, 5].map(n => ({ rotulo: '⭐'.repeat(n), valor: String(n) })),
    estadoNovo: { ...estado, etapa: 'avaliando', agendamento_avaliado: ultimo?.id || null }
  };
}

async function passoAvaliar(estado, d, texto) {
  if (!estado.nota_recebida) {
    const nota = d.nota;
    if (!nota) {
      return {
        texto: 'Me dá só um número de 1 a 5, por favor. 🙂',
        opcoes: [1, 2, 3, 4, 5].map(n => ({ rotulo: '⭐'.repeat(n), valor: String(n) })),
        estadoNovo: estado
      };
    }
    return {
      texto: nota >= 4
        ? 'Que ótimo! Quer deixar um comentário? (ou escreve "pular")'
        : 'Obrigado pela sinceridade. Conta o que podemos melhorar? (ou escreve "pular")',
      opcoes: [{ rotulo: 'Pular', valor: 'pular' }],
      estadoNovo: { ...estado, nota_recebida: nota }
    };
  }

  const comentario = /^(pular|nao|nada|sem comentario)$/i.test(texto.trim()) ? null : texto.trim();
  const cliente = estado.telefone ? bd.buscarClientePorTelefone(estado.telefone) : null;
  bd.criarAvaliacao({
    agendamento_id: estado.agendamento_avaliado || null,
    cliente_id: cliente?.id || null,
    nota: estado.nota_recebida,
    comentario,
    canal: 'chat'
  });
  return {
    texto: estado.nota_recebida >= 4
      ? 'Muito obrigado! Sua avaliação ajuda demais a gente. 💜'
      : 'Obrigado por contar. Vamos levar isso pra equipe e melhorar.',
    opcoes: [{ rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' }],
    estadoNovo: { etapa: 'inicio', nome: estado.nome, telefone: estado.telefone },
    acao: 'avaliado'
  };
}

/* ----------------------------------------------------------- PRIMEIRA MSG */

export function saudacaoInicial() {
  const n = bd.lerNegocio();
  return {
    texto: n.boas_vindas ||
      `Oi! 👋 Sou o assistente da ${n.nome}. Posso marcar seu horário em menos de um minuto. Como posso ajudar?`,
    opcoes: [
      { rotulo: '📅 Marcar horário', valor: 'quero marcar um horário' },
      { rotulo: '🔎 Meus horários', valor: 'quero ver meus agendamentos' },
      { rotulo: '💰 Preços', valor: 'quais são os preços' },
      { rotulo: '📍 Onde fica', valor: 'onde vocês ficam' }
    ]
  };
}
