// v0.48.0 (CHG-102): «مفردات الراتب عند بداية التعيين» — the actual pay in detail, company copy only, candidate signs as seen;
// pay-view roles only, every print logged, terms from the settings. Setup from phase51.
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

const H = hire('أحمد علي حسن', '01011112222', 'M');
let O = must(api('offer.action', t.rm, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT', hcOverride: 'للاختبار' }), 'submit').offer;
O = accept(O);
let J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
fresh(); const Of = ctx.get_('OFFERS', O.Offer_ID), lines = ctx.payLines_(Of);
ok(lines.length >= 1 && lines.every(l => l.name && l.amount > 0), 'the offer has named pay lines: ' + lines.map(l => l.name + '=' + l.amount).join(', '));

// ---- who may print
ok(J.canPayDetails === false, 'the recruiter does not get the button');
bad(api('join.payDetails', t.rec, { Joining_ID: J.Joining_ID }), null, 'a recruiter cannot print it');
bad(api('join.payDetails', t.mgr, { Joining_ID: J.Joining_ID }), null, 'nor the hiring manager');
ok(must(api('cand.app', t.rm, { Application_ID: H.A }), 'app rm').joining.canPayDetails === true, 'the recruitment manager (pay view) gets the button');
const D = must(api('join.payDetails', t.rm, { Joining_ID: J.Joining_ID }), 'salary details');

// ---- what it says
ok(D.theme === true && /class="pr pd"/.test(D.html) && /pr-head/.test(D.html) && /pr-foot/.test(D.html), 'in the portal print theme');
ok(/مفردات الراتب عند بداية التعيين/.test(D.html) && /نسخة الشركة فقط — سري/.test(D.html), 'title, company copy only, confidential');
ok(lines.filter(l => l.kind !== 'VARIABLE').every(l => D.html.includes(l.name) && D.html.includes(ctx.money0_(l.amount))), 'every fixed pay line with its amount');
const gross = Number(Of.Final_Accepted || Of.Fixed_Package);
ok(D.html.includes(ctx.money0_(gross)) && D.html.includes(ctx.money0_(Of.Contrib_Wage)) && D.html.includes(ctx.money0_(Of.Net_Salary)) && D.html.includes(ctx.money0_(Of.Income_Tax)), 'gross, contribution wage, tax and net');
ok(/لم يراجعه مشرف الرواتب بعد/.test(D.html), 'the net marked as not yet reviewed');
ok(/أقر بأنني اطلعت على مفردات راتبي/.test(D.html) && D.html.includes('أحمد علي حسن') && /مدير التوظيف/.test(D.html), 'the candidate signs as seen; prepared by the printer');
ok(/خلال 7 أيام/.test(D.html) && /دون حجب أجر مستحق/.test(D.html) && /90 يوماً/.test(D.html) && !/30 يوم/.test(D.html), 'the default terms: 7 days, no pay withheld, 90-day probation, no 30-day resignation');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_ID === J.Joining_ID && a.Action === 'PRINT_PAY_DETAILS'), 'every print logged');

// ---- the terms come from the settings
fresh(); ctx.update_('CONFIG', 'PAY_DETAILS_TERMS', { Config_Value: 'شرط أول للاختبار\nيُصرف الأجر يوم {pay_day} — الاختبار {probation_days} يوماً' }, 'x'); ctx.update_('CONFIG', 'PAY_DAY', { Config_Value: '5' }, 'x');
ctx.update_('CONFIG', 'HR_HEAD_NAME', { Config_Value: 'منى السيد' }, 'x');
const D2 = must(api('join.payDetails', tO, { Joining_ID: J.Joining_ID }), 'details 2');
ok(/شرط أول للاختبار/.test(D2.html) && /يُصرف الأجر يوم 5 — الاختبار 90 يوماً/.test(D2.html) && !/خلال 7 أيام/.test(D2.html), 'terms edited in the settings, placeholders filled');
ok(/رئيس الموارد البشرية: منى السيد/.test(D2.html), 'the approving head of HR from the settings');

// ---- nothing stored, nothing sent
fresh(); ok(!ctx.find_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID }).some(d => /مفردات/.test(d.Name)) && mails.every(m => !/مفردات الراتب/.test(m.subject || '')), 'not stored, not e-mailed');

// ---- the contract now names the allowances (v0.48.0 fix: the pay lines are read as { c, a })
fresh(); ctx.update_('RECRUITMENT_REQUESTS', ctx.get_('VACANCIES', VAC).Request_ID, { Employment_Type: 'CONTRACT' }, 'x');
ctx.__nidForJoining(J.Joining_ID);
must(api('privacy.entity', tO, { Name_AR: 'شركة قنديل للنجف', Commercial_Reg: '12345', Tax_ID: '987', Address: 'العبور — المنطقة الصناعية', Signatory_Name: 'محمد عمارة', Signatory_Title: 'مدير قطاع الموارد البشرية', units: ctx.all_('ORG_UNITS').map(u => u.Org_Unit_ID) }), 'entity');
must(api('join.contractData', t.rec, { Joining_ID: J.Joining_ID, Residence_Address: '12 شارع النصر — مدينة نصر — القاهرة' }), 'address');
const K = must(api('join.contract', t.rec, { Joining_ID: J.Joining_ID }), 'contract');
const allow = lines.filter(l => l.kind !== 'BASIC' && l.kind !== 'VARIABLE');
ok(allow.length > 0 && allow.every(l => K.html.includes(l.name)), 'the contract lists the allowances by name: ' + allow.map(l => l.name).join('، '));

console.log('\nPhase 52 (salary details at hire): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
