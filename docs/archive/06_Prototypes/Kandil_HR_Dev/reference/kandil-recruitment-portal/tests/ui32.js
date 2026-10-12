// v0.28.0 UI: change an approved request (HR form, requester increase → linked request), several vacancies in one step,
// move one recruiter's work, send the approved JD by e-mail; English + phone.
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
const U = { hr: demo('منى عادل (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const tHr = tAs(U.hr), tRm = tAs(U.rm);
fresh();
const target = ctx.all_('VACANCIES').find(v => ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0 && ctx.get_('RECRUITMENT_REQUESTS', v.Request_ID).Status === 'APPROVED' && Number(v.Joined_HC || 0) === 0 && !ctx.all_('APPLICATIONS').some(a => a.Vacancy_ID === v.Vacancy_ID && a.Stage === 'ACCEPTED'));
const RID = target.Request_ID, VID = target.Vacancy_ID, req0 = ctx.get_('RECRUITMENT_REQUESTS', RID);
const tReq = tAs(req0.Requester_User_ID);
// an approved JD to send
const oid = ctx.all_('USERS').find(u => u.Email === 'owner@test.com').User_ID;
ctx.withLock_(() => { ctx.jdUpsertDraft_(oid, target.Job_Code, { Purpose: 'حساب التكاليف بدقة', Responsibilities: JSON.stringify(['مسؤولية 1']), KPIs: '[]', Authority: '[]', Competencies_JSON: '[]', Qualifications: 'بكالوريوس', Experience: 'سنتين', Working_Conditions: 'مكتب' }); });
fresh(); ctx.jdApproveOne_(oid, target.Job_Code, 'اعتماد');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('MAIL_COUNT', '0')", ctx);

(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ctxB.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();').replace('</head>', TALL + '</head>')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0280-' + n + '.png', fullPage: true });
  const mshot = async n => { await (await page.$('.modal')).screenshot({ path: OUT + '/v0280-' + n + '.png' }); };

  // ---- HR: change after approval
  await openTok(tHr);
  await page.evaluate(id => go('req', id), RID); await page.waitForSelector('#rdChange');
  if (!/تعديل بعد الاعتماد/.test(await page.textContent('#rdChange'))) errors.push('HR button label');
  await page.click('#rdChange'); await page.waitForSelector('#chDate');
  await mshot('1-change-hr');
  const nd = await page.evaluate(() => { const d = new Date(Date.now() + 50 * 864e5); return d.toISOString().slice(0, 10); });
  await page.fill('#chDate', nd); await page.fill('#chNotes', 'ملاحظة تجربة الشاشة رقم 7');
  await page.fill('#chWhy', 'المدير طلب تأجيل الموعد');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => !document.querySelector('.modal'));
  await page.waitForFunction(() => /تعديل بعد الاعتماد/.test(document.getElementById('main').textContent));
  fresh(); ok(ctx.get_('RECRUITMENT_REQUESTS', RID).Required_By_Date === nd && ctx.get_('VACANCIES', VID).Required_By_Date === nd, 'date changed on request and vacancy');
  await shot('2-request-after-change');
  // ---- requester: increase
  await openTok(tReq);
  await page.evaluate(id => go('req', id), RID); await page.waitForSelector('#rdChange');
  if (!/طلب زيادة العدد/.test(await page.textContent('#rdChange'))) errors.push('requester button label');
  await page.click('#rdChange'); await page.waitForSelector('[data-chc]');
  if (await page.$('#chDate')) errors.push('requester sees the HR fields');
  const cur = Number(await page.inputValue('[data-chc]'));
  await page.fill('[data-chc]', String(cur + 1)); await page.fill('#chWhy', 'الشغل زاد في الموسم');
  await mshot('3-increase');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => !document.querySelector('.modal'));
  await page.waitForSelector('[data-goreq]');
  fresh(); const sup = ctx.all_('RECRUITMENT_REQUESTS').find(r => r.Parent_Request_ID === RID);
  ok(sup && sup.Status !== 'DRAFT', 'linked request created and submitted');
  await shot('4-parent-with-increase');
  await page.click('[data-goreq]'); await page.waitForFunction(id => document.getElementById('main').textContent.indexOf(id) >= 0 && /زيادة عدد/.test(document.getElementById('main').textContent), sup.Request_ID);
  await shot('5-linked-request');

  // ---- vacancies: several at once, and move one recruiter's work
  await openTok(tRm);
  await page.evaluate(() => { S.vf = null; go('vacancies'); }); await page.waitForSelector('[data-vpk]');
  if (!(await page.$eval('#vbAssign', b => b.disabled))) errors.push('assign disabled until something is picked');
  const boxes = await page.$$('[data-vpk]:not([disabled])'); for (const b of boxes.slice(0, 3)) await b.check();
  if (!/اخترت 3/.test(await page.textContent('#vbN'))) errors.push('picked count');
  await shot('6-vacancies-picked');
  await page.click('#vbAssign'); await page.waitForSelector('#vbLead');
  const opts = await page.$$eval('#vbLead option', o => o.map(x => x.value).filter(Boolean));
  await page.selectOption('#vbLead', U.rec1); await page.fill('#vbWhy', 'توزيع الشهر');
  await mshot('7-assign-many');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => !document.querySelector('#vbLead'));
  await page.waitForTimeout(500);
  fresh(); ok(ctx.all_('VACANCIES').filter(v => v.Lead_Recruiter_ID === U.rec1).length >= 3, 'three vacancies on the chosen lead');
  await page.click('#vbMove'); await page.waitForSelector('#vmFrom');
  const other = opts.find(x => x !== U.rec1);
  await page.selectOption('#vmFrom', U.rec1); await page.selectOption('#vmTo', other); await page.fill('#vmWhy', 'استقالة');
  await mshot('8-move-all');
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => !document.querySelector('#vmFrom'));
  await page.waitForTimeout(500);
  fresh(); ok(!ctx.all_('VACANCIES').some(v => ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED', 'ON_HOLD'].indexOf(v.Status) >= 0 && v.Lead_Recruiter_ID === U.rec1), 'nothing left on the leaver');

  // ---- JD by e-mail
  await openTok(tHr);
  await page.evaluate(c => go('jd', c), target.Job_Code); await page.waitForSelector('#jdSendB');
  await page.click('#jdSendB'); await page.waitForSelector('[data-jsu]');
  await page.fill('#jsQ', 'مستخدم حقيقي'); await page.waitForTimeout(150);
  await page.check('[data-jsr]:not(.hidden) [data-jsu]'); await page.fill('#jsNote', 'للاطلاع');
  await mshot('9-jd-send');
  mails.length = 0;
  await page.click('#mActions .btn.primary'); await page.waitForFunction(() => !document.querySelector('[data-jsu]'));
  ok(mails.length === 1 && mails[0].to === 'real.hr@t.com' && mails[0].attachments.length === 1, 'JD mailed with its PDF');

  // ---- English
  api('me.setLang', tO, { lang: 'en' });
  await openTok(tO); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  const leftOn = async label => {
    const left = await page.evaluate(() => { const out = new Set(), AR = /[ء-ي]/; const root = document.querySelector('.overlay .modal') || document.getElementById('main'); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[data-nt]')) continue; if (p.offsetParent === null && p.nodeName !== 'OPTION') continue; if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim()); } return [...out]; });
    left.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push('English (' + label + '): dictionary text left in Arabic: ' + s));
  };
  await page.evaluate(id => go('req', id), RID); await page.waitForSelector('#rdChange'); await leftOn('request');
  await page.click('#rdChange'); await page.waitForSelector('#chDate'); await leftOn('change form'); await mshot('10-change-en'); await page.evaluate(() => closeModal());
  await page.evaluate(() => { S.vf = null; go('vacancies'); }); await page.waitForSelector('#vbMove'); await page.click('#vbMove'); await page.waitForSelector('#vmFrom'); await leftOn('move'); await page.evaluate(() => closeModal());
  await page.evaluate(c => go('jd', c), target.Job_Code); await page.waitForSelector('#jdSendB'); await page.click('#jdSendB'); await page.waitForSelector('[data-jsu]'); await leftOn('jd send'); await page.evaluate(() => closeModal());
  api('me.setLang', tO, { lang: 'ar' });

  // ---- phone
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tHr) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(id => go('req', id), RID); await ph.waitForSelector('#rdChange'); await ph.click('#rdChange'); await ph.waitForSelector('#chDate'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: OUT + '/v0280-phone.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow: ' + w);
  await browser.close();
  if (errors.length || failN) { console.log('ERRORS:\n' + errors.join('\n') + (failN ? '\nsetup failures: ' + failN : '')); process.exit(1); }
  console.log('ui32 OK');
})().catch(e => { console.error(e); process.exit(1); });
