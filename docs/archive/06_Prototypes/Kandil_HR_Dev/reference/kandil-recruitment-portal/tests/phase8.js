// Phase 3B-2 (v0.9.0): employee referrals (first wins, bonus status, lock), agencies (terms, ownership),
// application owner (default, hand-over, team change), source change with history, migration of older applications.
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '5']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
user('cfo@t.com', 'المدير المالي', P['مدير القطاع المالي']); user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات']);
user('hr@t.com', 'منى', '', ['HR_MANAGER']);
const U = { rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), rec2: user('rec2@t.com', 'علي', '', ['RECRUITER']) };
const t = { acc: login('acc@t.com'), cfo: login('cfo@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), rec2: login('rec2@t.com') };
const rq = must(api('req.submit', t.acc, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'ضغط شغل في الإقفال', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 2 }] }), 'request');
must(api('req.action', t.cfo, { Request_ID: rq.Request_ID, action: 'APPROVE' }), 'cfo');
const vacId = must(api('req.action', t.hr, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'NORMAL' } }), 'hr').vacancies[0];
must(api('vac.assign', t.rm, { Vacancy_ID: vacId, Lead_Recruiter_ID: U.rec, recruiters: [U.rec2] }), 'assign');
must(api('vac.update', t.rm, { Vacancy_ID: vacId, action: 'OPEN' }), 'open');
// employees master (referrers)
fresh();
[['1001', 'خالد محمود', 'Active'], ['1002', 'هبة سامي', 'Active'], ['1003', 'عمرو فتحي', 'Exited']].forEach(e =>
  ctx.insert_('EMPLOYEES', { Employee_ID: e[0], Full_Name: e[1], Position_ID: P['محاسب تكاليف'], Location_ID: '', Hire_Date: '2020-01-01', Employment_Kind: 'PERMANENT',
    Job_Type: '', Status: e[2], Exit_Date: '', Exit_Reason: '', Exit_Note: '', Source: 'TEST', Notes: '' }, 'x'));

// ---- employee search for recruiters
let es = must(api('cand.empSearch', t.rec, { q: 'خالد' }), 'emp search');
ok(es.length === 1 && es[0].id === '1001' && es[0].job === 'محاسب تكاليف', 'active employee found with job');
ok(must(api('cand.empSearch', t.rec, { q: 'عمرو' }), 'exited').length === 0, 'exited employees not offered');
bad(api('cand.empSearch', t.acc, { q: 'خالد' }), null, 'managers cannot search employees');

// ---- referral on manual entry
const base = { Vacancy_ID: vacId, Source: 'REFERRAL', consent: 'Y', Education: 'BACHELOR', Experience_Years: '3' };
bad(api('cand.create', t.rec, Object.assign({ Full_Name: 'أحمد علي حسن', Mobile: '01011112222' }, base)), /الموظف اللي رشّح/, 'referral needs the referrer');
bad(api('cand.create', t.rec, Object.assign({ Full_Name: 'أحمد علي حسن', Mobile: '01011112222', Referrer_Employee_ID: '1003' }, base)), /رأس العمل/, 'exited employee cannot refer');
bad(api('cand.create', t.rec, Object.assign({ Full_Name: 'أحمد علي حسن', Mobile: '01011112222', Referrer_Name: 'حد مش في السجل' }, base)), /سجل الموظفين/, 'referrer must be in the master when it exists');
fresh(); ok(ctx.find_('PERSONS', { Mobile_Norm: '01011112222' }).length === 0, 'nothing saved on a refused referral');
let r = must(api('cand.create', t.rec, Object.assign({ Full_Name: 'أحمد علي حسن', Mobile: '01011112222', Referrer_Employee_ID: '1001', Relationship: 'جار' }, base)), 'referred candidate');
const appA = r.application.Application_ID;
fresh();
let ref = ctx.find_('REFERRALS', { Application_ID: appA })[0];
ok(ref && ref.Employee_ID === '1001' && ref.Employee_Name === 'خالد محمود' && ref.Kind === 'PRIMARY' && ref.Bonus_Status === 'PENDING', 'primary referral, bonus pending');
ok(ctx.get_('APPLICATIONS', appA).Owner_User_ID === U.rec && ctx.get_('APPLICATIONS', appA).Original_Source === 'REFERRAL', 'owner = creator on the team; original source');
let g = must(api('cand.app', t.rec, { Application_ID: appA }), 'app get');
ok(g.attr.referral.Employee_Name === 'خالد محمود' && g.attr.isReferralSource && g.attr.ownerName === 'سارة' && !g.attr.locked && g.attr.canOwner, 'attribution shown');
// second employee claims the same candidate on the same vacancy → first wins
bad(api('cand.referral', t.rec, { Application_ID: appA, Employee_ID: '1002' }), /اكتب سبب/, 'changing the referrer needs a reason');
r = must(api('cand.referral', t.rec, { Application_ID: appA, Employee_ID: '1002', reason: 'اتضح إن هبة هي اللي بعتته' }), 'referrer corrected');
fresh(); ok(ctx.find_('REFERRALS', { Application_ID: appA, Status: 'Active' }).length === 1 && ctx.find_('REFERRALS', { Application_ID: appA, Status: 'Voided' }).length === 1, 'old referral voided, kept');
ok(ctx.get_('APPLICATIONS', appA).Referrer_Employee_ID === '1002', 'application shows the new referrer');
// a second application of the same person on the same vacancy is blocked anyway; another vacancy can't steal… (first-wins per vacancy)
// self referral
const selfR = api('cand.create', t.rec, Object.assign({ Full_Name: 'خالد محمود حسن', Mobile: '01033334444', Is_Employee: 'Y', Employee_ID: '1001', Referrer_Employee_ID: '1001' }, base));
bad(selfR, /نفسه/, 'self referral refused');

// ---- public application that names a referrer → needs confirmation, then influencing on a non-referral source
fresh(); const code = must(api('cand.applySettings', t.rec, { Vacancy_ID: vacId, Apply_Enabled: 'Y' }), 'apply on').code;
must(pub('apply.submit', { code, lang: 'ar', elapsed: 9000, consent: 'Y', consentVersion: '1', consentTransfer: 'Y', consentSalary: 'Y', Governorate: 'القاهرة', Education: 'BACHELOR', Experience_Years: '2',
  Full_Name: 'منى سعيد حسن', Mobile: '01055556666', src: 'WUZZUF', Referrer_Name: 'خالد' }), 'public apply');
fresh(); const appB = ctx.find_('APPLICATIONS', { Vacancy_ID: vacId }).find(a => a.Source === 'WUZZUF').Application_ID;
ok(ctx.get_('APPLICATIONS', appB).Owner_User_ID === U.rec, 'public application owned by the lead');
g = must(api('cand.app', t.rec2, { Application_ID: appB }), 'app B');
ok(!g.attr.referral && g.attr.typedReferrer === 'خالد', 'typed referrer waits for confirmation');
must(api('cand.referral', t.rec2, { Application_ID: appB, Employee_ID: '1001' }), 'confirm referrer');
fresh(); ref = ctx.find_('REFERRALS', { Application_ID: appB, Status: 'Active' })[0];
ok(ref.Kind === 'INFLUENCING' && ref.Bonus_Status === 'REVIEW', 'influencing referral → HR review');

// ---- agencies
let L = must(api('src.list', t.rm, {}), 'src list'); ok(Array.isArray(L.agencies) && !L.agencies.length, 'no agencies yet');
bad(api('agency.save', t.rec, { Name_AR: 'مكتب النيل' }), null, 'recruiter cannot add agencies');
bad(api('agency.save', t.rm, { Name_AR: 'مكتب النيل', Fee_Type: 'PERCENT_ANNUAL', Fee_Value: '150' }), /100/, 'percent over 100');
const ag1 = must(api('agency.save', t.rm, { Name_AR: 'مكتب النيل للتوظيف', Fee_Type: 'MONTHS_SALARY', Fee_Value: '1', Guarantee_Days: '90', Ownership_Days: '60',
  Replacement_Terms: 'بديل مجاني خلال الضمان', Phone: '٠١٢٣٤٥٦٧٨٩٠', Contract_URL: 'https://drive.google.com/x' }), 'agency 1');
const ag2 = must(api('agency.save', t.rm, { Name_AR: 'مكتب الدلتا', Fee_Type: 'FIXED', Fee_Value: '5000', Ownership_Days: '30' }), 'agency 2');
bad(api('agency.save', t.rm, { Name_AR: 'مكتب الدلتا' }), /بنفس الاسم/, 'duplicate agency');
ok(ag1.Phone === '01234567890' && ag1.Agency_ID === 'AGY-001', 'agency saved: ' + ag1.Agency_ID);
const ab = { Vacancy_ID: vacId, Source: 'AGENCY', consent: 'Y' };
bad(api('cand.create', t.rec, Object.assign({ Full_Name: 'سامح عادل فهمي', Mobile: '01077778888' }, ab)), /مكتب التوظيف/, 'agency source needs the agency');
r = must(api('cand.create', t.rec, Object.assign({ Full_Name: 'سامح عادل فهمي', Mobile: '01077778888', Agency_ID: ag1.Agency_ID }, ab)), 'agency candidate');
const appC = r.application.Application_ID, perC = r.person.Person_ID;
fresh(); let aC = ctx.get_('APPLICATIONS', appC);
ok(aC.Agency_ID === ag1.Agency_ID && JSON.parse(aC.Agency_Terms_JSON).feeType === 'MONTHS_SALARY' && aC.Ownership_Until > ctx.today_(), 'terms snapshot + ownership');
// terms change later does not touch the snapshot
must(api('agency.save', t.rm, Object.assign({}, ag1, { Fee_Value: '2', reason: 'عقد جديد' })), 'agency terms changed');
fresh(); ok(JSON.parse(ctx.get_('APPLICATIONS', appC).Agency_Terms_JSON).feeValue === '1', 'snapshot kept');
// another vacancy: second agency cannot submit the same person while the first owns him
const rq2 = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'طلب تاني للمكاتب', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'], Requested_HC: 1 }] }), 'request 2');
fresh(); const vac2 = ctx.find_('VACANCIES', { Request_ID: rq2.Request_ID })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: vac2, Lead_Recruiter_ID: U.rec }), 'assign 2'); must(api('vac.update', t.rm, { Vacancy_ID: vac2, action: 'OPEN' }), 'open 2');
bad(api('cand.create', t.rec, { Vacancy_ID: vac2, Source: 'AGENCY', Agency_ID: ag2.Agency_ID, usePersonId: perC }), /ملك مكتب النيل/, 'second agency blocked during ownership');
r = must(api('cand.create', t.rec, { Vacancy_ID: vac2, Source: 'WALK_IN', usePersonId: perC }), 'same person walks in');
ok(/مكتب النيل/.test(r.warning), 'walk-in warned about the agency ownership');
g = must(api('cand.app', t.rec, { Application_ID: r.application.Application_ID }), 'walk-in app');
ok(g.attr.otherAgency && g.attr.otherAgency.name === 'مكتب النيل للتوظيف' && g.attr.originalSource === 'مكتب توظيف', 'ownership + original source on the new application');
g = must(api('cand.app', t.rec, { Application_ID: appC }), 'agency app');
ok(g.attr.agency.live && g.attr.agency.terms.guaranteeDays === '90' && !g.attr.otherAgency, 'agency terms on its own application');
// hiring manager does not see attribution
fresh(); ctx.update_('APPLICATIONS', appC, { Stage: 'SHORTLISTED' }, 'x');
g = must(api('cand.app', t.acc, { Application_ID: appC }), 'manager view'); ok(!g.attr, 'no attribution / fees for the hiring manager');
fresh(); ctx.update_('APPLICATIONS', appC, { Stage: 'NEW' }, 'x');

// ---- source change with history
bad(api('cand.source', t.rec, { Application_ID: appB, Source: 'LINKEDIN' }), /سبب/, 'source change needs a reason');
must(api('cand.source', t.rec, { Application_ID: appB, Source: 'REFERRAL', reason: 'المرشح قال إن خالد بعتله اللينك' }), 'source → referral');
fresh(); ok(ctx.find_('REFERRALS', { Application_ID: appB, Status: 'Active' })[0].Kind === 'PRIMARY', 'referral becomes primary with the source');
ok(ctx.find_('ACTIVITIES', { Application_ID: appB }).some(x => /المصدر اتغير من Wuzzuf لـ ترشيح من موظف/.test(x.Note)), 'source history recorded');
ok(ctx.get_('APPLICATIONS', appB).Original_Source === 'WUZZUF', 'original source unchanged');

// ---- owner hand-over
bad(api('cand.owner', t.rec2, { Application_ID: appA, Owner_User_ID: U.rec2 }), /مسؤوله الحالي/, 'support recruiter cannot take it');
bad(api('cand.owner', t.rec, { Application_ID: appA, Owner_User_ID: U.rm }), /فريق الشاغر/, 'owner must be on the team');
must(api('cand.owner', t.rec, { Application_ID: appA, Owner_User_ID: U.rec2, reason: 'توزيع الشغل' }), 'hand over');
fresh(); ok(ctx.get_('APPLICATIONS', appA).Owner_User_ID === U.rec2 && ctx.find_('NOTIFICATIONS', { User_ID: U.rec2 }).some(n => /اتسلمت مرشح/.test(n.Title)), 'new owner told');
let tk = must(api('cand.tasks', t.rec2, {}), 'tasks rec2'); ok(tk.fresh.some(x => x.Application_ID === appA), 'new owner sees it in his tasks');
tk = must(api('cand.tasks', t.rec, {}), 'tasks rec'); ok(!tk.fresh.some(x => x.Application_ID === appA), 'previous owner no longer');
let pl = must(api('cand.pipeline', t.rec, { Vacancy_ID: vacId }), 'pipeline'); ok(pl.rows.find(x => x.Application_ID === appA).ownerName === 'علي', 'owner on the pipeline');
// support recruiter leaves the team → his candidates go to the lead
must(api('vac.assign', t.rm, { Vacancy_ID: vacId, Lead_Recruiter_ID: U.rec, recruiters: [], reason: 'علي اتنقل' }), 'team change');
fresh(); ok(ctx.get_('APPLICATIONS', appA).Owner_User_ID === U.rec, 'candidates of a removed recruiter go back to the lead');

// ---- lock after the outcome
must(api('cand.move', t.rec, { Application_ID: appA, to: 'REJECTED', reasonCode: 'EXPERIENCE' }), 'reject');
fresh(); ok(ctx.get_('APPLICATIONS', appA).Source_Locked_At && ctx.find_('REFERRALS', { Application_ID: appA, Status: 'Active' })[0].Locked_At, 'attribution locked');
bad(api('cand.referral', t.rec, { Application_ID: appA, Employee_ID: '1001', reason: 'تاني' }), /مقفول/, 'referral locked');
bad(api('cand.source', t.rec, { Application_ID: appA, Source: 'WALK_IN', reason: 'تاني' }), /مقفول/, 'source locked');
must(api('cand.move', t.rm, { Application_ID: appA, to: 'REOPEN', note: 'إعادة نظر' }), 'reopen');
bad(api('cand.source', t.rec, { Application_ID: appA, Source: 'WALK_IN', reason: 'تاني' }), /مقفول/, 'still locked after reopen');

// ---- referrals register & bonus
let RL = must(api('ref.list', t.rec, {}), 'ref list');
ok(RL.rows.length === 2 && RL.counts.PENDING === 1 && RL.counts.REVIEW === 1 && !RL.canDecide, 'register with counts (recruiter read-only)');
const refB = RL.rows.find(x => x.Application_ID === appB);
ok(refB.candidate === 'منى سعيد حسن' && refB.Employee_Name === 'خالد محمود' && /محاسب تكاليف/.test(refB.job), 'row details');
bad(api('ref.bonus', t.rec, { Referral_ID: refB.Referral_ID, Bonus_Status: 'ELIGIBLE', note: 'تمام' }), null, 'recruiter cannot decide the bonus');
bad(api('ref.bonus', t.hr, { Referral_ID: refB.Referral_ID, Bonus_Status: 'ELIGIBLE' }), /السبب/, 'decision needs a note');
must(api('ref.bonus', t.hr, { Referral_ID: refB.Referral_ID, Bonus_Status: 'NOT_ELIGIBLE', note: 'المرشح جه من Wuzzuf الأول' }), 'HR decides');
RL = must(api('ref.list', t.hr, { status: 'NOT_ELIGIBLE' }), 'filtered'); ok(RL.rows.length === 1 && RL.rows[0].bonusBy === 'منى' && RL.canDecide, 'decision recorded');

// ---- options for the screens
const co = must(api('cand.options', t.rec, {}), 'options');
ok(co.agencies.length === 2 && co.sourceKinds.REFERRAL === 'REFERRAL' && co.sourceKinds.AGENCY === 'AGENCY' && co.hasEmployees, 'options carry agencies and kinds');

// ---- migration of applications made before 0.9.0
fresh();
const old = ctx.insert_('APPLICATIONS', { Application_ID: 'APP-2026-09999', Person_ID: perC, Vacancy_ID: vacId, Channel: 'MANUAL', Source: 'WALK_IN', Sub_Source: '',
  Referrer_Name: 'هبة سامي', Referrer_Employee_ID: '1002', Applied_At: '2026-01-01T10:00:00', Stage: 'WITHDRAWN', Stage_At: '2026-01-05T10:00:00' }, 'x');
vm.runInContext("PropertiesService.getScriptProperties().setProperty('MIGRATE_090','')", ctx);
fresh(); ctx.migrate090_();
fresh(); const mo = ctx.get_('APPLICATIONS', 'APP-2026-09999');
ok(mo.Owner_User_ID === U.rec && mo.Original_Source === 'WALK_IN' && mo.Source_Locked_At === '2026-01-05T10:00:00', 'old application: owner, original source, lock');
ok(ctx.find_('REFERRALS', { Application_ID: 'APP-2026-09999' })[0].Bonus_Status === 'REVIEW', 'old typed referral → review record');
ok(ctx.get_('APPLICATIONS', appC).Original_Source === 'AGENCY', 'existing values untouched');

console.log('\n' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
