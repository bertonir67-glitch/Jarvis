# CREMA

Vitrine e pedido online da CREMA, delivery de massas artesanais em Guarulhos.
O cliente monta a massa (ou escolhe um prato da casa), junta tudo na sacola e envia
o pedido pronto pelo WhatsApp. iFood e Rappi ficam como alternativa.

Site estático: HTML, CSS e JavaScript puros, sem build e sem dependências.

```
index.html          página única (conteúdo, SEO e dados estruturados)
assets/css/         estilos
assets/js/main.js   sacola, montador, status da cozinha e pedido no WhatsApp
assets/fonts/       fontes (Big Shoulders, Archivo, Martian Mono)
assets/img/         favicon, ícone do iPhone e imagem de compartilhamento
robots.txt · sitemap.xml
```

---

## Conceito

**Caixa de entrega.** A página se parece com a embalagem de um delivery, não com um
template: blocos de cor chapada, cantos retos, filetes grossos e etiquetas impressas,
como o adesivo colado na caixa. Letras retas e estreitas em caixa alta, de placa de
cozinha e de embalagem.

**A assinatura é a comanda.** O papel de pedido que fica pendurado no trilho da cozinha:

- no topo, mostra a situação da cozinha agora (aberta, abre às 18h, fechada);
- no montador, imprime o prato linha por linha conforme as escolhas e recebe o
  **lacre CREMA** quando o prato está completo;
- na sacola, vira o resumo do pedido;
- é exatamente o texto que chega no WhatsApp da loja.

## Estrutura da página

1. Faixa de status com horário de Guarulhos
2. Topo em vermelho com o título, a foto do prato, o lacre e a comanda pendurada
3. Pratos da casa: combinações prontas, adicionadas à sacola com um toque no tamanho
4. Monte sua massa: tamanho, massa, molho e extras, com a comanda ao vivo
5. Do fogão à sua porta: feita na hora, lacrada, quente na porta
6. Onde e quando entregamos, com consulta de bairro pelo WhatsApp
7. Dúvidas frequentes
8. Fechamento que muda conforme a cozinha está aberta ou fechada
9. Sacola com finalização do pedido

## Identidade visual

| Onde aparece | Nome | Cor |
|---|---|---|
| Topo, "Do fogão à sua porta", botões de pedido e lacre | Pomodoro | `#922A23` |
| Fundo claro, comanda e texto sobre o preto | Osso | `#F4EEE2` |
| Montador, fechamento, rodapé e texto sobre o claro | Forno | `#0B0A08` |
| Cozinha aberta, item escolhido e prato sem carne | Oliva | `#5A6B3B` |

**Tipografia** (servida pelo próprio site, em `assets/fonts/`, licença OFL)

- **Big Shoulders**: títulos e a marca. Sempre em caixa alta, pesos 800 e 900.
- **Archivo**: textos, botões e formulários. Botões em caixa alta, peso 800.
- **Martian Mono**: comanda, preços, etiquetas e horários, na largura estreita, como
  a impressora térmica que solta o pedido.

**Fotos**: as do topo, da seção "Do fogão à sua porta" e do fechamento são carregadas em
Full HD (até 2560 px), e o montador mostra a foto de cada massa e molho.

**Movimento**: a comanda desce do trilho e imprime ao carregar; no montador cada
escolha imprime uma linha e o lacre é carimbado; ao adicionar, a comanda é destacada e
vai para a sacola. Ao rolar, cada seção entra com um deslize curto. Com "reduzir
movimento" ativado no aparelho, tudo aparece sem animação.

**O que a página evita**, para não parecer feita por IA: degradês, palavras em itálico
dourado, cantos arredondados, emojis, numeração decorativa (01, 02, 03), travessões no
texto e depoimentos inventados. Preços, gramas e horários aparecem só onde o cliente
precisa deles para pedir.

---

## Antes de publicar

Tudo que muda por loja está no topo de `assets/js/main.js`:

```js
const CONFIG = {
  whatsapp: '5511999999999',          // DDI + DDD + número, só dígitos
  ifood: 'https://www.ifood.com.br',  // link direto da loja no iFood
  rappi: 'https://www.rappi.com.br',  // link direto da loja no Rappi
  instagram: '',                      // vazio esconde o link
  openDays: [0, 2, 3, 4, 5, 6],       // domingo = 0
  opensAt: 18,
  closesAt: 23,
};
```

Checklist:

- [ ] Número real do WhatsApp em `CONFIG.whatsapp`
- [ ] Links diretos da loja no iFood e no Rappi
- [ ] **Fotos reais dos pratos da CREMA** no lugar das fotos de banco (Unsplash). É o
      que mais aumenta pedidos. Troque as URLs em `index.html`; use fotos de cima ou a
      45°, com luz quente, de pelo menos 1800 px na foto do topo.
- [ ] Domínio final em `canonical`, `og:url`, `og:image`, nos dados estruturados,
      em `robots.txt` e em `sitemap.xml` (hoje: `https://crema.com.br/`)
- [ ] Telefone e endereço nos dados estruturados (`application/ld+json`) quando houver
- [ ] Perfil da empresa no Google com o link do site e o mesmo horário
- [ ] Avaliações reais (Google ou iFood) quando quiser exibi-las. A página não traz
      depoimentos inventados.

**Preços**: os valores aparecem no HTML (cartões, tamanhos e dúvidas) e são calculados em
`SIZES` e `EXTRA_PRICE` no `main.js`. Ao mudar um preço, altere os dois.

## Publicação

Qualquer hospedagem estática serve, e todas comprimem e fazem cache sozinhas:
Netlify, Vercel ou Cloudflare Pages (arraste a pasta ou conecte o repositório).
O GitHub Pages também funciona, mas em repositório privado exige plano pago.

## Qualidade

Medido com Lighthouse num servidor local (sem compressão, e com fotos externas
bloqueadas no ambiente de teste). No celular, mediana de três medições.

| | Desempenho | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| Celular | 98 | 100 | 96 | 100 |
| Computador | 100 | 100 | 96 | 100 |

Os pontos perdidos em boas práticas vêm só das fotos que o ambiente de teste não
conseguiu baixar.
