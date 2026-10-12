// v0.10.0 UI (3B-3): screening questions (vacancy editor + public form + knockout review), talent pool, bulk import by paste,
// transfer, cancel-with-decisions, metrics & question library tabs, former employee / restriction; English + phone.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']); user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']);
const t = { hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com') };
function vacancy(pos, just) {
  const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
    Justification: just, Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: pos, Requested_HC: 2 }] });
  fresh(); const id = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
  api('vac.assign', t.rm, { Vacancy_ID: id, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: id, action: 'OPEN' }); return id;
}
const vacA = vacancy(P['محاسب تكاليف'], 'شاغر محاسب تكاليف للواجهة'), vacB = vacancy(P['محاسب عام'], 'شاغر محاسب عام للواجهة');
fresh(); ctx.insert_('EMPLOYEES', { Employee_ID: '2001', Full_Name: 'كريم ممدوح سالم', Position_ID: P['محاسب عام'], Location_ID: '', Hire_Date: '2019-01-01', Employment_Kind: 'PERMANENT',
  Job_Type: '', Status: 'Exited', Exit_Date: '2024-05-01', Exit_Reason: 'ABSENCE', Exit_Note: '', Source: 'TEST', Notes: '' }, 'x');

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'محاسب عام', 'مدير الحسابات', 'الرئيس التنفيذي', 'هشام', 'منى', 'سارة', 'محمد عمارة', 'مدير التوظيف', 'قنديل مصر',
  'أحمد', 'كريم', 'هالة', 'منى سعيد', 'سامح', 'العبور', 'القطاع المالي', 'الحسابات', 'شاغر', 'جروب', 'تمام', 'ممتاز', 'قرار', 'القاهرة', 'الجيزة', 'Odoo', 'مالية ومحاسبة', 'مؤهل عالي'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0100-' + n + '.png', fullPage: true });
  const main = async () => (await page.textContent('#main')) || '';

  // --- recruiter sets the screening questions on the vacancy
  await open(t.rec);
  await page.evaluate(id => go('pipe', id), vacA); await page.waitForSelector('#qEdit');
  await page.click('#qEdit'); await page.waitForSelector('[data-qi]');
  const qs = await page.$$eval('[data-qi]', els => els.map(e => e.dataset.qi));
  await page.check(`[data-qi="${qs[0]}"]`); await page.selectOption(`[data-qk="${qs[0]}"]`, 'KNOCKOUT');
  await page.check(`[data-qi="${qs[2]}"]`); await page.selectOption(`[data-qk="${qs[2]}"]`, 'KNOCKOUT'); await page.fill(`[data-qp="${qs[2]}"]`, '2');
  await shot('1-questions-editor');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /شرط أساسي/.test(document.getElementById('main').textContent));
  await page.click('#apToggle'); await page.waitForTimeout(400);
  await shot('2-pipeline-questions');
  // --- public form with questions
  fresh(); const code = ctx.get_('VACANCIES', vacA).Apply_Code;
  const apply = fs.readFileSync(path.join(__dirname, '..', 'src', 'Apply.html'), 'utf8').replace(/<\?= code \?>/g, code).replace(/<\?= src \?>/g, 'FACEBOOK').replace(/<\?= lang \?>/g, 'ar').replace(/<\?= ad \?>/g, '').replace('<script>', shim + '<script>');
  const ap = await browser.newPage({ viewport: { width: 390, height: 844 } }); ap.on('pageerror', e => errors.push(e.message));
  await ap.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ap.setContent(apply); await ap.waitForSelector('#f_Full_Name');
  await ap.fill('#f_Full_Name', 'منى سعيد حسن'); await ap.fill('#f_Mobile', '01022223333'); await ap.selectOption('#f_Governorate', 'القاهرة');
  await ap.selectOption('#f_Education', 'BACHELOR'); await ap.fill('#f_Experience_Years', '1');
  await ap.check(`input[name="q_${qs[0]}"][value="N"]`); await ap.fill(`[data-q="${qs[2]}"]`, '1');
  await ap.evaluate(() => { ST.t0 = Date.now() - 10000; }); await ap.check('#consent'); await ap.check('#cTransfer'); await ap.check('#cSalary');
  await ap.screenshot({ path: OUT + '/v0100-3-apply-questions.png', fullPage: true });
  await ap.click('#send'); await ap.waitForSelector('.ref');
  fresh(); const koApp = ctx.find_('APPLICATIONS', { Vacancy_ID: vacA }).find(a => a.Knockout_Flag === 'Y');
  if (!koApp) errors.push('public answers did not flag the knockout');
  // --- knockout review on the candidate page
  await page.evaluate(id => go('app', id), koApp.Application_ID); await page.waitForSelector('#koOk');
  await shot('4-knockout');
  await page.click('#koOk'); await page.waitForSelector('#koN'); await page.fill('#koN', 'المدير وافق يجرّبه');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /الشرط الأساسي اتراجع/.test(document.getElementById('main').textContent));
  // add to talent pool
  await page.click('#aPool'); await page.waitForSelector('#plT'); await page.selectOption('#plC', 'ACC'); await page.fill('#plN', 'ممتاز بس الخبرة قليلة'); await page.check('#plOk'); await page.fill('#plON', 'وافق في مكالمة');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => !document.getElementById('plT') && /في قاعدة المرشحين/.test(document.getElementById('main').textContent));
  // transfer to vacancy B
  await page.click('#aTr'); await page.waitForSelector('#trV'); await page.selectOption('#trV', vacB);
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /اتنقل من/.test(document.getElementById('main').textContent));
  await shot('5-transferred');
  // --- talent pool tab
  await page.evaluate(() => go('cands', 'pool')); await page.waitForSelector('[data-pv]');
  await shot('6-pool');
  // --- import by paste
  await page.evaluate(() => go('cands', 'import')); await page.waitForSelector('#imP');
  await page.selectOption('#imV', vacA); await page.selectOption('#imS', 'FACEBOOK'); await page.fill('#imB', 'جروب محاسبين');
  await page.fill('#imP', ['الاسم\tالموبايل\tالمؤهل\tالخبرة', 'كريم ممدوح سالم\t01044445555\tبكالوريوس تجارة\t3', 'هالة محمد سعد\t01055556666\tدبلوم\t5', 'منى سعيد\t01022223333\t\t', 'بدون موبايل\t\t\t'].join('\n'));
  await page.click('#imGo'); await page.waitForSelector('#imCommit');
  await shot('7-import-preview');
  const dup = await page.$('[data-idec]'); if (!dup) errors.push('possible duplicate row missing');
  else await page.selectOption('[data-idec]', { index: 1 });
  await page.check('#imOk'); await page.click('#imCommit'); await page.waitForSelector('#qEdit');
  fresh(); if (ctx.all_('IMPORT_BATCHES').length !== 1) errors.push('import batch not saved');
  // --- former employee flag (karim) on the candidate page as the recruitment manager
  fresh(); const karim = ctx.all_('APPLICATIONS').find(a => ctx.get_('PERSONS', a.Person_ID).Full_Name === 'كريم ممدوح سالم');
  await open(t.rm);
  await page.evaluate(id => go('app', id), karim.Application_ID); await page.waitForSelector('[data-fsame]');
  await shot('8-former-employee');
  await page.click('[data-fsame]'); await page.waitForFunction(() => !document.querySelector('[data-fsame]'));
  // --- HR adds a restriction from the candidate page
  await open(t.hr);
  await page.evaluate(id => go('app', id), karim.Application_ID); await page.waitForSelector('#fRestrict');
  await page.click('#fRestrict'); await page.waitForSelector('#rsR'); await page.selectOption('#rsR', 'ABANDONMENT');
  await page.fill('#rsE', 'قرار رقم 15 لسنة 2024 بعد إنذارين'); await page.fill('#rsD', ctx.addDaysYmd_(ctx.today_(), 365));   // v0.40: no permanent restriction
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /عليه قيد تعيين/.test(document.getElementById('main').textContent));
  await shot('9-restricted');
  await page.evaluate(() => go('restrict')); await page.waitForSelector('[data-lift]'); await shot('10-restrictions');
  // --- metrics + question library
  await page.evaluate(() => go('sources', 'metrics')); await page.waitForFunction(() => /ملفات الاستيراد/.test(document.getElementById('sBody').textContent));
  await shot('11-metrics');
  await page.evaluate(() => go('sources', 'questions')); await page.waitForSelector('#sqNew');
  await page.click('#sqNew'); await page.waitForSelector('#sqA'); await page.fill('#sqA', 'تعرف تشتغل على Odoo؟'); await page.fill('#sqE', 'Can you use Odoo?');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => /Odoo/.test(document.getElementById('sBody').textContent));
  await shot('12-question-library');
  // --- cancel vacancy A with decisions
  await page.evaluate(() => go('vacancies')); await page.waitForTimeout(400);
  await page.evaluate(id => openVacancy(id), vacA); await page.waitForSelector('[data-va="CANCEL"]');
  await page.click('[data-va="CANCEL"]'); await page.waitForSelector('#vaWhy'); await page.fill('#vaWhy', 'الميزانية اتلغت');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#cdAll');
  await shot('13-cancel-decisions');
  await page.selectOption('#cdAll', 'REJECT'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(600);
  fresh(); if (ctx.get_('VACANCIES', vacA).Status !== 'CANCELLED') errors.push('vacancy not cancelled: ' + ctx.get_('VACANCIES', vacA).Status);
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
    await page.screenshot({ path: OUT + '/v0100-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('app', id), karim.Application_ID); await page.waitForSelector('#aPool'); await page.waitForTimeout(300); await leftovers('candidate');
  await page.evaluate(id => go('pipe', id), vacB); await page.waitForSelector('#qEdit'); await page.waitForTimeout(300); await leftovers('pipeline');
  await page.evaluate(() => go('cands', 'pool')); await page.waitForSelector('[data-pv]'); await page.waitForTimeout(300); await leftovers('pool');
  await page.evaluate(() => go('cands', 'import')); await page.waitForSelector('#imP'); await page.waitForTimeout(300); await leftovers('import');
  await page.evaluate(() => go('sources', 'metrics')); await page.waitForFunction(() => /Import batches/.test(document.getElementById('sBody').textContent)); await leftovers('metrics');
  await page.evaluate(() => go('sources', 'questions')); await page.waitForSelector('[data-sq]'); await page.waitForTimeout(300); await leftovers('questions');
  await page.evaluate(() => go('restrict')); await page.waitForSelector('#rsNew'); await page.waitForTimeout(300); await leftovers('restrictions');
  // --- phone
  api('me.setLang', tO, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [n, v, a] of [['app', 'app', karim.Application_ID], ['pool', 'cands', 'pool'], ['import', 'cands', 'import'], ['metrics', 'sources', 'metrics']]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(600);
    await ph.screenshot({ path: OUT + '/v0100-phone-' + n + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + n + ': ' + w);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui13 OK');
})().catch(e => { console.error(e); process.exit(1); });
