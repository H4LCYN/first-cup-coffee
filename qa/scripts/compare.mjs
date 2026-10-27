// Compares two regress.mjs result files and prints a markdown summary of what dev does worse than live.
// usage: node compare.mjs <dev.json> <live.json>
import fs from 'node:fs';

const [devFile, liveFile] = process.argv.slice(2);
const dev = JSON.parse(fs.readFileSync(devFile, 'utf8'));
const live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
// Asset URLs differ per theme (/cdn/shop/t/<n>/, ?v=<timestamp>), so strip those before comparing.
const norm = s => s.replace(/\/t\/\d+\//g, '/t/N/').replace(/[?&](v|preview_theme_id|pb)=[^&\s]*/g, '').replace(/\d{10,}/g, 'N');
const key = r => `${r.viewport} ${r.path}`;
const liveBy = Object.fromEntries(live.map(r => [key(r), r]));

const sum = (rs, f) => rs.reduce((n, r) => n + f(r), 0);
const rows = [];
let newIssues = 0;
for (const d of dev) {
  const l = liveBy[key(d)] || { status: null, jsErrors: [], failed: [], brokenImages: [], overflow: 0, checks: {} };
  const issues = [];
  if (d.status !== l.status) issues.push(`status ${d.status} (live ${l.status})`);
  const fresh = (a, b) => a.filter(x => !new Set(b.map(norm)).has(norm(x)));
  for (const e of fresh(d.jsErrors, l.jsErrors)) issues.push(`JS: ${e}`);
  for (const e of fresh(d.failed, l.failed)) issues.push(`request: ${e}`);
  for (const e of fresh(d.brokenImages, l.brokenImages)) issues.push(`broken image: ${e}`);
  if (d.overflow > 0 && !(l.overflow > 0)) issues.push(`horizontal overflow ${d.overflow}px`);
  for (const c of ['navbar', 'topStrip', 'signIn', 'footer']) if (l.checks[c] && !d.checks[c]) issues.push(`missing ${c}`);
  if (d.checks.jqueryTags > 1) issues.push(`jQuery loaded ${d.checks.jqueryTags}×`);
  newIssues += issues.length;
  rows.push(`| \`${d.path}\` | ${d.viewport} | ${d.status} | ${d.jsErrors.length} / ${l.jsErrors.length} | ${issues.length ? issues.join('<br>') : 'None'} |`);
}

console.log(`**${newIssues ? `${newIssues} new issue(s) on dev` : 'No new issues on dev'}** across ${dev.length} page loads.\n`);
console.log('| Check | Dev | Live |\n|---|---|---|');
console.log(`| Page loads | ${dev.length} | ${live.length} |`);
console.log(`| JS errors, all loads | ${sum(dev, r => r.jsErrors.length)} | ${sum(live, r => r.jsErrors.length)} |`);
console.log(`| Failed requests | ${sum(dev, r => r.failed.length)} | ${sum(live, r => r.failed.length)} |`);
console.log(`| Broken images | ${sum(dev, r => r.brokenImages.length)} | ${sum(live, r => r.brokenImages.length)} |`);
console.log(`| Pages with horizontal overflow | ${dev.filter(r => r.overflow > 0).length} | ${live.filter(r => r.overflow > 0).length} |\n`);
console.log('| Page | Viewport | Status | JS errors (dev / live) | New on dev |\n|---|---|---|---|---|');
console.log(rows.join('\n'));
process.exitCode = newIssues ? 1 : 0;
