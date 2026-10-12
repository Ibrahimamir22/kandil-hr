// v0.11.1: XSS check — data typed by users, applicants and recruiters carries HTML/script payloads; every screen
// that shows it must render it as text (esc), so the payload never runs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks.js');
const OUT = process.env.SHOTS || '.';
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) { fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email }); const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1]; return pub('auth.verifyCode', { email, code }).data.token; }
const X = n => `<img src=x onerror="window.__xss=(window.__xss||[]).concat('${n}')"><script>window.__xss=(window.__xss||[]).concat('s${n}')</script>`;
ctx.setupSystem(); vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx); fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com'); const T = '\t';
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }); if (roles) api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u.User_ID; }
const acc = user('acc@t.com', 'مدير ' + X('user'), P['مدير الحسابات']);
user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']); const rec = user('rec@t.com', 'سارة', '', ['RECRUITER']);
const t = { rm: login('rm@t.com'), rec: login('rec@t.com'), acc: login('acc@t.com') };
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'مبرر ' + X('just'), Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Education: 'مؤهل ' + X('edu'), Experience_Years: '3',
  skills: [{ Skill: 'مهارة ' + X('skill'), Proficiency: 'GOOD', Importance: 'ESSENTIAL' }], lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] });
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: rec }); api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' });
const code = api('cand.applySettings', t.rec, { Vacancy_ID: VAC, Apply_Enabled: 'Y', Public_Summary: 'نبذة ' + X('summary') }).code;
api('sq.save', t.rm, { Text_AR: 'سؤال ' + X('sq'), Answer_Type: 'YES_NO' });
api('iq.save', t.rm, { Round_Type: 'HR', Kind: 'MANDATORY', Text_AR: 'سؤال مقابلة ' + X('iq') });
api('int.plan', t.rec, { Vacancy_ID: VAC, rounds: [{ id: 'R1', name: 'جولة ' + X('round'), type: 'HR', req: 'REQUIRED' }, { id: 'R2', name: 'فنية', type: 'MANAGER', req: 'REQUIRED' }] });
pub('apply.submit', { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3',
  Full_Name: 'أحمد ' + X('name') + ' علي', Mobile: '01011112222', Current_Employer: 'شركة ' + X('emp'), Referrer_Name: 'مرشح ' + X('ref') });
fresh(); const APP = ctx.find_('APPLICATIONS', { Vacancy_ID: VAC })[0].Application_ID;
api('cand.activity', t.rec, { Application_ID: APP, Type: 'NOTE', Note: 'ملاحظة ' + X('note') });
api('cand.move', t.rec, { Application_ID: APP, to: 'SHORTLISTED', note: 'تمام ' + X('stage') });
fresh(); const today = ctx.today_();
const iv = api('int.create', t.rec, { Application_ID: APP, Round_ID: 'R2', Date: today, Time: '10:00', Mode: 'IN_PERSON', Location_ID: ctx.all_('LOCATIONS')[0].Location_ID,
  Place: 'غرفة ' + X('place'), Notes: 'للجنة ' + X('ivnote'), panel: [{ User_ID: acc, Role: 'LEAD' }, { User_ID: rec, Role: 'HR' }] }).interview;
api('int.action', t.acc, { Interview_ID: iv.Interview_ID, action: 'CONFIRM' });
api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'CHECKIN' });
api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' });
const g = api('int.get', t.acc, { Interview_ID: iv.Interview_ID }).guide;
api('eval.save', t.acc, { Interview_ID: iv.Interview_ID, submit: 'Y', reqs: g.reqs.map(r => ({ k: r.k, s: 'MET', e: 'دليل ' + X('evid') })),
  qs: g.std.filter(q => q.kind === 'MANDATORY').map(q => ({ id: q.id, asked: 'Y', n: 'إجابة ' + X('ans') })), added: [{ q: 'سؤالي ' + X('addq'), n: 'رد' }],
  Recommendation: 'PROCEED', Summary: 'ملخص ' + X('sum'), Strengths: 'قوة ' + X('str'), Concerns: 'مخاوف ' + X('con') });

const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace('<script>', shim + '<script>');

(async () => {
  const errors = []; const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const open = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  async function visit(name, view, arg, sel) {
    await page.evaluate(x => go(x[0], x[1]), [view, arg]);
    if (sel) await page.waitForSelector(sel, { timeout: 8000 }).catch(() => errors.push(name + ': ' + sel + ' not shown'));
    await page.waitForTimeout(500);
    const hit = await page.evaluate(() => window.__xss || null);
    if (hit) errors.push(name + ': script ran → ' + hit.join(','));
    const shown = await page.evaluate(() => /onerror=/.test(document.getElementById('main').textContent));
    return shown;
  }
  let seen = 0;
  await open(tO);
  for (const [n, v, a, s] of [['home', 'home', null, '.todo'], ['request', 'req', rq.Request_ID, '.stages'], ['pipeline', 'pipe', VAC, '#plEdit'], ['candidate', 'app', APP, '#ivCard'],
    ['interview', 'intv', iv.Interview_ID, '.stages'], ['compare', 'compare', VAC, '[data-cmp]'], ['interviews', 'interviews', 'team', '[data-iv]'], ['bank', 'interviews', 'bank', '[data-iq]'],
    ['questions', 'sources', 'questions', '[data-sq]'], ['users', 'users', null, 'table'], ['search', 'cands', 'search', null], ['notifications', 'notif', null, '#nList']]) {
    if (await visit(n, v, a, s)) seen++;
  }
  await page.evaluate(() => go('cands', 'search')); await page.waitForTimeout(300);
  const q = await page.$('#csQ, input[type=search], .scroll input'); if (q) { await q.fill('أحمد'); await page.keyboard.press('Enter'); await page.waitForTimeout(800); }
  if (await page.evaluate(() => window.__xss || null)) errors.push('search: script ran');
  // the evaluation form (a second evaluator still owes his) and the schedule dialog
  await open(t.rec);
  await visit('evaluation-form', 'intv', iv.Interview_ID, '#evForm');
  await page.evaluate(id => go('app', id), APP); await page.waitForSelector('#ivCard [data-ivs]');
  await page.click('#ivCard [data-ivs]'); await page.waitForSelector('#ivD'); await page.waitForTimeout(400);
  if (await page.evaluate(() => window.__xss || null)) errors.push('schedule dialog: script ran');
  await page.screenshot({ path: OUT + '/v0111-xss-candidate.png', fullPage: true });
  // public apply page shows the public summary and the questions
  const apply = fs.readFileSync(path.join(__dirname, '..', 'src', 'Apply.html'), 'utf8').replace(/<\?= code \?>/g, code).replace(/<\?= src \?>/g, '').replace(/<\?= lang \?>/g, 'ar').replace(/<\?= ad \?>/g, '').replace('<script>', shim + '<script>');
  const ap = await browser.newPage({ viewport: { width: 390, height: 844 } }); ap.on('pageerror', e => errors.push(e.message));
  await ap.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  await ap.setContent(apply); await ap.waitForSelector('#f_Full_Name'); await ap.waitForTimeout(500);
  if (await ap.evaluate(() => window.__xss || null)) errors.push('apply page: script ran');
  if (!/onerror=/.test(await ap.textContent('body'))) errors.push('apply page: summary not shown as text');
  await browser.close();
  if (seen < 8) errors.push('payload text visible on only ' + seen + ' screens — check the test reached them');
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui15 OK — payload shown as text on ' + seen + ' screens, never executed');
})().catch(e => { console.error(e); process.exit(1); });
