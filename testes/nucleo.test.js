// Testes do núcleo: interpretação de linguagem, motor de horários e fluxo do assistente.
// Roda em banco próprio: node --test testes/
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANCO = path.join(raiz, 'teste.db');
for (const sufixo of ['', '-wal', '-shm']) rmSync(BANCO + sufixo, { force: true });
process.env.DB_PATH = BANCO;
process.env.TZ_NEGOCIO = 'America/Sao_Paulo';

const bd  = await import('../db.js');
const ag  = await import('../agenda.js');
const nlu = await import('../interpretar.js');
const { conversar } = await import('../assistente.js');

let corte, barba, rafa, hoje;

before(() => {
  hoje = ag.hojeLocal();
  bd.salvarNegocio({
    nome: 'Teste', intervalo_slots: 30, antecedencia_min_h: 0,
    antecedencia_max_d: 60, cancelamento_min_h: 2, pedir_avaliacao: 0, lembrete_h: 24
  });
  corte = bd.salvarServico({ nome: 'Corte masculino', duracao_min: 30, preco: 50 });
  barba = bd.salvarServico({ nome: 'Barba completa', duracao_min: 60, preco: 80 });
  rafa  = bd.salvarProfissional({ nome: 'Rafael Moura', servicos: [corte.id, barba.id] });
  // Aberto todos os dias, 09:00 às 18:00
  bd.definirHorarios(null, [0, 1, 2, 3, 4, 5, 6].map(d => ({ dia_semana: d, abre: '09:00', fecha: '18:00' })));
});

/* --------------------------------------------------------- INTERPRETAÇÃO */

describe('interpretação de português', () => {
  test('entende datas relativas', () => {
    assert.equal(nlu.extrairData('quero hoje', hoje), hoje);
    assert.equal(nlu.extrairData('pode ser amanhã?', hoje), ag.somarDias(hoje, 1));
    assert.equal(nlu.extrairData('depois de amanhã', hoje), ag.somarDias(hoje, 2));
  });

  test('entende datas explícitas e nunca devolve o passado', () => {
    const data = nlu.extrairData('marca dia 15/03', hoje);
    assert.match(data, /^\d{4}-03-15$/);
    assert.ok(data >= hoje, 'a data extraída precisa ser futura');
  });

  test('entende dia da semana', () => {
    const sexta = nlu.extrairData('pode ser sexta', hoje);
    assert.equal(ag.diaSemana(sexta), 5);
    assert.ok(sexta >= hoje);
  });

  test('entende horários em vários formatos', () => {
    assert.equal(nlu.extrairHora('às 15h'), '15:00');
    assert.equal(nlu.extrairHora('14:30 tá bom'), '14:30');
    assert.equal(nlu.extrairHora('9h30'), '09:30');
    assert.equal(nlu.extrairHora('umas 3 da tarde'), '15:00');
    assert.equal(nlu.extrairHora('meio-dia'), '12:00');
    assert.equal(nlu.extrairHora('não sei ainda'), null);
  });

  test('classifica a intenção', () => {
    assert.equal(nlu.detectarIntencao('quero marcar um horário'), 'agendar');
    assert.equal(nlu.detectarIntencao('preciso cancelar'), 'cancelar');
    assert.equal(nlu.detectarIntencao('quanto custa o corte?'), 'preco');
    assert.equal(nlu.detectarIntencao('que horas vocês abrem'), 'horario_fn');
    assert.equal(nlu.detectarIntencao('onde vocês ficam'), 'endereco');
    assert.equal(nlu.detectarIntencao('quero falar com um atendente'), 'humano');
  });

  test('distingue sim de não', () => {
    for (const s of ['sim', 'confirma', 'pode ser', 'beleza', 'ok']) {
      assert.ok(nlu.ehConfirmacao(s), `"${s}" deveria ser confirmação`);
    }
    for (const n of ['não', 'nao quero', 'trocar horário', 'melhor não']) {
      assert.ok(nlu.ehNegacao(n), `"${n}" deveria ser negação`);
      assert.ok(!nlu.ehConfirmacao(n), `"${n}" não pode ser confirmação`);
    }
  });

  test('casa o serviço pelo texto do cliente', () => {
    const servicos = bd.listarServicos();
    assert.equal(nlu.casarServico('quero um corte masculino', servicos)?.id, corte.id);
    assert.equal(nlu.casarServico('fazer a barba', servicos)?.id, barba.id);
    assert.equal(nlu.casarServico('bom dia', servicos), null);
  });
});

/* --------------------------------------------------------- MOTOR DE AGENDA */

describe('motor de horários', () => {
  test('gera horários dentro do expediente', () => {
    const amanha = ag.somarDias(hoje, 1);
    const slots = ag.slotsLivres(amanha, corte.id);
    assert.ok(slots.length > 0);
    assert.equal(slots[0].hora, '09:00');
    assert.equal(slots.at(-1).hora, '17:30', 'o último corte de 30min começa 17:30');
  });

  test('respeita a duração do serviço', () => {
    const amanha = ag.somarDias(hoje, 1);
    const slots = ag.slotsLivres(amanha, barba.id);
    assert.equal(slots.at(-1).hora, '17:00', 'a barba dura 60min, então para às 17:00');
  });

  test('remove horário ocupado e não deixa dois na mesma hora', () => {
    const dia = ag.somarDias(hoje, 2);
    const antes = ag.slotsLivres(dia, corte.id).length;

    ag.agendar({ nome: 'Cliente Um', telefone: '11999990001', servico_id: corte.id,
                 profissional_id: rafa.id, data: dia, hora: '10:00' });

    const depois = ag.slotsLivres(dia, corte.id);
    assert.equal(depois.length, antes - 1);
    assert.ok(!depois.some(s => s.hora === '10:00'), '10:00 deveria ter sumido');

    assert.throws(
      () => ag.agendar({ nome: 'Cliente Dois', telefone: '11999990002', servico_id: corte.id,
                         profissional_id: rafa.id, data: dia, hora: '10:00' }),
      /acabou de ser ocupado/i
    );
  });

  test('serviço longo não invade agendamento existente', () => {
    const dia = ag.somarDias(hoje, 3);
    ag.agendar({ nome: 'Cliente Três', telefone: '11999990003', servico_id: corte.id,
                 profissional_id: rafa.id, data: dia, hora: '10:00' });
    const slots = ag.slotsLivres(dia, barba.id);
    assert.ok(!slots.some(s => s.hora === '09:30'), 'barba às 9:30 terminaria 10:30, invadindo');
    assert.ok(!slots.some(s => s.hora === '10:00'));
    assert.ok(slots.some(s => s.hora === '10:30'), '10:30 é livre');
  });

  test('bloqueio derruba os horários do período', () => {
    const dia = ag.somarDias(hoje, 4);
    const antes = ag.slotsLivres(dia, corte.id).length;
    bd.salvarBloqueio({ data_inicio: dia, data_fim: dia, hora_inicio: '09:00', hora_fim: '12:00', motivo: 'Treinamento' });
    const depois = ag.slotsLivres(dia, corte.id);
    assert.ok(depois.length < antes);
    assert.ok(!depois.some(s => s.hora < '12:00'), 'a manhã inteira deveria estar bloqueada');
    assert.ok(depois.some(s => s.hora === '13:00'), 'a tarde continua livre');
  });

  test('não agenda no passado nem além do limite', () => {
    assert.equal(ag.slotsLivres(ag.somarDias(hoje, -1), corte.id).length, 0);
    assert.equal(ag.slotsLivres(ag.somarDias(hoje, 500), corte.id).length, 0);
  });

  test('valida os dados do cliente', () => {
    const dia = ag.somarDias(hoje, 5);
    assert.throws(() => ag.agendar({ nome: 'X', telefone: '123', servico_id: corte.id,
                                     data: dia, hora: '11:00' }), /telefone/i);
    assert.throws(() => ag.agendar({ nome: '', telefone: '11999990009', servico_id: corte.id,
                                     data: dia, hora: '11:00' }), /nome/i);
  });

  test('cancelar libera o horário de volta', () => {
    const dia = ag.somarDias(hoje, 6);
    const a = ag.agendar({ nome: 'Cliente Seis', telefone: '11999990006', servico_id: corte.id,
                           profissional_id: rafa.id, data: dia, hora: '14:00' });
    assert.ok(!ag.slotsLivres(dia, corte.id).some(s => s.hora === '14:00'));
    ag.cancelar(a.id, 'admin');
    assert.ok(ag.slotsLivres(dia, corte.id).some(s => s.hora === '14:00'));
  });

  test('remarcar move o atendimento', () => {
    const dia = ag.somarDias(hoje, 7);
    const a = ag.agendar({ nome: 'Cliente Sete', telefone: '11999990007', servico_id: corte.id,
                           profissional_id: rafa.id, data: dia, hora: '15:00' });
    const novo = ag.remarcar(a.id, dia, '16:00');
    assert.equal(novo.hora_inicio, '16:00');
    assert.equal(novo.hora_fim, '16:30');
    assert.ok(ag.slotsLivres(dia, corte.id).some(s => s.hora === '15:00'), '15:00 voltou a ficar livre');
  });
});

/* ------------------------------------------------------------- ASSISTENTE */

describe('assistente conversacional', () => {
  test('conduz o cliente do "oi" até o horário confirmado', async () => {
    const conversa = bd.abrirConversa({ telefone: null, nome: null, canal: 'teste' });
    const diz = t => conversar(conversa.id, t);

    let r = await diz('oi');
    assert.match(r.texto, /assistente|ajudar|precisa/i);

    r = await diz('quero marcar um corte masculino');
    assert.ok(/dia|quando/i.test(r.texto), `esperava pergunta de data, veio: ${r.texto}`);

    const alvo = ag.somarDias(hoje, 8);
    r = await diz(alvo);
    assert.ok(r.opcoes.length > 0, 'deveria oferecer horários');
    assert.equal(r.estado, 'escolhendo_hora');

    const hora = r.opcoes[0].valor;
    r = await diz(hora);
    assert.equal(r.estado, 'pedindo_nome');

    r = await diz('Ana Beatriz');
    assert.equal(r.estado, 'pedindo_telefone');

    r = await diz('(11) 98888-7777');
    assert.equal(r.estado, 'confirmando');
    assert.match(r.texto, /confirmar/i);

    r = await diz('sim');
    assert.equal(r.acao, 'agendado');
    assert.equal(r.agendamento.data, alvo);
    assert.equal(r.agendamento.hora_inicio, hora);
    assert.equal(r.agendamento.origem, 'chat');
    assert.equal(r.agendamento.cliente_telefone, '11988887777');
    assert.match(r.texto, new RegExp(r.agendamento.codigo));
  });

  test('lista e cancela o horário do cliente', async () => {
    const conversa = bd.abrirConversa({ telefone: '11988887777', nome: 'Ana Beatriz', canal: 'teste' });
    const diz = t => conversar(conversa.id, t);

    let r = await diz('quais são meus agendamentos?');
    assert.match(r.texto, /Corte masculino/i);

    r = await diz('quero cancelar');
    assert.equal(r.acao, 'cancelado');
    assert.match(r.texto, /cancelado/i);
  });

  test('responde preço sem inventar valores', async () => {
    const conversa = bd.abrirConversa({ telefone: null, nome: null, canal: 'teste' });
    const r = await conversar(conversa.id, 'quanto custa?');
    assert.match(r.texto, /50,00/);
    assert.match(r.texto, /80,00/);
  });

  test('oferece outro dia quando o escolhido está lotado', async () => {
    const dia = ag.somarDias(hoje, 9);
    // Lota o dia inteiro
    let n = 0;
    while (true) {
      const livres = ag.slotsLivres(dia, corte.id, rafa.id);
      if (!livres.length) break;
      ag.agendar({ nome: `Fila ${n}`, telefone: `1197777${String(n).padStart(4, '0')}`,
                   servico_id: corte.id, profissional_id: rafa.id, data: dia, hora: livres[0].hora });
      if (++n > 40) break;
    }
    assert.equal(ag.slotsLivres(dia, corte.id).length, 0, 'o dia deveria estar lotado');

    const conversa = bd.abrirConversa({ telefone: null, nome: null, canal: 'teste' });
    await conversar(conversa.id, 'quero um corte masculino');
    const r = await conversar(conversa.id, dia);
    assert.match(r.texto, /lotado|não temos/i);
    assert.ok(r.opcoes.length > 0, 'deveria sugerir alternativas');
  });
});

/* ------------------------------------------------------------ INDICADORES */

describe('indicadores do painel', () => {
  test('calcula os números do negócio', () => {
    const i = bd.indicadores(hoje);
    assert.equal(typeof i.hoje, 'number');
    assert.ok(i.total_mes >= 0);
    assert.ok(i.taxa_ia >= 0 && i.taxa_ia <= 100);
  });
});
