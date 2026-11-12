// Builds docs/RAPPORT.pdf from docs/RAPPORT.md: Markdown -> styled HTML (marked) -> PDF (Edge/Chrome headless)
// -> page numbers in the footer (pdf-lib), the cover page being neither numbered nor counted.
// Usage: npm run pdf   (BROWSER_PATH=... to force a Chromium-based browser)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const docsDir = import.meta.dirname;
const source = join(docsDir, 'RAPPORT.md');
const output = join(docsDir, 'RAPPORT.pdf');
const htmlFile = join(docsDir, '.rapport-print.html');

const cover = {
  module: '5PERF',
  title: 'Audit de performance',
  product: 'WeatherTrack Pro',
  subtitle: 'Audit, optimisations et recommandations',
  authors: ['Juillard Alexandre', 'Kouachi Renda', 'Monnier Thonin'],
  school: 'Supinfo Lyon',
  year: '2026',
};

// GitHub-compatible anchors, so that the links of the table of contents keep working
const slug = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const text = this.parser.parseInline(tokens, this.parser.textRenderer);
      return `<h${depth} id="${slug(text)}">${html}</h${depth}>\n`;
    },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (href.startsWith('#') || /^https?:/.test(href)) return `<a href="${href}">${text}</a>`;
      // Links to repository files are meaningless in a PDF: kept as plain references
      return `<span class="file-ref">${text}</span>`;
    },
    image({ href, text }) {
      // Charts and flamegraphs exist in SVG: vector rendering in the PDF (sharp at any zoom level)
      const svg = href.replace(/\.png$/, '.svg');
      const src = /(chart|flame)-/.test(href) && existsSync(join(docsDir, svg)) ? svg : href;
      const kind = href.match(/(chart|flame)-/)?.[1] ?? 'figure';
      return `<img class="${kind}" src="${src}" alt="${text}">`;
    },
  },
});

let markdown = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
markdown = markdown.replace(/<!-- pdf:skip-start -->[\s\S]*?<!-- pdf:skip-end -->/g, '');

let body = marked.parse(markdown);
body = body
  .replace(/<blockquote>\s*<p><strong>En clair\.<\/strong>/g, '<blockquote class="clair">\n<p><strong>En clair.</strong>')
  .replace(/<blockquote>/g, '<blockquote class="guide">')
  .replace('<h2 ', '<h2 class="first" ')
  // Short numeric cells (values with their unit) are never wrapped
  .replace(/<td align="right">(.*?)<\/td>/g, (cell, content) =>
    content.replace(/<[^>]+>/g, '').length <= 24 ? `<td align="right" class="nw">${content}</td>` : cell
  );

const annexStart = body.indexOf('<h3 id="84-détail-complet-des-mesures">');
if (annexStart >= 0) body = `${body.slice(0, annexStart)}<div class="annex">${body.slice(annexStart)}</div>`;

// Internal links tolerant to anchor variants (e.g. apostrophes written as '-')
const ids = [...body.matchAll(/<h\d id="([^"]+)"/g)].map((m) => m[1]);
const norm = (s) => decodeURIComponent(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
body = body.replace(/href="#([^"]+)"/g, (attr, target) => {
  if (ids.includes(target)) return attr;
  const match = ids.find((id) => norm(id) === norm(target));
  if (!match) console.warn(`Lien interne sans cible : #${target}`);
  return `href="#${match ?? target}"`;
});

const css = `
@page { size: A4; margin: 17mm 16mm 20mm 16mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 9.6pt; line-height: 1.5; color: #1f2933; margin: 0; }

/* ---------- Cover ---------- */
.cover { width: 210mm; height: 297mm; position: relative; overflow: hidden; break-after: page;
  background: linear-gradient(160deg, #0d2847 0%, #12355b 55%, #1d5b8f 100%); color: #fff; }
.cover .band { position: absolute; left: 0; top: 0; width: 9mm; height: 100%; background: #e8892b; }
.cover .waves { position: absolute; right: -10mm; bottom: 38mm; width: 150mm; opacity: .16; }
.cover .top { position: absolute; top: 24mm; left: 26mm; right: 22mm; display: flex; justify-content: space-between;
  font-size: 11pt; letter-spacing: .18em; text-transform: uppercase; color: #cfe0f1; }
.cover .main { position: absolute; top: 92mm; left: 26mm; right: 22mm; }
.cover .module { display: inline-block; font-size: 13pt; font-weight: 700; letter-spacing: .12em; color: #0d2847;
  background: #e8892b; padding: 1.5mm 4mm; border-radius: 1.5mm; }
.cover h1 { font-size: 34pt; line-height: 1.12; margin: 9mm 0 0; font-weight: 300; color: #fff; border: 0; }
.cover h1 strong { display: block; font-weight: 700; font-size: 40pt; color: #fff; }
.cover .subtitle { margin-top: 8mm; font-size: 13pt; color: #cfe0f1; }
.cover .rule { width: 40mm; height: 1.2mm; background: #e8892b; margin-top: 10mm; }
.cover .bottom { position: absolute; left: 26mm; right: 22mm; bottom: 26mm; font-size: 11pt; color: #e6eef7; }
.cover .bottom .label { font-size: 8.5pt; letter-spacing: .15em; text-transform: uppercase; color: #9fbcd9; margin-bottom: 2mm; }
.cover .bottom .authors { font-size: 12.5pt; font-weight: 600; }
.cover .bottom .school { margin-top: 7mm; font-size: 12pt; }

/* ---------- Headings ---------- */
h1, h2, h3, h4, h5 { color: #12355b; line-height: 1.25; break-after: avoid; page-break-after: avoid; }
h2 { font-size: 19pt; margin: 0 0 6mm; padding-bottom: 2.5mm; border-bottom: 1.2mm solid #e8892b;
  break-before: page; page-break-before: always; }
h2.first { break-before: auto; page-break-before: auto; margin-top: 8mm; }
h3 { font-size: 13pt; margin: 7mm 0 3mm; padding-left: 3mm; border-left: 1.2mm solid #1d5b8f; }
h4 { font-size: 11pt; margin: 6mm 0 2mm; color: #1d5b8f; }
h5 { font-size: 10pt; margin: 5mm 0 2mm; color: #1d5b8f; }
p { margin: 0 0 2.6mm; text-align: justify; hyphens: auto; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1mm; }
strong { color: #10263f; }
a { color: #1d5b8f; text-decoration: none; }
hr { display: none; }

/* ---------- Code ---------- */
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: .86em; background: #eef2f6; color: #23405f;
  padding: .2mm 1mm; border-radius: .8mm; }
pre { background: #f3f6f9; border: .3mm solid #dbe3eb; border-left: 1mm solid #1d5b8f; border-radius: 1mm;
  padding: 3mm 3.5mm; margin: 0 0 4mm; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 6.9pt; line-height: 1.4; color: #1f2933; }
.file-ref { font-family: Consolas, monospace; font-size: .86em; color: #23405f; }

/* ---------- Tables ---------- */
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4.5mm; font-size: 8pt; line-height: 1.35;
  break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
th { background: #12355b; color: #fff; font-weight: 600; text-align: left; padding: 1.6mm 2mm; border: .2mm solid #12355b; }
td { padding: 1.4mm 2mm; border: .2mm solid #d5dde6; vertical-align: top; }
td.nw { white-space: nowrap; }
tbody tr:nth-child(even) td { background: #f5f8fb; }
tr { break-inside: avoid; page-break-inside: avoid; }
td code, th code { font-size: .92em; }
th strong { color: #fff; }
.annex table { font-size: 7.6pt; }
.annex h5 { margin-top: 4mm; }
h5 + blockquote, h4 + blockquote { break-after: avoid; page-break-after: avoid; }

/* ---------- Callouts ---------- */
blockquote { margin: 3mm 0 5mm; padding: 3mm 4.5mm; border-radius: 1.5mm; break-inside: avoid; page-break-inside: avoid; }
blockquote p:last-child, blockquote ul:last-child { margin-bottom: 0; }
blockquote.clair { background: #e9f3fb; border-left: 1.4mm solid #1d5b8f; color: #17324f; }
blockquote.clair strong:first-child { color: #1d5b8f; }
blockquote.guide { background: #fdf3e8; border-left: 1.4mm solid #e8892b; color: #4a3218; }
blockquote.guide strong:first-child { color: #b5631a; }

/* ---------- Figures ---------- */
p:has(> img) { text-align: center; margin: 4mm 0 1.5mm; break-inside: avoid; page-break-inside: avoid; }
p:has(> img):has(+ p > em:only-child) { break-after: avoid; page-break-after: avoid; }
img { max-width: 100%; max-height: 205mm; height: auto; display: block; margin: 0 auto; border: .3mm solid #e1e7ee;
  break-inside: avoid; page-break-inside: avoid; }
img.chart { max-height: 100mm; }
img.flame { max-height: 150mm; }
p:has(> img) + p:has(> em:only-child), p:has(> em:only-child) { text-align: center; font-size: 8.3pt; color: #5b6b7b; }
p:has(> em:only-child) em { font-style: italic; }

/* ---------- Front matter ---------- */
#fiche-du-projet { margin-top: 0; }
#sommaire + ol { font-size: 11pt; line-height: 1.9; padding-left: 8mm; }
#sommaire + ol li { border-bottom: .3mm dotted #b9c6d3; padding-left: 1mm; }
#sommaire + ol li::marker { color: #e8892b; font-weight: 700; }
#sommaire + ol a { color: #12355b; font-weight: 600; }
`;

const waves = `<svg class="waves" viewBox="0 0 600 260" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#fff" stroke-width="3">
${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${40 + i * 30} C 100 ${10 + i * 30}, 200 ${70 + i * 30}, 300 ${40 + i * 30} S 500 ${10 + i * 30}, 600 ${40 + i * 30}"/>`).join('')}
</svg>`;

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${cover.module} — ${cover.title} ${cover.product}</title>
<style>${css}</style></head>
<body>
<section class="cover">
  <div class="band"></div>
  ${waves}
  <div class="top"><span>${cover.school}</span><span>${cover.year}</span></div>
  <div class="main">
    <span class="module">${cover.module}</span>
    <h1>${cover.title}<strong>${cover.product}</strong></h1>
    <div class="subtitle">${cover.subtitle}</div>
    <div class="rule"></div>
  </div>
  <div class="bottom">
    <div class="label">Réalisation</div>
    <div class="authors">${cover.authors.join(' &nbsp;·&nbsp; ')}</div>
    <div class="school">${cover.school} — ${cover.year}</div>
  </div>
</section>
<main>
${body}
</main>
</body></html>`;

writeFileSync(htmlFile, html);

const browser =
  process.env.BROWSER_PATH ??
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find(existsSync);
if (!browser) throw new Error('No Chromium-based browser found (set BROWSER_PATH)');

const work = mkdtempSync(join(tmpdir(), 'rapport-pdf-'));
const rawPdf = join(work, 'raw.pdf');
try {
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(work, 'profile')}`, // isolated from the user's browser session
      '--no-pdf-header-footer',
      '--generate-pdf-document-outline', // PDF bookmarks from the headings
      '--virtual-time-budget=10000',
      `--print-to-pdf=${rawPdf}`,
      pathToFileURL(resolve(htmlFile)).href,
    ],
    { stdio: 'ignore', timeout: 180_000 }
  );
  if (!existsSync(rawPdf)) throw new Error('The browser did not produce a PDF');

  // Footer page numbers: the cover is neither numbered nor counted
  const pdf = await PDFDocument.load(readFileSync(rawPdf));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    if (index === 0) return;
    const label = String(index);
    const size = 9;
    const { width } = page.getSize();
    page.drawText(label, {
      x: (width - font.widthOfTextAtSize(label, size)) / 2,
      y: 9 * 2.8346, // 9 mm from the bottom edge
      size,
      font,
      color: rgb(0.35, 0.42, 0.48),
    });
  });
  pdf.setTitle(`${cover.module} — ${cover.title} ${cover.product}`);
  pdf.setAuthor(cover.authors.join(', '));
  pdf.setSubject('Audit, optimisations et recommandations');
  pdf.setLanguage('fr-FR');
  writeFileSync(output, await pdf.save());
  console.log(`${output} : ${pages.length} pages (couverture + ${pages.length - 1} pages numérotées)`);
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(htmlFile, { force: true });
}
