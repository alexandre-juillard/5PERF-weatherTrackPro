// Builds the before/after tables (Markdown) and SVG charts from bench/results/<version>-<dataset>.json
// Usage: node bench/report.mjs  -> docs/assets/results-tables.md + docs/assets/chart-*.svg
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const versions = [
  ['v0', 'v0 original'],
  ['v1', 'v1 SQL'],
  ['v2', 'v2 schéma'],
  ['v3', 'v3 cache'],
  ['v4', 'v4 runtime (1 proc.)'],
  ['v4c', 'v4 cluster (4 proc.)'],
];
const scenarios = [
  ['avg-full', 'Moyenne, historique complet (30 ans)'],
  ['avg-1y', 'Moyenne, 1 an'],
  ['data-1y', 'Données brutes, 1 an'],
  ['data-full', 'Export historique complet'],
  ['hot', 'Requêtes populaires (mix)'],
];
const datasets = ['S', 'L'];

const load = (v, d) => {
  const f = new URL(`./results/${v}-${d}.json`, import.meta.url);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const results = Object.fromEntries(datasets.map((d) => [d, Object.fromEntries(versions.map(([v]) => [v, load(v, d)]))]));
const fmt = (n, digits = 0) => (n === undefined || n === null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: digits }));
const ratio = (a, b) => (a && b ? `×${fmt(a / b, a / b >= 10 ? 0 : 1)}` : '—');

let md = '';
for (const d of datasets) {
  md += `\n### Jeu de données ${d === 'S' ? 'S (≈1,1 M lignes, 100 villes)' : 'L (≈11 M lignes, 1 000 villes)'}\n`;
  for (const [s, title] of scenarios) {
    md += `\n#### ${title} (\`${s}\`)\n\n`;
    md += '| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |\n';
    md += '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
    const base = results[d].v0?.scenarios[s]?.load.rps;
    for (const [v, label] of versions) {
      const r = results[d][v]?.scenarios[s];
      if (!r) continue;
      const l = r.load;
      md += `| ${label} | ${fmt(l.rps, 1)} | ${v === 'v0' ? '—' : ratio(l.rps, base)} | ${fmt(l.latencyMs.p50)} ms | ${fmt(l.latencyMs.p99)} ms | ${fmt(r.single.latencyMs.p50)} ms | ${l.errors + l.non2xx} | ${fmt(l.server?.eventLoopDelayP99Ms, 1)} ms | ${fmt(l.server?.cpuPercent)} % | ${fmt(l.server?.peakRssMb)} Mo |\n`;
    }
  }
}
writeFileSync(new URL('../docs/assets/results-tables.md', import.meta.url), md);

// Summary table: v0 vs final, both datasets
let summary = '| Scénario | Jeu | v0 req/s | v4 cluster req/s | Gain débit | v0 p99 | v4 cluster p99 | v0 latence unitaire | v4 latence unitaire |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
for (const [s, title] of scenarios) {
  for (const d of datasets) {
    const a = results[d].v0?.scenarios[s];
    const b = results[d].v4c?.scenarios[s];
    if (!a || !b) continue;
    summary += `| ${title} | ${d} | ${fmt(a.load.rps, 1)} | ${fmt(b.load.rps, 0)} | **${ratio(b.load.rps, a.load.rps)}** | ${fmt(a.load.latencyMs.p99)} ms | ${fmt(b.load.latencyMs.p99)} ms | ${fmt(a.single.latencyMs.p50)} ms | ${fmt(b.single.latencyMs.p50)} ms |\n`;
  }
}
writeFileSync(new URL('../docs/assets/results-summary.md', import.meta.url), summary);

// SVG grouped bar chart (log scale) of a metric per scenario and version
function chart(dataset, metric, title, unit, file, pick) {
  const W = 1000, H = 440, left = 70, bottom = 90, top = 70, right = 20;
  const colors = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad'];
  const values = scenarios.map(([s]) => versions.map(([v]) => pick(results[dataset][v]?.scenarios[s])));
  const all = values.flat().filter((x) => x > 0);
  const min = 10 ** Math.floor(Math.log10(Math.min(...all)));
  const max = 10 ** Math.ceil(Math.log10(Math.max(...all)));
  const y = (val) => top + (H - top - bottom) * (1 - (Math.log10(val) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)));
  const groupW = (W - left - right) / scenarios.length;
  const barW = (groupW - 20) / versions.length;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial" font-size="12"><rect width="100%" height="100%" fill="#fff"/>`;
  svg += `<text x="${W / 2}" y="22" text-anchor="middle" font-size="15" font-weight="bold">${title} — jeu ${dataset} (échelle log)</text>`;
  for (let p = Math.log10(min); p <= Math.log10(max); p++) {
    const v = 10 ** p;
    svg += `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="#ddd"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)} ${unit}</text>`;
  }
  scenarios.forEach(([s], i) => {
    const gx = left + i * groupW + 10;
    versions.forEach(([v], j) => {
      const val = values[i][j];
      if (!(val > 0)) return;
      const yy = y(val);
      svg += `<rect x="${gx + j * barW}" y="${yy}" width="${barW - 2}" height="${H - bottom - yy}" fill="${colors[j]}"><title>${v} ${s}: ${fmt(val, 1)} ${unit}</title></rect>`;
      const lx = gx + j * barW + barW / 2;
      svg += `<text x="${lx}" y="${yy - 4}" font-size="9" text-anchor="start" transform="rotate(-90 ${lx} ${yy - 4})">${fmt(val, val < 100 ? 1 : 0)}</text>`;
    });
    svg += `<text x="${gx + groupW / 2 - 10}" y="${H - bottom + 18}" text-anchor="middle">${s}</text>`;
  });
  versions.forEach(([, label], j) => {
    svg += `<rect x="${left + j * 150}" y="${H - 40}" width="12" height="12" fill="${colors[j]}"/><text x="${left + j * 150 + 16}" y="${H - 30}">${label}</text>`;
  });
  svg += '</svg>';
  writeFileSync(new URL(`../docs/assets/${file}`, import.meta.url), svg);
}

for (const d of datasets) {
  chart(d, 'rps', 'Débit sous charge (50 connexions)', 'req/s', `chart-throughput-${d}.svg`, (r) => r?.load.rps);
  chart(d, 'p99', 'Latence p99 sous charge', 'ms', `chart-p99-${d}.svg`, (r) => r?.load.latencyMs.p99);
}
console.log(summary);
