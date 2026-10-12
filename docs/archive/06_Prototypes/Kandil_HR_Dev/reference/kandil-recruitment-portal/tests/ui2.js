// Phase 2 UI smoke test: real flows through the browser for several roles, desktop + mobile.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
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
const tOwner = login('owner@test.com');
const T = '\t';
api('import.commit', tOwner, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'رئيس قسم التكاليف', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'إنشاص', '', '', '', ''],
].map(r => r.join(T)).join('\n') });
fresh();
const pos = t => ctx.all_('POSITIONS').find(p => ctx.get_('JOBS', p.Job_Code).Job_Title_AR === t).Position_ID;
function user(email, name, p, roles) {
  const u = api('users.save', tOwner, { Email: email, Full_Name_AR: name, Position_ID: p || '' });
  if (roles) api('users.setRoles', tOwner, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' });
  return u.User_ID;
}
user('cfo@t.com', 'هشام المدير المالي', pos('مدير القطاع المالي'));
user('acc@t.com', 'أحمد مدير الحسابات', pos('مدير الحسابات'));
user('cost@t.com', 'سارة رئيس التكاليف', pos('رئيس قسم التكاليف'));
user('hr@t.com', 'منى مدير الموارد', '', ['HR_MANAGER']);
const recId = user('rec@t.com', 'كريم أخصائي توظيف', '', ['RECRUITER']);
user('recmgr@t.com', 'ياسمين مدير التوظيف', '', ['RECRUITMENT_MANAGER']);

let html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
const shim = `<script>
window.google = { script: { get run(){ var s={}, f={};
  var o = { withSuccessHandler:function(fn){s.fn=fn;return o;}, withFailureHandler:function(fn){f.fn=fn;return o;},
    apiPublic:function(){ window.__srv('apiPublic', Array.from(arguments)).then(s.fn, f.fn); },
    api:function(){ window.__srv('api', Array.from(arguments)).then(s.fn, f.fn); } };
  return o; } } };</script>`;
html = html.replace('<script>', shim + '<script>').replace('S.token = loadToken();', 'S.token = window.__TOKEN || loadToken();');

const errors = [];
let n = 0;
async function as(browser, email, vp, fn) {
  const tok = login(email);
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', e => errors.push(email + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts|net::/.test(m.text())) errors.push(email + ' console: ' + m.text()); });
  await page.exposeFunction('__srv', (f, args) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, args))); });
  await page.setContent(html.replace('window.__TOKEN ||', JSON.stringify(tok) + ' ||'));
  try { await page.waitForSelector('.shell', { timeout: 8000 }); }
  catch (e) { console.log('NO SHELL for', email, (await page.textContent('#app')).slice(0, 300)); throw e; }
  await page.waitForTimeout(250);
  await fn(page);
  await page.close();
}
const shot = (page, name) => page.screenshot({ path: `p2-${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const { navClick } = require('./navhelp.js');
const nav = async (page, v) => { await navClick(page, v); await page.waitForTimeout(300); };
const D = { width: 1280, height: 850 }, M = { width: 390, height: 844 };

(async () => {
  const browser = await chromium.launch();
  // 1) section head creates & submits a request
  await as(browser, 'cost@t.com', D, async page => {
    await shot(page, 'cost-home');
    await nav(page, 'newreq');
    await page.fill('#rfPosQ', 'محاسب');
    await page.waitForTimeout(150);
    await page.click('#rfPick [data-p] >> nth=0');
    await page.fill('#rfPosQ', '');
    await page.waitForTimeout(100);
    await page.click('#rfPick [data-p] >> nth=0');   // second location of the same job
    await page.fill('[data-hc="1"]', '3'); await page.dispatchEvent('[data-hc="1"]', 'change');
    await page.selectOption('#rfType', 'REPLACEMENT'); await page.dispatchEvent('#rfType', 'change');
    await page.fill('[data-rep="0"][data-k="Employee_Name"]', 'محمود علي');
    await page.fill('[data-rep="0"][data-k="Last_Working_Date"]', '2099-01-01');
    await page.selectOption('#rfReason', 'RESIGNATION');
    await page.fill('#rfDate', '2099-03-01');
    await page.fill('#rfJust', 'استقالة محاسب وضغط إقفال نهاية السنة');
    await page.fill('#rfEdu', 'بكالوريوس تجارة');
    await page.click('#rfSkAdd'); await page.fill('[data-sk="0"][data-k="Skill"]', 'Excel');
    await shot(page, 'form-before-exception');
    await page.click('#rfSubmit'); await page.waitForTimeout(250);
    const msg = await page.textContent('#rfMsg');
    if (!/مبرر الاستثناء/.test(msg)) errors.push('expected exception message, got: ' + msg);
    await page.fill('#rfExcJ', 'موسم إنشاص محتاج عدد أكبر مؤقتاً');
    await page.click('#rfSubmit');
    await page.waitForSelector('.chain');
    await shot(page, 'request-detail-requester');
    await nav(page, 'reqs'); await shot(page, 'my-requests');
  });
  // 2) dept manager approves; sector manager returns
  await as(browser, 'acc@t.com', D, async page => {
    await shot(page, 'acc-home-todo');
    await page.click('.todo-go'); await page.waitForTimeout(300);
    await page.click('tr[data-req]'); await page.waitForSelector('#acOk');
    await shot(page, 'acc-decision');
    await page.fill('#acCmt', 'موافق'); await page.click('#acOk'); await page.waitForTimeout(400);
  });
  await as(browser, 'cfo@t.com', D, async page => {
    await nav(page, 'approvals'); await page.click('tr[data-req]'); await page.waitForSelector('#acRet');
    await page.click('#acRet'); await page.waitForSelector('#dcR');
    await page.selectOption('#dcR', 'ADJUST_HC'); await page.fill('#dcC', 'قلل إنشاص لواحد');
    await shot(page, 'return-modal');
    await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
  });
  // 3) requester edits (mobile) and resubmits
  await as(browser, 'cost@t.com', M, async page => {
    await shot(page, 'mobile-home-returned');
    await page.click('.todo-go'); await page.waitForTimeout(300);
    await page.click('tr[data-req]'); await page.waitForSelector('#rdEdit');
    await page.click('#rdEdit'); await page.waitForSelector('#rfSubmit');
    await page.fill('[data-hc="1"]', '1'); await page.dispatchEvent('[data-hc="1"]', 'change');
    await shot(page, 'mobile-form-edit');
    await page.click('#rfSubmit'); await page.waitForSelector('.chain');
  });
  await as(browser, 'acc@t.com', D, async page => { await nav(page, 'approvals'); await page.click('tr[data-req]'); await page.waitForSelector('#acOk'); await page.click('#acOk'); await page.waitForTimeout(300); });
  await as(browser, 'cfo@t.com', D, async page => { await nav(page, 'approvals'); await page.click('tr[data-req]'); await page.waitForSelector('#acOk'); await page.click('#acOk'); await page.waitForTimeout(300); });
  // 4) HR review
  await as(browser, 'hr@t.com', D, async page => {
    await nav(page, 'approvals'); await page.click('tr[data-req]'); await page.waitForSelector('#hrCls');
    await page.selectOption('#hrCls', 'CRITICAL');
    await page.fill('[data-ahc] >> nth=0', '1');
    await shot(page, 'hr-review');
    await page.click('#acOk'); await page.waitForTimeout(400);
    await shot(page, 'approved-detail');
  });
  // 5) recruitment manager assigns and opens a vacancy
  await as(browser, 'recmgr@t.com', D, async page => {
    await shot(page, 'recmgr-home');
    await nav(page, 'vacancies'); await shot(page, 'vacancies');
    await page.click('tr[data-vac]'); await page.waitForSelector('[data-va="team"]');
    await shot(page, 'vacancy-modal');
    await page.click('[data-va="team"]'); await page.waitForSelector('#vtLead');
    await page.selectOption('#vtLead', recId);
    await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
    await page.waitForSelector('[data-va="OPEN"]'); await page.click('[data-va="OPEN"]'); await page.waitForTimeout(400);
    await page.waitForSelector('[data-va="fill"]'); await page.click('[data-va="fill"]'); await page.waitForSelector('#vfN');
    await page.check('input[name="fm"][value="INTERNAL_TRANSFER"]');
    await page.fill('#vfN', 'منى سعيد'); await page.fill('#vfI', 'E-55'); await page.fill('#vfD', '2026-10-05');
    await page.fill('#vfQ', 'رئيس'); await page.waitForSelector('#vfRes [data-sp]'); await page.click('#vfRes [data-sp] >> nth=0');
    await shot(page, 'fill-internal');
    await page.click('#mActions .btn.primary'); await page.waitForTimeout(500);
    await page.waitForSelector('.modal .hist'); await shot(page, 'vacancy-filled');
  });
  // 6) HR pins; recruiter sees his vacancy; PCR flow; guide; notifications (mobile)
  await as(browser, 'hr@t.com', D, async page => {
    await nav(page, 'vacancies'); await page.click('tr[data-vac]'); await page.waitForSelector('[data-va="prio"]');
    await page.click('[data-va="prio"]'); await page.fill('#vpPin', '2099-01-01'); await page.fill('#vpWhy', 'طلب الإدارة العليا');
    await page.click('#mActions .btn.primary'); await page.waitForTimeout(400);
    await shot(page, 'vacancy-pinned');
  });
  await as(browser, 'rec@t.com', M, async page => { await shot(page, 'mobile-recruiter-home'); await nav(page, 'vacancies'); await shot(page, 'mobile-recruiter-vacancies'); });
  await as(browser, 'acc@t.com', D, async page => {
    await nav(page, 'pcr'); await page.click('#pcNew'); await page.waitForSelector('#pfU');
    await page.selectOption('#pfU', { index: 1 }); await page.fill('#pfT', 'محلل مالي'); await page.fill('#pfN', '2');
    await page.fill('#pfJ', 'تحليل التكاليف والموازنات الشهرية'); await page.fill('#pfS', 'إعداد تقارير التحليل المالي الشهرية');
    await shot(page, 'pcr-form');
    await page.click('#mActions .btn.primary'); await page.waitForSelector('.chain');
    await shot(page, 'pcr-detail');
  });
  await as(browser, 'cost@t.com', M, async page => {
    await page.click('#btnBell'); await page.waitForTimeout(300); await shot(page, 'mobile-notifications');
    await nav(page, 'guide'); await shot(page, 'mobile-guide');
    // idle lock: jump the clock
    await page.evaluate(() => { IDLE.last = Date.now() - (idleMs() - 90000); idleTick(); });
    await page.waitForSelector('#idlewarn'); await shot(page, 'idle-warning');
    await page.evaluate(() => { IDLE.last = Date.now() - idleMs() - 1000; idleTick(); });
    await page.waitForSelector('.lockmsg'); await shot(page, 'idle-locked');
  });
  await as(browser, 'owner@test.com', D, async page => { await shot(page, 'owner-home'); await nav(page, 'guide'); await shot(page, 'guide'); await nav(page, 'org'); await nav(page, 'config'); });
  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'NO_UI_ERRORS');
})().catch(e => { console.log('TEST CRASH', e.message); console.log(errors.join('\n')); process.exit(1); });
