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
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] }), 'request');
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
const JID = J.Joining_ID, doc = c => J.docs.find(d => d.Doc_Code === c);

// date change keeps history
bad(api('join.action', t.rec, { Joining_ID: JID, action: 'DATE', date: '2099-02-10' }), /سبب/, 'date change needs a reason');
J = must(api('join.action', t.rec, { Joining_ID: JID, action: 'DATE', date: '2099-02-10', reason: 'بيخلّص فترة الإخطار' }), 'date changed').joining;
ok(J.Planned_Date === '2099-02-10' && J.changes.length === 1 && J.changes[0].from === '2099-02-01', 'history of date changes');
J = must(api('join.action', t.rec, { Joining_ID: JID, action: 'CONFIRM_DATE' }), 'confirm').joining;
fresh(); ok(!!J.Date_Confirmed_At && ctx.find_('NOTIFICATIONS', { User_ID: U.mgr }).some(n => /هيستلم 2099-02-10/.test(n.Title)), 'hiring manager told to get ready');

// private link → candidate uploads
const L = must(api('join.action', t.rec, { Joining_ID: JID, action: 'LINK' }), 'link');
const token = /docs=([A-Za-z0-9]+)/.exec(L.link)[1];
let I = must(pub('docs.info', { token }), 'public info');
ok(I.name === 'أحمد' && I.docs.length === 11 && !I.docs[0].Reviewed_By, 'candidate sees his first name and the list only');
bad(pub('docs.info', { token: token.slice(0, -2) + 'zz' }), /انتهى/, 'wrong token refused');
const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]).toString('base64');   // real PNG signature
ok(I.consented === false && /حساسة/.test(I.notice.ar), 'docs notice shown, consent not given yet');
bad(pub('docs.upload', { token, code: 'BIRTH', file: { name: 'b.jpg', mime: 'image/jpeg', data: Buffer.from('x').toString('base64') } }), /إشعار الخصوصية/, 'no upload before consent');
bad(pub('docs.consent', { token, version: '99' }), /اتحدّث/, 'consent to an old notice refused');
I = must(pub('docs.consent', { token, version: I.notice.version }), 'consent');
ok(I.consented, 'consent recorded');
bad(pub('docs.upload', { token, code: 'PHOTOS', file: { name: 'p.png', mime: 'image/png', data: png } }), /ورقي/, 'photos are paper only');
bad(pub('docs.upload', { token, code: 'BIRTH', file: { name: 'x.exe', mime: 'application/x-msdownload', data: png } }), /صورة/, 'only images / PDF');
bad(pub('docs.upload', { token, code: 'BIRTH', file: { name: 'b.pdf', mime: 'application/pdf', data: Buffer.from('MZ not really a pdf').toString('base64') } }), /صورة/, 'content checked, not the declared type');
I = must(pub('docs.upload', { token, code: 'BIRTH', file: { name: 'birth.jpg', mime: 'image/jpeg', data: png } }), 'upload by candidate');
ok(I.docs.find(d => d.code === 'BIRTH').status === 'UPLOADED', 'uploaded → waiting for review');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /مستني المراجعة/.test(n.Title)), 'recruiter told');
ok(must(api('me', t.rec, {}), 'me').todo.join.review === 1, 'home: 1 document to review');

// review
J = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app').joining;
bad(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'REJECT' }), /سبب الرفض/, 'reject needs a reason');
J = must(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'REJECT', note: 'الصورة مش واضحة' }), 'reject').joining;
I = must(pub('docs.info', { token }), 'info');
ok(I.docs.find(d => d.code === 'BIRTH').status === 'REJECTED' && I.docs.find(d => d.code === 'BIRTH').note === 'الصورة مش واضحة', 'candidate sees why');
must(pub('docs.upload', { token, code: 'BIRTH', file: { name: 'birth2.jpg', mime: 'image/jpeg', data: png } }), 'reupload');
J = must(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'VERIFY' }), 'verify').joining;
const birth = J.docs.find(d => d.Doc_Code === 'BIRTH');
ok(birth.Status === 'VERIFIED' && birth.files.length === 2 && !birth.done, 'verified, versions kept; not done until the original is received');
ok(must(api('doc.file', t.rec, { Doc_ID: birth.Doc_ID, File_ID: birth.files[1].id }), 'file').name === 'birth2.jpg', 'file opens');
// HR uploads the ID; expiry is required on review
J = must(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'UPLOAD', file: { name: 'id.pdf', mime: 'application/pdf', data: png } }), 'HR upload').joining;
bad(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'VERIFY' }), /تاريخ انتهاء/, 'ID needs its expiry date');
bad(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'VERIFY', Expiry_Date: '2001-01-01' }), /منتهي/, 'expired ID refused');
J = must(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'VERIFY', Expiry_Date: '2030-05-01' }), 'ID verified').joining;

// receipt blocked until complete
bad(api('doc.receipt', t.rec, { Joining_ID: JID }), /لما كل المسوغات تكتمل/, 'no receipt while documents are missing');
// deferral: recruitment manager only, within max days, ID not deferrable
bad(api('doc.action', t.rec, { Doc_ID: doc('CRIMINAL').Doc_ID, action: 'DEFER', Due_Date: '2099-02-20', reason: 'الفيش بيطلع بعد أسبوعين' }), /مدير التوظيف/, 'recruiter cannot defer');
bad(api('doc.action', t.rm, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'DEFER', Due_Date: '2099-02-20', reason: 'لسه بيطلعها' }), /مايتأجلش/, 'ID cannot be deferred');
bad(api('doc.action', t.rm, { Doc_ID: doc('CRIMINAL').Doc_ID, action: 'DEFER', Due_Date: '2099-04-30', reason: 'الفيش بيطلع بعد أسبوعين' }), /أقصى تأجيل/, 'beyond max days');
J = must(api('doc.action', t.rm, { Doc_ID: doc('CRIMINAL').Doc_ID, action: 'DEFER', Due_Date: '2099-03-05', reason: 'الفيش بيطلع بعد أسبوعين' }), 'deferred').joining;
ok(J.summary.deferred === 1, 'one deferred');
// joined blocked while documents are open (recruiter); the manager can override with a reason
bad(api('join.action', t.rec, { Joining_ID: JID, action: 'JOINED', date: today }), /الرقم القومي/, 'v0.34: no joining without a National ID');
ctx.__nidForJoining(JID);
bad(api('join.action', t.rec, { Joining_ID: JID, action: 'JOINED', date: today }), /ناقصة/, 'recruiter cannot mark joined with missing documents');
// complete all except the deferred one
for (const d of J.docs) {
  if (d.Doc_Code === 'CRIMINAL') continue;
  if (d.Digital === 'Y' && d.Status !== 'VERIFIED') {
    must(api('doc.action', t.rec, { Doc_ID: d.Doc_ID, action: 'UPLOAD', file: { name: d.Doc_Code + '.pdf', mime: 'application/pdf', data: png } }), 'up ' + d.Doc_Code);
    must(api('doc.action', t.rec, { Doc_ID: d.Doc_ID, action: 'VERIFY', Expiry_Date: d.Doc_Code === 'SYNDICATE' ? '2031-01-01' : '' }), 'verify ' + d.Doc_Code);
  }
  J = must(api('doc.action', t.rec, { Doc_ID: d.Doc_ID, action: 'PHYSICAL' }), 'paper ' + d.Doc_Code).joining;
}
ok(J.summary.cleared && !J.summary.complete && J.summary.done === 10, 'cleared to join (10 done + 1 deferred), not complete');
bad(api('doc.receipt', t.rec, { Joining_ID: JID }), /فاضل 1/, 'still no receipt with a deferred document');

// joined → the vacancy fill
fresh(); const vBefore = ctx.get_('VACANCIES', VAC);
J = must(api('join.action', t.rec, { Joining_ID: JID, action: 'JOINED', date: today, Employee_ID: '7001' }), 'joined').joining;
fresh(); const vAfter = ctx.get_('VACANCIES', VAC), a1 = ctx.get_('APPLICATIONS', H1.A), per1 = ctx.get_('PERSONS', a1.Person_ID);
ok(J.Status === 'JOINED' && a1.Stage === 'JOINED' && Number(vAfter.Joined_HC) === Number(vBefore.Joined_HC || 0) + 1 && per1.Is_Employee === 'Y', 'joined: stage, vacancy joined count, person is an employee');
bad(api('cand.move', t.rec, { Application_ID: H1.A, to: 'WITHDRAWN', reasonCode: 'PERSONAL' }), /استلم العمل/, 'a joined candidate is closed');
bad(api('join.action', t.rec, { Joining_ID: JID, action: 'DATE', date: '2099-03-01', reason: 'x x x' }), /اتقفل/, 'joining closed');

// payroll: deferred document due before the cut-off
fresh(); ctx.update_('CANDIDATE_DOCS', doc('CRIMINAL').Doc_ID, { Due_Date: ctx.addDaysYmd_(today, -1) }, 'x');
J = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app').joining;
ok(J.payroll && J.payroll.needStop && J.payroll.missing[0] === doc('CRIMINAL').Name && J.summary.overdue === 1, 'overdue deferred document → notify payroll');
ok(must(api('join.list', t.rec, { tab: 'payroll' }), 'payroll list').rows.length === 1 && must(api('me', t.rec, {}), 'me').todo.join.payroll === 1, 'payroll list + home');
J = must(api('join.action', t.rec, { Joining_ID: JID, action: 'NOTICE', kind: 'STOP', note: 'اتبلغ أ. محمود في المرتبات' }), 'stop notice').joining;
ok(J.payroll.stopped && !J.payroll.needStop && J.notices.length === 1, 'notice recorded (the portal never stops a salary itself)');
bad(api('join.action', t.rec, { Joining_ID: JID, action: 'NOTICE', kind: 'RELEASE' }), /ناقصة/, 'no release while missing');
must(api('doc.action', t.rec, { Doc_ID: doc('CRIMINAL').Doc_ID, action: 'UPLOAD', file: { name: 'fish.pdf', mime: 'application/pdf', data: png } }), 'fish up');
must(api('doc.action', t.rec, { Doc_ID: doc('CRIMINAL').Doc_ID, action: 'VERIFY' }), 'fish ok');
J = must(api('doc.action', t.rec, { Doc_ID: doc('CRIMINAL').Doc_ID, action: 'PHYSICAL' }), 'fish paper').joining;
ok(J.summary.complete && J.payroll.needRelease, 'complete → release notice due');
J = must(api('join.action', t.rec, { Joining_ID: JID, action: 'NOTICE', kind: 'RELEASE' }), 'release').joining;
ok(!J.payroll.stopped && J.notices.length === 2, 'release recorded');
// receipt
const R = must(api('doc.receipt', t.rec, { Joining_ID: JID }), 'receipt');
ok(/^RCP-\d{4}-\d{5}$/.test(R.Receipt_ID) && /إيصال استلام مسوغات التعيين/.test(R.html) && /شهادة الميلاد/.test(R.html) && /7001/.test(R.html), 'receipt printed with the documents and employee code');
ok(must(api('doc.receipt', t.rec, { Joining_ID: JID }), 'reprint').Receipt_ID === R.Receipt_ID, 'issued once, reprint same number');
bad(api('doc.action', t.rec, { Doc_ID: doc('PHOTOS').Doc_ID, action: 'UNPHYSICAL', note: 'غلط' }), /اتطبع/, 'documents locked after the receipt');
ok(must(api('join.list', t.rec, { tab: 'done' }), 'done').rows.length === 1 && must(api('join.list', t.rec, { tab: 'expiring' }), 'exp').rows.length === 0, 'lists');

// =============== no social insurance: CEO / board approval, optional documents ===============
const H2 = hire('منى سمير علي', '01055556666', 'F', { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' });
ok(H2.O.Required_Role === 'CEO_BOARD' && H2.O.Emp_Insurance === '0' && H2.O.No_Insurance === 'Y', 'no-insurance offer → CEO / board approval, zero insurance');
let O2 = must(api('offer.action', t.rec, { Offer_ID: H2.O.Offer_ID, action: 'SUBMIT', hcOverride: 'x' }), 'submit no-ins');
O2 = O2.offer || O2;
if (O2.Status !== 'PENDING_APPROVAL') O2 = must(api('offer.action', t.rm, { Offer_ID: H2.O.Offer_ID, action: 'SUBMIT', hcOverride: 'محتاجين اتنين' }), 'submit (manager)').offer;
ok(O2.Status === 'PENDING_APPROVAL', 'waits for the CEO / board');
bad(api('offer.action', t.rm, { Offer_ID: O2.Offer_ID, action: 'APPROVE' }), /صلاحية/, 'recruitment manager cannot approve a no-insurance contract');
O2 = must(api('offer.action', t.ceo, { Offer_ID: O2.Offer_ID, action: 'APPROVE', note: 'موافق' }), 'CEO approves').offer;
ok(O2.Status === 'APPROVED', 'approved by the CEO');
accept(O2);
let J2 = must(api('cand.app', t.rec, { Application_ID: H2.A }), 'app2').joining;
const opt = J2.docs.filter(d => d.Required === 'N').map(d => d.Doc_Code).sort();
ok(J2.No_Insurance === 'Y' && opt.join(',') === 'INS_PRINT,MEDICAL_111,WORK_STUB' && !J2.docs.some(d => d.Doc_Code === 'MILITARY'), 'no insurance: work stub / insurance print / 111 optional; no military for a female: ' + opt.join(','));
must(api('doc.action', t.rec, { Doc_ID: J2.docs.find(d => d.Doc_Code === 'WORK_STUB').Doc_ID, action: 'PHYSICAL' }), 'optional doc brought anyway is recorded');
// waive & add
bad(api('doc.action', t.rec, { Doc_ID: J2.docs.find(d => d.Doc_Code === 'SYNDICATE').Doc_ID, action: 'WAIVE', reason: 'مش عضو نقابة' }), /مدير التوظيف/, 'waive is a manager decision');
J2 = must(api('doc.action', t.rm, { Doc_ID: J2.docs.find(d => d.Doc_Code === 'SYNDICATE').Doc_ID, action: 'WAIVE', reason: 'مش عضو نقابة لسه' }), 'waived').joining;
ok(J2.docs.find(d => d.Doc_Code === 'SYNDICATE').done, 'waived counts as done');
J2 = must(api('doc.add', t.rec, { Joining_ID: J2.Joining_ID, Doc_Code: 'SKILL_CERT', required: 'N' }), 'add optional doc').joining;
ok(J2.docs.some(d => d.Doc_Code === 'SKILL_CERT' && d.Required === 'N'), 'extra document added');
// did not join
bad(api('cand.move', t.rec, { Application_ID: H2.A, to: 'WITHDRAWN', reasonCode: 'PERSONAL' }), /ماستلمش/, 'withdraw goes through the joining card');
bad(api('join.action', t.rec, { Joining_ID: J2.Joining_ID, action: 'DNJ' }), /سبب/, 'reason needed');
const DN = must(api('join.action', t.rec, { Joining_ID: J2.Joining_ID, action: 'DNJ', reason: 'COUNTEROFFER', note: 'زودوه 3000' }), 'did not join');
fresh(); const a2 = ctx.get_('APPLICATIONS', H2.A);
ok(DN.joining.Status === 'DID_NOT_JOIN' && a2.Stage === 'WITHDRAWN' && a2.Close_Code === 'DID_NOT_JOIN', 'did not join → withdrawn with reason');
bad(pub('docs.info', { token: /docs=([A-Za-z0-9]+)/.exec(must(api('join.action', t.rec, { Joining_ID: JID, action: 'LINK' }), 'link').link)[1].slice(0, 5) }), /غير صحيح/, 'short token');

// daily job runs
fresh(); const dd = ctx.joiningDaily_(); ok(dd && typeof dd.payroll === 'number', 'daily job runs');
// payroll cut-off math
ok(ctx.payrollCutoff_('2026-10-05') === '2026-10-25' && ctx.payrollCutoff_('2026-10-26') === '2026-11-25' && ctx.payrollCutoff_('2026-12-30') === '2027-01-25', 'cut-off day 25 (rolls to next month / year)');

console.log('\nPhase 14 (joining & documents): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
