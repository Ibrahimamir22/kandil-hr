// v0.46.2 (CHG-100) UI: the no-insurance acknowledgement — printed from the joining card, uploaded on the documents list
// only (the offer card prints it and points there; no upload on the offer). Setup from ui41.
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
let O = api('offer.save', tR, { Application_ID: A, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01', No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' }).offer;
fresh(); ctx.update_('OFFERS', O.Offer_ID, { Status: 'ACCEPTED' }, 'x');
fresh(); ctx.withLock_(() => ctx.joiningCreate_(rec, ctx.get_('APPLICATIONS', A), ctx.get_('OFFERS', O.Offer_ID)));
fresh(); ctx.update_('APPLICATIONS', A, { Stage: 'ACCEPTED' }, 'x');

const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tR) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(id => go('app', id), A); await page.waitForSelector('#joinCard [data-ja="NOINS"]', { timeout: 8000 }).catch(() => errors.push('the joining card prints the acknowledgement'));
  // the documents list carries it, first
  const rows = await page.$$eval('#joinCard table.dt tbody tr td:first-child b', b => b.map(x => x.textContent));
  if (!/من غير تأمينات/.test(rows[0] || '')) errors.push('the acknowledgement on the documents list: ' + rows.slice(0, 3).join(' | '));
  // the offer card prints it and points to the documents — no upload there
  if (await page.$('#offCard [data-niu]')) errors.push('no upload on the offer card any more');
  if (await page.$('#offCard [data-nip]') && !/بيترفع في مسوغات التعيين/.test(await page.textContent('#offCard'))) errors.push('the offer card points to the documents');
  // print from the joining card: its own window with the legal basis
  const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await page.click('#joinCard [data-ja="NOINS"]');
  const w = await pop;
  if (!w) errors.push('the print window opens');
  else { await w.waitForFunction(() => /صاحب معاش/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => errors.push('the form names the legal basis')); await w.close(); }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ui50 OK');
  if (errors.length) process.exit(1);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
