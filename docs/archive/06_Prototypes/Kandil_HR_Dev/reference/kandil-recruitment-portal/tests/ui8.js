// Job descriptions screens with the real review workbooks: import library + JDs, approve all, view, kit, edit, print.
// Env: LIB_XLSX, JD_XLSX (comma-separated), XLSX_JS. Without them: the sample books in fixtures/ (make_jd_books.py) and the bundled xlsx lib.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const LIB_XLSX = process.env.LIB_XLSX || path.join(__dirname, 'fixtures', 'jd-library.xlsx');
const JD_XLSX = process.env.JD_XLSX || path.join(__dirname, 'fixtures', 'jd-sample.xlsx');
const XLSX_JS = process.env.XLSX_JS || path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
if (!fs.existsSync(XLSX_JS)) { console.log('CRASH needs the SheetJS library: npm i --prefix tests --no-save xlsx@0.18.5 (or set XLSX_JS)'); process.exit(1); }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''], ['قنديل مصر', 'التجاري', '', '', '', '', 'رئيس القطاع التجاري', 'العبور', '', 'Y', '', '']].map(r => r.join(T)).join('\n') });
// jobs with the real codes of the JD files (+ one position each so they show in the list)
const codes = JSON.parse(execFileSync('python3', ['-c', `
import openpyxl,json,sys
out=[]
for p in sys.argv[1].split(','):
  ws=openpyxl.load_workbook(p,read_only=True)['الأوصاف']
  out+= [[r[0],r[1]] for r in list(ws.iter_rows(values_only=True))[1:] if r[0]]
print(json.dumps(out,ensure_ascii=False))`, JD_XLSX]).toString());
const N = codes.length;   // every job in the books gets a description (108 in the real review files)
fresh(); const unit = ctx.all_('ORG_UNITS')[1].Org_Unit_ID, loc = ctx.all_('LOCATIONS')[0].Location_ID;
codes.forEach(([c, title], i) => {
  ctx.insert_('JOBS', { Job_Code: c, Job_Title_AR: title, Job_Title_EN: '', Job_Family: c.split('-')[0], Job_Level: '', Grade_Code: '', Current_JD_Version: '', Status: 'Active', Effective_From: '2026-01-01', Effective_To: '' }, 'x');
  ctx.insert_('POSITIONS', { Position_ID: 'POS-9' + String(i).padStart(5, '0'), Org_Version_ID: ctx.cfg_('ORG_VERSION_ACTIVE'), Job_Code: c, Position_Title: '', Org_Unit_ID: unit, Reports_To_Position_ID: '', Location_ID: loc,
    Is_Head_Of_Unit: 'N', Structural_HC: '1', HC_Basis: 'BASELINE_TEMP', Occupied_HC: '0', Occupied_Updated_At: '', Occupied_Updated_By: '', Status: 'Active', Effective_From: '2026-01-01', Effective_To: '' }, 'x');
});
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(XLSX_JS, 'utf8') }));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(() => go('jds')); await page.waitForSelector('tr[data-jd]');
  await page.click('#jdImp'); await page.waitForSelector('#jiLib');
  await page.setInputFiles('#jiLib', LIB_XLSX); await page.waitForSelector('#jiLibGo', { timeout: 15000 });
  const libTxt = await page.textContent('#jiLibOut'); if (!/\d+ كفاءة/.test(libTxt)) errors.push('lib preview: ' + libTxt);
  await page.click('#jiLibGo'); await page.waitForSelector('#jiLibOut .msg.ok');
  await page.setInputFiles('#jiJd', JD_XLSX.split(',')); await page.waitForSelector('#jiJdGo', { timeout: 20000 });
  const jdTxt = await page.textContent('#jiJdOut'); if (!new RegExp('\\b' + N + '\\b').test(jdTxt)) errors.push('jd preview: ' + jdTxt);
  await page.screenshot({ path: OUT + '/j-1-import.png', fullPage: true });
  await page.click('#jiJdGo'); await page.waitForSelector('#jiDone', { timeout: 20000 }); await page.click('#jiDone');
  await page.waitForSelector('#jdAll'); await page.screenshot({ path: OUT + '/j-2-list-drafts.png' });
  await page.click('#jdAll'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(800);
  fresh(); const appr = ctx.find_('JOB_DESCRIPTIONS', { Status: 'Approved' }).length; if (appr !== N) errors.push('approved ' + appr);
  const del = ctx.find_('JOB_DESCRIPTIONS', { Job_Code: 'SLS-009' })[0]; if (JSON.parse(del.Responsibilities).length !== 7) errors.push('resp count');
  await page.evaluate(() => go('jd', 'SLS-009')); await page.waitForSelector('.jdsec');
  await page.screenshot({ path: OUT + '/j-3-jd.png', fullPage: true });
  await page.click('[data-jtab="comps"]'); await page.waitForSelector('#jdBody table'); await page.screenshot({ path: OUT + '/j-4-comps.png' });
  await page.click('[data-jtab="kit"]'); await page.waitForSelector('.kitc'); await page.screenshot({ path: OUT + '/j-5-kit.png' });
  // pop-ups blocked → the print inside the page, as before
  await page.evaluate(() => { window.__open = window.open; window.open = () => null; window.print = () => { window.__p = (window.__p || 0) + 1; }; });
  await page.click('#kitPrint'); await page.waitForFunction(() => window.__p === 1);
  await page.evaluate(() => { window.open = window.__open; });
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/j-6-kit-print.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => go('jd', 'PRD-006')); await page.waitForSelector('.jdsec');
  await page.click('#jdEditB'); await page.waitForSelector('#jeResp');
  await page.click('#jeCFill'); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/j-7-edit.png', fullPage: true });
  // v0.42.1 (CHG-88): the count against the level's band; above it the reason is asked and kept
  await page.selectOption('#jeL', 'JL3');
  await page.fill('#jeResp', Array.from({ length: 12 }, (_, i) => 'مسؤولية رقم ' + (i + 1) + ' بنتيجتها').join('\n'));
  if (!/12 مسؤولية — أكتر من نطاق JL3 \(6–10\)/.test(await page.textContent('#jeRN')) || !(await page.isVisible('#jeRR'))) errors.push('band warning and the reason field: ' + await page.textContent('#jeRN'));
  // v0.42.2 (CHG-89): the weights' total in sight; not 100 → the server refuses
  await page.click('#jeKAdd'); await page.click('#jeKAdd');
  const kn = await page.$$eval('#jeK select[data-k]', x => x.length);
  await page.fill('[data-k="' + (kn - 2) + '.0"]', 'نسبة الإنتاج المطابق'); await page.fill('[data-k="' + (kn - 2) + '.4"]', '60');
  await page.fill('[data-k="' + (kn - 1) + '.0"]', 'زمن الدورة'); await page.fill('[data-k="' + (kn - 1) + '.4"]', '30');
  for (let i = 0; i < kn - 2; i++) await page.selectOption('[data-k="' + i + '.3"]', 'M');
  if (!/مجموع الأوزان 90 — لازم 100/.test(await page.textContent('#jeKS'))) errors.push('weights total shown: ' + await page.textContent('#jeKS'));
  await page.fill('[data-k="' + (kn - 1) + '.4"]', '40');
  if (!/مجموع الأوزان 100 ✓/.test(await page.textContent('#jeKS'))) errors.push('weights total 100: ' + await page.textContent('#jeKS'));
  // the import refuses a KPI sheet without «النوع» / «الوزن» by name
  const refused = await page.evaluate(() => { window.XLSX = { utils: { sheet_to_json: s => s } };
    const wb = { SheetNames: ['الأوصاف', 'مؤشرات الأداء'], Sheets: { 'الأوصاف': [['كود الوظيفة', 'الوظيفة', 'الغرض من الوظيفة'], ['X-1', 'س', 'غرض']], 'مؤشرات الأداء': [['كود الوظيفة', 'الوظيفة', 'المؤشر', 'المعادلة', 'التكرار', 'الوزن %'], ['X-1', 'س', 'م', 'ع', 'شهري', '100']] } };
    try { parseJdBook(wb); return ''; } catch (e) { return e.error || String(e); } });
  if (!/«النوع».*«الوزن»/.test(refused)) errors.push('import without the two columns refused: ' + refused);
  await page.fill('#jeWhy', 'تجربة تعديل'); await page.fill('#jeRR', ''); await page.click('#jeSave');
  await page.waitForFunction(() => /سبب الزيادة/.test(document.getElementById('jeMsg').textContent), null, { timeout: 8000 }).catch(() => errors.push('saving above the band without a reason refused'));
  await page.fill('#jeRR', 'الوظيفة بتغطي خطين إنتاج في نفس الوردية'); await page.click('#jeSave'); await page.waitForSelector('.jdsec');
  if (!/سبب زيادة العدد عن نطاق المستوى: الوظيفة بتغطي خطين/.test(await page.textContent('#main'))) errors.push('the reason shown on the JD');
  fresh(); const v2 = ctx.find_('JOB_DESCRIPTIONS', { Job_Code: 'PRD-006', Status: 'Draft' })[0]; if (!v2 || v2.Version !== '2' || JSON.parse(v2.Responsibilities).length !== 12 || !v2.Resp_Reason || JSON.parse(v2.KPIs).filter(k => k[3] === 'W').map(k => k[4]).join() !== '60,40') errors.push('edit v2 with 12 responsibilities, the reason and the weights');
  // v0.43.0 (CHG-90): the worker card — one page, safety first, the receipt. v0.43.1: printed from a window of its own,
  // whose title names the PDF (inside Apps Script the page's own title never reaches the browser's «Save as PDF»)
  let pop = page.waitForEvent('popup', { timeout: 8000 });
  await page.click('#jdCardB'); let pw = await pop; await pw.waitForSelector('#printArea .wc', { timeout: 8000 });
  const wc = { t: await pw.title(), h: await pw.textContent('#printArea') };
  if (!(await pw.isVisible('#printArea'))) errors.push('the print window shows the card');
  if (!/^PRD-006 .+ — بطاقة العامل v2 \(مسودة\)$/.test(wc.t) || !/السلامة أولاً/.test(wc.h) || !/هدف شغلك/.test(wc.h) || !/استلام البطاقة/.test(wc.h) || /طريقة الحساب/.test(wc.h)) errors.push('worker card: ' + wc.t);
  await pw.close();
  pop = page.waitForEvent('popup', { timeout: 8000 });
  await page.click('#jdPrintB'); pw = await pop; await pw.waitForSelector('#printArea .pr', { timeout: 8000 });
  const pt = await pw.title(); await pw.close();
  if (!/^PRD-006 .+ — الوصف الوظيفي v2 \(مسودة\)$/.test(pt)) errors.push('print window title = the PDF name: ' + pt);
  if (await page.title() === pt) errors.push('the portal page keeps its own title');
  // the in-page fallback still names the print and restores the title
  await page.evaluate(() => { window.open = () => null; window.print = () => { window.__p = (window.__p || 0) + 1; window.__pt = document.title; }; window.__p = 1; });
  await page.click('#jdPrintB'); await page.waitForFunction(() => window.__p === 2);
  const pt2 = await page.evaluate(() => window.__pt);
  if (pt2 !== pt) errors.push('fallback print title: ' + pt2);
  await page.waitForFunction(t => document.title !== t, pt2, { timeout: 4000 }).catch(() => errors.push('page title restored after printing'));
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/j-8-jd-print.png', fullPage: true });
  await browser.close(); console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
