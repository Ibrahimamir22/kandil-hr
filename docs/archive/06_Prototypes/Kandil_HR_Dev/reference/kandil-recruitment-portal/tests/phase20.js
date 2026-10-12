// v0.18.0 (phase 6B): welcome gift, social-insurance cases (start rules, submit, register, late), New Hire Voice (schedule,
// link, email, answers on the private page, alerts, review, privacy). Setup copied from phase14.
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
const site = user('site@t.com', 'هبة أخصائي HR', '', ['HR_STAFF']);
fresh(); const LOC = P['محاسب تكاليف'].Location_ID, L0 = ctx.get_('LOCATIONS', LOC);
must(api('config.update', tO, { Config_Key: 'INSURANCE_OFFICES', Config_Value: JSON.stringify(['مكتب تأمينات العبور', 'مكتب تأمينات بلبيس']), reason: 'المكاتب' }), 'offices');
must(api('locations.save', t.hr, { Location_ID: LOC, Name_AR: L0.Name_AR, Location_Type: 'FACTORY', Status: 'Active', HR_Site_User_ID: site, Insurance_Office: 'مكتب تأمينات العبور' }), 'location');
fresh(); ok(ctx.get_('LOCATIONS', LOC).Insurance_Office === 'مكتب تأمينات العبور', 'insurance office per location');
fresh(); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
function join(name, mobile, empId, date, opts) {
  opts = opts || {};
  const H = hire(name, mobile, 'M', opts.offer);
  let O = must(api('offer.action', t.rm, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT', hcOverride: 'محتاجين العدد ده للاختبار' }), 'submit ' + name).offer;
  if (O.Status === 'PENDING_APPROVAL') O = must(api('offer.action', t.ceo, { Offer_ID: O.Offer_ID, action: 'APPROVE', note: 'موافق' }), 'CEO approves').offer;
  accept(O);
  const J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
  must(api('join.action', t.rec, { Joining_ID: J.Joining_ID, action: 'CONFIRM_DATE' }), 'confirm');
  fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: opts.docsOpen ? 'MISSING' : 'WAIVED' }, 'x'));
  ctx.__nidForJoining(J.Joining_ID);
  if (opts.noIns) {   // v0.38.0: the signed no-insurance acknowledgement first
    bad(api('join.action', t.rec, { Joining_ID: J.Joining_ID, action: 'JOINED', date, Employee_ID: empId }), /إقرار عدم التأمين/, 'no-insurance join waits for the signed form');
    ok(/صاحب معاش/.test(must(api('offer.noInsForm', t.rec, { Offer_ID: O.Offer_ID }), 'print form').html), 'form names the legal basis');
    must(api('offer.noInsUpload', t.rec, { Offer_ID: O.Offer_ID, files: [{ name: 'signed.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 signed').toString('base64') }] }), 'signed form uploaded');
    { fresh(); const ak = ctx.findOne_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID, Doc_Code: 'NO_INS_ACK' }); must(api('doc.action', t.rec, { Doc_ID: ak.Doc_ID, action: 'VERIFY' }), 'acknowledgement reviewed'); must(api('doc.action', t.rec, { Doc_ID: ak.Doc_ID, action: 'PHYSICAL' }), 'its original received'); }   // v0.46.2: a joining document like the others
  }
  must(api('join.action', opts.docsOpen ? t.rm : t.rec, Object.assign({ Joining_ID: J.Joining_ID, action: 'JOINED', date, Employee_ID: empId }, opts.docsOpen ? { override: 'استثناء للاختبار' } : {})), 'joined ' + name);
  return { H, J };
}

// =============== insurance: DAY_ONE ===============
const d1 = ctx.addDaysYmd_(ctx.today_(), -10);
const A = join('كريم محمود سالم', '01033334444', 'E-7001', d1);
fresh(); let C = ctx.findOne_('INSURANCE_CASES', { Joining_ID: A.J.Joining_ID });
ok(C && C.Status === 'TO_SUBMIT' && C.Start_Date === d1 && C.Rule === 'DAY_ONE' && C.Office === 'مكتب تأمينات العبور' && C.Due_Date === ctx.addDaysYmd_(d1, 7), 'case opened on joining: day one, office from the location, due +7');
let LI = must(api('ins.list', t.hr, { tab: 'late' }), 'late list');
ok(LI.rows.length === 1 && LI.rows[0].late && LI.counts.late === 1, 'late after 7 days');
ok(must(api('todo', t.hr, {}), 'todo').ins === 1, 'counted in HR to-do');
bad(api('ins.list', t.mgr, {}), /صلاحية/, 'managers do not see insurance');
bad(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'REGISTER', number: '12' }), /الرقم التأميني/, 'insurance number digits');
bad(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'SUBMIT', date: '2099-01-01' }), /المستقبل/, 'no future submit date');
must(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'SUBMIT', ref: 'REQ-5521' }), 'submitted');
bad(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'START', date: d1, reason: 'x x x' }), /قبل التقديم/, 'start date fixed after submitting');
must(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'REGISTER', number: '٧٠١٢٣٤٥٦' }), 'registered (Arabic digits)');
fresh(); C = ctx.get_('INSURANCE_CASES', C.Case_ID);
ok(C.Status === 'REGISTERED' && C.Insurance_No === '70123456' && C.Submit_Ref === 'REQ-5521', 'registered with number');
ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'INSURANCE' && a.Field === 'Insurance_No'), 'audited');
bad(api('ins.action', t.site = login('site@t.com'), { Case_ID: C.Case_ID, action: 'REOPEN', reason: 'غلط' }), /مديرين/, 'HR staff cannot step back');
must(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'REOPEN', reason: 'الرقم غلط' }), 'HR manager steps back');
fresh(); ok(ctx.get_('INSURANCE_CASES', C.Case_ID).Status === 'SUBMITTED' && !ctx.get_('INSURANCE_CASES', C.Case_ID).Insurance_No, 'back to submitted');

// NEXT_MONTH
must(api('config.update', tO, { Config_Key: 'INSURANCE_START_RULE', Config_Value: 'NEXT_MONTH', reason: 'سياسة' }), 'rule');
const d2 = ctx.addDaysYmd_(ctx.today_(), -2);
const B = join('منى سعيد حسن', '01055556666', 'E-7002', d2);
fresh(); C = ctx.findOne_('INSURANCE_CASES', { Joining_ID: B.J.Joining_ID });
ok(C.Start_Date === (d2.slice(8) === '01' ? d2 : ctx.firstOfNextMonth_(d2)) && C.Rule === 'NEXT_MONTH', 'next month rule: ' + C.Start_Date);
bad(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'START', date: ctx.addDaysYmd_(d2, -1), reason: 'تعديل' }), /قبل الاستلام/, 'start not before joining');
must(api('ins.action', t.hr, { Case_ID: C.Case_ID, action: 'START', date: d2, reason: 'قرار مدير القطاع' }), 'start changed with a reason');
fresh(); ok(ctx.get_('INSURANCE_CASES', C.Case_ID).Start_Date === d2 && /قرار مدير القطاع/.test(ctx.get_('INSURANCE_CASES', C.Case_ID).Note), 'start date and reason kept');

// DOCS_COMPLETE: waits for the receipt
must(api('config.update', tO, { Config_Key: 'INSURANCE_START_RULE', Config_Value: 'DOCS_COMPLETE', reason: 'سياسة' }), 'rule 2');
const D = join('هاني فؤاد علي', '01077778888', 'E-7003', ctx.today_(), { docsOpen: true });
fresh(); C = ctx.findOne_('INSURANCE_CASES', { Joining_ID: D.J.Joining_ID });
ok(C.Status === 'WAIT_DOCS' && !C.Start_Date, 'waiting for documents');
fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: D.J.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'WAIVED' }, 'x'));
must(api('doc.receipt', t.rec, { Joining_ID: D.J.Joining_ID }), 'receipt');
fresh(); C = ctx.get_('INSURANCE_CASES', C.Case_ID);
ok(C.Status === 'TO_SUBMIT' && C.Start_Date === ctx.today_(), 'receipt sets the start date');
// no-insurance contract
must(api('config.update', tO, { Config_Key: 'INSURANCE_START_RULE', Config_Value: 'DAY_ONE', reason: 'رجوع' }), 'rule 3');
const ceoT = t.ceo;
const N = join('سامي نبيل رزق', '01099990000', 'E-7004', ctx.today_(), { offer: { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' }, noIns: true });
fresh(); C = ctx.findOne_('INSURANCE_CASES', { Joining_ID: N.J.Joining_ID });
ok(C && C.Status === 'NOT_INSURED' && !C.Start_Date, 'no-insurance contract marked: ' + (C && C.Status));
// daily
fresh(); let R = ctx.insDaily_(); fresh(); let R2 = ctx.insDaily_();
ok(R2.late === 0, 'insurance reminders once: ' + JSON.stringify(R));

// =============== welcome gift ===============
fresh(); const ONB = ctx.findOne_('ONBOARDINGS', { Joining_ID: A.J.Joining_ID }).Onboarding_ID;
let OD = must(api('onb.get', t.mgr, { Onboarding_ID: ONB }), 'onb');
ok(OD.onb.gifts.length === 1 && !OD.onb.gift.item, 'gift choices from settings, none yet');
ok(OD.onb.insurance === null && must(api('onb.get', t.hr, { Onboarding_ID: ONB }), 'hr onb').onb.insurance.status === 'SUBMITTED', 'insurance on the program page for HR only');
bad(api('gift.save', t.mgr, { Onboarding_ID: ONB, item: '' }), /الهدية/, 'gift item required');
bad(api('gift.save', t.mgr, { Onboarding_ID: ONB, item: 'شنطة', date: '2099-01-01' }), /المستقبل/, 'no future date');
must(api('gift.save', t.mgr, { Onboarding_ID: ONB, item: OD.onb.gifts[0], signed: 'Y' }), 'gift by the manager');
OD = must(api('onb.get', t.hr, { Onboarding_ID: ONB }), 'onb 2');
ok(OD.onb.gift.item === OD.onb.gifts[0] && OD.onb.gift.signed && OD.onb.gift.by === 'مدير الحسابات', 'gift recorded');
bad(api('gift.save', t.mgr, { Onboarding_ID: ONB, clear: true }), /فريق الموارد/, 'only HR clears');
const other = user('x@t.com', 'موظف تاني'); bad(api('gift.save', login('x@t.com'), { Onboarding_ID: ONB, item: 'x x' }), null, 'others cannot record');

// =============== New Hire Voice ===============
fresh(); let SV = ctx.find_('NHV_SURVEYS', { Joining_ID: A.J.Joining_ID }).sort((a, b) => a.Round_Day - b.Round_Day);
ok(SV.length === 2 && SV[0].Round_Day === '7' && SV[0].Due_Date === ctx.addDaysYmd_(d1, 7) && SV[1].Due_Date === ctx.addDaysYmd_(d1, 30) && SV[0].Status === 'SCHEDULED', 'two surveys scheduled (day 7 and 30)');
// person with email → emailed; person without → HR site asked
fresh(); ctx.update_('PERSONS', A.H ? ctx.get_('JOININGS', A.J.Joining_ID).Person_ID : '', { Email: 'karim@mail.test' }, 'x');
fresh(); ctx.find_('NHV_SURVEYS', { Joining_ID: B.J.Joining_ID }).forEach(s => ctx.update_('NHV_SURVEYS', s.Survey_ID, { Due_Date: ctx.today_() }, 'x'));
mails.length = 0; fresh(); R = ctx.nhvDaily_();
ok(R.emailed === 1 && mails.some(m => m.to === 'karim@mail.test' && /voice=/.test(m.htmlBody)), 'due survey emailed with the link: ' + JSON.stringify(R));
ok(R.asked === 2, 'no email → HR site specialist asked (both of Mona\'s surveys moved to today)');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === site && /استبيان موظف جديد/.test(n.Title)), 'HR site notified');
fresh(); R = ctx.nhvDaily_(); ok(R.emailed === 0 && R.asked === 0, 'not twice');
const link = /href="([^"]+)"/.exec(mails.find(m => m.to === 'karim@mail.test').htmlBody)[1], tok = link.split('voice=')[1];
// the private page
let VI = must(pub('voice.info', { token: tok }), 'voice info');
ok(VI.name === 'كريم' && VI.day === 7 && VI.questions.length === 5 && !VI.answered, 'page: first name, day, 5 questions');
bad(pub('voice.info', { token: 'x'.repeat(40) }), /مش شغال/, 'bad token');
bad(pub('voice.submit', { token: tok, answers: { Q1: 5, Q2: 4 } }), /كل الأسئلة/, 'all questions required');
bad(pub('voice.submit', { token: tok, answers: { Q1: 9, Q2: 4, Q3: 4, Q4: 4, Q5: 4 } }), /كل الأسئلة/, 'scale 1–5 only');
must(pub('voice.submit', { token: tok, answers: { Q1: 2, Q2: 4, Q3: 5, Q4: 4, Q5: 3 }, comment: 'الشغل مختلف عن الإعلان شوية' }), 'answered');
bad(pub('voice.submit', { token: tok, answers: { Q1: 5, Q2: 5, Q3: 5, Q4: 5, Q5: 5 } }), /مش شغال|قبل كده/, 'answer once');
fresh(); const S7 = ctx.find_('NHV_SURVEYS', { Joining_ID: A.J.Joining_ID, Round_Day: '7' })[0];
ok(S7.Status === 'ANSWERED' && S7.Min_Score === '2' && S7.Avg_Score === '3.6' && !S7.Token_Hash, 'stored: min, average; link closed');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.hr && /تقييم منخفض/.test(n.Title)) && ctx.all_('NOTIFICATIONS').some(n => n.User_ID === site && /تقييم منخفض/.test(n.Title)), 'low score alerts HR manager and HR site');
ok(!ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.mgr && /تقييم منخفض/.test(n.Title)), 'the manager is not told');
// HR screens
let NL = must(api('nhv.list', t.hr, { tab: 'answered' }), 'answered list');
ok(NL.rows.length === 1 && NL.rows[0].answers.Q1 === 2 && NL.rows[0].comment && NL.stats['7'].n === 1 && NL.stats['7'].hidden && !NL.stats['7'].q.Q3 && NL.unreviewedLow === 1, 'v0.38: one answer → averages hidden (fewer than 5)');
fresh(); ctx.update_('CONFIG', 'SURVEY_MIN_ANSWERS', { Config_Value: '1' }, 'x');
NL = must(api('nhv.list', t.hr, { tab: 'answered' }), 'nhv list (min 1)');
ok(NL.stats['7'].q.Q3.avg === 5, 'answers, averages per round, low not reviewed');
fresh(); ctx.update_('CONFIG', 'SURVEY_MIN_ANSWERS', { Config_Value: '5' }, 'x');
bad(api('nhv.list', t.mgr, {}), /صلاحية/, 'managers cannot see answers');
bad(api('nhv.get', t.rec, { Survey_ID: S7.Survey_ID }), /صلاحية/, 'recruiters cannot see answers');
ok(must(api('todo', t.hr, {}), 'todo').nhv.low === 1, 'low score in HR to-do');
bad(api('nhv.action', t.hr, { Survey_ID: S7.Survey_ID, action: 'REVIEW' }), /عملت إيه/, 'review needs a note');
must(api('nhv.action', t.hr, { Survey_ID: S7.Survey_ID, action: 'REVIEW', note: 'قعدت معاه ووضحنا المهام مع المدير' }), 'reviewed');
ok(must(api('nhv.list', t.hr, { tab: 'answered' }), 'answered 2').unreviewedLow === 0, 'reviewed clears the alert');
// HR site sends a link by WhatsApp
const SM = ctx.find_('NHV_SURVEYS', { Joining_ID: B.J.Joining_ID, Round_Day: '7' })[0];
let LK = must(api('nhv.action', t.site, { Survey_ID: SM.Survey_ID, action: 'LINK' }), 'link');
ok(/voice=/.test(LK.link) && LK.until, 'link made');
bad(api('nhv.action', t.site, { Survey_ID: S7.Survey_ID, action: 'LINK' }), /اتجاوب/, 'no link for an answered survey');
must(api('nhv.action', t.site, { Survey_ID: SM.Survey_ID, action: 'SENT', via: 'WHATSAPP' }), 'marked sent');
fresh(); ok(ctx.get_('NHV_SURVEYS', SM.Survey_ID).Status === 'SENT' && ctx.get_('NHV_SURVEYS', SM.Survey_ID).Sent_Via === 'WHATSAPP', 'sent by WhatsApp');
// expiry
fresh(); ctx.update_('NHV_SURVEYS', SM.Survey_ID, { Token_Until: '2000-01-01' }, 'x');
bad(pub('voice.info', { token: LK.link.split('voice=')[1] }), /انتهى/, 'expired link');
fresh(); R = ctx.nhvDaily_(); fresh(); ok(R.expired === 1 && ctx.get_('NHV_SURVEYS', SM.Survey_ID).Status === 'EXPIRED', 'daily marks it expired');
LK = must(api('nhv.action', t.site, { Survey_ID: SM.Survey_ID, action: 'LINK' }), 'new link'); ok(LK.link, 'a new link can be made');
// cancel
const SM30 = ctx.find_('NHV_SURVEYS', { Joining_ID: B.J.Joining_ID, Round_Day: '30' })[0];
bad(api('nhv.action', t.hr, { Survey_ID: SM30.Survey_ID, action: 'CANCEL' }), /السبب/, 'cancel needs a reason');
must(api('nhv.action', t.hr, { Survey_ID: SM30.Survey_ID, action: 'CANCEL', note: 'استقال' }), 'cancelled');
// settings: off
must(api('config.update', tO, { Config_Key: 'NHV_ENABLED', Config_Value: 'N', reason: 'إيقاف' }), 'off');
fresh(); ok(ctx.nhvSchedule_('x', { Joining_ID: 'JON-Z', Person_ID: 'P' }, 'E', 'x', ctx.today_()) === 0, 'off: nothing scheduled');
// custom questions
must(api('config.update', tO, { Config_Key: 'NHV_QUESTIONS', Config_Value: JSON.stringify([{ id: 'A', ar: 'سؤال واحد؟', en: 'One question?' }]), reason: 'أسئلة' }), 'questions');
fresh(); ok(ctx.nhvQuestions_().length === 1, 'custom questions');
// employee file
const EF = must(api('emp.get', t.hr, { Employee_ID: 'E-7001' }), 'file').file;
ok(EF.insurance && EF.insurance.status === 'SUBMITTED' && EF.voice.length === 2 && EF.voice.some(v => v.status === 'ANSWERED'), 'file: insurance + survey status');
// consultant reads only
const Cn = user('c@t.com', 'الاستشاري'); must(api('users.save', tO, { User_ID: Cn, Email: 'c@t.com', Full_Name_AR: 'الاستشاري', Access_Expires_At: ctx.addDaysIso_(10).slice(0, 10) }), 'exp');
must(api('users.setRoles', tO, { User_ID: Cn, roles: [{ Role_Code: 'CONSULTANT' }], reason: 'x' }), 'consultant'); const tC = login('c@t.com'); must(api('nda.accept', tC, {}), 'nda');
must(api('ins.list', tC, {}), 'consultant reads insurance'); must(api('nhv.list', tC, { tab: 'answered' }), 'consultant reads surveys');
bad(api('ins.action', tC, { Case_ID: C.Case_ID, action: 'NOTE', note: 'x' }), /للعرض فقط/, 'consultant cannot act');

console.log('\nPhase 20 (gift, insurance, new hire voice): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
