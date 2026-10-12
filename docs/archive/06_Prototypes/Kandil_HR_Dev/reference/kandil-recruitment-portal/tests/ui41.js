// v0.40.0 UI: the payroll net review (offer card warning, «waiting for me» button), the employment contract on the joining
// card, a document's state and the «suspect» button, a hiring restriction without «permanent» and its appeal.
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
let O = api('offer.save', tR, { Application_ID: A, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01' }).offer;
O = api('offer.action', tR, { Offer_ID: O.Offer_ID, action: 'SUBMIT' }).offer;

const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0400-' + n + '.png', fullPage: true });
  // ---- the recruiter: the offer waits for the payroll review
  await openTok(tR);
  await page.evaluate(id => go('app', id), A); await page.waitForSelector('#offCard');
  let card = await page.textContent('#offCard');
  if (!/مستني مراجعة المرتبات/.test(card)) errors.push('net review warning on the offer card');
  if (await page.$('#offCard [data-oa="PRESENT"]')) errors.push('no «present» before the net review');
  await shot('1-offer-waits');
  // ---- the HR manager: «waiting for me» → review the net
  await openTok(tH);
  await page.evaluate(() => go('offers', 'approve')); await page.waitForSelector('[data-onet]');
  await shot('2-net-review-list');
  await page.click('[data-onet]'); await page.waitForSelector('#oaN');
  await page.fill('#oaN', 'مطابق لحسبة أكتوبر');
  await page.click('#mActions button:first-child');
  await page.waitForFunction(() => !document.querySelector('[data-onet]'), null, { timeout: 8000 }).catch(() => errors.push('list refreshed after the review'));
  fresh(); if (ctx.get_('OFFERS', O.Offer_ID).Net_Reviewed_By !== hr) errors.push('net reviewed from the list');
  // ---- the recruiter presents, the candidate accepts → the joining card: the contract and a document's state
  api('offer.action', tR, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' });
  api('offer.action', tR, { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: 'وقّع على النسخة المطبوعة' });
  await openTok(tR);
  await page.evaluate(id => go('app', id), A); await page.waitForSelector('#joinCard [data-ja="CONTRACT"]');
  if (!/ارفع العقد الموقّع/.test(await page.textContent('#joinCard'))) errors.push('upload the signed contract');
  const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await page.click('#joinCard [data-ja="CONTRACT"]');
  const w = await pop;
  if (w) { await w.waitForLoadState().catch(() => {}); if (!/عقد عمل/.test(await w.content())) errors.push('contract window'); await w.close(); } else errors.push('contract window opened');
  await shot('3-joining-contract');
  fresh(); const J = ctx.findOne_('JOININGS', { Application_ID: A }), birth = ctx.findOne_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID, Doc_Code: 'BIRTH' });
  api('doc.action', tR, { Doc_ID: birth.Doc_ID, action: 'UPLOAD', paperConsent: 'Y', file: { name: 'b.png', mime: 'image/png', data: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2]).toString('base64') } });
  await page.evaluate(id => go('app', id), A); await page.waitForSelector('#joinCard');
  await page.click('#joinCard [data-jd="' + birth.Doc_ID + '"]');
  await page.waitForSelector('#ddState', { timeout: 8000 }).catch(() => errors.push('document dialog with its state'));
  if (await page.$('#ddState') && !/اترفع/.test(await page.textContent('#ddState'))) errors.push('state «uploaded»: ' + await page.textContent('#ddState'));
  if (!(await page.$('#ddS'))) errors.push('«suspect» button');
  await page.fill('#ddN', 'الختم مش واضح والتاريخ متعدّل'); await page.click('#ddS');
  await page.waitForFunction(() => !document.querySelector('#ddS'), null, { timeout: 8000 }).catch(() => {});
  fresh(); if (ctx.get_('CANDIDATE_DOCS', birth.Doc_ID).Status !== 'SUSPECT') errors.push('suspected from the dialog');
  await shot('4-doc-suspect');
  // ---- restrictions: no «permanent», the appeal
  await openTok(tH);
  await page.evaluate(() => go('restrict')); await page.waitForSelector('#rsNew');
  await page.click('#rsNew'); await page.waitForSelector('#rsD');
  if (await page.$('#rsP')) errors.push('no «permanent» checkbox any more');
  if (!/مفيش قيد دائم/.test(await page.textContent('#mBody'))) errors.push('the 2-year review hint');
  await page.evaluate(() => closeModal());
  fresh(); const per = ctx.get_('APPLICATIONS', A).Person_ID;
  api('restrict.add', tH, { Person_ID: per, Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024 بعد إنذارين', Review_Date: ctx.addDaysYmd_(today, 300) });
  await openTok(tH); await page.evaluate(() => go('restrict')); await page.waitForSelector('[data-appeal]');   // a fresh page: the screen memory held the empty list
  await page.click('[data-appeal]'); await page.waitForSelector('#apN');
  await page.fill('#apN', 'كان في إجازة مرضية بشهادة معتمدة وقت الغياب');
  await page.click('#mActions button:first-child');
  await page.waitForFunction(() => /تظلم مستني القرار/.test(document.body.textContent), null, { timeout: 8000 }).catch(() => errors.push('appeal shown as waiting'));
  fresh(); if (!ctx.findOne_('HIRING_RESTRICTIONS', { Person_ID: per }).Appeal_At) errors.push('appeal saved from the page');
  await shot('5-restriction-appeal');
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui41 OK');
})().catch(e => { console.log(e); process.exit(1); });
