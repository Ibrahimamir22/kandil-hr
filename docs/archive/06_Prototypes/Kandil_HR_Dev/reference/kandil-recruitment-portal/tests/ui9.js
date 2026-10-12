// English interface: login, switch, every main screen in left-to-right English; reports Arabic left on each screen.
// Env: SHOTS (screenshot folder). Prints leftovers per screen; fails if a dictionary text was left untranslated.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'رئيس قسم التكاليف', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '2']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
// English names for part of the master data (the rest stays Arabic on purpose: shows the fallback)
ctx.all_('ORG_UNITS').forEach(u => { const en = { 'قنديل مصر': 'Kandil Egypt', 'القطاع المالي': 'Finance Sector', 'الحسابات': 'Accounts', 'التكاليف': 'Costing' }[u.Name_AR]; if (en) ctx.update_('ORG_UNITS', u.Org_Unit_ID, { Name_EN: en }, 'x'); });
ctx.all_('JOBS').forEach(j => { const en = { 'محاسب تكاليف': 'Cost Accountant', 'رئيس قسم التكاليف': 'Head of Costing', 'مدير الحسابات': 'Accounts Manager' }[j.Job_Title_AR]; if (en) ctx.update_('JOBS', j.Job_Code, { Job_Title_EN: en }, 'x'); });
function user(email, name, pos, roles, en) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Full_Name_EN: en || '', Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي'], null, 'Hesham (CFO)'); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('cost@t.com', 'وليد رئيس التكاليف', P['رئيس قسم التكاليف'], null, 'Walid'); user('hr@t.com', 'منى', '', ['HR_MANAGER'], 'Mona');
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER'], 'Sara Abdallah'); user('recmgr@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
fresh(); ctx.update_('USERS', ctx.findUserByEmail_('owner@test.com').User_ID, { Full_Name_EN: 'Mohamed Omara' }, 'x');
const tCost = login('cost@t.com'), tAcc = login('acc@t.com'), tCfo = login('cfo@t.com'), tHr = login('hr@t.com'), tRM = login('recmgr@t.com'), tRec = login('rec@t.com');
const rq = api('req.submit', tCost, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في إقفال الشهر', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] });
api('req.action', tAcc, { Request_ID: rq.Request_ID, action: 'APPROVE' }); api('req.action', tCfo, { Request_ID: rq.Request_ID, action: 'APPROVE' });
const vacId = api('req.action', tHr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'IMPORTANT' } }).vacancies[0];
api('vac.assign', tRM, { Vacancy_ID: vacId, Lead_Recruiter_ID: rec }); api('vac.update', tRM, { Vacancy_ID: vacId, action: 'OPEN' });
const code = api('cand.applySettings', tRec, { Vacancy_ID: vacId, Apply_Enabled: 'Y', Public_Summary: 'مطلوب محاسب تكاليف.' }).code;
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3', src: 'LINKEDIN' };
pub('apply.submit', Object.assign({}, base, { Full_Name: 'محمود حسن إبراهيم', Mobile: '01011112222', Email: 'm@x.com', Expected_Salary: '15000' }));
pub('apply.submit', Object.assign({}, base, { Full_Name: 'محمود حسن', Mobile: '01011112222', src: 'WUZZUF' }));
// a second request returned for changes, a draft PCR
const rq2 = api('req.submit', tCost, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'احتياج للموسم', Requested_Priority: 'IMPORTANT', Required_By_Date: '2099-02-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] });
api('req.action', tAcc, { Request_ID: rq2.Request_ID, action: 'RETURN', comment: 'وضّح المبرر' });
// sourcing: a paid subscription, a published ad and a draft ad
const today = new Date(), dd = n => { const d = new Date(today.getTime() + n * 864e5); return d.toISOString().slice(0, 10); };
const sub = api('sub.save', tRM, { Source_Code: 'WUZZUF', Package: 'باقة 2 إعلان', Start_Date: dd(-30), End_Date: dd(5), Ad_Credits: '2', CV_Credits: '50', Cost: '6000' });
const adW = api('ad.create', tRec, { Vacancy_ID: vacId, Source_Code: 'WUZZUF', Language: 'ar' });
api('ad.status', tRec, { Ad_ID: adW.Ad_ID, to: 'PUBLISHED', Post_URL: 'https://wuzzuf.net/x' });
const adF = api('ad.create', tRec, { Vacancy_ID: vacId, Source_Code: 'FACEBOOK', Language: 'ar' });
fresh(); const appId = ctx.all_('APPLICATIONS')[0].Application_ID;

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const DICT = vm.runInContext('i18nEn_()', ctx);
// Arabic that is data on purpose (no English name recorded): names, free text typed by users
const DATA = ['مدير القطاع المالي', 'محاسب تكاليف', 'مدير الحسابات', 'رئيس قسم التكاليف', 'الرئيس التنفيذي', 'هشام', 'وليد', 'منى', 'سارة', 'محمود', 'ضغط شغل', 'احتياج للموسم', 'وضّح المبرر', 'مطلوب محاسب', 'محمد عمارة', 'مدير التوظيف', 'باقة 2 إعلان', 'قنديل مصر'];

(async () => {
  const errors = [], report = {}; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR ' + e.message); });
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  async function leftovers(name) {
    const found = await page.evaluate(() => {
      const out = new Set(), AR = /[ء-ي]/;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) {
        const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.nodeName) || p.closest('[data-nt]')) continue;
        if (p.closest('.hidden') || p.offsetParent === null && p.nodeName !== 'OPTION') continue;
        if (AR.test(n.nodeValue)) out.add(n.nodeValue.trim().replace(/\s+/g, ' '));
      }
      document.querySelectorAll('[placeholder],[title]').forEach(e => { ['placeholder', 'title'].forEach(a => { const v = e.getAttribute(a); if (v && AR.test(v) && !e.closest('[data-nt]')) out.add('@' + a + ': ' + v); }); });
      return [...out];
    });
    const real = found.filter(s => !DATA.some(d => s.indexOf(d) >= 0));
    report[name] = real;
    real.filter(s => DICT[s] !== undefined && DICT[s] !== s).forEach(s => errors.push(name + ': dictionary text left in Arabic: ' + s));
    await page.screenshot({ path: OUT + '/en-' + name + '.png' });
  }
  // login screen in English (device preference), then the switch back and forth
  await page.setContent(idx); await page.waitForSelector('#loginEmail');
  // an empty dictionary saved on the device by an older page (same version) must not break the switch
  const ver = vm.runInContext('I18N_VERSION', ctx);
  await page.evaluate(v => store('krp_i18n', JSON.stringify({ v: v })), ver);
  await page.click('#btnLang'); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await leftovers('01-login');
  if (await page.textContent('#btnSendCode') !== 'Send sign-in code') errors.push('login button not English');
  // owner already chose English on the server? set it so boot keeps English
  api('me.setLang', tO, { lang: 'en' });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();'));
  await page.waitForSelector('.shell'); await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.waitForTimeout(300); await leftovers('02-home');
  const navTxt = await page.textContent('#nav'); if (!/Requests/.test(navTxt) || /الطلبات/.test(navTxt)) errors.push('nav not English: ' + navTxt.slice(0, 80));
  const views = [['03-newreq', 'newreq'], ['04-reqs', 'reqs'], ['05-approvals', 'approvals'], ['06-vacancies', 'vacancies'], ['07-cands', 'cands'], ['08-pcr', 'pcr'],
    ['09-org', 'org'], ['10-users', 'users'], ['11-emps', 'emps'], ['12-jds', 'jds'], ['13-locs', 'locs'], ['14-import', 'import'], ['15-audit', 'audit'],
    ['16-rules', 'rules'], ['17-config', 'config'], ['18-guide', 'guide'], ['19-notif', 'notif']];
  for (const [name, v] of views) { await page.evaluate(v => go(v), v); await page.waitForTimeout(500); await leftovers(name); }
  await page.evaluate(id => go('req', id), rq.Request_ID); await page.waitForTimeout(500); await leftovers('20-request');
  await page.evaluate(id => go('pipe', id), vacId); await page.waitForTimeout(500); await leftovers('21-pipeline');
  await page.evaluate(id => go('app', id), appId); await page.waitForTimeout(500); await leftovers('22-application');
  for (const tab of ['subs', 'srcs', 'tpls']) { await page.evaluate(t => go('sources', t), tab); await page.waitForTimeout(500); await leftovers('27-sources-' + tab); }
  await page.evaluate(() => go('sources', 'subs')); await page.waitForSelector('[data-sb]').catch(() => errors.push('no subscription row'));
  await page.click('[data-sb]').catch(() => {}); await page.waitForTimeout(400); await leftovers('28-subscription'); await page.evaluate(() => closeModal());
  await page.evaluate(id => go('pipe', id), vacId); await page.waitForTimeout(500);
  await page.click('[data-ad]').catch(() => errors.push('no ad row on pipeline')); await page.waitForTimeout(400); await leftovers('29-ad-editor'); await page.evaluate(() => closeModal());
  await page.evaluate(() => go('org')); await page.waitForTimeout(300);
  await page.click('.node .nm >> text=Costing').catch(() => errors.push('unit English name not shown in tree'));
  await page.waitForTimeout(400); await leftovers('23-org-unit');
  await page.evaluate(() => go('users')); await page.waitForSelector('#uList [data-e]'); await page.click('#uList [data-e]');
  await page.waitForSelector('#uLang'); await leftovers('24-user-form'); await page.evaluate(() => closeModal());
  // switch back to Arabic from the header
  await page.click('#btnLang'); await page.waitForFunction(() => document.documentElement.dir === 'rtl');
  await page.waitForTimeout(300);
  if (!/الرئيسية/.test(await page.textContent('#nav'))) errors.push('switch back to Arabic failed');
  fresh(); if (ctx.findUserByEmail_('owner@test.com').Lang !== 'ar') errors.push('switch not saved on the account');
  await page.screenshot({ path: OUT + '/en-25-back-to-arabic.png' });
  // phone, English, manager with a returned request
  api('me.setLang', tCost, { lang: 'en' });
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 } }); ph.on('pageerror', e => errors.push(e.message));
  await ph.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tCost) + ' || loadToken();'));
  await ph.waitForSelector('.shell'); await ph.waitForTimeout(500);
  await ph.screenshot({ path: OUT + '/en-26-phone-manager.png', fullPage: true });
  const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow ' + w);
  await browser.close();
  Object.keys(report).forEach(k => { if (report[k].length) console.log('[' + k + '] ' + report[k].length + ' Arabic texts:\n  ' + report[k].join('\n  ')); });
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui9 English OK');
})().catch(e => { console.error(e); process.exit(1); });
