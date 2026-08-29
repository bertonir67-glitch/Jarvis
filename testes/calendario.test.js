// Testes da ponte com o calendário: geração do .ics, leitura de feeds
// externos e o efeito real na agenda de atendimento.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANCO = path.join(raiz, 'teste-cal.db');
for (const sufixo of ['', '-wal', '-shm']) rmSync(BANCO + sufixo, { force: true });
process.env.DB_PATH = BANCO;
process.env.TZ_NEGOCIO = 'America/Sao_Paulo';

const bd  = await import('../db.js');
const ag  = await import('../agenda.js');
const cal = await import('../calendario.js');
const tema = await import('../tema.js');

let corte, rafa, hoje, servidor, porta;

before(async () => {
  hoje = ag.hojeLocal();
  bd.salvarNegocio({ nome: 'Estúdio Teste', intervalo_slots: 30, antecedencia_min_h: 0,
                     antecedencia_max_d: 60, endereco: 'Rua A, 1' });
  corte = bd.salvarServico({ nome: 'Corte', duracao_min: 30, preco: 50 });
  rafa = bd.salvarProfissional({ nome: 'Rafael Moura', servicos: [corte.id] });
  bd.definirHorarios(null, [0, 1, 2, 3, 4, 5, 6]
    .map(d => ({ dia_semana: d, abre: '09:00', fecha: '18:00' })));

  // Servidor local que devolve um .ics, no lugar do Google
  servidor = http.createServer((req, res) => {
    if (req.url === '/quebrado') { res.writeHead(500); return res.end('erro'); }
    if (req.url === '/naoics') { res.writeHead(200); return res.end('oi'); }
    res.writeHead(200, { 'Content-Type': 'text/calendar' });
    res.end(icsDeExemplo());
  });
  await new Promise(r => servidor.listen(0, r));
  porta = servidor.address().port;
});

after(() => servidor?.close());

const semTraco = (d) => d.replace(/-/g, '');

function icsDeExemplo() {
  const d2 = semTraco(ag.somarDias(hoje, 2));
  const d4 = semTraco(ag.somarDias(hoje, 4));
  const d6 = semTraco(ag.somarDias(hoje, 6));
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Teste//PT',
    'BEGIN:VEVENT', 'UID:dentista@x',
    `DTSTART;TZID=America/Sao_Paulo:${d2}T140000`,
    `DTEND;TZID=America/Sao_Paulo:${d2}T153000`,
    'SUMMARY:Dentista', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:viagem@x',
    `DTSTART;VALUE=DATE:${d4}`, `DTEND;VALUE=DATE:${d6}`,
    'SUMMARY:Viagem', 'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/* ------------------------------------------------------------- GERAÇÃO */

describe('geração do arquivo .ics', () => {
  test('produz um calendário válido e legível de volta', () => {
    const dia = ag.somarDias(hoje, 1);
    const a = ag.agendar({ nome: 'Ana Souza', telefone: '11988887777', servico_id: corte.id,
                           profissional_id: rafa.id, data: dia, hora: '10:00' });

    const ics = cal.gerarIcs([bd.buscarAgendamento(a.id)]);
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
    assert.match(ics, /X-WR-TIMEZONE:America\/Sao_Paulo/);
    assert.match(ics, /SUMMARY:Corte — Ana Souza/);

    const [lido] = cal.lerIcs(ics, { de: hoje, ate: ag.somarDias(hoje, 30) });
    assert.equal(lido.data, dia, 'a data precisa sobreviver à ida e volta');
    assert.equal(lido.hora_inicio, '10:00');
    assert.equal(lido.hora_fim, '10:30');
  });

  test('escapa vírgula, ponto e vírgula e quebra de linha', () => {
    const dia = ag.somarDias(hoje, 1);
    const a = ag.agendar({ nome: 'Bruno Lima', telefone: '11988886666', servico_id: corte.id,
                           profissional_id: rafa.id, data: dia, hora: '11:00',
                           observacao: 'Cuidado; alergia, ok\nsegunda linha' });
    // Desdobra as linhas antes de conferir, como faz qualquer leitor de .ics
    const ics = cal.gerarIcs([bd.buscarAgendamento(a.id)]).replace(/\r\n /g, '');
    assert.match(ics, /Cuidado\\;/, 'ponto e vírgula precisa sair escapado');
    assert.match(ics, /alergia\\,/, 'vírgula precisa sair escapada');
    assert.ok(!/\nsegunda linha/.test(ics), 'a quebra de linha deve virar \\n literal');
  });

  test('quebra linhas longas como manda o RFC 5545', () => {
    const dia = ag.somarDias(hoje, 1);
    const a = ag.agendar({ nome: 'Carlos Eduardo dos Santos Albuquerque Vasconcelos Filho',
                           telefone: '11988885555', servico_id: corte.id,
                           profissional_id: rafa.id, data: dia, hora: '12:00' });
    const ics = cal.gerarIcs([bd.buscarAgendamento(a.id)]);
    for (const linha of ics.split('\r\n')) {
      assert.ok(Buffer.byteLength(linha, 'utf8') <= 75, `linha longa demais: ${linha}`);
    }
  });

  test('monta o link do Google Agenda', () => {
    const a = bd.listarAgendamentos({ de: hoje, limite: 1 })[0];
    const url = cal.linkGoogle(a);
    assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    assert.match(url, /dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
  });
});

/* -------------------------------------------------------------- LEITURA */

describe('leitura de calendário externo', () => {
  test('entende fuso, dia inteiro e repetição semanal', () => {
    const eventos = cal.lerIcs(icsDeExemplo(), { de: hoje, ate: ag.somarDias(hoje, 30) });
    const dentista = eventos.find(e => e.titulo === 'Dentista');
    assert.equal(dentista.data, ag.somarDias(hoje, 2));
    assert.equal(dentista.hora_inicio, '14:00');
    assert.equal(dentista.hora_fim, '15:30');

    const viagem = eventos.filter(e => e.titulo === 'Viagem');
    assert.equal(viagem.length, 2, 'DTEND de dia inteiro é exclusivo');
    assert.equal(viagem[0].dia_inteiro, 1);
  });

  test('ignora eventos cancelados e marcados como livres', () => {
    const d = semTraco(ag.somarDias(hoje, 3));
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', `DTSTART:${d}T120000Z`, `DTEND:${d}T130000Z`,
      'STATUS:CANCELLED', 'SUMMARY:Cancelado', 'END:VEVENT',
      'BEGIN:VEVENT', `DTSTART:${d}T140000Z`, `DTEND:${d}T150000Z`,
      'TRANSP:TRANSPARENT', 'SUMMARY:Livre', 'END:VEVENT',
      'END:VCALENDAR'].join('\r\n');
    assert.equal(cal.lerIcs(ics, { de: hoje, ate: ag.somarDias(hoje, 30) }).length, 0);
  });

  test('expande RRULE semanal com BYDAY', () => {
    const d = semTraco(hoje);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:r@x',
      `DTSTART;TZID=America/Sao_Paulo:${d}T120000`,
      `DTEND;TZID=America/Sao_Paulo:${d}T130000`,
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', 'SUMMARY:Reunião', 'END:VEVENT',
      'END:VCALENDAR'].join('\r\n');
    const eventos = cal.lerIcs(ics, { de: hoje, ate: ag.somarDias(hoje, 40) });
    assert.ok(eventos.length >= 2 && eventos.length <= 4);
    for (const e of eventos) assert.ok([1, 3].includes(ag.diaSemana(e.data)), `${e.data} não é seg nem qua`);
  });

  test('converte webcal:// para https://', () => {
    assert.equal(cal.normalizarUrl('webcal://exemplo.com/a.ics'), 'https://exemplo.com/a.ics');
    assert.equal(cal.normalizarUrl('  '), null);
  });
});

/* --------------------------------------------------------- SINCRONIZAÇÃO */

describe('sincronização com a agenda', () => {
  test('compromisso do calendário some dos horários livres', async () => {
    const dia = ag.somarDias(hoje, 2);
    assert.ok(ag.slotsLivres(dia, corte.id).some(s => s.hora === '14:00'),
              '14:00 deveria estar livre antes de sincronizar');

    const r = await cal.sincronizarUm(null, `http://localhost:${porta}/ok.ics`);
    assert.equal(r.ok, true);
    assert.ok(r.eventos >= 3);

    const livres = ag.slotsLivres(dia, corte.id).map(s => s.hora);
    assert.ok(!livres.includes('14:00'), 'o horário do dentista precisa sumir');
    assert.ok(!livres.includes('15:00'), 'o corte às 15:00 invadiria a consulta');
    assert.ok(livres.includes('16:00'), 'depois da consulta continua livre');
  });

  test('evento de dia inteiro fecha o dia', () => {
    assert.equal(ag.slotsLivres(ag.somarDias(hoje, 4), corte.id).length, 0);
    assert.equal(ag.slotsLivres(ag.somarDias(hoje, 5), corte.id).length, 0);
    assert.ok(ag.slotsLivres(ag.somarDias(hoje, 6), corte.id).length > 0,
              'o último dia da viagem é exclusivo e volta a ficar livre');
  });

  test('desconectar o calendário devolve os horários', async () => {
    const dia = ag.somarDias(hoje, 2);
    await cal.sincronizarUm(null, null);
    assert.ok(ag.slotsLivres(dia, corte.id).some(s => s.hora === '14:00'));
  });

  test('registra a falha sem derrubar a agenda', async () => {
    const r = await cal.sincronizarUm(null, `http://localhost:${porta}/quebrado`);
    assert.equal(r.ok, false);
    assert.match(r.erro, /500/);
    assert.match(bd.ultimasSincronizacoes(1)[0].erro, /500/);
    assert.ok(ag.slotsLivres(ag.somarDias(hoje, 2), corte.id).length > 0,
              'uma falha não pode zerar a agenda');
  });

  test('recusa resposta que não é calendário', async () => {
    const r = await cal.sincronizarUm(null, `http://localhost:${porta}/naoics`);
    assert.equal(r.ok, false);
    assert.match(r.erro, /calendário/i);
  });
});

/* --------------------------------------------------------------- TEMA */

describe('personalização visual', () => {
  test('gera as variáveis a partir das escolhas do dono', () => {
    bd.salvarNegocio({ cor: '#3f6b8a', base_neutra: 'noite', cantos: 'redondo', fonte: 'inter' });
    const css = tema.gerarCss(bd.lerNegocio());
    assert.match(css, /--acento:\s*#3f6b8a/i);
    assert.match(css, /--papel:\s*#1c1e22/i, 'base escura precisa mudar o papel');
    assert.match(css, /--r-g:\s*14px/);
    assert.match(css, /--fonte:\s*'Inter'/);
    assert.match(css, /color-scheme:\s*dark/);
  });

  test('escurece cor clara para o texto branco continuar legível', () => {
    bd.salvarNegocio({ cor: '#ffe066', base_neutra: 'areia' });
    const css = tema.gerarCss(bd.lerNegocio());
    const acento = css.match(/--acento:\s*(#[0-9a-f]{6})/i)[1];
    assert.notEqual(acento.toLowerCase(), '#ffe066');

    const lum = (hex) => {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    assert.ok((1.05) / (lum(acento) + 0.05) >= 4.5, 'o contraste com o branco precisa passar de 4.5:1');
  });

  test('cor inválida cai no padrão sem quebrar', () => {
    bd.salvarNegocio({ cor: 'roxo bonito' });
    assert.match(tema.gerarCss(bd.lerNegocio()), /--acento:\s*#[0-9a-f]{6}/i);
  });

  test('só a fonte do sistema dispensa download', () => {
    assert.equal(tema.urlDaFonte('sistema'), null);
    assert.match(tema.urlDaFonte('lora'), /fonts\.googleapis\.com.*Lora/);
  });
});
