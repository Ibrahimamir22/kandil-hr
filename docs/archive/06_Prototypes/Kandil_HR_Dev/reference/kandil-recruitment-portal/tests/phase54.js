// v0.50.0: CHG-107 the working hours and weekly rest agreed on the offer (defaults from the settings), printed in the contract and
// the salary details; CHG-108 the usage policy says the devices an account signs in from are recorded. Setup from phase52.
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
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), ceo: login('ceo@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 6 }] }), 'request');
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

// ---- defaults, and the values agreed on an offer
const H0 = hire('مينا سمير فؤاد', '01022223333', 'M');
ok(H0.O.Work_Hours === 8 && H0.O.Weekly_Rest === 'FRI' && H0.O.weeklyRestName === 'الجمعة', 'a new offer starts with the settings: 8 hours, Friday');
const setup = must(api('offer.setup', t.rec, { Application_ID: H0.A }), 'setup');
ok(setup.weeklyRests.ROSTER && setup.workDefaults.hours === 8, 'the editor gets the choices and the defaults');
const base = { Application_ID: H0.A, Offer_ID: H0.O.Offer_ID, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01' };
bad(api('offer.save', t.rec, Object.assign({}, base, { Work_Hours: '13' })), /من 1 لـ 12/, 'more than 12 hours refused');
bad(api('offer.save', t.rec, Object.assign({}, base, { Work_Hours: '8.3' })), /من 1 لـ 12/, 'only whole or half hours');
bad(api('offer.save', t.rec, Object.assign({}, base, { Weekly_Rest: 'SUN' })), /الراحة الأسبوعية/, 'an unknown weekly rest refused');
const H = hire('أحمد علي حسن', '01011112222', 'M', { Work_Hours: '9', Weekly_Rest: 'SAT' });
ok(H.O.Work_Hours === 9 && H.O.Weekly_Rest === 'SAT', 'agreed on the offer: 9 hours, Saturday');
fresh(); ok(ctx.get_('OFFERS', H.O.Offer_ID).Work_Hours === '9' && ctx.get_('OFFERS', H.O.Offer_ID).Weekly_Rest === 'SAT', 'stored on the offer');
let O = must(api('offer.action', t.rm, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT', hcOverride: 'للاختبار' }), 'submit').offer;
O = accept(O);
const J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
fresh(); ctx.__nidForJoining(J.Joining_ID);
// the short contract and the salary details
ok(/9 ساعات يومياً — الراحة: السبت/.test(must(api('join.contract', t.rec, { Joining_ID: J.Joining_ID }), 'short contract').html), 'the contract states 9 hours and Saturday');
const D = must(api('join.payDetails', t.rm, { Joining_ID: J.Joining_ID }), 'salary details');
ok(/ساعات العمل 9 ساعات يومياً، والراحة الأسبوعية السبت/.test(D.html) && !/8 ساعات/.test(D.html), 'the salary details state them instead of the fixed text');
// the fixed-term contract
fresh(); ctx.update_('RECRUITMENT_REQUESTS', ctx.get_('VACANCIES', VAC).Request_ID, { Employment_Type: 'CONTRACT' }, 'x'); ctx.update_('CONFIG', 'PAY_DAY', { Config_Value: '5' }, 'x');
must(api('privacy.entity', tO, { Name_AR: 'شركة قنديل للنجف', Commercial_Reg: '12345', Tax_ID: '987', Address: 'العبور — المنطقة الصناعية', Signatory_Name: 'محمد عمارة', Signatory_Title: 'مدير قطاع الموارد البشرية', units: ctx.all_('ORG_UNITS').map(u => u.Org_Unit_ID) }), 'entity');
must(api('join.contractData', t.rec, { Joining_ID: J.Joining_ID, Residence_Address: '12 شارع النصر — مدينة نصر — القاهرة' }), 'address');
const K = must(api('join.contract', t.rec, { Joining_ID: J.Joining_ID }), 'fixed-term contract');
ok(/ساعات العمل الفعلية <b>9 ساعات<\/b> يومياً، والراحة الأسبوعية <b>السبت<\/b> مدفوعة الأجر/.test(K.html), 'the fixed-term contract states them in clause 10');
// an offer saved before v0.50.0 (no values) prints the defaults
fresh(); ctx.update_('OFFERS', O.Offer_ID, { Work_Hours: '', Weekly_Rest: '' }, 'x'); ctx.update_('CONFIG', 'WORK_HOURS_DEFAULT', { Config_Value: '7.5' }, 'x'); ctx.update_('CONFIG', 'WEEKLY_REST_DEFAULT', { Config_Value: 'ROSTER' }, 'x');
ok(/7.5 ساعات يومياً، والراحة الأسبوعية يوم في الأسبوع حسب جدول الورديات/.test(must(api('join.payDetails', t.rm, { Joining_ID: J.Joining_ID }), 'details old').html), 'an older offer prints the settings\' defaults');

// ---- CHG-108: the usage policy
fresh(); ok(/الأجهزة اللي حسابك بيدخل منها/.test(ctx.get_('CONFIG', 'USAGE_POLICY_AR').Config_Value) && /devices your account signs in from/.test(ctx.get_('CONFIG', 'USAGE_POLICY_EN').Config_Value), 'a fresh install has the device sentence');
const oldAR = vm.runInContext('USAGE_POLICY_AR_0451_', ctx), oldEN = vm.runInContext('USAGE_POLICY_EN_0451_', ctx);
fresh(); ctx.withLock_(() => { ctx.update_('CONFIG', 'USAGE_POLICY_AR', { Config_Value: oldAR }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_EN', { Config_Value: oldEN }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: '2' }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'Y' }, 'x');
  ctx.update_('USERS', U.mgr, { Policy_Accepted_At: '2026-10-10T10:00:00', Policy_Version: '2' }, 'x'); });
fresh(); ok(!ctx.policyNeeded_(ctx.get_('USERS', U.mgr)), 'before: the manager accepted version 2');
delete props.MIG_0500; fresh(); ctx.migrate0500_();
fresh(); ok(/الأجهزة اللي حسابك بيدخل منها/.test(ctx.get_('CONFIG', 'USAGE_POLICY_AR').Config_Value) && ctx.get_('CONFIG', 'USAGE_POLICY_VERSION').Config_Value === '3' && ctx.policyNeeded_(ctx.get_('USERS', U.mgr)), 'the default text updated, version 3, accepted again');
fresh(); ctx.withLock_(() => { ctx.update_('CONFIG', 'USAGE_POLICY_AR', { Config_Value: 'سياسة كتبها المالك' }, 'x'); ctx.update_('CONFIG', 'USAGE_POLICY_VERSION', { Config_Value: '7' }, 'x'); });
delete props.MIG_0500; fresh(); ctx.migrate0500_();
fresh(); ok(ctx.get_('CONFIG', 'USAGE_POLICY_AR').Config_Value === 'سياسة كتبها المالك' && ctx.get_('CONFIG', 'USAGE_POLICY_VERSION').Config_Value === '7', 'a policy the owner wrote is left as it is');

console.log('\nPhase 54 (working hours, weekly rest, policy): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
