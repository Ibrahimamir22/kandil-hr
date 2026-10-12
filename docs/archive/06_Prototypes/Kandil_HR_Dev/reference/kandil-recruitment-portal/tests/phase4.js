// Employees: import from the review workbook → occupied HC from employees → transfer / exit / replacement → fills create & move employees.
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const T = '\t';
const day = n => { const d = new Date(Date.now() + 3 * 3600000 + n * 864e5); return d.toISOString().slice(0, 10); };
const occ = id => { fresh(); return ctx.get_('POSITIONS', id).Occupied_HC; };

ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tOwner = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'رئيس قسم التكاليف', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العروض', '', '', '', '3'],
  ['قنديل مصر', 'القطاع التجاري', '', '', '', '', 'مدير القطاع التجاري', 'العبور', '', 'Y', '', '']
].map(r => r.join(T)).join('\n');
must(api('import.commit', tOwner, { text: rows, reason: 'init' }), 'import structure');
fresh();
const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
const COST = P['محاسب تكاليف'], GEN = P['محاسب عام'], ACCM = P['مدير الحسابات'], SALES = P['مدير القطاع التجاري'];
// «محاسب عام» works in the branches
const grpLoc = ctx.get_('POSITIONS', GEN).Location_ID;
must(api('locations.save', tOwner, { Location_ID: grpLoc, Name_AR: 'الفروع', Location_Type: 'BRANCH_GROUP', Status: 'Active', reason: 'x' }), 'group');
const b1 = must(api('locations.save', tOwner, { Name_AR: 'فرع النزهة', Location_Type: 'SHOWROOM', Governorate: 'القاهرة' }), 'b1').Location_ID;
const b2 = must(api('locations.save', tOwner, { Name_AR: 'فرع المعادي', Location_Type: 'SHOWROOM', Governorate: 'القاهرة' }), 'b2').Location_ID;

function user(email, name, pos, roles) {
  const u = must(api('users.save', tOwner, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + email);
  if (roles) must(api('users.setRoles', tOwner, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles ' + email);
  return u.User_ID;
}
const U = {
  acc: user('acc@t.com', 'مدير الحسابات', ACCM),
  sales: user('sales@t.com', 'مدير التجاري', SALES),
  hr: user('hr@t.com', 'مدير الموارد', '', ['HR_MANAGER']),
  staff: user('staff@t.com', 'أخصائي شؤون', '', ['HR_STAFF']),
  rec: user('rec@t.com', 'أخصائي توظيف', '', ['RECRUITER'])
};
const t = {}; ['acc', 'sales', 'hr', 'staff', 'rec'].forEach(k => { t[k] = login(k + '@t.com'); });

// ---- access
ok(!api('emp.list', t.rec, {}).ok, 'recruiter cannot see employees');
ok(!api('emp.list', t.acc, {}).ok, 'line manager cannot list employees');
let r = must(api('emp.list', t.staff, {}), 'staff lists');
ok(r.total === 0 && r.fromEmployees === false && r.canAdmin === false, 'empty, manual mode, staff not admin');
ok(!api('emp.import', t.staff, { rows: [{ code: '1', name: 'x' }] }).ok, 'staff cannot import');
const opts = must(api('emp.options', t.hr, {}), 'options');
ok(opts.exitReasons.length === 8 && opts.exitReasons.find(x => x.code === 'OTHER').note && opts.branches.length === 2 && opts.positions.find(p => p.id === GEN).branchGroup, 'options lists');

// ---- import preview
const lbl = id => id + ' | عنوان | وحدة | مكان';
const file = [
  { code: '101', name: 'أحمد علي حسن', hire: '2015-03-01', jobType: 'إداري', status: 'على رأس العمل', position: lbl(COST) },
  { code: '102.0', name: 'محمود سيد إبراهيم', hire: '2018-01-10', position: lbl(COST) },
  { code: '١٠٣', name: 'كريم عادل فؤاد', position: lbl(COST), status: 'يومية' },                   // 3 on a 2-HC position
  { code: '104', name: 'منى سعيد عبده', position: lbl(GEN), branch: 'فرع النزهة' },
  { code: '105', name: 'هاني فتحي محمود', position: lbl(GEN) },                                        // branch missing
  { code: '106', name: 'سامي رضا', position: '' },                                                       // no position
  { code: '101', name: 'مكرر', position: lbl(COST) },                                                    // duplicate code
  { code: 'x y!', name: 'كود غلط', position: lbl(COST) },
  { code: '107', name: 'رامي مدير الحسابات', position: lbl(ACCM), email: 'acc@t.com' },                // user exists → skipped
  { code: '108', name: 'وليد مدير التجاري الجديد', position: lbl(SALES), email: 'Walid@T.com' },       // new user
  { code: '109', name: 'تامر وظيفة مش موجودة', position: 'POS-999999 | x' }
];
r = must(api('emp.import', t.hr, { rows: file }), 'preview');
ok(r.total === 11 && r.valid === 7 && r.errors.length === 4 && r.newCount === 7 && r.users === 2 && r.noBranch.length === 1 && r.noBranch[0].code === '105', 'preview counts ' + JSON.stringify([r.valid, r.errors.length, r.newCount, r.users]));
ok(r.errors.some(e => /مكرر/.test(e.msg)) && r.errors.some(e => /POS-999999/.test(e.msg)), 'error messages');
ok(r.over.length === 1 && r.over[0].Position_ID === COST && r.over[0].employees === 3 && r.over[0].structural === 2, 'over-HC list');
fresh(); ok(ctx.all_('EMPLOYEES').length === 0, 'preview writes nothing');
r = api('emp.import', t.hr, { rows: file, commit: true });
ok(!r.ok && /أخطاء/.test(r.error), 'commit blocked while errors');
r = must(api('emp.import', t.hr, { rows: file, commit: true, skipErrors: 'Y', createUsers: 'Y', reason: 'تحميل أول من برنامج التقييم' }), 'commit');
ok(r.committed && r.usersCreated === 0 && r.usersLinked === 1 && r.usersSkipped.some(x => /walid@t.com/.test(x) && /مدير وحدة/.test(x)), 'users linked; v0.34: HR manager cannot put a user on a unit head position ' + JSON.stringify(r));
r = must(api('emp.import', tOwner, { rows: file, commit: true, skipErrors: 'Y', createUsers: 'Y', reason: 'تحميل أول من برنامج التقييم' }), 'commit again (owner)');
ok(r.usersCreated === 1, 'the owner creates the head\'s account ' + JSON.stringify(r.usersSkipped));
fresh(); ok(ctx.get_('USERS', U.acc).Employee_ID === '107', 'existing user linked to his employee code');
fresh();
ok(ctx.all_('EMPLOYEES').length === 7 && ctx.cfg_('OCCUPIED_FROM_EMPLOYEES', false) === true, 'employees saved + mode on');
ok(ctx.get_('EMPLOYEES', '102').Employee_ID === '102' && ctx.get_('EMPLOYEES', '103').Employment_Kind === 'DAILY', 'code normalized; daily kind');
ok(ctx.get_('EMPLOYEES', '104').Location_ID === b1 && ctx.get_('EMPLOYEES', '105').Location_ID === grpLoc, 'branch saved; blank branch stays on the group');
ok(occ(COST) === '3' && occ(GEN) === '2' && occ(ACCM) === '1', 'occupied recounted');
ok(ctx.all_('EMPLOYEE_HISTORY').filter(h => h.Event === 'IMPORT').length === 7, 'import history');
ok(ctx.findUserByEmail_('walid@t.com').Employee_ID === '108', 'new user linked to employee');

// ---- re-import: idempotent, then a correction moves
r = must(api('emp.import', t.hr, { rows: file.slice(0, 2) }), 'reimport preview');
ok(r.newCount === 0 && r.same === 2 && r.moved === 0, 'same rows detected ' + JSON.stringify(r));
r = must(api('emp.import', t.hr, { rows: [Object.assign({}, file[2], { position: lbl(GEN), branch: 'فرع المعادي' })], commit: true }), 'correction');
ok(r.moved === 1 && occ(COST) === '2' && occ(GEN) === '3', 'moved by import + recount');
fresh(); ok(ctx.all_('EMPLOYEES').length === 7, 'never exits anyone missing from the file');

// ---- occupied HC no longer typed by hand
r = api('positions.update', tOwner, { Position_ID: COST, Occupied_HC: '7', reason: 'تعديل يدوي' });
ok(!r.ok && /الموظفين/.test(r.error), 'manual occupied blocked ' + JSON.stringify(r));
must(api('positions.update', tOwner, { Position_ID: COST, Structural_HC: '5', Occupied_HC: '2', reason: 'زيادة' }), 'structural still editable');

// ---- list / filters
r = must(api('emp.list', t.staff, { q: 'منى' }), 'search');
ok(r.total === 1 && r.rows[0].locationName === 'فرع النزهة' && r.rows[0].title === 'محاسب عام', 'search + view');
r = must(api('emp.list', t.hr, { locationId: b2 }), 'by branch'); ok(r.total === 1, 'branch filter');
r = must(api('emp.list', t.hr, { positionId: COST }), 'by position'); ok(r.total === 2, 'position filter');

// ---- add one / edit
r = api('emp.save', t.hr, { isNew: 'Y', Employee_ID: '101', Full_Name: 'حد تاني خالص', Position_ID: COST });
ok(!r.ok && /متسجل/.test(r.error), 'duplicate code');
r = api('emp.save', t.hr, { isNew: 'Y', Employee_ID: '110', Full_Name: 'سارة محمد عبد الله', Position_ID: GEN, Location_ID: 'LOC-99' });
ok(!r.ok && /الفرع/.test(r.error), 'unknown branch');
must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: '110', Full_Name: 'سارة محمد عبد الله', Position_ID: GEN, Location_ID: b2, Hire_Date: '2026-09-01', Employment_Kind: 'CONTRACT' }), 'add');
ok(occ(GEN) === '4', 'add recounts');
r = api('emp.save', t.hr, { Employee_ID: '110', Full_Name: 'سارة محمد عبد الله', Position_ID: COST });
ok(!r.ok && /نقل/.test(r.error), 'position changes only via transfer');
must(api('emp.save', t.hr, { Employee_ID: '110', Full_Name: 'سارة محمد عبدالله أحمد', Position_ID: GEN, Location_ID: b2, Notes: 'تعديل اسم', reason: 'تصحيح' }), 'edit');

// ---- transfer
r = api('emp.transfer', t.hr, { Employee_ID: '110', Position_ID: GEN, Location_ID: b2, reason: 'نقل' });
ok(!r.ok && /نفس المكان/.test(r.error), 'same place');
must(api('emp.transfer', t.hr, { Employee_ID: '110', Position_ID: GEN, Location_ID: b1, reason: 'احتياج فرع النزهة' }), 'branch move');
ok(occ(GEN) === '4', 'branch move keeps position count');
must(api('emp.transfer', t.hr, { Employee_ID: '107', Position_ID: COST, reason: 'تكليف مؤقت' }), 'transfer');
fresh(); ok(ctx.get_('USERS', U.acc).Position_ID === COST, 'linked user follows the transfer');
ok(occ(ACCM) === '0' && occ(COST) === '3', 'transfer recounts both');
must(api('emp.transfer', t.hr, { Employee_ID: '107', Position_ID: ACCM, reason: 'رجوع' }), 'transfer back');
fresh(); ok(ctx.get_('USERS', U.acc).Position_ID === ACCM, 'and back');
// linked user follows
must(api('emp.transfer', t.hr, { Employee_ID: '108', Position_ID: ACCM, reason: 'تجربة' }), 'move linked');
fresh(); ok(ctx.findUserByEmail_('walid@t.com').Position_ID === ACCM, 'linked user position follows');
must(api('emp.transfer', t.hr, { Employee_ID: '108', Position_ID: SALES, reason: 'رجوع' }), 'move linked back');

// ---- end of service with notice: still counted, manager told, replacement prefill
mails.length = 0;
r = must(api('emp.exit', t.hr, { Employee_ID: '101', Last_Working_Date: day(20), reasonCode: 'RESIGNATION' }), 'exit notice');
ok(r.employee.Status === 'Active' && r.employee.Exit_Date === day(20) && r.notified >= 1, 'notice keeps active ' + JSON.stringify(r));
ok(occ(COST) === '2', 'still counted until the last day');
fresh(); const n = ctx.all_('NOTIFICATIONS').filter(x => x.Link_Type === 'EMP_EXIT' && x.Link_ID === '101');
ok(n.length && n.some(x => x.User_ID === U.acc), 'manager notified');
r = must(api('emp.list', t.hr, { status: 'leaving' }), 'leaving'); ok(r.total === 1 && r.rows[0].leaving, 'leaving filter');
r = must(api('emp.replacement', t.acc, { Employee_ID: '101' }), 'replacement prefill');
ok(r.Position_ID === COST && r.Reason_Category === 'RESIGNATION' && r.Last_Working_Date === day(20) && r.Employee_Name === 'أحمد علي حسن', 'prefill data');
ok(!api('emp.replacement', t.sales, { Employee_ID: '101' }).ok, 'other sector cannot');
r = api('emp.exit', t.hr, { Employee_ID: '102', Last_Working_Date: day(-1), reasonCode: 'OTHER' });
ok(!r.ok && /توضيح/.test(r.error), 'OTHER needs a note');
r = api('emp.exit', t.hr, { Employee_ID: '102', Last_Working_Date: day(-1), reasonCode: 'ABSENCE' });
ok(!r.ok && /شخصين/.test(r.error), 'v0.36: ending service by the company needs two people');
const dq = must(api('dual.request', t.hr, { Kind: 'TERMINATION', Employee_ID: '102', Last_Working_Date: day(-1), reasonCode: 'ABSENCE', note: 'انقطاع', reason: 'غياب متصل أكتر من 15 يوم' }), 'termination asked');
ok(!api('dual.decide', t.hr, { Dual_ID: dq.Dual_ID, decision: 'APPROVE' }).ok, 'the one who asks cannot approve');
r = must(api('dual.decide', tOwner, { Dual_ID: dq.Dual_ID, decision: 'APPROVE', comment: 'موافق' }), 'past exit').data;
ok(r.employee.Status === 'Exited' && occ(COST) === '1', 'past exit uncounted');
r = must(api('emp.list', t.hr, { status: 'exited' }), 'exited'); ok(r.total === 1, 'exited filter');
must(api('emp.exitCancel', t.hr, { Employee_ID: '102', reason: 'رجع الشغل' }), 'cancel exit');
ok(occ(COST) === '2', 'cancel recounts');
// daily refresh: a notice whose day passed
fresh(); ctx.update_('EMPLOYEES', '101', { Exit_Date: day(-2) }, 'x');
ctx.PropertiesService.getScriptProperties().setProperty('EMP_DAILY', '2000-01-01');
api('me', t.staff, {});
fresh(); ok(ctx.get_('EMPLOYEES', '101').Status === 'Exited' && occ(COST) === '1', 'daily refresh exits due employees');
r = must(api('emp.get', t.staff, { Employee_ID: '101' }), 'get');
ok(r.history[0].Event === 'EXIT_NOTICE' && r.exitReasonName === 'استقالة' && r.history.some(h => h.Event === 'IMPORT'), 'history');

// ---- vacancy fills create / move employees
const draft = { Recruitment_Type: 'REPLACEMENT', Employment_Type: 'CONTRACT', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED',
  Reason_Category: 'RESIGNATION', Justification: 'بديل للموظف المستقيل في التكاليف', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01',
  Experience_Years: '2', lines: [{ Position_ID: COST, Requested_HC: 2 }],
  replacements: [{ Employee_Name: 'أحمد علي حسن', Employee_ID: '101', Position_Title: 'محاسب تكاليف', Last_Working_Date: day(-2), Reason: 'استقالة' }] };
r = api('req.submit', tOwner, draft);
if (!r.ok) { draft.Recruitment_Type = 'VACANT'; draft.Reason_Category = 'WORKLOAD'; delete draft.replacements; r = api('req.submit', tOwner, draft); }
r = must(r, 'request');
const vac = r.vacancies[0];
r = api('vac.fill', tOwner, { Vacancy_ID: vac, Method: 'EXTERNAL', Employee_Name: 'يوسف جديد', Effective_Date: day(0) });
ok(!r.ok && /كود الموظف/.test(r.error), 'code required in employees mode');
r = api('vac.fill', tOwner, { Vacancy_ID: vac, Method: 'EXTERNAL', Employee_Name: 'يوسف جديد', Employee_ID: '104', Effective_Date: day(0) });
ok(!r.ok && /شغال بالفعل/.test(r.error), 'active code blocked');
r = must(api('vac.fill', tOwner, { Vacancy_ID: vac, Method: 'EXTERNAL', Employee_Name: 'يوسف أحمد جديد', Employee_ID: '201', Effective_Date: day(0) }), 'external fill');
fresh(); const e201 = ctx.get_('EMPLOYEES', '201');
ok(e201 && e201.Status === 'Active' && e201.Position_ID === COST && e201.Employment_Kind === 'CONTRACT' && /^FILL:/.test(e201.Source), 'employee created by fill');
ok(occ(COST) === '2', 'fill recounts');
// re-hire an exited employee
must(api('vac.fill', tOwner, { Vacancy_ID: vac, Method: 'EXTERNAL', Employee_Name: 'أحمد علي حسن', Employee_ID: '101', Effective_Date: day(0) }), 'rehire');
fresh(); ok(ctx.get_('EMPLOYEES', '101').Status === 'Active' && ctx.get_('EMPLOYEES', '101').Exit_Date === '' && occ(COST) === '3', 'rehired');
let g = must(api('vac.get', tOwner, { Vacancy_ID: vac }), 'vac get');
const fill201 = g.vacancy.fills.find(f => f.Employee_ID === '201');
must(api('vac.fillVoid', tOwner, { Fill_ID: fill201.Fill_ID, reason: 'ما استلمش' }), 'void external');
fresh(); ok(ctx.get_('EMPLOYEES', '201').Status === 'Cancelled' && occ(COST) === '2', 'void cancels the hire');
r = must(api('emp.list', t.hr, { status: 'all' }), 'all'); ok(r.counts.exited === 0, 'cancelled not counted as exited');
// internal transfer: employee 104 (branch) → cost accounting
r = must(api('vac.fill', tOwner, { Vacancy_ID: vac, Method: 'INTERNAL_TRANSFER', Employee_ID: '104', Effective_Date: day(0) }), 'internal fill');
fresh(); ok(ctx.get_('EMPLOYEES', '104').Position_ID === COST && occ(COST) === '3' && occ(GEN) === '3', 'internal transfer moves + recounts');
ok(r.fill.Source_Position_ID === GEN && r.fill.Employee_Name === 'منى سعيد عبده', 'source and name from employee');
must(api('vac.fillVoid', tOwner, { Fill_ID: r.fill.Fill_ID, reason: 'غلط' }), 'void internal');
fresh(); ok(ctx.get_('EMPLOYEES', '104').Position_ID === GEN && ctx.get_('EMPLOYEES', '104').Location_ID === b1 && occ(GEN) === '4', 'void moves back to the branch');

// ---- portal user for an employee
r = api('emp.makeUser', t.hr, { Employee_ID: '108', Email: 'x@t.com' });
ok(!r.ok && /مستخدم بالفعل/.test(r.error), 'already a user');
r = must(api('emp.makeUser', t.hr, { Employee_ID: '110', Email: 'sara@t.com' }), 'make user');
ok(r.Position_ID === GEN && r.Employee_ID === '110', 'user linked');

// ---- grades (Korn Ferry job levels)
fresh(); ok(ctx.all_('GRADES').length === 15 && ctx.get_('GRADES', '15').Level_Order === '15', '15 grades seeded');
fresh(); { const jc = ctx.get_('POSITIONS', COST).Job_Code;
  ctx.update_('JOBS', jc, { Grade_Code: '' }, 'x'); vm.runInContext("JOB_LEVELS_050_['" + jc + "'] = 6;", ctx);
  ctx.PropertiesService.getScriptProperties().setProperty('GRADES_050', ''); fresh(); ctx.grades050_();
  fresh(); ok(ctx.get_('JOBS', jc).Grade_Code === '6', 'job grade loaded');
  ctx.update_('JOBS', jc, { Grade_Code: '3' }, 'x'); ctx.PropertiesService.getScriptProperties().setProperty('GRADES_050', ''); fresh(); ctx.grades050_();
  fresh(); ok(ctx.get_('JOBS', jc).Grade_Code === '3', 'existing grade never overwritten'); }

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
