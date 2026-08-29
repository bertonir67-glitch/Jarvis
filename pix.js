// Gerador de "PIX copia e cola" (BR Code, padrão EMV do Banco Central).
// Serve para cobrar o sinal do agendamento sem gateway, sem taxa e sem
// integração: o dono põe a chave dele e o dinheiro cai direto na conta.

/** CRC-16/CCITT-FALSE, exigido no campo 63 do BR Code. */
export function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Monta um campo EMV: identificador + tamanho em 2 dígitos + valor. */
const campo = (id, valor) =>
  `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** Remove acentos e símbolos que o padrão não aceita. */
function limpar(texto, maximo) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-]/g, '')
    .trim().slice(0, maximo).trim().toUpperCase();
}

/** Identificador da transação: só letras, números e no máximo 25 caracteres. */
const limparTxid = (t) =>
  String(t || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

/**
 * Gera o código PIX copia e cola.
 * @param {object} d
 * @param {string} d.chave    chave PIX do recebedor (CPF, CNPJ, e-mail, telefone ou aleatória)
 * @param {string} d.nome     nome do recebedor (máx. 25)
 * @param {string} d.cidade   cidade do recebedor (máx. 15)
 * @param {number} [d.valor]  valor fixo; omitido deixa o pagador escolher
 * @param {string} [d.txid]   identificador que volta no extrato
 * @returns {string}
 */
export function gerarCodigo({ chave, nome, cidade, valor, txid }) {
  if (!chave) throw new Error('Informe a chave PIX.');

  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', String(chave).trim());

  const partes = [
    campo('00', '01'),                                  // formato do payload
    campo('26', conta),                                 // conta do recebedor
    campo('52', '0000'),                                // categoria do comerciante
    campo('53', '986'),                                 // moeda: real
    valor > 0 ? campo('54', Number(valor).toFixed(2)) : '',
    campo('58', 'BR'),
    campo('59', limpar(nome, 25) || 'RECEBEDOR'),
    campo('60', limpar(cidade, 15) || 'CIDADE'),
    campo('62', campo('05', limparTxid(txid)))          // referência
  ].join('');

  const semCrc = partes + '6304';
  return semCrc + crc16(semCrc);
}

/** Confere se um código veio íntegro (usado nos testes e na validação). */
export function conferir(codigo) {
  if (typeof codigo !== 'string' || codigo.length < 8) return false;
  const corpo = codigo.slice(0, -4);
  return corpo.endsWith('6304') && crc16(corpo) === codigo.slice(-4).toUpperCase();
}

/**
 * Valida o formato da chave PIX e diz de que tipo ela é.
 * @returns {{ok:boolean, tipo?:string, erro?:string}}
 */
export function validarChave(chave) {
  const c = String(chave || '').trim();
  if (!c) return { ok: false, erro: 'Informe a chave PIX.' };

  const digitos = c.replace(/\D/g, '');
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c)) return { ok: true, tipo: 'e-mail' };
  if (/^\+?55\d{10,11}$/.test(digitos.length >= 12 ? digitos : '')) return { ok: true, tipo: 'telefone' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return { ok: true, tipo: 'aleatória' };
  if (digitos.length === 14) return { ok: true, tipo: 'CNPJ' };
  if (digitos.length === 11) return { ok: true, tipo: 'CPF ou telefone' };
  if (digitos.length === 10) return { ok: true, tipo: 'telefone' };

  return { ok: false, erro: 'Use CPF, CNPJ, e-mail, telefone com DDD ou chave aleatória.' };
}
