// Print book: every document the portal prints, filled with demo data, exactly as it prints (the portal's own print
// window saved as PDF, not a picture of the screen), bound into one PDF with a cover and a contents page.
// Run:  NODE_PATH=/opt/node22/lib/node_modules node tools/print_book.js [out.pdf]     (needs python3 with pypdf)
// The list below is the inventory: one entry per printed document. One that cannot be made is listed at the end.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'forms', 'print-book.pdf'));
const { ctx, fresh, api, tO, ID, idx, asUser, browserCtx } = require('./demo_data.js');

// a sample with no social insurance, so its acknowledgement can be printed
fresh(); ctx.update_('OFFERS', ID.offerBy.PRESENTED, { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش مبكر — مستند المعاش مرفق' }, 'x');
const person = ctx.get_('APPLICATIONS', ID.joinApp.JOINED).Person_ID;
fresh();

const go = (v, arg, sel) => async page => { await page.evaluate(([v, a]) => go(v, a), [v, arg === undefined ? null : arg]); await page.waitForTimeout(700); if (sel) await page.waitForSelector(sel, { timeout: 6000 }); };
const btn = text => async page => { await page.locator('#main :is(button,a.btn)', { hasText: text }).filter({ visible: true }).first().click({ timeout: 5000 }); await page.waitForTimeout(500); };
const js = (f, a) => async page => { await page.evaluate(f, a); await page.waitForTimeout(500); };
const seq = (...f) => async page => { for (const x of f) await x(page); };
const pp = seq(js(() => document.querySelector('#main [data-pp]').click()));       // the print button next to a screen's title

// g = section · t = name · d = what it is and when it is printed · who = who can print it
// page = steps in the portal that end in the print window · srv = [action, payload] for a document the server writes
const DOCS = [
  { g: 'الهيكل والوظائف', t: 'الوصف الوظيفي', who: 'الموارد البشرية، والمدير لوظايف وحداته',
    d: 'الوصف المعتمد: الغرض، المسؤوليات، مؤشرات الأداء، الصلاحيات، الكفاءات بمستوياتها، المؤهل والخبرة، والتوقيعات. المسودة بتطلع بعلامة «مسودة».',
    page: seq(go('jd', ID.job), btn(/^\s*الوصف\s*$/), js(() => document.getElementById('jdPrintB').click())) },
  { g: 'الهيكل والوظائف', t: 'بطاقة العامل', who: 'الموارد البشرية، والمدير لوظايف وحداته',
    d: 'صفحة واحدة بخط كبير للعامل: الشغل المطلوب، السلامة أولاً، اللي بيتقاس، وإيصال استلام يوقّع عليه.',
    page: seq(go('jd', ID.job), btn(/^\s*الوصف\s*$/), js(() => document.getElementById('jdCardB').click())) },
  { g: 'الهيكل والوظائف', t: 'ملف المقابلة', who: 'الموارد البشرية، لجنة المقابلة',
    d: 'أسئلة المقابلة حسب كفاءات الوصف ومستوى الوظيفة، مع شكل الإجابة القوية والضعيفة، ومكان للدرجة والملاحظات.',
    page: seq(go('jd', ID.job), btn(/^\s*ملف المقابلة\s*$/), js(() => document.getElementById('kitPrint').click())) },
  { g: 'الهيكل والوظائف', t: 'خريطة الهيكل', who: 'الموارد البشرية والإدارة العليا، والمدير لوحداته',
    d: 'الهيكل مرسوم: صفحة للشركة وصفحة لكل قطاع، بالأعداد الفعلية والمعتمدة. الاتجاه والحجم بيتظبطوا على قد الرسمة.',
    page: seq(go('orgchart', null, '.oc'), js(() => ocPrintRun({ scope: 'sectors', paper: 'A4', by: 'unit' }))) },
  { g: 'طلبات التوظيف', t: 'طلب التوظيف المعتمد', who: 'الموارد البشرية، وصاحب الطلب',
    d: 'الطلب بكل بياناته ومسار الاعتماد بالتوقيعات الإلكترونية (مين اعتمد وإمتى). الطباعة بتتسجل على الطلب.',
    page: seq(go('req', ID.reqBy.APPROVED), btn('طباعة / PDF')), inPage: true },           // printed inside the page itself
  { g: 'المقابلات والعروض', t: 'بيانات المقابلة', who: 'الموارد البشرية، ولجنة المقابلة',
    d: 'شاشة المقابلة مطبوعة: الميعاد والمكان، اللجنة وحالة تقييمها، وبيانات المرشح — مثال لزرار الطباعة اللي جنب عنوان كل شاشة (أي شاشة تتطبع بنفس الشكل مع خانات التوقيع).',
    page: seq(go('intv', ID.ivBy.EVALUATED, '#main [data-pp]'), pp) },
  { g: 'المقابلات والعروض', t: 'خطاب العرض الوظيفي', who: 'الموارد البشرية (بعد اعتماد العرض)',
    d: 'خطاب العرض للمرشح: الوظيفة والمرتب ومكوناته الظاهرة في العرض، ميعاد الاستلام، وصلاحية العرض.',
    srv: ['offer.letter', { Offer_ID: ID.offerBy.ACCEPTED }] },
  { g: 'المقابلات والعروض', t: 'إقرار عدم الاشتراك في التأمينات', who: 'الموارد البشرية',
    d: 'يطلع بس لو العرض من غير تأمينات اجتماعية: إقرار يوقّعه المرشح بالسبب وإنه فاهم أثره، ويترفع موقّع على العرض.',
    srv: ['offer.noInsForm', { Offer_ID: ID.offerBy.PRESENTED }] },
  { g: 'الاستلام والتهيئة', t: 'عقد العمل', who: 'الموارد البشرية',
    d: 'نموذج العقد ببيانات الموظف والوظيفة والمرتب من العرض المقبول، للطباعة والتوقيع يوم الاستلام.',
    srv: ['join.contract', { Joining_ID: ID.joinBy.JOINED }] },
  { g: 'الاستلام والتهيئة', t: 'إيصال استلام المسوغات', who: 'الموارد البشرية',
    d: 'إيصال للموظف الجديد بكل مستند اتسلم (أصل / صورة) وتاريخه. بعد إصداره قايمة المستندات بتتقفل.',
    srv: ['doc.receipt', { Joining_ID: ID.joinBy.JOINED }] },
  { g: 'الاستلام والتهيئة', t: 'برنامج التهيئة — نسخة التوقيع', who: 'الموارد البشرية، والمدير المباشر',
    d: 'مهام التهيئة بمسؤوليها ومواعيدها وحالتها، مع إقرار الموظف بالتوقيع.',
    page: seq(go('onb', ID.onb), btn('طباعة للتوقيع')) },
  { g: 'فترة الاختبار', t: 'تقييم فترة الاختبار', who: 'الموارد البشرية، والمدير المباشر',
    d: 'صفحة فترة الاختبار كاملة: الأهداف، متابعة يوم 30 و60، سجل الأداء، والتقييم — مطبوعة من زرار الطباعة جنب العنوان.',
    page: seq(go('prob', ID.prob.dec, '#main [data-pp]'), pp) },
  { g: 'فترة الاختبار', t: 'خطاب التثبيت', who: 'الموارد البشرية (بعد القرار واجتماع الإبلاغ)',
    d: 'خطاب تثبيت الموظف في الوظيفة بعد نجاح فترة الاختبار.',
    page: seq(go('prob', ID.prob.conf, '#prLetter'), js(() => document.getElementById('prLetter').click())) },
  { g: 'فترة الاختبار', t: 'خطاب انتهاء فترة الاختبار', who: 'الموارد البشرية (بعد قرار مدير القطاع واجتماع الإبلاغ)',
    d: 'نفس الخطاب في حالة عدم التثبيت (المثال هنا على نفس الموظف للعرض بس).',
    page: seq(go('prob', ID.prob.conf, '#prLetter'), js(() => { S.prb.decision = 'NOT_CONFIRMED'; prbLetter(); })) },
  { g: 'النقل الداخلي', t: 'إخطار تعديل مفردات الراتب', who: 'الموارد البشرية',
    d: 'إخطار للمرتبات بعد تنفيذ النقل: الوظيفة والموقع قبل وبعد، والمرتب ومكوناته قبل وبعد، وتاريخ السريان.',
    page: seq(go('trf', ID.trfBy.DONE), btn('إخطار تعديل مفردات الراتب')) },
  { g: 'الخصوصية', t: 'نسخة البيانات الشخصية', who: 'مسؤول الخصوصية (رد على طلب اطلاع)',
    d: 'كل اللي البوابة شايلاه عن الشخص — بيانات، طلبات، مقابلات، مستندات، رسائل — للرد على طلب صاحب البيانات.',
    srv: ['privacy.export', { Person_ID: person }] }
];

(async () => {
  const { browser, bctx } = await browserCtx(chromium, { deviceScaleFactor: 1 });
  const page = await bctx.newPage(), errs = [], failed = [], made = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.setContent(asUser(idx, tO));
  await page.waitForSelector('.shell');
  // the print window opens, gets the document, and would call print(); here it stays open so it can be saved as PDF
  await page.evaluate(() => { try { introToggle(false); } catch (e) {} const o = window.open; window.open = function () { const w = o.apply(window, arguments); try { w.print = function () {}; Object.defineProperty(w, 'onafterprint', { set: function () {}, get: function () { return null; } }); } catch (e) {} return w; }; window.print = function () {}; });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prints-'));
  for (const d of DOCS.filter(x => !process.env.ONLY || new RegExp(process.env.ONLY).test(x.t))) {
    let w = null;
    try {
      await page.evaluate(() => { try { closeModal(); } catch (e) {} });
      if (d.srv) {
        const L = api(d.srv[0], tO, d.srv[1]);
        w = await bctx.newPage();
        await w.setContent('<!doctype html><html><head><meta charset="utf-8"><title>' + L.subject + '</title><style>body{padding:32px;background:#fff}@media print{body{padding:0}}</style></head><body>' + L.html + '</body></html>', { waitUntil: 'load' });
      } else if (d.inPage) {
        await page.evaluate(() => { const p = document.getElementById('printArea'); if (p) p.innerHTML = ''; });
        await d.page(page);
        await page.waitForFunction(() => { const p = document.getElementById('printArea'); return p && p.innerText.trim().length > 20; }, null, { timeout: 8000 });
        w = page;
      } else {
        const pop = page.waitForEvent('popup', { timeout: 10000 });
        await d.page(page);
        w = await pop;
        await w.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, { timeout: 8000 });
      }
      await w.evaluate(() => document.fonts && document.fonts.ready); await w.waitForTimeout(400);
      const f = path.join(tmp, String(made.length).padStart(2, '0') + '.pdf');
      await w.pdf({ path: f, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
      made.push(Object.assign({ f }, d));
    } catch (e) { failed.push(d.t + ': ' + e.message.split('\n')[0]); }
    if (w && w !== page && !w.isClosed()) await w.close();
  }
  // cover + contents, then the documents; page numbers come from the PDFs themselves
  const counts = JSON.parse(require('child_process').execFileSync('python3', ['-I', '-c', 'import sys,json\nfrom pypdf import PdfReader\nprint(json.dumps([len(PdfReader(f).pages) for f in sys.argv[1:]]))', ...made.map(m => m.f)]).toString());
  const pyCount = f => JSON.parse(require('child_process').execFileSync('python3', ['-I', '-c', 'import sys,json\nfrom pypdf import PdfReader\nprint(json.dumps(len(PdfReader(sys.argv[1]).pages)))', f]).toString());
  const bp = await bctx.newPage(), frontPdf = path.join(tmp, 'front.pdf');
  let front = 2, at;
  for (let pass = 0; pass < 3; pass++) {
    at = front + 1; made.forEach((m, i) => { m.pages = counts[i]; m.at = at; at += counts[i]; });
    await bp.setContent(frontHtml(), { waitUntil: 'load' }); await bp.evaluate(() => document.fonts.ready);
    await bp.pdf({ path: frontPdf, format: 'A4', printBackground: true });
    const fc = pyCount(frontPdf); if (fc === front) break; front = fc;
  }
  await browser.close();
  function frontHtml() {
  const groups = []; made.forEach(m => { let g = groups.find(x => x.name === m.g); if (!g) groups.push(g = { name: m.g, items: [] }); g.items.push(m); });
  const today = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap"><style>
    @page{size:A4;margin:14mm}
    body{font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;color:#1F1A17;margin:0}
    .cover{height:262mm;display:flex;flex-direction:column;justify-content:center;gap:12px;border-inline-start:8px solid #A8111C;padding-inline-start:28px;break-after:page}
    .cover .co{color:#A8111C;font-size:24px;font-weight:700}.cover h1{font-size:38px;margin:0}.cover p{font-size:14.5px;color:#3F3B37;margin:0;max-width:150mm;line-height:1.8}
    h2{color:#A8111C;border-bottom:3px solid #C6A151;padding-bottom:6px;margin:0 0 10px;font-size:22px}
    h3{font-size:14px;margin:12px 0 4px;color:#3F3B37}
    table{width:100%;border-collapse:collapse;font-size:11.5px}td{padding:5px 6px;border-bottom:1px solid #E3DCD2;vertical-align:top}
    td.n{width:22px;color:#A8111C;font-weight:700}td.p{width:34px;text-align:center;color:#6E6862}td b{font-size:12.5px}.who{color:#6E6862;font-size:10.5px}
  </style></head><body>
  <section class="cover"><div class="co">قنديل مصر — بوابة التوظيف</div><h1>النماذج المطبوعة</h1>
    <p>كل مستند بتطبعه البوابة، مليان ببيانات تجريبية، بنفس الشكل اللي بيطلع بيه من زرار الطباعة (كل نموذج بيبدأ في صفحة جديدة).</p>
    <p>الأسماء والأرقام كلها تجريبية ومش لأشخاص حقيقيين.</p>
    <p>عدد النماذج: ${made.length} · تاريخ الإصدار: ${today}</p></section>
  <section><h2>الفهرس</h2>${(() => { let k = 0; return groups.map(g => '<h3>' + g.name + '</h3><table>' + g.items.map(m => '<tr><td class="n">' + (++k) + '</td><td><b>' + m.t + '</b><br>' + m.d + '<br><span class="who">مين يطبعه: ' + m.who + '</span></td><td class="p">ص ' + m.at + '</td></tr>').join('') + '</table>').join(''); })()}</section>
  </body></html>`;
  return html; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  require('child_process').execFileSync('python3', ['-I', '-c', [
    'import sys', 'from pypdf import PdfWriter, PdfReader', 'w = PdfWriter()',
    'for f in sys.argv[2:]:', '    w.append(PdfReader(f))', 'w.add_metadata({"/Title": "النماذج المطبوعة — بوابة التوظيف"})', 'w.write(sys.argv[1])'].join('\n'), OUT, frontPdf, ...made.map(m => m.f)]);
  console.log('prints: ' + made.length + ' documents, ' + (at - 1) + ' pages → ' + OUT);
  if (failed.length) console.log('could not make (' + failed.length + '):\n  ' + failed.join('\n  '));
  if (errs.length) console.log('page errors:\n  ' + [...new Set(errs)].join('\n  '));
})().catch(e => { console.error(e); process.exit(1); });
