const { navClick } = require('./navhelp.js');
// Phase 3B-1 UI: ads on the vacancy page (create, edit, publish, credits), sources & subscriptions screen, ads-to-close task.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '3']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']); const rm = user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']); const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']);
const t = { acc: login('acc@t.com'), cfo: login('cfo@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com') };
const rq = api('req.submit', t.acc, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في الإقفال الشهري', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Education: 'بكالوريوس تجارة', Specialization: 'محاسبة', Experience_Years: '2',
  lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] });
api('req.action', t.cfo, { Request_ID: rq.Request_ID, action: 'APPROVE' });
const vacId = api('req.action', t.hr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'IMPORTANT' } }).vacancies[0];
api('vac.assign', t.rm, { Vacancy_ID: vacId, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: vacId, action: 'OPEN' });
api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'Y', Public_Summary: 'مطلوب محاسب تكاليف لمصنع العبور — متابعة تكاليف الإنتاج والمخزون.' });
api('sub.save', t.rm, { Source_Code: 'WUZZUF', Package: 'باقة 5 إعلانات + 100 بحث', Start_Date: day(-20), End_Date: day(9), Ad_Credits: '5', CV_Credits: '100', Cost: '9500', Owner_User_ID: rm });
api('sub.save', t.rm, { Source_Code: 'LINKEDIN', Package: 'Recruiter Lite', Start_Date: day(-200), End_Date: day(160), Ad_Credits: '0', CV_Credits: '30', Cost: '12000' });

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  await open(t.rec);
  await page.evaluate(id => go('pipe', id), vacId); await page.waitForSelector('#adNew');
  await page.screenshot({ path: OUT + '/ad-1-empty.png', fullPage: true });
  await page.click('#adNew'); await page.waitForSelector('#anS');
  await page.selectOption('#anS', 'FACEBOOK'); await page.fill('#anC', 'جروب وظائف العبور');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#aeB');
  const body = await page.inputValue('#aeB');
  if (!/محاسب تكاليف/.test(body) || !/&ad=AD-/.test(body)) errors.push('generated body: ' + body.slice(0, 100));
  await page.screenshot({ path: OUT + '/ad-2-editor.png', fullPage: true });
  await page.fill('#aeU', 'https://facebook.com/groups/obour/posts/1'); await page.fill('#aeK', '0');
  await page.click('#mActions button:has-text("سجّل إنه اتنشر")'); await page.waitForSelector('#adCard td .pill.ok');
  // Wuzzuf (paid)
  await page.click('#adNew'); await page.waitForSelector('#anS'); await page.selectOption('#anS', 'WUZZUF');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#aeB');
  await page.click('#mActions button:has-text("سجّل إنه اتنشر")'); await page.waitForTimeout(500);
  fresh(); if (ctx.find_('SOURCE_USAGE', { Kind: 'AD' }).length !== 1) errors.push('wuzzuf credit not used');
  // LinkedIn has no ad credits → offer to publish without subscription
  await page.click('#adNew'); await page.waitForSelector('#anS'); await page.selectOption('#anS', 'LINKEDIN'); await page.selectOption('#anL', 'en');
  await page.click('#mActions .btn.primary'); await page.waitForSelector('#aeB');
  await page.screenshot({ path: OUT + '/ad-3-editor-en.png', fullPage: true });
  await page.click('#mActions button:has-text("سجّل إنه اتنشر")'); await page.waitForTimeout(500);
  if (await page.$('#mMsg .msg.err')) errors.push('free LinkedIn should publish without a subscription');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/ad-4-list.png', fullPage: true });
  // applications through the Facebook ad
  fresh(); const fb = ctx.find_('ADVERTISEMENTS', { Source_Code: 'FACEBOOK' })[0], code = ctx.find_('VACANCIES', { Vacancy_ID: vacId })[0].Apply_Code;
  const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القليوبية', Education: 'BACHELOR', Experience_Years: '3', src: 'FACEBOOK', ad: fb.Ad_ID };
  pub('apply.submit', Object.assign({}, base, { Full_Name: 'أحمد علي حسن', Mobile: '01011112222' }));
  pub('apply.submit', Object.assign({}, base, { Full_Name: 'منى سامي فؤاد', Mobile: '01022223333' }));
  await page.evaluate(id => go('pipe', id), vacId); await page.waitForSelector('#adCard tr[data-ad]');
  const fbApps = await page.textContent('#adCard tbody'); if (!/2/.test(fbApps)) errors.push('apps per ad not shown');
  // sources screen as recruitment manager
  await open(t.rm);
  await navClick(page, 'sources'); await page.waitForSelector('[data-sb]');
  await page.screenshot({ path: OUT + '/ad-5-subscriptions.png', fullPage: true });
  const subTxt = await page.textContent('#sBody'); if (!/بينتهي خلال 9 يوم/.test(subTxt)) errors.push('expiring pill missing: ' + subTxt.slice(0, 200));
  await page.click('[data-sb]'); await page.waitForSelector('#suK');
  await page.selectOption('#suK', 'CV_SEARCH'); await page.fill('#suN', '12'); await page.fill('#suT', 'بحث محاسبين تكاليف');
  await page.screenshot({ path: OUT + '/ad-6-sub-detail.png' });
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  fresh(); if (!ctx.find_('SOURCE_USAGE', { Kind: 'CV_SEARCH' }).length) errors.push('manual usage not saved');
  await page.click('[data-st="srcs"]'); await page.waitForSelector('[data-sc]'); await page.screenshot({ path: OUT + '/ad-7-sources.png', fullPage: true });
  await page.click('[data-st="tpls"]'); await page.waitForSelector('[data-at]'); await page.screenshot({ path: OUT + '/ad-8-templates.png', fullPage: true });
  // ads-to-close task after applications close
  api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'N' });
  await open(t.rec); await navClick(page, 'cands'); await page.waitForSelector('#cBody tr[data-pipe]');
  await page.screenshot({ path: OUT + '/ad-9-task-close.png', fullPage: true });
  // phone: ads card
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(t.rec) + ' || loadToken();')); await ph.waitForSelector('.shell');
  await ph.evaluate(id => go('pipe', id), vacId); await ph.waitForSelector('#adCard tr[data-ad]');
  await ph.evaluate(() => document.getElementById('adCard').scrollIntoView()); await ph.screenshot({ path: OUT + '/ad-10-phone.png' });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow ' + w);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('NO_UI_ERRORS');
})().catch(e => { console.error(e); process.exit(1); });
