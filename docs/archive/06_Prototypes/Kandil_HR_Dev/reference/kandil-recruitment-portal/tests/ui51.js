// v0.47.0 (CHG-101) UI: «بيانات العقد» on the joining card, and the fixed-term contract printed in the portal's print theme on
// exactly two A4 pages (the print window saved as PDF, its pages counted); v0.48.0 (CHG-102): the salary details on one page.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const T = '\t';
ctx.__keepNet = true;
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const user = (email, name, roles) => { const u = api('users.save', tO, { Email: email, Full_Name_AR: name }).User_ID; api('users.setRoles', tO, { User_ID: u, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u; };
const rec = user('rec@t.com', 'سارة', ['RECRUITER']), hr = user('hr@t.com', 'منى', ['HR_MANAGER']), rm = user('rm@t.com', 'مدير التوظيف', ['RECRUITMENT_MANAGER']);
const tR = login('rec@t.com'), tH = login('hr@t.com'), tM = login('rm@t.com');
const JOB = P['محاسب تكاليف'].Job_Code, today = ctx.today_();
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x');
api('pay.structures', tO, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' });
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] });
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
api('vac.assign', tM, { Vacancy_ID: V.Vacancy_ID, Lead_Recruiter_ID: rec }); api('vac.update', tM, { Vacancy_ID: V.Vacancy_ID, action: 'OPEN' });
const A = api('cand.create', tR, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'كريم عادل منصور', Mobile: '01011112222', Gender: 'M', Source: 'WALK_IN', consent: 'Y' }).application.Application_ID;
api('cand.move', tR, { Application_ID: A, to: 'SHORTLISTED' });
const iv = api('int.create', tR, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: rec, Role: 'LEAD' }] }).interview;
api('int.action', tR, { Interview_ID: iv.Interview_ID, action: 'START' });
api('sel.save', tR, { Application_ID: A, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' });
let O = api('offer.save', tR, { Application_ID: A, Contract_Basis: 'GROSS', Agreed_Amount: '9000', Joining_Date: '2099-02-01' }).offer;
fresh(); ctx.update_('OFFERS', O.Offer_ID, { Status: 'ACCEPTED' }, 'x');
fresh(); ctx.withLock_(() => ctx.joiningCreate_(rec, ctx.get_('APPLICATIONS', A), ctx.get_('OFFERS', O.Offer_ID)));
fresh(); ctx.update_('APPLICATIONS', A, { Stage: 'ACCEPTED' }, 'x');
fresh(); ctx.update_('RECRUITMENT_REQUESTS', V.Request_ID, { Employment_Type: 'CONTRACT' }, 'x'); ctx.update_('CONFIG', 'PAY_DAY', { Config_Value: '5' }, 'x');
const JID = ctx.findOne_('JOININGS', { Application_ID: A }).Joining_ID; ctx.__nidForJoining(JID);
api('privacy.entity', tO, { Name_AR: 'شركة قنديل للنجف', Commercial_Reg: '12345', Tax_ID: '987-654-321', Address: 'العبور — المنطقة الصناعية الأولى — القليوبية',
  Signatory_Name: 'محمد عمارة', Signatory_Title: 'مدير قطاع الموارد البشرية', units: ctx.all_('ORG_UNITS').map(u => u.Org_Unit_ID) });

const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctxB.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tR) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(() => { const o = window.open; window.open = function () { const w = o.apply(window, arguments); try { w.print = function () {}; Object.defineProperty(w, 'onafterprint', { set: function () {}, get: function () { return null; } }); } catch (e) {} return w; }; });
  await page.evaluate(id => go('app', id), A);
  await page.waitForSelector('#joinCard [data-ja="CDATA"]', { timeout: 8000 }).catch(() => errors.push('«بيانات العقد» on the joining card'));
  if (!/1 ناقص/.test(await page.textContent('#joinCard [data-ja="CDATA"]').catch(() => ''))) errors.push('the button counts what is missing (the address)');
  // printing before the address: refused with what is missing
  await page.click('#joinCard [data-ja="CONTRACT"]'); await page.waitForTimeout(800);
  if (!/محل إقامة/.test(await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || ''))) errors.push('printing refused, naming the residence address');
  for (const p of ctxB.pages()) if (p !== page) await p.close();
  // the dialog
  await page.click('#joinCard [data-ja="CDATA"]'); await page.waitForSelector('#cdA');
  if (!(await page.$('#cdM')) || (await page.inputValue('#cdM')) !== '12') errors.push('a fixed-term contract asks for its months (12 by default)');
  await page.fill('#cdA', '12 شارع النصر — الحي السابع — مدينة نصر — القاهرة'); await page.fill('#cdM', '12');
  await page.click('#mActions button:first-child');
  await page.waitForFunction(() => !/ناقص/.test((document.querySelector('#joinCard [data-ja="CDATA"]') || {}).textContent || 'x'), null, { timeout: 8000 }).catch(() => errors.push('nothing missing after saving'));
  // print: the portal's print theme, two A4 pages
  const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await page.click('#joinCard [data-ja="CONTRACT"]');
  const w = await pop;
  if (!w) errors.push('the contract window opens');
  else {
    await w.waitForFunction(() => /عقد عمل فردي محدد المدة/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => errors.push('the fixed-term contract in the window'));
    if (!(await w.$('#printArea .pr .pr-head .pr-co')) || !(await w.$('#printArea .pr-foot'))) errors.push('the print theme: head and foot of every printed form');
    const f = path.join(require('os').tmpdir(), 'ui51-contract.pdf');
    await w.pdf({ path: f, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pages = Number(require('child_process').execFileSync('python3', ['-I', '-c', 'import sys\nfrom pypdf import PdfReader\nprint(len(PdfReader(sys.argv[1]).pages))', f]).toString().trim());
    if (pages !== 2) errors.push('the contract prints on two A4 pages: ' + pages);
    if (process.env.SHOTS) fs.copyFileSync(f, path.join(process.env.SHOTS, 'ui51-contract.pdf'));
  }
  // v0.48.0 (CHG-103): the payroll notice for missing documents follows up — it never stops pay
  fresh(); ctx.update_('JOININGS', JID, { Status: 'JOINED', Joined_Date: ctx.today_() }, 'x');
  { const d0 = ctx.find_('CANDIDATE_DOCS', { Joining_ID: JID }).filter(d => d.Required === 'Y')[0];
    ctx.update_('CANDIDATE_DOCS', d0.Doc_ID, { Status: 'MISSING', Deferred: 'Y', Due_Date: ctx.addDaysYmd_(ctx.today_(), -1) }, 'x'); }
  await page.evaluate(id => go('app', id), A); await page.waitForSelector('#joinCard [data-ja="STOP"]', { timeout: 8000 }).catch(() => errors.push('the payroll notice button'));
  const jc = await page.textContent('#joinCard');
  if (!/للمتابعة بس: الأجر المستحق بيتصرف في ميعاده/.test(jc) || /إيقاف/.test(jc)) errors.push('the hint: follow-up only, pay on time, no «stop»');
  if (!/سجّل إخطار المرتبات \(متابعة\)/.test(await page.textContent('#joinCard [data-ja="STOP"]'))) errors.push('the button says «متابعة»');
  await page.click('#joinCard [data-ja="STOP"]'); await page.waitForSelector('#jpN');
  if (!/بدون إيقاف صرف/.test(await page.textContent('.overlay .modal')) || !/م36 من قرار وزير العمل 162/.test(await page.textContent('.overlay .modal'))) errors.push('the dialog: no stop of pay, art. 36');
  await page.fill('#jpN', 'اتبلغ أ. محمود'); await page.click('#mActions button:first-child');
  await page.waitForFunction(() => /إخطار مسوغات ناقصة/.test((document.querySelector('#joinCard') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => errors.push('the log line «إخطار مسوغات ناقصة»'));
  if (/إخطار إيقاف/.test(await page.textContent('#joinCard'))) errors.push('no «إخطار إيقاف» in the log');
  // v0.48.0 (CHG-102): the salary details — only for pay roles, one A4 page in the same theme
  if (await page.$('#joinCard [data-ja="PAYD"]')) errors.push('the recruiter has no «مفردات الراتب» button');
  const p2 = await ctxB.newPage(); p2.on('pageerror', e => errors.push(e.message));
  await p2.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await p2.waitForSelector('.shell');
  await p2.evaluate(() => { const o = window.open; window.open = function () { const w = o.apply(window, arguments); try { w.print = function () {}; Object.defineProperty(w, 'onafterprint', { set: function () {}, get: function () { return null; } }); } catch (e) {} return w; }; });
  await p2.evaluate(id => go('app', id), A);
  await p2.waitForSelector('#joinCard [data-ja="PAYD"]', { timeout: 8000 }).catch(() => errors.push('the owner gets «مفردات الراتب»'));
  const pop2 = p2.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await p2.click('#joinCard [data-ja="PAYD"]').catch(() => {});
  const w2 = await pop2;
  if (!w2) errors.push('the salary details window opens');
  else {
    await w2.waitForFunction(() => /مفردات الراتب عند بداية التعيين/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => errors.push('the salary details in the window'));
    if (!(await w2.$('#printArea .pr .pr-head')) || !/نسخة الشركة فقط — سري/.test(await w2.textContent('body'))) errors.push('theme head and the confidential mark');
    const f2 = path.join(require('os').tmpdir(), 'ui51-pay.pdf');
    await w2.pdf({ path: f2, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const n2 = Number(require('child_process').execFileSync('python3', ['-I', '-c', 'import sys\nfrom pypdf import PdfReader\nprint(len(PdfReader(sys.argv[1]).pages))', f2]).toString().trim());
    if (n2 !== 1) errors.push('the salary details fit one A4 page: ' + n2);
    if (process.env.SHOTS) fs.copyFileSync(f2, path.join(process.env.SHOTS, 'ui51-pay.pdf'));
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ui51 OK');
  if (errors.length) process.exit(1);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
