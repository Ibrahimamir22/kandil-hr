// Admin guide: docs/guides/admin-guide/admin-guide.md with its pictures taken from the portal on demo data, as one PDF.
// In the text, ![caption](shot:key) is a picture of the screen below. Run:
//   NODE_PATH=/opt/node22/lib/node_modules node tools/admin_guide.js [out.pdf]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'docs', 'guides', 'admin-guide');
const OUT = path.resolve(process.argv[2] || path.join(DIR, 'admin-guide.pdf'));
const { ctx, fresh, tO, ID, idx, asUser, browserCtx } = require('./demo_data.js');
// a few demo users «on» screens, so «who is online» shows what it is for
fresh(); ctx.all_('USERS').filter(u => u.Status === 'Active' && ctx.isDemoUser_(u)).slice(0, 5)
  .forEach((u, i) => ctx.presenceMark_({ user: u }, ['cands', 'intv', 'approvals', 'prob', 'jds'][i]));

const go = (v, arg, sel) => async page => { await page.evaluate(([v, a]) => go(v, a), [v, arg === undefined ? null : arg]); await page.waitForTimeout(900); if (sel) await page.waitForSelector(sel, { timeout: 6000 }); };
const SHOTS = {
  home: go('home'), settings: go('settings'), users: go('users'), online: go('online'), pay: go('pay'),
  audit: go('audit'), config: go('config'), golive: go('golive'), org: async p => { await p.evaluate(u => { S.selUnit = u; }, ID.unit); await go('org')(p); },
  orgchart: go('orgchart', null, '.oc'), jds: go('jds'), jd: go('jd', ID.job), emps: go('emps'), req: go('req', ID.reqBy.APPROVED),
  approvals: go('approvals'), pipe: go('pipe', ID.vac), app: go('app', ID.appBy.INTERVIEW), intv: go('intv', ID.ivBy.EVALUATED),
  offers: go('offers'), onboarding: go('onboarding'), probation: go('probation'), transfers: go('transfers'), kpi: go('kpi', 'PROCESS', '.kpitile')
};

// a small Markdown reader: headings, paragraphs, lists, tables, bold, pictures
const inline = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
function md(text, pics) {
  const out = [], L = text.split('\n'); let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(l))) { out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
    if ((m = /^!\[(.*?)\]\(shot:(\w+)\)$/.exec(l))) {
      out.push(pics[m[2]] ? '<figure><img src="data:image/png;base64,' + pics[m[2]] + '"><figcaption>' + inline(m[1]) + '</figcaption></figure>' : '');
      i++; continue;
    }
    if (l.startsWith('|')) {
      const rows = []; while (i < L.length && L[i].startsWith('|')) rows.push(L[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      out.push('<table><thead><tr>' + cells(rows[0]).map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
        rows.slice(2).map(r => '<tr>' + cells(r).map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      const ol = /^\d/.test(l), items = [];
      while (i < L.length && /^(- |\d+\. )/.test(L[i])) items.push(L[i++].replace(/^(- |\d+\. )/, ''));
      out.push('<' + (ol ? 'ol' : 'ul') + '>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</' + (ol ? 'ol' : 'ul') + '>');
      continue;
    }
    const p = []; while (i < L.length && L[i].trim() && !/^(#|!\[|\||- |\d+\. )/.test(L[i])) p.push(L[i++]);
    out.push('<p>' + inline(p.join(' ')) + '</p>');
  }
  return out.join('\n');
}

(async () => {
  const text = fs.readFileSync(path.join(DIR, 'admin-guide.md'), 'utf8');
  const { browser, bctx } = await browserCtx(chromium, { viewport: { width: 1360, height: 820 }, deviceScaleFactor: 1.5 });
  const pics = {}, failed = [], errs = [];
  const HIDE = '<style>.fab,#toast,.toast,.intro{display:none!important}</style>';
  // the sign-in screen, signed out
  { const p = await bctx.newPage(); await p.setContent(idx.replace('</head>', HIDE + '</head>')); await p.waitForTimeout(1200);
    pics.login = (await p.screenshot()).toString('base64'); await p.close(); }
  const page = await bctx.newPage(); page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.setContent(asUser(idx, tO).replace('</head>', HIDE + '</head>'));
  await page.waitForSelector('.shell'); await page.evaluate(() => { try { introToggle(false); } catch (e) {} });
  for (const [k, open] of Object.entries(SHOTS)) {
    try {
      await page.evaluate(() => { try { closeModal(); } catch (e) {} });
      await open(page); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
      pics[k] = (await page.screenshot()).toString('base64');
    } catch (e) { failed.push(k + ': ' + e.message.split('\n')[0]); }
  }
  const used = [...text.matchAll(/\(shot:(\w+)\)/g)].map(m => m[1]).filter(k => !pics[k]);
  const body = md(text, pics), title = /^# (.*)$/m.exec(text)[1];
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap"><style>
    @page{size:A4;margin:15mm 14mm}
    body{font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;color:#1F1A17;font-size:11.5pt;line-height:1.75;margin:0}
    h1{font-size:30pt;color:#1F1A17;margin:70mm 0 6mm;border-inline-start:8px solid #A8111C;padding-inline-start:18px;line-height:1.3}
    h1 + p{font-size:13pt;color:#A8111C;font-weight:600;padding-inline-start:26px}
    h1 + p + p{font-size:12pt;color:#3F3B37;padding-inline-start:26px;break-after:page;max-width:150mm}
    h2{font-size:18pt;color:#A8111C;border-bottom:3px solid #C6A151;padding-bottom:4px;margin:0 0 8px;break-before:page}
    h3{font-size:13.5pt;color:#1F4F8F;margin:16px 0 4px;break-after:avoid}
    p{margin:6px 0}ul,ol{margin:6px 0;padding-inline-start:22px}li{margin:2px 0}
    table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt;line-height:1.5}
    th{background:#F4EFE8;text-align:start;padding:6px 8px;border-bottom:2px solid #C6A151}td{padding:6px 8px;border-bottom:1px solid #E3DCD2;vertical-align:top}
    tr{break-inside:avoid}
    figure{margin:10px 0 14px;break-inside:avoid;text-align:center}
    figure img{max-width:100%;max-height:118mm;border:1px solid #D8D0C4;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    figcaption{font-size:9.5pt;color:#6E6862;margin-top:3px}
  </style></head><body>${body}</body></html>`;
  const bp = await bctx.newPage();
  await bp.setContent(html, { waitUntil: 'load' }); await bp.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await bp.pdf({ path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#6E6862;text-align:center">دليل الإدارة — بوابة التوظيف · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '15mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  await browser.close();
  console.log('guide: ' + Object.keys(pics).length + ' pictures → ' + OUT);
  if (failed.length) console.log('could not open:\n  ' + failed.join('\n  '));
  if (used.length) console.log('pictures in the text with no shot: ' + used.join(', '));
  if (errs.length) console.log('page errors:\n  ' + [...new Set(errs)].join('\n  '));
})().catch(e => { console.error(e); process.exit(1); });
