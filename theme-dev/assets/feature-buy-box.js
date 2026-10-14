/*
 * Buy box for the partner/feature product page (sections/main-product-feature.liquid).
 *
 * Everything product-specific arrives as JSON from snippets/feature-buy-box.liquid,
 * so this file has no hardcoded IDs. Two ways to buy, matching the rest of the store:
 *   - Single purchase: plain /cart/add.js for the chosen variant and quantity.
 *   - Subscribe & Save: a Recharge Bundle. The bag-count variants and delivery
 *     plans belong to the bundle product (not the coffee), and the coffee is
 *     attached as the bundle's selection.
 */
(function () {
  function init(root) {
    var cfgEl = root.querySelector('[data-fbb-config]');
    if (!cfgEl) return;
    var cfg = JSON.parse(cfgEl.textContent);

    var form = root.querySelector('[data-fbb-form]');
    var addBtn = root.querySelector('[data-fbb-add]');
    var addLabel = addBtn.querySelector('[data-fbb-add-label]');
    var errorEl = root.querySelector('[data-fbb-error]');
    var idleLabel = cfg.addLabel;

    function checked(name) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : null;
    }

    function mode() {
      return checked('purchase_type') || 'single';
    }

    function selectedVariant() {
      var chosen = cfg.options.map(function (_, i) { return checked('option_' + i); });
      return cfg.variants.filter(function (v) {
        return v.options.every(function (o, i) { return o === chosen[i]; });
      })[0] || null;
    }

    function showError(msg) {
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    }

    function sync() {
      var subscribing = mode() === 'subscribe';
      root.classList.toggle('is-subscribe', subscribing);
      root.querySelectorAll('[data-fbb-subscribe-only]').forEach(function (el) { el.hidden = !subscribing; });

      var variant = selectedVariant();
      var soldOut = !variant || !variant.available;
      addBtn.disabled = soldOut;
      addLabel.textContent = soldOut ? cfg.soldOutLabel : idleLabel;
      showError('');
    }

    form.addEventListener('change', sync);
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    function setBusy(busy) {
      addBtn.disabled = busy;
      addBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      addLabel.textContent = busy ? cfg.addingLabel : idleLabel;
    }

    function postCart(item) {
      return fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item] }),
      }).then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.description || body.message || cfg.errorLabel);
          });
        }
        return res.json();
      });
    }

    async function addSingle(variant, bags) {
      await postCart({ id: variant.id, quantity: bags });
    }

    async function addSubscription(variant, bags) {
      var bundle = cfg.bundle;
      if (!bundle || !window.recharge || !window.recharge.bundle) {
        throw new Error(cfg.errorLabel);
      }
      var bagVariant = bundle.variants.filter(function (v) { return v.bags === bags; })[0];
      var planId = checked('selling_plan');
      if (!bagVariant || !planId) throw new Error(cfg.errorLabel);

      var rbId = await window.recharge.bundle.getBundleId({
        externalVariantId: bagVariant.id,
        externalProductId: bundle.productId,
        selections: [{
          collectionId: bundle.collectionId,
          externalProductId: cfg.productId,
          externalVariantId: variant.id,
          quantity: bags,
        }],
      });

      await postCart({
        id: bagVariant.id,
        quantity: 1,
        selling_plan: planId,
        properties: { Contents: bags + 'X ' + cfg.productTitle, _rb_id: rbId },
      });
    }

    addBtn.addEventListener('click', async function () {
      var variant = selectedVariant();
      if (!variant || !variant.available) return;
      var bags = parseInt(checked('bags'), 10) || 1;
      showError('');
      setBusy(true);
      try {
        if (mode() === 'subscribe') await addSubscription(variant, bags);
        else await addSingle(variant, bags);
        window.location.href = window.Shopify.routes.root + 'cart';
      } catch (err) {
        showError(err && err.message ? err.message : cfg.errorLabel);
        setBusy(false);
        sync();
      }
    });

    // Make sure every group has a selection, even if the settings pointed at a value that doesn't exist.
    ['selling_plan', 'bags'].forEach(function (name) {
      var inputs = form.querySelectorAll('input[name="' + name + '"]');
      if (inputs.length && !form.querySelector('input[name="' + name + '"]:checked')) inputs[0].checked = true;
    });

    sync();
  }

  document.querySelectorAll('[data-fbb]').forEach(init);
})();
