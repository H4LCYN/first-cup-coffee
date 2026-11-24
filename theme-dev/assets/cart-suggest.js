/* Cart suggestions carousel. The products picked in Theme settings > Cart
   Suggestions are rendered by snippets/fc-cart-suggest.liquid; this script hides
   any that are in the cart, adds complementary products (Search & Discovery) for
   cart items in front, caps the list at the max setting, runs the arrows and
   handles "Add to Cart". */
(function () {
  if (window.__fcSuggest) return;
  window.__fcSuggest = true;

  function getJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function money(cents) { return '$' + (cents / 100).toFixed(2); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function sized(url, w) { if (!url) return ''; return url + (url.indexOf('?') > -1 ? '&' : '?') + 'width=' + w; }

  function itemHtml(p) {
    var v = p.variants.filter(function (x) { return x.available; })[0] || p.variants[0];
    var img = p.featured_image ? '<img class="fc-suggest__img" src="' + esc(sized(p.featured_image, 460)) + '" alt="' + esc(p.title) + '" width="230" height="230" loading="lazy" decoding="async">' : '';
    return '<div class="fc-suggest__item" role="listitem" data-product-id="' + p.id + '" data-fc-suggest-extra>' +
      '<a href="' + esc(p.url) + '" class="fc-suggest__card"><div class="fc-suggest__media">' + img + '</div>' +
      '<div class="fc-suggest__info"><span class="fc-suggest__name">' + esc(p.title) + '</span>' +
      '<span class="fc-suggest__price">' + money(v.price) + '</span></div></a>' +
      '<button type="button" class="fc-suggest__add" data-fc-suggest-add="' + v.id + '">Add to Cart</button></div>';
  }

  function load() {
    var roots = document.querySelectorAll('[data-fc-suggest]');
    if (!roots.length) return;
    getJson('/cart.js').then(function (cart) {
      if (!cart) return;
      var inCart = {}, ids = [];
      (cart.items || []).forEach(function (i) {
        inCart[i.product_id] = true;
        if (ids.indexOf(i.product_id) < 0) ids.push(i.product_id);
      });
      var wantComp = roots[0].getAttribute('data-complementary') === 'true' && ids.length;
      var compReq = wantComp ? Promise.all(ids.slice(0, 4).map(function (id) {
        return getJson('/recommendations/products.json?product_id=' + id + '&intent=complementary&limit=4');
      })) : Promise.resolve([]);
      return compReq.then(function (lists) {
        var extras = [], seen = {};
        lists.forEach(function (l) {
          ((l && l.products) || []).forEach(function (p) {
            if (inCart[p.id] || seen[p.id] || !p.available) return;
            seen[p.id] = true;
            extras.push(p);
          });
        });
        roots.forEach(function (r) { render(r, cart, inCart, extras); });
      });
    });
  }

  function render(root, cart, inCart, extras) {
    var list = root.querySelector('[data-fc-suggest-list]');
    var max = parseInt(root.getAttribute('data-max'), 10) || 4;
    list.querySelectorAll('[data-fc-suggest-extra]').forEach(function (n) { n.remove(); });
    var present = {};
    list.querySelectorAll('[data-product-id]').forEach(function (n) { present[n.getAttribute('data-product-id')] = true; });
    list.insertAdjacentHTML('afterbegin', extras.filter(function (p) { return !present[p.id]; }).map(itemHtml).join(''));
    var shown = 0;
    list.querySelectorAll('.fc-suggest__item').forEach(function (n) {
      var hide = inCart[n.getAttribute('data-product-id')] || shown >= max;
      n.hidden = !!hide;
      if (!hide) shown++;
    });
    root.hidden = !(cart.items && cart.items.length) || shown === 0;
    list.scrollLeft = 0;
    updateArrows(root);
  }

  function updateArrows(root) {
    var list = root.querySelector('[data-fc-suggest-list]');
    var nav = root.querySelector('.fc-suggest__nav');
    if (!list || !nav) return;
    var overflow = list.scrollWidth > list.clientWidth + 2;
    nav.hidden = !overflow;
    root.querySelector('[data-fc-suggest-prev]').disabled = list.scrollLeft <= 2;
    root.querySelector('[data-fc-suggest-next]').disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
  }

  function step(root, dir) {
    var list = root.querySelector('[data-fc-suggest-list]');
    var item = list.querySelector('.fc-suggest__item:not([hidden])');
    var w = item ? item.getBoundingClientRect().width + parseFloat(getComputedStyle(list).columnGap || 0) : list.clientWidth;
    list.scrollBy({ left: dir * w, behavior: 'smooth' });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var arrow = t.closest('[data-fc-suggest-prev],[data-fc-suggest-next]');
    if (arrow) {
      e.preventDefault();
      step(arrow.closest('[data-fc-suggest]'), arrow.hasAttribute('data-fc-suggest-next') ? 1 : -1);
      return;
    }
    var btn = t.closest('[data-fc-suggest-add]');
    if (btn) {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Adding…';
      var inMini = !!btn.closest('.fc-suggest--mini');
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(btn.getAttribute('data-fc-suggest-add')), quantity: 1 }] })
      }).then(function (r) {
        if (!r.ok) throw new Error('add failed');
        try { if (inMini) sessionStorage.setItem('fcOpenCart', '1'); } catch (err) {}
        location.reload();
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Add to Cart';
      });
      return;
    }
    if (t.closest('.w-commerce-commercecartopenlink')) {
      load();
      setTimeout(function () { document.querySelectorAll('[data-fc-suggest]').forEach(updateArrows); }, 400);
    }
  });

  document.addEventListener('scroll', function (e) {
    var list = e.target;
    if (list && list.matches && list.matches('[data-fc-suggest-list]')) updateArrows(list.closest('[data-fc-suggest]'));
  }, true);
  window.addEventListener('resize', function () { document.querySelectorAll('[data-fc-suggest]').forEach(updateArrows); });

  function reopenCart() {
    var flag = null;
    try { flag = sessionStorage.getItem('fcOpenCart'); sessionStorage.removeItem('fcOpenCart'); } catch (err) {}
    if (!flag) return;
    var link = document.querySelector('.w-commerce-commercecartopenlink');
    if (link) setTimeout(function () { link.click(); }, 300);
  }

  document.addEventListener('fcbox:change', load);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { load(); reopenCart(); });
  } else { load(); reopenCart(); }
})();
