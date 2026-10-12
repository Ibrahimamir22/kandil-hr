// v0.14.0 UI (5B): joining card, document dialog (upload / review / paper / defer), candidate upload page, joinings list,
// document types, no-insurance checkbox; English + phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID); user('sec@t.com', 'مدير قطاع HR', '', ['HR_SECTOR_MANAGER']); user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']);
const t = { sec: login('sec@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), mgr: login('mgr@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للواجهة', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] });
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' });
function cand(name, mobile, extra) { const a = api('cand.create', t.rec, Object.assign({ Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Source: 'WALK_IN', consent: 'Y' }, extra || {})).application.Application_ID; api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }); return a; }
const A1 = cand('أحمد علي حسن', '01011112222', { Current_Salary: '5500', Expected_Salary: '9000' }), A2 = cand('كريم محمود سالم', '01033334444');
fresh(); const today = ctx.today_();
for (const A of [A1, A2]) { const iv = api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: rec, Role: 'LEAD' }] }).interview; api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }); }

const shim0 = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'الرئيس التنفيذي', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'مدير قطاع HR', 'قنديل مصر', 'أحمد', 'كريم', 'العبور', 'القطاع المالي', 'الحسابات', 'شاغر',
  'خبرة', 'وقّع', 'الخطاب', 'فترة اختبار', 'المدير وافق', 'signed', 'تكاليف', 'هيكل', 'محاسب', 'سرعة'];


// accepted offer for A1 through the API
api('pay.structures', t.sec, { rows: [{ grade: '7', min: '6000', mid: '8000', max: '10000' }], reason: 'هيكل 2026' });
api('sel.save', t.rec, { Application_ID: A1, Decision: 'SELECTED', Reason: 'خبرة تكاليف', Override_Reason: 'المدير وافق بعد المقابلة', confirmOver: 'Y' });
let O = api('offer.save', t.rec, { Application_ID: A1, Contract_Basis: 'GROSS', Agreed_Amount: '6000', Joining_Date: '2099-02-01' }).offer;
O = api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'SUBMIT' }).offer;
if (O.Status !== 'APPROVED') O = api('offer.action', t.rm, { Offer_ID: O.Offer_ID, action: 'APPROVE' }).offer;
api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'PRINT' });
api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: 'وقّع على الخطاب' });
const docsHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'Docs.html'), 'utf8').replace('<script>', shim0 + '<script>');
DATA.push('شهادة', 'صور', 'فيش', 'كعب', 'بطاقة', 'نموذج', 'كارنيه', 'تصريح', 'مزاولة', 'قياس', 'برنت', 'الموقف', 'المؤهل', 'birth', 'ID', 'ماجستير');

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0140-' + n + '.png', fullPage: true });
  const main = async () => (await page.textContent('#main')) || '';

  await open(t.rec);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#joinCard');
  const jc = await page.textContent('#joinCard');
  if (!/2099-02-01/.test(jc) || !/شهادة الميلاد/.test(jc)) errors.push('joining card: date + documents');
  if (!(await page.$('[data-ja="RECEIPT"][disabled]'))) errors.push('receipt button must be disabled until complete');
  await shot('1-card'); await (await page.$('#joinCard')).screenshot({ path: OUT + '/v0140-1b-joincard.png' });
  // HR uploads + reviews the birth certificate
  fresh(); const birth = ctx.find_('CANDIDATE_DOCS', { Application_ID: A1, Doc_Code: 'BIRTH' })[0];
  await page.click('[data-jd="' + birth.Doc_ID + '"]'); await page.waitForSelector('#ddF');
  await page.setInputFiles('#ddF', { name: 'birth.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await shot('2-doc-dialog');
  await page.check('#ddPC'); await page.click('#ddU'); await page.waitForFunction(() => /مستني المراجعة/.test(((document.getElementById('joinCard')||{}).textContent||'')));
  await page.click('[data-jd="' + birth.Doc_ID + '"]'); await page.waitForSelector('#ddV'); await shot('3-review');
  await page.click('#ddV'); await page.waitForFunction(() => !document.getElementById('ddV'));
  await page.click('[data-jd="' + birth.Doc_ID + '"]'); await page.waitForSelector('#ddP'); await page.click('#ddP'); await page.waitForTimeout(500);
  fresh(); const b2 = ctx.get_('CANDIDATE_DOCS', birth.Doc_ID); if (b2.Status !== 'VERIFIED' || b2.Physical !== 'RECEIVED') errors.push('birth not verified + received: ' + b2.Status + ' ' + b2.Physical);
  // date + confirm
  await page.click('[data-ja="DATE"]'); await page.fill('#jdD', '2099-02-08'); await page.fill('#jdR', 'بيخلّص فترة الإخطار'); await page.click('#mActions .btn.primary');
  await page.waitForFunction(() => /2099-02-08/.test(((document.getElementById('joinCard')||{}).textContent||'')));
  // link
  await page.click('[data-ja="LINK"]'); await page.waitForSelector('#jlT'); const link = await page.inputValue('#jlT'); await shot('4-link');
  const token = /docs=([A-Za-z0-9]+)/.exec(link)[1];
  // --- candidate upload page
  fresh(); ctx.find_('JOININGS', { Application_ID: A1 }).forEach(j => ctx.update_('JOININGS', j.Joining_ID, { Docs_Consent_At: '' }, 'x'));   // show the consent step on the link page
  const cp = await browser.newPage({ viewport: { width: 390, height: 844 } }); cp.on('pageerror', e => errors.push('docs page: ' + e.message));
  await cp.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await cp.setContent(docsHtml.replace("'<?= token ?>'", JSON.stringify(token))); await cp.waitForSelector('#agreeBtn');
  await cp.screenshot({ path: OUT + '/v0141-docs-consent.png', fullPage: true });
  await cp.click('#agreeBtn'); await cp.waitForTimeout(200); if (!/علّم/.test(await cp.textContent('body'))) errors.push('docs consent must be ticked');
  await cp.check('#agree'); await cp.click('#agreeBtn'); await cp.waitForSelector('input[data-code="QUALIFICATION"]', { state: 'attached' });
  await cp.screenshot({ path: OUT + '/v0140-5-candidate-page.png', fullPage: true });
  await cp.setInputFiles('input[data-code="QUALIFICATION"]', { name: 'q.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 q') });
  await cp.waitForFunction(() => /اترفع — شكراً/.test(document.body.textContent), null, { timeout: 8000 });
  await cp.screenshot({ path: OUT + '/v0140-6-candidate-uploaded.png', fullPage: true });
  fresh(); if (ctx.find_('CANDIDATE_DOCS', { Application_ID: A1, Doc_Code: 'QUALIFICATION' })[0].Status !== 'UPLOADED') errors.push('candidate upload not saved');
  if (await cp.evaluate(() => document.documentElement.scrollWidth) > 392) errors.push('candidate page overflow');
  await cp.click('[data-l="en"]'); await cp.waitForTimeout(200); if (!/Hiring documents/.test(await cp.textContent('body'))) errors.push('candidate page English');
  await cp.screenshot({ path: OUT + '/v0140-7-candidate-en.png', fullPage: true });
  await cp.setContent(docsHtml.replace("'<?= token ?>'", JSON.stringify('x'.repeat(30)))); await cp.waitForTimeout(500);
  if (!/اللينك/.test(await cp.textContent('body'))) errors.push('bad link message'); await cp.close();
  // home + joinings list
  await page.evaluate(() => refreshTodo().then(function(){ go('home'); })); await page.waitForTimeout(800);
  if (!/مستند تعيين مستني المراجعة/.test(await main())) errors.push('home: review row');
  await page.evaluate(() => go('joinings', 'review')); await page.waitForSelector('#jnBody table'); await shot('8-list-review');
  await page.evaluate(() => go('joinings', 'upcoming')); await page.waitForSelector('#jnBody table'); await shot('9-list');
  await page.evaluate(() => go('joinings', 'types')); await page.waitForSelector('#jnBody table'); await shot('10-types');
  // JOINED dialog (recruiter: blocked server-side, message shown)
  fresh(); ctx.__nidForJoining(ctx.all_('JOININGS').find(j => j.Application_ID === A1).Joining_ID);   // v0.34: a National ID first
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('[data-ja="JOINED"]');
  await page.click('[data-ja="JOINED"]'); await page.waitForSelector('#jjD'); await shot('11-joined-dialog');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  if (!/ناقصة/.test(await page.textContent('#mMsg'))) errors.push('joined with missing docs must be refused for the recruiter');
  // --- manager: defer + types editing (HR sector)
  await open(t.rm);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#joinCard');
  fresh(); const fish = ctx.find_('CANDIDATE_DOCS', { Application_ID: A1, Doc_Code: 'CRIMINAL' })[0];
  await page.click('[data-jd="' + fish.Doc_ID + '"]'); await page.waitForSelector('#ddDF'); await shot('12-defer');
  await page.fill('#ddDD', '2099-02-20'); await page.fill('#ddDR', 'الفيش بيطلع بعد أسبوعين'); await page.click('#ddDF'); await page.waitForTimeout(500);
  fresh(); if (ctx.get_('CANDIDATE_DOCS', fish.Doc_ID).Deferred !== 'Y') errors.push('defer not saved');
  await open(t.sec);
  await page.evaluate(() => go('joinings', 'types')); await page.waitForSelector('[data-dte="SYNDICATE"]');
  await page.click('[data-dte="SYNDICATE"]'); await page.fill('#dtV', JOB); await shot('13-type-edit'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  fresh(); if (ctx.get_('DOC_TYPES', 'SYNDICATE').Scope_Value !== JOB) errors.push('doc type not saved');
  // no-insurance checkbox in the offer editor
  api('sel.save', t.rec, { Application_ID: A2, Decision: 'SELECTED', Reason: 'التاني', Override_Reason: 'المدير وافق', confirmOver: 'Y' });
  await open(t.rec);
  await page.evaluate(id => go('app', id), A2); await page.waitForSelector('#ofNew'); await page.click('#ofNew'); await page.waitForSelector('#ofA');
  await page.fill('#ofA', '7000'); await page.waitForFunction(() => /الصافي/.test(document.getElementById('ofCalc').textContent), null, { timeout: 8000 });
  await page.check('#ofNI'); await page.waitForFunction(() => /الرئيس التنفيذي/.test(document.getElementById('ofCalc').textContent), null, { timeout: 8000 });
  await shot('14-no-insurance');

  // --- English
  api('me.setLang', tO, { lang: 'en' });
  await open(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function leftovers(name) {
    const found = await page.evaluate(() => {
      const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]')) continue;
        if (p.closest('.hidden') || p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim().replace(/\s+/g, ' ')); }
      return [...out];
    });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0140-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#joinCard'); await page.waitForTimeout(300); await leftovers('app');
  await page.click('[data-jd="' + fish.Doc_ID + '"]'); await page.waitForSelector('#ddDF, #ddUD'); await page.waitForTimeout(200); await leftovers('doc-dialog'); await page.evaluate(() => closeModal());
  for (const tb of ['upcoming', 'review', 'deferred', 'payroll', 'types']) { await page.evaluate(x => go('joinings', x), tb); await page.waitForSelector('#jnBody table, #jnBody .msg'); await page.waitForTimeout(300); await leftovers('join-' + tb); }
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['app', 'app', A1], ['joinings', 'joinings', 'upcoming'], ['types', 'joinings', 'types']]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(700);
    await ph.screenshot({ path: OUT + '/v0140-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await ph.evaluate(id => go('app', id), A1); await ph.waitForSelector('[data-jd]'); await ph.click('[data-jd]'); await ph.waitForTimeout(400);
  await ph.screenshot({ path: OUT + '/v0140-phone-doc.png', fullPage: true });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui18 OK');
})().catch(e => { console.error(e); process.exit(1); });
