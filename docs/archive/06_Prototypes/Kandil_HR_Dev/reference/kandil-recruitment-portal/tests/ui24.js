// v0.18.0 UI: welcome gift card, insurance screen, New Hire Voice tab (link, answers, review), private survey page; English + phone.
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
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 6 }] }), 'request');
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
const site = user('site@t.com', 'هبة أخصائي HR', '', ['HR_STAFF']);
fresh(); const LOC = P['محاسب تكاليف'].Location_ID, L0 = ctx.get_('LOCATIONS', LOC);
must(api('config.update', tO, { Config_Key: 'INSURANCE_OFFICES', Config_Value: JSON.stringify(['مكتب تأمينات العبور', 'مكتب تأمينات بلبيس']), reason: 'المكاتب' }), 'offices');
must(api('locations.save', t.hr, { Location_ID: LOC, Name_AR: L0.Name_AR, Location_Type: 'FACTORY', Status: 'Active', HR_Site_User_ID: site, Insurance_Office: 'مكتب تأمينات العبور' }), 'location');
fresh(); ok(ctx.get_('LOCATIONS', LOC).Insurance_Office === 'مكتب تأمينات العبور', 'insurance office per location');
fresh(); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
function join(name, mobile, empId, date, opts) {
  opts = opts || {};
  const H = hire(name, mobile, 'M', opts.offer);
  let O = must(api('offer.action', t.rm, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT', hcOverride: 'محتاجين العدد ده للاختبار' }), 'submit ' + name).offer;
  if (O.Status === 'PENDING_APPROVAL') O = must(api('offer.action', t.ceo, { Offer_ID: O.Offer_ID, action: 'APPROVE', note: 'موافق' }), 'CEO approves').offer;
  accept(O);
  const J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
  must(api('join.action', t.rec, { Joining_ID: J.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm');
  fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: opts.docsOpen ? 'MISSING' : 'WAIVED' }, 'x'));
  ctx.__nidForJoining(J.Joining_ID);
  must(api('join.action', opts.docsOpen ? t.rm : t.rec, Object.assign({ Joining_ID: J.Joining_ID, action: 'JOINED', date, Employee_ID: empId }, opts.docsOpen ? { override: 'استثناء للاختبار' } : {})), 'joined ' + name);
  return { H, J };
}


const OUT = process.env.SHOTS || '.';
const d1 = ctx.addDaysYmd_(ctx.today_(), -10);
const A = join('كريم محمود سالم', '01033334444', 'E-7001', d1);
const B = join('منى سعيد حسن', '01055556666', 'E-7002', ctx.addDaysYmd_(ctx.today_(), -8));
fresh(); ctx.update_('PERSONS', ctx.get_('JOININGS', A.J.Joining_ID).Person_ID, { Email: 'karim@mail.test' }, 'x');
mails.length = 0; fresh(); ctx.nhvDaily_();
const tok = /voice=([A-Za-z0-9]+)/.exec(mails.find(m => m.to === 'karim@mail.test').htmlBody)[1];
fresh(); const ONB = ctx.findOne_('ONBOARDINGS', { Joining_ID: A.J.Joining_ID }).Onboarding_ID;
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const voiceHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'Voice.html'), 'utf8').replace(/<\?= token \?>/g, tok).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', 'كريم', 'منى', 'هبة', 'مدير الحسابات', 'محاسب', 'العبور', 'سارة', 'مكتب تأمينات', 'شنطة ترحيب', 'الشغل مختلف', 'قعدت معاه', 'أهلاً، رأيك', 'قنديل'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0180-' + n + '.png', fullPage: true });

  // employee's private survey page (phone)
  const vp = await browser.newPage({ viewport: { width: 390, height: 844 } }); vp.on('pageerror', e => errors.push('voice: ' + e.message));
  await vp.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await vp.setContent(voiceHtml); await vp.waitForSelector('.scale');
  await vp.screenshot({ path: OUT + '/v0180-voice-1.png', fullPage: true });
  await vp.click('[data-q="Q1"][data-v="2"]'); await vp.click('#send'); await vp.waitForSelector('.q.miss');
  if (!/كل الأسئلة/.test(await vp.textContent('.msg.err'))) errors.push('voice: all questions');
  for (const [q, v] of [['Q2', 4], ['Q3', 5], ['Q4', 4], ['Q5', 3]]) await vp.click(`[data-q="${q}"][data-v="${v}"]`);
  await vp.fill('#cm', 'الشغل مختلف عن الإعلان شوية');
  await vp.screenshot({ path: OUT + '/v0180-voice-2.png', fullPage: true });
  await vp.click('#send'); await vp.waitForSelector('.done .ok');
  await vp.screenshot({ path: OUT + '/v0180-voice-3.png', fullPage: true });
  if (await vp.evaluate(() => document.documentElement.scrollWidth) > 392) errors.push('voice page overflow');
  await vp.click('[data-l="en"]'); if (!/Thank you/.test(await vp.textContent('body'))) errors.push('voice page English');
  await vp.close();
  fresh(); if (ctx.find_('NHV_SURVEYS', { Status: 'ANSWERED' }).length !== 1) errors.push('answer saved');

  // manager: gift on the program page (no insurance card)
  await openTok(t.mgr); await page.evaluate(id => go('onb', id), ONB); await page.waitForSelector('#giftBtn');
  if (/التأمينات الاجتماعية/.test(await page.textContent('#onbD'))) errors.push('manager does not see insurance');
  await page.click('#giftBtn'); await page.waitForSelector('#gfI'); await page.check('#gfS'); await shot('1-gift-modal');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('.toast'); await page.waitForTimeout(400);
  if (!/اتسلمت/.test(await page.textContent('.nhcard'))) errors.push('gift recorded');
  // HR: program page with insurance, insurance screen
  await openTok(t.hr); await page.evaluate(id => go('onb', id), ONB); await page.waitForSelector('.nhcard');
  if (!/التأمينات الاجتماعية/.test(await page.textContent('#onbD'))) errors.push('HR sees insurance card');
  await shot('2-program-cards');
  if (!/ملف تأمينات متأخر/.test(await (await page.evaluate(() => go('home')), page.textContent('#main')))) errors.push('insurance to-do on home');
  await page.evaluate(() => go('insurance', 'late')); await page.waitForSelector('[data-ic]');
  await shot('3-insurance-late');
  await page.click('[data-ic]'); await page.waitForSelector('#icR'); await page.fill('#icR', 'REQ-5521'); await shot('4-insurance-modal');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  await page.evaluate(() => go('insurance', 'open')); await page.waitForSelector('[data-ic]'); await page.click('[data-ic]'); await page.waitForSelector('#icN');
  await page.fill('#icN', '70123456'); await page.click('#mActions button:has-text("اتسجل")'); await page.waitForTimeout(500);
  fresh(); if (ctx.all_('INSURANCE_CASES').filter(c => c.Status === 'REGISTERED').length !== 1) errors.push('registered from the screen');
  await page.evaluate(() => go('insurance', 'done')); await page.waitForTimeout(400); await shot('5-insurance-done');
  // voice tab
  await page.evaluate(() => { S.nhvTab = 'answered'; go('onboarding', 'voice'); }); await page.waitForSelector('[data-nv]');
  if (!(await page.$('.nhvavg.lo'))) errors.push('low average shown');
  await shot('6-voice-answers');
  await page.click('[data-nv]'); await page.waitForSelector('#nrN'); await page.fill('#nrN', 'قعدت معاه ووضحنا المهام'); await shot('7-voice-answer');
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  await page.evaluate(() => { S.nhvTab = 'todo'; go('onboarding', 'voice'); }); await page.waitForSelector('[data-nl]');
  await page.click('[data-nl]'); await page.waitForSelector('#nlT'); if (!/voice=/.test(await page.inputValue('#nlT'))) errors.push('link in message');
  await shot('8-voice-link'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  fresh(); if (!ctx.all_('NHV_SURVEYS').some(s => s.Status === 'SENT' && s.Sent_Via === 'WHATSAPP')) errors.push('marked sent by WhatsApp');
  // employee file
  await page.evaluate(() => empOpen('E-7001')); await page.waitForSelector('.efile');
  if (!/التأمينات/.test(await page.textContent('.efile')) || !/صوت الموظف الجديد/.test(await page.textContent('.efile'))) errors.push('file: insurance + voice');
  await shot('9-file'); await page.evaluate(() => closeModal());
  // manager has no voice tab
  await openTok(t.mgr); await page.evaluate(() => go('onboarding')); await page.waitForSelector('.subtabs');
  if (await page.$('[data-ot="voice"]')) errors.push('manager has no voice tab');

  // English
  api('me.setLang', t.hr, { lang: 'en' });
  await openTok(t.hr); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function left(name) {
    const found = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('#printArea')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0180-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('onb', id), ONB); await page.waitForSelector('.nhcard'); await page.waitForTimeout(300); await left('program');
  await page.evaluate(() => go('insurance', 'all')); await page.waitForSelector('#insBody table'); await page.waitForTimeout(300); await left('insurance');
  await page.evaluate(() => { S.nhvTab = 'answered'; go('onboarding', 'voice'); }); await page.waitForSelector('[data-nv]'); await page.waitForTimeout(300); await left('voice');
  await page.click('[data-nv]'); await page.waitForSelector('.nhvans'); await left('answer'); await page.evaluate(() => closeModal());

  // phone
  api('me.setLang', t.hr, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(t.hr) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [v, a] of [['insurance', 'all'], ['onboarding', 'voice'], ['onb', ONB]]) {
    await ph.evaluate(x => { S.nhvTab = 'answered'; go(x[0], x[1]); }, [v, a]); await ph.waitForTimeout(600);
    await ph.screenshot({ path: OUT + '/v0180-phone-' + v + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + v + ': ' + w);
  }
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui24 OK');
})().catch(e => { console.error(e); process.exit(1); });
