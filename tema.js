// Motor de aparência: transforma as escolhas do dono em CSS.
// Toda a interface lê variáveis CSS, então mudar aqui muda tudo de uma vez.
import * as bd from './db.js';

/* ------------------------------------------------------------- CORES */

function paraRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  const c = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
}

const paraHex = ({ r, g, b }) =>
  '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

function paraHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > .5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function deHsl({ h, s, l }) {
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < .5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: canal(h + 1 / 3) * 255, g: canal(h) * 255, b: canal(h - 1 / 3) * 255 };
}

const ajustarLuz = (hex, delta) => {
  const rgb = paraRgb(hex);
  if (!rgb) return hex;
  const hsl = paraHsl(rgb);
  return paraHex(deHsl({ ...hsl, l: Math.min(1, Math.max(0, hsl.l + delta)) }));
};

/** Luminância relativa (WCAG), para decidir a cor do texto sobre a cor. */
function luminancia(hex) {
  const rgb = paraRgb(hex);
  if (!rgb) return 0;
  const canal = v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(rgb.r) + 0.7152 * canal(rgb.g) + 0.0722 * canal(rgb.b);
}

const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Escurece a cor até o texto branco ficar legível em cima dela.
 * Evita que uma escolha bonita porém clara (amarelo, lima) quebre os botões.
 */
function acentoLegivel(hex, escuro) {
  let cor = hex;
  if (escuro) return cor;
  for (let i = 0; i < 12 && contraste(cor, '#ffffff') < 4.5; i++) cor = ajustarLuz(cor, -0.04);
  return cor;
}

/* --------------------------------------------------------- CATÁLOGOS */

export const BASES = {
  areia: {
    nome: 'Areia', descricao: 'Neutros quentes, papel levemente creme', escuro: false,
    cores: { papel: '#ffffff', papel2: '#fcfbf9', fundo: '#f8f7f4', linha: '#ebe8e2',
             linha2: '#dedad2', tinta: '#201f1c', texto: '#56544e', apagado: '#8b8880' }
  },
  neve: {
    nome: 'Neve', descricao: 'Cinzas frios, aparência mais técnica', escuro: false,
    cores: { papel: '#ffffff', papel2: '#fafbfc', fundo: '#f6f7f9', linha: '#e7eaee',
             linha2: '#d6dae1', tinta: '#191b1f', texto: '#4f545c', apagado: '#848a94' }
  },
  linho: {
    nome: 'Linho', descricao: 'Bege quente, ar artesanal', escuro: false,
    cores: { papel: '#fffdf8', papel2: '#fbf8f1', fundo: '#f4f0e8', linha: '#e6dfd2',
             linha2: '#d6cdbb', tinta: '#241f17', texto: '#5a5348', apagado: '#8e8676' }
  },
  noite: {
    nome: 'Noite', descricao: 'Fundo escuro, para marcas mais sóbrias', escuro: true,
    cores: { papel: '#1c1e22', papel2: '#212429', fundo: '#141619', linha: '#2c3037',
             linha2: '#3b4049', tinta: '#f1f3f5', texto: '#b5bac2', apagado: '#7d848e' }
  }
};

export const FONTES = {
  sistema:  { nome: 'Do sistema', web: null,
              pilha: `ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` },
  jakarta:  { nome: 'Plus Jakarta Sans', web: 'Plus+Jakarta+Sans:wght@400;500;600',
              pilha: `'Plus Jakarta Sans', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif` },
  inter:    { nome: 'Inter', web: 'Inter:wght@400;500;600',
              pilha: `'Inter', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif` },
  dmsans:   { nome: 'DM Sans', web: 'DM+Sans:wght@400;500;700',
              pilha: `'DM Sans', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif` },
  lora:     { nome: 'Lora (serifada)', web: 'Lora:wght@400;500;600',
              pilha: `'Lora', Georgia, 'Times New Roman', serif` },
  poppins:  { nome: 'Poppins', web: 'Poppins:wght@400;500;600',
              pilha: `'Poppins', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif` }
};

export const CANTOS = {
  reto:    { nome: 'Retos',     r: ['2px', '3px', '4px', '6px'] },
  suave:   { nome: 'Suaves',    r: ['4px', '6px', '8px', '12px'] },
  redondo: { nome: 'Arredondados', r: ['6px', '10px', '14px', '20px'] }
};

/** URL da fonte escolhida, ou null quando o negócio usa a do sistema. */
export function urlDaFonte(chave) {
  const f = FONTES[chave] || FONTES.jakarta;
  return f.web ? `https://fonts.googleapis.com/css2?family=${f.web}&display=swap` : null;
}

/* ------------------------------------------------------------- CSS */

/** Gera a folha de estilo que personaliza toda a interface. */
export function gerarCss(negocio = bd.lerNegocio()) {
  const base = BASES[negocio.base_neutra] || BASES.areia;
  const fonte = FONTES[negocio.fonte] || FONTES.jakarta;
  const cantos = CANTOS[negocio.cantos] || CANTOS.suave;
  const c = base.cores;

  const acento = acentoLegivel(paraRgb(negocio.cor) ? negocio.cor : '#5f7a6e', base.escuro);
  const forte = ajustarLuz(acento, base.escuro ? 0.09 : -0.08);
  const sobreAcento = contraste(acento, '#ffffff') >= 4.5 ? '#ffffff' : c.tinta;

  // As cores de estado herdam o tom do fundo, então funcionam em base clara e escura
  const mistura = (cor, pct) => `color-mix(in srgb, ${cor} ${pct}%, var(--papel))`;
  const estado = base.escuro
    ? { verde: '#7fae95', ambar: '#c8a56a', vermelho: '#cf8880' }
    : { verde: '#4e7a63', ambar: '#8a7143', vermelho: '#95564f' };

  return `/* Gerado por tema.js — reflete os Ajustes do negócio */
:root {
  --papel:    ${c.papel};
  --papel-2:  ${c.papel2};
  --fundo:    ${c.fundo};
  --linha:    ${c.linha};
  --linha-2:  ${c.linha2};
  --tinta:    ${c.tinta};
  --texto:    ${c.texto};
  --apagado:  ${c.apagado};

  --acento:       ${acento};
  --acento-forte: ${forte};
  --acento-leve:  ${mistura('var(--acento)', 12)};
  --sobre-acento: ${sobreAcento};

  --verde:         ${estado.verde};
  --verde-leve:    ${mistura(estado.verde, 14)};
  --ambar:         ${estado.ambar};
  --ambar-leve:    ${mistura(estado.ambar, 14)};
  --vermelho:      ${estado.vermelho};
  --vermelho-leve: ${mistura(estado.vermelho, 14)};

  --r-p:  ${cantos.r[0]};
  --r-m:  ${cantos.r[1]};
  --r-g:  ${cantos.r[2]};
  --r-xg: ${cantos.r[3]};

  --fonte: ${fonte.pilha};
  color-scheme: ${base.escuro ? 'dark' : 'light'};
}
`;
}

/** O que o painel precisa para montar a tela de aparência. */
export function opcoesDeAparencia() {
  return {
    bases: Object.entries(BASES).map(([id, b]) => ({
      id, nome: b.nome, descricao: b.descricao, escuro: b.escuro,
      amostra: [b.cores.fundo, b.cores.papel, b.cores.linha2, b.cores.tinta]
    })),
    fontes: Object.entries(FONTES).map(([id, f]) => ({ id, nome: f.nome, pilha: f.pilha })),
    cantos: Object.entries(CANTOS).map(([id, k]) => ({ id, nome: k.nome, raio: k.r[2] })),
    paleta: ['#5f7a6e', '#3f6b8a', '#7a5f8e', '#a06a4f', '#8a5f6b', '#4f6b5c',
             '#2f5d7c', '#8a7340', '#6b5f8e', '#94594f', '#3c7068', '#7c6a55']
  };
}
