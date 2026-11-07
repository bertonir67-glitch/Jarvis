# CREMA

Vitrine e pedido online da CREMA, delivery de massas artesanais em Guarulhos.
O cliente monta a massa (ou escolhe um prato da casa), junta tudo na sacola e envia
o pedido pronto pelo WhatsApp. iFood e Rappi ficam como alternativa.

Site estático: HTML, CSS e JavaScript puros, sem build e sem dependências.

```
index.html          página única (conteúdo, SEO e dados estruturados)
assets/css/         estilos
assets/js/main.js   sacola, montador, status da cozinha e pedido no WhatsApp
assets/fonts/       fonte Archivo (um arquivo, larguras e pesos variáveis)
assets/img/         favicon, ícone do iPhone e imagem de compartilhamento
robots.txt · sitemap.xml
```

---

## Conceito

**Jantar em casa.** A página se comporta como a recepção de um bom restaurante:
fundo claro e calmo, fotos grandes fazendo o apetite, letra larga e leve, muito
espaço. A cor aparece como luz, não como bloco: o vermelho Pomodoro fica só nos
botões de pedido, e o fim da página escurece como a noite em que a cozinha funciona.

**A assinatura é o "Seu prato".** No montador, o prato ganha forma enquanto o cliente
escolhe:

- a foto muda para o molho (ou para a massa, enquanto o molho não foi escolhido);
- o nome se compõe sozinho, como num cardápio: "Pappardelle ao pesto genovês";
- logo abaixo aparecem os extras, quantos ainda cabem inclusos e o total;
- no celular, uma barra fixa leva a foto pequena, o nome e o botão de adicionar.

## Estrutura da página

1. Navegação com a situação da cozinha agora (aberta, abre às 18h, fechada)
2. Topo: título, chamada, botões e a foto panorâmica do prato
3. Pratos da casa: combinações prontas, adicionadas à sacola com um toque no tamanho
4. Monte sua massa: tamanho, massa, molho e extras, com o "Seu prato" ao lado
5. Do fogão à sua porta: feita na hora, lacrada, quente na porta
6. Onde e quando entregamos, com consulta de bairro pelo WhatsApp
7. Dúvidas frequentes
8. Fechamento que muda conforme a cozinha está aberta ou fechada
9. Sacola com finalização do pedido

## Identidade visual

| Onde aparece | Nome | Cor |
|---|---|---|
| Fundo da página | Osso | `#F4EEE2` |
| Fundo do montador | Linho | `#EBE3D5` |
| Cartões, campos e opções | Papel | `#FBF8F2` |
| Texto, fechamento e rodapé | Tinta | `#0B0A08` |
| Botões de pedido e ícone | Pomodoro | `#922A23` |
| Cozinha aberta, item escolhido, prato sem carne | Oliva | `#5A6B3B` |
| Cozinha abre mais tarde | Ouro | `#C6A86B` |

**Tipografia**: uma família só, a **Archivo** (licença OFL, servida pelo próprio site),
usada em duas larguras:

- **Archivo Expanded, peso leve**: títulos e nomes dos pratos. Letras largas, de
  proporção quase quadrada, só com a primeira letra maiúscula. A marca CREMA usa a
  mesma largura em maiúsculas espaçadas.
- **Archivo normal**: textos, botões, preços e formulários.

**Formas**: botões em pílula, cartões e fotos com cantos arredondados suaves, linhas
finas para separar. Nada de blocos de cor chapada.

**Movimento**: o topo entra com um leve deslize e a foto assenta devagar; ao rolar,
cada seção aparece com um deslize curto; no montador, a foto do prato troca com
transição suave. Com "reduzir movimento" ativado no aparelho, tudo aparece sem animação.

**O que a página evita**, para não parecer feita por IA nem por jogo: degradês, letras
pesadas e espremidas, selos e carimbos, etiquetas coladas, emojis, numeração decorativa
(01, 02, 03), travessões no texto e depoimentos inventados. Preços, gramas e horários
aparecem só onde o cliente precisa deles para pedir.

## Fotos

As fotos vêm do Unsplash (uso comercial liberado, sem necessidade de crédito) e são
carregadas no tamanho certo para cada tela, até 2560 px no topo.

| Onde | Foto |
|---|---|
| Topo, Alfredo no montador, imagem de compartilhamento | `photo-1645112411341-6c4fd023714a` |
| Fettuccine Alfredo e fettuccine no montador | `photo-1608219992759-8d74ed8d76eb` |
| Tagliatelle al Sugo | `photo-1673442635965-34f1b36d8944` |
| Pappardelle al Bacon | `photo-1611270629569-8b357cb88da9` |
| Linguine al Pesto e pesto no montador | `photo-1567608285969-48e4bbe0d399` |
| Tagliatelle no montador | `photo-1551183053-bf91a1d81141` |
| Pappardelle no montador | `photo-1473093226795-af9932fe5856` |
| Linguine no montador | `photo-1579631542720-3a87824fff86` |
| Sugo no montador | `photo-1626844131082-256783844137` |
| Rosé no montador | `photo-1622973536968-3ead9e780960` |
| "Seu prato" antes de escolher | `photo-1546549032-9571cd6b27df` |
| Do fogão à sua porta | `photo-1528712306091-ed0763094c98` |
| Fechamento | `photo-1627042633145-b780d842ba45` |

Para trocar por fotos próprias, substitua o endereço da foto em `index.html` (e, no
montador, o atributo `data-photo` da opção).

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
- [ ] **Fotos reais dos pratos da CREMA** no lugar das fotos de banco. É o que mais
      aumenta pedidos. Use fotos de cima ou a 45°, com luz quente, de pelo menos 1800 px
      na foto do topo.
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

Medido com Lighthouse num servidor local, sem compressão:

| | Desempenho | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| Celular | 98 | 100 | 100 | 100 |
| Computador | 100 | 100 | 100 | 100 |
