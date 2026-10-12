// v0.32.0: speed — the tables an action reads come from the cache in ONE call (learned per action), the copy is checked
// against the table's generation (a write is never hidden), activities are appended without reading the whole sheet.
const fs = require('fs'), path = require('path');
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
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
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
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), site: demo('هبة منصور (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), site: tAs(U.site), rm: tAs(U.rm), rec1: tAs(U.rec1) };

// count cache / sheet calls
const C = { get: 0, put: 0, gv: 0 };
const gc0 = ctx.CacheService.getScriptCache;
ctx.CacheService.getScriptCache = () => { const c = gc0(); return Object.assign({}, c, {
  getAll: ks => { C.get++; return c.getAll(ks); }, get: k => { C.get++; return c.get(k); },
  put: (k, v, t) => { if (String(k).indexOf('AH_') === 0) C.put++; return c.put(k, v, t); }, putAll: (o, t) => c.putAll(o, t) }); };
const anySS = Object.values(require('./mocks').store)[0];
const RangeP = Object.getPrototypeOf(anySS.getSheets()[0].getRange(1, 1));
const gv0 = RangeP.getValues; RangeP.getValues = function () { C.gv++; return gv0.call(this); };
const run = (a, p) => { C.get = 0; C.put = 0; C.gv = 0; const r = api(a, tO, p); return { r, get: C.get, put: C.put, gv: C.gv }; };

fresh();
const app = ctx.all_('APPLICATIONS').find(a => ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW'].indexOf(a.Stage) >= 0);
// learn → then one call
let a1 = run('cand.app', { Application_ID: app.Application_ID });
let a2 = run('cand.app', { Application_ID: app.Application_ID });
let a3 = run('cand.app', { Application_ID: app.Application_ID });
ok(a1.r.ok && a2.r.ok && a3.r.ok, 'candidate page works');
ok(a3.get <= 3, 'cache calls once learned: ' + a3.get + ' (was ' + a1.get + ')');
ok(a1.get > 10, 'before learning, one call per table: ' + a1.get);
ok(JSON.stringify(a2.r.data) === JSON.stringify(a3.r.data) && JSON.stringify(a1.r.data) === JSON.stringify(a3.r.data), 'same answer from the batched cache');
ok(a3.gv === 0, 'no sheet read once cached');
ok(a3.put === 0, 'no hint write when nothing new: ' + a3.put);
fresh();
const hint = JSON.parse(ctx.CacheService.getScriptCache().get('AH_cand.app'));
ok(hint.APPLICATIONS >= 1 && hint.PERSONS >= 1 && hint.VACANCIES >= 1, 'hint holds the tables and chunk counts');
// boot, todo, pipeline: all collapse to a few calls
['boot', 'todo', 'vac.list'].forEach(a => { run(a, { view: 'active' }); const x = run(a, { view: 'active' }); ok(x.r.ok && x.get <= 4, a + ': ' + x.get + ' cache calls (v0.35: +1 for the per-user to-do counts)'); });
const p1 = run('cand.pipeline', { Vacancy_ID: app.Vacancy_ID }); const p2 = run('cand.pipeline', { Vacancy_ID: app.Vacancy_ID });
ok(p2.get <= 3 && JSON.stringify(p1.r.data) === JSON.stringify(p2.r.data), 'pipeline batched: ' + p2.get);

// a write is never hidden by a prefetched copy
must(api('cand.next', tO, { Application_ID: app.Application_ID, Next_Action: 'مكالمة متابعة سرعة', Next_Action_Date: ctx.today_() }), 'next step');
let a4 = run('cand.app', { Application_ID: app.Application_ID });
ok(a4.r.data.app.Next_Action === 'مكالمة متابعة سرعة', 'fresh data right after a write');
let a5 = run('cand.app', { Application_ID: app.Application_ID });
ok(a5.r.data.app.Next_Action === 'مكالمة متابعة سرعة' && a5.get <= 3, 'and batched again');
// prefetched copy is checked per call against the generation: a write in the SAME call is seen
fresh(); ctx.tcBegin_('cand.app'); ctx.load_('APPLICATIONS');
ctx.update_('APPLICATIONS', app.Application_ID, { Next_Action: 'داخل نفس الطلب' }, 'x');
ctx.REPO_.tables = {};
ok(ctx.get_('APPLICATIONS', app.Application_ID).Next_Action === 'داخل نفس الطلب', 'same-call write not hidden by the prefetched copy');
// hint grows when an action reads a new table (union, never shrinks below what was used)
fresh(); ctx.tcBegin_('cand.app'); ctx.tcGens_(); ctx.load_('LOCATIONS'); ctx.load_('ROLES'); ctx.tcHintSave_();
fresh(); const h2 = JSON.parse(ctx.CacheService.getScriptCache().get('AH_cand.app'));
ok(h2.ROLES >= 1 && h2.APPLICATIONS >= 1, 'hint union');

// activities: appended without reading the whole sheet
C.gv = 0;
must(api('cand.activity', tO, { Application_ID: app.Application_ID, Type: 'NOTE', Note: 'ملاحظة سرعة' }), 'activity');
const actRead = C.gv;
fresh();
ok(ctx.all_('ACTIVITIES').some(x => x.Note === 'ملاحظة سرعة'), 'activity saved');
const d = must(api('cand.app', tO, { Application_ID: app.Application_ID }), 'app after note');
ok(d.activities.some(x => x.Note === 'ملاحظة سرعة'), 'note shows on the candidate page');
ok(actRead <= 3, 'adding a note reads ≤ 3 ranges (header, sequences): ' + actRead);
// keys stay unique on the append path
must(api('cand.activity', tO, { Application_ID: app.Application_ID, Type: 'NOTE', Note: 'تانية' }), 'activity 2');
fresh(); const ids = ctx.all_('ACTIVITIES').map(x => x.Activity_ID);
ok(new Set(ids).size === ids.length, 'activity ids unique');
// cache lives 6 hours; the editor function clears it
ok(vm.runInContext('TC_TTL_', ctx) === 21600, 'cache copies kept 6 hours');
fresh(); const g0 = ctx.tcGens_().APPLICATIONS; fresh(); ctx.clearPortalCache(); fresh();
ok(ctx.tcGens_().APPLICATIONS !== g0, 'clearPortalCache retires every copy');
console.log('phase32: ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;

// ================= v0.32.1: the first request after a deploy and of a new day stay light =================
{
  let gvN = 0; const gv1 = RangeP.getValues; RangeP.getValues = function () { gvN++; return gv1.call(this); };
  const pr = ctx.PropertiesService.getScriptProperties();
  ok(!!pr.getProperty('SCHEMA_SIG'), 'column signatures saved');
  // a deploy with no column change: no sheet header checked, no full-table read for the ID counters
  fresh(); pr.setProperty('SCHEMA_APP_VERSION', '0.0.old'); gvN = 0;
  must(api('me', tO, {}), 'me after deploy');
  ok(pr.getProperty('SCHEMA_APP_VERSION') === vm.runInContext('APP.VERSION', ctx), 'upgraded');
  ok(gvN < 70, 'upgrade reads few ranges: ' + gvN);
  // a new column in one table: only that sheet is changed, and the column appears
  vm.runInContext("SCHEMA.FEEDBACK.cols.push('Speed_Test_Col')", ctx);
  fresh(); pr.setProperty('SCHEMA_APP_VERSION', '0.0.old');
  must(api('me', tO, {}), 'me after deploy with a new column');
  fresh(); ok(ctx.headersOf_('FEEDBACK').headers.indexOf('Speed_Test_Col') >= 0, 'new column added on the upgrade');
  const sig = JSON.parse(pr.getProperty('SCHEMA_SIG'));
  ok(sig.FEEDBACK === ctx.schemaSigs_().FEEDBACK, 'its signature updated');
  // the move from 0.32.0 (no signatures yet) needs no sheet check
  fresh(); pr.deleteProperty('SCHEMA_SIG'); pr.setProperty('SCHEMA_APP_VERSION', '0.32.0'); gvN = 0;
  must(api('me', tO, {}), 'me after 0.32.0 → 0.32.1');
  ok(gvN < 70 && !!pr.getProperty('SCHEMA_SIG'), 'first upgrade from 0.32.0 is light too: ' + gvN);
  // the editor setup still checks every sheet and repairs the counters
  fresh(); gvN = 0; ctx.setupSystem(); ok(gvN > 100, 'full setup still checks everything: ' + gvN);
  // a new day without the daily trigger: the job goes to the background, the user does not wait
  fresh(); pr.setProperty('DAILY_RUN', '2000-01-01'); pr.deleteProperty('DAILY_TRIGGER'); pr.deleteProperty('DAILY_SOON');
  ctx.ScriptApp.__triggers.length = 0; gvN = 0;
  must(api('me', tO, {}), 'me on a new day');
  ok(pr.getProperty('DAILY_RUN') === '2000-01-01', 'daily job not run inside the request');
  const soon = ctx.ScriptApp.__triggers.filter(t => t.fn === 'dailySoonTrigger');
  ok(soon.length === 1 && soon[0].after === 60000, 'one-off background run in a minute');
  ok(ctx.ScriptApp.__triggers.some(t => t.fn === 'dailyTrigger'), 'daily trigger installed too');
  fresh(); must(api('me', tO, {}), 'second request'); ok(ctx.ScriptApp.__triggers.filter(t => t.fn === 'dailySoonTrigger').length === 1, 'scheduled once a day');
  fresh(); ctx.dailySoonTrigger();
  ok(pr.getProperty('DAILY_RUN') === ctx.today_(), 'the background run did the daily job');
  ok(!ctx.ScriptApp.__triggers.some(t => t.fn === 'dailySoonTrigger'), 'and removed its trigger');
  // no permission to schedule: falls back to running it in the request (reminders never skipped)
  const nt = ctx.ScriptApp.newTrigger; ctx.ScriptApp.newTrigger = () => { throw new Error('no permission'); };
  fresh(); pr.setProperty('DAILY_RUN', '2000-01-01'); pr.deleteProperty('DAILY_TRIGGER'); pr.deleteProperty('DAILY_SOON'); pr.deleteProperty('HOURLY_TRIGGER');
  must(api('me', tO, {}), 'me without permission');
  ok(pr.getProperty('DAILY_RUN') === ctx.today_(), 'fallback: daily job ran in the request');
  ctx.ScriptApp.newTrigger = nt;
  console.log('phase32 (upgrade/daily): ' + pass + ' passed, ' + failN + ' failed');
}

// ================= v0.32.2: rows added under one lock go to the sheet together =================
{
  let svN = 0; const sv1 = RangeP.setValues; RangeP.setValues = function (v) { svN++; return sv1.call(this, v); };
  fresh(); svN = 0;
  const ids = [];
  ctx.withLock_(() => {
    for (let i = 0; i < 25; i++) {
      const id = ctx.nextId_('FEEDBACK'); ids.push(id);
      ctx.insert_('FEEDBACK', { Feedback_ID: id, Screen: 'test', Text: 'سرعة ' + i, Status: 'NEW' }, 'x');
    }
    ok(ctx.get_('FEEDBACK', ids[24]).Text === 'سرعة 24', 'new rows readable inside the same lock');
    ctx.update_('FEEDBACK', ids[3], { Status: 'DONE' }, 'x');
  });
  ok(svN <= 3, '25 inserts + an update → at most 3 writes: ' + svN);
  fresh(); const rows = ctx.all_('FEEDBACK').filter(r => /^سرعة /.test(r.Text));
  ok(rows.length === 25 && rows.find(r => r.Feedback_ID === ids[3]).Status === 'DONE', 'all rows on the sheet, the update too');
  ok(new Set(ctx.all_('FEEDBACK').map(r => r.__row || r.Feedback_ID)).size === ctx.all_('FEEDBACK').length, 'no row written twice');
  // append-only logs: queued in the lock, visible when the table is read in the same lock
  fresh(); svN = 0;
  ctx.withLock_(() => {
    for (let i = 0; i < 10; i++) ctx.insert_('NOTIFICATIONS', { Notification_ID: ctx.nextId_('NOTIFICATION'), User_ID: 'U1', Title: 'سرعة ' + i, Body: '', Link_Type: '', Link_ID: '', Read_At: '' }, 'x');
    ok(ctx.all_('NOTIFICATIONS').filter(n => /^سرعة /.test(n.Title)).length === 10, 'queued log rows readable in the same lock');
  });
  fresh(); ok(ctx.all_('NOTIFICATIONS').filter(n => /^سرعة /.test(n.Title)).length === 10, 'log rows written once');
  // the sheet grows when the new rows pass its last row
  fresh(); const sh = ctx.sheet_('FEEDBACK'); const before = sh.getMaxRows();
  ctx.withLock_(() => { const n = before - sh.getLastRow() + 5; for (let i = 0; i < n; i++) ctx.insert_('FEEDBACK', { Feedback_ID: ctx.nextId_('FEEDBACK'), Screen: 'grow', Text: 'g', Status: 'NEW' }, 'x'); });
  ok(sh.getMaxRows() > before, 'sheet grown for the new rows');
  // a demo stage runs under one lock
  ok(/withLock_\(function \(\) \{ fn\(ctx, st, W, C\); \}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'Demo.gs'), 'utf8')), 'demo stage under one lock');
  console.log('phase32 (batched writes): ' + pass + ' passed, ' + failN + ' failed');
}
if (failN) process.exitCode = 1;
