// Phase 3A scenario: apply link → online applications → pipeline → activities → tasks → duplicates → internal candidate.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3']
].map(r => r.join(T)).join('\n');
must(api('import.commit', tOwner, { text: rows, reason: 'init' }), 'import');
fresh();
const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) {
  const u = must(api('users.save', tOwner, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + email);
  if (roles) must(api('users.setRoles', tOwner, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles ' + email);
  return u.User_ID;
}
const U = {
  cfo: user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي'].Position_ID),
  acc: user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID),
  cost: user('cost@t.com', 'رئيس التكاليف', P['رئيس قسم التكاليف'].Position_ID),
  hr: user('hr@t.com', 'مدير الموارد', '', ['HR_MANAGER']),
  rec: user('rec@t.com', 'سارة أخصائية توظيف', '', ['RECRUITER']),
  rec2: user('rec2@t.com', 'أخصائي تاني', '', ['RECRUITER']),
  recMgr: user('recmgr@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER'])
};
const t = {}; ['cfo', 'acc', 'cost', 'hr', 'rec', 'rec2'].forEach(k => { t[k] = login(k + '@t.com'); }); t.recMgr = login('recmgr@t.com');

// ---- a vacancy: request by the section head → acc → cfo → HR
const draft = { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED',
  Reason_Category: 'WORKLOAD', Justification: 'ضغط شغل في إقفال الشهر', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01',
  Experience_Years: '2', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 1 }] };
let r2; let r = must(api('req.submit', t.cost, draft), 'submit');
const reqId = r.Request_ID;
must(api('req.action', t.acc, { Request_ID: reqId, action: 'APPROVE' }), 'acc');
must(api('req.action', t.cfo, { Request_ID: reqId, action: 'APPROVE' }), 'cfo');
r = must(api('req.action', t.hr, { Request_ID: reqId, action: 'APPROVE', hr: { HR_Classification: 'NORMAL' } }), 'hr');
const vacId = r.vacancies[0];
must(api('vac.assign', t.recMgr, { Vacancy_ID: vacId, Lead_Recruiter_ID: U.rec }), 'assign');

// ---- apply link settings
r = api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'Y' });
ok(!r.ok && /ابدأ التوظيف/.test(r.error), 'cannot open apply before recruitment starts');
must(api('vac.update', t.recMgr, { Vacancy_ID: vacId, action: 'OPEN' }), 'open vacancy');
r = api('cand.applySettings', t.rec2, { Vacancy_ID: vacId, Apply_Enabled: 'Y' });
ok(!r.ok, 'recruiter outside the team cannot change apply link');
r = must(api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'Y', Public_Summary: 'محاسب تكاليف خبرة سنتين' }), 'enable apply');
const code = r.code;
ok(r.live && /^[A-Za-z0-9]{10}$/.test(code) && /\?apply=/.test(r.url) && r.links.some(l => /src=WUZZUF/.test(l.url)), 'apply link + source links');

// ---- public page
r = pub('apply.info', { code: code });
ok(r.ok && !r.data.closed && r.data.job.titleAr === 'محاسب تكاليف' && r.data.job.summary === 'محاسب تكاليف خبرة سنتين' && r.data.privacy.version === '1', 'apply.info');
ok(pub('apply.info', { code: 'nope12345' }).data.closed, 'unknown code closed');
const base = { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Full_Name: 'أحمد محمد علي', Mobile: '٠١٠١٢٣٤٥٦٧٨',
  Email: 'Ahmed@Mail.com', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '3', Current_Salary: '9,000', Expected_Salary: '12000', src: 'WUZZUF' };
r = pub('apply.submit', Object.assign({}, base, { consent: '' }));
ok(!r.ok && /الخصوصية/.test(r.error), 'consent required');
r = pub('apply.submit', Object.assign({}, base, { Mobile: '123' }));
ok(!r.ok && /الموبايل/.test(r.error), 'bad mobile');
r = pub('apply.submit', Object.assign({}, base, { lang: 'en', Education: '' }));
ok(!r.ok && /education/.test(r.error), 'english error message');
r = pub('apply.submit', Object.assign({}, base, { website: 'spam' }));
ok(r.ok, 'honeypot pretends success');
r = pub('apply.submit', Object.assign({}, base, { elapsed: 500 }));
ok(r.ok, 'too fast pretends success');
fresh(); ok(ctx.all_('PERSONS').length === 0, 'bots stored nothing');
const pdf = Buffer.from('%PDF-1.4 test cv').toString('base64');
r = pub('apply.submit', Object.assign({}, base, { cv: { name: 'cv.pdf', mime: 'application/pdf', data: pdf } }));
ok(r.ok && /^APP-\d{4}-00001$/.test(r.data.ref), 'applied: ' + JSON.stringify(r));
const app1 = r.data.ref;
fresh();
let per1 = ctx.all_('PERSONS')[0];
ok(per1.Mobile_Norm === '01012345678' && per1.Email === 'ahmed@mail.com' && per1.Current_Salary === '' && per1.Expected_Salary === '12000' && per1.CV_File_ID && per1.Consent_Version === '1', 'person normalized (v0.38: the current salary is asked at the offer)');
ok(ctx.get_('APPLICATIONS', app1).Source === 'WUZZUF' && ctx.get_('APPLICATIONS', app1).Channel === 'ONLINE', 'source from link');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rec && /متقدم جديد/.test(n.Title)), 'lead recruiter notified');
r = pub('apply.submit', Object.assign({}, base, { cv: { name: 'x.exe', mime: 'application/x-msdownload', data: pdf } , Mobile: '01122223333' }));
ok(!r.ok && /نوع الملف/.test(r.error), 'cv type checked');

// duplicate: same email, different mobile, no salaries (allowed blank)
r = pub('apply.submit', Object.assign({}, base, { Mobile: '+20 111 222 3333', Current_Salary: '', Expected_Salary: '', src: 'zzz', Referrer_Name: 'خالد من المخازن' }));
ok(r.ok, 'second application');
const app2 = r.data.ref;
fresh();
const per2 = ctx.all_('PERSONS')[1];
ok(per2.Mobile_Norm === '01112223333' && per2.Dup_Status === 'PENDING' && per2.Dup_Candidates === per1.Person_ID, 'flagged as possible duplicate, not merged');
ok(ctx.get_('APPLICATIONS', app2).Source === 'REFERRAL' && ctx.get_('APPLICATIONS', app2).Sub_Source === 'ZZZ', 'unknown src kept as sub-source, referral source');

// ---- pipeline visibility
r = must(api('cand.pipeline', t.rec, { Vacancy_ID: vacId }), 'pipeline rec');
ok(r.access === 'FULL' && r.counts.NEW === 2 && r.rows.length === 2 && r.rows[0].person.Mobile, 'recruiter sees all with contact');
ok(r.rows.some(x => x.dup), 'dup flag in pipeline');
ok(!api('cand.pipeline', t.rec2, { Vacancy_ID: vacId }).ok, 'other recruiter blocked');
r = must(api('cand.pipeline', t.cost, { Vacancy_ID: vacId }), 'pipeline hiring manager');
ok(r.access === 'SHORTLIST' && r.rows.length === 0 && !r.apply, 'hiring manager sees shortlist only');
r = must(api('cand.tasks', t.rec, {}), 'tasks');
ok(r.counts.fresh === 2 && r.counts.dups === 1, 'tasks: new + dup');
r = must(api('me', t.rec), 'me rec');
ok(r.todo.cand && r.todo.cand.fresh === 2 && r.can.candidates && !r.can.candAll, 'todo has candidate counters');

// ---- activities & next action
r = api('cand.activity', t.rec, { Application_ID: app1, Type: 'CALL' });
ok(!r.ok && /نتيجة/.test(r.error), 'call needs outcome');
r = must(api('cand.activity', t.rec, { Application_ID: app1, Type: 'CALL', Outcome: 'REACHED', Note: 'مهتم', moveToContacted: 'Y',
  Next_Action: 'مقابلة تليفونية', Next_Action_Date: day(1) }), 'call logged');
ok(r.moved, 'moved to contacted');
r = must(api('cand.app', t.rec, { Application_ID: app1 }), 'app get');
ok(r.app.Stage === 'CONTACTED' && r.app.Next_Action === 'مقابلة تليفونية' && r.app.nextOwnerName === 'سارة أخصائية توظيف', 'stage + next action');
ok(r.activities.length === 3 && r.activities.some(a => a.Type === 'STAGE'), 'activity log has call + stage + applied');
must(api('cand.next', t.rec, { Application_ID: app1, Next_Action: 'اتصل تاني', Next_Action_Date: day(-1) }), 'next overdue');
r = must(api('cand.tasks', t.rec, {}), 'tasks 2');
ok(r.counts.overdue === 1 && r.next[0].overdue && r.counts.fresh === 1, 'overdue task');
r = api('cand.next', t.rec, { Application_ID: app1, Next_Action: 'x', Next_Action_Date: day(1), Next_Action_Owner: U.rec2 });
ok(!r.ok && /فريق الشاغر/.test(r.error), 'owner must be on the team');
const note = must(api('cand.activity', t.rec, { Application_ID: app1, Type: 'NOTE', Note: 'ملاحظة غلط' }), 'note').activity;
ok(!api('cand.activityVoid', t.rec, { Activity_ID: note.Activity_ID, reason: '' }).ok, 'void needs reason');
r = must(api('cand.activityVoid', t.rec, { Activity_ID: note.Activity_ID, reason: 'اتكتبت على مرشح غلط' }), 'void');
fresh(); ok(ctx.get_('ACTIVITIES', note.Activity_ID).Status === 'Voided', 'voided not deleted');

// ---- stages
r = api('cand.move', t.rec, { Application_ID: app1, to: 'NEW' });
ok(!r.ok && /الرجوع/.test(r.error), 'going back needs a note');
must(api('cand.move', t.rec, { Application_ID: app1, to: 'SCREENING' }), 'screening');
r = api('cand.move', t.rec, { Application_ID: app1, to: 'ON_HOLD' });
ok(!r.ok, 'hold needs reason');
must(api('cand.move', t.rec, { Application_ID: app1, to: 'ON_HOLD', note: 'مستني رد مدير القسم' }), 'hold');
r = api('cand.move', t.rec, { Application_ID: app1, to: 'SHORTLISTED' });
ok(!r.ok && /معلّق/.test(r.error), 'held candidate cannot jump');
r = must(api('cand.move', t.rec, { Application_ID: app1, to: 'RESUME' }), 'resume');
ok(r.app.Stage === 'SCREENING', 'resumed to previous stage');
must(api('cand.move', t.rec, { Application_ID: app1, to: 'SHORTLISTED' }), 'shortlist');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.cost && /القائمة المختصرة/.test(n.Title)), 'hiring manager told');
r = must(api('cand.pipeline', t.cost, { Vacancy_ID: vacId }), 'hm pipeline 2');
ok(r.rows.length === 1 && r.rows[0].person.Full_Name === 'أحمد محمد علي' && r.rows[0].person.Mobile === undefined && r.rows[0].person.Expected_Salary === undefined, 'hiring manager: no contact / salary');
r = must(api('cand.cv', t.cost, { Person_ID: per1.Person_ID, Application_ID: app1 }), 'hm cv');
ok(Buffer.from(r.data, 'base64').toString() === '%PDF-1.4 test cv' && r.mime === 'application/pdf', 'cv round-trip');
ok(!api('cand.app', t.cost, { Application_ID: app2 }).ok, 'hm cannot open non-shortlisted');
ok(!api('cand.move', t.cost, { Application_ID: app1, to: 'REJECTED', reasonCode: 'OTHER' }).ok, 'hm cannot move');

// ---- reject + message task
r = api('cand.move', t.rec, { Application_ID: app2, to: 'REJECTED' });
ok(!r.ok && /السبب/.test(r.error), 'reject needs reason');
r = api('cand.move', t.rec, { Application_ID: app2, to: 'REJECTED', reasonCode: 'OTHER' });
ok(!r.ok && /توضيح/.test(r.error), 'OTHER needs note');
must(api('cand.move', t.rec, { Application_ID: app2, to: 'REJECTED', reasonCode: 'SALARY_GAP', note: 'طالب ضعف الميزانية' }), 'reject');
r = must(api('cand.tasks', t.rec, {}), 'tasks 3');
ok(r.counts.rejectMsg === 1, 'rejection message task');
must(api('cand.activity', t.rec, { Application_ID: app2, Type: 'WHATSAPP', Template_Code: 'REJECT', Note: 'رسالة اعتذار' }), 'reject msg sent');
fresh(); ok(ctx.get_('APPLICATIONS', app2).Reject_Msg_Status === 'SENT', 'rejection message marked sent');
ok(!api('cand.move', t.rec, { Application_ID: app2, to: 'REOPEN', note: 'غلط' }).ok, 'recruiter cannot reopen');
must(api('cand.move', t.recMgr, { Application_ID: app2, to: 'REOPEN', note: 'الميزانية اتعدلت' }), 'manager reopens');

// ---- duplicate resolution: merge person2 into person1 → same vacancy twice → moved one withdrawn
r = must(api('cand.app', t.rec, { Application_ID: app2 }), 'app2');
ok(r.dups && r.dups.length === 1 && r.dups[0].on.indexOf('EMAIL') >= 0, 'dup candidates listed');
r = must(api('cand.dup', t.rec, { Person_ID: per2.Person_ID, action: 'MERGE', Target_Person_ID: per1.Person_ID }), 'merge');
ok(r.moved === 1 && r.closedDuplicates === 1, 'merged, duplicate application closed');
fresh();
ok(ctx.get_('PERSONS', per2.Person_ID).Status === 'Merged' && ctx.get_('APPLICATIONS', app2).Person_ID === per1.Person_ID && ctx.get_('APPLICATIONS', app2).Stage === 'WITHDRAWN', 'merge result');
ok(ctx.get_('PERSONS', per1.Person_ID).Expected_Salary === '12000', 'blank newer value did not wipe data');

// ---- manual entry by recruiter
const man = { Vacancy_ID: vacId, Full_Name: 'منى سعيد حسن', Mobile: '01012345678', Source: 'WALK_IN', consent: 'Y' };
r = must(api('cand.create', t.rec, man), 'manual 1');
ok(r.needConfirm && r.matches[0].Person_ID === per1.Person_ID && r.matches[0].on[0] === 'MOBILE', 'duplicate warning before saving');
r = api('cand.create', t.rec, Object.assign({}, man, { usePersonId: per1.Person_ID }));
ok(!r.ok && /متقدم بالفعل/.test(r.error), 'same person twice on a vacancy blocked');
r = must(api('cand.create', t.rec, Object.assign({}, man, { confirmNew: 'Y' })), 'manual confirmed different');
const app3 = r.application.Application_ID;
fresh(); ok(ctx.get_('PERSONS', r.person.Person_ID).Dup_Status === '' && /RECRUITER/.test(ctx.get_('PERSONS', r.person.Person_ID).Consent_Version), 'recruiter-confirmed new person');
ok(!api('cand.create', t.rec, Object.assign({}, man, { Mobile: '01099998888', consent: '' })).ok, 'manual needs consent confirmation');

// ---- internal candidate: manager told at shortlist
const emp = user('emp-mgr@t.com', 'مدير الحسابات العامة', '', null);
fresh(); ctx.update_('POSITIONS', P['محاسب عام'].Position_ID, { Reports_To_Position_ID: P['مدير الحسابات'].Position_ID }, 'x');
r = pub('apply.submit', Object.assign({}, base, { Full_Name: 'كريم عادل فؤاد', Mobile: '01255556666', Email: '', Is_Employee: 'Y', Employee_ID: '1234', src: '' }));
ok(r.ok, 'internal applied');
const app4 = r.data.ref;
fresh(); const per4 = ctx.get_('PERSONS', ctx.get_('APPLICATIONS', app4).Person_ID);
ok(ctx.get_('APPLICATIONS', app4).Is_Internal === 'Y' && ctx.get_('APPLICATIONS', app4).Source === 'CAREER_PAGE', 'internal flag');
r = api('cand.move', t.rec, { Application_ID: app4, to: 'SHORTLISTED' });
ok(!r.ok && /وظيفته الحالية/.test(r.error), 'internal needs current position first');
must(api('cand.person', t.rec, Object.assign({}, per4, { Employee_Position_ID: P['محاسب عام'].Position_ID, reason: 'ربط الوظيفة' })), 'set current position');
r = must(api('cand.move', t.rec, { Application_ID: app4, to: 'SHORTLISTED' }), 'internal shortlist');
fresh();
ok(ctx.get_('APPLICATIONS', app4).Manager_User_ID === U.acc && ctx.get_('APPLICATIONS', app4).Manager_Notified_At, 'current manager recorded');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.acc && /موظف من فريقك/.test(n.Title)), 'current manager notified');

// ---- templates
r = must(api('tpl.list', t.rec, {}), 'templates');
ok(r.length === 16 && r.some(x => x.Code === 'REJECT' && x.Language === 'en'), '16 templates (8 + 6 interview + 2 offer letter)');
ok(!api('tpl.save', t.rec, { Template_ID: 'ACK-ar', Title: 'x', Body: 'xxxxxxxxxxxx' }).ok, 'recruiter cannot edit templates');
r = must(api('tpl.save', t.recMgr, { Template_ID: 'ACK-ar', Title: 'تأكيد الاستلام', Body: 'مرحباً {name} استلمنا طلبك', Purpose: 'CONTACT' }), 'edit template');
ok(r.Title === 'تأكيد الاستلام', 'template edited');

// ---- search & throttle & closed vacancy
r = must(api('cand.search', t.rec, { q: '٠١٠١٢' }), 'search by mobile (arabic digits)');
ok(r.length === 2 && r.some(x => x.apps.length === 2), 'search finds persons with their applications');
r = must(api('cand.search', t.rec, { dupOnly: true }), 'dup list');
ok(r.length === 0, 'no pending duplicates left');
pub('apply.submit', Object.assign({}, base, { Mobile: '01577778888', Email: '' }));
pub('apply.submit', Object.assign({}, base, { Mobile: '01577778888', Email: '' }));
pub('apply.submit', Object.assign({}, base, { Mobile: '01577778888', Email: '' }));
r = pub('apply.submit', Object.assign({}, base, { Mobile: '01577778888', Email: '' }));
ok(!r.ok && /أكتر من طلب/.test(r.error), 'throttled per mobile');
must(api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'N' }), 'disable');
ok(pub('apply.info', { code }).data.closed && !pub('apply.submit', Object.assign({}, base, { Mobile: '01000000001' })).ok, 'closed link');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'CV_VIEW'), 'cv view audited');

// ---- HR Sector Manager's own request: his approval is enough, except jobs reporting to the CEO
const ownReq = Object.assign({}, draft, { Requested_Priority: 'IMPORTANT', lines: [{ Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 1 }] });
r = must(api('req.submit', tOwner, ownReq), 'owner own request');
ok(r.Status === 'APPROVED' && r.vacancies.length === 1, 'HR sector manager request approved on submit: ' + r.Status);
r = must(api('req.get', tOwner, { Request_ID: r.Request_ID }), 'own get');
ok(r.chain.filter(s => s.Step_Type === 'LINE').every(s => s.Status === 'SKIPPED') && r.chain.find(s => s.Step_Type === 'HR').Status === 'APPROVED' &&
   !r.chain.some(s => s.Step_Type === 'CEO') && r.request.HR_Classification === 'IMPORTANT', 'chain: lines skipped, HR approved, no CEO');
fresh(); ctx.update_('POSITIONS', P['مدير القطاع المالي'].Position_ID, { Reports_To_Position_ID: P['الرئيس التنفيذي'].Position_ID }, 'x');
r = must(api('req.submit', tOwner, Object.assign({}, ownReq, { lines: [{ Position_ID: P['مدير القطاع المالي'].Position_ID, Requested_HC: 1 }], Exception_Justification: 'بديل لنفس الوظيفة' })), 'owner request for CEO direct report');
ok(r.Status === 'PENDING_CEO', 'CEO direct report still goes to CEO: ' + r.Status);
r = must(api('req.get', tOwner, { Request_ID: r.Request_ID }), 'get 2');
ok(r.chain.some(s => s.Step_Type === 'BOARD'), 'and to the board');

// ---- branches: positions under «الفروع» pick a branch per line
fresh(); const grpLoc = ctx.get_('POSITIONS', P['محاسب عام'].Position_ID).Location_ID;
must(api('locations.save', tOwner, { Location_ID: grpLoc, Name_AR: 'الفروع', Location_Type: 'BRANCH_GROUP', Status: 'Active', reason: 'x' }), 'group');
const b1 = must(api('locations.save', tOwner, { Name_AR: 'فرع النزهة', Location_Type: 'SHOWROOM', Governorate: 'القاهرة', Address: '29 شارع النزهة' }), 'branch 1').Location_ID;
const b2 = must(api('locations.save', tOwner, { Name_AR: 'فرع المعادي', Location_Type: 'SHOWROOM', Governorate: 'القاهرة' }), 'branch 2').Location_ID;
ok(!api('locations.save', tOwner, { Name_AR: 'فرع النزهة', Location_Type: 'SHOWROOM' }).ok, 'duplicate location name blocked');
r = must(api('req.positions', tOwner, {}), 'positions with branch flag');
ok(r.rows.find(x => x.Position_ID === P['محاسب عام'].Position_ID).branchGroup === true, 'branch group flag');
const brReq = Object.assign({}, draft, { Employment_Type: 'DAILY', lines: [{ Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 1 }] });
r = api('req.submit', tOwner, brReq);
ok(!r.ok && /الفرع/.test(r.error), 'branch required');
brReq.lines = [{ Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 1, Location_ID: b1 }, { Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 2, Location_ID: b2 }];
brReq.Exception_Justification = 'افتتاح فروع';
r = must(api('req.submit', tOwner, brReq), 'two branches');
ok(r.Status === 'APPROVED' && r.vacancies.length === 2, 'one vacancy per branch');
fresh(); ok(ctx.get_('VACANCIES', r.vacancies[0]).Location_ID === b1 && ctx.get_('RECRUITMENT_REQUESTS', r.Request_ID).Employment_Type === 'DAILY', 'vacancy carries the branch; daily type');
r2 = api('req.submit', tOwner, Object.assign({}, brReq, { lines: [{ Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 1, Location_ID: b1 }, { Position_ID: P['محاسب عام'].Position_ID, Requested_HC: 1, Location_ID: b1 }] }));
ok(!r2.ok && /مكرر/.test(r2.error), 'same branch twice blocked');
r2 = api('locations.save', tOwner, { Location_ID: b1, Name_AR: 'فرع النزهة', Location_Type: 'SHOWROOM', Status: 'Inactive', reason: 'قفل' });
ok(!r2.ok && /شاغر مفتوح/.test(r2.error), 'cannot close a branch with open vacancies');
r2 = must(api('req.printed', tOwner, { Request_ID: r.Request_ID, label: 'APPROVED' }), 'print log');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'PRINT' && a.Entity_ID === r.Request_ID), 'print audited');
r2 = must(api('lookups', tOwner, {}), 'lookups'); ok(r2.locations.find(l => l.id === b1).address === '29 شارع النزهة', 'address in lookups');

console.log(`\n${pass} passed, ${failN} failed`);
if (failN) process.exit(1);
