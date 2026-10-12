// v0.40.0: workflow decisions (CHG-84) and the last partial requirements — the payroll net review before an offer is
// presented, WhatsApp from the recruiter's own mobile, the recruiter's authority = the grade minimum, the employment
// contract (print + signed copy), hiring restrictions (review within 2 years, appeal, review reminder), 5 working-day (v0.40.1)
// approval deadline, the days-off rule (expiries run, reminders pause); HC-005 reserved headcount; VAC-002 the request
// closes by itself; DOC-002 deferred documents (reminder + escalation); FIL-001 the 13 document states and expiry/renewal.
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
ctx.__keepNet = true;                                  // this suite tests the payroll net review itself
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '8']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), hs: user('hs@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), hs: login('hs@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), ceo: login('ceo@t.com') };
const POS = P['محاسب تكاليف'].Position_ID, JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const newReq = (tok, hc, why) => must(api('req.submit', tok, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: why || 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: POS, Requested_HC: hc }] }), 'request ' + hc);
const rq = newReq(tO, 2);
fresh(); const VAC = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0].Vacancy_ID;
must(api('vac.assign', t.rm, { Vacancy_ID: VAC, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: VAC, action: 'OPEN' }), 'open');
must(api('pay.structures', tO, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' }), 'structure');
const today = ctx.today_();
const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]).toString('base64');

// =============== seeds ===============
fresh();
ok(ctx.cfg_('APPROVAL_EXPIRE_DAYS') === 5 && ctx.cfg_('APPROVAL_EXPIRY_WARN_DAYS') === 1 && ctx.cfg_('APPROVAL_REMIND_DAYS') === 2 && ctx.cfg_('APPROVAL_ESCALATE_DAYS') === 3, 'approval: reminder day 2, escalation day 3, warning day 4, rejected after 5 working days');
ok(ctx.cfg_('NET_REVIEW_REQUIRED', false) === true && ctx.cfg_('RESTRICTION_MAX_YEARS') === 2 && ctx.cfg_('DOC_DEFER_ESCALATE_DAYS') === 7, 'new settings seeded');

// =============== CHG-84: offer — recruiter authority, payroll net review, WhatsApp ===============
bad(api('pay.authority', tO, { rows: [{ Role_Code: 'RECRUITER', Limit_Point: 'MID', Limit_Pct: '0' }, { Role_Code: 'HR_MANAGER', Limit_Point: 'ANY', Limit_Pct: '0' }], reason: 'تجربة' }), /الحد الأدنى للدرجة بالظبط/, 'recruiter above the minimum refused');
bad(api('pay.authority', tO, { rows: [{ Role_Code: 'RECRUITER', Limit_Point: 'MIN', Limit_Pct: '10' }, { Role_Code: 'HR_MANAGER', Limit_Point: 'ANY', Limit_Pct: '0' }], reason: 'تجربة' }), /الحد الأدنى للدرجة بالظبط/, 'minimum + 10 % refused');
fresh(); const recAuth = ctx.findOne_('OFFER_AUTHORITY', { Role_Code: 'RECRUITER', Status: 'Active' });
ok(recAuth.Limit_Point === 'MIN' && recAuth.Limit_Pct === '0', 'seeded: recruiter = the grade minimum');

function hire(name, mobile, email) {
  const A = must(api('cand.create', t.rec, { Vacancy_ID: VAC, Full_Name: name, Mobile: mobile, Email: email || '', Gender: 'M', Source: 'WALK_IN', consent: 'Y' }), 'cand').application.Application_ID;
  must(api('cand.move', t.rec, { Application_ID: A, to: 'SHORTLISTED' }), 'shortlist');
  const iv = must(api('int.create', t.rec, { Application_ID: A, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'iv').interview;
  must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'START' }), 'start');
  must(api('sel.save', t.rec, { Application_ID: A, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' }), 'select');
  const O = must(api('offer.save', t.rec, { Application_ID: A, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01' }), 'offer').offer;
  return { A, O };
}
const H1 = hire('أحمد علي حسن', '01011112222', 'ahmed@mail.test');
let O = must(api('offer.action', t.rec, { Offer_ID: H1.O.Offer_ID, action: 'SUBMIT' }), 'submit').offer;
fresh(); let Or = ctx.get_('OFFERS', O.Offer_ID);
ok(Or.Status === 'APPROVED' && Number(Or.Net_Salary) > 0 && ctx.netReviewNeeded_(Or), 'at the minimum: the recruiter approves it, the net still needs payroll');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /مراجعة الصافي/.test(n.Title)), 'the payroll reviewer (HR manager by default) told');
bad(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' }), /مراجع المرتبات/, 'not presented before the net review');
bad(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'NET_REVIEW' }), /مراجع(ة)? (الصافي|المرتبات)/, 'the recruiter cannot review the net');
ok(must(api('me', t.hr, {}), 'me hr').todo.offer.approve === 1 && must(api('me', t.rec, {}), 'me rec').todo.offer.present === 0, 'home: one net review for HR, nothing to present yet');
let L = must(api('offer.list', t.hr, { tab: 'approve' }), 'list approve');
ok(L.rows.length === 1 && L.rows[0].canNetReview, 'the reviewer sees it in «waiting for me»');
// a named reviewer replaces the default
fresh(); ctx.update_('CONFIG', 'PAYROLL_REVIEW_USERS', { Config_Value: 'hs@t.com' }, 'x');
bad(api('offer.action', t.hr, { Offer_ID: O.Offer_ID, action: 'NET_REVIEW' }), /مراجع/, 'with PAYROLL_REVIEW_USERS set, only that reviewer');
O = must(api('offer.action', t.hs, { Offer_ID: O.Offer_ID, action: 'NET_REVIEW', note: 'مطابق لحسبة أكتوبر' }), 'net reviewed').offer;
fresh(); Or = ctx.get_('OFFERS', O.Offer_ID);
ok(Or.Net_Reviewed_By === U.hs && Or.Net_Reviewed_At && !ctx.netReviewNeeded_(Or), 'net review recorded');
bad(api('offer.action', t.hs, { Offer_ID: O.Offer_ID, action: 'NET_REVIEW' }), /اتراجع بالفعل/, 'not twice');
// the letter: the net is an estimate
const LT = must(api('offer.letter', t.rec, { Offer_ID: O.Offer_ID }), 'letter');
ok(/صافي تقديري/.test(LT.html) && LT.html.indexOf(Number(Or.Net_Salary).toLocaleString('en-US').split('.')[0]) >= 0, 'the letter shows the net as an estimate');
// WhatsApp only from the recruiter's own mobile
bad(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'WHATSAPP' }), /موبايلك/, 'WhatsApp without the recruiter\'s mobile refused');
fresh(); ctx.update_('USERS', U.rec, { Mobile: '01000000077' }, 'x');
O = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'WHATSAPP' }), 'present by WhatsApp').offer;
fresh(); ok(ctx.get_('OFFERS', O.Offer_ID).Presented_Mobile === '01000000077' && ctx.get_('OFFERS', O.Offer_ID).Status === 'PRESENTED', 'the recruiter\'s number recorded on the offer');
must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'ACCEPT', note: 'وافق على الواتساب ووقّع' }), 'accept');
fresh(); ctx.update_('CONFIG', 'PAYROLL_REVIEW_USERS', { Config_Value: '' }, 'x');

// =============== CHG-84: the employment contract ===============
let AP = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app');
let J = AP.joining; const JID = J.Joining_ID;
ok(!J.Contract_At, 'no contract yet');
bad(api('join.contract', t.mgr, { Joining_ID: JID }), null, 'the hiring manager cannot print the contract');
const CF = must(api('join.contract', t.rec, { Joining_ID: JID }), 'contract form');
fresh(); const CW = ctx.money0_(ctx.contractWage_(ctx.findOne_('OFFERS', { Application_ID: H1.A, Status: 'ACCEPTED' })));
ok(/عقد عمل/.test(CF.html) && /أحمد علي حسن/.test(CF.html) && /90 يوم/.test(CF.html) && CF.html.includes(CW) && /أجر الاشتراك/.test(CF.html) && /قنديل/.test(CF.html), 'contract: the person, the entity, the pay (v0.47.0: the contribution wage ' + CW + ') and the probation');
bad(api('join.contractUpload', t.rec, { Joining_ID: JID, files: [] }), /ارفع العقد/, 'upload needs the file');
must(api('join.contractUpload', t.rec, { Joining_ID: JID, files: [{ name: 'contract.png', mime: 'image/png', data: png }] }), 'signed contract uploaded');
fresh(); const Jr = ctx.get_('JOININGS', JID);
ok(Jr.Contract_File_ID && Jr.Contract_At && Jr.Contract_By === U.rec, 'the signed contract kept on the joining');
J = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app 2').joining;
ok(J.Contract_At && J.contractBy === 'سارة' && J.Status === 'PENDING', 'shown on the card; joining not blocked or changed');

// =============== FIL-001: the 13 states, suspect / replacement ===============
const doc = c => J.docs.find(d => d.Doc_Code === c);
ok(doc('BIRTH').state === 'NOT_SUBMITTED' && doc('BIRTH').stateName === 'لم يُقدَّم', 'not submitted');
J = must(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'UPLOAD', paperConsent: 'Y', file: { name: 'b.png', mime: 'image/png', data: png } }), 'upload').joining;
ok(doc('BIRTH').state === 'UPLOADED', 'uploaded');
const fileId = doc('BIRTH').files[0].id;
must(api('doc.file', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, File_ID: fileId }), 'open the file');
J = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app 3').joining;
ok(doc('BIRTH').state === 'UNDER_REVIEW', 'opening the file starts the review');
bad(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'SUSPECT', note: 'x' }), /مش مظبوط/, 'suspect needs what is wrong');
mails.length = 0;
J = must(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'SUSPECT', note: 'الختم مش واضح والتاريخ متعدّل' }), 'suspect').joining;
ok(doc('BIRTH').Status === 'SUSPECT' && doc('BIRTH').state === 'SUSPECT' && !doc('BIRTH').done, 'suspected issue');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /مستند عليه شك/.test(n.Title)) && !ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /مستند عليه شك/.test(n.Title)), 'HR managers told (not the one who raised it)');
bad(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'VERIFY' }), /مدير الموارد البشرية/, 'the recruiter cannot clear a suspected document');
J = must(api('doc.action', t.hr, { Doc_ID: doc('BIRTH').Doc_ID, action: 'VERIFY', note: 'اتأكدنا من السجل المدني' }), 'HR clears it').joining;
ok(doc('BIRTH').Status === 'VERIFIED', 'verified by HR');
J = must(api('doc.action', t.rec, { Doc_ID: doc('BIRTH').Doc_ID, action: 'REPLACE', note: 'محتاجين نسخة مميكنة حديثة' }), 'replacement').joining;
ok(doc('BIRTH').state === 'REPLACEMENT' && doc('BIRTH').Issue_Note === 'محتاجين نسخة مميكنة حديثة', 'replacement requested with the reason');
const LK = must(api('join.action', t.rec, { Joining_ID: JID, action: 'LINK' }), 'docs link');
const dtok = /docs=([A-Za-z0-9]+)/.exec(LK.link)[1];
let DI = must(pub('docs.info', { token: dtok }), 'public');
ok(DI.docs.find(d => d.code === 'BIRTH').note === 'محتاجين نسخة مميكنة حديثة', 'the candidate sees why a new copy is needed');
DI = must(pub('docs.upload', { token: dtok, code: 'BIRTH', file: { name: 'b2.png', mime: 'image/png', data: png } }), 'new copy');
J = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app 4').joining;
ok(doc('BIRTH').Status === 'UPLOADED' && doc('BIRTH').state === 'UPLOADED', 'a new copy goes back to review');
// the derived states, one by one
const st = o => ctx.docState_(Object.assign({ Status: 'MISSING', Keep: 'COPY', Digital: 'Y', Physical: '', Deferred: '', Due_Date: '' }, o));
const states = [st({}), st({ Status: 'UPLOADED' }), st({ Status: 'UPLOADED', Review_Started_At: 'x' }), st({ Status: 'VERIFIED' }), st({ Status: 'VERIFIED', Keep: 'ORIGINAL' }),
  st({ Physical: 'RECEIVED' }), st({ Status: 'VERIFIED', Physical: 'RECEIVED' }), st({ Status: 'REJECTED' }), st({ Status: 'EXPIRED', Physical: 'RECEIVED' }), st({ Deferred: 'Y', Due_Date: '2099-01-01' }),
  st({ Status: 'WAIVED' }), st({ Status: 'SUSPECT' }), st({ Status: 'REPLACEMENT' })];
ok(new Set(states).size === 13 && states.join() === 'NOT_SUBMITTED,UPLOADED,UNDER_REVIEW,VERIFIED_DIGITAL,ORIGINAL_PENDING,ORIGINAL_RECEIVED,COMPLETED,REJECTED,EXPIRED,DEFERRED,WAIVED,SUSPECT,REPLACEMENT', 'all 13 states: ' + states.join());
ok(!ctx.docDone_({ Status: 'EXPIRED', Digital: 'Y', Physical: 'RECEIVED' }) && ctx.docDone_({ Status: 'VERIFIED', Digital: 'Y', Physical: 'RECEIVED' }), 'an expired document is not complete');

// =============== FIL-001: expiry and renewal (daily) ===============
J = must(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'UPLOAD', file: { name: 'id.png', mime: 'image/png', data: png } }), 'ID upload').joining;
J = must(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'VERIFY', Expiry_Date: ctx.addDaysYmd_(today, 400) }), 'ID verify').joining;
fresh(); ctx.update_('JOININGS', JID, { Status: 'JOINED' }, 'x');
ctx.update_('CANDIDATE_DOCS', doc('NATIONAL_ID').Doc_ID, { Expiry_Date: ctx.addDaysYmd_(today, 10) }, 'x');
mails.length = 0; fresh(); let D = ctx.docExpiryDaily_(true);
ok(D.renew === 0, 'on a day off: no renewal notice');
mails.length = 0; fresh(); D = ctx.docExpiryDaily_(false);
ok(D.renew === 1 && mails.some(m => m.to === 'ahmed@mail.test' && /تجديد/.test(m.subject)), 'renewal notice 30 days before: the employee is e-mailed');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /قرب ينتهي/.test(n.Title)), 'the team told');
fresh(); ok(ctx.docExpiryDaily_(false).renew === 0, 'renewal notice once');
fresh(); ctx.update_('CANDIDATE_DOCS', doc('NATIONAL_ID').Doc_ID, { Expiry_Date: ctx.addDaysYmd_(today, -1) }, 'x');
mails.length = 0; fresh(); D = ctx.docExpiryDaily_(true);
fresh(); let idDoc = ctx.get_('CANDIDATE_DOCS', doc('NATIONAL_ID').Doc_ID);
ok(D.expired === 1 && idDoc.Status === 'EXPIRED' && idDoc.Expired_At, 'expired — even on a day off');
ok(mails.some(m => m.to === 'ahmed@mail.test' && /انتهت/.test(m.htmlBody)) && ctx.find_('NOTIFICATIONS', { User_ID: U.rec }).some(n => /انتهت صلاحيته/.test(n.Title)), 'the employee asked to renew, the team told');
J = must(api('cand.app', t.rec, { Application_ID: H1.A }), 'app 5').joining;
ok(doc('NATIONAL_ID').state === 'EXPIRED' && !doc('NATIONAL_ID').done, 'shown as expired, not complete');
J = must(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'UPLOAD', file: { name: 'id2.png', mime: 'image/png', data: png } }), 'renewed copy').joining;
bad(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'VERIFY', Expiry_Date: ctx.addDaysYmd_(today, -3) }), /منتهي/, 'an expired copy is not verified');
J = must(api('doc.action', t.rec, { Doc_ID: doc('NATIONAL_ID').Doc_ID, action: 'VERIFY', Expiry_Date: ctx.addDaysYmd_(today, 2000) }), 'renewed verify').joining;
fresh(); idDoc = ctx.get_('CANDIDATE_DOCS', doc('NATIONAL_ID').Doc_ID);
ok(idDoc.Status === 'VERIFIED' && !idDoc.Expired_At && !idDoc.Renew_Notice_At, 'renewed: the expiry markers cleared');

// =============== DOC-002: deferred documents ===============
const dm = doc('MILITARY');
J = must(api('doc.action', t.rm, { Doc_ID: dm.Doc_ID, action: 'DEFER', Due_Date: ctx.addDaysYmd_(today, 3), reason: 'مستني الشهادة من التجنيد' }), 'defer').joining;
ok(doc('MILITARY').state === 'DEFERRED', 'deferred state');
mails.length = 0; fresh(); D = ctx.docExpiryDaily_(true);
ok(D.reminded === 0 && !mails.length, 'no reminder on a day off');
mails.length = 0; fresh(); D = ctx.docExpiryDaily_(false);
ok(D.reminded === 1 && mails.some(m => m.to === 'ahmed@mail.test' && /مستند مؤجل/.test(m.subject)), 'the employee reminded 3 days before');
mails.length = 0; fresh(); ok(ctx.docExpiryDaily_(false).reminded === 0, 'once that day');
fresh(); ctx.update_('CANDIDATE_DOCS', dm.Doc_ID, { Due_Date: ctx.addDaysYmd_(today, -6) }, 'x');
fresh(); ok(ctx.docExpiryDaily_(false).escalated === 0, 'not escalated before 7 days');
fresh(); ctx.update_('CANDIDATE_DOCS', dm.Doc_ID, { Due_Date: ctx.addDaysYmd_(today, -7) }, 'x');
fresh(); D = ctx.docExpiryDaily_(false);
fresh(); ok(D.escalated === 1 && ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /تصعيد: مستند مؤجل متأخر 7 يوم/.test(n.Title)), '7 days late → the HR manager');
fresh(); ok(ctx.docExpiryDaily_(false).escalated === 0, 'escalated once');

// =============== CHG-84: hiring restrictions ===============
const per = ctx.get_('APPLICATIONS', H1.A).Person_ID;
const two = ctx.addDaysYmd_(today, 740), one = ctx.addDaysYmd_(today, 365);
bad(api('restrict.add', t.hr, { Person_ID: per, Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024 بعد إنذارين', Permanent: 'Y' }), /مفيش قيد دائم/, 'no permanent restriction');
bad(api('restrict.add', t.hr, { Person_ID: per, Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024 بعد إنذارين', Review_Date: two }), /سنتين/, 'review at most 2 years away');
const R1 = must(api('restrict.add', t.hr, { Person_ID: per, Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 15 لسنة 2024 بعد إنذارين', Review_Date: one, Permanent: 'Y' }), 'restriction');
fresh(); ok(ctx.get_('HIRING_RESTRICTIONS', R1.Restriction_ID).Permanent === 'N' && ctx.get_('HIRING_RESTRICTIONS', R1.Restriction_ID).Review_Date === one, 'saved with its review date, never permanent');
bad(api('restrict.appeal', t.hr, { Restriction_ID: R1.Restriction_ID, note: 'قصير' }), /10 حروف/, 'appeal needs its grounds');
must(api('restrict.appeal', t.hr, { Restriction_ID: R1.Restriction_ID, note: 'كان في إجازة مرضية بشهادة معتمدة وقت الغياب' }), 'appeal recorded');
fresh(); ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hs }).some(n => /تظلم/.test(n.Title)), 'the HR Sector Manager told');
bad(api('restrict.appeal', t.hr, { Restriction_ID: R1.Restriction_ID, note: 'تظلم تاني على نفس القيد' }), /مستني القرار/, 'one open appeal at a time');
bad(api('restrict.decide', t.hr, { Restriction_ID: R1.Restriction_ID, decision: 'LIFT', note: 'مقبول' }), /مدير قطاع/, 'the HR manager cannot decide the appeal');
bad(api('restrict.decide', t.hs, { Restriction_ID: R1.Restriction_ID, decision: 'LIFT', note: '' }), /أسباب/, 'decision needs reasons');
must(api('restrict.decide', t.hs, { Restriction_ID: R1.Restriction_ID, decision: 'LIFT', note: 'الشهادة الطبية سليمة' }), 'appeal accepted');
fresh(); let Rr = ctx.get_('HIRING_RESTRICTIONS', R1.Restriction_ID);
ok(Rr.Status === 'Lifted' && Rr.Appeal_Decision === 'LIFT' && Rr.Appeal_Decided_By === U.hs && /تظلم اتقبل/.test(Rr.Lifted_Reason), 'lifted by the appeal decision');
ok(ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /قرار التظلم/.test(n.Title)), 'who recorded the appeal hears the decision');
// the HR Sector Manager's own restriction: the appeal goes to the CEO
const R2 = must(api('restrict.add', t.hs, { Person_ID: per, Reason_Code: 'ABANDONMENT', Evidence: 'قرار رقم 22 لسنة 2025 بعد تحقيق', Review_Date: one }), 'restriction 2');
must(api('restrict.appeal', t.hr, { Restriction_ID: R2.Restriction_ID, note: 'التحقيق ماسمعش أقواله خالص' }), 'appeal 2');
fresh(); const dec2 = ctx.roleUserIds_(['HR_SECTOR_MANAGER']).filter(u => u !== U.hs && u !== U.hr);
ok(!ctx.find_('NOTIFICATIONS', { User_ID: U.hs }).some(n => /تظلم من قيد/.test(n.Title) && n.Link_ID === R2.Restriction_ID) &&
  (dec2.length ? dec2 : [U.ceo]).every(u => ctx.find_('NOTIFICATIONS', { User_ID: u }).some(n => /تظلم/.test(n.Title) && n.Link_ID === R2.Restriction_ID)), 'the appeal goes to another sector manager or the CEO, never to who placed it');
bad(api('restrict.decide', t.hs, { Restriction_ID: R2.Restriction_ID, decision: 'LIFT', note: 'مقبول' }), /التنفيذي/, 'who placed it does not decide its appeal');
must(api('restrict.decide', t.ceo, { Restriction_ID: R2.Restriction_ID, decision: 'UPHOLD', note: 'التحقيق سليم' }), 'CEO upholds');
fresh(); Rr = ctx.get_('HIRING_RESTRICTIONS', R2.Restriction_ID);
ok(Rr.Status === 'Active' && Rr.Appeal_Decision === 'UPHOLD', 'upheld: still active');
// review reminder + renewal
fresh(); ctx.update_('HIRING_RESTRICTIONS', R2.Restriction_ID, { Review_Date: today }, 'x');
fresh(); ok(ctx.restrictionDaily_().review === 1 && ctx.find_('NOTIFICATIONS', { User_ID: U.hr }).some(n => /وقت مراجعة قيد/.test(n.Title)), 'review date came → HR told');
fresh(); ok(ctx.restrictionDaily_().review === 0, 'told once per review date');
const RL = must(api('restrict.list', t.hr, {}), 'list');
ok(RL.rows.find(r => r.Restriction_ID === R2.Restriction_ID).reviewDue, 'shown as due in the list');
bad(api('restrict.renew', t.hr, { Restriction_ID: R2.Restriction_ID, Review_Date: two, reason: 'السبب قائم' }), /سنتين/, 'renewal also within 2 years');
must(api('restrict.renew', t.hr, { Restriction_ID: R2.Restriction_ID, Review_Date: one, reason: 'السبب لسه قائم' }), 'renewed');
fresh(); ok(ctx.get_('HIRING_RESTRICTIONS', R2.Restriction_ID).Review_Date === one && ctx.restrictionDaily_().review === 0, 'new review date');

// =============== VAC-002: the request closes by itself ===============
const rq2 = newReq(tO, 2, 'محتاجين اتنين للوردية التانية');
fresh(); const V2 = ctx.find_('VACANCIES', { Request_ID: rq2.Request_ID })[0].Vacancy_ID;
ok(ctx.get_('RECRUITMENT_REQUESTS', rq2.Request_ID).Status === 'APPROVED', 'approved request');
must(api('vac.fill', t.rm, { Vacancy_ID: V2, Method: 'EXTERNAL', Employee_Name: 'علي حسن', Employee_ID: 'E-501', Effective_Date: today }), 'fill 1');
fresh(); ok(ctx.get_('RECRUITMENT_REQUESTS', rq2.Request_ID).Status === 'APPROVED', 'half filled: still open');
const F2 = must(api('vac.fill', t.rm, { Vacancy_ID: V2, Method: 'EXTERNAL', Employee_Name: 'حسن علي', Employee_ID: 'E-502', Effective_Date: today }), 'fill 2');
fresh(); let R = ctx.get_('RECRUITMENT_REQUESTS', rq2.Request_ID);
ok(R.Status === 'CLOSED' && R.Closed_At, 'every vacancy filled → the request closes');
ok(ctx.find_('EVENTS', { Entity_ID: rq2.Request_ID }).some(e => e.Event === 'REQUEST_CLOSED'), 'event recorded');
ok(ctx.find_('NOTIFICATIONS', { Link_ID: rq2.Request_ID }).some(n => /اتقفل/.test(n.Title)), 'the requester told');
must(api('vac.fillVoid', t.hr, { Fill_ID: F2.fill.Fill_ID, reason: 'الموظف ما استلمش' }), 'void');
fresh(); R = ctx.get_('RECRUITMENT_REQUESTS', rq2.Request_ID);
ok(R.Status === 'APPROVED' && !R.Closed_At && ctx.find_('EVENTS', { Entity_ID: rq2.Request_ID }).some(e => e.Event === 'REQUEST_REOPENED'), 'a voided fill reopens it');
// HR cuts the number down to those already hired → the vacancy is filled and the request closes
fresh(); const L2 = ctx.find_('REQUEST_LINES', { Request_ID: rq2.Request_ID })[0];
must(api('req.change', t.hr, { Request_ID: rq2.Request_ID, lines: [{ Line_ID: L2.Line_ID, HC: 1 }], reason: 'المدير اكتفى بواحد' }), 'cut to 1');
fresh(); ok(ctx.get_('VACANCIES', V2).Status === 'FILLED' && ctx.get_('RECRUITMENT_REQUESTS', rq2.Request_ID).Status === 'CLOSED', 'cut down to those hired → vacancy filled, request closed');
const rq4 = newReq(tO, 1, 'محتاجين واحد للمخزن الجديد');
fresh(); const V4 = ctx.find_('VACANCIES', { Request_ID: rq4.Request_ID })[0].Vacancy_ID;
must(api('vac.update', t.rm, { Vacancy_ID: V4, action: 'CLOSE', reason: 'المشروع اتأجل' }), 'close the vacancy');
fresh(); ok(ctx.get_('RECRUITMENT_REQUESTS', rq4.Request_ID).Status === 'CLOSED', 'closing the last open vacancy closes the request');
const G2 = must(api('req.get', tO, { Request_ID: rq2.Request_ID }), 'closed request view');
ok(G2.request.Status === 'CLOSED', 'the closed request still opens');

// =============== HC-005: headcount reserved by requests in approval ===============
fresh(); const before = ctx.hcOf_(ctx.get_('POSITIONS', POS), ctx.openHcByPosition_());
const rq3 = newReq(t.mgr, 1, 'محتاج محاسب زيادة للجرد السنوي');
fresh(); ok(['IN_APPROVAL', 'HR_REVIEW', 'PENDING_CEO'].indexOf(ctx.get_('RECRUITMENT_REQUESTS', rq3.Request_ID).Status) >= 0, 'the manager\'s request is in approval');
const after = ctx.hcOf_(ctx.get_('POSITIONS', POS), ctx.openHcByPosition_());
ok(after.reserved === (before.reserved || 0) + 1 && after.available === before.available - 1, 'reserved while in approval: ' + JSON.stringify(before) + ' → ' + JSON.stringify(after));
ok(ctx.hcOf_(ctx.get_('POSITIONS', POS), ctx.openHcByPosition_(rq3.Request_ID)).reserved === (before.reserved || 0), 'a request does not reserve against itself');
const G3 = must(api('req.get', tO, { Request_ID: rq3.Request_ID }), 'request view');
ok(G3.lines[0].nowReserved !== undefined, 'the view shows what other requests reserve');

// =============== weekend: expiries run, reminders pause ===============
fresh();
const wk = ctx.dailySteps_(false, true, today).map(s => s.name), wd = ctx.dailySteps_(false, false, today).map(s => s.name);
ok(['sla', 'prob', 'trf', 'docs', 'ceo'].every(n => wk.indexOf(n) >= 0) && ['iv', 'offers', 'joinings', 'restrict', 'onb'].every(n => wk.indexOf(n) < 0), 'days off: expiry, transfers, probation and documents run; reminders do not: ' + wk.join());
ok(['iv', 'offers', 'joinings', 'restrict', 'docs', 'sla'].every(n => wd.indexOf(n) >= 0), 'working days: everything');
// a stale approval step expires on a day off, a fresh one is not reminded
fresh(); const ap = ctx.find_('APPROVAL_INSTANCES', { Entity_ID: rq3.Request_ID, Status: 'PENDING' })[0];
ok(!!ap, 'pending approval step');
ctx.update_('APPROVAL_INSTANCES', ap.Approval_ID, { Activated_At: ctx.addDaysYmd_(today, -4) + 'T09:00:00' }, 'x');
fresh(); let SL = ctx.approvalSla_(true);
ok(SL.reminded === 0 && SL.warned === 0 && SL.escalated === 0 && SL.expired === 0, 'day off: no reminder for a 4-day step');
fresh(); SL = ctx.approvalSla_(false);
ok(SL.reminded + SL.warned === 1, 'working day: reminded / warned');
fresh(); ctx.update_('APPROVAL_INSTANCES', ap.Approval_ID, { Activated_At: ctx.addDaysYmd_(today, -5) + 'T09:00:00' }, 'x');
fresh(); SL = ctx.approvalSla_(true);
fresh(); ok(SL.expired === 1 && ctx.get_('RECRUITMENT_REQUESTS', rq3.Request_ID).Status === 'REJECTED', '5 working days without a decision → rejected, even on a day off');

// =============== migration ===============
fresh();
ctx.update_('CONFIG', 'APPROVAL_EXPIRE_DAYS', { Config_Value: '30' }, 'x'); ctx.update_('CONFIG', 'APPROVAL_EXPIRY_WARN_DAYS', { Config_Value: '5' }, 'x');
ctx.update_('CONFIG', 'APPROVAL_REMIND_DAYS', { Config_Value: '3' }, 'x'); ctx.update_('CONFIG', 'APPROVAL_ESCALATE_DAYS', { Config_Value: '7' }, 'x');
ctx.update_('OFFER_AUTHORITY', recAuth.Authority_ID, { Limit_Point: 'MID', Limit_Pct: '5' }, 'x');
ctx.update_('HIRING_RESTRICTIONS', R2.Restriction_ID, { Permanent: 'Y', Review_Date: '' }, 'x');
delete props.MIG_0400; delete props.MIG_0401; fresh(); ctx.migrate0400_(); fresh(); ctx.migrate0401_();
fresh();
ok(ctx.cfg_('APPROVAL_EXPIRE_DAYS') === 5 && ctx.cfg_('APPROVAL_EXPIRY_WARN_DAYS') === 1 && ctx.cfg_('APPROVAL_REMIND_DAYS') === 2 && ctx.cfg_('APPROVAL_ESCALATE_DAYS') === 3, 'migration: old 30 / 5 / 3 / 7 → 5 / 1 / 2 / 3');
// an install already on v0.40.0 (10 / 3) moves to 5 / 1 too
fresh(); ctx.update_('CONFIG', 'APPROVAL_EXPIRE_DAYS', { Config_Value: '10' }, 'x'); ctx.update_('CONFIG', 'APPROVAL_EXPIRY_WARN_DAYS', { Config_Value: '3' }, 'x');
delete props.MIG_0401; fresh(); ctx.migrate0401_();
fresh(); ok(ctx.cfg_('APPROVAL_EXPIRE_DAYS') === 5 && ctx.cfg_('APPROVAL_EXPIRY_WARN_DAYS') === 1, 'migration from v0.40.0: 10 / 3 → 5 / 1');
ok(ctx.get_('OFFER_AUTHORITY', recAuth.Authority_ID).Limit_Point === 'MIN' && ctx.get_('OFFER_AUTHORITY', recAuth.Authority_ID).Limit_Pct === '0', 'migration: recruiter back to the minimum');
Rr = ctx.get_('HIRING_RESTRICTIONS', R2.Restriction_ID);
ok(Rr.Permanent === 'N' && /^\d{4}-\d{2}-\d{2}$/.test(Rr.Review_Date) && Rr.Review_Date > today, 'migration: a permanent restriction gets a review date');
fresh(); ctx.update_('CONFIG', 'APPROVAL_EXPIRE_DAYS', { Config_Value: '15' }, 'x'); delete props.MIG_0400; delete props.MIG_0401; fresh(); ctx.migrate0400_(); fresh(); ctx.migrate0401_();
fresh(); ok(ctx.cfg_('APPROVAL_EXPIRE_DAYS') === 15, 'migration keeps a value someone chose');

// =============== deletion reaches the contract and the no-insurance form ===============
fresh();
const fid = ctx.get_('JOININGS', JID).Contract_File_ID;
ctx.update_('JOININGS', JID, { Status: 'DID_NOT_JOIN' }, 'x'); ctx.update_('APPLICATIONS', H1.A, { Stage: 'WITHDRAWN' }, 'x');
ctx.update_('OFFERS', O.Offer_ID, { No_Ins_Form_File: 'NOINS-FILE-1' }, 'x');
fresh();
const DA = vm.runInContext('DriveApp', ctx);
ctx.withLock_(() => ctx.purgePerson_('x', per, 'طلب حذف'));
fresh();
ok(!ctx.get_('JOININGS', JID).Contract_File_ID && (DA.__files[fid] || {}).__trashed === true, 'the signed contract trashed with the person');
ok(!ctx.get_('OFFERS', O.Offer_ID).No_Ins_Form_File, 'the no-insurance form link cleared too');

console.log('\nphase40: ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
