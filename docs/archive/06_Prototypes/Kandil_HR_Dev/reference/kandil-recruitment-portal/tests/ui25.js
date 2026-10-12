// v0.19.0 UI: transfer request form (employee, target with room, pay flags and items), approvals, detail, salary-items notice; English + phone.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '1']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('JOBS', P['محاسب تكاليف'].Job_Code, { Grade_Code: '7' }, 'x'); ctx.update_('JOBS', P['أمين خزينة'].Job_Code, { Grade_Code: '7' }, 'x'); ctx.update_('JOBS', P['محصل'].Job_Code, { Grade_Code: '5' }, 'x');
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), trs: user('trs@t.com', 'مدير الخزينة', P['مدير الخزينة'].Position_ID),
  hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), sec: user('sec@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']), staff: user('st@t.com', 'سارة', '', ['HR_STAFF']), rec: user('rec@t.com', 'علي', '', ['RECRUITER']) };
const t = { acc: login('acc@t.com'), trs: login('trs@t.com'), hr: login('hr@t.com'), sec: login('sec@t.com'), staff: login('st@t.com'), rec: login('rec@t.com') };
function emp(id, name, posTitle) { must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: id, Full_Name: name, Position_ID: P[posTitle].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'emp ' + id); }
emp('E1', 'أحمد علي حسن', 'محاسب تكاليف'); emp('E2', 'كريم محمود سالم', 'محاسب تكاليف'); emp('E3', 'هاني فؤاد علي', 'أمين خزينة'); emp('E4', 'سامي نبيل رزق', 'أمين خزينة');
emp('E5', 'منى سعيد حسن', 'محاسب تكاليف');
fresh(); const occ = n => num(ctx.get_('POSITIONS', P[n].Position_ID).Occupied_HC); function num(x) { return Number(x || 0); }
ok(occ('محاسب تكاليف') === 3 && occ('أمين خزينة') === 2, 'headcount from employees: 3/4 and 2/2');

// who can open
let O = must(api('trf.options', t.acc, {}), 'manager options');
ok(O.employees.length === 3 && O.employees.every(e => /محاسب/.test(e.title)), 'manager sees his own employees only');
bad(api('trf.options', t.rec, {}), /المدير الحالي|فريق الموارد/, 'a recruiter cannot open');
ok(must(api('trf.options', t.staff, {}), 'hr options').employees.length === 5, 'HR staff see everyone');
bad(api('trf.submit', t.acc, { Employee_ID: 'E3', To_Position_ID: P['محصل'].Position_ID, Effective_Date: ctx.today_(), Reason: 'تجربة نقل موظف مش تبعي' }), /نطاقك|المدير الحالي/, 'manager cannot move another unit\'s employee');
const OUT = process.env.SHOTS || '.';
let failN = 0; function ok(c, m) { if (!c) { failN++; console.log('FAIL: ' + m); } }
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
const DATA = ['محمد عمارة', 'أحمد', 'كريم', 'هاني', 'سامي', 'منى', 'سارة', 'مدير', 'محاسب', 'أمين', 'محصل', 'العبور', 'إنشاص', 'الحسابات', 'الخزينة', 'احتياج', 'بدل', 'TRF-', 'الدرجة', 'التصنيف', 'الانتقالات', 'طبيعة'];

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0190-' + n + '.png', fullPage: true });

  // current manager opens a transfer
  await openTok(t.acc); if (!(await page.$('#nav [data-v="transfers"]'))) errors.push('menu item for a manager');
  await page.evaluate(() => go('transfers', 'open')); await page.waitForSelector('#trfNew');
  await page.click('#trfNew'); await page.waitForSelector('#tfER [data-pe]');
  await page.click('#tfER [data-pe]'); await page.waitForSelector('#tfTR [data-pt]');
  const opts = await page.$$eval('#tfTR [data-pt]', a => a.map(x => x.textContent));
  if (opts.some(o => /أمين خزينة/.test(o))) errors.push('full position not offered');
  await page.fill('#tfT', 'محصل'); await page.waitForTimeout(500); await page.click('#tfTR [data-pt]'); await page.waitForSelector('#tfItems .tfrow');
  if (!/لازم طلب تعديل مفردات راتب/.test(await page.textContent('#tfStep3'))) errors.push('pay flags shown');
  await page.fill('#tfW', 'احتياج تحصيل في إنشاص'); await page.fill('#tfS', '8 ص – 4 م');
  const rows = await page.$$('#tfItems .tfrow');
  await rows[0].$('[data-k="from"]').then(e => e.fill('—')); await rows[0].$('[data-k="to"]').then(e => e.fill('5'));
  await shot('1-form');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#trfD .trfmove');
  await shot('2-detail-requester');
  fresh(); const TR = ctx.all_('TRANSFER_REQUESTS')[0]; if (!TR || TR.Current_Step !== 'TO_MGR') errors.push('submitted to the new manager');
  // new manager approves from the to-do
  await openTok(t.trs); if (!/طلب نقل داخلي مستني اعتمادك/.test(await page.textContent('#main'))) errors.push('home to-do');
  await page.evaluate(() => go('transfers')); await page.waitForSelector('#trfBody [data-tr]'); await shot('3-list-mine');
  await page.click('#trfBody [data-tr]'); await page.waitForSelector('#trA');
  if (/<td dir="ltr">5<\/td>/.test(await page.innerHTML('#trfD'))) errors.push('manager does not see amounts');
  await page.click('#trA'); await page.waitForSelector('#trNt'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
  // HR manager + HR sector manager
  for (const tok of [t.hr, t.sec]) { await openTok(tok); await page.evaluate(id => go('trf', id), TR.Transfer_ID); await page.waitForSelector('#trA'); await page.click('#trA'); await page.waitForSelector('#trNt'); await page.click('#mActions .btn.primary'); await page.waitForTimeout(600); }
  await openTok(t.hr); await page.evaluate(id => go('trf', id), TR.Transfer_ID); await page.waitForSelector('#trN');
  if (!/اتنفذ/.test(await page.textContent('#trfD'))) errors.push('done');
  await shot('4-detail-done');
  await page.click('#trPr'); await page.waitForTimeout(300); if (!(await page.$('#printArea .pr-t'))) errors.push('notice print');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: OUT + '/v0190-5-notice.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });
  await page.click('#trN'); await page.waitForTimeout(400);
  fresh(); if (!ctx.get_('TRANSFER_REQUESTS', TR.Transfer_ID).Payroll_Notified_At) errors.push('payroll notified');
  fresh(); if (ctx.findOne_('EMPLOYEES', { Employee_ID: TR.Employee_ID }).Position_ID !== P['محصل'].Position_ID) errors.push('employee moved');
  // HR from the employee page
  await page.evaluate(() => go('emps')); await page.waitForTimeout(500); await page.evaluate(() => empOpen('E3')); await page.waitForSelector('#mActions');
  await page.click('#mActions button:has-text("طلب نقل داخلي")'); await page.waitForSelector('#tfER [data-pe]');
  if (!/هاني/.test(await page.textContent('#tfER'))) errors.push('form opened for the employee');
  await page.evaluate(() => closeModal());

  // English
  api('me.setLang', t.hr, { lang: 'en' });
  await openTok(t.hr); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  async function left(name) {
    const found = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('#printArea')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    if (real.length) console.log('[' + name + '] Arabic left: ' + real.join(' | '));
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/v0190-en-' + name + '.png', fullPage: true });
  }
  await page.evaluate(id => go('trf', id), TR.Transfer_ID); await page.waitForSelector('.trfsteps'); await page.waitForTimeout(300); await left('detail');
  await page.evaluate(() => go('transfers', 'all')); await page.waitForSelector('#trfBody table'); await page.waitForTimeout(300); await left('list');
  await page.click('#trfNew'); await page.waitForSelector('#tfER [data-pe]'); await page.click('#tfER [data-pe]'); await page.waitForSelector('#tfTR [data-pt]'); await page.click('#tfTR [data-pt]'); await page.waitForSelector('#tfStep3:not(.hidden) #tfW'); await page.waitForTimeout(300); await left('form');
  await page.evaluate(() => closeModal());

  // phone
  api('me.setLang', t.hr, { lang: 'ar' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(t.hr) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [v, a] of [['trf', TR.Transfer_ID], ['transfers', 'all']]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(600);
    await ph.screenshot({ path: OUT + '/v0190-phone-' + v + '.png', fullPage: true });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + v + ': ' + w);
  }
  await ph.click('#trfNew'); await ph.waitForSelector('#tfER [data-pe]'); await ph.click('#tfER [data-pe]'); await ph.waitForSelector('#tfTR [data-pt]'); await ph.click('#tfTR [data-pt]'); await ph.waitForSelector('#tfStep3:not(.hidden) #tfW'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0190-phone-form.png', fullPage: true });
  if (await ph.evaluate(() => document.documentElement.scrollWidth) > 392) errors.push('phone overflow on the form');
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui25 OK');
})().catch(e => { console.error(e); process.exit(1); });
