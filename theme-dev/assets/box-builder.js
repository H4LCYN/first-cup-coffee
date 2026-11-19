/*
 * Subscription box builder (snippets/box-builder.liquid).
 *
 * A box is a Recharge Bundle with several coffees in it. There is one box per
 * format (16 oz bags, 5 lb bulk, pods) because each Recharge bundle product
 * draws from its own collection.
 *
 *   - Boxes live in the "fc_boxes" cookie until checkout: { bag: { items: [{h, v, q}], plan, inCart, dirty } }
 *     h = product handle, v = variant id, q = quantity. Titles and images are
 *     looked up from /products/<handle>.js and cached for the tab, so the cookie stays small.
 *   - "Subscribe to Box" turns the box into one cart line, the same way the
 *     single-coffee subscription does: recharge.bundle.getBundleId() then
 *     /cart/add.js with the bundle variant, selling plan and _rb_id.
 *   - A box that is in the cart can still be edited; the drawer then swaps the cart line.
 *   - When that cart line is gone (removed, or the order was placed) the box is cleared.
 *
 * Public API: window.FCBox.add(), .open(), .get()
 */
(function () {
  var cfgEl = document.querySelector('[data-box-config]');
  if (!cfgEl) return;
  var CFG;
  try { CFG = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  var COOKIE = 'fc_boxes';
  var COOKIE_DAYS = 30;
  var CACHE_KEY = 'fc_box_products';
  var LINE_PROP = '_box_format';

  // Only formats whose bundle product actually resolved are usable.
  var FORMATS = {};
  var ORDER = [];
  CFG.formats.forEach(function (f) {
    f.variants = f.variants.filter(function (v) { return v.bags > 0 && v.available; })
      .sort(function (a, b) { return a.bags - b.bags; });
    if (f.bundleProductId && f.collectionId && f.variants.length && f.plans.length) {
      FORMATS[f.key] = f;
      ORDER.push(f.key);
    }
  });
  if (!ORDER.length) return;

  var drawer = document.querySelector('[data-box-drawer]');
  var panel = drawer.querySelector('.fcbox__panel');
  var body = drawer.querySelector('[data-box-body]');
  var fab = document.querySelector('[data-box-fab]');
  var fabCount = document.querySelector('[data-box-fab-count]');

  var ui = { format: ORDER[0], pending: null, message: '', error: '', busy: false, step: 'box', lastFocus: null };

  /* ---------- store ---------- */

  function readCookie() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    if (!m) return {};
    try { return JSON.parse(decodeURIComponent(m[1])) || {}; } catch (e) { return {}; }
  }

  function clean(raw) {
    var out = {};
    ORDER.forEach(function (key) {
      var b = raw && raw[key];
      var items = (b && Array.isArray(b.items) ? b.items : []).filter(function (i) {
        return i && i.h && i.v && i.q > 0;
      }).map(function (i) { return { h: String(i.h), v: Number(i.v), q: Math.floor(i.q) }; });
      var plan = b && b.plan;
      var known = FORMATS[key].plans.some(function (p) { return p.id === plan; });
      out[key] = { items: items, plan: known ? plan : defaultPlan(key), inCart: !!(b && b.inCart), dirty: !!(b && b.dirty) };
    });
    return out;
  }

  // Monthly is the usual pick; fall back to the first plan.
  function defaultPlan(key) {
    var plans = FORMATS[key].plans;
    var monthly = plans.filter(function (p) { return /\b30\b/.test(p.name); })[0];
    return (monthly || plans[0]).id;
  }

  var state = clean(readCookie());

  function save() {
    var slim = {};
    var any = false;
    ORDER.forEach(function (key) {
      var b = state[key];
      if (b.items.length || b.inCart) { slim[key] = b; any = true; }
    });
    var value = any ? encodeURIComponent(JSON.stringify(slim)) : '';
    var age = any ? COOKIE_DAYS * 86400 : 0;
    document.cookie = COOKIE + '=' + value + '; path=/; max-age=' + age + '; SameSite=Lax';
    render();
    document.dispatchEvent(new CustomEvent('fcbox:change', { detail: state }));
  }

  function total(key) {
    return state[key].items.reduce(function (n, i) { return n + i.q; }, 0);
  }
  function capacity(key) {
    var v = FORMATS[key].variants;
    return v[v.length - 1].bags;
  }
  function sizeVariant(key, bags) {
    return FORMATS[key].variants.filter(function (v) { return v.bags === bags; })[0] || null;
  }
  function pctOff(v) {
    return v && v.compareAt > v.price ? Math.round((v.compareAt - v.price) * 100 / v.compareAt) : 0;
  }
  function touch(key) {
    if (state[key].inCart) state[key].dirty = true;
  }

  function addItem(key, handle, variantId, qty) {
    var box = state[key];
    qty = qty || 1;
    if (total(key) + qty > capacity(key)) return false;
    var line = box.items.filter(function (i) { return i.v === variantId; })[0];
    if (line) line.q += qty;
    else box.items.push({ h: handle, v: variantId, q: qty });
    touch(key);
    return true;
  }

  function setQty(key, variantId, qty) {
    var box = state[key];
    var line = box.items.filter(function (i) { return i.v === variantId; })[0];
    if (!line) return;
    var room = capacity(key) - (total(key) - line.q);
    line.q = Math.max(0, Math.min(qty, room));
    box.items = box.items.filter(function (i) { return i.q > 0; });
    touch(key);
  }

  /* ---------- product details (titles, images) ---------- */

  var info = {};
  try { info = JSON.parse(sessionStorage.getItem(CACHE_KEY)) || {}; } catch (e) { info = {}; }
  var loading = {};

  function remember(handle, data) {
    info[handle] = data;
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(info)); } catch (e) {}
  }

  function ensureInfo(handle) {
    if (info[handle]) return Promise.resolve(info[handle]);
    if (!loading[handle]) {
      loading[handle] = fetch(CFG.root + 'products/' + encodeURIComponent(handle) + '.js')
        .then(function (res) { if (!res.ok) throw new Error('missing'); return res.json(); })
        .then(function (p) {
          var variants = {};
          p.variants.forEach(function (v) { variants[v.id] = { title: v.title, available: v.available }; });
          remember(handle, { id: p.id, title: p.title, image: p.featured_image || '', variants: variants });
          return info[handle];
        });
    }
    return loading[handle];
  }

  function rememberFromButton(btn) {
    var handle = btn.getAttribute('data-box-handle');
    var variants = {};
    readVariants(btn).forEach(function (v) { variants[v.id] = { title: v.title, available: v.available }; });
    remember(handle, {
      id: Number(btn.getAttribute('data-box-product-id')),
      title: btn.getAttribute('data-box-title') || '',
      image: btn.getAttribute('data-box-image') || '',
      variants: variants,
    });
  }

  function readVariants(btn) {
    try { return JSON.parse(btn.getAttribute('data-box-variants')) || []; } catch (e) { return []; }
  }

  /* ---------- rendering ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) {
    return '$' + (cents / 100).toFixed(2);
  }
  function unit(key, n) {
    var word = key === 'pod' ? 'box' : 'bag';
    return n + ' ' + word + (n === 1 ? '' : (word === 'box' ? 'es' : 's'));
  }
  function variantLabel(title) {
    return title && title !== 'Default Title' ? title : '';
  }

  // Short nudge for the red pill on every box button, read from the bundle's own discounts.
  function tagText(key) {
    var count = total(key);
    var best = FORMATS[key].variants.reduce(function (m, v) { return Math.max(m, pctOff(v)); }, 0);
    if (!best) return '';
    if (!count) return 'Save up to ' + best + '%';
    var now = pctOff(sizeVariant(key, count));
    var next = pctOff(sizeVariant(key, count + 1));
    if (next > now) return '1 more = ' + next + '% off';
    return now ? now + '% off' : '';
  }

  function renderButtons() {
    document.querySelectorAll('[data-box-add]').forEach(function (btn) {
      var key = btn.getAttribute('data-box-format');
      if (!FORMATS[key]) { btn.hidden = true; return; }
      btn.hidden = false;
      var count = total(key);
      var tag = tagText(key);
      btn.innerHTML = (tag ? '<span class="fc-box-tag">' + esc(tag) + '</span>' : '') +
        '<span data-box-label>' + esc(count ? CFG.labels.add : CFG.labels.create) + '</span>';
      btn.classList.toggle('has-tag', !!tag);
      btn.classList.toggle('is-active', count > 0);
    });
  }

  function renderFab() {
    var filled = ORDER.filter(function (key) { return total(key) > 0; });
    fab.hidden = !filled.length;
    if (!filled.length) return;
    var bags = filled.reduce(function (n, key) { return n + total(key); }, 0);
    fabCount.textContent = filled.length === 1 ? total(filled[0]) + '/' + capacity(filled[0]) : String(bags);
    fab.setAttribute('aria-label', 'Open your box, ' + bags + ' item' + (bags === 1 ? '' : 's'));
  }

  function renderCartPanel() {
    // The cart page and the slide-out mini cart each have a spot for this.
    var hosts = document.querySelectorAll('[data-box-cart-panel]');
    if (!hosts.length) return;
    var html = '';
    ORDER.forEach(function (key) {
      var box = state[key];
      var count = total(key);
      if (!count || (box.inCart && !box.dirty)) return;
      var text = box.inCart
        ? 'You changed your ' + esc(FORMATS[key].label) + '. Update it so your cart matches.'
        : 'Your ' + esc(FORMATS[key].label) + ' has ' + unit(key, count) + ' and is not in your cart yet.';
      html += '<div class="fcbox-note"><p class="fcbox-note__text">' + text + `&nbsp;` +
        '<button type="button" class="fc-box-btn fc-box-btn--solid" data-box-open="' + key + '">' +
        (box.inCart ? 'Update box' : 'Finish your box') + '</button></p></div>';
    });
    // Nothing started yet: invite the shopper to build a box.
    var started = ORDER.some(function (key) { return total(key) > 0 || state[key].inCart; });
    if (!started) {
      var first = ORDER[0];
      var nudge = tagText(first);
      html = '<div class="fcbox-note"><p class="fcbox-note__text">Subscribe and build a box of your favorite coffees' +
        (nudge ? ' to ' + nudge.toLowerCase() : '') + '.</p>' +
        '<button type="button" class="fc-box-btn fc-box-btn--solid' + (nudge ? ' has-tag' : '') + '" data-box-open="">' +
        (nudge ? '<span class="fc-box-tag">' + esc(nudge) + '</span>' : '') + esc(CFG.labels.create) + '</button></div>';
    }
    hosts.forEach(function (host) {
      host.innerHTML = html;
      host.hidden = !html;
    });
  }

  /* ---------- guided start: choose a format, then pick coffees ---------- */

  var catalog = {};

  // The coffees a box can hold: everything in the format's bundle collection.
  function loadCatalog(key) {
    if (catalog[key]) return;
    catalog[key] = { loading: true, items: [] };
    fetch(CFG.root + 'collections/' + encodeURIComponent(FORMATS[key].collectionHandle) + '/products.json?limit=250')
      .then(function (res) { if (!res.ok) throw new Error('catalog'); return res.json(); })
      .then(function (data) {
        var items = (data.products || []).filter(function (p) { return p.id !== FORMATS[key].bundleProductId; }).map(function (p) {
          var src = p.images && p.images[0] ? p.images[0].src : '';
          var variants = {};
          p.variants.forEach(function (v) { variants[v.id] = { title: v.title, available: v.available }; });
          remember(p.handle, { id: p.id, title: p.title, image: src ? src + (src.indexOf('?') > -1 ? '&' : '?') + 'width=200' : '', variants: variants });
          return { handle: p.handle, title: p.title, variants: p.variants.map(function (v) { return { id: v.id, title: v.title, available: v.available }; }) };
        }).filter(function (p) { return p.variants.some(function (v) { return v.available; }); });
        catalog[key] = { loading: false, items: items };
      })
      .catch(function () { catalog[key] = { loading: false, failed: true, items: [] }; })
      .then(function () { renderDrawer(); });
  }

  // First screen when a box is opened empty from the cart: which kind of box?
  function renderFormats() {
    var html = '<p class="fcbox__eyebrow">Build your box</p><h3 class="fcbox__step">Choose a format</h3><div class="fcbox__formats">';
    ORDER.forEach(function (k) {
      var f = FORMATS[k];
      html += '<button type="button" class="fcbox__format" data-box-format-pick="' + k + '">' +
        (f.image ? '<img src="' + esc(f.image) + '" alt="">' : '') +
        '<span class="fcbox__format-name">' + esc(f.short || f.label) + '</span>' +
        '<span class="fcbox__format-note">' + esc(tagText(k) || 'Subscribe and save') + '</span></button>';
    });
    return html + '</div><p class="fcbox__progress">Mix any coffees you like. Change or cancel your subscription anytime.</p>';
  }

  // Coffee list inside the box, so a box can be filled without leaving the drawer.
  function renderPicker(key, count, cap) {
    if (count >= cap) return '';
    loadCatalog(key);
    var c = catalog[key];
    var html = '<div class="fcbox__picker"><h3 class="fcbox__step">' + (count ? 'Add more coffees' : 'Pick your coffees') + '</h3>';
    if (c.loading) return html + '<p class="fcbox__progress">Loading coffees…</p></div>';
    if (c.failed || !c.items.length) {
      return html + '<p class="fcbox__progress">We could not load the coffees here. <a href="' + esc(CFG.shopUrl) + '">Browse coffees</a> and use Add to Box.</p></div>';
    }
    html += '<ul class="fcbox__choices">';
    c.items.forEach(function (p) {
      var img = info[p.handle] && info[p.handle].image;
      html += '<li class="fcbox__choice">' +
        (img ? '<img class="fcbox__item-img" src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="fcbox__item-img"></span>') +
        '<div class="fcbox__choice-main"><span class="fcbox__item-title">' + esc(p.title) + '</span><div class="fcbox__pills">';
      p.variants.forEach(function (v) {
        var label = variantLabel(v.title);
        html += '<button type="button" class="fcbox__pill fcbox__pill--add" data-box-add-variant="' + v.id + '" data-handle="' + esc(p.handle) + '"' +
          (v.available ? '' : ' disabled') + ' aria-label="Add ' + esc(p.title) + (label ? ', ' + esc(label) : '') + ' to your box">+ ' + esc(label || 'Add') + '</button>';
      });
      html += '</div></div></li>';
    });
    return html + '</ul></div>';
  }

  function renderDrawer() {
    if (drawer.hidden) return;
    if (ui.step === 'format') {
      body.innerHTML = renderFormats();
      return;
    }
    var key = ui.format;
    var fmt = FORMATS[key];
    var box = state[key];
    var count = total(key);
    var cap = capacity(key);
    var size = sizeVariant(key, count);
    var html = '';

    // Tabs: only when there is more than one box to switch between.
    var tabs = ORDER.filter(function (k) { return k === key || total(k) > 0; });
    if (tabs.length > 1) {
      html += '<div class="fcbox__tabs" role="tablist" aria-label="Your boxes">';
      tabs.forEach(function (k) {
        html += '<button type="button" role="tab" class="fcbox__tab" aria-selected="' + (k === key) + '" data-box-tab="' + k + '">' +
          esc(FORMATS[k].label) + ' <span class="fcbox__tab-n">' + total(k) + '</span></button>';
      });
      html += '</div>';
    } else {
      html += '<p class="fcbox__eyebrow">' + esc(fmt.label) + '</p>';
    }

    // Variant choice for a product added from a card (e.g. Whole Bean / Ground).
    if (ui.pending && ui.pending.format === key) {
      html += '<div class="fcbox__pending"><p class="fcbox__pending-title">Choose an option for ' + esc(ui.pending.title) + '</p><div class="fcbox__pills">';
      ui.pending.variants.forEach(function (v) {
        html += '<button type="button" class="fcbox__pill" data-box-pick="' + v.id + '"' + (v.available ? '' : ' disabled') + '>' +
          esc(v.title) + (v.available ? '' : ' (sold out)') + '</button>';
      });
      html += '</div></div>';
    }

    // Slots
    html += '<div class="fcbox__slots" aria-hidden="true">';
    var filled = [];
    box.items.forEach(function (i) { for (var n = 0; n < i.q; n++) filled.push(i); });
    for (var s = 0; s < cap; s++) {
      var it = filled[s];
      var img = it && info[it.h] && info[it.h].image;
      html += '<div class="fcbox__slot' + (it ? ' is-filled' : '') + '">' +
        (it ? (img ? '<img src="' + esc(img) + '" alt="">' : '') : '<span>+</span>') + '</div>';
    }
    html += '</div>';

    // Progress line: what the next bag earns.
    var next = sizeVariant(key, count + 1);
    var progress = count + ' of ' + cap + ' added';
    if (!count) progress = 'Add up to ' + unit(key, cap) + '. Mix any coffees you like.';
    else if (next && pctOff(next) > pctOff(size)) progress += '. Add 1 more for ' + pctOff(next) + '% off.';
    else if (count >= cap) progress += '. Your box is full.';
    html += '<p class="fcbox__progress">' + progress + '</p>';

    html += '<p class="fcbox__message">All subscriptions are eligible for <b>FREE SHIPPING!</b></p>';
    if (ui.message) html += '<p class="fcbox__message" role="status">' + esc(ui.message) + '</p>';

    // Items
    if (count) {
      html += '<ul class="fcbox__items">';
      box.items.forEach(function (i) {
        var p = info[i.h] || {};
        var vt = p.variants && p.variants[i.v] ? variantLabel(p.variants[i.v].title) : '';
        var name = p.title || i.h.replace(/-/g, ' ');
        html += '<li class="fcbox__item">' +
          (p.image ? '<img class="fcbox__item-img" src="' + esc(p.image) + '" alt="">' : '<span class="fcbox__item-img"></span>') +
          '<div class="fcbox__item-text"><span class="fcbox__item-title">' + esc(name) + '</span>' +
          (vt ? '<span class="fcbox__item-variant">' + esc(vt) + '</span>' : '') + '</div>' +
          '<div class="fcbox__qty">' +
          '<button type="button" data-box-qty="' + i.v + '" data-delta="-1" aria-label="Remove one ' + esc(name) + '">&minus;</button>' +
          '<span aria-live="polite">' + i.q + '</span>' +
          '<button type="button" data-box-qty="' + i.v + '" data-delta="1" aria-label="Add one ' + esc(name) + '"' + (count >= cap ? ' disabled' : '') + '>+</button>' +
          '</div></li>';
      });
      html += '</ul>';

      // Delivery
      html += '<fieldset class="fcbox__plans"><legend>Deliver every</legend><div class="fcbox__pills">';
      fmt.plans.forEach(function (p) {
        var label = (p.name.match(/\d+\s*\w+/) || [p.name])[0];
        html += '<label class="fcbox__pill-wrap"><input type="radio" name="fcbox_plan" value="' + p.id + '"' +
          (p.id === box.plan ? ' checked' : '') + '><span class="fcbox__pill">' + esc(label) + '</span></label>';
      });
      html += '</div></fieldset>';
    }

    html += renderPicker(key, count, cap);

    // Summary + CTA
    html += '<div class="fcbox__foot">';
    if (size) {
      var pct = pctOff(size);
      html += '<div class="fcbox__total"><span>' + unit(key, count) + ', every delivery</span><span>' +
        (pct ? '<s>' + money(size.compareAt) + '</s> ' : '') + '<strong>' + money(size.price) + '</strong>' +
        (pct ? ' <em class="fcbox__tag">' + pct + '% off</em>' : '') + '</span></div>';
    }
    var cta = CFG.labels.checkout;
    var action = 'commit';
    if (box.inCart && !box.dirty) { cta = 'View cart'; action = 'cart'; }
    else if (box.inCart && !count) { cta = 'Remove box from cart'; }
    else if (box.inCart) { cta = 'Update box in cart'; }
    var disabled = ui.busy || (!count && !box.inCart) || (count > 0 && !size);
    html += '<p class="fcbox__error" role="alert"' + (ui.error ? '' : ' hidden') + '>' + esc(ui.error) + '</p>';
    html += '<button type="button" class="fcbox__cta" data-box-action="' + action + '"' + (disabled ? ' disabled' : '') +
      ' aria-busy="' + ui.busy + '">' + (ui.busy ? 'Working…' : esc(cta)) + '</button>';
    html += '<div class="fcbox__links">' +
      (count ? '<button type="button" data-box-close>Keep shopping</button>' : '<a href="' + esc(CFG.shopUrl) + '">Browse coffees</a>') +
      (count ? '<button type="button" data-box-action="clear">Empty box</button>' : (ORDER.length > 1 && !box.inCart ? '<button type="button" data-box-action="formats">Change format</button>' : '')) + '</div>';
    html += '</div>';

    // Redrawing replaces the buttons, so put keyboard focus back where it was.
    var active = document.activeElement;
    var keep = null;
    if (body.contains(active)) {
      if (active.hasAttribute('data-box-qty')) keep = '[data-box-qty="' + active.getAttribute('data-box-qty') + '"][data-delta="' + active.getAttribute('data-delta') + '"]';
      else if (active.name === 'fcbox_plan') keep = 'input[name="fcbox_plan"]:checked';
      else if (active.hasAttribute('data-box-add-variant')) keep = '[data-box-add-variant="' + active.getAttribute('data-box-add-variant') + '"]';
      else keep = '[data-box-action="commit"],[data-box-action="cart"]';
    }
    body.innerHTML = html;
    if (keep) {
      var again = body.querySelector(keep);
      (again && !again.disabled ? again : panel).focus();
    }
  }

  function render() {
    renderButtons();
    renderFab();
    renderCartPanel();
    renderDrawer();
  }

  /* ---------- drawer open/close ---------- */

  function open(key) {
    if (key && FORMATS[key]) ui.format = key;
    else if (!total(ui.format)) ui.format = ORDER.filter(function (k) { return total(k) > 0; })[0] || ui.format;
    // Opened without a product and nothing started yet: begin with the format choice.
    var started = ORDER.some(function (k) { return total(k) > 0 || state[k].inCart; });
    ui.step = !key && !started && ORDER.length > 1 ? 'format' : 'box';
    if (drawer.hidden) ui.lastFocus = document.activeElement;
    drawer.hidden = false;
    document.documentElement.classList.add('fcbox-open');
    renderDrawer();
    panel.focus();
    // Fill in any titles/images we do not have yet, then redraw.
    Promise.all(state[ui.format].items.map(function (i) { return ensureInfo(i.h).catch(function () {}); }))
      .then(renderDrawer);
  }

  function close() {
    drawer.hidden = true;
    document.documentElement.classList.remove('fcbox-open');
    ui.pending = null;
    ui.message = '';
    ui.error = '';
    if (ui.lastFocus && ui.lastFocus.focus) ui.lastFocus.focus();
  }

  /* ---------- adding ---------- */

  function addFromButton(btn) {
    var key = btn.getAttribute('data-box-format');
    if (!FORMATS[key]) return;
    rememberFromButton(btn);
    var handle = btn.getAttribute('data-box-handle');
    var variants = readVariants(btn);
    var chosen = Number(btn.getAttribute('data-box-variant')) || (variants.length === 1 ? variants[0].id : 0);
    ui.error = '';
    ui.message = '';
    ui.pending = null;

    if (total(key) >= capacity(key)) {
      ui.message = 'Your box is full. Remove something to swap this in.';
    } else if (!chosen) {
      ui.pending = { format: key, handle: handle, title: btn.getAttribute('data-box-title') || '', variants: variants };
    } else {
      var v = variants.filter(function (x) { return x.id === chosen; })[0];
      if (v && !v.available) ui.message = 'That option is sold out right now.';
      else if (addItem(key, handle, chosen, 1)) ui.message = (btn.getAttribute('data-box-title') || 'Coffee') + ' added to your box.';
    }
    save();
    open(key);
  }

  /* ---------- cart ---------- */

  function cartJson(path, payload) {
    return fetch(CFG.root + path, payload ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    } : { headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.description || data.message || 'Something went wrong. Please try again.');
        return data;
      });
    });
  }

  function boxLines(cart, key) {
    return cart.items.filter(function (i) { return i.properties && i.properties[LINE_PROP] === key; });
  }

  function removeLines(key) {
    return cartJson('cart.js').then(function (cart) {
      var lines = boxLines(cart, key);
      if (!lines.length) return;
      var updates = {};
      lines.forEach(function (l) { updates[l.key] = 0; });
      return cartJson('cart/update.js', { updates: updates });
    });
  }

  async function commit(key) {
    var fmt = FORMATS[key];
    var box = state[key];
    var count = total(key);

    if (!count) {
      await removeLines(key);
      state[key] = clean({})[key];
      return;
    }
    var size = sizeVariant(key, count);
    if (!size) throw new Error('This box size is not available. Try ' + unit(key, fmt.variants[0].bags) + ' or more.');
    if (!window.recharge || !window.recharge.bundle) throw new Error('Subscriptions are still loading. Please try again in a moment.');

    await Promise.all(box.items.map(function (i) { return ensureInfo(i.h); }));

    var rbId = await window.recharge.bundle.getBundleId({
      externalVariantId: size.id,
      externalProductId: fmt.bundleProductId,
      selections: box.items.map(function (i) {
        return { collectionId: fmt.collectionId, externalProductId: info[i.h].id, externalVariantId: i.v, quantity: i.q };
      }),
    });

    var contents = box.items.map(function (i) {
      var p = info[i.h];
      var vt = variantLabel(p.variants[i.v] && p.variants[i.v].title);
      return i.q + 'X ' + p.title + (vt ? ' (' + vt + ')' : '');
    }).join(', ');

    // _box_items ("handle:variant:qty|…") lets both carts show each coffee's own image.
    var props = { Contents: contents, _rb_id: rbId, _box_items: box.items.map(function (i) { return i.h + ':' + i.v + ':' + i.q; }).join('|') };
    props[LINE_PROP] = key;

    if (box.inCart) await removeLines(key);
    await cartJson('cart/add.js', { items: [{ id: size.id, quantity: 1, selling_plan: box.plan, properties: props }] });
    box.inCart = true;
    box.dirty = false;
  }

  // A box marked "in cart" whose line is gone was removed or checked out: start fresh.
  function reconcile() {
    var inCart = ORDER.filter(function (key) { return state[key].inCart; });
    if (!inCart.length) return;
    cartJson('cart.js').then(function (cart) {
      var changed = false;
      inCart.forEach(function (key) {
        if (!boxLines(cart, key).length) { state[key] = clean({})[key]; changed = true; }
      });
      if (changed) save();
    }).catch(function () {});
  }

  /* ---------- events ---------- */

  document.addEventListener('click', function (e) {
    // The Subscribe & Save page is retired: any link still pointing at it opens the box menu instead.
    var oldPage = e.target.closest('a[href*="/pages/subscribe-save"]');
    if (oldPage) { e.preventDefault(); open(''); return; }
    var t = e.target.closest('[data-box-add],[data-box-open],[data-box-fab],[data-box-close],[data-box-tab],[data-box-pick],[data-box-qty],[data-box-action],[data-box-format-pick],[data-box-add-variant]');
    if (!t) return;

    if (t.hasAttribute('data-box-add')) { e.preventDefault(); addFromButton(t); return; }
    if (t.hasAttribute('data-box-open')) {
      e.preventDefault();
      var openKey = t.getAttribute('data-box-open');
      // The mini cart only knows the line's bundle variant; map it back to its format.
      var lineVariant = Number(t.getAttribute('data-box-line-variant'));
      if (!openKey && lineVariant) {
        openKey = ORDER.filter(function (k) {
          return FORMATS[k].variants.some(function (v) { return v.id === lineVariant; });
        })[0] || '';
      }
      open(openKey);
      return;
    }
    if (t.hasAttribute('data-box-fab')) { open(); return; }
    if (t.hasAttribute('data-box-close')) { close(); return; }
    if (t.hasAttribute('data-box-tab')) { ui.format = t.getAttribute('data-box-tab'); ui.message = ''; ui.error = ''; open(ui.format); return; }

    if (t.hasAttribute('data-box-format-pick')) {
      ui.format = t.getAttribute('data-box-format-pick');
      ui.step = 'box';
      renderDrawer();
      panel.focus();
      return;
    }
    if (t.hasAttribute('data-box-add-variant')) {
      var pickHandle = t.getAttribute('data-handle');
      var picked = addItem(ui.format, pickHandle, Number(t.getAttribute('data-box-add-variant')), 1);
      ui.message = picked ? (info[pickHandle] ? info[pickHandle].title : 'Coffee') + ' added to your box.' : '';
      save();
      return;
    }

    var key = ui.format;
    if (t.hasAttribute('data-box-pick')) {
      var p = ui.pending;
      ui.pending = null;
      if (p && addItem(p.format, p.handle, Number(t.getAttribute('data-box-pick')), 1)) ui.message = p.title + ' added to your box.';
      save();
      return;
    }
    if (t.hasAttribute('data-box-qty')) {
      var id = Number(t.getAttribute('data-box-qty'));
      var line = state[key].items.filter(function (i) { return i.v === id; })[0];
      if (line) setQty(key, id, line.q + Number(t.getAttribute('data-delta')));
      ui.message = '';
      save();
      return;
    }
    var action = t.getAttribute('data-box-action');
    if (action === 'cart') { window.location.href = CFG.cartUrl; return; }
    if (action === 'formats') { ui.step = 'format'; ui.message = ''; renderDrawer(); panel.focus(); return; }
    if (action === 'clear') {
      state[key].items = [];
      touch(key);
      ui.message = '';
      save();
      return;
    }
    if (action === 'commit') {
      ui.busy = true;
      ui.error = '';
      renderDrawer();
      commit(key).then(function () {
        ui.busy = false;
        save();
        window.location.href = CFG.cartUrl;
      }).catch(function (err) {
        ui.busy = false;
        ui.error = err && err.message ? err.message : 'Something went wrong. Please try again.';
        renderDrawer();
      });
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.name !== 'fcbox_plan') return;
    state[ui.format].plan = Number(e.target.value);
    touch(ui.format);
    save();
  });

  document.addEventListener('keydown', function (e) {
    if (drawer.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var f = panel.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]');
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  window.FCBox = {
    open: open,
    get: function () { return JSON.parse(JSON.stringify(state)); },
    add: function (key, handle, variantId, qty) {
      if (!FORMATS[key]) return false;
      var ok = addItem(key, handle, Number(variantId), qty || 1);
      save();
      return ok;
    },
  };

  // Coming back with the browser's Back button restores the old page as-is; refresh it from the cookie.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    ui.busy = false;
    state = clean(readCookie());
    render();
    reconcile();
  });

  /* ---------- mini cart: one image per coffee in a box line ---------- */

  // The slide-out template can't see underscore properties, so read _box_items from /cart.js
  // and rebuild each box line's list (tagged with data-box-line = line key in navbar.liquid,
  // and in cart.liquid when the line has no _box_items for Liquid to use).
  var decorating = false;
  function decorateMiniCart() {
    var lists = document.querySelectorAll('.fcbox-line__items[data-box-line]:not([data-box-done])');
    if (!lists.length || decorating) return;
    decorating = true;
    cartJson('cart.js').then(function (cart) {
      return Promise.all([].map.call(lists, function (ul) {
        ul.setAttribute('data-box-done', '');
        var line = cart.items.filter(function (i) { return i.key === ul.getAttribute('data-box-line'); })[0];
        var props = (line && line.properties) || {};
        var parts = props._box_items
          ? props._box_items.split('|').map(function (s) { var a = s.split(':'); return { h: a[0], v: Number(a[1]), q: Number(a[2]) }; })
          // Lines added before _box_items existed: fall back to the box saved in the cookie.
          : (state[props._box_format] && state[props._box_format].inCart ? state[props._box_format].items : []);
        if (!parts.length) return null;
        return Promise.all(parts.map(function (p) { return ensureInfo(p.h).catch(function () { return null; }); })).then(function () {
          ul.innerHTML = parts.map(function (p) {
            var pi = info[p.h];
            if (!pi) return '';
            var vt = variantLabel(pi.variants[p.v] && pi.variants[p.v].title);
            var img = pi.image ? pi.image + (pi.image.indexOf('?') > -1 ? '&' : '?') + 'width=120' : '';
            return '<li>' + (img ? '<img class="fcbox-line__img" src="' + esc(img) + '" alt="" width="44" height="44" loading="lazy">' : '') +
              '<span>' + p.q + 'X ' + esc(pi.title) + (vt ? ' (' + esc(vt) + ')' : '') + '</span></li>';
          }).join('');
        });
      }));
    }).catch(function () {}).then(function () { decorating = false; decorateMiniCart(); });
  }
  // Mini cart strikethrough: cart data has no compare-at price, so read it from the product.
  var compareCache = {};
  function decorateComparePrices() {
    [].forEach.call(document.querySelectorAll('[data-compare-variant]:not([data-compare-done])'), function (el) {
      el.setAttribute('data-compare-done', '');
      var qty = Number(el.getAttribute('data-compare-qty')) || 1;
      var vid = Number(el.getAttribute('data-compare-variant'));
      function show(compare, price) {
        if (!(compare > price)) return;
        el.textContent = money(compare * qty);
        el.hidden = false;
      }
      // Box bundle variants are already in the config (the bundle product has no public .js).
      var boxV = ORDER.map(function (k) { return FORMATS[k].variants.filter(function (v) { return v.id === vid; })[0]; }).filter(Boolean)[0];
      if (boxV) { show(boxV.compareAt, boxV.price); return; }
      var handle = el.getAttribute('data-compare-handle');
      if (!handle) return;
      compareCache[handle] = compareCache[handle] || fetch(CFG.root + 'products/' + encodeURIComponent(handle) + '.js')
        .then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; });
      compareCache[handle].then(function (p) {
        var v = p && p.variants.filter(function (x) { return x.id === vid; })[0];
        if (v) show(v.compare_at_price, v.price);
      });
    });
  }
  new MutationObserver(function () { decorateMiniCart(); decorateComparePrices(); }).observe(document.body, { childList: true, subtree: true });

  render();
  reconcile();
  decorateMiniCart();
  decorateComparePrices();
})();
