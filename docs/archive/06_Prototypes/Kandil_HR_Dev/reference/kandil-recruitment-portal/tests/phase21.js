// v0.19.0 (phase 6C): internal transfers — who opens, room on the target (free headcount or open vacancy), approvals
// (current manager → new manager → HR manager → HR sector manager for pay), pay flags and salary items, schedule and
// location changes, execution on the date (vacancy filled), reject / cancel, privacy of amounts.
const { ctx, mails, fresh, vm } = require('./mocks');
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '1']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('JOBS', P['محاسب تكاليف'].Job_Code, { Grade_Code: '7' }, 'x'); ctx.update_('JOBS', P['أمين خزينة'].Job_Code, { Grade_Code: '7' }, 'x'); ctx.update_('JOBS', P['محصل'].Job_Code, { Grade_Code: '5' }, 'x');
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), trs: user('trs@t.com', 'مدير الخزينة', P['مدير الخزينة'].Position_ID),
  hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), sec: user('sec@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']), staff: user('st@t.com', 'سارة', '', ['HR_STAFF']), rec: user('rec@t.com', 'علي', '', ['RECRUITER']) };
const t = { acc: login('acc@t.com'), trs: login('trs@t.com'), hr: login('hr@t.com'), sec: login('sec@t.com'), staff: login('st@t.com'), rec: login('rec@t.com') };
function emp(id, name, posTitle) { must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: id, Full_Name: name, Position_ID: P[posTitle].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'emp ' + id); }
emp('E1', 'أحمد علي حسن', 'محاسب تكاليف'); emp('E2', 'كريم محمود سالم', 'محاسب تكاليف'); emp('E3', 'هاني فؤاد علي', 'أمين خزينة'); emp('E4', 'سامي نبيل رزق', 'أمين خزينة');
emp('E5', 'منى سعيد حسن', 'محاسب تكاليف');
fresh(); const occ = n => num(ctx.get_('POSITIONS', P[n].Position_ID).Occupied_HC); function num(x) { return Number(x || 0); }
ok(occ('محاسب تكاليف') === 3 && occ('أمين خزينة') === 2, 'headcount from employees: 3/4 and 2/2');

// who can open
let O = must(api('trf.options', t.acc, {}), 'manager options');
ok(O.employees.length === 3 && O.employees.every(e => /محاسب/.test(e.title)), 'manager sees his own employees only');
bad(api('trf.options', t.rec, {}), /المدير الحالي|فريق الموارد/, 'a recruiter cannot open');
ok(must(api('trf.options', t.staff, {}), 'hr options').employees.length === 5, 'HR staff see everyone');
// v0.41 (CHG-85): a manager may receive someone from another unit into his own scope — never send him elsewhere
bad(api('trf.submit', t.acc, { Employee_ID: 'E3', To_Position_ID: P['محصل'].Position_ID, Effective_Date: ctx.today_(), Reason: 'تجربة نقل موظف مش تبعي' }), /نطاقك|المدير الحالي/, 'manager cannot move another unit\'s employee to a place outside his scope');

// targets with room
let TG = must(api('trf.targets', t.acc, { Employee_ID: 'E1', q: '' }), 'targets');
ok(!TG.rows.some(r => r.id === P['أمين خزينة'].Position_ID) && TG.rows.some(r => r.id === P['محصل'].Position_ID), 'full position not offered; free one offered');
bad(api('trf.submit', t.acc, { Employee_ID: 'E1', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: ctx.today_(), Reason: 'محتاجين أمين خزينة زيادة' }), /مكان شاغر/, 'no room → refused');

// pay flags: collector is grade 5 at Inshas (other transport zone)
let PV = must(api('trf.preview', t.acc, { Employee_ID: 'E1', To_Position_ID: P['محصل'].Position_ID }), 'preview');
ok(PV.flags.some(f => f.key === 'GRADE') && PV.flags.some(f => f.key === 'TRANSPORT') && PV.room.free === 1, 'flags: grade and transport zone; room 1');
const base = { Employee_ID: 'E1', To_Position_ID: P['محصل'].Position_ID, Effective_Date: ctx.today_(), Reason: 'احتياج تحصيل في إنشاص', New_Schedule: '8 ص – 4 م بدل 9 – 5' };
bad(api('trf.submit', t.acc, Object.assign({}, base, { Reason: 'قصير' })), /سبب النقل/, 'reason ≥ 10');
bad(api('trf.submit', t.acc, base), /مفردات الراتب/, 'flags force a salary-items change');
const R1 = must(api('trf.submit', t.acc, Object.assign({}, base, { Pay_Items: [{ item: 'بدل الانتقالات', from: '600', to: '900' }, { item: 'بدل تحصيل (ميزة متفق عليها)', from: '0', to: '500', note: 'اتفاق مع المدير' }] })), 'submitted');
ok(R1.status === 'PENDING' && R1.step === 'TO_MGR' && R1.steps[0].status === 'APPROVED' && R1.steps[0].note === 'صاحب الطلب' && R1.steps.length === 4 && R1.payChange && R1.locationChange && R1.schedule, 'current manager step approved (requester); 4 steps incl. pay; location + schedule change');
bad(api('trf.submit', t.staff, Object.assign({}, base, { Pay_Note: 'xxxxx' })), /مفتوح بالفعل/, 'one open transfer per employee');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.trs && /طلب نقل مستني اعتمادك/.test(n.Title)), 'new manager told');
ok(must(api('todo', t.trs, {}), 'todo').trf === 1, 'in the new manager\'s to-do');
// order
bad(api('trf.action', t.hr, { Transfer_ID: R1.id, action: 'APPROVE' }), /مستنية المدير الجديد/, 'HR waits for the new manager');
let G = must(api('trf.get', t.trs, { Transfer_ID: R1.id }), 'new manager reads');
ok(G.canAct && !G.payVisible && !G.payItems && G.flags.length === 2, 'managers see that pay changes, not the amounts');
must(api('trf.action', t.trs, { Transfer_ID: R1.id, action: 'APPROVE', note: 'موافق' }), 'new manager approves');
G = must(api('trf.get', t.hr, { Transfer_ID: R1.id }), 'hr reads');
ok(G.step === 'HR' && G.payVisible && G.payItems.length === 2 && G.payItems[1].to === '500', 'HR sees the salary items');
must(api('trf.action', t.hr, { Transfer_ID: R1.id, action: 'APPROVE' }), 'HR manager approves');
G = must(api('trf.get', t.sec, { Transfer_ID: R1.id }), 'sec reads');
ok(G.step === 'PAY' && G.status === 'PENDING', 'pay step with the HR sector manager');
fresh(); ok(ctx.findOne_('EMPLOYEES', { Employee_ID: 'E1' }).Position_ID === P['محاسب تكاليف'].Position_ID, 'not moved before the last approval');
must(api('trf.action', t.sec, { Transfer_ID: R1.id, action: 'APPROVE', note: 'معتمد' }), 'HR sector manager approves pay');
fresh(); let E1 = ctx.findOne_('EMPLOYEES', { Employee_ID: 'E1' });
ok(E1.Position_ID === P['محصل'].Position_ID && E1.Location_ID === P['محصل'].Location_ID, 'moved on approval (date = today)');
ok(occ('محاسب تكاليف') === 2 && occ('محصل') === 1, 'headcount recounted');
ok(ctx.find_('EMPLOYEE_HISTORY', { Employee_ID: 'E1' }).some(h => h.Event === 'TRANSFER' && /مواعيد/.test(h.Note) && h.Ref === R1.id), 'history with schedule and the request ref');
G = must(api('trf.get', t.hr, { Transfer_ID: R1.id }), 'done');
ok(G.status === 'DONE' && G.canNotify, 'done; payroll notice pending');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.hr && /اتنفذ النقل/.test(n.Title) && /مفردات راتب/.test(n.Body)), 'HR manager told about the salary items');
must(api('trf.action', t.hr, { Transfer_ID: R1.id, action: 'NOTIFIED' }), 'payroll notified');
bad(api('trf.action', t.hr, { Transfer_ID: R1.id, action: 'NOTIFIED' }), null, 'once');

// open vacancy on the target → the transfer fills it; HR staff opens; no pay flags (same grade/zone)
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين أمين خزينة زيادة للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Exception_Justification: 'زيادة مؤقتة لضغط الشغل في الخزينة',
  lines: [{ Position_ID: P['أمين خزينة'].Position_ID, Requested_HC: 1 }] }), 'vacancy request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
TG = must(api('trf.targets', t.staff, { Employee_ID: 'E2', q: 'أمين' }), 'targets 2');
const tgt = TG.rows.find(r => r.id === P['أمين خزينة'].Position_ID);
ok(tgt && tgt.vacancies.length === 1 && tgt.vacancies[0].id === VAC.Vacancy_ID, 'target with an open vacancy offered');
const future = ctx.addDaysYmd_(ctx.today_(), 5);
const R2 = must(api('trf.submit', t.staff, { Employee_ID: 'E2', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: future, Reason: 'نقل على شاغر الخزينة المفتوح' }), 'submit on vacancy');
ok(R2.vacancy === VAC.Vacancy_ID && !R2.payChange && R2.steps.length === 3 && R2.step === 'FROM_MGR', 'vacancy linked, no pay step, starts with the current manager');
TG = must(api('trf.targets', t.staff, { Employee_ID: 'E5', q: 'أمين' }), 'targets 3');
ok(!TG.rows.some(r => r.id === P['أمين خزينة'].Position_ID), 'the vacancy is reserved by the pending transfer');
must(api('trf.action', t.acc, { Transfer_ID: R2.id, action: 'APPROVE' }), 'current manager');
must(api('trf.action', t.trs, { Transfer_ID: R2.id, action: 'APPROVE' }), 'new manager');
must(api('trf.action', t.hr, { Transfer_ID: R2.id, action: 'APPROVE' }), 'HR');
G = must(api('trf.get', t.hr, { Transfer_ID: R2.id }), 'approved');
ok(G.status === 'APPROVED', 'approved, waits for the date');
fresh(); ok(ctx.findOne_('EMPLOYEES', { Employee_ID: 'E2' }).Position_ID === P['محاسب تكاليف'].Position_ID, 'not moved before the date');
fresh(); ctx.update_('TRANSFER_REQUESTS', R2.id, { Effective_Date: ctx.today_() }, 'x');
fresh(); let D = ctx.trfDaily_(); ok(D.executed === 1, 'daily executes on the date');
fresh(); const V2 = ctx.get_('VACANCIES', VAC.Vacancy_ID);
ok(ctx.findOne_('EMPLOYEES', { Employee_ID: 'E2' }).Position_ID === P['أمين خزينة'].Position_ID && V2.Joined_HC === '1' && V2.Status === 'FILLED', 'moved and the vacancy filled and closed');
ok(ctx.find_('VACANCY_FILLS', { Vacancy_ID: VAC.Vacancy_ID })[0].Method === 'INTERNAL_TRANSFER', 'recorded as internal transfer');
fresh(); D = ctx.trfDaily_(); ok(D.executed === 0, 'not twice');

// reject & cancel
fresh(); ctx.update_('POSITIONS', P['محصل'].Position_ID, { Structural_HC: '2' }, 'x');
const R3 = must(api('trf.submit', t.hr, { Employee_ID: 'E5', To_Position_ID: P['محصل'].Position_ID, Effective_Date: ctx.today_(), Reason: 'احتياج تحصيل تاني في إنشاص', Pay_Note: 'نفس المرتب بقرار الإدارة' }), 'HR manager opens');
ok(R3.step === 'FROM_MGR', 'HR-opened transfer starts with the current manager');
fresh(); { const st = [{ step: 'FROM_MGR', status: 'APPROVED' }, { step: 'TO_MGR', status: 'APPROVED' }, { step: 'HR', status: 'WAITING' }];
  const adv = ctx.trfAdvance_(ctx.get_('TRANSFER_REQUESTS', R3.id), st, U.hr); ok(adv.Status === 'APPROVED' && JSON.parse(adv.Steps_JSON)[2].note === 'صاحب الطلب', 'when reached, the HR step of an HR-manager requester is approved by itself'); }
// v0.41 (CHG-85): the managers give an opinion — an objection is recorded and the request goes on to HR, who decides
bad(api('trf.action', t.acc, { Transfer_ID: R3.id, action: 'REJECT' }), /سبب اعتراضك/, 'an objection needs a reason');
must(api('trf.action', t.acc, { Transfer_ID: R3.id, action: 'REJECT', note: 'محتاجه في إقفال الشهر' }), 'current manager objects');
G = must(api('trf.get', t.hr, { Transfer_ID: R3.id }), 'objected');
ok(G.status === 'PENDING' && G.steps[0].status === 'OBJECTED' && G.steps[0].note === 'محتاجه في إقفال الشهر', 'the objection is recorded, the request goes on');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.hr && /اعتراض/.test(n.Title)), 'requester told about the objection');
if (G.step === 'TO_MGR') must(api('trf.action', t.trs, { Transfer_ID: R3.id, action: 'APPROVE' }), 'new manager supports');
// HR opened it, so its own HR step passed at submission: the deciding step left is the HR sector manager (pay items)
G = must(api('trf.get', t.hr, { Transfer_ID: R3.id }), 'at the deciding step'); const dec = G.step === 'PAY' ? t.sec : t.hr;
bad(api('trf.action', dec, { Transfer_ID: R3.id, action: 'REJECT' }), /سبب الرفض/, 'HR rejection needs a reason');
must(api('trf.action', dec, { Transfer_ID: R3.id, action: 'REJECT', note: 'محتاجه في إقفال الشهر — رأي المدير' }), 'HR decides: reject');
G = must(api('trf.get', t.hr, { Transfer_ID: R3.id }), 'rejected');
ok(G.status === 'REJECTED' && G.rejectReason === 'محتاجه في إقفال الشهر — رأي المدير', 'rejected by HR with the reason');
const R4 = must(api('trf.submit', t.acc, { Employee_ID: 'E5', To_Position_ID: P['محصل'].Position_ID, Effective_Date: ctx.today_(), Reason: 'طلب الموظف نفسه للقرب من السكن', Pay_Note: 'نفس المرتب' }), 'again');
bad(api('trf.action', t.trs, { Transfer_ID: R4.id, action: 'CANCEL', note: 'xxx' }), /صاحب الطلب/, 'others cannot cancel');
must(api('trf.action', t.acc, { Transfer_ID: R4.id, action: 'CANCEL', note: 'الموظف غيّر رأيه' }), 'requester cancels');

// lists, privacy, consultant
let L = must(api('trf.list', t.acc, { tab: 'all' }), 'list');
ok(L.rows.length >= 3 && L.canOpen && L.rows.every(r => !r.payItems), 'manager list without amounts');
ok(must(api('trf.list', t.hr, { tab: 'done' }), 'hr done').rows.length === 4, 'HR sees all closed');
bad(api('trf.get', t.rec, { Transfer_ID: R1.id }), /صلاحية/, 'unrelated users cannot open');
const C = user('c@t.com', 'الاستشاري'); must(api('users.save', tO, { User_ID: C, Email: 'c@t.com', Full_Name_AR: 'الاستشاري', Access_Expires_At: ctx.addDaysIso_(10).slice(0, 10) }), 'exp');
must(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), 'consultant'); const tC = login('c@t.com'); must(api('nda.accept', tC, {}), 'nda');
ok(must(api('trf.get', tC, { Transfer_ID: R1.id }), 'consultant reads').payItems.length === 2, 'consultant reads with amounts');
bad(api('trf.submit', tC, base), /للعرض فقط/, 'consultant cannot submit');

console.log('\nPhase 21 (internal transfers): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
