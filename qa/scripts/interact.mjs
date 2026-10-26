// Interaction checks with real mouse input. usage: node interact.mjs <themeId> <label>
import { spawn } from 'node:child_process';
const [themeId, label] = process.argv.slice(2);
const BASE = 'https://first-cup-coffee-co.myshopify.com';
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TMPDIR}interact-${label}-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const viewport = async (w, h, mobile) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
const go = async path => { await send('Page.navigate', { url: `${BASE}${path}?preview_theme_id=${themeId}&pb=0` }); await sleep(7000); };
// Click the first visible element matching the selector with a real mouse event.
const click = async sel => {
  const box = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) return false;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(1500); return true;
};
const visible = sel => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const c = getComputedStyle(el), r = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; })()`);
const results = {};

await viewport(1420, 900, false);
await go('/');
results['search opens'] = (await click('.nav_utility-wrapper a[data-w-id]')) && await visible('.search-container .search-field');
await go('/');
results['cart drawer opens'] = (await click('.cart-button')) && await visible('.w-commerce-commercecartcontainerwrapper');
await go('/');
results['nav links count'] = await evaluate(`document.querySelectorAll('.nav_link-component a').length`);

await go('/products/the-carver');
const before = await evaluate(`fetch('/cart.js').then(r => r.json()).then(c => c.item_count)`);
const addSel = 'form.w-commerce-commerceaddtocartform [type=submit], .add-to-cart-button, button[name=add], [data-node-type=commerce-add-to-cart-button]';
const clicked = await click(addSel);
await sleep(3000);
const after = await evaluate(`fetch('/cart.js').then(r => r.json()).then(c => c.item_count)`);
results['add to cart (The Carver)'] = clicked ? `${before} -> ${after}` : 'no add-to-cart button found';

await go('/products/trigger');
results['trigger buy box present'] = await evaluate(`!!document.querySelector('.fbb')`);
{ const b = await evaluate(`fetch('/cart.js').then(r => r.json()).then(c => c.item_count)`);
  const ok = await click('[data-fbb-add]'); await sleep(3000);
  const a = await evaluate(`fetch('/cart.js').then(r => r.json()).then(c => c.item_count)`);
  results['add to cart (Trigger Fuel)'] = ok ? `${b} -> ${a}` : 'no button'; }

await go('/pages/prayer-wall');
results['prayer wall cards'] = await evaluate(`document.querySelectorAll('.pw__card').length`);
results['prayer wall "Request Prayer" opens form'] = (await click('[data-pw-scroll="form"]')) && await visible('#pw-form-panel');

await viewport(390, 844, true);
await go('/');
results['mobile menu opens'] = (await click('.menu-button')) && await visible('.nav_link-component');

console.log(label.padEnd(5), JSON.stringify(results));
ws.close(); chrome.kill();
