/* CREMA — vitrine e pedido */
(() => {
  'use strict';

  /* ================================================================
     Configuração — troque pelos dados reais da CREMA
     ================================================================ */
  const CONFIG = {
    whatsapp: '5511999999999',          // DDI + DDD + número, só dígitos
    ifood: 'https://www.ifood.com.br',  // link direto da loja no iFood
    rappi: 'https://www.rappi.com.br',  // link direto da loja no Rappi
    instagram: '',                      // ex.: https://instagram.com/crema (vazio esconde o link)
    timezone: 'America/Sao_Paulo',
    openDays: [0, 2, 3, 4, 5, 6],       // domingo = 0. Segunda fechado.
    opensAt: 18,
    closesAt: 23,
  };

  const SIZES = {
    P: { price: 29.9, included: 1, grams: '300g' },
    M: { price: 36.9, included: 2, grams: '450g' },
    G: { price: 44.9, included: 3, grams: '600g' },
  };
  const EXTRA_PRICE = 5;
  const BAG_KEY = 'crema:sacola:v1';
  const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const brl = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');
  const num = (v) => v.toFixed(2).replace('.', ',');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const listPt = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`);
  const waLink = (text) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

  document.documentElement.classList.remove('no-js');

  /* ---------- Links configuráveis ---------- */
  $$('[data-link]').forEach((a) => {
    const key = a.dataset.link;
    const url = key === 'whatsapp' ? waLink('Olá, CREMA! Gostaria de fazer um pedido.') : CONFIG[key];
    if (url) a.href = url;
    else a.hidden = true;
  });

  /* ================================================================
     Situação da cozinha (horário de Guarulhos)
     ================================================================ */
  function kitchenNow(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CONFIG.timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type).value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    const openToday = CONFIG.openDays.includes(day);

    if (openToday && minutes >= CONFIG.opensAt * 60 && minutes < CONFIG.closesAt * 60) return { state: 'open' };
    if (openToday && minutes < CONFIG.opensAt * 60) return { state: 'later' };

    let ahead = 1;
    while (ahead < 7 && !CONFIG.openDays.includes((day + ahead) % 7)) ahead += 1;
    return { state: 'closed', next: ahead === 1 ? 'amanhã' : DAYS[(day + ahead) % 7] };
  }

  const kitchen = { state: 'closed', next: '' };

  function renderKitchen() {
    Object.assign(kitchen, kitchenNow());
    const { state, next } = kitchen;
    const h = `${CONFIG.opensAt}h`;
    const until = `${CONFIG.closesAt}h`;

    const copy = {
      open: {
        strip: `Aberto agora · pedidos até as ${until}`,
        cozinha: 'aberta', pedidos: `até ${until}`,
        title: 'A cozinha está <em>acesa.</em>',
        text: `Pedidos até as ${until}. Monte a sua e a massa vai para a panela.`,
        note: '',
      },
      later: {
        strip: `Abrimos hoje às ${h}`,
        cozinha: `abre ${h}`, pedidos: `${h} às ${until}`,
        title: 'A cozinha já vai <em>acender.</em>',
        text: `Abrimos hoje às ${h}. Monte a sua agora e envie quando quiser.`,
        note: `Estamos fechados agora. Você pode enviar o pedido e a gente responde a partir das ${h}.`,
      },
      closed: {
        strip: `Fechado agora · abrimos ${next} às ${h}`,
        cozinha: 'fechada', pedidos: `${next}, ${h}`,
        title: 'Hoje a cozinha <em>descansa.</em>',
        text: `Abrimos ${next} às ${h}. Deixe a sua montada na sacola.`,
        note: `Estamos fechados agora. Você pode enviar o pedido e a gente responde ${next}, a partir das ${h}.`,
      },
    }[state];

    $$('[data-status]').forEach((el) => {
      el.classList.toggle('is-open', state === 'open');
      el.classList.toggle('is-later', state === 'later');
      el.classList.toggle('is-closed', state === 'closed');
    });
    const set = (sel, value, html = false) => $$(sel).forEach((el) => { el[html ? 'innerHTML' : 'textContent'] = value; });
    set('[data-status-text]', copy.strip);
    set('[data-kitchen-state]', copy.cozinha);
    set('[data-kitchen-until]', copy.pedidos);
    set('[data-closing-title]', copy.title, true);
    set('[data-closing-text]', copy.text);
    set('[data-today]', new Intl.DateTimeFormat('pt-BR', { timeZone: CONFIG.timezone, weekday: 'long', day: 'numeric', month: 'short' }).format(new Date()).replace('.', ''));

    const note = $('[data-checkout-note]');
    if (note) { note.textContent = copy.note; note.hidden = !copy.note; }
  }
  renderKitchen();
  setInterval(renderKitchen, 60 * 1000);

  /* ================================================================
     Preço
     ================================================================ */
  const unitPrice = (item) => {
    const size = SIZES[item.size];
    return size.price + Math.max(0, item.extras.length - size.included) * EXTRA_PRICE;
  };

  /* ================================================================
     Sacola
     ================================================================ */
  const isItem = (it) => it && SIZES[it.size] && typeof it.name === 'string' && typeof it.pasta === 'string'
    && typeof it.sauce === 'string' && Array.isArray(it.extras) && Number.isInteger(it.qty) && it.qty > 0;

  let bag = (() => {
    try {
      const data = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
      return Array.isArray(data) ? data.filter(isItem) : [];
    } catch (e) { return []; }
  })();

  const saveBag = () => { try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch (e) { /* sem armazenamento: segue na memória */ } };
  const bagCount = () => bag.reduce((n, it) => n + it.qty, 0);
  const bagTotal = () => bag.reduce((n, it) => n + unitPrice(it) * it.qty, 0);
  const sameDish = (a, b) => a.name === b.name && a.size === b.size && a.pasta === b.pasta && a.sauce === b.sauce
    && [...a.extras].sort().join('|') === [...b.extras].sort().join('|');

  function addToBag(item) {
    const found = bag.find((it) => sameDish(it, item));
    if (found) found.qty = Math.min(20, found.qty + item.qty);
    else bag.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...item, extras: [...item.extras] });
    saveBag();
    renderBag();
    bumpBag();
  }

  function bumpBag() {
    $$('.bag-btn').forEach((btn) => {
      btn.classList.remove('is-bump');
      void btn.offsetWidth;
      btn.classList.add('is-bump');
    });
  }

  const bagList = $('[data-bag-items]');

  function renderBag() {
    const count = bagCount();
    const total = bagTotal();

    $$('[data-bag-count]').forEach((el) => { el.textContent = count; el.hidden = count === 0; });
    $$('[data-open-bag].bag-btn').forEach((btn) => btn.setAttribute('aria-label', count ? `Sacola, ${count} ${count === 1 ? 'item' : 'itens'}` : 'Sacola vazia'));
    $('[data-dock-sum]').textContent = `${count} ${count === 1 ? 'item' : 'itens'} · ${brl(total)}`;
    $('[data-dock-bag]').hidden = count === 0;
    $('[data-dock-build]').hidden = count > 0;

    $('[data-bag-empty]').hidden = count > 0;
    $('[data-bag-filled]').hidden = count === 0;
    $('[data-bag-subtotal]').textContent = brl(total);

    bagList.innerHTML = bag.map((it) => {
      const size = SIZES[it.size];
      const extras = it.extras.map((x, i) => `+ ${esc(x)} ${i < size.included ? '(incluso)' : `(+${num(EXTRA_PRICE)})`}`).join(' · ');
      return `
        <li class="bag-item" data-id="${esc(it.id)}">
          <div class="bag-item__top"><span>${it.qty}x ${esc(it.name)}</span><span>${num(unitPrice(it) * it.qty)}</span></div>
          <p class="bag-item__meta">${esc(it.size)} · ${size.grams} · ${esc(it.pasta)} · molho ${esc(it.sauce)}</p>
          ${extras ? `<p class="bag-item__meta">${extras}</p>` : ''}
          <div class="bag-item__ctrl">
            <div class="qty qty--paper" role="group" aria-label="Quantidade de ${esc(it.name)}">
              <button type="button" data-item-qty="-1" aria-label="Diminuir">−</button>
              <output>${it.qty}</output>
              <button type="button" data-item-qty="1" aria-label="Aumentar">+</button>
            </div>
            <button class="paper-link" type="button" data-item-remove>Remover</button>
          </div>
        </li>`;
    }).join('');
  }

  bagList.addEventListener('click', (e) => {
    const li = e.target.closest('.bag-item');
    if (!li) return;
    const item = bag.find((it) => it.id === li.dataset.id);
    if (!item) return;
    const step = e.target.closest('[data-item-qty]');
    if (step) item.qty += Number(step.dataset.itemQty);
    if (e.target.closest('[data-item-remove]') || item.qty < 1) bag = bag.filter((it) => it !== item);
    else item.qty = Math.min(20, item.qty);
    saveBag();
    renderBag();
    if (!bag.length) $('[data-close-bag].icon-btn').focus();
  });

  /* ---------- Gaveta da sacola ---------- */
  const drawer = $('[data-drawer]');
  const panel = $('.drawer__panel', drawer);
  const outside = [$('main'), $('.nav'), $('.strip'), $('.footer'), $('[data-dock]')];
  let lastFocus = null;

  function openBag() {
    lastFocus = document.activeElement;
    showSent(false);
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    outside.forEach((el) => el && (el.inert = true));
    requestAnimationFrame(() => {
      drawer.classList.add('is-open');
      panel.focus({ preventScroll: true });
    });
  }

  function closeBag() {
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    outside.forEach((el) => el && (el.inert = false));
    setTimeout(() => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; }, reduceMotion ? 0 : 450);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  $$('[data-open-bag]').forEach((btn) => btn.addEventListener('click', openBag));
  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close-bag]')) closeBag(); });
  document.addEventListener('keydown', (e) => {
    if (drawer.hidden) return;
    if (e.key === 'Escape') { closeBag(); return; }
    if (e.key !== 'Tab') return;
    const focusables = $$('a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])', panel)
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- Fechar pedido pelo WhatsApp ---------- */
  const checkout = $('[data-checkout]');
  const checkoutError = $('[data-checkout-error]');
  const payGroup = $('[data-pay-group]');
  const trocoField = $('[data-troco]');

  checkout.addEventListener('change', (e) => {
    if (e.target.name !== 'pagamento') return;
    $$('.pay__opt', payGroup).forEach((opt) => opt.classList.toggle('is-selected', $('input', opt).checked));
    trocoField.hidden = e.target.value !== 'Dinheiro';
  });

  const REQUIRED = [['nome', 'seu nome'], ['endereco', 'rua e número'], ['bairro', 'o bairro'], ['pagamento', 'a forma de pagamento']];
  let triedCheckout = false;
  const checkoutData = () => Object.fromEntries([...new FormData(checkout).entries()].map(([k, v]) => [k, String(v).trim()]));

  function validateCheckout(data) {
    const missing = REQUIRED.filter(([key]) => !data[key]);
    REQUIRED.forEach(([key]) => {
      const target = key === 'pagamento' ? payGroup : checkout.elements[key];
      if (missing.some(([k]) => k === key)) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    });
    checkoutError.textContent = missing.length ? `Falta informar ${listPt(missing.map(([, label]) => label))}.` : '';
    return missing;
  }
  // depois da primeira tentativa, o aviso acompanha o que ainda falta
  ['input', 'change'].forEach((type) => checkout.addEventListener(type, () => { if (triedCheckout) validateCheckout(checkoutData()); }));

  function orderMessage(data) {
    const W = 30;
    const row = (left, right) => {
      const gap = W - left.length - right.length;
      return gap > 0 ? left + ' '.repeat(gap) + right : `${left}\n${' '.repeat(Math.max(0, W - right.length))}${right}`;
    };
    const lines = ['*CREMA · novo pedido*', '```'];
    bag.forEach((it, i) => {
      const size = SIZES[it.size];
      if (i) lines.push('');
      lines.push(`${it.qty}x ${it.name}`);
      lines.push(`   ${it.size} · ${size.grams} · ${it.pasta}`);
      lines.push(`   Molho ${it.sauce}`);
      it.extras.forEach((x, j) => lines.push(row(`   + ${x}`, j < size.included ? 'incluso' : `+${num(EXTRA_PRICE)}`)));
      lines.push(row('   Valor', num(unitPrice(it) * it.qty)));
    });
    lines.push('-'.repeat(W));
    lines.push(row('SUBTOTAL', num(bagTotal())));
    lines.push(row('ENTREGA', 'a confirmar'));
    lines.push('```', '');
    lines.push(`*Nome:* ${data.nome}`);
    lines.push(`*Endereço:* ${data.endereco} — ${data.bairro}`);
    if (data.complemento) lines.push(`*Complemento:* ${data.complemento}`);
    lines.push(`*Pagamento:* ${data.pagamento}${data.pagamento === 'Dinheiro' && data.troco ? ` (troco para ${data.troco})` : ''}`);
    if (data.obs) lines.push(`*Observações:* ${data.obs}`);
    return lines.join('\n');
  }

  checkout.addEventListener('submit', (e) => {
    e.preventDefault();
    triedCheckout = true;
    const data = checkoutData();
    const missing = validateCheckout(data);
    if (missing.length) {
      const first = missing[0][0];
      (first === 'pagamento' ? $('input', payGroup) : checkout.elements[first]).focus();
      return;
    }
    window.open(waLink(orderMessage(data)), '_blank', 'noopener');
    showSent(true);
  });

  function showSent(sent) {
    $('[data-bag-sent]').hidden = !sent;
    if (sent) {
      $('[data-bag-filled]').hidden = true;
      $('[data-bag-empty]').hidden = true;
      $('.bag-sent__title').focus();
    } else {
      renderBag();
    }
  }
  $('[data-back-to-bag]').addEventListener('click', () => showSent(false));
  $('[data-clear-bag]').addEventListener('click', () => {
    bag = [];
    saveBag();
    showSent(false);
    toast('Sacola esvaziada');
  });

  /* ================================================================
     Monte sua massa
     ================================================================ */
  const builder = $('[data-builder]');
  const orderTicket = $('[data-order-ticket]');
  const ticketLines = $('[data-lines]');
  const state = { size: null, pasta: null, sauce: null, extras: [], qty: 1 };
  const COMBOS = $$('[data-dish]').map((card) => ({
    name: card.dataset.name,
    pasta: card.dataset.pasta,
    sauce: card.dataset.sauce,
    extras: card.dataset.extras ? card.dataset.extras.split('|') : [],
  }));

  const missingPicks = () => [['size', 'tamanho'], ['pasta', 'massa'], ['sauce', 'molho']].filter(([key]) => !state[key]).map(([, label]) => label);
  const dishName = () => {
    const combo = COMBOS.find((c) => c.pasta === state.pasta && c.sauce === state.sauce
      && [...c.extras].sort().join('|') === [...state.extras].sort().join('|'));
    return combo ? combo.name : `${state.pasta} ao ${state.sauce}`;
  };

  function linesFor() {
    const lines = [];
    const size = state.size && SIZES[state.size];
    if (size) lines.push({ key: 'size', left: `Massa ${state.size} · ${size.grams}`, right: num(size.price) });
    if (state.pasta) lines.push({ key: 'pasta', left: state.pasta, right: '', sub: true });
    if (state.sauce) lines.push({ key: 'sauce', left: `Molho ${state.sauce}`, right: '', sub: true });
    state.extras.forEach((x, i) => lines.push({
      key: `x:${x}`, left: `+ ${x}`, right: size && i < size.included ? 'incluso' : num(EXTRA_PRICE), sub: true,
    }));
    if (state.qty > 1) lines.push({ key: 'qty', left: 'Quantidade', right: `${state.qty}x` });
    return lines;
  }

  function renderTicket() {
    const lines = linesFor();
    const keys = new Set(lines.map((l) => l.key));

    $$('.t-line', ticketLines).forEach((li) => {
      if (keys.has(li.dataset.key) || li.classList.contains('is-out')) return;
      if (reduceMotion) { li.remove(); return; }
      li.classList.remove('is-new');
      li.classList.add('is-out');
      setTimeout(() => li.remove(), 240);
    });

    let prev = null;
    lines.forEach((line) => {
      let li = $$('.t-line', ticketLines).find((el) => el.dataset.key === line.key && !el.classList.contains('is-out'));
      if (!li) {
        li = document.createElement('li');
        li.className = `t-line is-new${line.sub ? ' t-line--sub' : ''}`;
        li.dataset.key = line.key;
        li.innerHTML = '<span class="t-line__in"><span class="t-l"></span><span class="t-r"></span></span>';
        setTimeout(() => li.classList.remove('is-new'), 700);
      } else if ($('.t-r', li).textContent !== line.right) {
        li.classList.remove('is-flash');
        void li.offsetWidth;
        li.classList.add('is-flash');
      }
      $('.t-l', li).textContent = line.left;
      $('.t-r', li).textContent = line.right;
      if (prev) { if (prev.nextElementSibling !== li) prev.after(li); }
      else if (ticketLines.firstElementChild !== li) ticketLines.prepend(li);
      prev = li;
    });

    $('[data-ticket-empty]').hidden = lines.length > 0;
  }

  function syncBuilder() {
    const size = state.size && SIZES[state.size];
    const missing = missingPicks();
    const ready = missing.length === 0;
    const total = size ? unitPrice({ size: state.size, extras: state.extras }) * state.qty : null;

    $$('.size, .option', builder).forEach((label) => label.classList.toggle('is-selected', $('input', label).checked));
    $$('.group[data-group]', builder).forEach((group) => {
      const req = $('[data-req]', group);
      if (!req) return;
      const done = Boolean(state[group.dataset.group]);
      req.classList.toggle('is-done', done);
      req.textContent = done ? 'Escolhido' : 'Obrigatório';
    });

    $$('.chip', builder).forEach((chip) => {
      const value = $('input', chip).value;
      const pos = state.extras.indexOf(value);
      const included = size && pos > -1 && pos < size.included;
      chip.classList.toggle('is-on', pos > -1 && (included || !size));
      chip.classList.toggle('is-charged', Boolean(size) && pos > -1 && !included);
      $('[data-chip-state]', chip).textContent = pos === -1 ? '' : included ? 'incluso' : `+ ${brl(EXTRA_PRICE)}`;
    });

    $('[data-extras-hint]').textContent = size
      ? `O tamanho ${state.size} inclui ${size.included} ${size.included === 1 ? 'adicional' : 'adicionais'}. Cada extra a mais custa ${brl(EXTRA_PRICE)}.`
      : `Escolha o tamanho para ver quantos adicionais estão inclusos. Cada extra a mais custa ${brl(EXTRA_PRICE)}.`;

    renderTicket();
    $('[data-ticket-total]').textContent = total === null ? '—' : brl(total);
    $('[data-ticket-status]').textContent = ready ? 'Pronto para a cozinha' : `Falta escolher ${listPt(missing)}`;
    orderTicket.classList.toggle('is-ready', ready);
    $('[data-qty-value]').textContent = state.qty;

    $$('[data-add]').forEach((btn) => {
      btn.disabled = !ready;
      const compact = btn.closest('[data-build-bar]');
      btn.textContent = ready
        ? (compact ? 'Adicionar' : `Adicionar à sacola · ${brl(total)}`)
        : (compact ? 'Adicionar' : `Falta escolher ${listPt(missing)}`);
    });

    const barLine = [state.size && `${state.size} · ${size.grams}`, state.pasta, state.sauce].filter(Boolean).join(' · ');
    $('[data-bar-line]').textContent = barLine || 'Escolha o tamanho';
    $('[data-bar-total]').textContent = ready ? brl(total) : missing.length ? `Falta ${listPt(missing)}` : '—';
  }

  builder.addEventListener('change', (e) => {
    const input = e.target;
    if (input.name === 'extras') {
      state.extras = input.checked ? [...state.extras, input.value] : state.extras.filter((x) => x !== input.value);
    } else if (input.name in state) {
      state[input.name] = input.value;
    }
    syncBuilder();
  });

  $$('[data-qty]').forEach((btn) => btn.addEventListener('click', () => {
    state.qty = Math.max(1, Math.min(20, state.qty + Number(btn.dataset.qty)));
    syncBuilder();
  }));

  function resetBuilder() {
    builder.reset();
    Object.assign(state, { size: null, pasta: null, sauce: null, extras: [], qty: 1 });
    syncBuilder();
  }

  let tearing = false;
  function addFromBuilder() {
    if (tearing || missingPicks().length) return;
    const name = dishName();
    addToBag({ name, size: state.size, pasta: state.pasta, sauce: state.sauce, extras: [...state.extras], qty: state.qty });
    toast(`${name} na sacola`);
    if (reduceMotion) { resetBuilder(); return; }
    tearing = true;
    orderTicket.classList.add('is-tearing');
    setTimeout(() => {
      tearing = false;
      orderTicket.classList.remove('is-tearing', 'is-ready');
      resetBuilder();
      orderTicket.classList.add('is-fresh');
      setTimeout(() => orderTicket.classList.remove('is-fresh'), 520);
    }, 480);
  }
  $$('[data-add]').forEach((btn) => btn.addEventListener('click', addFromBuilder));

  /* ---------- Pratos da casa ---------- */
  function prefill(combo) {
    const keepSize = state.size;
    builder.reset();
    Object.assign(state, { size: keepSize, pasta: combo.pasta, sauce: combo.sauce, extras: [...combo.extras], qty: 1 });
    $$('input', builder).forEach((input) => {
      input.checked = (input.name === 'size' && input.value === state.size)
        || (input.name === 'pasta' && input.value === state.pasta)
        || (input.name === 'sauce' && input.value === state.sauce)
        || (input.name === 'extras' && state.extras.includes(input.value));
    });
    syncBuilder();
    $('#monte').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (!state.size) setTimeout(() => $('input[name="size"]', builder).focus({ preventScroll: true }), reduceMotion ? 0 : 600);
  }

  $$('[data-dish]').forEach((card, i) => {
    const combo = COMBOS[i];
    $$('[data-quick]', card).forEach((btn) => btn.addEventListener('click', () => {
      addToBag({ ...combo, size: btn.dataset.quick, qty: 1 });
      toast(`${combo.name} ${btn.dataset.quick} na sacola`);
      btn.classList.add('is-added');
      setTimeout(() => btn.classList.remove('is-added'), 900);
    }));
    $('[data-customize]', card).addEventListener('click', () => prefill(combo));
  });

  /* ---------- Bairro ---------- */
  const area = $('[data-area]');
  area.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = area.elements.bairro;
    const value = input.value.trim();
    const error = $('[data-area-error]');
    if (!value) {
      error.textContent = 'Digite o nome do seu bairro para perguntar.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    window.open(waLink(`Olá, CREMA! Vocês entregam no bairro ${value}?`), '_blank', 'noopener');
  });

  /* ---------- Aviso ---------- */
  const toastEl = $('[data-toast]');
  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  /* ================================================================
     Navegação, barra do celular e revelações
     ================================================================ */
  // a borda da navegação aparece quando a faixa de status sai da tela — sem ler o scroll a cada quadro
  const nav = $('[data-nav]');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => nav.classList.toggle('is-scrolled', !entry.isIntersecting)).observe($('.strip'));
  }

  const menuBtn = $('[data-menu-toggle]');
  const sheet = $('[data-sheet]');
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add('is-open'));
    } else {
      sheet.classList.remove('is-open');
      setTimeout(() => { if (!sheet.classList.contains('is-open')) sheet.hidden = true; }, reduceMotion ? 0 : 350);
    }
  }
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  sheet.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); }
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // A barra de pedido some enquanto os botões do topo estão visíveis
  // e enquanto a seção de montar está na tela (ela tem a própria barra).
  const dock = $('[data-dock]');
  if ('IntersectionObserver' in window) {
    const hidden = { hero: true, build: false };
    const syncDock = () => dock.classList.toggle('is-hidden', hidden.hero || hidden.build);
    syncDock();
    new IntersectionObserver(([entry]) => { hidden.hero = entry.isIntersecting; syncDock(); }).observe($('.hero__actions'));
    new IntersectionObserver(([entry]) => { hidden.build = entry.isIntersecting; syncDock(); }, {
      rootMargin: '-35% 0px -35% 0px',
    }).observe($('#monte'));

    const reveals = $$('.reveal');
    if (reduceMotion) reveals.forEach((el) => el.classList.add('is-in'));
    else {
      const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      reveals.forEach((el) => io.observe(el));
    }
  } else {
    $$('.reveal').forEach((el) => el.classList.add('is-in'));
  }

  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  renderBag();
  syncBuilder();
})();
