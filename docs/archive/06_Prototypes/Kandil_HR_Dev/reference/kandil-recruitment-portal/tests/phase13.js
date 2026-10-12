// Phase 5A (v0.13.0): selection decision, reference checks, salary structures, pay components, offer authority,
// offers (versions, approval routing, validity, presenting, answer), over-hiring check, daily expiry, hiring-manager view.
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
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), sec: user('sec@t.com', 'محمد HR', '', ['HR_SECTOR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), sup: user('sup@t.com', 'مشرف التوظيف', '', ['RECRUITMENT_SUPERVISOR']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), sec: login('sec@t.com'), rm: login('rm@t.com'), sup: login('sup@t.com'), rec: login('rec@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 1 }] }), 'request');
const reqId = rq.Request_ID;
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: reqId })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
function cand(name, mobile, email, extra) { const a = must(api('cand.create', t.rec, Object.assign({ Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Email: email || '', Source: 'WALK_IN', consent: 'Y' }, extra || {})), 'cand').application.Application_ID; must(api('cand.move', t.rec, { Application_ID: a, to: 'SHORTLISTED' }), 'shortlist'); return a; }
const A1 = cand('أحمد علي حسن', '01011112222', 'ahmed@example.com', { Current_Salary: '5500', Expected_Salary: '9000' }), A2 = cand('كريم محمود سالم', '01033334444'), A3 = cand('هالة سمير علي', '01044445555');
fresh(); const LOC = ctx.all_('LOCATIONS')[0].Location_ID, today = ctx.today_();
// one interview each → stage INTERVIEW
for (const A of [A1, A2, A3]) {
  const iv = must(api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'iv').interview;
  must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }), 'start');
}

// =============== pay structures, components, authority ===============
bad(api('pay.admin', t.rec, {}), null, 'recruiters do not see the salary structures');
let PA = must(api('pay.admin', t.rm, {}), 'pay admin (view)');
ok(!PA.canEdit && PA.structures.length === 15 && PA.components.length === 10 && PA.authority.length === 5 && PA.extra.allowances.length === 15 && PA.extra.rates.length > 80, 'grades, 10 pay items, 5 authority rows, allowance table + job-nature rates loaded');
ok(PA.authority[0].Role_Code === 'RECRUITER' && PA.authority[0].Limit_Point === 'MIN' && PA.authority[3].Limit_Point === 'ANY', 'authority seeded: recruiter = minimum … HR manager = open');
bad(api('pay.structures', t.hr, { rows: [{ grade: '7', min: '6000', max: '10000' }], reason: 'x' }), null, 'only the HR Sector Manager / owner set salaries');
bad(api('pay.structures', t.sec, { rows: [{ grade: '7', min: '10000', max: '6000' }], reason: 'هيكل 2026' }), /الأدنى/, 'min ≤ mid ≤ max');
must(api('pay.structures', t.sec, { rows: [{ grade: '7', min: '6000', mid: '8000', max: '10000' }, { grade: '8', min: '٩٠٠٠', max: '14,000' }], reason: 'هيكل 2026' }), 'structures saved (Arabic digits, commas)');
PA = must(api('pay.admin', t.sec, {}), 'pay admin');
const g7 = PA.structures.find(s => s.grade === '7'), g8 = PA.structures.find(s => s.grade === '8');
ok(g7.current.Min === '6000' && g7.current.Version === '1' && g8.current.Mid === '11500' && PA.canEdit, 'versions + midpoint filled when blank');
must(api('pay.structures', t.sec, { rows: [{ grade: '7', min: '6000', mid: '8000', max: '10000' }], reason: 'نفس الأرقام' }), 'no change');
fresh(); ok(ctx.find_('SALARY_STRUCTURES', { Grade_Code: '7' }).length === 1, 'unchanged grade gets no new version');
bad(api('pay.authority', t.sec, { rows: [{ Role_Code: 'RECRUITER', Limit_Point: 'MIN' }], reason: 'تجربة' }), /مفتوح/, 'the matrix keeps an open (above maximum) role');
must(api('pay.component', t.sec, { Component_Code: 'mobile_allow', Name_AR: 'بدل موبايل', Kind: 'FIXED', Show_On_Offer: 'N', Sort_Order: 65 }), 'new component');
bad(api('pay.component', t.sec, { Component_Code: 'X2', Name_AR: 'أساسي تاني', Kind: 'BASIC' }), /أساسي واحد/, 'one basic only');

// =============== selection ===============
bad(api('sel.save', t.rec, { Application_ID: A1, Decision: 'SELECTED', Reason: 'أفضل المرشحين' }), /جاهز للقرار/, 'not ready → selection needs a justification');
bad(api('sel.save', t.mgr, { Application_ID: A1, Decision: 'REJECTED', Reason: 'مش مناسب' }), /لفريق التوظيف/, 'hiring manager cannot reject from here');
let S1 = must(api('sel.save', t.mgr, { Application_ID: A1, Decision: 'SELECTED', Reason: 'خبرة SAP وتكاليف', Override_Reason: 'المقابلة الفنية اتعملت مع المدير شفهياً', Conditions: 'يستلم أول الشهر' }), 'hiring manager selects (with justification)');
fresh(); ok(ctx.get_('APPLICATIONS', A1).Stage === 'OFFER' && JSON.parse(S1.selection.Snapshot_JSON).readiness === 'NOT_READY', 'selected → stage «offer», snapshot of readiness kept');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /قرار اختيار: مختار/.test(n.Title)), 'recruiter told about the selection');
bad(api('cand.move', t.rec, { Application_ID: A2, to: 'OFFER' }), /بقرار «مختار»/, 'no manual move into the offer stage');
bad(api('cand.move', t.rec, { Application_ID: A1, to: 'ON_HOLD', note: 'استنى' }), /مرحلة العرض/, 'no hold while in the offer stage');
must(api('sel.save', t.rec, { Application_ID: A2, Decision: 'RESERVE', Reason: 'كويس جداً — احتياطي' }), 'reserve');
let AP2 = must(api('cand.app', t.rec, { Application_ID: A2 }), 'app 2');
ok(AP2.offer.selection.Decision === 'RESERVE' && AP2.app.Stage === 'INTERVIEW', 'reserve stays in the interview stage');
let PL = must(api('cand.pipeline', t.rec, { Vacancy_ID: VAC }), 'pipeline');
ok(PL.rows.find(r => r.Application_ID === A2).sel === 'RESERVE' && PL.rows.find(r => r.Application_ID === A1).Stage === 'OFFER', 'pipeline shows decisions and the offer stage');

// =============== references ===============
bad(api('ref.save', t.rec, { Application_ID: A1, Referee_Name: 'أستاذ سمير' }), /موافقة المرشح/, 'consent before calling a referee');
const R1 = must(api('ref.save', t.rec, { Application_ID: A1, Referee_Name: 'أستاذ سمير', Referee_Company: 'شركة النور', Consent: 'Y' }), 'reference added');
bad(api('ref.save', t.rec, { Application_ID: A1, Reference_ID: R1.Reference_ID, Referee_Name: 'أستاذ سمير', Consent: 'Y', Result: 'POSITIVE' }), /اللي قاله/, 'result needs notes');
must(api('ref.save', t.rec, { Application_ID: A1, Reference_ID: R1.Reference_ID, Referee_Name: 'أستاذ سمير', Consent: 'Y', Result: 'POSITIVE', Notes: 'ملتزم ودقيق في الشغل' }), 'reference result');

// =============== offer: setup, draft, self-approval ===============
let SU = must(api('offer.setup', t.rec, { Application_ID: A1 }), 'offer setup');
ok(SU.grade === '7' && SU.range.min === 6000 && SU.range.max === 10000 && SU.manual.some(c => c.code === 'MOBILE_ALLOW') && SU.jobNature && SU.zone === 'OTHER' && SU.collar === 'B' && SU.current === '5500' && SU.room.left === 1, 'setup: grade range, manual items, job nature, zone, collar, salary trail, room');
bad(api('offer.save', t.rec, { Application_ID: A2, Contract_Basis: 'GROSS', Agreed_Amount: '6000' }), /مختار/, 'offer only for a selected candidate');
bad(api('offer.save', t.rec, { Application_ID: A1, Contract_Basis: 'GROSS', Agreed_Amount: '3000' }), /أقل من مجموع البدلات/, 'agreed total below the allowances');
let O = must(api('offer.save', t.rec, { Application_ID: A1, Contract_Basis: 'GROSS', Agreed_Amount: '5,800', Joining_Date: '2099-02-01', Terms: 'فترة اختبار 3 شهور' }), 'draft').offer;
ok(O.Status === 'DRAFT' && O.Fixed_Package === '5800' && O.Basic === '2600' && O.Initial_Proposed === '5800' && O.Required_Role === 'RECRUITER' && O.Current_Salary === '5500' && O.Contrib_Wage === '5500' && O.Comprehensive_Wage === '7000', 'basic = total − allowances (3200), recruiter level, trail, insurance wages');
bad(api('offer.save', t.rec, { Application_ID: A1, Contract_Basis: 'GROSS', Agreed_Amount: '5000' }), /عرض شغال/, 'one live offer per candidate');
O = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'SUBMIT' }), 'submit within own limit').offer;
ok(O.Status === 'APPROVED' && O.approverName === 'سارة', 'within the recruiter\'s limit → approved by himself');
// negotiation → V2 above the supervisor, routed to the recruitment manager
let N = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'NEGOTIATE', note: 'طالب 9000 إجمالي' }), 'negotiate');
ok(N.offer.Status === 'SUPERSEDED' && N.newOffer.Version === '2' && N.newOffer.Status === 'DRAFT' && N.newOffer.Offer_No === O.Offer_No, 'V1 kept, V2 draft in the same series');
let O2 = must(api('offer.save', t.rec, { Application_ID: A1, Offer_ID: N.newOffer.Offer_ID, Agreed_Amount: '9000' }), 'edit V2').offer;
ok(O2.Required_Role === 'RECRUITMENT_MANAGER' && O2.Fixed_Package === '9000' && O2.Initial_Proposed === '5800', '9000 > midpoint → recruitment manager; initial proposed kept from V1');
O2 = must(api('offer.action', t.rec, { Offer_ID: O2.Offer_ID, action: 'SUBMIT' }), 'submit V2').offer;
ok(O2.Status === 'PENDING_APPROVAL', 'pending approval');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rm }).some(n => /مستني موافقتك/.test(n.Title)) && !ctx.find_('NOTIFICATIONS', { User_ID: U.sup }).some(n => /مستني موافقتك/.test(n.Title)), 'the lowest sufficient authority is asked (not the supervisor)');
bad(api('offer.action', t.sup, { Offer_ID: O2.Offer_ID, action: 'APPROVE' }), /صلاحية/, 'supervisor cannot approve above the midpoint');
ok(must(api('offer.list', t.rm, { tab: 'approve' }), 'approve list').rows.length === 1 && must(api('me', t.rm, {}), 'me').todo.offer.approve === 1, 'approver sees it in his list and home');
bad(api('offer.action', t.rm, { Offer_ID: O2.Offer_ID, action: 'RETURN' }), /المطلوب تعديله/, 'return needs a note');
O2 = must(api('offer.action', t.rm, { Offer_ID: O2.Offer_ID, action: 'RETURN', note: 'خلي البدل 300 بس' }), 'returned').offer;
O2 = must(api('offer.save', t.rec, { Application_ID: A1, Offer_ID: O2.Offer_ID, Contract_Basis: 'GROSS', Agreed_Amount: '9000', Other_Allowance: '300', extra: { MOBILE_ALLOW: '200' } }), 'fix').offer;
O2 = must(api('offer.action', t.rec, { Offer_ID: O2.Offer_ID, action: 'SUBMIT' }), 'resubmit').offer;
O2 = must(api('offer.action', t.rm, { Offer_ID: O2.Offer_ID, action: 'APPROVE', note: 'موافق' }), 'approve').offer;
ok(O2.Status === 'APPROVED' && O2.approverName === 'مدير التوظيف', 'approved by the recruitment manager');
// the letter
const LT = must(api('offer.letter', t.rec, { Offer_ID: O2.Offer_ID }), 'letter'); if (process.env.DBG) console.log(LT.html);
ok(/5,300/.test(LT.html) && /بدلات أخرى/.test(LT.html) && !/بدل موبايل/.test(LT.html) && /8,800/.test(LT.html) && /2099-02-01/.test(LT.html), 'letter: shown items only, their total, joining date');
// hiring manager view: no money
const AM = must(api('cand.app', t.mgr, { Application_ID: A1 }), 'manager app');
ok(AM.offer.offers.length === 2 && AM.offer.offers[0].Fixed_Package === undefined && !AM.offer.references, 'hiring manager sees the offer status, never the salary or references');
// present by email, accept with evidence
mails.length = 0;
O2 = must(api('offer.action', t.rec, { Offer_ID: O2.Offer_ID, action: 'PRESENT', via: 'EMAIL' }), 'present by email').offer;
ok(O2.Status === 'PRESENTED' && mails.length === 1 && mails[0].to === 'ahmed@example.com' && /عرض وظيفي/.test(mails[0].subject), 'offer letter emailed to the candidate');
bad(api('offer.action', t.rec, { Offer_ID: O2.Offer_ID, action: 'ACCEPT' }), /أكّد القبول/, 'acceptance needs how it was confirmed');
const pdf = Buffer.from('%PDF-1.4 signed').toString('base64');
O2 = must(api('offer.action', t.rec, { Offer_ID: O2.Offer_ID, action: 'ACCEPT', note: 'وقّع على النسخة المطبوعة', Joining_Date: '2099-02-05', files: [{ name: 'signed.pdf', mime: 'application/pdf', data: pdf }] }), 'accept').offer;
fresh(); const a1 = ctx.get_('APPLICATIONS', A1), o2row = ctx.get_('OFFERS', O2.Offer_ID);
ok(a1.Stage === 'ACCEPTED' && o2row.Final_Accepted === '9000' && o2row.Approved_Package === '9000' && o2row.Initial_Proposed === '5800' && o2row.Joining_Date === '2099-02-05' && JSON.parse(o2row.Evidence_JSON).length === 1, 'accepted: stage, salary trail (initial / approved / final), joining date, signed copy');
ok(!!a1.Source_Locked_At, 'source locked once the outcome is known');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.mgr }).some(n => /قبل العرض/.test(n.Title)), 'hiring manager told the candidate accepted');
ok(must(api('offer.file', t.rec, { Offer_ID: O2.Offer_ID, File_ID: O2.files[0].id }), 'file').name === 'signed.pdf', 'signed copy opens');
bad(api('cand.move', t.rec, { Application_ID: A1, to: 'INTERVIEW', note: 'رجوع' }), /قبل العرض/, 'accepted candidate cannot be moved back');

// =============== over-hiring check + decline + reserve ===============
must(api('sel.save', t.rec, { Application_ID: A2, Decision: 'SELECTED', Reason: 'احتياطي بقى مختار', Override_Reason: 'المدير وافق تليفونياً', confirmOver: 'Y' }), 'select A2 beyond the HC');
let O3 = must(api('offer.save', t.rec, { Application_ID: A2, Contract_Basis: 'GROSS', Agreed_Amount: '6000' }), 'offer A2').offer;
bad(api('offer.action', t.rec, { Offer_ID: O3.Offer_ID, action: 'SUBMIT' }), /عدد متاح/, 'vacancy full (1 accepted) → recruiter blocked');
const NO = must(api('offer.action', t.rm, { Offer_ID: O3.Offer_ID, action: 'SUBMIT' }), 'override asked');
ok(NO.needOverride && NO.room.accepted === 1 && NO.room.left === 0, 'manager is asked for the override reason');
O3 = must(api('offer.action', t.rm, { Offer_ID: O3.Offer_ID, action: 'SUBMIT', hcOverride: 'محتاجين اتنين مؤقتاً لحد ما واحد يتنقل' }), 'override').offer;
ok(O3.Status === 'APPROVED' && /مؤقتاً/.test(O3.HC_Override), 'override recorded; within the manager\'s limit → approved');
must(api('sel.save', t.rec, { Application_ID: A3, Decision: 'RESERVE', Reason: 'احتياطي تاني' }), 'reserve A3');
bad(api('offer.action', t.rec, { Offer_ID: O3.Offer_ID, action: 'DECLINE' }), /سبب رفض/, 'decline needs a reason');
const D = must(api('offer.action', t.rec, { Offer_ID: O3.Offer_ID, action: 'DECLINE', reason: 'COUNTEROFFER', note: 'شركته زودته 2000' }), 'declined');
ok(D.offer.Status === 'DECLINED' && D.reserve === 1, 'declined; the team is reminded of the reserve candidate');
// expiry and extension
const O4 = must(api('offer.save', t.rec, { Application_ID: A2, Contract_Basis: 'GROSS', Agreed_Amount: '6000', Valid_Until: today }), 'new offer after a decline').offer;
ok(O4.Version === '1' && O4.Offer_No !== O3.Offer_No, 'a new series after a closed offer');
must(api('offer.action', t.rm, { Offer_ID: O4.Offer_ID, action: 'SUBMIT', hcOverride: 'لسه محتاجين اتنين' }), 'submit O4');
fresh(); ctx.update_('OFFERS', O4.Offer_ID, { Valid_Until: '2000-01-01' }, 'x');
fresh(); const dd = ctx.offerDaily_();
fresh(); ok(dd.expired === 1 && ctx.get_('OFFERS', O4.Offer_ID).Status === 'EXPIRED', 'daily job expires an offer past its date');
bad(api('offer.action', t.rec, { Offer_ID: O4.Offer_ID, action: 'EXTEND', Valid_Until: '2099-01-01', note: 'المرشح مسافر' }), /لمديري التوظيف/, 'recruiters cannot extend');
const EX = must(api('offer.action', t.rm, { Offer_ID: O4.Offer_ID, action: 'EXTEND', Valid_Until: '2099-01-01', note: 'المرشح مسافر لحد آخر الشهر' }), 'extend').offer;
ok(EX.Status === 'APPROVED' && EX.Valid_Until === '2099-01-01' && /2000-01-01 ← 2099-01-01/.test(EX.Extended_Note), 'extension brings it back, audited with the old date');
// closing the candidate withdraws the live offer
must(api('cand.move', t.rec, { Application_ID: A2, to: 'WITHDRAWN', reasonCode: 'OTHER_OFFER', note: 'قبل في مكان تاني' }), 'withdraw candidate');
fresh(); ok(ctx.get_('OFFERS', O4.Offer_ID).Status === 'WITHDRAWN', 'closing the candidate withdraws the live offer');
// above the maximum needs a justification, and goes to HR
must(api('sel.save', t.rec, { Application_ID: A3, Decision: 'SELECTED', Reason: 'آخر مرشح', Override_Reason: 'تقييم شفهي', confirmOver: 'Y' }), 'select A3');
const O5 = must(api('offer.save', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '12000' }), 'high offer').offer;
ok(O5.Required_Role === 'HR_MANAGER', 'above the maximum → HR manager');
bad(api('offer.action', t.rm, { Offer_ID: O5.Offer_ID, action: 'SUBMIT', hcOverride: 'استثناء' }), /مبرر الاستثناء/, 'above the maximum needs a justification');
must(api('offer.save', t.rec, { Application_ID: A3, Offer_ID: O5.Offer_ID, Contract_Basis: 'GROSS', Agreed_Amount: '12000', Justification: 'خبرة نادرة في أنظمة التكاليف' }), 'justified');
const O5b = must(api('offer.action', t.rm, { Offer_ID: O5.Offer_ID, action: 'SUBMIT', hcOverride: 'استثناء مؤقت' }), 'submit above max').offer;
ok(O5b.Status === 'PENDING_APPROVAL', 'pending HR');
must(api('offer.action', t.sec, { Offer_ID: O5.Offer_ID, action: 'APPROVE' }), 'a higher role may approve too');
must(api('offer.action', t.rec, { Offer_ID: O5.Offer_ID, action: 'WITHDRAWN' === 'x' ? 'x' : 'WITHDRAW', note: 'الإدارة لغت التعيين' }), 'withdraw offer');
fresh(); ok(ctx.get_('OFFERS', O5.Offer_ID).Status === 'WITHDRAWN', 'withdrawn');
const OL = must(api('offer.list', t.rec, { tab: 'closed' }), 'closed list');
ok(OL.rows.length >= 4 && OL.rows.every(r => r.name), 'closed offers listed with names');
fresh(); ok(ctx.find_('AUDIT_LOG', {}).some(x => x.Entity_Type === 'OFFER' && x.Action === 'EXTEND'), 'offer actions audited');

// =============== v0.13.1: package rules — net contracts, job nature, zones, temporary transport, tables, rules, incentive ===============
must(api('sel.save', t.rec, { Application_ID: A3, Decision: 'SELECTED', Reason: 'تاني مرة', Override_Reason: 'تقييم شفهي', confirmOver: 'Y' }), 're-select A3');
let PV = must(api('offer.preview', t.rec, { Application_ID: A3, Contract_Basis: 'NET', Agreed_Amount: '13595.5' }), 'net preview');
ok(PV.full === 15000 && PV.netAllowance === 1404.5 && PV.basic === 10395.5 && PV.pay.net === 13595.5 && PV.pay.contrib === 9000 && PV.pay.insurance === 990 && PV.pay.tax === 414.5 && PV.comps.some(c => c.c === 'NET_ALLOWANCE'), 'net contract: gross found, difference in Net allowance (15,000 → 13,595.50 net)');
PV = must(api('offer.preview', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '8000' }), 'low wage');
ok(PV.pay.contrib === 5500 && PV.pay.comprehensive === 7000 && PV.pay.insurance === 605 && PV.pay.tax === 146.75, 'contribution wage floor 5,500; comprehensive topped up to 7,000');
const rate = PA.extra.rates.find(r => r.Department === 'السبك');
PV = must(api('offer.preview', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '9000', Job_Nature_Rate_ID: rate.Rate_ID }), 'job nature');
ok(PV.comps.find(c => c.c === 'JOB_NATURE').a === '500' && PV.basic === 9000 - 3200 - 500, 'job-nature allowance by department (السبك = 500)');
fresh(); const LOC0 = ctx.get_('VACANCIES', VAC).Location_ID;
must(api('pay.zones', t.sec, { zones: { [LOC0]: 'INSHAS' } }), 'zone → Inshas');
PV = must(api('offer.preview', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '9000' }), 'inshas');
ok(PV.comps.find(c => c.c === 'TRANSPORT').a === '800', 'Inshas zone takes the first transport column only');
bad(api('pay.temp', t.sec, { Location_ID: LOC0, Amount: '300', From_Date: today }), /القرار/, 'temporary transport needs the decision');
must(api('pay.temp', t.sec, { Location_ID: LOC0, Amount: '300', From_Date: today, To_Date: '2099-12-31', Reason: 'قرار مؤقت لبعد الموقع' }), 'temporary transport');
PV = must(api('offer.preview', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '9000' }), 'temp');
ok(PV.comps.find(c => c.c === 'TRANSPORT').a === '1100', 'temporary transport added for the location');
must(api('pay.allowances', t.sec, { rows: [{ grade: '7', collar: 'B', inshas: '900', otherAdd: '400', meal: '1100', phone: '200', col: '800', jn: 'Y' }], reason: 'زيادة 2027', from: today }), 'allowance table v2');
PV = must(api('offer.preview', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '9000' }), 'v2');
ok(PV.comps.find(c => c.c === 'MEAL').a === '1100' && PV.comps.find(c => c.c === 'TRANSPORT').a === '1200', 'new version of the allowance table applies');
bad(api('pay.rules', t.rm, { values: { PAY_CONTRIB_RATIO: '70' }, reason: 'تجربة' }), null, 'only the HR Sector Manager changes the payroll rules');
bad(api('pay.rules', t.sec, { values: { PAY_TAX_BRACKETS: '[1,2' }, reason: 'تجربة' }), /الشرائح/, 'brackets validated');
must(api('pay.rules', t.sec, { values: { PAY_CONTRIB_RATIO: '70', PAY_CONTRIB_MAX: '17000' }, reason: 'قواعد 2027' }), 'rules');
ok(must(api('pay.preview', t.rm, { full: '15000' }), 'calc').contrib === 10500, 'ratio change applies (15,000 × 70% = 10,500)');
must(api('pay.jobs', t.sec, { jobs: [{ Job_Code: JOB, Collar: 'W', Job_Nature: 'N' }] }), 'job class');
ok(!must(api('offer.setup', t.rec, { Application_ID: A3 }), 'setup').jobNature, 'job override: no job nature');
bad(api('offer.save', t.rec, { Application_ID: A3, Contract_Basis: 'GROSS', Agreed_Amount: '9000', Incentive_Amount: '1000', Incentive_Terms: 'حسب التارجت الشهري' }), /مدير قطاع/, 'incentive is the HR Sector Manager\'s decision');
const O6 = must(api('offer.save', t.sec, { Application_ID: A3, Contract_Basis: 'NET', Agreed_Amount: '7000', Incentive_Amount: '1000', Incentive_Terms: 'حسب التارجت الشهري وتقييم المدير' }), 'incentive by HR sector').offer;
ok(O6.Incentive_Amount === '1000' && O6.Contract_Basis === 'NET' && O6.Net_Salary === '7000' || Number(O6.Net_Salary) >= 7000, 'net offer with an incentive saved');
must(api('offer.save', t.rec, { Application_ID: A3, Offer_ID: O6.Offer_ID, Agreed_Amount: '7200' }), 'recruiter edits the package, incentive untouched');
const INC = must(api('offer.incentive', t.rec, { Offer_ID: O6.Offer_ID }), 'incentive sheet');
ok(/1,000/.test(INC.html) && /التارجت/.test(INC.html), 'separate incentive sheet');
const O6v = must(api('cand.app', t.rec, { Application_ID: A3 }), 'app').offer.offers[0];
ok(O6v.Agreed_Amount === '7200' && O6v.inputs.Contract_Basis === 'NET', 'inputs kept for editing');

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;
