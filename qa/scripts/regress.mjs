// Storefront regression run: loads each page on a theme at desktop + mobile width and records
// HTTP status, JS errors, failed requests, broken images, horizontal overflow and header presence.
// usage: node regress.mjs <themeId> <label> <out.json>
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [themeId, label, out] = process.argv.slice(2);
const BASE = 'https://first-cup-coffee-co.myshopify.com';
const PAGES = [
  '/', '/collections/coffee', '/collections/all', '/collections/merch', '/collections/5lb-bags', '/collections/best-sellers',
  '/products/trigger', '/products/trigger-fuel-5-lb-bag', '/products/trigger-fuel-pods-24-count',
  '/products/the-carver', '/products/the-carver-pods', '/products/the-carver-5-lb-bag', '/products/medium-roast-bundle', '/products/test-product',
  '/pages/subscribe-save', '/pages/locations', '/pages/rosenberg-location', '/pages/woodlands-location', '/pages/pearland-location',
  '/pages/prayer-wall', '/pages/contact', '/pages/follow', '/pages/room-rentals', '/pages/faq',
  '/blogs/news', '/cart', '/search?q=coffee', '/this-page-does-not-exist',
];
if (process.env.ONLY) PAGES.splice(0, PAGES.length, ...process.env.ONLY.split(','));
const VIEWPORTS = [{ name: 'desktop', width: 1420, height: 900, mobile: false }, { name: 'mobile', width: 390, height: 844, mobile: true }];
// Third-party noise that isn't caused by the theme.
const IGNORE = /google-analytics|googletagmanager|doubleclick|facebook|clarity\.ms|tiktok|pinterest|hotjar|monorail|shop\.app|\/api\/collect|web-pixels|sentry|klaviyo.*\/onsite|chrome-extension/i;

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TMPDIR}regress-${label}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {}; const listeners = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result || { error: m.error }); delete pending[m.id]; } else if (m.method) listeners.forEach(f => f(m)); };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
for (const d of ['Network', 'Page', 'Runtime', 'Log']) await send(`${d}.enable`);
await send('Network.setCacheDisabled', { cacheDisabled: true });

const results = [];
for (const vp of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
  for (const path of PAGES) {
    const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}preview_theme_id=${themeId}&pb=0`;
    const r = { theme: label, viewport: vp.name, path, status: null, jsErrors: [], failed: [], brokenImages: [], overflow: 0, checks: {} };
    const reqUrls = {};
    let loaded = false;
    const onEvent = m => {
      const p = m.params;
      if (m.method === 'Network.requestWillBeSent') reqUrls[p.requestId] = p.request.url;
      if (m.method === 'Network.responseReceived') {
        if (p.type === 'Document' && r.status === null) r.status = p.response.status;
        else if (p.response.status >= 400 && !IGNORE.test(p.response.url)) r.failed.push(`${p.response.status} ${p.response.url}`);
      }
      if (m.method === 'Network.loadingFailed' && !p.canceled && p.blockedReason == null && !IGNORE.test(reqUrls[p.requestId] || '')) r.failed.push(`${p.errorText} ${reqUrls[p.requestId]}`);
      if (m.method === 'Runtime.exceptionThrown') { const d = p.exceptionDetails; const msg = (d.exception?.description || d.text || '').split('\n')[0]; if (!IGNORE.test(d.url || '') && !IGNORE.test(msg)) r.jsErrors.push(msg); }
      if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') { const msg = p.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0]; if (!IGNORE.test(msg)) r.jsErrors.push('console: ' + msg); }
      if (m.method === 'Page.loadEventFired') loaded = true;
    };
    listeners.push(onEvent);
    await send('Page.navigate', { url });
    for (let i = 0; i < 80 && !loaded; i++) await sleep(250);
    // Scroll through the page so lazy images load, then settle.
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)' }); await sleep(1500);
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' }); await sleep(800);
    const probe = await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc && i.loading !== 'lazy').map(i => i.currentSrc.split('?')[0]),
      navbar: !!document.querySelector('.navbar .nav_wrapper'),
      topStrip: !!document.querySelector('.top-ad'),
      signIn: !!document.querySelector('.top-ad_account'),
      footer: !!document.querySelector('footer, .footer, [class*="footer"]'),
      title: document.title,
      h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 60),
      jq: [...document.scripts].filter(s => s.src.includes('jquery')).length,
    })` });
    listeners.splice(listeners.indexOf(onEvent), 1);
    const v = JSON.parse(probe.result?.value || '{}');
    r.overflow = v.overflow; r.brokenImages = v.broken || [];
    r.checks = { navbar: v.navbar, topStrip: v.topStrip, signIn: v.signIn, footer: v.footer, jqueryTags: v.jq, title: v.title, h1: v.h1 };
    r.jsErrors = [...new Set(r.jsErrors)]; r.failed = [...new Set(r.failed)];
    results.push(r);
    process.stderr.write(`${label} ${vp.name} ${r.status} ${path} js:${r.jsErrors.length} net:${r.failed.length} img:${r.brokenImages.length} ovf:${r.overflow}\n`);
  }
}
fs.writeFileSync(out, JSON.stringify(results, null, 1));
ws.close(); chrome.kill();
