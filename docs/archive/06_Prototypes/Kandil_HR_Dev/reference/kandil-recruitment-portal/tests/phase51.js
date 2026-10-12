// v0.47.0 (CHG-101): the fixed-term employment contract — the legal review's two-page template on the contribution wage, its own data
// (residence address, contract months, signatory, pay day), printing refused while any is missing, the delete path. Setup from phase50.
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
fresh(); ctx.__nidForJoining(J.Joining_ID);
const rqId = ctx.get_('VACANCIES', VAC).Request_ID;
fresh(); ctx.update_('RECRUITMENT_REQUESTS', rqId, { Employment_Type: 'CONTRACT' }, 'x');

// ---- Arabic amounts and contract end dates
ok(ctx.arMoneyWords_(3500) === 'ثلاثة آلاف وخمسمائة جنيه', '3500 in words: ' + ctx.arMoneyWords_(3500));
ok(ctx.arMoneyWords_(5500) === 'خمسة آلاف وخمسمائة جنيه' && ctx.arMoneyWords_(1000) === 'ألف جنيه' && ctx.arMoneyWords_(2000) === 'ألفان جنيه'.replace('ألفان جنيه', 'ألفان جنيه'), 'thousands in words');
ok(ctx.arMoneyWords_(16725) === 'ستة عشر ألف وسبعمائة وخمسة وعشرون جنيه', '16725 in words: ' + ctx.arMoneyWords_(16725));
ok(ctx.arMoneyWords_(1250.5) === 'ألف ومائتان وخمسون جنيه وخمسون قرش', 'piasters: ' + ctx.arMoneyWords_(1250.5));
ok(ctx.contractEndYmd_('2026-03-01', 12) === '2027-02-28' && ctx.contractEndYmd_('2026-11-15', 6) === '2027-05-14' && ctx.contractEndYmd_('2027-01-31', 1) === '2027-02-27', 'end = the day before the same date N months later');
ok(ctx.addMonthsYmd_('2026-01-31', 1) === '2026-02-28', 'the retention helper is untouched');

// ---- what is missing is listed, and printing waits for it
fresh(); ctx.update_('CONFIG', 'PAY_DAY', { Config_Value: '' }, 'x');
J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app 2').joining;
ok(J.contract && J.contract.fixed && J.contract.type === 'عقد محدد المدة' && J.contract.months === 12, 'fixed-term contract, 12 months by default');
const miss = J.contract.missing.join(' | ');
ok(/الشركة القانونية/.test(miss) && /ممثل الشركة/.test(miss) && /محل إقامة/.test(miss) && /يوم صرف الأجر/.test(miss), 'missing: company, signatory, residence, pay day — ' + miss);
bad(api('join.contract', t.rec, { Joining_ID: J.Joining_ID }), /مايتطبعش قبل ما تكمّل/, 'no printing while data is missing');
// the contract's own data
bad(api('join.contractData', t.rec, { Joining_ID: J.Joining_ID, Residence_Address: 'مصر' }), /بالتفصيل/, 'an address too short');
bad(api('join.contractData', t.rec, { Joining_ID: J.Joining_ID, Contract_Months: '0' }), /من 1 لـ 60/, 'months 1–60');
bad(api('join.contractData', t.mgr, { Joining_ID: J.Joining_ID, Residence_Address: '12 شارع النصر — مدينة نصر — القاهرة' }), null, 'the hiring manager cannot set it');
must(api('join.contractData', t.rec, { Joining_ID: J.Joining_ID, Residence_Address: '12 شارع النصر — مدينة نصر — القاهرة', Contract_Months: '6' }), 'contract data saved');
fresh(); ok(ctx.get_('PERSONS', ctx.get_('APPLICATIONS', H.A).Person_ID).Residence_Address === '12 شارع النصر — مدينة نصر — القاهرة' && ctx.get_('JOININGS', J.Joining_ID).Contract_Months === '6', 'stored on the person and the joining');
// the company, its signatory, the pay day
must(api('privacy.entity', tO, { Name_AR: 'شركة قنديل للنجف', Commercial_Reg: '12345', Tax_ID: '987-654-321', Address: 'العبور — المنطقة الصناعية', Signatory_Name: 'محمد عمارة', Signatory_Title: 'مدير قطاع الموارد البشرية',
  units: ctx.all_('ORG_UNITS').map(u => u.Org_Unit_ID) }), 'entity with signatory');
fresh(); ctx.update_('CONFIG', 'PAY_DAY', { Config_Value: '5' }, 'x');
J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app 3').joining;
ok(J.contract.missing.length === 0 && J.contract.months === 6 && J.contract.end === '2099-07-31', 'nothing missing; ends 6 months on: ' + J.contract.end + ' ' + J.contract.missing.join('|'));

// ---- the printed contract
const K = must(api('join.contract', t.rec, { Joining_ID: J.Joining_ID }), 'contract');
fresh(); const Of = ctx.get_('OFFERS', O.Offer_ID), wage = Number(Of.Contrib_Wage), money = ctx.money0_(wage);
ok(K.theme === true && /class="pr kc"/.test(K.html) && /pr-head/.test(K.html) && /pr-foot/.test(K.html), 'in the portal print theme (head, foot)');
ok(/عقد عمل فردي محدد المدة/.test(K.html) && /نموذج مبدئي — يراجعه المحامي/.test(K.html), 'the preliminary fixed-term template, marked for the lawyer');
ok(wage > 0 && K.html.includes(money) && K.html.includes(ctx.arMoneyWords_(wage)) && /أساساً للاشتراك في التأمينات/.test(K.html), 'the wage is the contribution wage, in figures and words: ' + money);
ok(Number(Of.Final_Accepted || Of.Fixed_Package) === wage || !K.html.includes(ctx.money0_(Of.Final_Accepted || Of.Fixed_Package)), 'the full pay is not printed');
ok(K.html.includes('شركة قنديل للنجف') && K.html.includes('12345') && K.html.includes('987-654-321') && K.html.includes('محمد عمارة') && K.html.includes('مدير قطاع الموارد البشرية'), 'company, register, tax card, signatory and title');
ok(K.html.includes('12 شارع النصر') && K.html.includes(ctx.get_('PERSONS', ctx.get_('APPLICATIONS', H.A).Person_ID).National_ID), 'residence and national ID');
ok(K.html.includes('6 شهراً') && K.html.includes(J.contract.end) && K.html.includes('يوم <b>5</b>') && /90 يوماً/.test(K.html), 'term, end date, pay day, 90-day probation');
ok(!/مهلة إخطار/.test(K.html) && /أربع نسخ/.test(K.html), 'no resignation notice period; four copies');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_ID === J.Joining_ID && a.Action === 'PRINT_CONTRACT'), 'printing is logged');

// ---- other types keep the short form, now on the contribution wage too
fresh(); ctx.update_('RECRUITMENT_REQUESTS', rqId, { Employment_Type: 'FULL_TIME' }, 'x');
const K2 = must(api('join.contract', t.rec, { Joining_ID: J.Joining_ID }), 'short contract');
ok(!K2.theme && /دوام كامل/.test(K2.html) && /أجر الاشتراك التأميني/.test(K2.html) && K2.html.includes(money) && K2.html.includes('محمد عمارة'), 'full time: the short form, contribution wage, the signatory');

// ---- privacy: the address is in the person's copy and goes with deletion
fresh(); const per = ctx.get_('APPLICATIONS', H.A).Person_ID;
ok(/12 شارع النصر/.test(must(api('privacy.export', tO, { Person_ID: per }), 'export').html), 'the address is in the data copy');
fresh(); ctx.update_('JOININGS', J.Joining_ID, { Status: 'DID_NOT_JOIN' }, 'x'); ctx.update_('APPLICATIONS', H.A, { Stage: 'WITHDRAWN' }, 'x');
fresh(); ctx.withLock_(() => ctx.purgePerson_('x', per, 'طلب حذف'));
fresh(); ok(ctx.get_('PERSONS', per).Residence_Address === '', 'deleted with the person');
fresh(); ok(!ctx.all_('AUDIT_LOG').some(a => /12 شارع النصر/.test(JSON.stringify(a))), 'and from the audit log');

console.log('\nPhase 51 (fixed-term employment contract): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
