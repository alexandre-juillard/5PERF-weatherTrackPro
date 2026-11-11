// Summarizes a V8 .cpuprofile (self time by package / function) and renders an SVG flamegraph.
// Usage: node bench/profile-report.mjs <file.cpuprofile> [--svg out.svg] [--title "..."] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { svg: { type: 'string' }, title: { type: 'string', default: '' }, json: { type: 'string' } },
});
const profile = JSON.parse(readFileSync(positionals[0], 'utf8'));

const byId = new Map(profile.nodes.map((n) => [n.id, { ...n, self: 0 }]));
for (let i = 0; i < profile.samples.length; i++) {
  byId.get(profile.samples[i]).self += profile.timeDeltas[i] ?? 0;
}

function category(frame) {
  const { url, functionName } = frame;
  if (functionName === '(idle)') return 'idle';
  if (functionName === '(garbage collector)') return 'GC';
  if (functionName === '(program)') return 'V8 / native';
  if (!url) return 'V8 / native';
  const m = url.match(/node_modules[\\/]((@[^\\/]+[\\/])?[^\\/]+)/);
  if (m) return m[1].replace('\\', '/');
  if (url.startsWith('node:')) return 'node core';
  if (/[\\/]src[\\/]/.test(url)) return 'app code (src/)';
  return 'other';
}

const total = profile.timeDeltas.reduce((a, b) => a + b, 0);
const nodes = [...byId.values()];
const busy = nodes.filter((n) => n.callFrame.functionName !== '(idle)').reduce((a, n) => a + n.self, 0);

const catTotals = {};
const fnTotals = {};
for (const n of nodes) {
  const cat = category(n.callFrame);
  catTotals[cat] = (catTotals[cat] ?? 0) + n.self;
  if (cat === 'idle') continue;
  const file = (n.callFrame.url || '').split(/[\\/]/).slice(-2).join('/');
  const key = `${n.callFrame.functionName || '(anonymous)'} ${file}:${n.callFrame.lineNumber + 1} [${cat}]`;
  fnTotals[key] = (fnTotals[key] ?? 0) + n.self;
}
const pct = (v, of) => Math.round((v / of) * 1000) / 10;

const summary = {
  durationMs: Math.round(total / 1000),
  busyPercent: pct(busy, total),
  byCategory: Object.entries(catTotals)
    .filter(([c]) => c !== 'idle')
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => ({ category: c, percentOfBusy: pct(v, busy) })),
  topFunctions: Object.entries(fnTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([f, v]) => ({ fn: f, percentOfBusy: pct(v, busy) })),
};

console.log(`Profile ${positionals[0]}: ${summary.durationMs} ms, CPU busy ${summary.busyPercent}%`);
console.log('\nSelf time by category (% of busy time)');
for (const c of summary.byCategory) console.log(`  ${String(c.percentOfBusy).padStart(5)}%  ${c.category}`);
console.log('\nTop functions (self time, % of busy time)');
for (const f of summary.topFunctions) console.log(`  ${String(f.percentOfBusy).padStart(5)}%  ${f.fn}`);
if (opts.json) writeFileSync(opts.json, JSON.stringify(summary, null, 2));

if (opts.svg) {
  // Merge identical frames under the same parent, compute inclusive time
  const root = { name: 'all', cat: 'root', value: 0, children: new Map() };
  function walk(node, target) {
    const f = node.callFrame;
    if (f.functionName === '(idle)') return 0;
    const cat = category(f);
    const name = `${f.functionName || '(anonymous)'}${cat.startsWith('app') ? ' (src)' : ''}`;
    const key = `${name}|${cat}`;
    let child = target.children.get(key);
    if (!child) target.children.set(key, (child = { name, cat, value: 0, children: new Map() }));
    let sum = node.self;
    for (const id of node.children ?? []) sum += walk(byId.get(id), child);
    child.value += sum;
    return sum;
  }
  const r = byId.get(profile.nodes[0].id);
  for (const id of r.children ?? []) root.value += walk(byId.get(id), root);

  const palette = {
    'app code (src/)': '#e4572e', dayjs: '#f3a712', zod: '#a8c686', pg: '#669bbc', 'pg-protocol': '#4f86b0',
    express: '#c4a1d6', 'node core': '#bbbbbb', GC: '#7d7d7d', 'V8 / native': '#d9d9d9', winston: '#9bc1bc',
    morgan: '#9bc1bc', 'body-parser': '#c4a1d6', 'ioredis': '#d1495b', pino: '#9bc1bc',
  };
  const W = 1400, H = 17, top = 50;
  const rects = [];
  let maxDepth = 0;
  function layout(node, x, depth) {
    const w = (node.value / root.value) * W;
    if (w < 0.4) return;
    maxDepth = Math.max(maxDepth, depth);
    rects.push({ x, y: top + depth * H, w, node });
    let cx = x;
    for (const c of [...node.children.values()].sort((a, b) => b.value - a.value)) {
      layout(c, cx, depth + 1);
      cx += (c.value / root.value) * W;
    }
  }
  layout(root, 0, 0);
  const esc = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const legend = summary.byCategory.slice(0, 8)
    .map((c, i) => `<rect x="${10 + i * 170}" y="22" width="12" height="12" fill="${palette[c.category] ?? '#ece2d0'}"/><text x="${26 + i * 170}" y="32">${esc(c.category)} ${c.percentOfBusy}%</text>`)
    .join('');
  const body = rects
    .map(({ x, y, w, node }) => {
      const label = w > 40 ? esc(node.name).slice(0, Math.floor(w / 6.5)) : '';
      return `<g><title>${esc(node.name)} [${esc(node.cat)}] ${pct(node.value, root.value)}%</title><rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${H - 1}" fill="${palette[node.cat] ?? '#ece2d0'}" stroke="#fff" stroke-width="0.3"/><text x="${(x + 3).toFixed(1)}" y="${y + 12}">${label}</text></g>`;
    })
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${top + (maxDepth + 2) * H}" font-family="monospace" font-size="11">
<rect width="100%" height="100%" fill="#fff"/><text x="10" y="15" font-size="13" font-weight="bold">${esc(opts.title)} (icicle: root at top, width = inclusive CPU time, idle excluded)</text>${legend}
${body}
</svg>`;
  writeFileSync(opts.svg, svg);
  console.log(`\nSVG flamegraph written to ${opts.svg}`);
}
