// v0.13.0 UI (5A): salary structures, selection decision, offer editor with range bar + authority, approval from the offers list,
// presenting, the letter, acceptance with a signed copy, hiring-manager view; English + phone.
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
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للواجهة', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 1 }] });
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' });
function cand(name, mobile, extra) { const a = api('cand.create', t.rec, Object.assign({ Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Source: 'WALK_IN', consent: 'Y' }, extra || {})).application.Application_ID; api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }); return a; }
const A1 = cand('أحمد علي حسن', '01011112222', { Current_Salary: '5500', Expected_Salary: '9000' }), A2 = cand('كريم محمود سالم', '01033334444');
fresh(); const today = ctx.today_();
for (const A of [A1, A2]) { const iv = api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: rec, Role: 'LEAD' }] }).interview; api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }); }

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'الرئيس التنفيذي', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'مدير قطاع HR', 'قنديل مصر', 'أحمد', 'كريم', 'العبور', 'القطاع المالي', 'الحسابات', 'شاغر',
  'خبرة', 'وقّع', 'الخطاب', 'فترة اختبار', 'المدير وافق', 'signed', 'تكاليف', 'هيكل', 'محاسب', 'سرعة'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0130-' + n + '.png', fullPage: true });
  const main = async () => (await page.textContent('#main')) || '';

  // --- HR Sector Manager: salary structure for grade 7
  await open(t.sec);
  await page.evaluate(() => go('pay')); await page.waitForSelector('[data-sg="7"]');
  await page.fill('[data-sg="7"][data-sk="min"]', '6000'); await page.fill('[data-sg="7"][data-sk="mid"]', '8000'); await page.fill('[data-sg="7"][data-sk="max"]', '10000');
  await page.fill('#psR', 'هيكل رواتب 2026'); await page.click('#psSave'); await page.waitForTimeout(400);
  fresh(); if (!ctx.find_('SALARY_STRUCTURES', { Grade_Code: '7', Status: 'Active' }).length) errors.push('structure not saved from the screen');
  await shot('1-structures');
  await page.evaluate(() => go('pay', 'components')); await page.waitForSelector('[data-pc]'); await shot('2-components');
  await page.evaluate(() => go('pay', 'authority')); await page.waitForSelector('[data-ar]'); await shot('3-authority');

  // --- recruiter: selection
  await open(t.rec);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#selBtn');
  await shot('4-card-before');
  await page.click('#selBtn'); await page.waitForSelector('input[name="slD"]');
  await page.check('input[name="slD"][value="SELECTED"]'); await page.fill('#slR', 'خبرة تكاليف و SAP'); await page.fill('#slO', 'المدير وافق بعد المقابلة الفنية');
  await shot('5-selection');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#ofNew');
  fresh(); if (ctx.get_('APPLICATIONS', A1).Stage !== 'OFFER') errors.push('selection did not move the candidate to the offer stage');
  // --- offer editor
  await page.click('#ofNew'); await page.waitForSelector('#ofA');
  await page.fill('#ofA', '9000'); await page.waitForFunction(() => /الصافي/.test(document.getElementById('ofCalc').textContent), null, { timeout: 8000 });
  const sum = await page.textContent('#ofCalc'); if (!/9,000/.test(sum) || !/5,800/.test(sum) || !/مدير التوظيف/.test(sum)) errors.push('offer calc: package + basic + authority: ' + sum);
  await page.check('input[name="ofB"][value="NET"]'); await page.waitForFunction(() => /Net allowance/.test(document.getElementById('ofCalc').textContent), null, { timeout: 8000 });
  await shot('6b-offer-net');
  await page.check('input[name="ofB"][value="GROSS"]'); await page.waitForFunction(() => !/Net allowance/.test(document.getElementById('ofCalc').textContent), null, { timeout: 8000 });
  // v0.42.0: guided steps — the salary, the benefits, the review (dates, terms), then send
  await page.click('#ofNext'); await page.click('#ofNext');
  await page.fill('#ofD', '2099-02-01'); await page.fill('#ofT', 'فترة اختبار 3 شهور');
  await page.click('#ofNext'); await page.waitForFunction(() => /9,000/.test(document.getElementById('ofSum').textContent) && /مدير التوظيف/.test(document.getElementById('ofSum').textContent), null, { timeout: 8000 }).catch(() => errors.push('offer wizard: the summary step'));
  await shot('6-offer-editor');
  await page.click('#ofSend'); await page.waitForTimeout(800); if (await page.$('#mMsg')) console.log('MSG', await page.textContent('#mMsg')); await page.waitForFunction(() => /مستني الموافقة/.test(document.getElementById('main').textContent));
  await shot('7-pending');
  // --- recruitment manager approves from the list
  await open(t.rm);
  if (!/عرض وظيفي مستني موافقتك/.test(await main())) errors.push('home: approval row');
  await page.evaluate(() => go('offers', 'approve')); await page.waitForSelector('[data-oapr]');
  await shot('8-approve-list');
  await page.click('[data-oapr]'); await page.waitForSelector('#oaN'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  fresh(); const off = ctx.find_('OFFERS', { Application_ID: A1 })[0]; if (off.Status !== 'APPROVED') errors.push('not approved from the list: ' + off.Status);
  // --- recruiter: letter, present, accept
  await open(t.rec);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('[data-oa="PRESENT"]');
  const [pop] = await Promise.all([ctxB.waitForEvent('page'), page.click('[data-oa="letter"]')]);
  await pop.waitForLoadState(); await pop.waitForTimeout(500);
  const lt = await pop.content(); if (!/5,800/.test(lt) || !/9,000/.test(lt) || !/بدل غذاء/.test(lt)) errors.push('letter content');
  await pop.screenshot({ path: OUT + '/v0130-9-letter.png', fullPage: true }); await pop.close();
  await page.click('[data-oa="PRESENT"]'); await page.waitForSelector('#oaV'); await page.selectOption('#oaV', 'PRINT'); await page.click('#mActions .btn.primary');
  await page.waitForSelector('[data-oa="ACCEPT"]');
  await page.click('[data-oa="ACCEPT"]'); await page.waitForSelector('#oaN');
  await page.fill('#oaN', 'وقّع على الخطاب المطبوع'); await page.setInputFiles('#oaF', { name: 'signed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await shot('10-accept');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /المرشح قبل/.test(document.getElementById('main').textContent) && !document.getElementById('oaN'));
  fresh(); const a1 = ctx.get_('APPLICATIONS', A1), o1 = ctx.find_('OFFERS', { Application_ID: A1 })[0];
  if (a1.Stage !== 'ACCEPTED' || o1.Final_Accepted !== '9000' || !o1.Evidence_JSON) errors.push('accept not saved: ' + a1.Stage + ' ' + o1.Final_Accepted);
  await shot('11-accepted');
  // reserve for A2 + references
  await page.evaluate(id => go('app', id), A2); await page.waitForSelector('#selBtn');
  await page.click('#selBtn'); await page.check('input[name="slD"][value="RESERVE"]'); await page.fill('#slR', 'احتياطي قوي'); await page.click('#mActions .btn.primary'); await page.waitForSelector('#refAdd');
  await page.click('#refAdd'); await page.fill('#rfN', 'أستاذ سمير'); await page.check('#rfK'); await page.selectOption('#rfS', 'POSITIVE'); await page.fill('#rfX', 'ملتزم ودقيق'); await page.click('#mActions .btn.primary');
  await page.waitForFunction(() => /أستاذ سمير/.test(document.getElementById('offCard').textContent));
  await page.evaluate(id => go('pipe', id), VAC); await page.waitForSelector('#pList'); await page.waitForTimeout(300); await shot('12-pipeline');
  // --- hiring manager: no money
  await open(t.mgr);
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#offCard');
  const mc = await page.textContent('#offCard'); if (/9,000|5,800/.test(mc)) errors.push('hiring manager sees salary');
  await shot('13-manager');

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
    await page.screenshot({ path: OUT + '/v0130-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('app', id), A1); await page.waitForSelector('#offCard'); await page.waitForTimeout(300); await leftovers('app');
  await page.evaluate(id => go('app', id), A2); await page.waitForSelector('#offCard'); await page.waitForTimeout(300); await leftovers('app-reserve');
  await page.click('#selBtn'); await page.waitForSelector('#slR'); await page.waitForTimeout(300); await leftovers('selection'); await page.click('#mClose').catch(() => page.keyboard.press('Escape'));
  await page.evaluate(() => go('offers', 'closed')); await page.waitForSelector('#ofList table, #ofList .msg'); await page.waitForTimeout(300); await leftovers('offers');
  for (const tb of ['structures', 'allowances', 'nature', 'transport', 'jobs', 'rules', 'components', 'authority']) { await page.evaluate(x => go('pay', x), tb); await page.waitForSelector('#payBody table, #payBody [data-ar], #payBody [data-rk]'); await page.waitForTimeout(300); await leftovers('pay-' + tb); }
  // offer editor in English: select A2 and open the editor
  api('sel.save', tO, { Application_ID: A2, Decision: 'SELECTED', Reason: 'المرشح الأول قبل والمدير عايز اتنين', Override_Reason: 'المدير وافق', confirmOver: 'Y' });
  await page.evaluate(id => go('app', id), A2); await page.waitForSelector('#ofNew'); await page.click('#ofNew'); await page.waitForSelector('#ofA'); await page.fill('#ofA', '12000'); await page.waitForTimeout(1500); await page.waitForTimeout(300); await leftovers('offer-editor');
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['app', 'app', A1], ['offers', 'offers', 'closed'], ['pay', 'pay', 'structures'], ['authority', 'pay', 'authority'], ['allow', 'pay', 'allowances'], ['rules', 'pay', 'rules'], ['pipe', 'pipe', VAC]]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(700);
    await ph.screenshot({ path: OUT + '/v0130-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await ph.evaluate(id => go('app', id), A2); await ph.waitForSelector('#ofNew'); await ph.click('#ofNew'); await ph.waitForSelector('#ofA'); await ph.fill('#ofA', '9000'); await ph.waitForTimeout(1500);
  await ph.screenshot({ path: OUT + '/v0130-phone-editor.png', fullPage: true });
  const w2 = await ph.evaluate(() => document.documentElement.scrollWidth); if (w2 > 392) errors.push('phone overflow on the offer editor: ' + w2);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui17 OK');
})().catch(e => { console.error(e); process.exit(1); });
