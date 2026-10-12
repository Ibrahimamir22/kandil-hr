// Phase 5B (v0.14.0): joining record, hiring documents (types, scope, upload/review/physical, deferral, waiver),
// receipt only when complete, private upload link, joined → vacancy fill, did-not-join, payroll notices, no-insurance contracts.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '6']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), ceo: login('ceo@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 4 }] }), 'request');
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
const today = ctx.today_();
const sec = login('owner@test.com');
must(api('pay.structures', sec, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' }), 'structure');
function hire(name, mobile, gender, extra) {
  const A = must(api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Gender: gender, Source: 'WALK_IN', consent: 'Y' }), 'cand').application.Application_ID;
  must(api('cand.move', t.rec, { Application_ID: A, to: 'SHORTLISTED' }), 'shortlist');
  const iv = must(api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'iv').interview;
  must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }), 'start');
  must(api('sel.save', t.rec, { Application_ID: A, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' }), 'select');
  let O = must(api('offer.save', t.rec, Object.assign({ Application_ID: A, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01' }, extra || {})), 'offer').offer;
  return { A, O };
}
function accept(O, tok) {
  O = must(api('offer.action', tok || t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' }), 'present').offer;
  return must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: 'وقّع على النسخة المطبوعة' }), 'accept').offer;
}

// =============== document types ===============
let DT = must(api('doctype.list', t.rec, {}), 'doc types');
ok(DT.rows.length === 14 && DT.rows.some(r => r.Doc_Code === 'NO_INS_ACK') && !DT.canEdit && DT.rows.find(r => r.Doc_Code === 'MILITARY').Scope === 'MALE' && DT.rows.find(r => r.Doc_Code === 'NATIONAL_ID').Deferrable === 'N', '13 hiring documents seeded (v0.38: + criminal-check consent) + the no-insurance acknowledgement (v0.46.2) (military for males, ID not deferrable)');
ok(['WORK_STUB', 'INS_PRINT', 'MEDICAL_111', 'PRACTICE_PERMIT', 'SKILL_CERT'].every(c => DT.rows.find(r => r.Doc_Code === c).Insured_Only === 'Y'), 'insured-only documents marked');
bad(api('doctype.save', t.rec, { Doc_Code: 'X', Name_AR: 'تجربة', Keep: 'COPY', Scope: 'ALL' }), null, 'recruiters cannot edit document types');
must(api('doctype.save', t.hr, { Doc_Code: 'SYNDICATE', Name_AR: 'كارنيه النقابة', Keep: 'COPY', Copies: 1, Digital: 'Y', Scope: 'JOBS', Scope_Value: JOB, Insured_Only: 'N', Deferrable: 'Y', Max_Defer_Days: 30, Has_Expiry: 'Y', Sort_Order: 100 }), 'syndicate → cost accountant');

// =============== accepted offer → joining record ===============
const H1 = hire('أحمد علي حسن', '01011112222', 'M');
const O1 = must(api('offer.action', t.rec, { Offer_ID: H1.O.Offer_ID, action: 'SUBMIT' }), 'submit').offer;
ok(O1.Status === 'APPROVED', 'within recruiter limit');
accept(O1);
let AP = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app');
let J = AP.joining;
ok(J && J.Status === 'PENDING' && J.Planned_Date === '2099-02-01', 'joining opened with the offer date');
const codes = J.docs.map(d => d.Doc_Code);
ok(codes.length === 11 && codes.includes('CRIMINAL_CONSENT') && codes.includes('MILITARY') && codes.includes('SYNDICATE') && !codes.includes('PRACTICE_PERMIT') && !codes.includes('SKILL_CERT'), 'list by scope: male + listed job, no blue-collar docs (office job): ' + codes.join(','));
ok(J.docs.every(d => d.Required === 'Y') && !J.summary.cleared && J.summary.required === 11, 'all required for an insured contract');
const AM = must(api('cand.app', t.mgr, { Application_ID: H1.A }), 'manager app');
ok(AM.joining && AM.joining.Planned_Date === '2099-02-01' && !AM.joining.docs, 'hiring manager sees the date only, not the documents');

// v0.17.0 (phase 6A): onboarding programs — templates, opening on date confirmation, owners, dating, tasks, acknowledgement,
// buddy, completion, employee file. (setup above copied from phase14)
const sup = user('sup@t.com', 'مشرف التكاليف', P['مدير القطاع المالي'].Position_ID);   // the sector head = unit head of the sector
fresh(); ctx.update_('POSITIONS', P['محاسب تكاليف'].Position_ID, { Reports_To_Position_ID: P['مدير الحسابات'].Position_ID }, 'x');
const hrSite = user('site@t.com', 'أخصائي HR العبور', '', ['HR_STAFF']);
fresh(); const LOC = P['محاسب تكاليف'].Location_ID, L = ctx.get_('LOCATIONS', LOC);
ok(L, 'cost accountant has a location');
must(api('locations.save', t.hr, { Location_ID: LOC, Name_AR: L.Name_AR, Location_Type: 'FACTORY', Governorate: L.Governorate, Status: 'Active', Address: L.Address, HR_Site_User_ID: hrSite }), 'HR site specialist for the factory');
bad(api('locations.save', t.hr, { Location_ID: LOC, Name_AR: L.Name_AR, Location_Type: L.Location_Type, Status: 'Active', HR_Site_User_ID: 'USR-9999' }), /غير موجود/, 'unknown HR specialist refused');

// templates
let TP = must(api('onb.templates', t.hr, {}), 'templates');
ok(TP.rows.length === 3 && TP.rows.every(r => r.items.length >= 17) && TP.rows.find(r => r.Job_Type === 'FACTORY').items.some(i => /السلامة/.test(i.Title_AR)), '3 templates seeded, the factory one has safety');
ok(TP.rows.find(r => r.Job_Type === 'SHOWROOM').items.some(i => /المنتجات/.test(i.Title_AR)) && TP.rows.find(r => r.Job_Type === 'OFFICE').items.some(i => /الإيميل/.test(i.Title_AR)), 'showroom: products; office: systems');
ok(TP.canEdit, 'HR manager edits templates');
ok(!must(api('onb.templates', t.rec, {}), 'rec templates').canEdit, 'recruiters see templates, cannot edit');
TP = must(api('onb.templates', tO, {}), 'owner templates'); ok(TP.canEdit, 'owner edits templates');
bad(api('onb.templates', t.mgr, {}), /صلاحية/, 'managers do not see templates');
const FT = TP.rows.find(r => r.Job_Type === 'FACTORY').Template_ID;
bad(api('onb.itemSave', tO, { Template_ID: FT, Phase: 'WEEK1', Day_Offset: '20', Owner_Role: 'SUPERVISOR', Title_AR: 'زيارة قسم الجودة' }), /مرحلة/, 'offset must fit the phase');
must(api('onb.itemSave', tO, { Template_ID: FT, Phase: 'WEEK1', Day_Offset: '4', Owner_Role: 'SUPERVISOR', Title_AR: 'زيارة قسم الجودة', Needs_Ack: 'N' }), 'item added');
const copy = must(api('onb.templateSave', tO, { Name_AR: 'تهيئة المخازن', Job_Type: 'FACTORY', copyFrom: FT }), 'copy template');
fresh(); ok(ctx.find_('ONB_TEMPLATE_ITEMS', { Template_ID: copy.Template_ID }).length === ctx.find_('ONB_TEMPLATE_ITEMS', { Template_ID: FT }).length, 'copied with its activities');
must(api('onb.templateSave', tO, { Template_ID: copy.Template_ID, Name_AR: 'تهيئة المخازن', Job_Type: 'FACTORY', Status: 'Inactive' }), 'stop the copy');

// accepted offer → confirm the date → program opens
const H = hire('كريم محمود سالم', '01033334444', 'M');
accept(must(api('offer.action', t.rec, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT' }), 'submit').offer);
let JJ = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
fresh(); ok(!ctx.all_('ONBOARDINGS').length, 'no program before the date is confirmed');
must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'DATE', date: '2099-02-05', reason: 'طلب المرشح' }), 'date');
const conf = must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm');
fresh(); let ONB = ctx.all_('ONBOARDINGS')[0];
ok(ONB && conf.onboarding === ONB.Onboarding_ID && ONB.Start_Date === '2099-02-05' && ONB.Job_Type === 'FACTORY' && ONB.Full_Name === 'كريم محمود سالم', 'program opened on confirmation, factory template');
ok(ONB.HR_Site_User_ID === hrSite && ONB.Recruiter_User_ID === U.rec && ONB.Supervisor_User_ID === U.mgr && ONB.Manager_User_ID === U.mgr, 'owners: HR site, recruiter, supervisor (reports-to) and unit head: ' + [ONB.HR_Site_User_ID, ONB.Recruiter_User_ID, ONB.Supervisor_User_ID, ONB.Manager_User_ID].join(','));
let TK = ctx.find_('ONB_TASKS', { Onboarding_ID: ONB.Onboarding_ID });
ok(TK.length === ctx.find_('ONB_TEMPLATE_ITEMS', { Template_ID: FT, Status: 'Active' }).length, 'one task per active activity: ' + TK.length);
const tk = re => TK.find(x => re.test(x.Title));
ok(tk(/ملف الموظف/).Due_Date === '2099-02-02' && tk(/لائحة العمل/).Due_Date === '2099-02-05' && tk(/نهاية الشهر الأول/).Due_Date === '2099-03-07', 'tasks dated from the start (weekends off: none in this test)');
ok(tk(/لائحة العمل/).Owner_User_ID === hrSite && tk(/الغدا/).Owner_User_ID === U.mgr && tk(/رسالة ترحيب/).Owner_User_ID === U.rec, 'buddy tasks wait with the supervisor until a buddy is set');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === hrSite && /برنامج تهيئة/.test(n.Title)) && ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.mgr && /برنامج تهيئة/.test(n.Title)), 'owners told');
must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm again');
fresh(); ok(ctx.all_('ONBOARDINGS').length === 1, 'confirming again does not open a second program');

// weekends: a Friday due date moves
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'FRI,SAT' }, 'x');
fresh(); ok(ctx.onbDue_('2099-02-05', 1) === '2099-02-08' && ctx.onbDue_('2099-02-05', -0) === '2099-02-05' && ctx.onbDue_('2099-02-09', -3) === '2099-02-05', 'weekend dates move forward (before day one: back)');
fresh(); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');

// date change moves open tasks
must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'DATE', date: '2099-02-10', reason: 'تأجيل' }), 'new date');
fresh(); ONB = ctx.get_('ONBOARDINGS', ONB.Onboarding_ID); TK = ctx.find_('ONB_TASKS', { Onboarding_ID: ONB.Onboarding_ID });
ok(ONB.Start_Date === '2099-02-10' && tk(/لائحة العمل/).Due_Date === '2099-02-10', 'program and open tasks moved');

// who sees it
let LS = must(api('onb.list', t.mgr, { tab: 'mine' }), 'manager tasks');
ok(LS.tasks.length > 0 && LS.tasks.every(x => x.onb === ONB.Onboarding_ID) && LS.tasks[0].due <= LS.tasks[LS.tasks.length - 1].due, 'manager sees his tasks, by date');
ok(must(api('onb.list', t.hr, { tab: 'active' }), 'hr list').rows.length === 1, 'HR sees active programs');
const D0 = must(api('onb.get', t.mgr, { Onboarding_ID: ONB.Onboarding_ID }), 'manager opens');
ok(D0.canManage && !D0.admin && D0.onb.owners.HR_SITE.name === 'أخصائي HR العبور' && D0.tasks.length === TK.length, 'manager can manage his new hire');
const other = user('x@t.com', 'موظف تاني'); const tX = login('x@t.com');
bad(api('onb.get', tX, { Onboarding_ID: ONB.Onboarding_ID }), /صلاحية/, 'others cannot open it');
ok(must(api('todo', t.mgr, {}), 'todo').onb.open > 0, 'counted in the manager\'s to-do');

// tasks
const tLaw = tk(/لائحة العمل/), tLunch = tk(/الغدا/), tFile = tk(/ملف الموظف/);
const tSite = login('site@t.com');
bad(api('onb.task', t.mgr, { Task_ID: tLaw.Task_ID, action: 'DONE' }), /مش عليك/, 'only its owner (or HR) closes a task');
bad(api('onb.task', tSite, { Task_ID: tLaw.Task_ID, action: 'DONE' }), /إقرار الموظف/, 'acknowledgement needed');
must(api('onb.task', tSite, { Task_ID: tLaw.Task_ID, action: 'DONE', ack: 'Y', note: 'وقّع على نسخة اللايحة' }), 'done with acknowledgement');
bad(api('onb.task', tSite, { Task_ID: tFile.Task_ID, action: 'SKIP' }), /سبب/, 'skip needs a reason');
must(api('onb.task', tSite, { Task_ID: tFile.Task_ID, action: 'SKIP', note: 'الملف اتعمل من التوظيف' }), 'skip');
bad(api('onb.task', t.mgr, { Task_ID: tFile.Task_ID, action: 'REOPEN' }), /مش عليك|اللي قفلها/, 'only who closed it or HR reopens');
must(api('onb.task', t.hr, { Task_ID: tFile.Task_ID, action: 'REOPEN' }), 'HR reopens');
fresh(); ok(ctx.get_('ONB_TASKS', tLaw.Task_ID).Ack === 'Y' && ctx.get_('ONB_TASKS', tFile.Task_ID).Status === 'OPEN', 'states kept');
// buddy + owners
const bud = user('bud@t.com', 'محمود الزميل');
bad(api('onb.owners', tX, { Onboarding_ID: ONB.Onboarding_ID, buddy: { name: 'x' } }), null, 'others cannot change owners');
must(api('onb.owners', t.mgr, { Onboarding_ID: ONB.Onboarding_ID, buddy: { name: 'محمود الزميل', userId: bud } }), 'set buddy');
fresh(); ok(ctx.get_('ONB_TASKS', tLunch.Task_ID).Owner_User_ID === bud && ctx.all_('NOTIFICATIONS').some(n => n.User_ID === bud && /مهام تهيئة/.test(n.Title)), 'buddy tasks move to the buddy, who is told');
must(api('onb.owners', t.hr, { Onboarding_ID: ONB.Onboarding_ID, owners: { HR_SITE: U.hr } }), 'change HR site');
fresh(); ok(ctx.get_('ONB_TASKS', tFile.Task_ID).Owner_User_ID === U.hr && ctx.get_('ONB_TASKS', tLaw.Task_ID).Owner_User_ID === hrSite, 'only open tasks move');
// extra task
bad(api('onb.taskAdd', tX, { Onboarding_ID: ONB.Onboarding_ID, Title: 'x x x', Phase: 'WEEK1', Owner_Role: 'BUDDY', Due_Date: '2099-02-12' }), null, 'others cannot add');
must(api('onb.taskAdd', t.mgr, { Onboarding_ID: ONB.Onboarding_ID, Title: 'جولة في مخزن الخامات', Phase: 'WEEK1', Owner_Role: 'BUDDY', Due_Date: '2099-02-12' }), 'manager adds a task');
fresh(); ok(ctx.find_('ONB_TASKS', { Onboarding_ID: ONB.Onboarding_ID }).some(x => x.Title === 'جولة في مخزن الخامات' && x.Owner_User_ID === bud), 'added task goes to the buddy');

// completion
bad(api('onb.complete', t.hr, { Onboarding_ID: ONB.Onboarding_ID, ackChannel: 'PAPER' }), /ماستلمش/, 'not before joining');
fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: JJ.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'WAIVED' }, 'x'));
fresh(); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');   // joining adds the employee to the list
const jd = ctx.today_();
ctx.__nidForJoining(JJ.Joining_ID);
must(api('join.action', t.rec, { Joining_ID: JJ.Joining_ID, action: 'JOINED', date: jd, Employee_ID: 'E-7001' }), 'joined');
fresh(); ONB = ctx.get_('ONBOARDINGS', ONB.Onboarding_ID);
ok(ONB.Employee_ID === 'E-7001' && ONB.Start_Date === jd && ctx.get_('ONB_TASKS', tFile.Task_ID).Due_Date === ctx.onbDue_(jd, -3), 'joined: employee linked, open tasks moved to the real first day');
bad(api('onb.complete', t.mgr, { Onboarding_ID: ONB.Onboarding_ID, ackChannel: 'PAPER' }), /مهمة مفتوحة/, 'manager cannot close with open tasks');
bad(api('onb.complete', t.hr, { Onboarding_ID: ONB.Onboarding_ID, ackChannel: 'PAPER' }), /سبب/, 'HR needs a reason to close with open tasks');
bad(api('onb.complete', t.hr, { Onboarding_ID: ONB.Onboarding_ID, ackChannel: 'X', reason: 'نقل لموقع تاني' }), /إقرار الموظف/, 'acknowledgement channel required');
// the employee file
const EF = must(api('emp.get', t.hr, { Employee_ID: 'E-7001' }), 'employee file').file;
ok(EF.joining && EF.joining.applicationId === H.A && EF.docs.length > 0 && EF.onboarding && EF.onboarding.id === ONB.Onboarding_ID && EF.onboarding.total > 0, 'file: hiring, documents, onboarding');
ok(EF.offer && EF.offer.package, 'HR manager sees the agreed package in the file');
fresh(); ctx.find_('ONB_TASKS', { Onboarding_ID: ONB.Onboarding_ID, Status: 'OPEN' }).forEach(x => ctx.update_('ONB_TASKS', x.Task_ID, { Status: 'DONE' }, 'x'));
bad(api('onb.complete', t.mgr, { Onboarding_ID: ONB.Onboarding_ID, ackChannel: 'NONE' }), /سبب/, 'no acknowledgement needs a reason');
must(api('onb.complete', t.mgr, { Onboarding_ID: ONB.Onboarding_ID, ackChannel: 'PAPER', ackNote: 'وقّع على البرنامج المطبوع' }), 'manager closes when all done');
fresh(); ONB = ctx.get_('ONBOARDINGS', ONB.Onboarding_ID);
ok(ONB.Status === 'COMPLETED' && ONB.Ack_Channel === 'PAPER' && ONB.Ack_At, 'completed with acknowledgement');
ok(must(api('onb.list', t.hr, { tab: 'closed' }), 'closed 0').rows[0].overdue === 0, 'a closed program shows no late tasks');
bad(api('onb.task', t.hr, { Task_ID: tFile.Task_ID, action: 'REOPEN' }), /اتقفل/, 'closed program is read-only');
ok(must(api('onb.list', t.hr, { tab: 'closed' }), 'closed').rows.length === 1, 'closed tab');

// did not join → cancelled
const H2 = hire('منى سعيد حسن', '01055556666', 'F');
accept(must(api('offer.action', t.rec, { Offer_ID: H2.O.Offer_ID, action: 'SUBMIT' }), 'submit 2').offer);
const J2 = must(api('cand.app', t.rec, { Application_ID: H2.A }), 'app 2').joining;
must(api('join.action', t.rec, { Joining_ID: J2.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm 2');
must(api('join.action', t.rec, { Joining_ID: J2.Joining_ID, action: 'DNJ', reason: 'OTHER', note: 'لقى شغل تاني' }), 'did not join');
fresh(); ok(ctx.all_('ONBOARDINGS').find(o => o.Joining_ID === J2.Joining_ID).Status === 'CANCELLED', 'program cancelled when he did not join');

// by hand for an existing employee (no joining)
must(api('emp.save', t.hr, { isNew: 'Y', Employee_ID: 'E-8001', Full_Name: 'هاني فؤاد', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: jd, Employment_Kind: 'PERMANENT', reason: 'x' }), 'old employee');
let EF2 = must(api('emp.get', t.hr, { Employee_ID: 'E-8001' }), 'file 2').file;
ok(EF2.canStartOnb && !EF2.onboarding, 'can start a program from the file');
bad(api('onb.start', t.mgr, { Employee_ID: 'E-8001' }), /صلاحية/, 'managers cannot start one by hand');
const S2 = must(api('onb.start', t.hr, { Employee_ID: 'E-8001', Start_Date: jd }), 'start by hand');
bad(api('onb.start', t.hr, { Employee_ID: 'E-8001' }), /مفتوح بالفعل/, 'one open program per employee');
must(api('onb.cancel', t.hr, { Onboarding_ID: S2.Onboarding_ID, reason: 'اتعمل بالخطأ' }), 'cancel');

// daily reminders for late tasks
const S3 = must(api('onb.start', t.hr, { Employee_ID: 'E-8001', Start_Date: '2020-01-01' }), 'an old start date');
fresh(); const late = ctx.find_('ONB_TASKS', { Onboarding_ID: S3.Onboarding_ID }).length;
let R = ctx.onbDaily_(); ok(R.reminded === late, 'every late task reminded once: ' + R.reminded + '/' + late);
fresh(); R = ctx.onbDaily_(); ok(R.reminded === 0, 'not twice');
// consultant can read
const C = user('c@t.com', 'الاستشاري'); must(api('users.save', tO, { User_ID: C, Email: 'c@t.com', Full_Name_AR: 'الاستشاري', Access_Expires_At: ctx.addDaysIso_(10).slice(0, 10) }), 'exp');
must(api('users.setRoles', tO, { User_ID: C, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), 'consultant'); const tC = login('c@t.com'); must(api('nda.accept', tC, {}), 'nda');
ok(must(api('onb.get', tC, { Onboarding_ID: ONB.Onboarding_ID }), 'consultant reads').tasks.length > 0, 'consultant reads programs');
bad(api('onb.task', tC, { Task_ID: tFile.Task_ID, action: 'DONE' }), /للعرض فقط/, 'consultant cannot act');

console.log('\nPhase 19 (onboarding): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
