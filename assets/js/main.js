/* CREMA, vitrine e pedido */
(() => {
  'use strict';

  /* ================================================================
     Configuração: troque pelos dados reais da CREMA
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
    P: { price: 29.9, included: 1, grams: '300 g' },
    M: { price: 36.9, included: 2, grams: '450 g' },
    G: { price: 44.9, included: 3, grams: '600 g' },
  };
  const EXTRA_PRICE = 5;
  const BAG_KEY = 'crema:sacola:v1';
  const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  // como cada molho aparece no nome do prato
  const SAUCE_NAME = {
    'Alfredo cremoso': 'ao Alfredo',
    'Sugo San Marzano': 'ao sugo San Marzano',
    'Pesto genovês': 'ao pesto genovês',
    'Rosé especial': 'ao molho rosé',
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const brl = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');
  const num = (v) => v.toFixed(2).replace('.', ',');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const listPt = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`);
  const waLink = (text) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
  const photo = (id, w, h) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;

  document.documentElement.classList.replace('no-js', 'js');

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

  function renderKitchen() {
    const { state, next } = kitchenNow();
    const h = `${CONFIG.opensAt}h`;
    const until = `${CONFIG.closesAt}h`;

    const copy = {
      open: {
        status: `Aberto agora. Pedidos até ${until}`,
        title: 'A cozinha está acesa.',
        text: `Pedidos até as ${until}. Monte a sua e a massa vai para a panela.`,
        note: '',
      },
      later: {
        status: `Abrimos hoje às ${h}`,
        title: 'A cozinha já vai acender.',
        text: `Abrimos hoje às ${h}. Monte a sua agora e envie quando quiser.`,
        note: `Estamos fechados agora. Você pode enviar o pedido e a gente responde a partir das ${h}.`,
      },
      closed: {
        status: `Fechado agora. Abrimos ${next} às ${h}`,
        title: 'Hoje a cozinha descansa.',
        text: `Abrimos ${next} às ${h}. Deixe a sua montada na sacola.`,
        note: `Estamos fechados agora. Você pode enviar o pedido e a gente responde ${next}, a partir das ${h}.`,
      },
    }[state];

    $$('[data-status]').forEach((el) => {
      el.classList.toggle('is-open', state === 'open');
      el.classList.toggle('is-later', state === 'later');
      el.classList.toggle('is-closed', state === 'closed');
    });
    const set = (sel, value) => $$(sel).forEach((el) => { el.textContent = value; });
    set('[data-status-text]', copy.status);
    set('[data-closing-title]', copy.title);
    set('[data-closing-text]', copy.text);

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
    $('[data-dock-sum]').textContent = `${count} ${count === 1 ? 'item' : 'itens'}, ${brl(total)}`;
    $('[data-dock-bag]').hidden = count === 0;
    $('[data-dock-build]').hidden = count > 0;

    $('[data-bag-empty]').hidden = count > 0;
    $('[data-bag-filled]').hidden = count === 0;
    $('[data-bag-subtotal]').textContent = brl(total);

    bagList.innerHTML = bag.map((it) => {
      const size = SIZES[it.size];
      const extras = it.extras.map((x, i) => `${esc(x)} ${i < size.included ? '(incluso)' : `(+ ${num(EXTRA_PRICE)})`}`).join(', ');
      return `
        <li class="bag-item" data-id="${esc(it.id)}">
          <div class="bag-item__top"><span>${it.qty}x ${esc(it.name)}</span><span>${brl(unitPrice(it) * it.qty)}</span></div>
          <p class="bag-item__meta">${esc(it.size)}, ${size.grams} · ${esc(it.pasta)} · molho ${esc(it.sauce)}</p>
          ${extras ? `<p class="bag-item__meta">${extras}</p>` : ''}
          <div class="bag-item__ctrl">
            <div class="qty qty--sm" role="group" aria-label="Quantidade de ${esc(it.name)}">
              <button type="button" data-item-qty="-1" aria-label="Diminuir">−</button>
              <output>${it.qty}</output>
              <button type="button" data-item-qty="1" aria-label="Aumentar">+</button>
            </div>
            <button class="text-btn" type="button" data-item-remove>Remover</button>
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
  const outside = [$('main'), $('.nav'), $('.footer'), $('[data-dock]')];
  let lastFocus = null;

  function openBag() {
    lastFocus = document.activeElement;
    toastEl.classList.remove('is-visible');
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
    setTimeout(() => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; }, reduceMotion ? 0 : 500);
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
    lines.push(`*Endereço:* ${data.endereco}, ${data.bairro}`);
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
  const plate = $('[data-plate]');
  const plateTitle = $('[data-plate-title]');
  const plateLines = $('[data-lines]');
  const state = { size: null, pasta: null, sauce: null, extras: [], qty: 1 };
  const COMBOS = $$('[data-dish]').map((card) => ({
    name: card.dataset.name,
    pasta: card.dataset.pasta,
    sauce: card.dataset.sauce,
    extras: card.dataset.extras ? card.dataset.extras.split('|') : [],
  }));

  const missingPicks = () => [['size', 'tamanho'], ['pasta', 'massa'], ['sauce', 'molho']].filter(([key]) => !state[key]).map(([, label]) => label);

  // nome do prato: o da casa, se a combinação for igual; senão, massa + molho
  const dishName = () => {
    const combo = COMBOS.find((c) => c.pasta === state.pasta && c.sauce === state.sauce
      && [...c.extras].sort().join('|') === [...state.extras].sort().join('|'));
    if (combo) return combo.name;
    if (state.pasta && state.sauce) return `${state.pasta} ${SAUCE_NAME[state.sauce]}`;
    if (state.pasta) return state.pasta;
    if (state.sauce) return `Massa ${SAUCE_NAME[state.sauce]}`;
    return '';
  };

  /* foto do prato: a do molho, senão a da massa, senão a de abertura */
  const photoBox = $('[data-plate-photo]');
  const barThumb = $('[data-bar-thumb]');
  let shownPhoto = photoBox.dataset.default;
  let photoTurn = 0;

  const pickedPhoto = () => {
    const input = (name) => state[name] && $$(`input[name="${name}"]`, builder).find((el) => el.value === state[name]);
    const chosen = input('sauce') || input('pasta');
    return chosen ? chosen.dataset.photo : photoBox.dataset.default;
  };

  function showPhoto(id) {
    if (id === shownPhoto) return;
    shownPhoto = id;
    const turn = ++photoTurn;
    const [a, b] = $$('.plate__img', photoBox);
    const current = a.classList.contains('is-current') ? a : b;
    const next = current === a ? b : a;
    next.srcset = [640, 960, 1280].map((w) => `${photo(id, w, w * 9 / 16)} ${w}w`).join(', ');
    next.src = photo(id, 960, 540);
    const swap = () => {
      if (turn !== photoTurn) return;
      next.classList.add('is-current');
      current.classList.remove('is-current');
    };
    if (reduceMotion || !next.decode) swap();
    else next.decode().then(swap, swap);
    barThumb.src = photo(id, 96, 96);
  }

  function linesFor() {
    const size = state.size && SIZES[state.size];
    if (!size) return [];
    const lines = [{ key: 'size', left: `Massa ${state.size}, ${size.grams}`, right: num(size.price) }];
    const charged = Math.max(0, state.extras.length - size.included);
    if (charged) lines.push({ key: 'charged', left: `${charged} ${charged === 1 ? 'extra a mais' : 'extras a mais'}`, right: `+ ${num(charged * EXTRA_PRICE)}` });
    if (state.qty > 1) lines.push({ key: 'qty', left: 'Quantidade', right: `${state.qty}x` });
    return lines;
  }

  function renderLines() {
    const before = new Set($$('.plate__line', plateLines).map((li) => li.dataset.key));
    plateLines.innerHTML = linesFor().map((l) => `
      <li class="plate__line${before.has(l.key) ? '' : ' is-new'}" data-key="${l.key}"><span>${esc(l.left)}</span><span>${esc(l.right)}</span></li>`).join('');
  }

  function plateMeta(size) {
    const parts = [];
    if (state.extras.length) parts.push(`Com ${listPt(state.extras.map((x) => x.toLowerCase()))}.`);
    if (size && state.extras.length < size.included) {
      const left = size.included - state.extras.length;
      parts.push(left === 1 ? 'Ainda cabe 1 extra incluso.' : `Ainda cabem ${left} extras inclusos.`);
    }
    if (!parts.length) parts.push(state.size ? 'Sem extras.' : 'Escolha o tamanho, a massa e o molho.');
    return parts.join(' ');
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

    $$('.extra', builder).forEach((row) => {
      const value = $('input', row).value;
      const pos = state.extras.indexOf(value);
      const included = size && pos > -1 && pos < size.included;
      row.classList.toggle('is-on', pos > -1);
      row.classList.toggle('is-charged', Boolean(size) && pos > -1 && !included);
      $('[data-extra-state]', row).textContent = pos === -1 ? '' : !size ? 'escolhido' : included ? 'incluso' : `+ ${brl(EXTRA_PRICE)}`;
    });

    $('[data-extras-hint]').textContent = size
      ? `O tamanho ${state.size} inclui ${size.included} ${size.included === 1 ? 'extra' : 'extras'}. Cada extra a mais custa ${brl(EXTRA_PRICE)}.`
      : `Escolha o tamanho para ver quantos extras estão inclusos. Cada extra a mais custa ${brl(EXTRA_PRICE)}.`;

    // o nome do prato se forma conforme as escolhas
    const name = dishName();
    const title = name || 'Seu prato aparece aqui';
    if (plateTitle.textContent !== title) {
      plateTitle.textContent = title;
      plateTitle.classList.toggle('is-empty', !name);
      if (!reduceMotion) {
        plateTitle.classList.remove('is-changing');
        void plateTitle.offsetWidth;
        plateTitle.classList.add('is-changing');
      }
    }
    $('[data-plate-meta]').textContent = plateMeta(size);
    showPhoto(pickedPhoto());

    renderLines();
    $('[data-ticket-total]').textContent = total === null ? '—' : brl(total);
    $('[data-ticket-status]').textContent = ready ? 'Pronto para a sacola' : `Falta escolher ${listPt(missing)}`;
    plate.classList.toggle('is-ready', ready);
    $('[data-qty-value]').textContent = state.qty;

    $$('[data-add]').forEach((btn) => {
      btn.disabled = !ready;
      const compact = btn.closest('[data-build-bar]');
      btn.textContent = compact ? 'Adicionar' : ready ? `Adicionar · ${brl(total)}` : 'Adicionar à sacola';
    });

    $('[data-bar-line]').textContent = name || (state.size ? `Tamanho ${state.size}, ${size.grams}` : 'Escolha o tamanho');
    $('[data-bar-total]').textContent = ready ? `${state.size}, ${size.grams} · ${brl(total)}` : `Falta ${listPt(missing)}`;
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

  let adding = false;
  function addFromBuilder() {
    if (adding || missingPicks().length) return;
    const name = dishName();
    addToBag({ name, size: state.size, pasta: state.pasta, sauce: state.sauce, extras: [...state.extras], qty: state.qty });
    toast(`${name} na sacola`);
    if (reduceMotion) { resetBuilder(); return; }
    adding = true;
    plate.classList.add('is-sent');
    setTimeout(() => {
      adding = false;
      plate.classList.remove('is-sent');
      resetBuilder();
    }, 500);
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
  // a navegação ganha fundo quando o topo da página sai da tela, sem ler o scroll a cada quadro
  const nav = $('[data-nav]');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => nav.classList.toggle('is-scrolled', !entry.isIntersecting)).observe($('[data-top]'));
  }

  const menuBtn = $('[data-menu-toggle]');
  const sheet = $('[data-sheet]');
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.style.overflow = open ? 'hidden' : '';
    document.body.classList.toggle('menu-open', open);
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
