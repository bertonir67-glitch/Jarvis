# Lume — Pizzeria Napoletana d'Autore

Site oficial da **Lume**: uma experiência 3D em que a pizza acompanha o scroll, se separa em
fatias dentro do "forno", ergue uma fatia no cardápio e reage ao mouse. Tudo num único
`index.html`, sem etapa de build.

![Prévia do site](assets/og-image.jpg)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Cena 3D | [Three.js](https://threejs.org) 0.160 via CDN (importmap). Pizza, texturas e partículas geradas por código, sem imagens. |
| Animações | [GSAP](https://gsap.com) 3.12.5 + ScrollTrigger |
| Scroll suave | [Lenis](https://lenis.darkroom.engineering) 1.1.13 |
| Tipografia | Cormorant Garamond (títulos) e Manrope (texto), via Google Fonts |
| Hospedagem | GitHub Pages, com deploy automático pelo GitHub Actions |

**Já incluído:** layout responsivo, `pixelRatio` limitado a 2 (1,5 no celular), versão leve no
mobile, pizza em CSS quando não há WebGL ou quando o aparelho economiza dados, suporte a
`prefers-reduced-motion`, SEO (meta tags, Open Graph, JSON-LD `Restaurant`, sitemap, robots),
ícones para iOS/Android e página 404 da marca.

## Estrutura

```
.
├── index.html               # o site inteiro (HTML + CSS + JS)
├── 404.html                 # página "fatia não encontrada"
├── assets/
│   ├── og-image.jpg         # imagem de compartilhamento (1200×630)
│   └── icons/               # favicon.svg e PNGs (32, 180, 192, 512, maskable)
├── site.webmanifest         # instalação como app (PWA)
├── robots.txt
├── sitemap.xml
├── .nojekyll
└── .github/workflows/
    └── deploy.yml           # publica no GitHub Pages
```

## Rodar localmente

Não há dependências para instalar. Basta servir a pasta, porque módulos JavaScript não
funcionam abrindo o arquivo direto com `file://` em todos os navegadores:

```bash
python3 -m http.server 8000
# ou
npx serve .
```

Depois abra <http://localhost:8000>. É preciso internet para carregar as bibliotecas e as
fontes das CDNs.

## Publicar

### GitHub Pages (já configurado)

1. Em **Settings → Pages**, em *Build and deployment → Source*, escolha **GitHub Actions**.
2. Pronto: cada commit na branch padrão publica o site. Para publicar sem commit,
   use **Actions → Publicar site → Run workflow**.

Sem domínio próprio, o site fica em `https://<usuario>.github.io/<repositorio>/`. Todos os
caminhos do site são relativos, então funciona nesse subcaminho.

### Domínio próprio

1. Crie um arquivo `CNAME` na raiz contendo só o domínio, por exemplo `www.lumepizzeria.com.br`.
2. No seu provedor de DNS, aponte um registro `CNAME` de `www` para `<usuario>.github.io`.
3. Em **Settings → Pages**, informe o domínio e marque **Enforce HTTPS**.

### Outras hospedagens

Como é um site estático, também funciona em Netlify, Vercel ou Cloudflare Pages: aponte para
a raiz do repositório, sem comando de build.

## Personalizar os dados da empresa

Os dados atuais (endereço, telefone, preços, avaliações e domínio) são **de exemplo**. Troque
antes de divulgar:

| O quê | Onde |
|---|---|
| Domínio `lumepizzeria.com.br` | `index.html` (canonical, Open Graph, JSON-LD), `robots.txt`, `sitemap.xml` |
| Endereço, telefone, horários | `index.html`: bloco JSON-LD no `<head>`, seção `#reserva` (bloco `.info`) e botão de telefone no menu |
| Nota e número de avaliações | `index.html`: JSON-LD (`aggregateRating`) e `.rating` no hero |
| Cardápio e preços | `index.html`: seção `#cardapio`, cada prato é um `<article class="dish" data-cat="…">` (`classica`, `autoral` ou `doce`) |
| Depoimentos | `index.html`: seção `#numeros`, bloco `.marquee`. Os 4 últimos são cópias para o loop contínuo e devem repetir os 4 primeiros. |
| Instagram | links `instagram.com/` em `#reserva` e no rodapé |
| Cores e fontes | variáveis em `:root` no início do `<style>` do `index.html` |
| Imagem de compartilhamento | substitua `assets/og-image.jpg` (1200×630) |

Para trocar o domínio de uma vez:

```bash
grep -rl "lumepizzeria.com.br" --exclude-dir=.git . | xargs sed -i 's/www\.lumepizzeria\.com\.br/www.seudominio.com.br/g'
```

> **Formulário de reserva:** hoje ele valida os campos e mostra a confirmação na tela, mas
> **não envia os dados para lugar nenhum**. Para receber as reservas, ligue o `submit` (no fim
> do `index.html`, bloco *Formulário de reserva*) a um link de WhatsApp, a um serviço de
> formulários (Formspree, Getform) ou ao seu sistema de reservas.

## Histórico

Este repositório abrigava antes o app Android **Jarvis**. O código dele continua no histórico
do git, no commit `4039d5a`. Para abrir aquela versão numa branch separada:

```bash
git switch -c jarvis-app 4039d5a
```
