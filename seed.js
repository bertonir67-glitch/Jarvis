// Popula o sistema com um negocio de exemplo pronto para demonstracao.
//   node seed.js           -> so preenche se estiver vazio
//   node seed.js --reset   -> apaga tudo e recria
import bancoDeDados, * as bd from './db.js';
import * as ag from './agenda.js';
import { notificarAgendamento } from './mensagens.js';

const RESET = process.argv.includes('--reset');

if (RESET) {
  for (const t of ['outbox', 'mensagens', 'conversas', 'avaliacoes', 'lancamentos',
                   'espera', 'agenda_externa', 'sincronizacoes', 'agendamentos',
                   'clientes', 'bloqueios', 'horarios', 'profissional_servico',
                   'profissionais', 'servicos']) {
    bancoDeDados.exec(`DELETE FROM ${t}`);
  }
  console.log('Base limpa.');
}

if (!RESET && bd.listarServicos(true).length) {
  console.log('Ja existem dados. Use "node seed.js --reset" para recomecar do zero.');
  process.exit(0);
}

/* ------------------------------------------------------------- NEGOCIO */

bd.salvarNegocio({
  nome: 'Barbearia Navalha de Ouro',
  segmento: 'barbearia',
  telefone: '1133224455',
  whatsapp: '11987654321',
  endereco: 'Rua das Palmeiras, 245 - Vila Mariana, São Paulo/SP',
  instagram: '@navalhadeouro',
  cor: '#5f7a6e',
  sobre: 'Barbearia de bairro desde 2014. Corte, barba e cuidado com hora marcada, sem fila e sem pressa.',
  boas_vindas: 'Olá! Aqui é da Navalha de Ouro. Marco seu horário em menos de um minuto — é só me dizer o que você quer.',
  personalidade_ia: 'descontraido',
  logo: null,
  capa: null,
  base_neutra: 'areia',
  fonte: 'jakarta',
  cantos: 'suave',
  titulo_portal: null,
  rodape: null,
  politica: 'Cancelamentos e remarcações pelo site até 3h antes do horário.',
  mostrar_precos: 1,
  mostrar_equipe: 1,
  calendario_url: null,
  pix_chave: 'contato@navalhadeouro.com.br',
  pix_nome: 'Navalha de Ouro',
  pix_cidade: 'Sao Paulo',
  sinal_ativo: 1,
  sinal_so_risco: 1,
  fidelidade_meta: 10,
  fidelidade_premio: 'um corte grátis',
  intervalo_slots: 30,
  antecedencia_min_h: 1,
  antecedencia_max_d: 45,
  cancelamento_min_h: 3,
  lembrete_h: 24,
  pedir_avaliacao: 1
});

/* ------------------------------------------------------------ SERVICOS */

const servicos = [
  { nome: 'Corte masculino',      descricao: 'Máquina, tesoura e finalização', duracao_min: 30, preco: 45,  categoria: 'cabelo', ordem: 1 },
  { nome: 'Barba completa',       descricao: 'Toalha quente, navalha e balm',  duracao_min: 30, preco: 40,  categoria: 'barba',  ordem: 2 },
  { nome: 'Corte + Barba',        descricao: 'O combo da casa',                duracao_min: 60, preco: 75,  categoria: 'combo',  ordem: 3, sinal: 20 },
  { nome: 'Pezinho',              descricao: 'Acabamento rápido',              duracao_min: 15, preco: 20,  categoria: 'cabelo', ordem: 4 },
  { nome: 'Sobrancelha na navalha', descricao: 'Design masculino',             duracao_min: 15, preco: 25,  categoria: 'estetica', ordem: 5 },
  { nome: 'Platinado',            descricao: 'Descoloração e matização',       duracao_min: 120, preco: 220, categoria: 'quimica', ordem: 6, sinal: 50 },
  { nome: 'Corte infantil',       descricao: 'Até 10 anos, com paciência',     duracao_min: 30, preco: 40,  categoria: 'cabelo', ordem: 7 }
].map(s => bd.salvarServico(s));

const porNome = n => servicos.find(s => s.nome === n).id;

/* -------------------------------------------------------- PROFISSIONAIS */

const equipe = [
  {
    nome: 'Rafael Moura', apelido: 'Rafa', telefone: '11991110001', cor: '#5f7a6e', comissao: 50,
    servicos: servicos.map(s => s.id)
  },
  {
    nome: 'Diego Nunes', apelido: 'Didi', telefone: '11991110002', cor: '#7d8fa3', comissao: 45,
    servicos: [porNome('Corte masculino'), porNome('Barba completa'), porNome('Corte + Barba'),
               porNome('Pezinho'), porNome('Corte infantil')]
  },
  {
    nome: 'Camila Prado', apelido: 'Cacau', telefone: '11991110003', cor: '#a08464', comissao: 55,
    servicos: [porNome('Corte masculino'), porNome('Platinado'),
               porNome('Sobrancelha na navalha'), porNome('Corte infantil')]
  }
].map(p => bd.salvarProfissional(p));

/* ------------------------------------------------------------ HORARIOS */

// Negocio: terca a sexta 9h-20h (almoco 12h-13h), sabado 9h-18h
const grade = [];
for (const dia of [2, 3, 4, 5]) {
  grade.push({ dia_semana: dia, abre: '09:00', fecha: '12:00' });
  grade.push({ dia_semana: dia, abre: '13:00', fecha: '20:00' });
}
grade.push({ dia_semana: 6, abre: '09:00', fecha: '18:00' });
bd.definirHorarios(null, grade);

// Camila trabalha tambem na segunda e sai mais cedo no sabado
bd.definirHorarios(equipe[2].id, [
  { dia_semana: 1, abre: '10:00', fecha: '19:00' },
  { dia_semana: 3, abre: '10:00', fecha: '19:00' },
  { dia_semana: 4, abre: '10:00', fecha: '19:00' },
  { dia_semana: 5, abre: '10:00', fecha: '19:00' },
  { dia_semana: 6, abre: '09:00', fecha: '14:00' }
]);

/* ----------------------------------------------------------- BLOQUEIOS */

const hoje = ag.hojeLocal();
bd.salvarBloqueio({
  profissional_id: equipe[1].id,
  data_inicio: ag.somarDias(hoje, 10),
  data_fim: ag.somarDias(hoje, 14),
  motivo: 'Férias do Diego'
});

/* ------------------------------------------------ CLIENTES E AGENDAMENTOS */

const pessoas = [
  ['Lucas Ferreira', '11988880001'], ['Marcos Antônio Lima', '11988880002'],
  ['Pedro Henrique Alves', '11988880003'], ['Bruno Cardoso', '11988880004'],
  ['Thiago Nascimento', '11988880005'], ['André Barbosa', '11988880006'],
  ['Felipe Ramos', '11988880007'], ['Gustavo Teixeira', '11988880008'],
  ['Juliana Castro', '11988880009'], ['Rodrigo Menezes', '11988880010']
].map(([nome, tel]) => bd.garantirCliente(nome, tel));

const origens = ['chat', 'site', 'chat', 'admin', 'chat', 'site'];
const sorteio = lista => lista[Math.floor(Math.random() * lista.length)];
let criados = 0;

// Historico dos ultimos 30 dias: gravado direto, sem passar pelo motor de
// disponibilidade (ele so trabalha com datas futuras, e com razao).
for (let offset = -30; offset < 0; offset++) {
  const data = ag.somarDias(hoje, offset);
  const janelas = ag.expediente(data, null);
  if (!janelas.length) continue;

  const ocupados = new Set();
  const quantos = 3 + Math.floor(Math.random() * 5);

  for (let i = 0; i < quantos; i++) {
    const servico = sorteio(servicos);
    const pessoa = sorteio(pessoas);
    const profissional = sorteio(equipe.filter(p => p.servicos.includes(servico.id))) || equipe[0];
    const janela = sorteio(janelas);

    const passos = Math.floor((janela.fim - janela.inicio - servico.duracao_min) / 30);
    if (passos < 0) continue;
    const inicio = janela.inicio + Math.floor(Math.random() * (passos + 1)) * 30;
    const chave = `${profissional.id}:${inicio}`;
    if (ocupados.has(chave)) continue;
    ocupados.add(chave);

    const sorte = Math.random();
    bd.criarAgendamento({
      cliente_id: pessoa.id,
      servico_id: servico.id,
      profissional_id: profissional.id,
      data,
      hora_inicio: ag.hhmm(inicio),
      hora_fim: ag.hhmm(inicio + servico.duracao_min),
      preco: servico.preco,
      status: sorte < 0.87 ? 'concluido' : (sorte < 0.94 ? 'faltou' : 'cancelado'),
      origem: sorteio(origens)
    });
    criados++;
  }
}

// Agenda dos proximos 12 dias: passa pelo motor real, como um cliente faria
for (let offset = 0; offset <= 12; offset++) {
  const data = ag.somarDias(hoje, offset);
  const quantos = 2 + Math.floor(Math.random() * 4);

  for (let i = 0; i < quantos; i++) {
    const servico = sorteio(servicos);
    const pessoa = sorteio(pessoas);
    const livres = ag.slotsLivres(data, servico.id, null);
    if (!livres.length) break;

    const slot = sorteio(livres);
    try {
      const a = bd.criarAgendamento({
        cliente_id: pessoa.id,
        servico_id: servico.id,
        profissional_id: slot.profissionais[0].id,
        data,
        hora_inicio: slot.hora,
        hora_fim: slot.fim,
        preco: servico.preco,
        status: 'confirmado',
        origem: sorteio(origens)
      });
      criados++;
      notificarAgendamento(a);
    } catch { /* horario ocupado, segue */ }
  }
}

/* --------------------------------------------- CLIENTES QUE JA SUMIRAM */

// Tres clientes com ritmo claro que pararam de vir: alimentam a tela de Retencao
const sumidos = [
  ['Vinicius Prado', '11988881001', 21, [140, 119, 98, 77]],
  ['Otavio Camargo', '11988881002', 30, [190, 160, 130, 100]],
  ['Henrique Dutra', '11988881003', 14, [96, 82, 68, 54]]
];
for (const [nome, tel, ritmo, atras] of sumidos) {
  const cliente = bd.garantirCliente(nome, tel);
  const servico = sorteio(servicos);
  const profissional = sorteio(equipe);
  for (const dias of atras) {
    const data = ag.somarDias(hoje, -dias);
    const janelas = ag.expediente(data, null);
    if (!janelas.length) continue;
    const inicio = janelas[0].inicio + 60;
    bd.criarAgendamento({
      cliente_id: cliente.id, servico_id: servico.id, profissional_id: profissional.id,
      data, hora_inicio: ag.hhmm(inicio), hora_fim: ag.hhmm(inicio + servico.duracao_min),
      preco: servico.preco, status: 'concluido', origem: 'site'
    });
  }
  bancoDeDados.prepare('UPDATE clientes SET total_visitas = ? WHERE id = ?')
    .run(atras.length, cliente.id);
}

/* ------------------------------------------------------- CAIXA DE HOJE */

// Alguns atendimentos ja concluidos hoje, para o Caixa nao abrir vazio
const formas = ['dinheiro', 'pix', 'debito', 'credito'];
const janelasHoje = ag.expediente(hoje, null);
if (janelasHoje.length) {
  let t = janelasHoje[0].inicio;
  for (let i = 0; i < 5; i++) {
    const servico = sorteio(servicos.filter(x => x.duracao_min <= 60));
    const profissional = sorteio(equipe.filter(p => p.servicos.includes(servico.id))) || equipe[0];
    const pessoa = sorteio(pessoas);
    const a = bd.criarAgendamento({
      cliente_id: pessoa.id, servico_id: servico.id, profissional_id: profissional.id,
      data: hoje, hora_inicio: ag.hhmm(t), hora_fim: ag.hhmm(t + servico.duracao_min),
      preco: servico.preco, status: 'concluido', origem: sorteio(origens)
    });
    bd.atualizarAgendamento(a.id, {
      forma_pagamento: sorteio(formas),
      valor_extra: Math.random() < 0.4 ? [15, 25, 40][Math.floor(Math.random() * 3)] : 0
    });
    t += servico.duracao_min;
    if (t > janelasHoje[0].fim - 60) break;
  }
  bd.criarLancamento({
    data: hoje, tipo: 'produto', descricao: 'Pomada modeladora',
    valor: 45, forma: 'pix', profissional_id: equipe[0].id
  });
}

/* ------------------------------------------------------ LISTA DE ESPERA */

const naFila = [
  ['Fernando Alcantara', '11988882001', 'Corte + Barba', 'manha'],
  ['Sergio Batista', '11988882002', 'Platinado', null]
];
for (const [nome, tel, servicoNome, periodo] of naFila) {
  const cliente = bd.garantirCliente(nome, tel);
  const servico = servicos.find(x => x.nome === servicoNome);
  bd.criarEspera({
    cliente_id: cliente.id, servico_id: servico.id,
    data_de: hoje, data_ate: ag.somarDias(hoje, 12), periodos: periodo
  });
}

/* ---------------------------------------------------------- AVALIACOES */

const concluidos = bd.listarAgendamentos({ de: ag.somarDias(hoje, -30), ate: ag.somarDias(hoje, -1), status: 'concluido', limite: 60 })
  .sort(() => Math.random() - 0.5);
const comentarios = [
  [5, 'Atendimento impecável, o Rafa caprichou no degradê. Voltarei sempre!'],
  [5, 'Marquei pelo WhatsApp em 1 minuto, sem ficar esperando resposta. Isso é que é serviço.'],
  [4, 'Corte muito bom, só achei o preço do platinado um pouco alto.'],
  [5, 'Ambiente top, café bom e a barba ficou perfeita.'],
  [3, 'O corte ficou legal, mas atrasaram uns 20 minutos do meu horário.'],
  [2, 'Cheguei no horário e esperei muito. O corte ficou ok, mas a espera estragou.'],
  [5, 'Levei meu filho e a Camila teve uma paciência enorme. Recomendo demais.'],
  [4, 'Bom custo-beneficio, ambiente limpo.'],
  [5, 'Melhor barbearia da Vila Mariana, sem discussão.'],
  [1, 'Marquei e quando cheguei disseram que não tinham registro. Perdi a viagem.']
];

concluidos.slice(0, comentarios.length).forEach((a, i) => {
  const [nota, texto] = comentarios[i];
  bd.criarAvaliacao({ agendamento_id: a.id, cliente_id: a.cliente_id, nota, comentario: texto, canal: 'portal' });
});

/* ------------------------------------------------------------ CONVERSA */

const conversa = bd.abrirConversa({ telefone: '11988880001', nome: 'Lucas Ferreira', canal: 'whatsapp' });
const dialogo = [
  ['cliente', 'oi, tem horário pra corte e barba amanhã?'],
  ['ia', 'Fala, Lucas! Amanhã tenho 10:00, 14:30 e 17:00 pro Corte + Barba. Qual fica melhor?'],
  ['cliente', 'as 17 tá ótimo'],
  ['ia', 'Fechado! Corte + Barba amanhã às 17:00 com o Rafa. Confirmo?'],
  ['cliente', 'confirma sim'],
  ['ia', 'Pronto, Lucas! Horário confirmado. Te mando um lembrete um dia antes.']
];
for (const [autor, texto] of dialogo) bd.gravarMensagem(conversa.id, autor, texto);
bd.salvarEstadoConversa(conversa.id, { etapa: 'inicio', nome: 'Lucas Ferreira', telefone: '11988880001' });

console.log(`
Dados de demonstração criados:
  Negócio ......... Barbearia Navalha de Ouro
  Serviços ........ ${servicos.length}
  Profissionais ... ${equipe.length}
  Clientes ........ ${pessoas.length}
  Agendamentos .... ${criados}
  Avaliações ...... ${Math.min(concluidos.length, comentarios.length)}
  Na lista de espera  ${bd.listarEspera('aguardando').length}
  Para reativar ..... ${bd.clientesParaReativar(hoje).length}
  Caixa de hoje ..... R$ ${bd.fechamentoDoDia(hoje).total.toFixed(2)}

Rode "node index.js" e acesse:
  Portal do cliente  http://localhost:${process.env.PORT || 3000}/
  Painel do dono     http://localhost:${process.env.PORT || 3000}/admin
`);
