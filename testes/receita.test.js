// Testes da camada que protege a receita: sinal por PIX, risco de falta,
// lista de espera, reativação e fechamento de caixa.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANCO = path.join(raiz, 'teste-receita.db');
for (const sufixo of ['', '-wal', '-shm']) rmSync(BANCO + sufixo, { force: true });
process.env.DB_PATH = BANCO;
process.env.TZ_NEGOCIO = 'America/Sao_Paulo';

const bd  = await import('../db.js');
const ag  = await import('../agenda.js');
const pix = await import('../pix.js');
const rec = await import('../receita.js');

let corte, platinado, rafa, hoje;

before(() => {
  hoje = ag.hojeLocal();
  bd.salvarNegocio({
    nome: 'Estúdio Teste', intervalo_slots: 30, antecedencia_min_h: 0, antecedencia_max_d: 60,
    pix_chave: 'teste@estudio.com.br', pix_nome: 'Estudio Teste', pix_cidade: 'Sao Paulo',
    sinal_ativo: 1, sinal_so_risco: 1, fidelidade_meta: 5, fidelidade_premio: 'um corte grátis'
  });
  corte = bd.salvarServico({ nome: 'Corte', duracao_min: 30, preco: 50, sinal: 0 });
  platinado = bd.salvarServico({ nome: 'Platinado', duracao_min: 60, preco: 200, sinal: 50 });
  rafa = bd.salvarProfissional({ nome: 'Rafael Moura', comissao: 50, servicos: [corte.id, platinado.id] });
  bd.definirHorarios(null, [0, 1, 2, 3, 4, 5, 6]
    .map(d => ({ dia_semana: d, abre: '09:00', fecha: '18:00' })));
});

/* ================================================================== PIX */

describe('código PIX copia e cola', () => {
  test('o CRC bate com o vetor canônico do padrão', () => {
    assert.equal(pix.crc16('123456789'), '29B1');
  });

  test('gera um código íntegro e com os campos obrigatórios', () => {
    const codigo = pix.gerarCodigo({
      chave: 'teste@estudio.com.br', nome: 'Estudio Teste',
      cidade: 'Sao Paulo', valor: 50, txid: 'ABC123'
    });
    assert.ok(pix.conferir(codigo), 'o CRC do próprio código precisa fechar');
    assert.ok(codigo.startsWith('000201'), 'começa com o indicador de formato');
    assert.match(codigo, /0014br\.gov\.bcb\.pix/, 'declara o arranjo PIX');
    assert.match(codigo, /5303986/, 'moeda precisa ser real');
    assert.match(codigo, /54055?0\.00/, 'valor com duas casas');
    assert.match(codigo, /5802BR/);
  });

  test('um caractere trocado invalida o código', () => {
    const codigo = pix.gerarCodigo({ chave: 'a@b.com', nome: 'X', cidade: 'Y', valor: 10 });
    const adulterado = codigo.replace('5303986', '5303840');
    assert.ok(!pix.conferir(adulterado));
  });

  test('tira acento e limita o tamanho dos campos', () => {
    const codigo = pix.gerarCodigo({
      chave: 'a@b.com', valor: 1,
      nome: 'Salão da Esquina Cabeleireiros e Barbearia Ltda',
      cidade: 'São José dos Campos'
    });
    assert.ok(pix.conferir(codigo));
    assert.ok(!/[À-ÿ]/.test(codigo), 'não pode sobrar acento');
    const nome = codigo.match(/59(\d{2})/);
    assert.ok(Number(nome[1]) <= 25, 'nome do recebedor cabe em 25 caracteres');
  });

  test('sem valor o pagador escolhe quanto pagar', () => {
    const codigo = pix.gerarCodigo({ chave: 'a@b.com', nome: 'X', cidade: 'Y' });
    assert.ok(!codigo.includes('54'), 'campo de valor não deve existir');
    assert.ok(pix.conferir(codigo));
  });

  test('reconhece e recusa chaves', () => {
    assert.equal(pix.validarChave('a@b.com.br').tipo, 'e-mail');
    assert.equal(pix.validarChave('12.345.678/0001-99').tipo, 'CNPJ');
    assert.equal(pix.validarChave('123e4567-e89b-12d3-a456-426655440000').tipo, 'aleatória');
    assert.equal(pix.validarChave('').ok, false);
    assert.equal(pix.validarChave('minha chave').ok, false);
  });
});

/* ======================================================= RISCO E SINAL */

describe('risco de falta e sinal', () => {
  test('classifica pelo histórico, não por regra fixa', () => {
    assert.equal(rec.riscoDeFalta({ total_visitas: 0, total_faltas: 0 }).nivel, 'novo');
    assert.equal(rec.riscoDeFalta({ total_visitas: 12, total_faltas: 0 }).nivel, 'baixo');
    assert.equal(rec.riscoDeFalta({ total_visitas: 12, total_faltas: 1 }).nivel, 'medio');
    assert.equal(rec.riscoDeFalta({ total_visitas: 4, total_faltas: 3 }).nivel, 'alto');
  });

  test('só cobra sinal de quem o negócio configurou para cobrar', () => {
    const novo = { total_visitas: 0, total_faltas: 0 };
    const fiel = { total_visitas: 20, total_faltas: 0 };

    assert.equal(rec.sinalDevido(platinado, novo), 50, 'cliente novo paga sinal');
    assert.equal(rec.sinalDevido(platinado, fiel), 0, 'cliente fiel não paga');
    assert.equal(rec.sinalDevido(corte, novo), 0, 'serviço sem sinal nunca cobra');

    bd.salvarNegocio({ sinal_so_risco: 0 });
    assert.equal(rec.sinalDevido(platinado, fiel), 50, 'sem filtro, todo mundo paga');
    bd.salvarNegocio({ sinal_so_risco: 1 });

    bd.salvarNegocio({ sinal_ativo: 0 });
    assert.equal(rec.sinalDevido(platinado, novo), 0, 'desligado não cobra ninguém');
    bd.salvarNegocio({ sinal_ativo: 1 });
  });

  test('agendamento com sinal nasce pendente e carrega o código PIX', () => {
    const a = ag.agendar({ nome: 'Novo Cliente', telefone: '11955550001',
                           servico_id: platinado.id, profissional_id: rafa.id,
                           data: ag.somarDias(hoje, 1), hora: '10:00' });
    assert.equal(a.sinal, 50);
    assert.equal(a.status, 'pendente', 'o horário fica reservado, não confirmado');

    const cobranca = rec.cobrancaDoAgendamento(a);
    assert.equal(cobranca.valor, 50);
    assert.ok(pix.conferir(cobranca.codigo));
    assert.ok(cobranca.codigo.includes(a.codigo), 'o código do agendamento volta no extrato');
  });

  test('encaixe feito pelo dono não cobra sinal', () => {
    const a = ag.agendar({ nome: 'Outro Novo', telefone: '11955550002',
                           servico_id: platinado.id, profissional_id: rafa.id,
                           data: ag.somarDias(hoje, 1), hora: '14:00', origem: 'admin' });
    assert.equal(a.sinal, 0);
    assert.equal(a.status, 'confirmado');
  });
});

/* ======================================================= LISTA DE ESPERA */

describe('lista de espera', () => {
  test('entra na fila e não duplica', () => {
    const e = rec.entrarNaEspera({
      nome: 'Paula Reis', telefone: '11955550010', servico_id: corte.id,
      data_de: hoje, data_ate: ag.somarDias(hoje, 10), periodos: ['tarde']
    });
    assert.equal(e.status, 'aguardando');
    const repetida = rec.entrarNaEspera({
      nome: 'Paula Reis', telefone: '11955550010', servico_id: corte.id,
      data_de: hoje, data_ate: ag.somarDias(hoje, 10)
    });
    assert.equal(repetida.id, e.id, 'a mesma pessoa não entra duas vezes na mesma fila');
  });

  test('cancelamento avisa quem estava esperando, na ordem', () => {
    const dia = ag.somarDias(hoje, 3);
    rec.entrarNaEspera({ nome: 'Primeiro Fila', telefone: '11955550011',
                         servico_id: corte.id, data_de: dia, data_ate: dia });
    rec.entrarNaEspera({ nome: 'Segundo Fila', telefone: '11955550012',
                         servico_id: corte.id, data_de: dia, data_ate: dia });

    const antes = bd.listarOutbox({ status: 'pendente' }).length;
    const avisados = rec.avisarEspera({ data: dia, hora: '15:00',
                                        servico_id: corte.id, profissional_id: rafa.id });
    assert.ok(avisados >= 2);

    const novas = bd.listarOutbox({ status: 'pendente' }).slice(0, avisados);
    assert.ok(novas.some(m => m.tipo === 'espera'), 'a mensagem entra na fila de envio');
    assert.ok(bd.listarOutbox({ status: 'pendente' }).length > antes);

    const fila = bd.listarEspera().filter(e => e.cliente_nome.includes('Fila'));
    assert.ok(fila.every(e => e.status === 'avisado'));
    assert.equal(fila[0].vaga_hora, '15:00');
  });

  test('respeita o período que o cliente pediu', () => {
    const dia = ag.somarDias(hoje, 4);
    const e = rec.entrarNaEspera({ nome: 'So De Manha', telefone: '11955550013',
                                   servico_id: corte.id, data_de: dia, data_ate: dia,
                                   periodos: ['manha'] });
    assert.equal(rec.avisarEspera({ data: dia, hora: '16:00', servico_id: corte.id }), 0,
                 'vaga à tarde não serve para quem só pode de manhã');
    assert.equal(bd.buscarEspera(e.id).status, 'aguardando');

    assert.equal(rec.avisarEspera({ data: dia, hora: '09:30', servico_id: corte.id }), 1);
    assert.equal(bd.buscarEspera(e.id).status, 'avisado');
  });

  test('ignora quem pediu outro serviço ou outra data', () => {
    const dia = ag.somarDias(hoje, 5);
    rec.entrarNaEspera({ nome: 'Outro Servico', telefone: '11955550014',
                         servico_id: platinado.id, data_de: dia, data_ate: dia });
    assert.equal(rec.avisarEspera({ data: dia, hora: '10:00', servico_id: corte.id }), 0);
    assert.equal(rec.avisarEspera({ data: ag.somarDias(hoje, 20), hora: '10:00', servico_id: platinado.id }), 0);
  });
});

/* ============================================================ REATIVAÇÃO */

describe('reativação de clientes', () => {
  test('acha quem passou do próprio ritmo, não de uma regra fixa', () => {
    // Vem a cada 14 dias e sumiu há 60
    const sumiu = bd.garantirCliente('Cliente Sumido', '11955550020');
    for (const dias of [102, 88, 74, 60]) {
      bd.criarAgendamento({
        cliente_id: sumiu.id, servico_id: corte.id, profissional_id: rafa.id,
        data: ag.somarDias(hoje, -dias), hora_inicio: '10:00', hora_fim: '10:30',
        preco: 50, status: 'concluido'
      });
    }
    // Vem a cada 90 dias e sumiu há 60: ainda está no prazo dele
    const noPrazo = bd.garantirCliente('Cliente No Prazo', '11955550021');
    for (const dias of [330, 240, 150, 60]) {
      bd.criarAgendamento({
        cliente_id: noPrazo.id, servico_id: corte.id, profissional_id: rafa.id,
        data: ag.somarDias(hoje, -dias), hora_inicio: '11:00', hora_fim: '11:30',
        preco: 50, status: 'concluido'
      });
    }

    const lista = rec.paraReativar();
    const ids = lista.map(c => c.id);
    assert.ok(ids.includes(sumiu.id), 'quem vem a cada 14 dias e sumiu há 60 precisa aparecer');
    assert.ok(!ids.includes(noPrazo.id), 'quem vem a cada 90 dias não está atrasado');

    const alvo = lista.find(c => c.id === sumiu.id);
    assert.match(alvo.texto, /a cada 14 dias/, 'a mensagem cita o ritmo real do cliente');
    assert.equal(alvo.dias_sumido, 60);
  });

  test('quem já tem horário marcado sai da lista', () => {
    const lista1 = rec.paraReativar();
    const alvo = lista1[0];
    ag.agendar({ nome: alvo.nome, telefone: alvo.telefone, servico_id: corte.id,
                 profissional_id: rafa.id, data: ag.somarDias(hoje, 2), hora: '09:00' });
    assert.ok(!rec.paraReativar().some(c => c.id === alvo.id));
  });

  test('disparar coloca as mensagens na fila para revisão', () => {
    const lista = rec.paraReativar();
    if (!lista.length) return;
    const antes = bd.listarOutbox({ status: 'pendente' }).length;
    const n = rec.dispararReativacao([lista[0].id]);
    assert.equal(n, 1);
    assert.equal(bd.listarOutbox({ status: 'pendente' }).length, antes + 1);
  });
});

/* ================================================================ CAIXA */

describe('fechamento do caixa', () => {
  test('soma serviços, extras e calcula a comissão', () => {
    const dia = ag.somarDias(hoje, -1);
    const cliente = bd.garantirCliente('Pagante Um', '11955550030');
    const a = bd.criarAgendamento({
      cliente_id: cliente.id, servico_id: corte.id, profissional_id: rafa.id,
      data: dia, hora_inicio: '10:00', hora_fim: '10:30', preco: 50, status: 'concluido'
    });
    bd.atualizarAgendamento(a.id, { valor_extra: 30, forma_pagamento: 'pix' });
    bd.criarLancamento({ data: dia, tipo: 'produto', descricao: 'Pomada',
                         valor: 20, forma: 'dinheiro', profissional_id: rafa.id });

    const c = bd.fechamentoDoDia(dia);
    assert.equal(c.total, 100, '50 do serviço + 30 de extra + 20 de produto');
    assert.equal(c.comissoes, 50, 'Rafael fica com 50% de 100');
    assert.equal(c.liquido, 50);
    assert.equal(c.por_forma.pix, 80);
    assert.equal(c.por_forma.dinheiro, 20);

    const dele = c.equipe.find(p => p.id === rafa.id);
    assert.equal(dele.atendimentos, 1);
    assert.equal(dele.bruto, 100);
  });

  test('dia sem movimento devolve zeros, não erro', () => {
    const c = bd.fechamentoDoDia(ag.somarDias(hoje, -400));
    assert.equal(c.total, 0);
    assert.deepEqual(c.equipe, []);
  });
});

/* =========================================================== FIDELIDADE */

describe('fidelidade', () => {
  test('conta os atendimentos e diz quanto falta', () => {
    const cliente = bd.garantirCliente('Fiel Cliente', '11955550040');
    for (let i = 1; i <= 7; i++) {
      bd.criarAgendamento({
        cliente_id: cliente.id, servico_id: corte.id, profissional_id: rafa.id,
        data: ag.somarDias(hoje, -i * 7), hora_inicio: '16:00', hora_fim: '16:30',
        preco: 50, status: 'concluido'
      });
    }
    const f = rec.fidelidade(cliente.id);
    assert.equal(f.meta, 5);
    assert.equal(f.premios_disponiveis, 1, '7 atendimentos com meta 5 dá 1 prêmio');
    assert.equal(f.feitos, 2);
    assert.equal(f.faltam, 3);
  });

  test('desligado quando a meta é zero', () => {
    bd.salvarNegocio({ fidelidade_meta: 0 });
    assert.equal(rec.fidelidade(bd.listarClientes()[0].id), null);
    bd.salvarNegocio({ fidelidade_meta: 5 });
  });
});
