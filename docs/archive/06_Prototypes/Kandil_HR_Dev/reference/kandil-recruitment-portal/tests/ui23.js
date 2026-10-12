// v0.17.0 UI: onboarding — my tasks, program page (tasks, acknowledgement, buddy, extra task, close), templates, employee file, print; English + phone.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), ceo: login('ceo@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 4 }] }), 'request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
const today = ctx.today_();
const sec = login('owner@test.com');
must(api('pay.structures', sec, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' }), 'structure');
function hire(name, mobile, gender, extra) {
  const A = must(api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Gender: gender, Source: 'WALK_IN', consent: 'Y' }), 'cand').application.Application_ID;
  must(api('cand.move', t.rec, { Application_ID: A, to: 'SHORTLISTED' }), 'shortlist');
  const iv = must(api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'iv').interview;
  must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }), 'start');
  must(api('sel.save', t.rec, { Application_ID: A, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' }), 'select');
  let O = must(api('offer.save', t.rec, Object.assign({ Application_ID: A, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01' }, extra || {})), 'offer').offer;
  return { A, O };
}
function accept(O, tok) {
  O = must(api('offer.action', tok || t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' }), 'present').offer;
  return must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: 'وقّع على النسخة المطبوعة' }), 'accept').offer;
}

// =============== document types ===============
let DT = must(api('doctype.list', t.rec, {}), 'doc types');
ok(DT.rows.length === 14 && DT.rows.some(r => r.Doc_Code === 'NO_INS_ACK') && !DT.canEdit && DT.rows.find(r => r.Doc_Code === 'MILITARY').Scope === 'MALE' && DT.rows.find(r => r.Doc_Code === 'NATIONAL_ID').Deferrable === 'N', '12 hiring documents seeded (military for males, ID not deferrable)');
ok(['WORK_STUB', 'INS_PRINT', 'MEDICAL_111', 'PRACTICE_PERMIT', 'SKILL_CERT'].every(c => DT.rows.find(r => r.Doc_Code === c).Insured_Only === 'Y'), 'insured-only documents marked');
bad(api('doctype.save', t.rec, { Doc_Code: 'X', Name_AR: 'تجربة', Keep: 'COPY', Scope: 'ALL' }), null, 'recruiters cannot edit document types');
must(api('doctype.save', t.hr, { Doc_Code: 'SYNDICATE', Name_AR: 'كارنيه النقابة', Keep: 'COPY', Copies: 1, Digital: 'Y', Scope: 'JOBS', Scope_Value: JOB, Insured_Only: 'N', Deferrable: 'Y', Max_Defer_Days: 30, Has_Expiry: 'Y', Sort_Order: 100 }), 'syndicate → cost accountant');

// =============== accepted offer → joining record ===============
const H1 = hire('أحمد علي حسن', '01011112222', 'M');
const O1 = must(api('offer.action', t.rec, { Offer_ID: H1.O.Offer_ID, action: 'SUBMIT' }), 'submit').offer;
ok(O1.Status === 'APPROVED', 'within recruiter limit');
accept(O1);
let AP = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app');
let J = AP.joining;
ok(J && J.Status === 'PENDING' && J.Planned_Date === '2099-02-01', 'joining opened with the offer date');
const codes = J.docs.map(d => d.Doc_Code);
ok(codes.length === 11 && codes.includes('CRIMINAL_CONSENT') && codes.includes('MILITARY') && codes.includes('SYNDICATE') && !codes.includes('PRACTICE_PERMIT') && !codes.includes('SKILL_CERT'), 'list by scope: male + listed job, no blue-collar docs (office job): ' + codes.join(','));
ok(J.docs.every(d => d.Required === 'Y') && !J.summary.cleared && J.summary.required === 11, 'all required for an insured contract');
const AM = must(api('cand.app', t.mgr, { Application_ID: H1.A }), 'manager app');
ok(AM.joining && AM.joining.Planned_Date === '2099-02-01' && !AM.joining.docs, 'hiring manager sees the date only, not the documents');
const OUT = process.env.SHOTS || '.';
fresh(); const LOC = P['محاسب تكاليف'].Location_ID, L0 = ctx.get_('LOCATIONS', LOC);
const site = user('site@t.com', 'هبة أخصائي HR', '', ['HR_STAFF']);
must(api('locations.save', t.hr, { Location_ID: LOC, Name_AR: L0.Name_AR, Location_Type: 'FACTORY', Status: 'Active', HR_Site_User_ID: site }), 'site');
fresh(); ctx.update_('POSITIONS', P['محاسب تكاليف'].Position_ID, { Reports_To_Position_ID: P['مدير الحسابات'].Position_ID }, 'x');
const H = hire('كريم محمود سالم', '01033334444', 'M');
accept(must(api('offer.action', t.rec, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT' }), 'submit').offer);
const JJ = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'DATE', date: today, reason: 'تأكيد الميعاد' }), 'date');
const ONB = must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm').onboarding;
fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: JJ.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'VERIFIED', Physical: 'RECEIVED' }, 'x'));
ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
ctx.__nidForJoining(JJ.Joining_ID);
must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'JOINED', date: today, Employee_ID: 'E-7001' }), 'joined');
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', 'كريم', 'هبة', 'مدير الحسابات', 'محاسب', 'العبور', 'سارة', 'منى', 'مدير التوظيف', 'جولة في مخزن', 'محمود', 'وقّع على', 'قنديل'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0170-' + n + '.png', fullPage: true });

  // HR site specialist: home to-do + my tasks
  const tS = login('site@t.com');
  await openTok(tS);
  if (!/مهمة تهيئة/.test(await page.textContent('#main'))) errors.push('to-do on home');
  if (!(await page.$('#nav [data-v="onboarding"]'))) errors.push('menu item');
  await page.evaluate(() => go('onboarding', 'mine')); await page.waitForSelector('#onbBody table');
  await shot('1-my-tasks');
  await page.click('#onbBody [data-onb]'); await page.waitForSelector('.onbt');
  await shot('2-program');
  // acknowledgement task
  const law = await page.$$eval('.onbt', a => a.findIndex(x => /لائحة العمل/.test(x.textContent)));
  await (await page.$$('.onbt'))[law].$('[data-tdone]').then(b => b.click());
  await page.waitForSelector('#otA'); await page.click('#mActions .btn.primary'); await page.waitForSelector('#mMsg .msg.err');
  if (!/إقرار/.test(await page.textContent('#mMsg'))) errors.push('acknowledgement enforced');
  await page.check('#otA'); await page.fill('#otN', 'وقّع على نسخة اللايحة'); await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast');
  await page.waitForTimeout(400);
  // skip with reason
  await page.click('[data-tskip]'); await page.waitForSelector('#otN'); await page.fill('#otN', 'اتعمل من التوظيف'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  if (!(await page.$('.onbt.done')) || !(await page.$('.onbt.skip'))) errors.push('done + skipped shown');
  // manager: buddy + extra task + close
  await openTok(t.mgr); await page.evaluate(id => go('onb', id), ONB); await page.waitForSelector('#onbOw');
  await page.click('#onbOw'); await page.waitForSelector('#obN'); await page.fill('#obN', 'محمود الزميل'); await shot('3-owners'); await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast');
  await page.waitForTimeout(300);
  await page.click('#onbAdd'); await page.waitForSelector('#oaT'); await page.fill('#oaT', 'جولة في مخزن الخامات'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  if (!/جولة في مخزن الخامات/.test(await page.textContent('#onbD'))) errors.push('extra task');
  if (!/محمود الزميل/.test(await page.textContent('#onbD'))) errors.push('buddy shown');
  await page.click('#onbDone'); await page.waitForSelector('#ocC'); await page.selectOption('#ocC', 'PAPER'); await page.click('#mActions .btn.primary'); await page.waitForSelector('#mMsg .msg.err');
  if (!/مهمة مفتوحة/.test(await page.textContent('#mMsg'))) errors.push('manager cannot close with open tasks');
  await page.evaluate(() => closeModal());
  const [pop] = await Promise.all([page.waitForEvent('popup').catch(() => null), page.click('#onbPr')]);
  await page.waitForTimeout(300); if (!(await page.$('#printArea .pr-t'))) errors.push('print area');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0170-4-print.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });
  // HR: close with reason, then employee file
  await openTok(t.hr); await page.evaluate(id => go('onb', id), ONB); await page.waitForSelector('#onbDone');
  await page.click('#onbDone'); await page.waitForSelector('#ocR'); await page.fill('#ocR', 'الموظف اتنقل لموقع تاني بدري'); await page.selectOption('#ocC', 'IN_PERSON'); await page.click('#mActions .btn.primary');
  await page.waitForSelector('.msg.ok'); await shot('5-completed');
  await page.evaluate(() => go('onboarding', 'closed')); await page.waitForSelector('#onbBody table');
  await page.evaluate(() => go('emps')); await page.waitForTimeout(600);
  await page.evaluate(() => empOpen('E-7001')); await page.waitForSelector('.efile');
  if (!/مسوغات التعيين/.test(await page.textContent('.efile')) || !/افتح البرنامج/.test(await page.textContent('.efile'))) errors.push('employee file sections');
  await shot('6-employee-file'); await page.evaluate(() => closeModal());
  // templates (owner edits)
  await openTok(tO); await page.evaluate(() => go('onboarding', 'templates')); await page.waitForSelector('[data-tid]');
  await page.click('[data-tid]'); await page.waitForSelector('#oiT'); await page.fill('#oiO', '9'); await page.click('#mActions .btn.primary'); await page.waitForSelector('#mMsg .msg.err');
  if (!/مرحلة/.test(await page.textContent('#mMsg'))) errors.push('offset checked against the phase');
  await page.evaluate(() => closeModal()); await shot('7-templates');
  // location HR site field
  await page.evaluate(id => locationForm(S.lookups.locations.filter(l => l.id === id)[0]), LOC); await page.waitForSelector('#lfH option[value]:not([value=""])', { state: 'attached' });
  if ((await page.$eval('#lfH', s => s.value)) !== site) errors.push('HR site specialist shown on the location');
  await page.evaluate(() => closeModal());

  // English
  api('me.setLang', t.hr, { lang: 'en' });
  await openTok(t.hr); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function left(name) {
    const found = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('#printArea')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0170-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('onb', id), ONB); await page.waitForSelector('.onbt'); await page.waitForTimeout(300); await left('program');
  await page.evaluate(() => go('onboarding', 'templates')); await page.waitForSelector('[data-tid]'); await page.waitForTimeout(300); await left('templates');
  await page.evaluate(() => go('onboarding', 'closed')); await page.waitForSelector('#onbBody table'); await page.waitForTimeout(300); await left('list');

  // phone
  api('me.setLang', t.hr, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(t.hr) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [v, a] of [['onb', ONB], ['onboarding', 'closed'], ['onboarding', 'templates']]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(600);
    await ph.screenshot({ path: OUT + '/v0170-phone-' + v + '-' + a + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + v + ' ' + a + ': ' + w);
  }
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui23 OK');
})().catch(e => { console.error(e); process.exit(1); });
