/* Ícones em traço fino. Substituem os emojis em toda a interface.
   Uso: ICONE.agenda()  ou  ICONE.agenda(20) para outro tamanho. */

const TRACOS = {
  painel:    '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  agenda:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  conversas: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  mensagens: '<path d="m21 3-9.5 9.5M21 3l-6.5 18-3.5-8-8-3.5z"/>',
  clientes:  '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-2a4 4 0 0 0-3-3.85"/><path d="M16 4.15a4 4 0 0 1 0 5.7"/>',
  estrela:   '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8z"/>',
  servicos:  '<path d="M20.6 13.3 13.3 20.6a2 2 0 0 1-2.8 0l-7-7V4h9.6l7.5 7.5a1.3 1.3 0 0 1 0 1.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  equipe:    '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  horarios:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  ajustes:   '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
  externo:   '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  sair:      '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M11 8l-4 4 4 4M7 12h10"/>',
  mapa:      '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  telefone:  '<path d="M21 16.4v2.8a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 3.3 5.3a1.8 1.8 0 0 1 1.8-2h2.8a1.8 1.8 0 0 1 1.8 1.6c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9l-1.2 1.2a14 14 0 0 0 5.3 5.3l1.2-1.2a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.5 1.9z"/>',
  busca:     '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mais:      '<path d="M12 5v14M5 12h14"/>',
  check:     '<path d="m5 12.5 4.5 4.5L19 7"/>',
  fechar:    '<path d="M6 6l12 12M18 6L6 18"/>',
  voltar:    '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  esquerda:  '<path d="m14 6-6 6 6 6"/>',
  direita:   '<path d="m10 6 6 6-6 6"/>',
  enviar:    '<path d="M5 12h13M12 6l6 6-6 6"/>',
  calendario:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  vazio:     '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5.5 5.5 3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-2.5-7.5A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.5z"/>',
  relogio:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  info:      '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  bloqueio:  '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  usuario:   '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  aparencia: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18 2.5 2.5 0 0 0 2.5-2.5c0-1.4-1.1-1.6-1.1-2.6 0-.8.6-1.4 1.4-1.4H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
  sincronizar: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 20v-5h-5"/>',
  copiar:    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  baixar:    '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  imagem:    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-5.5 5.5L8 14l-5 5"/>',
  alerta:    '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>'
};

const ICONE = new Proxy({}, {
  get: (_, nome) => (tamanho = 18) => TRACOS[nome]
    ? `<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">${TRACOS[nome]}</svg>`
    : ''
});

/** Estrelas cheias/vazias em SVG, para notas de avaliação. */
function estrelasSvg(nota, tamanho = 14) {
  const cheia = `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${TRACOS.estrela}</svg>`;
  const vazia = `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${TRACOS.estrela}</svg>`;
  return `<span class="estrelas" title="${nota} de 5">${cheia.repeat(nota)}<span class="off">${vazia.repeat(5 - nota)}</span></span>`;
}
