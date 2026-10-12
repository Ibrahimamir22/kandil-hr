// Extracts every Arabic text piece the interface can show: string literals, concatenations ('a ' + x + ' b' → "a {0} b"),
// template literals and HTML attribute values (title, placeholder, aria-label). Pieces are split on HTML tags.
// Usage: NODE_PATH=<dir with acorn> node tools/i18n_extract.js > i18n/strings.json
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), walk = require('acorn-walk');
const SRC = path.join(__dirname, '..', 'src');
const AR = /[ء-ي]/;
const out = new Map();

function add(piece, file) {
  piece = piece.replace(/\s+/g, ' ').trim();
  // strip junk left by partial tags / quotes at the edges
  piece = piece.replace(/^[\s"'=>;,)(\]\[]+/, '').replace(/[\s"'=<;,(\[]+$/, '').trim();
  if (!AR.test(piece) || piece.length < 2) return;   // single letters are code (normalising Arabic spelling), not text
  // renumber placeholders from 0 in order of appearance
  let n = 0; const seen = {};
  piece = piece.replace(/\{(\d+)\}/g, (m, d) => { if (!(d in seen)) seen[d] = n++; return '{' + seen[d] + '}'; });
  if (/^(\{\d+\}\s*)+$/.test(piece)) return;
  const e = out.get(piece) || { k: piece, files: new Set(), n: 0 };
  e.files.add(file); e.n++; out.set(piece, e);
}
function processTemplate(t, file) {
  if (!AR.test(t)) return;
  const attr = /\b(?:title|placeholder|aria-label|alt|data-tip|label)\s*=\s*"([^"]*)"/g; let m;
  while ((m = attr.exec(t))) add(m[1], file);
  t.replace(/<[^<>]*>/g, '\u0000').split(/\u0000|"|<|>/).forEach(p => add(p, file));
}
function flatten(node, parts) {
  if (node.type === 'BinaryExpression' && node.operator === '+') { flatten(node.left, parts); flatten(node.right, parts); }
  else parts.push(node);
  return parts;
}
function doJs(code, file) {
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowHashBang: true }); }
  catch (e) { console.error('parse error in ' + file + ': ' + e.message); return; }
  const consumed = new Set();
  walk.ancestor(ast, {
    BinaryExpression(node, anc) {
      if (node.operator !== '+') return;
      const parent = anc[anc.length - 2];
      if (parent && parent.type === 'BinaryExpression' && parent.operator === '+') return;
      const parts = flatten(node, []);
      if (!parts.some(p => p.type === 'Literal' && typeof p.value === 'string')) return;
      let t = '', i = 0;
      parts.forEach(p => {
        if (p.type === 'Literal' && typeof p.value === 'string') { t += p.value; consumed.add(p); }
        else if (p.type === 'TemplateLiteral' && !p.expressions.length) { t += p.quasis[0].value.cooked; consumed.add(p); }
        else t += '{' + (i++) + '}';
      });
      processTemplate(t, file);
    },
    AssignmentExpression(node) {
      // h += 'text' pieces are separate literals: handled by Literal below
    }
  });
  walk.full(ast, node => {
    if (consumed.has(node)) return;
    if (node.type === 'Literal' && typeof node.value === 'string') processTemplate(node.value, file);
    else if (node.type === 'TemplateLiteral') {
      let t = ''; node.quasis.forEach((q, i) => { t += q.value.cooked; if (i < node.expressions.length) t += '{' + i + '}'; });
      processTemplate(t, file);
    }
  });
}
const files = fs.readdirSync(SRC).filter(f => /\.(gs|html)$/.test(f) && f !== 'I18nDict.gs' && f !== 'I18nEn.html' && f !== 'Apply.html' && f !== 'Voice.html' && f !== 'QrLib.html' && f !== 'CeoPage.html' && f !== 'ConsentPage.html' && f !== 'SelfPage.html');   // Apply and Voice carry their own Arabic + English; CeoPage is Arabic only (the CEO's phone)
files.forEach(f => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (f.endsWith('.gs')) return doJs(s, f);
  const scripts = []; let html = s.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, a, c) => { if (!/application\/json/.test(a)) scripts.push(c); return ' '; });
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ');
  processTemplate(html, f);
  scripts.forEach(c => doJs(c, f));
});
const list = [...out.values()].map(e => ({ k: e.k, f: [...e.files].sort().join(','), n: e.n }))
  .sort((a, b) => a.f.localeCompare(b.f) || a.k.localeCompare(b.k));
process.stdout.write(JSON.stringify(list, null, 0).replace(/},{/g, '},\n{') + '\n');
