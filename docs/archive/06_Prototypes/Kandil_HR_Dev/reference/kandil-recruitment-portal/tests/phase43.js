// v0.44.0 (CHG-91): attendance enrolment on ZKBioTime — the onboarding task closes only through the enrolment form (face and
// fingers, or a reason), HR decides the punch type, mobile licences are counted and refused when used up, an exit makes the
// enrolment due to be stopped and tells HR, «stopped» frees the licence; existing employees from their file; the old task
// is migrated; a purge blanks the row. No biometric data is kept — only the flags and the type.
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
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), staff: user('st@t.com', 'سارة', '', ['HR_STAFF']), acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), rec: user('rec@t.com', 'علي', '', ['RECRUITER']) };
const t = { hr: login('hr@t.com'), staff: login('st@t.com'), acc: login('acc@t.com'), rec: login('rec@t.com') };
const today = ctx.today_();
const emp = (id, name) => must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: id, Full_Name: name, Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: today, Employment_Kind: 'PERMANENT' }), 'emp ' + id);
emp('E1', 'أحمد علي حسن'); emp('E2', 'كريم محمود سالم'); emp('E3', 'هاني فؤاد علي'); emp('E4', 'منى سعيد حسن');

// =============== the template task ===============
fresh(); const bioItems = ctx.all_('ONB_TEMPLATE_ITEMS').filter(i => i.Kind === 'BIO');
ok(bioItems.length === ctx.all_('ONB_TEMPLATES').length && bioItems.every(i => /ZKBioTime/.test(i.Title_AR) && i.Phase === 'DAY1' && i.Owner_Role === 'HR_SITE'), 'every template has the day-one ZKBioTime task (HR)');
ok(!ctx.all_('ONB_TEMPLATE_ITEMS').some(i => i.Title_AR === 'تسليم الكارنيه وتسجيل البصمة'), 'the old plain task is gone from the seed');
// the migration on an old database: an old item and an open old task become the enrolment task
fresh(); const tpl = ctx.all_('ONB_TEMPLATES')[0];
const oldItem = ctx.insert_('ONB_TEMPLATE_ITEMS', { Item_ID: ctx.nextId_('ONB_ITEM'), Template_ID: tpl.Template_ID, Phase: 'DAY1', Day_Offset: '0', Owner_Role: 'HR_SITE', Title_AR: 'تسليم الكارنيه وتسجيل البصمة', Details: '', Needs_Ack: 'N', Sort_Order: '999', Status: 'Active', Kind: '' }, 'x');
delete props.MIG_0440; fresh(); ctx.migrate0440_();
fresh(); ok(ctx.get_('ONB_TEMPLATE_ITEMS', oldItem.Item_ID).Kind === 'BIO' && /ZKBioTime/.test(ctx.get_('ONB_TEMPLATE_ITEMS', oldItem.Item_ID).Title_AR), 'migration: the old item becomes the enrolment task');
fresh(); ctx.update_('ONB_TEMPLATE_ITEMS', oldItem.Item_ID, { Status: 'Inactive' }, 'x');

// =============== the onboarding task closes only through the form ===============
const O1 = must(api('onb.start', t.hr, { Employee_ID: 'E1', Start_Date: today }), 'onboarding E1');
let D = must(api('onb.get', t.hr, { Onboarding_ID: O1.Onboarding_ID }), 'onb get');
const bioTask = D.tasks.find(x => x.kind === 'BIO');
ok(bioTask && bioTask.status === 'OPEN' && !D.onb.att && D.onb.attLic.limit === 150 && D.onb.attLic.used === 0, 'the program carries the enrolment task; nothing recorded; 150 mobile licences free');
bad(api('onb.task', t.hr, { Task_ID: bioTask.id, action: 'DONE' }), /تسجيل البصمة/, 'the enrolment task cannot be ticked «done» by hand');
bad(api('att.save', t.acc, { Task_ID: bioTask.id, face: 'Y', finger: 'Y', type: 'MACHINES' }), /البشرية/, 'a manager cannot record the enrolment');
bad(api('att.save', t.hr, { Task_ID: bioTask.id, face: 'Y', finger: 'N', type: 'MACHINES' }), /الاتنين/, 'face without fingers refused without a reason');
bad(api('att.save', t.hr, { Task_ID: bioTask.id, face: 'Y', finger: 'Y' }), /نوع التسجيل/, 'the punch type is required');
let A = must(api('att.save', t.hr, { Task_ID: bioTask.id, face: 'Y', finger: 'Y', type: 'MOBILE', code: '10234' }), 'enrolment from the task');
ok(A.att.status === 'ACTIVE' && A.att.face && A.att.finger && A.att.type === 'MOBILE' && A.lic.used === 1, 'recorded: face, fingers, mobile — one licence in use');
fresh(); const tk = ctx.get_('ONB_TASKS', bioTask.id);
ok(tk.Status === 'DONE' && /وجه ✓/.test(tk.Note) && /موبايل/.test(tk.Note), 'the task closed with the summary');
fresh(); const row = ctx.findOne_('ATT_ENROLL', { Onboarding_ID: O1.Onboarding_ID });
ok(Object.keys(row).every(k => !/finger_?print|template|image|photo|gps/i.test(k)) && row.Face === 'Y' && row.Finger === 'Y', 'only flags are kept — no biometric field exists');
ok(ctx.find_('AUDIT_LOG', { Entity_Type: 'ATT_ENROLL' }).length === 1, 'audited');
D = must(api('onb.get', t.hr, { Onboarding_ID: O1.Onboarding_ID }), 'onb get 2');
ok(D.onb.att && D.onb.att.typeName === 'موبايل + ماكينات', 'the program shows the enrolment');
// a reason lets one of them be missing
const O2 = must(api('onb.start', t.hr, { Employee_ID: 'E2', Start_Date: today }), 'onboarding E2');
const bio2 = must(api('onb.get', t.hr, { Onboarding_ID: O2.Onboarding_ID }), 'g').tasks.find(x => x.kind === 'BIO');
must(api('att.save', t.hr, { Task_ID: bio2.id, face: 'Y', finger: 'N', type: 'MACHINES', note: 'إصابة في الإيد اليمين — الأصابع بعد أسبوعين' }), 'face only, with a reason');

// =============== mobile licences ===============
fresh(); ctx.update_('CONFIG', 'ATT_MOBILE_LICENSES', { Config_Value: '2' }, 'x');
must(api('att.save', t.staff, { Employee_ID: 'E3', face: 'Y', finger: 'Y', type: 'MOBILE' }), 'an existing employee from his file (HR staff) — second licence');
bad(api('att.save', t.hr, { Employee_ID: 'E4', face: 'Y', finger: 'Y', type: 'MOBILE' }), /خلصت \(2 من 2\)/, 'no third mobile licence');
must(api('att.save', t.hr, { Employee_ID: 'E4', face: 'Y', finger: 'Y', type: 'MACHINES' }), 'machines only is always possible');
must(api('att.save', t.hr, { Employee_ID: 'E3', face: 'Y', finger: 'Y', type: 'MACHINES' }), 'E3 moved to machines only');
A = must(api('att.save', t.hr, { Employee_ID: 'E4', face: 'Y', finger: 'Y', type: 'MOBILE' }), 'E4 takes the freed licence');
ok(A.lic.used === 2 && ctx.find_('ATT_ENROLL', { Employee_ID: 'E4' }).length === 1, 'the same row is corrected, not doubled; 2 of 2 in use');
bad(api('att.save', t.acc, { Employee_ID: 'E4', face: 'Y', finger: 'Y', type: 'MACHINES' }), /البشرية/, 'only HR records from the file');
let G = must(api('emp.get', t.hr, { Employee_ID: 'E1' }), 'employee file');
ok(G.att && G.att.type === 'MOBILE' && G.att.status === 'ACTIVE' && G.attLic.used === 2 && G.canAtt, 'the file shows the enrolment from the onboarding and the licences');

// =============== exit: stop due → HR told → stopped frees the licence ===============
fresh(); const before = ctx.all_('NOTIFICATIONS').length;
let X = must(api('emp.exit', t.hr, { Employee_ID: 'E1', Last_Working_Date: ctx.addDaysYmd_(today, -1), reasonCode: 'RESIGNATION', note: 'استقالة' }), 'exit E1');
fresh(); const r1 = ctx.findOne_('ATT_ENROLL', { Onboarding_ID: O1.Onboarding_ID });
ok(X.attStopDue && r1.Status === 'STOP_DUE' && r1.Employee_ID === 'E1', 'the enrolment is due to be stopped');
ok(ctx.all_('NOTIFICATIONS').slice(before).some(n => n.User_ID === U.hr && /أوقف بصمة أحمد علي حسن على ZKBioTime/.test(n.Title)), 'the HR manager is told to stop it on ZKBioTime');
ok(must(api('emp.get', t.hr, { Employee_ID: 'E2' }), 'g').attLic.used === 2, 'the licence stays in use until it is really stopped');
bad(api('att.stop', t.acc, { Enroll_ID: r1.Enroll_ID }), /البشرية/, 'a manager cannot record the stop');
const S = must(api('att.stop', t.hr, { Enroll_ID: r1.Enroll_ID }), 'stopped on ZKBioTime');
ok(S.lic.used === 1, 'stopped → the mobile licence is free');
bad(api('att.save', t.hr, { Employee_ID: 'E1', face: 'Y', finger: 'Y', type: 'MACHINES' }), /خرج/, 'no enrolment for someone who left');

// =============== deletion and read-only ===============
fresh(); ctx.insert_('PERSONS', { Person_ID: 'PER-X', Full_Name: 'هاني فؤاد علي', Status: 'Active' }, 'x');
fresh(); ctx.update_('ATT_ENROLL', ctx.findOne_('ATT_ENROLL', { Employee_ID: 'E3' }).Enroll_ID, { Person_ID: 'PER-X', Bio_Code: '777', Note: 'ملاحظة' }, 'x');
fresh(); ctx.purgePerson_('SYSTEM', 'PER-X', 'test');
fresh(); const r3 = ctx.findOne_('ATT_ENROLL', { Employee_ID: 'E3' });
ok(/محذوف/.test(r3.Full_Name) && r3.Bio_Code === '' && r3.Note === '', 'a purge blanks the name, code and note of the enrolment');
fresh(); ok(ctx.WIPE_TABLES_.indexOf('ATT_ENROLL') >= 0, 'the demo wipe clears the enrolments');
ok(!ctx.consultantMay_('att.save', {}) && !ctx.consultantMay_('att.stop', {}), 'a consultant cannot record or stop');

console.log('\nPhase 43 (ZKBioTime enrolment): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
