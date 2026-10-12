// v0.20.0: demo data on the real structure (all stages through the real services), «try as» a demo user, and the wipe
// that empties every transaction while keeping the structure, real users / employees, settings and templates.
const { ctx, mails, fresh, vm, props } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
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

// v0.36: the wipe is asked by an HR user and approved (and run) by the owner
function wipeVia(p) {
  fresh(); let d = ctx.all_('DUAL_REQUESTS').find(x => x.Kind === 'WIPE' && x.Status === 'PENDING');
  if (!d) { const rq = api('dual.request', login('real.hr@t.com'), { Kind: 'WIPE', reason: p.reason || 'مسح بعد الاختبار' }); if (!rq.ok) return rq; d = rq.data; }
  const r = api('dual.decide', tO, { Dual_ID: d.Dual_ID, decision: 'APPROVE', phrase: p.phrase, code: p.code, comment: '' });
  return r.ok ? { ok: true, data: r.data.data } : r;
}
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
fresh(); const posBefore = ctx.all_('POSITIONS').length, cfgBefore = ctx.all_('CONFIG').length, tplBefore = ctx.all_('ONB_TEMPLATES').length;
const occBefore = {}; ctx.all_('POSITIONS').forEach(p => { occBefore[p.Position_ID] = p.Occupied_HC; });

// only the owner
bad(api('demo.status', tR, {}), null, 'HR manager cannot open the demo screen');
let S = must(api('demo.status', tO, {}), 'status');
ok(S.stages.length === 7 && S.stages.every(s => !s.done) && S.phrase === 'امسح الحركات', 'status: stages not done; some transactions already (import / users)');
bad(api('demo.seed', tO, { stage: 'REQUESTS' }), /الأول/, 'stages in order');

// all stages
mails.length = 0; const created = {}, warnings = [];
S.stages.forEach(s => {
  const R = must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key);
  if (R) { Object.assign(created, R.created); R.warnings.forEach(w => warnings.push(s.key + ': ' + w)); }
});
if (warnings.length) console.log('WARNINGS:\n  ' + warnings.join('\n  '));
ok(!warnings.length, 'no warnings while seeding (' + warnings.length + ')');
console.log('created: ' + JSON.stringify(created));
bad(api('demo.seed', tO, { stage: 'PEOPLE' }), /اتعملت قبل كده/, 'a stage runs once');
fresh();
const cnt = t => ctx.all_(t).length;
ok(created.users >= 7 && created.employees >= 10, 'demo users and employees');
ok(created.requests >= 8 && created.vacancies >= 4 && created.newPositionRequests === 1, 'requests, vacancies, new-position request');
const stat = t => { const o = {}; ctx.all_(t).forEach(r => { o[r.Status] = (o[r.Status] || 0) + 1; }); return o; };
const RS = stat('RECRUITMENT_REQUESTS');
ok(RS.APPROVED >= 3 && RS.DRAFT === 1 && RS.REJECTED === 1 && RS.RETURNED === 1 && (RS.PENDING_APPROVAL || 0) + (RS.IN_APPROVAL || 0) + (RS.SUBMITTED || 0) >= 1, 'request states: ' + JSON.stringify(RS));
const AS = {}; ctx.all_('APPLICATIONS').forEach(r => { AS[r.Stage] = (AS[r.Stage] || 0) + 1; });
ok(Object.keys(AS).length >= 6, 'application stages: ' + JSON.stringify(AS));
ok(created.interviews >= 4 && created.evaluations >= 1 && created.selections >= 1, 'interviews, evaluations, selections');
ok(created.offers >= 2 && created.accepted >= 1, 'offers and acceptances');
const OS = stat('OFFERS'); console.log('offers: ' + JSON.stringify(OS));
ok(created.joined >= 1 && cnt('ONBOARDINGS') >= 1 && cnt('ONB_TASKS') > 5 && cnt('INSURANCE_CASES') >= 1, 'joined, onboarding, insurance');
ok(created.transfers >= 2 && created.dataRequests >= 1 && created.exits === 1, 'transfers, data requests, exit');
ok(Object.keys(stat('TRANSFER_REQUESTS')).length >= 2, 'transfer states: ' + JSON.stringify(stat('TRANSFER_REQUESTS')));
ok(!mails.some(m => /\.invalid$/.test(m.to)) && mails.length === 0, 'no email sent while seeding (demo or real addresses): ' + mails.length);
ok(Number(props.DEMO_MAIL_SKIPPED || 0) > 0, 'skipped mails counted');
S = must(api('demo.status', tO, {}), 'status after');
ok(S.stages.every(s => s.done) && S.users.length === created.users && S.employees >= created.employees, 'status shows all stages done and demo people');

// try as a demo user
const hrDemo = S.users.find(u => u.roles.indexOf('مدير الموارد البشرية') >= 0);
bad(api('demo.as', tO, { User_ID: real.User_ID }), /التجريبيين/, 'cannot impersonate a real user');
bad(api('demo.as', tR, { User_ID: hrDemo.id }), null, 'only the owner impersonates');
const AS1 = must(api('demo.as', tO, { User_ID: hrDemo.id }), 'try as demo HR manager');
const me = must(api('me', AS1.token, {}), 'me as demo');
ok(me.user.User_ID === hrDemo.id && me.security && me.security.demo === true && !me.security.gate, 'demo session: no MFA gate, flagged as demo');
must(api('todo', AS1.token, {}), 'demo HR to-do');
bad(api('demo.status', AS1.token, {}), null, 'a demo user cannot reach the demo screen');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'DEMO_AS'), 'impersonation audited');

// the wipe
bad(wipeVia({ phrase: 'امسح', reason: 'انتهى الاختبار' }), /بالظبط/, 'phrase must match');
bad(api('dual.request', tR, { Kind: 'WIPE', reason: '' }), /سبب/, 'reason needed');
const W = must(wipeVia({ phrase: 'امسح الحركات', reason: 'انتهى الاختبار — نرجع للبيانات الحقيقية' }), 'wipe');
ok(W.backup.copies === 7, 'backup copies of the 7 spreadsheets: ' + W.backup.copies);
fresh();
const left = ctx.WIPE_TABLES_.filter(t => ctx.all_(t).length);
ok(!left.length, 'transaction tables empty: ' + left.join(','));
ok(!ctx.all_('USERS').some(u => u.Is_Demo === 'Y') && ctx.get_('USERS', real.User_ID) && ctx.findOne_('USERS', { Email: 'owner@test.com' }), 'demo users gone; real ones kept');
ok(!ctx.all_('EMPLOYEES').some(e => e.Is_Demo === 'Y' || /^DEMO-/.test(e.Employee_ID)) && ctx.findOne_('EMPLOYEES', { Employee_ID: 'R1' }), 'demo employees gone; real employee kept');
ok(ctx.all_('EMPLOYEE_HISTORY').every(h => h.Employee_ID === 'R1'), 'history of demo employees gone');
ok(ctx.all_('USER_ROLES').every(r => ctx.get_('USERS', r.User_ID)), 'no orphan roles');
ok(ctx.all_('POSITIONS').length === posBefore && ctx.all_('CONFIG').length === cfgBefore && ctx.all_('ONB_TEMPLATES').length === tplBefore, 'structure, settings, templates kept');
ok(ctx.all_('POSITIONS').every(p => String(p.Occupied_HC) === String(occBefore[p.Position_ID])), 'headcount back to the real count');
ok(ctx.all_('LOCATIONS').every(l => !l.HR_Site_User_ID || ctx.get_('USERS', l.HR_Site_User_ID)), 'demo HR site specialist removed from locations');
ok(ctx.get_('ID_SEQUENCES', 'REQUEST').Last_Number === '0' && ctx.get_('ID_SEQUENCES', 'VACANCY').Last_Number === '0', 'counters restart');
bad(api('me', AS1.token, {}), null, 'demo session no longer works');
ok(must(api('me', tR, {}), 'real user still in').user.User_ID === real.User_ID, 'real session still works');
ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'DEMO_WIPE'), 'wipe audited (audit log kept)');
S = must(api('demo.status', tO, {}), 'status after wipe');
ok(S.total === 0 && S.stages.every(s => !s.done) && S.lastWipe && !S.users.length, 'clean status; last wipe shown');

// the portal works normally after the wipe: a new request gets REQ number 1
const tA = login('real.hr@t.com');
ok(!!tA, 'login after wipe');
// and the seed can run again
must(api('demo.seed', tO, { stage: 'PEOPLE' }), 'seed again after wipe');


// headcount not counted from employees: the wipe restores the snapshot taken at seeding
fresh(); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'N' }, 'x');
must(wipeVia({ phrase: 'امسح الحركات', reason: 'مسح بعد التجربة التانية' }), 'second wipe');
fresh(); ok(ctx.all_('POSITIONS').every(p => String(p.Occupied_HC) === String(occBefore[p.Position_ID])), 'headcount equals the real count again');
const snapSeed = must(api('demo.seed', tO, { stage: 'PEOPLE' }), 'seed with manual headcount');
ok(snapSeed.warnings.some(w => /OCCUPIED_FROM_EMPLOYEES/.test(w)), 'warns that demo employees do not change the headcount');
fresh(); ctx.update_('POSITIONS', P['فني تشغيل'].Position_ID, { Occupied_HC: '5' }, 'x');      // something changed the count meanwhile
must(wipeVia({ phrase: 'امسح الحركات', reason: 'مسح بعد التجربة التالتة' }), 'third wipe');
fresh(); ok(String(ctx.get_('POSITIONS', P['فني تشغيل'].Position_ID).Occupied_HC) === String(occBefore[P['فني تشغيل'].Position_ID]), 'snapshot restored');

// with the authenticator on, the wipe needs the current code
vm.runInContext('var __off = 0; (function(){ var R = Date; Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + __off); } static now() { return R.now() + __off; } }; })();', ctx);
const crypto = require('crypto');
const stepNow = () => Math.floor(vm.runInContext('Date.now()', ctx) / 30000);
function b32dec(x) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; x = x.replace(/\s/g, ''); let bits = 0, val = 0; const out = []; for (const ch of x) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step) { const msg = Buffer.alloc(8); msg.writeUInt32BE(step >>> 0, 4); const h = crypto.createHmac('sha1', b32dec(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0'); }
const s0 = must(api('mfa.start', tO, {}), 'mfa start');
must(api('mfa.confirm', tO, { code: totp(s0.secret, stepNow()) }), 'mfa confirm');
vm.runInContext('__off += 60000', ctx);
ok(must(api('demo.status', tO, {}), 'status').mfa === true, 'status knows the authenticator is on');
bad(wipeVia({ phrase: 'امسح الحركات', reason: 'مسح بالكود' }), /Authenticator/, 'code needed');
bad(wipeVia({ phrase: 'امسح الحركات', reason: 'مسح بالكود', code: totp(s0.secret, stepNow() - 10) }), /Authenticator/, 'old code refused');
must(wipeVia({ phrase: 'امسح الحركات', reason: 'مسح بالكود', code: totp(s0.secret, stepNow()) }), 'wipe with the code');
bad(wipeVia({ phrase: 'امسح الحركات', reason: 'مسح بالكود', code: totp(s0.secret, stepNow()) }), /Authenticator/, 'same code cannot be used twice');
fresh(); ok(ctx.USER_MFA_TEST_DUMMY === undefined && ctx.mfaOn_(ctx.findOne_('USERS', { Email: 'owner@test.com' }).User_ID), 'owner keeps the authenticator after the wipe');
console.log(`phase22: ${pass} passed, ${failN} failed`);
if (failN) process.exit(1);
