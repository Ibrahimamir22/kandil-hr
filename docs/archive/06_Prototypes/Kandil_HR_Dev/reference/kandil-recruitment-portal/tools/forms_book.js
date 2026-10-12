// Forms book: opens every form in the portal on demo data (the same mocks the tests use) and binds the pictures
// into one PDF, grouped by stage. Run:  NODE_PATH=/opt/node22/lib/node_modules node tools/forms_book.js [out.pdf]
// The steps list is the inventory: one entry per form. A step that cannot open is listed at the end of the run.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'forms', 'forms-book.pdf'));
const { ctx, fresh, api, tO, ID, shim, idx, browserCtx } = require('./demo_data.js');

// ---------- the book ----------
const HIDE = '<style>.fab,#toast,.toast{display:none!important} .overlay{position:absolute!important;align-items:flex-start!important} .modal{max-height:none!important;overflow:visible!important} .shell{height:auto!important} .body{min-height:0} .main{overflow:visible!important} .scroll{overflow:visible!important;flex:none!important} .intro{display:none!important}</style>';

if (process.env.IDS_ONLY) process.exit(0);
const STEPS = require('./forms_steps.js')(ID).filter(s => !process.env.ONLY || new RegExp(process.env.ONLY).test(s.t));

(async () => {
  const { browser, bctx } = await browserCtx(chromium);
  const page = await bctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();').replace('</head>', HIDE + '</head>'));
  await page.waitForSelector('.shell');
  await page.evaluate(() => { try { introToggle(false); } catch (e) {} });
  const shots = [], failed = [];
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'forms-'));
  const src = n => fs.readFileSync(path.join(__dirname, '..', 'src', n), 'utf8');
  const H = { page, ID, api, tO, ctx, fresh, browser, bctx,
    idx: idx.replace('</head>', HIDE + '</head>'),
    applyHtml: () => src('Apply.html').replace(/<\?= code \?>/g, api('cand.applySettings', tO, { Vacancy_ID: ID.vac, Apply_Enabled: 'Y' }).code)
      .replace(/<\?= src \?>/g, '').replace(/<\?= lang \?>/g, 'ar').replace(/<\?= ad \?>/g, '').replace('<script>', shim + '<script>'),
    docsHtml: () => src('Docs.html').replace("'<?= token ?>'", JSON.stringify(/docs=([A-Za-z0-9]+)/.exec(api('join.action', tO, { Joining_ID: ID.joinBy.PENDING, action: 'LINK' }).link)[1])).replace('<script>', shim + '<script>'),
    probHtml: () => src('ProbPage.html').replace(/<\?= token \?>/g, /prob=([A-Za-z0-9]+)/.exec(api('prob.action', tO, { Probation_ID: ID.prob.early, action: 'LINK' }).link)[1]).replace('<script>', shim + '<script>'),
    voiceHtml: () => src('Voice.html').replace(/<\?= token \?>/g, /voice=([A-Za-z0-9]+)/.exec(api('nhv.action', tO, { Survey_ID: ID.nhvBy.SCHEDULED, action: 'LINK' }).link)[1]).replace('<script>', shim + '<script>')
  };
  for (const st of STEPS) {
    let P0 = page, extra = null;
    try {
      await page.evaluate(() => { try { closeModal(); } catch (e) {} });
      if (st.pub || st.as) {                               // its own tab: a public page, or the portal as another user
        extra = P0 = await bctx.newPage(); P0.on('pageerror', e => errs.push(st.t + ': ' + e.message)); P0.on('dialog', d => d.dismiss());
        if (st.w) await P0.setViewportSize({ width: st.w, height: 900 });
        if (st.pub) await P0.setContent(st.pub(H));
        else {
          await P0.setContent(H.idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(api('demo.as', tO, { User_ID: st.as }).token) + ' || loadToken();'));
          await P0.waitForSelector('.shell');
        }
        await P0.waitForTimeout(900);
      }
      const pop = st.popup ? P0.waitForEvent('popup', { timeout: 8000 }) : null;
      await st.open(Object.assign({}, H, { page: P0 }));
      if (pop) { const w = await pop; await w.waitForLoadState(); await w.setViewportSize({ width: 900, height: 1200 }); await w.waitForTimeout(600); extra = P0 = w; }
      await P0.waitForTimeout(st.wait || 350);
      if (st.print) await P0.emulateMedia({ media: 'print' });
      const sel = st.print ? '#printArea' : st.popup ? 'body' : st.el || (await P0.$('.overlay .modal') ? '.overlay .modal' : '#main');
      const el = await P0.$(sel);
      if (!el) throw new Error('nothing at ' + sel);
      if (process.env.DISCOVER) console.log('## ' + st.t + ' :: ' + (await P0.$$eval(sel + ' button, ' + sel + ' a.btn', a => a.filter(b => b.offsetParent).map(b => b.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).join(' | '))));
      // a tall form is cut into page-size slices so it stays readable
      await P0.evaluate(() => window.scrollTo(0, 0));
      const b = await el.boundingBox(), sy = await P0.evaluate(() => window.scrollY);
      if (b) {                                             // trim the empty space under the last block of the screen
        const bottom = await el.evaluate(e => { let m = 0; e.querySelectorAll('.scroll > *, .modal > *, #printArea > * > *, body > *').forEach(x => { const r = x.getBoundingClientRect(); if (r.height && getComputedStyle(x).display !== 'none') m = Math.max(m, r.bottom); }); return m; });
        if (bottom > b.y + 40 && bottom < b.y + b.height) b.height = bottom - b.y + 16;
      }
      if (!b || b.height < 30) throw new Error('empty ' + sel);
      const sliceH = Math.round(Math.max(b.width, 700) * 1.32), parts = Math.max(1, Math.ceil((b.height - 40) / sliceH));
      for (let i = 0; i < parts; i++) {
        const f = path.join(tmp, String(shots.length).padStart(3, '0') + '.png');
        const y = b.y + sy + i * sliceH, h = Math.min(sliceH, b.height - i * sliceH);
        await P0.screenshot({ path: f, fullPage: true, clip: { x: b.x, y, width: b.width, height: h } });
        shots.push({ st, f, part: i, parts, narrow: b.width < 700 });
      }
      if (st.print) { await P0.emulateMedia({ media: 'screen' }); await P0.evaluate(() => { const p = document.getElementById('printArea'); if (p) p.innerHTML = ''; }); }
    } catch (e) {
      if (process.env.DISCOVER) console.log('!! ' + st.t + ' :: ' + (await P0.$$eval('#main button, #main a.btn, .overlay button', a => a.filter(b => b.offsetParent).map(b => b.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60).join(' | ')).catch(() => '')));
      failed.push(st.g + ' › ' + st.t + ': ' + e.message.split('\n')[0]); }
    if (extra) await extra.close();
    if (st.print) await page.emulateMedia({ media: 'screen' });
  }
  // ---------- bind ----------
  const groups = [];
  shots.filter(s => !s.part).length; shots.forEach(s => { let g = groups.find(x => x.name === s.st.g); if (!g) groups.push(g = { name: s.st.g, items: [] }); g.items.push(s); });
  let n = 0;
  const today = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:12mm}
    body{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;color:#1F1A17;margin:0}
    .cover{height:265mm;display:flex;flex-direction:column;justify-content:center;gap:10px;border-inline-start:8px solid #A8111C;padding-inline-start:28px;break-after:page}
    .cover .co{color:#A8111C;font-size:26px;font-weight:800}.cover h1{font-size:40px;margin:0}.cover p{font-size:15px;color:#3F3B37;margin:0;max-width:150mm;line-height:1.7}
    .toc{break-after:page}.toc h2{color:#A8111C;border-bottom:3px solid #C6A151;padding-bottom:6px}
    .toc h3{font-size:14px;margin:12px 0 4px}.toc ol{margin:0;padding-inline-start:22px;columns:2;column-gap:24px;font-size:12px;line-height:1.75}
    .grp{break-before:page;font-size:24px;color:#A8111C;border-bottom:3px solid #C6A151;padding-bottom:6px;margin:0 0 12px}
    .form{break-inside:avoid;margin:0 0 16px}
    .form h4{font-size:14.5px;margin:0 0 2px}.form h4.cont{font-size:12px;color:#6E6862}.form h4 small{font-size:11px;color:#6E6862;font-weight:400}.form .d{font-size:11.5px;color:#6E6862;margin:0 0 6px}
    .form img{display:block;max-width:100%;max-height:232mm;margin:0 auto;border:1px solid #E3DCD2;border-radius:6px}
    .num{display:inline-block;min-width:26px;color:#A8111C}
  </style></head><body>
  <section class="cover"><div class="co">قنديل مصر — بوابة التوظيف</div><h1>كل نماذج البرنامج</h1>
    <p>نسخة من كل نموذج (شاشة إدخال أو نافذة أو مستند للطباعة) في البوابة، مرتبة بمراحل الشغل من الهيكل لحد النقل الداخلي. البيانات اللي فيها تجريبية مش حقيقية.</p>
    <p>عدد النماذج: ${shots.filter(s => !s.part).length} · تاريخ الإصدار: ${today}</p></section>
  <section class="toc"><h2>الفهرس</h2>${(() => { let k = 0; return groups.map(g => '<h3>' + g.name + '</h3><ol start="' + (k + 1) + '">' + g.items.filter(s => !s.part).map(s => (k++, '<li>' + s.st.t + '</li>')).join('') + '</ol>').join(''); })()}</section>
  ${groups.map(g => '<h2 class="grp">' + g.name + '</h2>' + g.items.map(s => '<div class="form">' + (s.part ? '<h4 class="cont">' + s.st.t + ' — تابع (' + (s.part + 1) + ' من ' + s.parts + ')</h4>' : '<h4><span class="num">' + (++n) + '.</span>' + s.st.t + (s.parts > 1 ? ' <small>(' + s.parts + ' صفحات)</small>' : '') + '</h4>' + (s.st.d ? '<p class="d">' + s.st.d + '</p>' : '')) +
    '<img' + (s.narrow ? ' style="max-width:125mm"' : '') + ' src="data:image/png;base64,' + fs.readFileSync(s.f).toString('base64') + '"></div>').join('')).join('')}
  </body></html>`;
  const bp = await bctx.newPage();
  await bp.setContent(html, { waitUntil: 'load' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await bp.pdf({ path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#6E6862;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' } });
  await browser.close();
  console.log('forms: ' + shots.filter(s => !s.part).length + ' (' + shots.length + ' pictures)' + ' → ' + OUT);
  if (failed.length) console.log('could not open (' + failed.length + '):\n  ' + failed.join('\n  '));
  if (errs.length) console.log('page errors:\n  ' + [...new Set(errs)].join('\n  '));
})().catch(e => { console.error(e); process.exit(1); });
