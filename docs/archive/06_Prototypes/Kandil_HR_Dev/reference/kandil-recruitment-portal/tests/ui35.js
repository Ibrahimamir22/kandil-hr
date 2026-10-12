// v0.31.0 UI: AI CV reading — the card on the candidate page, the suggested-data dialog (save the picked fields), the settings card; English + phone.
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
// switch on, save a key, a PDF CV on a candidate with empty fields, and a mocked Anthropic answer
const KEY = 'sk-ant-api03-' + 'AbCdEf_123-'.repeat(6) + 'WXYZ';
must(api('cvai.setKey', tO, { key: KEY, reason: 'مفتاح الشركة' }), 'key');
must(api('config.update', tO, { Config_Key: 'CVAI_ENABLED', Config_Value: 'Y', reason: 'تشغيل' }), 'on');
fresh();
const app = ctx.all_('APPLICATIONS').find(a => ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED'].indexOf(a.Stage) >= 0);
const PID = app.Person_ID, AID = app.Application_ID;
const cv = ctx.saveCv_(PID, { bytes: Array.from(Buffer.from('%PDF-1.4\nCV')), mime: 'application/pdf', name: 'cv.pdf' });
ctx.update_('PERSONS', PID, { CV_File_ID: cv.id, CV_File_Name: 'cv.pdf', CV_Updated_At: ctx.nowIso_(), Specialization: '', Graduation_Year: '', Experience_Years: '', Current_Employer: '', Current_Title: 'بائع' }, 'x');
let calls = 0;
ctx.__fetch = () => { calls++; return { code: 200, body: { content: [{ type: 'text', text: JSON.stringify({ readable: true,
  fields: { Full_Name: '', Mobile: '', Email: '', National_ID: '', Birth_Date: '', Gender: '', Governorate: 'الجيزة', City: '', Education: 'BACHELOR', Specialization: 'تجارة',
    Graduation_Year: '2017', Experience_Years: '6', Current_Employer: 'شركة الأثاث الحديث', Current_Title: 'محاسب أول' },
  skills: ['Excel', 'SAP'], languages: ['الإنجليزية'], summary: 'محاسب بخبرة ست سنين في شركات صناعية، شغال على أنظمة SAP.',
  match: { score: 4, strengths: ['خبرة في التكاليف', 'شغل على SAP'], gaps: ['مفيش شهادة مهنية'] } }) }], usage: { input_tokens: 5200, output_tokens: 480 } } }; };

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0310-' + n + '.png', fullPage: true });
  const mshot = async n => { await (await page.$('.modal')).screenshot({ path: OUT + '/v0310-' + n + '.png' }); };

  await openTok(tO);
  await page.evaluate(id => go('app', id), AID); await page.waitForSelector('#cvaiGo');
  await (await page.$('#cvaiCard')).screenshot({ path: OUT + '/v0310-1-card.png' });
  await page.click('#cvaiGo');
  await page.waitForSelector('[data-cvk]');
  const rows = await page.$$eval('[data-cvk]', a => a.map(x => [x.dataset.cvk, x.checked]));
  const R = Object.fromEntries(rows);
  if (R.Experience_Years !== true || R.Specialization !== true) errors.push('empty fields ticked: ' + JSON.stringify(R));
  if (R.Current_Title !== false) errors.push('field with data not ticked by default');
  if ('Full_Name' in R || 'Mobile' in R) errors.push('empty suggestions are not offered');
  await mshot('2-suggestions');
  await page.click('#mActions .btn.primary');
  await page.waitForSelector('#cvaiCard .pill.ok');
  fresh();
  const per = ctx.get_('PERSONS', PID);
  ok(per.Experience_Years === '6' && per.Specialization === 'تجارة' && per.Current_Employer === 'شركة الأثاث الحديث' && per.Current_Title === 'بائع' && per.Education === 'BACHELOR', 'picked fields saved, the unticked one kept: ' + JSON.stringify([per.Experience_Years, per.Current_Title]));
  ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_ID === PID && /قراءة السيرة الذاتية بالذكاء الاصطناعي/.test(a.Reason || '')), 'saved with the reading as the reason');
  ok(calls === 1, 'one API call');
  const card = await page.textContent('#cvaiCard');
  if (!/المطابقة 80%/.test(card) || !/خبرة في التكاليف/.test(card) || !/مفيش شهادة مهنية/.test(card) || !/SAP/.test(card)) errors.push('card content: ' + card.slice(0, 200));
  await shot('3-app');
  // reopening uses the saved reading
  await page.evaluate(id => go('app', id), AID); await page.waitForSelector('#cvaiCard .pill.ok');
  if (calls !== 1) errors.push('reopening called the API again');
  await page.click('#cvaiApply'); await page.waitForTimeout(400);
  if (await page.$('[data-cvk="Experience_Years"]')) errors.push('already-saved fields offered again');
  if (await page.$('.modal')) await page.evaluate(() => closeModal());
  // settings card
  await page.evaluate(() => go('config')); await page.waitForSelector('#cAi .facts');
  const st = await page.textContent('#cAi');
  if (!/WXYZ/.test(st) || !/شغالة/.test(st) || st.indexOf(KEY) >= 0) errors.push('settings card: ' + st.slice(0, 160));
  await (await page.$('#cAi')).screenshot({ path: OUT + '/v0310-4-settings.png' });
  await page.click('#aiKey'); await page.waitForSelector('#aiK');
  if ((await page.getAttribute('#aiK', 'type')) !== 'password') errors.push('key field hidden');
  await page.evaluate(() => closeModal());
  // recruiter: card but no settings card
  const tRec = tAs(demo('سارة نبيل (تجريبي)'));
  await openTok(tRec); await page.evaluate(() => go('config')); await page.waitForTimeout(400);
  if (await page.$('#cAi')) errors.push('recruiter sees the AI settings');
  // English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  const leftOn = async label => {
    const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]') || p.closest('tbody td:first-child')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English (' + label + '): dictionary text left in Arabic: ' + s));
  };
  await page.evaluate(id => go('app', id), AID); await page.waitForSelector('#cvaiCard'); await leftOn('candidate');
  await (await page.$('#cvaiCard')).screenshot({ path: OUT + '/v0310-5-card-en.png' });
  await page.evaluate(() => go('config')); await page.waitForSelector('#cAi .facts'); await leftOn('settings');
  api('me.setLang', tO, { lang: 'ar' });
  // phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(id => go('app', id), AID); await ph.waitForSelector('#cvaiCard'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0310-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui35 OK');
})().catch(e => { console.error(e); process.exit(1); });
