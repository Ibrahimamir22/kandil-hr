// v0.41.0: transfers and onboarding (CHG-85) and the small items (CHG-86) — the receiving manager opens a transfer and
// the managers give an opinion only (HR decides); temporary transfers that end by themselves; the handover list; the
// replacement offered on execution; IT / administration / safety onboarding owners; the custody & PPE log (flagged at
// exit); the «arriving tomorrow» screen; similar-name duplicates; the frozen vacancy; leaving within 30 / 180 / 365 days;
// new-hire survey axes; «improve the wording» of a note with AI; the editor-only check reads the user's e-mail.
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
const fs = require('fs'), path = require('path');
const today = ctx.today_(), plus = n => ctx.addDaysYmd_(today, n);
const sys = id => ({ user: ctx.get_('USERS', id), sessionId: '' });
const notesOf = (uid, re) => ctx.all_('NOTIFICATIONS').filter(n => n.User_ID === uid && re.test(n.Title));

// =============== CHG-85: the receiving manager opens, the managers give an opinion ===============
let O = must(api('trf.options', t.trs, {}), 'receiver options');
ok(O.employees.every(e => /خزينة/.test(e.title)) && O.types.TEMPORARY && O.handover.length === 4, 'without a search: his own people; the two types and the handover list offered');
O = must(api('trf.options', t.trs, { q: 'أحمد علي' }), 'receiver searches');
ok(O.employees.some(e => e.id === 'E1'), 'with 3+ letters the receiving manager finds an employee of another unit');
let TG = must(api('trf.targets', t.trs, { Employee_ID: 'E1', q: '' }), 'receiver targets');
ok(TG.rows.length && TG.rows.every(r => /الخزينة/.test(r.unit)), 'targets limited to his own scope');
bad(api('trf.submit', t.trs, { Employee_ID: 'E1', To_Position_ID: P['محاسب تكاليف'].Position_ID, Effective_Date: today, Reason: 'تجربة نقل لمكان مش تبعي' }), /نطاقك|نفس المكان/, 'not to a place outside his scope');
let R = must(api('trf.submit', t.trs, { Employee_ID: 'E1', To_Position_ID: P['محصل'].Position_ID, Effective_Date: today, Reason: 'محتاجين محصل في إنشاص فوراً', Pay_Note: 'نفس المرتب' }), 'receiving manager opens');
ok(R.type === 'PERMANENT' && R.step === 'FROM_MGR' && R.steps[0].opinion && R.steps[1].opinion && !R.steps[2].opinion, 'the current manager is asked first; the two managers\' steps are opinions');
fresh(); ok(notesOf(U.acc, /طلب نقل لموظف عندك/).length === 1, 'the current manager is told at once');
// handover list
ok(R.handover.length === 4 && R.canHandover, 'the default handover list, editable by the requester');
bad(api('trf.action', t.rec, { Transfer_ID: R.id, action: 'HANDOVER', index: 0, done: 'Y' }), null, 'others cannot tick the handover');
must(api('trf.action', t.acc, { Transfer_ID: R.id, action: 'HANDOVER', index: 0, done: 'Y' }), 'current manager ticks');
R = must(api('trf.action', t.trs, { Transfer_ID: R.id, action: 'HANDOVER', item: 'تسليم مفتاح الخزنة' }), 'item added');
ok(R.handover.length === 5 && R.handover[0].done && R.handover[0].by === 'مدير الحسابات', 'ticked with who and when; extra item added');
// the current manager objects — an opinion, the request goes on to HR
bad(api('trf.action', t.acc, { Transfer_ID: R.id, action: 'REJECT', note: '' }), /سبب اعتراضك/, 'an objection needs its reason');
R = must(api('trf.action', t.acc, { Transfer_ID: R.id, action: 'REJECT', note: 'محتاجه في الإقفال' }), 'objects');
ok(R.status === 'PENDING' && R.steps[0].status === 'OBJECTED' && R.steps[1].status === 'APPROVED' && /صاحب الطلب/.test(R.steps[1].note) && R.step === 'HR', 'objection recorded; the receiver\'s own step passes; HR decides');
fresh(); ok(notesOf(U.trs, /اعتراض/).length === 1, 'the requester hears of the objection');
R = must(api('trf.action', t.hr, { Transfer_ID: R.id, action: 'APPROVE', note: 'القرار للمصلحة' }), 'HR approves');
if (R.step === 'PAY') R = must(api('trf.action', t.sec, { Transfer_ID: R.id, action: 'APPROVE', note: 'نفس المرتب' }), 'HR sector (pay items) approves');
fresh(); const e1 = ctx.findOne_('EMPLOYEES', { Employee_ID: 'E1' });
ok(R.status === 'DONE' && e1.Position_ID === P['محصل'].Position_ID, 'HR decided over the objection: moved today');
ok(ctx.all_('NOTIFICATIONS').some(n => n.Link_Type === 'TRANSFER_REP' && n.Link_ID === R.id && n.User_ID === U.acc), 'the old manager is offered a replacement');
ok(ctx.all_('NOTIFICATIONS').some(n => n.Link_ID === R.id && /اتنفذ النقل/.test(n.Title) && /التسليم لسه ناقص/.test(n.Body)), 'the open handover items are named at the move');
let RP = must(api('emp.replacement', t.acc, { Transfer_ID: R.id }), 'replacement data');
ok(RP.Position_ID === P['محاسب تكاليف'].Position_ID && RP.Reason_Category === 'TRANSFER' && RP.Last_Working_Date === today, 'the replacement request is prefilled with the old place');
bad(api('emp.replacement', t.trs, { Transfer_ID: R.id }), /نطاق/, 'not for a manager outside that unit');

// =============== CHG-85: temporary transfer ===============
const occ2 = () => Number(ctx.get_('POSITIONS', P['أمين خزينة'].Position_ID).Occupied_HC || 0); fresh(); const occBefore = occ2();
bad(api('trf.submit', t.hr, { Employee_ID: 'E2', Transfer_Type: 'TEMPORARY', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: today, End_Date: plus(200), Reason: 'تغطية إجازة أمين الخزينة' }), /أقصى مدة/, 'a cover longer than TRF_TEMP_MAX_DAYS refused');
bad(api('trf.submit', t.hr, { Employee_ID: 'E2', Transfer_Type: 'TEMPORARY', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: today, End_Date: today, Reason: 'تغطية إجازة أمين الخزينة' }), /نهاية الانتداب/, 'end after the start');
let TP = must(api('trf.submit', t.hr, { Employee_ID: 'E2', Transfer_Type: 'TEMPORARY', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: today, End_Date: plus(30), Reason: 'تغطية إجازة أمين الخزينة' }), 'temporary to a full position (no room needed)');
ok(TP.type === 'TEMPORARY' && TP.endDate === plus(30) && !TP.vacancy, 'temporary with its end date, no vacancy');
if (TP.step === 'FROM_MGR') TP = must(api('trf.action', t.acc, { Transfer_ID: TP.id, action: 'APPROVE' }), 'from');
if (TP.step === 'TO_MGR') TP = must(api('trf.action', t.trs, { Transfer_ID: TP.id, action: 'APPROVE' }), 'to');
if (TP.status === 'PENDING') TP = must(api('trf.action', t.sec, { Transfer_ID: TP.id, action: 'APPROVE' }), 'decide');
fresh(); let e2 = ctx.findOne_('EMPLOYEES', { Employee_ID: 'E2' });
ok(TP.status === 'DONE' && TP.tempActive && e2.Position_ID === P['محاسب تكاليف'].Position_ID && e2.Temp_Position_ID === P['أمين خزينة'].Position_ID && e2.Temp_Until === plus(30), 'cover started: his own position kept, the cover recorded');
ok(occ2() === occBefore, 'headcount of the cover position unchanged');
ok(ctx.find_('EMPLOYEE_HISTORY', { Employee_ID: 'E2' }).some(h => h.Event === 'TEMP_ASSIGN' && h.Ref === TP.id), 'history: temporary assignment');
bad(api('trf.submit', t.hr, { Employee_ID: 'E2', To_Position_ID: P['محصل'].Position_ID, Effective_Date: today, Reason: 'نقل وهو منتدب', Pay_Note: 'x' }), /منتدب|مفتوح/, 'no new transfer while on a cover');
ok(must(api('trf.list', t.hr, { tab: 'open' }), 'open list').rows.some(x => x.id === TP.id && x.tempActive), 'a running cover stays in «open»');
fresh(); ctx.update_('TRANSFER_REQUESTS', TP.id, { End_Date: plus(5) }, 'x');
fresh(); let D = ctx.trfDaily_(); ok(D.tempReminded === 1 && D.tempEnded === 0, 'reminder a week before the end');
fresh(); ok(ctx.trfDaily_().tempReminded === 0, 'reminded once');
fresh(); ctx.update_('TRANSFER_REQUESTS', TP.id, { End_Date: plus(-1) }, 'x');
fresh(); D = ctx.trfDaily_(); fresh(); e2 = ctx.findOne_('EMPLOYEES', { Employee_ID: 'E2' });
ok(D.tempEnded === 1 && !e2.Temp_Transfer_ID && !e2.Temp_Position_ID && ctx.get_('TRANSFER_REQUESTS', TP.id).Temp_Ended_At, 'the cover ended by itself after its end date');
ok(ctx.find_('EMPLOYEE_HISTORY', { Employee_ID: 'E2' }).some(h => h.Event === 'TEMP_END'), 'history: back to his position');
// HR ends one early
let TP2 = must(api('trf.submit', t.hr, { Employee_ID: 'E5', Transfer_Type: 'TEMPORARY', To_Position_ID: P['أمين خزينة'].Position_ID, Effective_Date: today, End_Date: plus(20), Reason: 'تغطية مؤقتة في الخزينة' }), 'cover 2');
['acc', 'trs', 'sec'].forEach(k => { if (TP2.status === 'PENDING') { const r = api('trf.action', t[k], { Transfer_ID: TP2.id, action: 'APPROVE' }); if (r.ok) TP2 = r.data; } });
ok(TP2.tempActive, 'cover 2 running');
bad(api('trf.action', t.acc, { Transfer_ID: TP2.id, action: 'END_TEMP', note: 'رجع بدري' }), /البشرية/, 'only HR ends a cover early');
TP2 = must(api('trf.action', t.staff, { Transfer_ID: TP2.id, action: 'END_TEMP', note: 'الموظف الأصلي رجع بدري' }), 'HR ends it');
fresh(); ok(!TP2.tempActive && !ctx.findOne_('EMPLOYEES', { Employee_ID: 'E5' }).Temp_Transfer_ID, 'ended early, back on his position');

// =============== CHG-85: onboarding owners for IT / administration / safety ===============
const it = user('it@t.com', 'تكنولوجيا', '', null), adm = user('adm@t.com', 'إدارية', '', null), safe = user('safe@t.com', 'سلامة', '', null);
const tIT = login('it@t.com'), tADM = login('adm@t.com');
fresh(); ctx.update_('CONFIG', 'ONB_IT_USERS', { Config_Value: 'it@t.com' }, 'x'); ctx.update_('CONFIG', 'ONB_ADMIN_USERS', { Config_Value: 'adm@t.com' }, 'x'); ctx.update_('CONFIG', 'ONB_SAFETY_USERS', { Config_Value: safe }, 'x');
fresh();
const tplItems = tid => ctx.find_('ONB_TEMPLATE_ITEMS', { Template_ID: tid });
ok(['ONT-FACTORY', 'ONT-SHOWROOM', 'ONT-OFFICE'].every(tid => tplItems(tid).filter(i => i.Owner_Role === 'ADMIN').length === 1), 'every template has the administration item');
ok(tplItems('ONT-FACTORY').some(i => i.Owner_Role === 'SAFETY') && tplItems('ONT-OFFICE').some(i => i.Owner_Role === 'IT'), 'safety in factories, IT in offices');
const ob = ctx.onbCreate_(U.hr, { Employee_ID: 'E3', Full_Name: 'هاني فؤاد علي', Position_ID: P['أمين خزينة'].Position_ID, Location_ID: ctx.get_('POSITIONS', P['أمين خزينة'].Position_ID).Location_ID, Start_Date: today, Template_ID: 'ONT-FACTORY' });
fresh(); const obTasks = ctx.find_('ONB_TASKS', { Onboarding_ID: ob.Onboarding_ID });
ok(ob.IT_User_ID === it && ob.Admin_User_ID === adm && ob.Safety_User_ID === safe, 'the program names the IT, administration and safety people');
ok(obTasks.filter(x => x.Owner_Role === 'SAFETY').every(x => x.Owner_User_ID === safe) && obTasks.some(x => x.Owner_Role === 'ADMIN' && x.Owner_User_ID === adm), 'their tasks go to them');
ok(must(api('me', tIT, {}), 'me it').can.onbDept, 'the IT person gets the onboarding screen');
let OD = must(api('onb.get', tADM, { Onboarding_ID: ob.Onboarding_ID }), 'admin opens the program');
ok(OD.onb.owners.ADMIN.name === 'إدارية' && OD.onb.canCustody, 'owners shown; the custody log is open to him');
// nobody named → the HR site specialist
fresh(); ctx.update_('CONFIG', 'ONB_IT_USERS', { Config_Value: '' }, 'x');
const locE4 = ctx.get_('POSITIONS', P['أمين خزينة'].Position_ID).Location_ID; ctx.update_('LOCATIONS', locE4, { HR_Site_User_ID: U.staff }, 'x');
fresh(); const ob2 = ctx.onbCreate_(U.hr, { Employee_ID: 'E4', Full_Name: 'سامي نبيل رزق', Position_ID: P['أمين خزينة'].Position_ID, Location_ID: locE4, Start_Date: today, Template_ID: 'ONT-OFFICE' });
fresh(); ok(!ob2.IT_User_ID && ctx.find_('ONB_TASKS', { Onboarding_ID: ob2.Onboarding_ID }).filter(x => x.Owner_Role === 'IT').every(x => x.Owner_User_ID === U.staff), 'no IT person named → the HR site specialist');
fresh(); ctx.update_('CONFIG', 'ONB_IT_USERS', { Config_Value: 'it@t.com' }, 'x');
// the migration for templates made before v0.41
fresh(); const fItem = tplItems('ONT-FACTORY').find(i => i.Owner_Role === 'SAFETY'); ctx.update_('ONB_TEMPLATE_ITEMS', fItem.Item_ID, { Owner_Role: 'HR_SITE' }, 'x');
const aItem = tplItems('ONT-SHOWROOM').find(i => i.Owner_Role === 'ADMIN'); ctx.update_('ONB_TEMPLATE_ITEMS', aItem.Item_ID, { Title_AR: 'قديم', Status: 'Inactive', Owner_Role: 'HR_SITE' }, 'x');
delete props.MIG_0410; fresh(); ctx.migrate0410_(); fresh(); ctx.migrate0410_();
ok(ctx.get_('ONB_TEMPLATE_ITEMS', fItem.Item_ID).Owner_Role === 'SAFETY' && tplItems('ONT-SHOWROOM').filter(i => i.Owner_Role === 'ADMIN' && i.Status === 'Active').length === 1, 'migration: safety owner back, the admin item added once');

// =============== CHG-85: custody & PPE log ===============
bad(api('onb.custody', t.acc, { action: 'ISSUE', Onboarding_ID: ob.Onboarding_ID, Kind: 'PPE', Item: 'خوذة' }), /سجل العهدة/, 'unrelated users cannot record custody');
bad(api('onb.custody', tIT, { action: 'ISSUE', Onboarding_ID: ob.Onboarding_ID, Kind: 'X', Item: 'خوذة' }), /النوع/, 'kind checked');
bad(api('onb.custody', tIT, { action: 'ISSUE', Onboarding_ID: ob.Onboarding_ID, Kind: 'PPE', Item: 'خوذة', Qty: '0' }), /العدد/, 'quantity checked');
const c1 = must(api('onb.custody', tIT, { action: 'ISSUE', Onboarding_ID: ob.Onboarding_ID, Kind: 'CUSTODY', Item: 'لابتوب Dell', Serial: 'SN-123', Signed: 'Y' }), 'laptop issued').id;
const c2 = must(api('onb.custody', tADM, { action: 'ISSUE', Onboarding_ID: ob.Onboarding_ID, Kind: 'PPE', Item: 'حذاء سلامة', Qty: '2' }), 'PPE issued').id;
fresh(); ok(ctx.get_('ONB_CUSTODY', c1).Employee_ID === 'E3' && ctx.get_('ONB_CUSTODY', c1).Signed === 'Y', 'recorded on the employee, signed');
OD = must(api('onb.get', tIT, { Onboarding_ID: ob.Onboarding_ID }), 'program'); ok(OD.onb.custody.length === 2 && OD.onb.custody[0].status === 'ISSUED', 'shown on the program');
let EF = must(api('emp.get', t.hr, { Employee_ID: 'E3' }), 'employee file'); ok(EF.file.custody.length === 2, 'shown on the employee file');
must(api('onb.custody', tADM, { action: 'RETURN', Custody_ID: c2 }), 'returned');
bad(api('onb.custody', tADM, { action: 'LOST', Custody_ID: c2, note: 'x' }), /غير موجود|اتقفل/, 'a returned item is closed');
// at the end of service the open items are flagged
const exitR = ctx.empExit_(sys(U.hr), { Employee_ID: 'E3', Last_Working_Date: plus(10), reasonCode: 'RESIGNATION', note: 'استقالة' });
fresh(); ok(exitR.custodyOpen === 1 && notesOf(it, /عهدة لسه مع/).length === 1 && notesOf(U.hr, /عهدة لسه مع/).some(n => /لابتوب/.test(n.Body)), 'open custody named to HR and the departments at exit');
// items given before he had a code move onto his code when he joins
const ob3 = ctx.onbCreate_(U.hr, { joining: { Joining_ID: 'JN-T1', Person_ID: '' }, Full_Name: 'موظف جديد', Position_ID: P['أمين خزينة'].Position_ID, Location_ID: locE4, Start_Date: today, Template_ID: 'ONT-OFFICE' });
const c3 = must(api('onb.custody', tIT, { action: 'ISSUE', Onboarding_ID: ob3.Onboarding_ID, Kind: 'CUSTODY', Item: 'كارنيه' }), 'before joining').id;
fresh(); ok(!ctx.get_('ONB_CUSTODY', c3).Employee_ID, 'no code yet');
ctx.onbOnJoined_(sys(U.hr), { Joining_ID: 'JN-T1' }, null, today, 'E9');
fresh(); ok(ctx.get_('ONB_CUSTODY', c3).Employee_ID === 'E9', 'linked to his code at joining');

// =============== CHG-85: arriving today / tomorrow ===============
const VR = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محصل زيادة للاختبار', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', Exception_Justification: 'زيادة مؤقتة لضغط الشغل',
  lines: [{ Position_ID: P['محصل'].Position_ID, Requested_HC: 2 }] }), 'vacancy');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: VR.Request_ID })[0];
fresh(); ctx.insert_('PERSONS', { Person_ID: 'PER-T1', Full_Name: 'وليد سمير حسن', Mobile: '01077778888', Mobile_Norm: '01077778888', Status: 'Active' }, 'x');
ctx.insert_('JOININGS', { Joining_ID: 'JN-T2', Application_ID: 'APP-T2', Vacancy_ID: VAC.Vacancy_ID, Person_ID: 'PER-T1', Status: 'PENDING', Planned_Date: ctx.nextWorkDay_(), Date_Confirmed_At: ctx.nowIso_() }, 'x');
fresh(); const ob4 = ctx.onbCreate_(U.hr, { joining: { Joining_ID: 'JN-T2', Person_ID: 'PER-T1' }, Full_Name: 'وليد سمير حسن', Position_ID: VAC.Position_ID, Location_ID: VAC.Location_ID, Start_Date: ctx.nextWorkDay_(), Template_ID: 'ONT-OFFICE' });
let AR = must(api('onb.arrivals', tIT, {}), 'arrivals for IT');
const ar = AR.rows.find(r => r.joiningId === 'JN-T2');
ok(ar && !ar.today && ar.confirmed && ar.onb === ob4.Onboarding_ID && ar.open.some(x => x.mine && x.role === 'تكنولوجيا المعلومات'), 'tomorrow\'s joiner with what is still open — IT sees its own task');
ok(must(api('onb.arrivals', t.trs, {}), 'arrivals for the unit manager').rows.some(r => r.joiningId === 'JN-T2'), 'the unit manager sees his joiner');
ok(!must(api('onb.arrivals', t.acc, {}), 'arrivals for another manager').rows.some(r => r.joiningId === 'JN-T2'), 'another unit\'s manager does not');

// =============== CHG-86: similar-name duplicates ===============
must(api('vac.assign', tO, { Vacancy_ID: VAC.Vacancy_ID, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', tO, { Vacancy_ID: VAC.Vacancy_ID, action: 'OPEN' }), 'open');
const C1 = must(api('cand.create', t.rec, { Vacancy_ID: VAC.Vacancy_ID, Full_Name: 'محمد عبد الله السيد', Mobile: '01011110001', Source: 'WALK_IN', consent: 'Y' }), 'first').application;
const NC = must(api('cand.create', t.rec, { Vacancy_ID: VAC.Vacancy_ID, Full_Name: 'محمد عبدالله السيد', Mobile: '01011110002', Source: 'WALK_IN', consent: 'Y' }), 'second, spelled differently');
ok(NC.needConfirm && NC.matches.some(m => m.Person_ID === C1.Person_ID && m.on.indexOf('NAME') >= 0), 'a similar name is offered as a possible duplicate before saving');
ok(NC.matches[0].Mobile === '01011110001', 'his own candidate: the details show');
const NCo = must(api('cand.create', t.hr, { Vacancy_ID: VAC.Vacancy_ID, Full_Name: 'محمد عبدالله السيد', Mobile: '01011110003', Source: 'WALK_IN', consent: 'Y' }), 'HR (all candidates)');
fresh(); ctx.insert_('PERSONS', { Person_ID: 'PER-HID', Full_Name: 'سامح فؤاد عبد الرحيم', Mobile: '01099990000', Mobile_Norm: '01099990000', Email: 'hidden@mail.test', Status: 'Active' }, 'x');
const NH = must(api('cand.create', t.rec, { Vacancy_ID: VAC.Vacancy_ID, Full_Name: 'سامح فؤاد عبدالرحيم', Mobile: '01011110004', Source: 'WALK_IN', consent: 'Y' }), 'similar to someone he cannot see');
const hm = NH.matches.find(m => m.Person_ID === 'PER-HID');
ok(hm && hm.masked && hm.Mobile === '•••••••000' && !hm.Email, 'a name-only match on someone he has no access to: mobile and e-mail masked');
const C2 = must(api('cand.create', t.rec, { Vacancy_ID: VAC.Vacancy_ID, Full_Name: 'محمد عبدالله السيد', Mobile: '01011110002', Source: 'WALK_IN', consent: 'Y', confirmNew: 'Y' }), 'confirmed: a different person').application;
fresh(); const p2 = ctx.get_('PERSONS', C2.Person_ID);
ok(p2.Dup_Candidates.indexOf(C1.Person_ID) >= 0, 'the possible duplicate stays recorded on him');
const dm = ctx.dupMatches_({ Full_Name: 'محمد عبدالله السيد' }, '');
ok(dm.some(m => m.Person_ID === C1.Person_ID && m.on.indexOf('NAME') >= 0), 'matched on the name');
ok(!ctx.dupMatches_({ Full_Name: 'محمد عبد الله محمود' }, '').some(m => m.Person_ID === C1.Person_ID) && !ctx.dupMatches_({ Full_Name: 'محمد السيد' }, '').length, 'a different third name or a two-word name is not a match');
ok(ctx.nameSimilar_('مصطفى كمال سعيد', 'مصطفي كمال سعيد') && ctx.nameSimilar_('أحمد محمود عبد الرحمن', 'احمد محمود عبدالرحمن') && !ctx.nameSimilar_('كريم عادل منصور', 'كريم عادل محمود'), 'one letter off or joined «عبد» matches; another name does not');

// =============== CHG-86: frozen vacancy ===============
bad(api('vac.update', t.rec, { Vacancy_ID: VAC.Vacancy_ID, action: 'FREEZE', reason: 'تجميد التعيينات' }), null, 'a recruiter cannot freeze');
bad(api('vac.update', t.hr, { Vacancy_ID: VAC.Vacancy_ID, action: 'FREEZE', reason: '' }), /سبب/, 'freeze needs the decision');
must(api('vac.update', t.hr, { Vacancy_ID: VAC.Vacancy_ID, action: 'FREEZE', reason: 'قرار تجميد التعيينات للربع الأخير' }), 'frozen');
fresh(); let VF = ctx.get_('VACANCIES', VAC.Vacancy_ID);
ok(VF.Status === 'FROZEN' && VF.Frozen_From === 'OPEN' && VF.Frozen_By === U.hr, 'frozen with the status it came from');
bad(api('cand.create', t.rec, { Vacancy_ID: VAC.Vacancy_ID, Full_Name: 'مرشح أثناء التجميد', Mobile: '01011110009', Source: 'WALK_IN', consent: 'Y' }), /مش شغال/, 'no new candidates on a frozen vacancy');
bad(api('vac.fill', t.hr, { Vacancy_ID: VAC.Vacancy_ID, Method: 'EXTERNAL', Employee_Name: 'علي حسن', Employee_ID: 'E-77', Effective_Date: today }), /مجمّد/, 'no fill on a frozen vacancy');
ok(ctx.APPLY_STATUSES_.indexOf('FROZEN') < 0 && ctx.VAC_OPEN_.indexOf('FROZEN') >= 0, 'apply page closed; the headcount stays reserved');
must(api('vac.update', t.hr, { Vacancy_ID: VAC.Vacancy_ID, action: 'UNFREEZE' }), 'unfrozen');
fresh(); ok(ctx.get_('VACANCIES', VAC.Vacancy_ID).Status === 'OPEN', 'back to where it was');

// =============== CHG-86: leaving within 30 / 180 / 365 days ===============
fresh();
[['A1', 40, 20], ['A2', 40, ''], ['A3', 10, ''], ['A4', 200, 150], ['A5', 200, '']].forEach(([k, ago, leftAfter]) => {
  const jd = plus(-ago);
  ctx.insert_('APPLICATIONS', { Application_ID: 'APP-K' + k, Person_ID: 'PER-K' + k, Vacancy_ID: VAC.Vacancy_ID, Stage: 'JOINED', Applied_At: plus(-ago - 30) + 'T09:00:00' }, 'x');
  ctx.insert_('JOININGS', { Joining_ID: 'JN-K' + k, Application_ID: 'APP-K' + k, Vacancy_ID: VAC.Vacancy_ID, Person_ID: 'PER-K' + k, Status: 'JOINED', Joined_Date: jd, Employee_ID: 'EK' + k }, 'x');
  ctx.insert_('EMPLOYEES', { Employee_ID: 'EK' + k, Full_Name: 'موظف ' + k, Position_ID: VAC.Position_ID, Status: leftAfter !== '' ? 'Exited' : 'Active', Exit_Date: leftAfter !== '' ? ctx.addDaysYmd_(jd, leftAfter) : '' }, 'x');
});
fresh(); const K = ctx.kpiSet_(ctx.kpiData_(), ctx.kpiPeriod_({ period: 'year' }), ctx.kpiTargets_(), ctx.kpiAll_, '');
ok(K.LEAVE_30.n === 4 && K.LEAVE_30.value === 25, 'within 30 days: of the 4 who reached day 30 (not the one 10 days in), one left → 25 % (' + K.LEAVE_30.n + ', ' + K.LEAVE_30.value + ')');
ok(K.LEAVE_180.n === 2 && K.LEAVE_180.value === 50 && K.LEAVE_180.cases.length === 1, 'within 180 days: 2 reached it, one left on day 150 → 50 %');
ok(K.LEAVE_365.n === 0 && K.LEAVE_365.value === null, 'within a year: nobody reached it yet — no number');
ok(ctx.KPI_GROUPS_[1][2].indexOf('LEAVE_30') >= 0 && ctx.KPI_GROUPS_[1][2].indexOf('LEAVE_365') >= 0, 'shown in the quality group');

// =============== CHG-86: new-hire survey axes ===============
fresh();
const nhvRow = (i, a) => ctx.insert_('NHV_SURVEYS', { Survey_ID: 'NHV-T' + i, Joining_ID: 'JN-N' + i, Full_Name: 'م' + i, Round_Day: '7', Due_Date: today, Status: 'ANSWERED', Answers_JSON: JSON.stringify(a), Answered_At: ctx.nowIso_(), Min_Score: '3', Avg_Score: '4' }, 'x');
for (let i = 1; i <= 4; i++) nhvRow(i, { Q1: 4, Q2: 3, Q3: 5, Q4: 4, Q5: 4 });
let NV = must(api('nhv.list', t.hr, { tab: 'answered' }), 'survey with 4 answers');
ok(NV.stats['7'].hidden && !Object.keys(NV.stats['7'].ax).length && NV.axes.JOB, 'below 5 answers the axes stay hidden too');
nhvRow(5, { Q1: 4, Q2: 3, Q3: 5, Q4: 4, Q5: 4 });
NV = must(api('nhv.list', t.hr, { tab: 'answered' }), 'survey with 5 answers');
const ax = NV.stats['7'].ax;
ok(ax.JOB.avg === 4 && ax.WELCOME.avg === 3 && ax.MANAGER.avg === 5 && ax.STAY.n === 5, 'averages by axis');
ok(NV.questions.every(q => q.axis), 'every question has its axis');
fresh(); ctx.update_('CONFIG', 'NHV_QUESTIONS', { Config_Value: JSON.stringify([{ id: 'Q1', ar: 'سؤال' }, { id: 'X9', ar: 'سؤال جديد' }]) }, 'x');
fresh(); const qs = ctx.nhvQuestions_(); ok(qs[0].axis === 'JOB' && qs[1].axis === 'OTHER', 'custom questions: the default axis by id, else «other»');
fresh(); ctx.update_('CONFIG', 'NHV_QUESTIONS', { Config_Value: '' }, 'x');

// =============== CHG-86: «improve the wording» of a note with AI ===============
const KEY = 'sk-ant-api03-' + 'k'.repeat(40);
bad(api('cvai.improve', t.rec, { Application_ID: C1.Application_ID, text: 'المرشح كويس في الاكسل وعايز مرتب عالي شوية' }), /مقفول|صلاحية/, 'off until the AI is switched on');
must(api('cvai.setKey', tO, { key: KEY, reason: 'مفتاح الشركة' }), 'key'); fresh(); ctx.update_('CONFIG', 'CVAI_ENABLED', { Config_Value: 'Y' }, 'x');
const calls = []; ctx.__fetch = (url, o) => { calls.push(JSON.parse(o.payload)); return { code: 200, body: { content: [{ type: 'text', text: 'المرشح متمكن من Excel، ومرتبه المتوقع أعلى من المعروض.' }], usage: { input_tokens: 300, output_tokens: 60 }, stop_reason: 'end_turn' } }; };
bad(api('cvai.improve', t.rec, { Application_ID: C1.Application_ID, text: 'قصير' }), /10 حروف/, 'a note to improve first');
let IM = must(api('cvai.improve', t.rec, { Application_ID: C1.Application_ID, text: 'المرشح كويس في الاكسل وعايز مرتب عالي شوية، متجوز وعنده عيلين' }), 'improved');
ok(IM.text === 'المرشح متمكن من Excel، ومرتبه المتوقع أعلى من المعروض.' && calls.length === 1, 'the suggestion comes back');
ok(/never add facts/.test(calls[0].system) && /marital status/.test(calls[0].system) && /<note>/.test(calls[0].messages[0].content), 'facts only; personal traits removed');
fresh(); const run = ctx.all_('CV_AI_RUNS').filter(r => r.CV_File_ID === 'NOTE').pop();
ok(run && run.Status === 'OK' && run.Result_JSON === '' && run.Person_ID === C1.Person_ID && Number(run.Cost_USD) > 0, 'logged with its cost — the text itself is not kept');
ok(!ctx.find_('ACTIVITIES', { Application_ID: C1.Application_ID }).some(a => /Excel/.test(a.Note)), 'nothing is saved on the candidate until the recruiter saves it');
fresh(); ctx.update_('PERSONS', C1.Person_ID, { Ai_Opt_Out: 'Y' }, 'x');
bad(api('cvai.improve', t.rec, { Application_ID: C1.Application_ID, text: 'المرشح كويس في الاكسل وعايز مرتب عالي' }), /سحب موافقته/, 'not for a candidate who withdrew AI consent');

// =============== the editor-only check can read who runs it ===============
const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'appsscript.json'), 'utf8'));
ok(man.oauthScopes.indexOf('https://www.googleapis.com/auth/userinfo.email') >= 0, 'the e-mail scope is in the manifest (Session.getActiveUser is empty without it)');
ctx.Session.__active = 'owner@test.com'; let thrown = null; try { ctx.requireEditor_(); } catch (e) { thrown = e; } ok(!thrown, 'the owner in the editor passes');
ctx.Session.__active = ''; thrown = null; try { ctx.requireEditor_(); } catch (e) { thrown = e; } ok(!!thrown, 'a browser visitor (no e-mail) is refused');
ctx.Session.__active = 'owner@test.com';

console.log('\nphase41: ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
