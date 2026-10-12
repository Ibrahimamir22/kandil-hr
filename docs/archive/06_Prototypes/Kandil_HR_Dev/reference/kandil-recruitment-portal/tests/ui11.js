const { navClick } = require('./navhelp.js');
// v0.8.1 UI: HC-exception step on the request page, internal HR notes, chain waiting days, delegation tab,
// lists screen, job data edit + history on the job page, daily-job card in settings, activity types; English + phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
const day = n => { const d = new Date(Date.now() + 3 * 3600000 + n * 864e5); return d.toISOString().slice(0, 10); };
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
// v0.40 (HC-005): structure 3 (was 2) — a request in approval now reserves its number, so rq2 takes one place
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '3']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي']); const acc = user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']); const rm = user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']); const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']);
user('dep@t.com', 'نائب المدير المالي', '', null);
const t = { acc: login('acc@t.com'), cfo: login('cfo@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com') };
const base = { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في الإقفال الشهري', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Education: 'بكالوريوس تجارة', Experience_Years: '2' };
// request above the structure, approved by the line and by HR → waits for the HR Sector Manager
const rq = api('req.submit', t.acc, Object.assign({}, base, { Exception_Justification: 'موسم إقفال الميزانية', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 4 }] }));
api('req.action', t.cfo, { Request_ID: rq.Request_ID, action: 'APPROVE' });
api('req.action', t.hr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'IMPORTANT', HR_Notes: 'اتراجع', HR_Internal_Notes: 'المرشح الداخلي محتمل من المخازن' } });
// a request waiting 4 days (v0.40.1: 5 working days is the deadline) at the sector manager (waiting-days pill)
const rq2 = api('req.submit', t.acc, Object.assign({}, base, { Justification: 'طلب متأخر عند المدير المالي', Exception_Justification: 'v0.40: العدد محجوز للطلب الأول لحد اعتماده', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] }));
fresh(); ctx.update_('APPROVAL_INSTANCES', ctx.find_('APPROVAL_INSTANCES', { Entity_ID: rq2.Request_ID, Status: 'PENDING' })[0].Approval_ID, { Activated_At: day(-4) + 'T09:00:00' }, 'x');
// candidate for the activity select
const rq3 = api('req.submit', tO, Object.assign({}, base, { Justification: 'وظيفة للمرشحين', Exception_Justification: 'v0.40: العدد محجوز للطلبات اللي تحت الاعتماد', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] }));
fresh(); const vacId = ctx.find_('VACANCIES', { Request_ID: rq3.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: vacId, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: vacId, action: 'OPEN' });
const appId = api('cand.create', t.rec, { Vacancy_ID: vacId, Full_Name: 'أحمد سمير', Mobile: '01055556666', Source: 'WALK_IN', consent: 'Y' }).application.Application_ID;
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');   // the test may run on a day off
fresh(); ctx.runDaily_(true);
const job = ctx.get_('POSITIONS', P['محاسب تكاليف']).Job_Code;

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'الرئيس التنفيذي', 'هشام', 'منى', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'قنديل مصر', 'نائب المدير', 'أحمد سمير',
  'ضغط شغل', 'موسم إقفال', 'اتراجع', 'المرشح الداخلي', 'بكالوريوس', 'طلب متأخر', 'وظيفة للمرشحين', 'الحسابات', 'القطاع المالي', 'إجازة', 'زيارة'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v081-' + n + '.png', fullPage: true });
  const txt = async sel => (await page.textContent(sel)) || '';

  // --- HR Sector Manager: the exception step
  await open(tO);
  await page.evaluate(id => go('req', id), rq.Request_ID); await page.waitForSelector('#acCap');
  let body = await txt('#main');
  if (!/اعتماد استثناء العدد/.test(body) || !/\+3/.test(body)) errors.push('exception panel missing');
  if (!/ملاحظات HR الداخلية/.test(body) || !/المرشح الداخلي محتمل/.test(body)) errors.push('internal notes card missing for HR');
  await shot('1-exception-step');
  await page.click('#rdNote'); await page.waitForSelector('#inN'); await page.fill('#inN', 'اتفقنا نبدأ بالمرشح الداخلي');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#acCap');
  fresh(); if (ctx.get_('RECRUITMENT_REQUESTS', rq.Request_ID).HR_Internal_Notes !== 'اتفقنا نبدأ بالمرشح الداخلي') errors.push('internal note not saved');
  await page.click('#acCap'); await page.waitForSelector('#mActions .btn.primary'); await page.click('#mActions .btn.primary');
  await page.waitForFunction(() => !document.getElementById('acCap'));
  fresh(); if (ctx.get_('RECRUITMENT_REQUESTS', rq.Request_ID).Status !== 'APPROVED') errors.push('approve within HC failed');
  await page.waitForTimeout(300); await shot('2-after-cap');
  // --- requester: no internal notes
  await open(t.acc);
  await page.evaluate(id => go('req', id), rq.Request_ID); await page.waitForSelector('.chain');
  body = await txt('#main'); if (/المرشح الداخلي/.test(body) || /ملاحظات HR الداخلية/.test(body)) errors.push('requester sees internal notes');
  await page.evaluate(id => go('req', id), rq2.Request_ID); await page.waitForSelector('.chain');
  fresh(); const waitN = ctx.stepWaitDays_(ctx.find_('APPROVAL_INSTANCES', { Entity_ID: rq2.Request_ID, Status: 'PENDING' })[0]);   // working days, as the server counts them
  if (waitN < 3 || !new RegExp('من ' + waitN + ' يوم').test(await txt('.chain'))) errors.push('waiting days not shown on the pending step (' + waitN + '): ' + (await txt('.chain')).slice(0, 300));
  await shot('3-waiting-days');
  // --- delegation tab (HR manager)
  await open(t.hr);
  await navClick(page, 'rules'); await page.waitForSelector('[data-rtab="dlg"]');
  await page.click('[data-rtab="dlg"]'); await page.waitForSelector('#dlNew');
  await page.click('#dlNew'); await page.waitForSelector('#dfP');
  await page.selectOption('#dfP', P['مدير الحسابات']);   // v0.34: a sector head's authority is delegated by the owner / HR sector manager only
  await page.selectOption('#dfU', { label: 'نائب المدير المالي' });
  await page.fill('#dfT', day(14)); await page.fill('#dfW', 'إجازة سنوية');
  await shot('4-delegation-form');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('[data-dstop]');
  await shot('5-delegations');
  fresh(); if (ctx.all_('DELEGATIONS').length !== 1) errors.push('delegation not saved');
  // --- lists
  await navClick(page, 'lists'); await page.waitForSelector('[data-ltab]');
  await shot('6-lists');
  await page.click('[data-ltab="ACTIVITY_TYPE"]'); await page.waitForSelector('#lsNew');
  await page.click('#lsNew'); await page.waitForSelector('#liA');
  await page.fill('#liA', 'زيارة للموقع'); await page.fill('#liE', 'Site visit'); await page.check('#liN');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /زيارة للموقع/.test(document.getElementById('lsBox').textContent));
  await shot('7-activity-types');
  // --- job data
  await page.evaluate(c => go('jd', c), job); await page.waitForSelector('#jdJobB');
  await page.click('#jdJobB'); await page.waitForSelector('#jbA');
  if (!(await page.$eval('#jbG', e => e.disabled))) errors.push('grade must be locked for the HR manager');
  await page.fill('#jbA', 'محاسب تكاليف أول'); await page.selectOption('#jbL', 'JL3'); await page.fill('#jbW', 'توحيد المسميات');
  await shot('8-job-form');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('[data-jtab="jhist"]');
  await page.click('[data-jtab="jhist"]'); await page.waitForFunction(() => /توحيد المسميات/.test(document.getElementById('jdBody').textContent));
  await shot('9-job-history');
  // --- recruiter: activity types from the list
  await open(t.rec);
  await page.evaluate(id => go('app', id), appId); await page.waitForSelector('#acT');
  const opts = await page.$$eval('#acT option', os => os.map(o => o.textContent));
  if (!opts.includes('زيارة للموقع')) errors.push('custom activity type not offered: ' + opts);
  // --- settings: daily job card (owner)
  await open(tO);
  await navClick(page, 'config'); await page.waitForFunction(() => /المهمة اليومية/.test(document.getElementById('cDaily').textContent));
  if (!/مش متركبة|شغالة كل يوم/.test(await txt('#cDaily'))) errors.push('daily status missing');
  await shot('10-settings');
  // --- English pass
  api('me.setLang', tO, { lang: 'en' });
  api('req.submit', t.acc, Object.assign({}, base, { Justification: 'طلب استثناء تاني للإنجليزي', Exception_Justification: 'موسم إقفال الميزانية', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 5 }] }));
  fresh(); const rqE = ctx.all_('RECRUITMENT_REQUESTS').slice(-1)[0].Request_ID;
  api('req.action', t.cfo, { Request_ID: rqE, action: 'APPROVE' });
  await open(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function leftovers(name) {
    const found = await page.evaluate(() => {
      const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]')) continue;
        if (p.closest('.hidden') || p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim().replace(/\s+/g, ' ')); }
      document.querySelectorAll('[placeholder],[title]').forEach(e => { ['placeholder', 'title'].forEach(a => { const v = e.getAttribute(a); if (v && AR.test(v) && !e.closest('[data-nt]')) out.add('@' + a + ': ' + v); }); });
      return [...out];
    });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v081-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('req', id), rqE); await page.waitForSelector('#hrAlsoExc'); await page.waitForTimeout(300); await leftovers('hr-step-also-exc');
  await page.evaluate(() => go('rules', 'dlg')); await page.waitForSelector('[data-dstop]'); await page.waitForTimeout(300); await leftovers('delegations');
  await page.evaluate(() => go('lists')); await page.waitForSelector('[data-ltab]'); await page.waitForTimeout(300); await leftovers('lists');
  await page.evaluate(c => go('jd', c), job); await page.waitForSelector('#jdJobB'); await page.click('#jdJobB'); await page.waitForSelector('#jbA'); await page.waitForTimeout(300); await leftovers('job-form');
  await page.evaluate(() => closeModal());
  await page.evaluate(() => go('config')); await page.waitForFunction(() => /Daily job/.test(document.getElementById('cDaily').textContent)); await leftovers('settings');
  await page.evaluate(() => go('guide')); await page.waitForTimeout(300); await leftovers('guide');
  // --- phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  api('me.setLang', tO, { lang: 'ar' });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['req', 'req', rqE], ['dlg', 'rules', 'dlg'], ['lists', 'lists', null]]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(500);
    await ph.screenshot({ path: OUT + '/v081-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui11 OK');
})().catch(e => { console.error(e); process.exit(1); });
