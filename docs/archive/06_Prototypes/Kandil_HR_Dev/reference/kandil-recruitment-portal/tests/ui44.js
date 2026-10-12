// v0.44.0 UI (CHG-91): the onboarding's ZKBioTime task opens the enrolment form (face, fingers, punch type, licences), saving it
// closes the task and shows the card; the employee file shows it and lets HR record an existing employee.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
api('import.commit', tO, { reason: 'x', text: [['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''], ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4']].map(r => r.join('\t')).join('\n') });
fresh(); const pos = ctx.all_('POSITIONS').find(p => ctx.get_('JOBS', p.Job_Code).Job_Title_AR === 'محاسب تكاليف');
const hr = api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'منى' }).User_ID; api('users.setRoles', tO, { User_ID: hr, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' });
const tH = login('hr@t.com'), today = ctx.today_();
['E1', 'E2'].forEach((id, i) => api('emp.save', tH, { isNew: 'Y', Employee_ID: id, Full_Name: ['أحمد علي حسن', 'كريم محمود سالم'][i], Position_ID: pos.Position_ID, Hire_Date: today, Employment_Kind: 'PERMANENT' }));
const O = api('onb.start', tH, { Employee_ID: 'E1', Start_Date: today });
const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tH) + ' || loadToken();')); await page.waitForSelector('.shell');
  await page.evaluate(id => go('onb', id), O.Onboarding_ID); await page.waitForSelector('[data-tbio]');
  if (await page.$('[data-tdone] ~ [data-tbio], .onbt:has([data-tbio]) [data-tdone]')) errors.push('the enrolment task has no plain «done»');
  await page.click('[data-tbio]'); await page.waitForSelector('#atF');
  if (!/مستخدم 0 من 150/.test(await page.textContent('#mBody'))) errors.push('licences shown in the form');
  await page.check('#atF'); await page.check('#atG'); await page.check('input[name="atT"][value="MOBILE"]'); await page.fill('#atC', '10234');
  await page.screenshot({ path: OUT + '/v0440-1-form.png' });
  await page.click('#mActions .btn.primary');
  await page.waitForSelector('#attCard', { timeout: 8000 }).catch(() => errors.push('the card after saving'));
  if (await page.$('#attCard') && !/موبايل \+ ماكينات/.test(await page.textContent('#attCard'))) errors.push('the card shows the type');
  fresh(); const tk = ctx.find_('ONB_TASKS', { Onboarding_ID: O.Onboarding_ID }).find(x => x.Kind === 'BIO');
  if (tk.Status !== 'DONE') errors.push('the task closed by the form');
  await page.screenshot({ path: OUT + '/v0440-2-onboarding.png', fullPage: true });
  // the employee file: an existing employee recorded by HR
  await page.evaluate(() => { go('emps'); empOpen('E2'); }); await page.waitForSelector('#attEdit');
  if (!/لسه ماتسجلش/.test(await page.textContent('#attCard'))) errors.push('not recorded yet in the file');
  await page.click('#attEdit'); await page.waitForSelector('#atF');
  await page.check('#atF'); await page.check('#atG'); await page.check('input[name="atT"][value="MACHINES"]');
  await page.click('#mActions .btn.primary');
  await page.waitForFunction(() => document.getElementById('attCard') && /ماكينات بس/.test(document.getElementById('attCard').textContent), null, { timeout: 8000 }).catch(() => errors.push('recorded from the file'));
  await page.screenshot({ path: OUT + '/v0440-3-file.png', fullPage: true });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui44 OK');
})().catch(e => { console.log(e); process.exit(1); });
