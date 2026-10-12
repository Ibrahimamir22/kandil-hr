const { navClick } = require('./navhelp.js');
// Phase 3A UI: public apply page (AR/EN, mobile) + recruiter screens + hiring-manager shortlist.
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
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
user('cfo@t.com', 'هشام المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('cost@t.com', 'وليد رئيس التكاليف', P['رئيس قسم التكاليف']); user('hr@t.com', 'منى', '', ['HR_MANAGER']);
const rec = user('rec@t.com', 'سارة عبد الله', '', ['RECRUITER']); user('recmgr@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']);
const tCost = login('cost@t.com'), tAcc = login('acc@t.com'), tCfo = login('cfo@t.com'), tHr = login('hr@t.com'), tRM = login('recmgr@t.com'), tRec = login('rec@t.com');
const rq = api('req.submit', tCost, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في إقفال الشهر', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] });
api('req.action', tAcc, { Request_ID: rq.Request_ID, action: 'APPROVE' }); api('req.action', tCfo, { Request_ID: rq.Request_ID, action: 'APPROVE' });
const vacId = api('req.action', tHr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'IMPORTANT' } }).vacancies[0];
api('vac.assign', tRM, { Vacancy_ID: vacId, Lead_Recruiter_ID: rec }); api('vac.update', tRM, { Vacancy_ID: vacId, action: 'OPEN' });
const code = api('cand.applySettings', tRec, { Vacancy_ID: vacId, Apply_Enabled: 'Y', Public_Summary: 'مطلوب محاسب تكاليف للعمل بمصنع العبور.\nخبرة من سنتين في التكاليف ومراقبة المخزون.' }).code;
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3', src: 'LINKEDIN' };
pub('apply.submit', Object.assign({}, base, { Full_Name: 'محمود حسن إبراهيم', Mobile: '01011112222', Email: 'm@x.com', Expected_Salary: '15000', Current_Salary: '11000' }));
pub('apply.submit', Object.assign({}, base, { Full_Name: 'ياسمين طارق فهمي', Mobile: '01233334444', Specialization: 'محاسبة', Current_Employer: 'شركة النور', Current_Title: 'محاسبة تكاليف' }));
pub('apply.submit', Object.assign({}, base, { Full_Name: 'محمود حسن', Mobile: '01011112222', src: 'WUZZUF' }));

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');
const apply = fs.readFileSync(path.join(__dirname, '..', 'src', 'Apply.html'), 'utf8').replace(/<\?= code \?>/g, code).replace(/<\?= src \?>/g, 'FACEBOOK').replace(/<\?= lang \?>/g, 'ar').replace(/<\?= ad \?>/g, '').replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  async function newPage(w, h) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
    return page;
  }
  // ---------- public apply page (phone) ----------
  let pg = await newPage(390, 844);
  await pg.setContent(apply); await pg.waitForSelector('#f_Full_Name');
  await pg.screenshot({ path: OUT + '/a-1-apply-top.png' });
  await pg.fill('#f_Full_Name', 'أحمد سمير عبد الرحمن'); await pg.fill('#f_Mobile', '01098765432'); await pg.selectOption('#f_Governorate', 'القليوبية');
  await pg.selectOption('#f_Education', 'BACHELOR'); await pg.fill('#f_Experience_Years', '2');
  await pg.click('#send'); await pg.waitForSelector('#err .msg');
  const e1 = await pg.textContent('#err'); if (!/الخصوصية/.test(e1)) errors.push('consent msg: ' + e1);
  await pg.setInputFiles('#cvIn', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hi') });
  await pg.waitForSelector('.file.has');
  await pg.check('#consent'); await pg.check('#cTransfer'); await pg.check('#cSalary');
  await pg.evaluate(() => { ST.t0 = 0; });
  await pg.screenshot({ path: OUT + '/a-2-apply-filled.png', fullPage: true });
  const aw = await pg.evaluate(() => document.documentElement.scrollWidth); if (aw > 392) errors.push('apply overflow ' + aw);
  await pg.click('#send'); await pg.waitForSelector('.ref');
  await pg.screenshot({ path: OUT + '/a-3-apply-done.png' });
  pg = await newPage(1280, 900);
  await pg.setContent(apply); await pg.waitForSelector('#f_Full_Name');
  await pg.click('[data-l="en"]'); await pg.waitForTimeout(150);
  if ((await pg.getAttribute('html', 'dir')) !== 'ltr') errors.push('english not ltr');
  await pg.screenshot({ path: OUT + '/a-4-apply-en.png', fullPage: true });
  fresh(); const p = ctx.all_('PERSONS').find(x => x.Mobile_Norm === '01098765432');
  if (!p || !p.CV_File_ID) errors.push('apply via UI did not store person/cv');
  if (ctx.find_('APPLICATIONS', { Person_ID: p.Person_ID })[0].Source !== 'FACEBOOK') errors.push('source not FACEBOOK');

  // ---------- recruiter portal ----------
  pg = await newPage(1280, 900);
  await pg.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tRec) + ' || loadToken();'));
  await pg.waitForSelector('.shell'); await pg.screenshot({ path: OUT + '/c-1-home.png' });
  await navClick(pg, 'cands'); await pg.waitForSelector('#cBody tr[data-app]');
  await pg.screenshot({ path: OUT + '/c-2-tasks.png', fullPage: true });
  await pg.click('#cBody tr[data-app]'); await pg.waitForSelector('#acAdd');
  await pg.selectOption('#acO', 'REACHED'); await pg.fill('#acN', 'مهتم، متاح لمقابلة الأسبوع الجاي');
  await pg.click('#acAdd'); await pg.waitForTimeout(400); await pg.waitForSelector('#nxSave');
  await pg.fill('#nxW', 'مقابلة تليفونية'); await pg.fill('#nxD', '2099-01-05'); await pg.click('#nxSave'); await pg.waitForTimeout(400);
  await pg.screenshot({ path: OUT + '/c-3-app.png', fullPage: true });
  await pg.click('#aMsg'); await pg.waitForSelector('#mtB');
  const msg = await pg.inputValue('#mtB'); if (!/قنديل مصر/.test(msg) || /\{name\}/.test(msg)) errors.push('template not filled: ' + msg.slice(0, 80));
  await pg.screenshot({ path: OUT + '/c-4-message.png' });
  await pg.click('#mActions .btn.secondary');
  await pg.click('[data-mv="REJECTED"]'); await pg.waitForSelector('#sdR'); await pg.selectOption('#sdR', 'SALARY_GAP'); await pg.fill('#sdN', 'متوقع أعلى من الميزانية');
  await pg.click('#mActions .btn.primary'); await pg.waitForSelector('#rjSend');
  await pg.screenshot({ path: OUT + '/c-5-rejected.png', fullPage: true });
  // pipeline
  await pg.click('#aVac'); await pg.waitForSelector('#pList');
  await pg.screenshot({ path: OUT + '/c-6-pipeline.png', fullPage: true });
  await pg.click('[data-ps="ALL"]'); await pg.waitForTimeout(150);
  const rows = await pg.$$eval('#pList .ccard', r => r.length); if (rows !== 4) errors.push('pipeline rows ' + rows);
  // duplicate app
  const dupRow = await pg.$('#pList .ccard:has(.pill.warn.sm) .ccard-main');
  if (dupRow) { await dupRow.click(); await pg.waitForSelector('[data-merge]'); await pg.screenshot({ path: OUT + '/c-7-dup.png', fullPage: true }); }
  else errors.push('no dup row');
  // manual add with duplicate warning
  await navClick(pg, 'cands'); await pg.waitForSelector('#cAdd'); await pg.click('#cAdd'); await pg.waitForSelector('#cnSave');
  await pg.selectOption('#cnV', vacId); await pg.selectOption('#cnS', 'WALK_IN');
  await pg.fill('#pf_Full_Name', 'ياسمين طارق'); await pg.fill('#pf_Mobile', '01233334444'); await pg.check('#cnOk');
  await pg.click('#cnSave'); await pg.waitForSelector('[data-use]');
  await pg.screenshot({ path: OUT + '/c-8-manual-dup.png', fullPage: true });
  await pg.click('#cnNew'); await pg.waitForSelector('#acAdd');
  // mobile view of app
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(200);
  await pg.screenshot({ path: OUT + '/c-9-app-mobile.png', fullPage: true });
  const ow = await pg.evaluate(() => document.documentElement.scrollWidth); if (ow > 392) errors.push('mobile overflow ' + ow);

  // ---------- hiring manager ----------
  fresh(); const yas = ctx.all_('APPLICATIONS').find(a => ctx.get_('PERSONS', a.Person_ID).Full_Name === 'ياسمين طارق فهمي');
  api('cand.move', tRec, { Application_ID: yas.Application_ID, to: 'SHORTLISTED' });
  pg = await newPage(1280, 900);
  await pg.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tCost) + ' || loadToken();'));
  await pg.waitForSelector('.shell'); await navClick(pg, 'vacancies'); await pg.waitForSelector('tr[data-vac]');
  await pg.click('tr[data-vac]'); await pg.waitForSelector('[data-va="pipe"]'); await pg.click('[data-va="pipe"]'); await pg.waitForSelector('#pList');
  await pg.screenshot({ path: OUT + '/h-1-shortlist.png', fullPage: true });
  const hm = await pg.textContent('#pList'); if (!/ياسمين/.test(hm) || /محمود/.test(hm)) errors.push('hm list wrong: ' + hm);
  // position modal: two codes, clearly different
  pg = await newPage(1280, 900);
  await pg.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tO) + ' || loadToken();'));
  await pg.waitForSelector('.shell'); await navClick(pg, 'org'); await pg.waitForSelector('#posList tr[data-id]');
  await pg.click('#posList tr[data-id]'); await pg.waitForSelector('.code.pos');
  await pg.screenshot({ path: OUT + '/o-codes.png' });
  await browser.close(); console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
