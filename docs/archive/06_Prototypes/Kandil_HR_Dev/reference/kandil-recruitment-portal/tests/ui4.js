const { navClick } = require('./navhelp.js');
// Board approval UI: rules screen + on-behalf decision
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر','','','','','EXE-003','الرئيس التنفيذي','العبور','','Y','','1'],
  ['قنديل مصر','الجودة','','','','QLT-001','مدير الجودة','العبور','الرئيس التنفيذي','Y','','1'],
  ['قنديل مصر','الجودة','توكيد الجودة','','','QLT-002','مدير توكيد الجودة','العبور','مدير الجودة','Y','','1']].map(r => r.join(T)).join('\n') });
fresh(); const pos = t => ctx.all_('POSITIONS').find(p => ctx.get_('JOBS', p.Job_Code).Job_Title_AR === t).Position_ID;
const hr = api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'منى' }); api('users.setRoles', tO, { User_ID: hr.User_ID, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' });
const ceo = api('users.save', tO, { Email: 'ceo@t.com', Full_Name_AR: 'الرئيس', Position_ID: pos('الرئيس التنفيذي') }); api('users.setRoles', tO, { User_ID: ceo.User_ID, roles: [{ Role_Code: 'CEO' }], reason: 'x' });
api('users.save', tO, { Email: 'qa@t.com', Full_Name_AR: 'مدير توكيد', Position_ID: pos('مدير توكيد الجودة') });
const tQ = login('qa@t.com'), tH = login('hr@t.com'), tC = login('ceo@t.com');
// request for a position that reports directly to the CEO → board
const r = api('req.submit', tO, { Recruitment_Type: 'REPLACEMENT', Employment_Type: 'FULL_TIME', Reason_Category: 'RESIGNATION', Justification: 'استقالة مدير الجودة', Required_By_Date: '2099-01-01',
  lines: [{ Position_ID: pos('مدير الجودة'), Requested_HC: 1 }], replacements: [{ Employee_Name: 'فلان' }], Exception_Justification: 'بديل لنفس الوظيفة' });
api('req.action', tC, { Request_ID: r.Request_ID, action: 'APPROVE' });
let html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
html = html.replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const tok = login('owner@test.com');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(html.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();'));
  await page.waitForSelector('.shell');
  await navClick(page, 'rules'); await page.waitForSelector('#ruList table');
  await page.click('#ruNew'); await page.waitForSelector('#rfT'); await page.fill('#rfN', 'طلب المجلس مؤقتاً'); await page.fill('#rfE', '2099-12-31');
  await page.screenshot({ path: 'b-1-ruleform.png' });
  await page.click('#mActions .btn.primary'); await page.waitForTimeout(400); await page.screenshot({ path: 'b-2-rules.png', fullPage: true });
  await navClick(page, 'reqs'); await page.waitForTimeout(200);
  await page.click('[data-box="all"]'); await page.waitForSelector('tr[data-req]'); await page.click('tr[data-req]');
  await page.waitForSelector('#obM'); await page.screenshot({ path: 'b-3-onbehalf.png' });
  await page.selectOption('#obM', 'WHATSAPP'); await page.fill('#obN', 'وافق رئيس المجلس على واتساب 3/10');
  // v0.36.0: a proof file is required (CHG-79)
  await page.setInputFiles('#obF', { name: 'whatsapp.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64') });
  await page.click('#obOk'); await page.waitForTimeout(500); await page.screenshot({ path: 'b-4-approved.png' });
  const st = await page.textContent('.pagehead');
  if (!/معتمد/.test(st)) errors.push('not approved: ' + st);
  await browser.close(); console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
