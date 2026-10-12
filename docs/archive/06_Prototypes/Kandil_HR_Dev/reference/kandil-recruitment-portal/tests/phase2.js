// Phase 2 scenario: requests → approval chain → vacancies; PCR; notifications.
const { ctx, store, props, mails, fresh, vm } = require('./mocks');
const EVJ = [{ name: 'whatsapp.jpg', mime: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=' }];   // v0.36: proof of a board decision
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
const must = (r, m) => { if (!r.ok) { console.log('ERROR in ' + m + ': ' + r.error); } ok(r.ok, m); return r.data; };
const T = '\t';

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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'إنشاص', '', '', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '']
].map(r => r.join(T)).join('\n');
must(api('import.commit', tOwner, { text: rows, reason: 'init' }), 'import');
fresh();
const P = {}; ctx.all_('POSITIONS').forEach(p => { const t = ctx.get_('JOBS', p.Job_Code).Job_Title_AR; (P[t] = P[t] || []).push(p); });
const locName = id => ctx.get_('LOCATIONS', id).Name_AR;
const accObour = P['محاسب تكاليف'].find(p => locName(p.Location_ID) === 'العبور');
const accInshas = P['محاسب تكاليف'].find(p => locName(p.Location_ID) === 'إنشاص');
fresh(); ctx.insert_('GRADES', { Grade_Code: 'G07', Grade_Name: 'Grade 7', Level_Order: '7', Status: 'Active' }, 'SYSTEM');

function user(email, name, pos, roles) {
  const u = must(api('users.save', tOwner, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + email);
  if (roles) must(api('users.setRoles', tOwner, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles ' + email);
  return u.User_ID;
}
const U = {
  cfo: user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي'][0].Position_ID),
  acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'][0].Position_ID),
  cost: user('cost@t.com', 'رئيس التكاليف', P['رئيس قسم التكاليف'][0].Position_ID),
  hr: user('hr@t.com', 'مدير الموارد', '', ['HR_MANAGER']),
  ceo: user('ceo@t.com', 'الرئيس التنفيذي', P['الرئيس التنفيذي'][0].Position_ID, ['CEO']),
  rec: user('rec@t.com', 'أخصائي توظيف', '', ['RECRUITER']),
  recMgr: user('recmgr@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']),
  nobody: user('x@t.com', 'موظف', '')
};
const t = {}; Object.keys(U).forEach(k => { t[k] = login(k === 'recMgr' ? 'recmgr@t.com' : k === 'nobody' ? 'x@t.com' : k + '@t.com'); });

// ---- scope & positions
let r = must(api('req.positions', t.cost, {}), 'cost positions');
ok(r.canRequest && r.rows.length === 3, 'section head sees his section positions: ' + r.rows.length);
ok(r.rows.find(x => x.Position_ID === accObour.Position_ID).available === 2, 'available HC 2');
r = api('req.positions', t.nobody, {});
ok(r.ok && !r.data.canRequest && r.data.rows.length === 0, 'plain user cannot request');
r = api('req.save', t.nobody, { lines: [] });
ok(!r.ok, 'plain user save blocked');
r = api('req.save', t.cost, { lines: [{ Position_ID: P['محاسب عام'][0].Position_ID, Requested_HC: 1 }] });
ok(!r.ok && /نطاق/.test(r.error), 'out of scope blocked');
r = api('me', t.cost);
ok(r.ok && r.data.todo.canRequest && r.data.idleMinutes === 30, 'me has todo + idle');

// ---- draft + submit
const draft = {
  Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED',
  Reason_Category: 'WORKLOAD', Justification: 'ضغط شغل في إقفال الشهر', Requested_Priority: 'IMPORTANT',
  Required_By_Date: '2099-01-01', Education: 'بكالوريوس تجارة', Experience_Years: '2',
  lines: [{ Position_ID: accObour.Position_ID, Requested_HC: 2 }, { Position_ID: accInshas.Position_ID, Requested_HC: 3 }],
  skills: [{ Skill: 'Excel', Proficiency: 'ADVANCED', Importance: 'ESSENTIAL' }]
};
r = must(api('req.save', t.cost, draft), 'save draft');
const reqId = r.Request_ID;
ok(/^REQ-\d{4}-0001$/.test(reqId) && r.Status === 'DRAFT', 'draft id ' + reqId);
r = api('req.submit', t.cost, Object.assign({ Request_ID: reqId }, draft));
ok(!r.ok && /مبرر الاستثناء/.test(r.error), 'exception justification required: ' + r.error);
draft.Exception_Justification = 'فرع إنشاص عليه ضغط موسم';
r = must(api('req.submit', t.cost, Object.assign({ Request_ID: reqId }, draft)), 'submit');
ok(r.Status === 'IN_APPROVAL' && r.exception, 'in approval with exception');
fresh();
ok(ctx.all_('REQUEST_SKILLS').filter(s => s.Status === 'Active').length === 1 && ctx.all_('REQUEST_SKILLS').length > 1, 'children soft-replaced');
r = must(api('req.get', t.cost, { Request_ID: reqId }), 'get');
ok(r.chain.map(s => s.Step_Type).join() === 'LINE,LINE,HR,HC_EXC', 'chain LINE,LINE,HR,HC_EXC: ' + r.chain.map(s => s.Step_Type));
ok(r.chain[0].Status === 'PENDING' && r.chain[0].people[0] === 'مدير الحسابات', 'dept manager pending');
ok(!r.can.act && !r.can.edit && r.can.cancel, 'requester flags');
ok(r.lines.find(l => l.Position_ID === accInshas.Position_ID).Available_HC_At_Submit === '1', 'HC snapshot');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.acc), 'approver notified');
ok(mails.some(m => m.to === 'acc@t.com'), 'approver emailed');

r = api('req.action', t.cost, { Request_ID: reqId, action: 'APPROVE' });
ok(!r.ok, 'requester cannot approve');
r = api('req.action', t.cfo, { Request_ID: reqId, action: 'APPROVE' });
ok(!r.ok, 'next approver cannot jump the queue');
r = must(api('todo', t.acc), 'todo acc');
ok(r.approvals === 1, 'todo approvals 1');
r = must(api('req.list', t.acc, { box: 'toApprove' }), 'toApprove list');
ok(r.length === 1 && r[0].Request_ID === reqId && r[0].requestedHC === 5, 'toApprove row');
must(api('req.action', t.acc, { Request_ID: reqId, action: 'APPROVE', comment: 'موافق' }), 'acc approves');
r = api('req.action', t.cfo, { Request_ID: reqId, action: 'RETURN', comment: '' });
ok(!r.ok, 'return needs comment');
must(api('req.action', t.cfo, { Request_ID: reqId, action: 'RETURN', reasonCode: 'ADJUST_HC', comment: 'قلل إنشاص لواحد' }), 'cfo returns');
r = must(api('req.get', t.cost, { Request_ID: reqId }), 'get returned');
ok(r.request.Status === 'RETURNED' && r.can.edit, 'returned & editable');
ok(r.chain[2].Status === 'CANCELLED', 'open steps cancelled');
ok(r.events.some(e => e.Event === 'RETURNED' && /مراجعة العدد/.test(e.Comment)), 'return reason label in timeline');
r = must(api('todo', t.cost), 'todo cost');
ok(r.returned === 1, 'todo returned');

// ---- resubmit v2 → full approval with HR edits
draft.lines[1].Requested_HC = 1;
r = must(api('req.submit', t.cost, Object.assign({ Request_ID: reqId }, draft)), 'resubmit');
ok(!r.exception, 'no exception now');
must(api('req.action', t.acc, { Request_ID: reqId, action: 'APPROVE' }), 'acc v2');
must(api('req.action', t.cfo, { Request_ID: reqId, action: 'APPROVE' }), 'cfo v2');
r = must(api('req.get', t.hr, { Request_ID: reqId }), 'hr get');
ok(r.request.Status === 'HR_REVIEW' && r.can.hrStep && r.can.sendCeo, 'HR review flags');
ok(r.request.Version === '2' && r.versions.length === 2, 'versions');
r = api('req.action', t.hr, { Request_ID: reqId, action: 'APPROVE', hr: {} });
ok(!r.ok && /تصنيف/.test(r.error), 'classification required');
const lines = must(api('req.get', t.hr, { Request_ID: reqId }), 'lines').lines;
const lObour = lines.find(l => l.Position_ID === accObour.Position_ID);
r = api('req.action', t.hr, { Request_ID: reqId, action: 'APPROVE', hr: { HR_Classification: 'CRITICAL',
  Required_By_Date: '2099-02-01', lines: [{ Line_ID: lObour.Line_ID, Approved_HC: '1' }] } });
ok(!r.ok && /سبب التعديل/.test(r.error), 'v0.34: HR edits need a reason');
r = must(api('req.action', t.hr, { Request_ID: reqId, action: 'APPROVE', hr: { HR_Classification: 'CRITICAL', HR_Notes: 'الميزانية بتسمح بواحد بس',
  Required_By_Date: '2099-02-01', lines: [{ Line_ID: lObour.Line_ID, Approved_HC: '1' }] } }), 'hr approves');
fresh(); ok(ctx.all_('PRIORITY_HISTORY').some(h => h.Entity_Type === 'REQUEST' && h.Entity_ID === reqId && h.New_Value === 'CRITICAL'), 'v0.34: classification change in the priority history');
ok(r.Status === 'APPROVED' && r.vacancies.length === 2, 'approved + 2 vacancies');
r = must(api('req.get', t.cost, { Request_ID: reqId }), 'final get');
ok(r.events.some(e => e.Event === 'HR_EDITED'), 'HR edit in timeline');
ok(r.request.Required_By_Date === '2099-02-01' && r.request.HR_Classification === 'CRITICAL', 'HR edits applied');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.cost && /اتعتمد/.test(n.Title)), 'requester told approved');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.recMgr && /توزيع/.test(n.Title)), 'rec manager told');
r = must(api('req.positions', t.cost, {}), 'positions after');
ok(r.rows.find(x => x.Position_ID === accObour.Position_ID).open === 1 &&
   r.rows.find(x => x.Position_ID === accObour.Position_ID).available === 1, 'open HC counted');

// ---- vacancies
r = must(api('vac.list', t.rec, {}), 'rec list');
ok(r.rows.length === 0, 'recruiter sees none before assignment');
r = must(api('vac.list', t.recMgr, {}), 'recMgr list');
ok(r.rows.length === 2 && r.canManage && !r.canPrioritize, 'recMgr sees 2');
const vac = r.rows[0];
ok(vac.score > 0 && vac.scoreParts.some(p => /حرج/.test(p.k)), 'score explained');
r = api('vac.update', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, action: 'OPEN' });
ok(!r.ok && /مسؤول/.test(r.error), 'open needs lead');
r = must(api('vac.recruiters', t.recMgr), 'recruiters');
ok(r.some(x => x.id === U.rec), 'recruiter available');
must(api('vac.assign', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, Lead_Recruiter_ID: U.rec }), 'assign');
r = api('vac.assign', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, Lead_Recruiter_ID: U.recMgr });
ok(!r.ok && /سبب/.test(r.error), 'reassign needs reason');
must(api('vac.assign', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, Lead_Recruiter_ID: U.rec, recruiters: [U.recMgr], reason: 'دعم' }), 'add support');
fresh(); ok(ctx.all_('VACANCY_RECRUITERS').filter(x => x.Active === 'Y').length === 2, 'team of 2');
r = must(api('vac.list', t.rec, {}), 'rec list 2');
ok(r.rows.length === 1 && r.rows[0].leadName === 'أخصائي توظيف', 'recruiter sees assigned');
r = must(api('todo', t.rec), 'todo rec');
ok(r.myVacancies === 1, 'todo my vacancies');
must(api('vac.update', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, action: 'OPEN' }), 'open');
r = api('vac.update', t.rec, { Vacancy_ID: vac.Vacancy_ID, action: 'HOLD', reason: 'x y z' });
ok(!r.ok, 'recruiter cannot hold');
r = api('vac.priority', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, Pin_Until: '2099-01-01', reason: 'مهم' });
ok(!r.ok, 'recMgr cannot pin');
must(api('vac.priority', t.hr, { Vacancy_ID: vac.Vacancy_ID, Pin_Until: '2099-01-01', HR_Classification: 'NORMAL', reason: 'طلب الإدارة' }), 'pin');
r = must(api('vac.get', t.hr, { Vacancy_ID: vac.Vacancy_ID }), 'vac get');
ok(r.vacancy.priorityHistory.length === 2 && r.vacancy.scoreParts.some(p => /مثبتة/.test(p.k)), 'priority history + pin');
must(api('vac.update', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, action: 'HOLD', reason: 'تجميد مؤقت' }), 'hold');
must(api('vac.update', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, action: 'RESUME' }), 'resume');
fresh(); ok(ctx.get_('VACANCIES', vac.Vacancy_ID).Status === 'OPEN', 'resumed to OPEN');
r = api('vac.update', t.recMgr, { Vacancy_ID: vac.Vacancy_ID, action: 'CANCEL', reason: 'x y z' });
ok(!r.ok, 'recMgr cannot cancel');
r = must(api('vac.list', t.cost, {}), 'manager vacancy view');
ok(r.rows.length === 2 && !r.canManage, 'manager sees own unit vacancies read-only');

// ---- filling vacancies (external + internal transfer + void)
{
  const vl = must(api('vac.list', t.recMgr, {}), 'list for fill').rows;
  const vObour = vl.find(x => x.Position_ID === accObour.Position_ID), vInshas = vl.find(x => x.Position_ID === accInshas.Position_ID);
  let rr = api('vac.fill', t.rec, { Vacancy_ID: vObour.Vacancy_ID, Method: 'EXTERNAL', Employee_Name: 'علي حسن', Effective_Date: '2026-10-01' });
  ok(!rr.ok, 'recruiter cannot record fill');
  rr = api('vac.fill', t.recMgr, { Vacancy_ID: vObour.Vacancy_ID, Method: 'EXTERNAL', Employee_Name: 'علي حسن' });
  ok(!rr.ok && /تاريخ/.test(rr.error), 'fill date required');
  rr = must(api('vac.fill', t.recMgr, { Vacancy_ID: vObour.Vacancy_ID, Method: 'EXTERNAL', Employee_Name: 'علي حسن', Employee_ID: 'E-100', Effective_Date: '2026-10-01' }), 'external fill');
  ok(rr.vacancy.Status === 'FILLED' && rr.vacancy.Joined_HC === '1', 'vacancy filled');
  fresh(); ok(ctx.get_('POSITIONS', accObour.Position_ID).Occupied_HC === '1', 'target occupied +1');
  rr = api('vac.fill', t.recMgr, { Vacancy_ID: vObour.Vacancy_ID, Method: 'EXTERNAL', Employee_Name: 'تاني', Effective_Date: '2026-10-01' });
  ok(!rr.ok, 'cannot overfill');
  const gen = P['محاسب عام'][0].Position_ID;
  must(api('positions.update', tOwner, { Position_ID: gen, Occupied_HC: '1', reason: 'بيانات فعلية' }), 'set source occupied');
  rr = api('vac.fill', t.recMgr, { Vacancy_ID: vInshas.Vacancy_ID, Method: 'INTERNAL_TRANSFER', Employee_Name: 'منى سعيد', Effective_Date: '2026-10-05' });
  ok(!rr.ok && /الوظيفة الحالية/.test(rr.error), 'internal needs source position');
  rr = must(api('vac.fill', t.recMgr, { Vacancy_ID: vInshas.Vacancy_ID, Method: 'INTERNAL_TRANSFER', Employee_Name: 'منى سعيد', Employee_ID: 'E-55',
    Source_Position_ID: gen, Effective_Date: '2026-10-05' }), 'internal fill');
  fresh();
  ok(ctx.get_('POSITIONS', gen).Occupied_HC === '0' && ctx.get_('POSITIONS', accInshas.Position_ID).Occupied_HC === '1', 'occupied moved source→target');
  const g = must(api('vac.get', t.hr, { Vacancy_ID: vInshas.Vacancy_ID }), 'vac get fills');
  ok(g.vacancy.fills.length === 1 && /محاسب عام/.test(g.vacancy.fills[0].sourceTitle), 'fill listed with source');
  rr = api('vac.fillVoid', t.recMgr, { Fill_ID: g.vacancy.fills[0].Fill_ID, reason: 'غلط' });
  ok(!rr.ok, 'recMgr cannot void');
  must(api('vac.fillVoid', t.hr, { Fill_ID: g.vacancy.fills[0].Fill_ID, reason: 'الموظف ما استلمش' }), 'void');
  fresh();
  ok(ctx.get_('POSITIONS', gen).Occupied_HC === '1' && ctx.get_('POSITIONS', accInshas.Position_ID).Occupied_HC === '0', 'void reverses occupied');
  ok(ctx.get_('VACANCIES', vInshas.Vacancy_ID).Status === 'OPEN' && ctx.get_('VACANCIES', vInshas.Vacancy_ID).Joined_HC === '0', 'void reverses vacancy');
  ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.cost && /اكتمل شاغر/.test(n.Title)), 'requester told filled');
  const ph = must(api('positions.history', tOwner, { Position_ID: gen }), 'history');
  ok(ph.filter(h => h.Field === 'Occupied_HC').length === 3, 'position history for occupied moves');
  must(api('positions.update', tOwner, { Position_ID: gen, Occupied_HC: '0', reason: 'إرجاع للاختبار' }), 'reset source');
}

// ---- SEND_CEO path (acc heads the dept → chain CFO, HR)
const d2 = Object.assign({}, draft, { lines: [{ Position_ID: P['محاسب عام'][0].Position_ID, Requested_HC: 1 }], Exception_Justification: '' });
r = must(api('req.submit', t.acc, d2), 'acc submits');
const req2 = r.Request_ID;
r = must(api('req.get', t.acc, { Request_ID: req2 }), 'get2');
ok(r.chain.map(s => s.Label.split(' — ')[0]).join('|') === 'مدير القطاع|مراجعة واعتماد الموارد البشرية', 'chain starts above requester: ' + r.chain.map(s => s.Label));
must(api('req.action', t.cfo, { Request_ID: req2, action: 'APPROVE' }), 'cfo2');
must(api('req.action', t.hr, { Request_ID: req2, action: 'SEND_CEO', comment: 'استثنائي', hr: { HR_Classification: 'NORMAL' } }), 'send ceo');
r = must(api('req.get', t.ceo, { Request_ID: req2 }), 'ceo get');
ok(r.request.Status === 'PENDING_CEO' && r.can.act && !r.can.hrStep, 'CEO pending');
r = must(api('req.action', t.ceo, { Request_ID: req2, action: 'APPROVE' }), 'ceo approves');
ok(r.Status === 'APPROVED', 'approved by CEO');

// ---- sector head position → CEO required; target head step skipped; replacement needs data
const d3 = { Recruitment_Type: 'REPLACEMENT', Employment_Type: 'FULL_TIME', Reason_Category: 'RESIGNATION', Justification: 'استقالة المدير المالي الحالي',
  Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['مدير القطاع المالي'][0].Position_ID, Requested_HC: 1 }] };
r = api('req.submit', t.owner || tOwner, d3);
ok(!r.ok && /استبداله/.test(r.error), 'replacement data required');
const req3 = r.ok ? null : ctx.all_('RECRUITMENT_REQUESTS').slice(-1)[0].Request_ID;
d3.replacements = [{ Employee_Name: 'فلان', Employee_ID: '123', Last_Working_Date: '2026-12-31', Reason: 'استقالة' }];
d3.Exception_Justification = 'بديل';
r = must(api('req.submit', tOwner, Object.assign({ Request_ID: req3 }, d3)), 'owner submits replacement');
r = must(api('req.get', tOwner, { Request_ID: req3 }), 'get3');
ok(r.chain.map(s => s.Step_Type + ':' + s.Status).join() === 'LINE:SKIPPED,HR:APPROVED,CEO:PENDING,BOARD:WAITING', 'sector-head chain (HR sector manager approves with submit): ' + r.chain.map(s => s.Step_Type + ':' + s.Status));
ok(r.chain[0].Skip_Reason.length > 0 && /مع التقديم/.test(r.chain[1].Comment), 'skip reason + HR approved with submit');
must(api('req.action', t.ceo, { Request_ID: req3, action: 'REJECT', reasonCode: 'NO_BUDGET' }), 'reject');
r = must(api('req.get', tOwner, { Request_ID: req3 }), 'get rejected');
ok(r.request.Status === 'REJECTED' && !r.can.cancel && !r.can.edit, 'rejected final');

// ---- board approval: rule by job (temporary), send-to-board by HR sector, on-behalf decision
{
  const genJob = P['محاسب عام'][0].Job_Code;
  let rr = api('rules.save', t.hr, { Rule_Type: 'BOARD_REQUIRED', Scope_Type: 'JOB', Scope_Value: genJob, Notes: 'x y z' });
  ok(!rr.ok, 'HR manager cannot add rules');
  rr = must(api('rules.save', tOwner, { Rule_Type: 'BOARD_REQUIRED', Scope_Type: 'JOB', Scope_Value: genJob, Effective_To: '2099-12-31', Notes: 'طلب المجلس مؤقتاً' }), 'add temp board rule');
  const ruleId = rr.Rule_ID;
  const dB = Object.assign({}, d2, { Justification: 'احتياج محاسب عام إضافي للإقفال', Exception_Justification: 'زيادة ضغط الإقفال السنوي' });
  rr = must(api('req.submit', t.acc, dB), 'submit board-rule request');
  const rb = rr.Request_ID;
  let g = must(api('req.get', t.acc, { Request_ID: rb }), 'get board chain');
  ok(g.chain.map(s => s.Step_Type).join() === 'LINE,HR,HC_EXC,CEO,BOARD', 'job rule adds CEO + BOARD (and the HC exception step): ' + g.chain.map(s => s.Step_Type));
  must(api('req.action', t.cfo, { Request_ID: rb, action: 'APPROVE' }), 'cfo');
  must(api('req.action', t.hr, { Request_ID: rb, action: 'APPROVE', hr: { HR_Classification: 'NORMAL' } }), 'hr');
  must(api('req.action', tOwner, { Request_ID: rb, action: 'APPROVE' }), 'HC exception (HR sector manager)');
  must(api('req.action', t.ceo, { Request_ID: rb, action: 'APPROVE' }), 'ceo');
  g = must(api('req.get', tOwner, { Request_ID: rb }), 'owner sees board pending');
  ok(g.request.Status === 'PENDING_BOARD' && g.can.boardOnBehalf && !g.can.act, 'board pending + on-behalf flag for HR sector');
  fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => /بدون مستخدم/.test(n.Title) && /مجلس/.test(n.Body)), 'no board user → HR alerted');
  rr = api('req.action', tOwner, { Request_ID: rb, action: 'APPROVE', onBehalf: true, comment: 'تمام' });
  ok(!rr.ok && /وسيلة/.test(rr.error), 'on-behalf needs a method');
  rr = api('req.action', tOwner, { Request_ID: rb, action: 'APPROVE', onBehalf: true, onBehalfMethod: 'WHATSAPP', comment: '' });
  ok(!rr.ok && /ملاحظة/.test(rr.error), 'on-behalf needs a note');
  rr = api('req.action', tOwner, { Request_ID: rb, action: 'APPROVE', onBehalf: true, onBehalfMethod: 'MEETING', comment: 'وافق رئيس المجلس في اجتماع 3/10' });
  ok(!rr.ok && /إثبات القرار/.test(rr.error), 'v0.36: on-behalf board decision needs its proof');
  rr = must(api('req.action', tOwner, { Request_ID: rb, action: 'APPROVE', onBehalf: true, onBehalfMethod: 'MEETING', comment: 'وافق رئيس المجلس في اجتماع 3/10', files: EVJ }), 'on-behalf approve');
  ok(rr.Status === 'APPROVED', 'approved after board');
  g = must(api('req.get', tOwner, { Request_ID: rb }), 'get after');
  ok(/بالنيابة عن مجلس الإدارة — عبر اجتماع/.test(g.chain[4].Comment) && g.chain[4].decidedBy === 'محمد عمارة', 'on-behalf recorded with actor');
  must(api('rules.stop', tOwner, { Rule_ID: ruleId, reason: 'انتهى طلب المجلس' }), 'stop rule');
  r = must(api('rules.list', t.hr), 'rules list'); ok(r.some(x => x.Rule_ID === ruleId && !x.effective), 'stopped rule not effective');
  // HR sector manager sends a normal request to the board; a board member approves
  const board = user('board@t.com', 'نائب رئيس المجلس', '', ['BOARD']); const tB = login('board@t.com');
  rr = must(api('req.submit', t.acc, Object.assign({}, dB, { Justification: 'طلب تاني لنفس الوظيفة للاختبار' })), 'submit normal');
  const rn = rr.Request_ID;
  g = must(api('req.get', t.acc, { Request_ID: rn }), 'normal chain'); ok(g.chain.map(s => s.Step_Type).join() === 'LINE,HR,HC_EXC', 'rule stopped → no board');
  must(api('req.action', t.cfo, { Request_ID: rn, action: 'APPROVE' }), 'cfo n');
  rr = api('req.action', t.hr, { Request_ID: rn, action: 'SEND_BOARD', comment: 'حساسة', hr: { HR_Classification: 'NORMAL' } });
  ok(!rr.ok && /قطاع الموارد/.test(rr.error), 'only HR sector can send to board');
  // owner is HR sector but HR step is pending for HR roles; owner acts at HR step
  rr = must(api('req.action', tOwner, { Request_ID: rn, action: 'SEND_BOARD', comment: 'لأسباب تخص المجلس', alsoHcExc: true, hr: { HR_Classification: 'NORMAL' } }), 'send board');
  g = must(api('req.get', tB, { Request_ID: rn }), 'board member get');
  ok(g.chain.map(s => s.Step_Type).join() === 'LINE,HR,HC_EXC,CEO,BOARD' && g.chain[2].Status === 'APPROVED' && g.request.Status === 'PENDING_CEO', 'exception approved in the same go; CEO then board appended');
  must(api('req.action', t.ceo, { Request_ID: rn, action: 'APPROVE' }), 'ceo n');
  g = must(api('req.get', tB, { Request_ID: rn }), 'board can act'); ok(g.can.act, 'board member can act');
  rr = must(api('req.action', tB, { Request_ID: rn, action: 'APPROVE' }), 'board approves'); ok(rr.Status === 'APPROVED', 'approved by vice chairman');
}

// ---- cancel, visibility
r = must(api('req.save', t.cost, draft), 'draft 4');
must(api('req.cancel', t.cost, { Request_ID: r.Request_ID }), 'cancel draft');
r = api('req.get', t.nobody, { Request_ID: reqId });
ok(!r.ok, 'unrelated user cannot view');
r = api('req.list', t.nobody, { box: 'all' });
ok(!r.ok, 'unrelated user no all box');
r = must(api('req.list', t.hr, { box: 'all' }), 'hr all');
ok(r.length === 5, 'all box excludes drafts/cancelled? ' + r.length);

// ---- notifications
r = must(api('notif.list', t.cost), 'notif list');
ok(r.length >= 3 && r.some(n => !n.Read_At), 'requester has notifications');
must(api('notif.read', t.cost, {}), 'mark read');
r = must(api('todo', t.cost), 'todo after read');
ok(r.unread === 0, 'all read');

// ---- PCR
const pcr = { Org_Unit_ID: P['مدير الحسابات'][0].Org_Unit_ID, Proposed_Title: 'محلل مالي', Number_Of_Positions: '2',
  Reports_To_Position_ID: P['مدير الحسابات'][0].Position_ID, Location_ID: accObour.Location_ID,
  Justification: 'تحليل التكاليف والموازنات الشهرية', Responsibilities: 'إعداد تقارير التحليل المالي', Qualifications: 'تجارة' };
r = must(api('pcr.submit', t.acc, pcr), 'pcr submit');
const pcrId = r.PCR_ID;
r = must(api('pcr.get', t.cfo, { PCR_ID: pcrId }), 'pcr get');
ok(r.chain.map(s => s.Step_Type).join() === 'ENDORSE,HR,CEO,BOARD' && r.can.act, 'PCR chain');
must(api('pcr.action', t.cfo, { PCR_ID: pcrId, action: 'APPROVE' }), 'cfo endorses');
r = api('pcr.action', t.hr, { PCR_ID: pcrId, action: 'APPROVE', hr: { HR_Recommendation: 'موصى به', Proposed_Grade: 'G07' } });
ok(!r.ok && /مدير قطاع/.test(r.error), 'HR manager cannot set grade');
must(api('pcr.action', tOwner, { PCR_ID: pcrId, action: 'APPROVE', hr: { HR_Recommendation: 'موصى به', Proposed_Grade: 'G07' } }), 'HR sector review');
r = must(api('todo', t.ceo), 'ceo todo');
ok(r.pcrApprovals === 1, 'ceo pcr todo');
r = must(api('pcr.action', t.ceo, { PCR_ID: pcrId, action: 'APPROVE' }), 'ceo approves pcr');
ok(r.Status === 'PENDING_BOARD', 'pcr goes to board after CEO');
r = must(api('pcr.get', tOwner, { PCR_ID: pcrId }), 'pcr get owner'); ok(r.can.boardOnBehalf, 'on-behalf flag on pcr');
r = must(api('pcr.action', tOwner, { PCR_ID: pcrId, action: 'APPROVE', onBehalf: true, onBehalfMethod: 'PHONE', comment: 'رئيس المجلس وافق تليفونياً', files: EVJ }), 'board on behalf pcr');
ok(r.Status === 'APPROVED' && /^POS-/.test(r.Position_ID), 'position created');
fresh();
const np = ctx.get_('POSITIONS', r.Position_ID);
ok(np.Structural_HC === '2' && np.HC_Basis === 'MANPOWER_PLAN' && ctx.get_('JOBS', np.Job_Code).Grade_Code === 'G07', 'new position details');
{ const jd = ctx.find_('JOB_DESCRIPTIONS', { Job_Code: np.Job_Code })[0];
  ok(jd && jd.Status === 'Draft' && jd.Version === '1' && JSON.parse(jd.Responsibilities)[0] === 'إعداد تقارير التحليل المالي' && jd.Qualifications === 'تجارة', 'new job starts with a JD draft from the PCR'); }
r = must(api('req.positions', t.acc, { q: 'محلل' }), 'new position requestable');
ok(r.rows.length === 1 && r.rows[0].available === 2, 'new position available 2');
r = must(api('pcr.list', t.acc, {}), 'pcr list');
ok(r.length === 1 && r[0].Created_Position_ID, 'pcr list row');

// ---- missing CEO user → HR admins alerted
must(api('users.save', tOwner, { User_ID: U.ceo, Email: 'ceo@t.com', Full_Name_AR: 'الرئيس التنفيذي', Status: 'Inactive', reason: 'x' }), 'ceo off');
r = must(api('pcr.submit', t.acc, Object.assign({}, pcr, { Proposed_Title: 'محلل 2' })), 'pcr 2');
must(api('pcr.action', t.cfo, { PCR_ID: r.PCR_ID, action: 'APPROVE' }), 'cfo 2');
must(api('pcr.action', t.hr, { PCR_ID: r.PCR_ID, action: 'APPROVE', hr: { HR_Recommendation: 'موصى به' } }), 'hr 2');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.hr && /بدون مستخدم/.test(n.Title)), 'stalled step alert');

fresh();
const aud = ctx.all_('AUDIT_LOG').map(a => a.Audit_ID);
ok(new Set(aud).size === aud.length, 'audit ids unique');
const allCells = Object.values(store).flatMap(s => s.sheets.flatMap(sh => sh.data.flat()));
ok(allCells.every(c => typeof c === 'string'), 'all cells strings');
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
