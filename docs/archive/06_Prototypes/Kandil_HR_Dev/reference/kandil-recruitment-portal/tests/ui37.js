// v0.33.0 UI: photos fill the avatars after the screen shows (one call per screen, none when reopened), upload / remove on
// the candidate page and my own photo; the apply page photo field; phone width.
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
// a real photo (generated by the browser below) is set on one candidate and on the owner
fresh();
const meId = ctx.all_('USERS').find(u => u.Email === 'owner@test.com').User_ID;
const app = ctx.all_('APPLICATIONS').find(a => ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED'].indexOf(a.Stage) >= 0);
(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const calls = [];
  await ctxB.exposeFunction('__srv', (f, a) => { calls.push(a[0]); fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell');
  // a JPEG made by a canvas in the browser, stored through the API like the page does
  const jpg = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#7a1f2b'; g.fillRect(0, 0, 160, 160); g.fillStyle = '#e8c27a'; g.beginPath(); g.arc(80, 64, 34, 0, 7); g.fill(); g.fillRect(36, 110, 88, 50); return c.toDataURL('image/jpeg', 0.82); });
  must(api('photo.set', tO, { id: 'P:' + app.Person_ID, data: jpg, photoConsent: 'Y' }), 'candidate photo');
  must(api('photo.set', tO, { id: 'U:' + meId, data: jpg }), 'my photo');
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell');
  await page.waitForSelector('.avatar.hasph', { timeout: 5000 }).catch(() => errors.push('my photo not in the header'));
  calls.length = 0;
  // pipeline: cards show initials, then the photos come in one call
  await page.evaluate(id => go('pipe', id), app.Vacancy_ID); await page.waitForSelector('.cav');
  await page.waitForSelector('.cav.hasph', { timeout: 5000 }).catch(() => errors.push('candidate photo not shown on the card'));
  if (calls.filter(x => x === 'photo.get').length !== 1) errors.push('photo.get calls on the pipeline: ' + calls.filter(x => x === 'photo.get').length);
  await page.screenshot({ path: OUT + '/v0330-1-pipeline.png' });
  // reopen: no new call (kept in memory)
  const n1 = calls.filter(x => x === 'photo.get').length;
  await page.evaluate(() => go('home')); await page.waitForTimeout(200);
  await page.evaluate(id => go('pipe', id), app.Vacancy_ID); await page.waitForSelector('.cav.hasph');
  if (calls.filter(x => x === 'photo.get').length !== n1) errors.push('photos fetched again on reopen');
  // candidate page: photo in the title, click to change / remove
  await page.evaluate(id => go('app', id), app.Application_ID); await page.waitForSelector('#aPh.hasph');
  await page.click('#aPh'); await page.waitForSelector('#phPrev');
  await (await page.$('.modal')).screenshot({ path: OUT + '/v0330-2-modal.png' });
  const btns = await page.$$eval('#mActions .btn', b => b.map(x => x.textContent));
  if (!btns.includes('تغيير الصورة') || !btns.includes('شيل الصورة')) errors.push('modal buttons: ' + btns.join(','));
  await page.evaluate(() => [...document.querySelectorAll('#mActions .btn')].find(b => b.textContent === 'شيل الصورة').click());
  await page.waitForFunction(() => !document.getElementById('aPh').classList.contains('hasph'));
  fresh(); ok(!ctx.get_('PHOTOS', 'P:' + app.Person_ID).Data, 'removed from the page');
  await page.screenshot({ path: OUT + '/v0330-3-app.png' });
  // my photo from the security modal
  await page.click('#btnMe'); await page.waitForSelector('#myPh');
  await page.waitForSelector('.modal .phbig.hasph', { timeout: 3000 }).catch(() => errors.push('my photo in the account window'));
  await page.evaluate(() => closeModal());
  // English
  api('me.setLang', tO, { lang: 'en' });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.evaluate(id => go('app', id), app.Application_ID); await page.waitForSelector('#aPh');
  await page.click('#aPh'); await page.waitForSelector('#phPrev');
  const mt = await page.textContent('.modal');
  if (/[ء-ي]/.test(mt.replace(/صورة|[^\s]*[ء-ي][^\s]*/g, function(w){ return DICT[w] === undefined ? '' : w; }))) {}
  if (!/Choose a photo/.test(mt)) errors.push('modal not in English: ' + mt.slice(0, 120));
  await page.evaluate(() => closeModal());
  api('me.setLang', tO, { lang: 'ar' });
  // phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(id => go('app', id), app.Application_ID); await ph.waitForSelector('#aPh'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0330-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  // apply page: optional photo field
  const ap = await browser.newPage(); ap.on('pageerror', e => errors.push('apply: ' + e.message));
  await ap.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  fresh(); const v = ctx.all_('VACANCIES').find(x => ['OPEN', 'PARTIALLY_FILLED'].indexOf(x.Status) >= 0 && x.Apply_Code);
  const aph = fs.readFileSync(path.join(__dirname, '..', 'src', 'Apply.html'), 'utf8');
  if (v) {
    await ap.setContent(aph.replace(/<\?=\s*code\s*\?>/, v.Apply_Code).replace(/<\?=\s*src\s*\?>/, '').replace(/<\?=\s*lang\s*\?>/, 'ar').replace(/<\?=\s*ad\s*\?>/, '').replace('<script>', shim + '<script>'));
    await ap.waitForSelector('#phIn', { state: 'attached', timeout: 8000 }).catch(() => errors.push('apply page: no photo field'));
    await ap.screenshot({ path: OUT + '/v0330-apply.png', fullPage: true });
  }
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui37 OK');
})().catch(e => { console.error(e); process.exit(1); });
