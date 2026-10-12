// v0.32.0 UI: screens opened again within 10 minutes come from memory (no server call), a save clears the memory, a newer answer
// redraws the screen only when nothing is typed, and the speed card in the settings.
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
let failN = 0; function ok(c, m) { if (!c) { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مراجع حسابات', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', '', '', '', '', 'مدير قطاع المصانع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'فني تشغيل', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مشرف إنتاج', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'عامل تعبئة', 'العبور', '', '', '', '5'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مراقب جودة', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'فني معمل', 'العبور', '', '', '', '2']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
['محاسب تكاليف', 'محاسب عام', 'مراجع حسابات', 'أمين خزينة', 'مراقب جودة', 'فني معمل', 'مشرف إنتاج'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '7' }, 'x'));
['محصل', 'فني تشغيل', 'عامل تعبئة'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '5' }, 'x'));
// real data that must survive the wipe: a real HR user (with a manager position) and a real employee
const real = must(api('users.save', tO, { Email: 'real.hr@t.com', Full_Name_AR: 'مستخدم حقيقي', Position_ID: P['مدير الحسابات'].Position_ID }), 'real user');
must(api('users.setRoles', tO, { User_ID: real.User_ID, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'real roles');
const tR = login('real.hr@t.com');
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const TALL = '<style>.shell{height:auto!important}.body{min-height:0}.main{overflow:visible!important}.scroll{overflow:visible!important;flex:none!important}</style>';
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const tHr = tAs(demo('منى عادل (تجريبي)'));
fresh();
const app = ctx.all_('APPLICATIONS').find(a => ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW'].indexOf(a.Stage) >= 0);
(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const calls = [];
  await ctxB.exposeFunction('__srv', (f, a) => { calls.push(a[0]); fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell');
  const count = a => calls.filter(x => x === a).length;
  // open the candidate, go away, come back → from memory
  await page.evaluate(id => go('app', id), app.Application_ID); await page.waitForSelector('#aEdit');
  const n1 = count('cand.app');
  await page.evaluate(() => go('home')); await page.waitForTimeout(300);
  await page.evaluate(id => go('app', id), app.Application_ID); await page.waitForSelector('#aEdit');
  if (count('cand.app') !== n1) errors.push('second open went to the server: ' + count('cand.app') + ' vs ' + n1);
  // a save clears the memory: next open asks the server
  await page.evaluate(id => call('cand.next', { Application_ID: id, Next_Action: 'متابعة من الاختبار', Next_Action_Date: '2030-01-01' }), app.Application_ID);
  await page.evaluate(id => go('app', id), app.Application_ID); await page.waitForSelector('#aEdit');
  if (count('cand.app') !== n1 + 1) errors.push('after a save the screen was not re-read');
  if (!/متابعة من الاختبار/.test(await page.textContent('#main'))) errors.push('fresh data after save');
  // stale copy (older than 20 s): shown at once, refreshed quietly, redrawn when the server has newer data
  fresh(); ctx.update_('APPLICATIONS', app.Application_ID, { Next_Action: 'تغيير من مستخدم تاني' }, 'x');
  await page.evaluate(() => { Object.keys(RC).forEach(k => { RC[k].t -= 30000; }); });
  await page.evaluate(() => go('home')); await page.waitForTimeout(200);
  await page.evaluate(id => go('app', id), app.Application_ID);
  await page.waitForFunction(() => /تغيير من مستخدم تاني/.test(document.getElementById('main').textContent), null, { timeout: 5000 }).catch(() => errors.push('quiet refresh did not redraw'));
  // typed text is never wiped by a quiet refresh
  fresh(); ctx.update_('APPLICATIONS', app.Application_ID, { Next_Action: 'تغيير تالت' }, 'x');
  await page.evaluate(() => { Object.keys(RC).forEach(k => { RC[k].t -= 30000; }); });
  await page.evaluate(() => go('home')); await page.waitForTimeout(200);
  await page.evaluate(id => go('app', id), app.Application_ID); await page.waitForSelector('#acN');
  await page.fill('#acN', 'ملاحظة بكتبها'); await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(800);
  if ((await page.inputValue('#acN')) !== 'ملاحظة بكتبها') errors.push('typed note wiped by a refresh');
  // speed card
  await page.evaluate(() => go('config')); await page.waitForSelector('#cPerf');
  const perf = await page.textContent('#cPerf');
  if (!/cand\.app/.test(perf) || !/من الذاكرة/.test(perf)) errors.push('speed card: ' + perf.slice(0, 120));
  await (await page.$('#cPerf')).screenshot({ path: OUT + '/v0320-speed.png' });
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui36 OK');
})().catch(e => { console.error(e); process.exit(1); });
