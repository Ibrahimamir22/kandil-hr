// v0.46.2 (CHG-100): the signed no-insurance acknowledgement is a joining document — only on a no-insurance contract,
// required, never deferred or waived, uploaded before joining, on the receipt, deleted with the documents. Setup from phase20.
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

const PDF = n => ({ name: n, mime: 'application/pdf', data: Buffer.from('%PDF-1.4 ' + n).toString('base64') });
function acceptedJoining(name, mobile, extra) {
  const H = hire(name, mobile, 'M', extra);
  let O = must(api('offer.action', t.rm, { Offer_ID: H.O.Offer_ID, action: 'SUBMIT', hcOverride: 'للاختبار' }), 'submit ' + name).offer;
  if (O.Status === 'PENDING_APPROVAL') O = must(api('offer.action', t.ceo, { Offer_ID: O.Offer_ID, action: 'APPROVE', note: 'موافق' }), 'CEO approves').offer;
  O = accept(O);
  const J = must(api('cand.app', t.rec, { Application_ID: H.A }), 'app').joining;
  fresh(); ctx.__nidForJoining(J.Joining_ID);
  return { H, O, J };
}
const ackOf = jid => { fresh(); return ctx.findOne_('CANDIDATE_DOCS', { Joining_ID: jid, Doc_Code: 'NO_INS_ACK' }); };

// ---- the type: a system document, not editable from the document-types screen
let DT = must(api('doctype.list', t.hr, {}), 'doc types');
ok(DT.rows.some(r => r.Doc_Code === 'NO_INS_ACK' && r.Deferrable === 'N'), 'the acknowledgement is a document type');
bad(api('doctype.save', t.hr, { Doc_Code: 'NO_INS_ACK', Name_AR: 'تجربة تعديل', Keep: 'COPY', Scope: 'ALL', Status: 'Inactive' }), /مستند نظام/, 'its settings cannot be changed');

// ---- an insured contract: not on the list, and cannot be added
const I1 = acceptedJoining('أحمد علي حسن', '01011112222');
ok(!I1.J.docs.some(d => d.Doc_Code === 'NO_INS_ACK') && !I1.J.extraTypes.some(x => x.code === 'NO_INS_ACK'), 'insured contract: no acknowledgement, not offered as an extra');
bad(api('doc.add', t.rec, { Joining_ID: I1.J.Joining_ID, Doc_Code: 'NO_INS_ACK' }), /من غير تأمينات بس/, 'cannot be added to an insured contract');

// ---- before acceptance the upload has nowhere to go
const N0 = hire('مينا سمير فؤاد', '01022223333', 'M', { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' });
bad(api('offer.noInsUpload', t.rec, { Offer_ID: N0.O.Offer_ID, files: [PDF('early.pdf')] }), /مسوغات التعيين بعد/, 'before acceptance: upload refused, it belongs to the joining documents');

// ---- a no-insurance contract: required, first on the list
const N1 = acceptedJoining('سامي نبيل رزق', '01099990000', { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' });
const ack = N1.J.docs.find(d => d.Doc_Code === 'NO_INS_ACK');
ok(ack && ack.Required === 'Y' && ack.Status === 'MISSING' && /من غير تأمينات/.test(ack.Name), 'no-insurance contract: the acknowledgement is a required joining document');
ok(N1.J.summary.required === N1.J.docs.filter(d => d.Required === 'Y').length, 'it counts in the documents summary');
ok(/صاحب معاش/.test(must(api('offer.noInsForm', t.rec, { Offer_ID: N1.O.Offer_ID }), 'print').html), 'printed with the legal basis (from the joining card: same form)');
// never deferred or waived — even by the recruitment manager
bad(api('doc.action', t.rm, { Doc_ID: ack.Doc_ID, action: 'WAIVE', reason: 'مش محتاجينه دلوقتي' }), /مايتلغيش/, 'cannot be waived');
bad(api('doc.action', t.rm, { Doc_ID: ack.Doc_ID, action: 'DEFER', Due_Date: ctx.addDaysYmd_(today, 5), reason: 'هيجيبه بعدين' }), /مايتأجلش/, 'cannot be deferred');
// every other document waived: joining still waits for the acknowledgement, and «allow with missing documents» does not cover it
fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: N1.J.Joining_ID }).filter(d => d.Doc_Code !== 'NO_INS_ACK').forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'WAIVED' }, 'x'));
bad(api('join.action', t.rec, { Joining_ID: N1.J.Joining_ID, action: 'JOINED', date: today, Employee_ID: 'E-8001' }), /إقرار عدم التأمين/, 'no joining before the signed acknowledgement');
bad(api('join.action', t.rm, { Joining_ID: N1.J.Joining_ID, action: 'JOINED', date: today, Employee_ID: 'E-8001', override: 'استثناء من مدير التوظيف' }), /إقرار عدم التأمين/, 'the missing-documents override does not cover it');
fresh(); ok(ctx.get_('JOININGS', N1.J.Joining_ID).Status === 'PENDING', 'still pending');
// uploaded on the documents list (the paper consent asked first, as for every upload)
must(api('doc.action', t.rec, { Doc_ID: ack.Doc_ID, action: 'UPLOAD', paperConsent: 'Y', file: PDF('signed.pdf') }), 'signed copy uploaded on the documents');
ok(ackOf(N1.J.Joining_ID).Status === 'UPLOADED' && JSON.parse(ackOf(N1.J.Joining_ID).Files_JSON).length === 1, 'stored on the document');
ok(must(api('cand.app', t.rec, { Application_ID: N1.H.A }), 'app 2').offer.offers.some(o => o.Offer_ID === N1.O.Offer_ID && o.noInsForm), 'the offer card shows it as uploaded');
must(api('doc.action', t.rec, { Doc_ID: ack.Doc_ID, action: 'VERIFY' }), 'reviewed'); must(api('doc.action', t.rec, { Doc_ID: ack.Doc_ID, action: 'PHYSICAL' }), 'original received');
must(api('join.action', t.rec, { Joining_ID: N1.J.Joining_ID, action: 'JOINED', date: today, Employee_ID: 'E-8001' }), 'joined once it is on file');
// on the receipt
const R = must(api('doc.receipt', t.rec, { Joining_ID: N1.J.Joining_ID }), 'receipt');
ok(/إقرار التعاقد من غير تأمينات/.test(R.html), 'the receipt lists it');

// ---- the contract names the request's employment type (fixed-term printed as «full time» before v0.46.2)
fresh(); const rqId = ctx.get_('VACANCIES', VAC).Request_ID; ctx.update_('RECRUITMENT_REQUESTS', rqId, { Employment_Type: 'CONTRACT' }, 'x');
// v0.47.0 (CHG-101): a fixed-term contract has its own template (phase51) and waits for its legal data
bad(api('join.contract', t.rec, { Joining_ID: N1.J.Joining_ID }), /مايتطبعش قبل ما تكمّل/, 'fixed-term: its own template, waiting for its data');
fresh(); ctx.update_('RECRUITMENT_REQUESTS', rqId, { Employment_Type: 'INTERNSHIP' }, 'x');
let K = must(api('join.contract', t.rec, { Joining_ID: N1.J.Joining_ID }), 'contract');
ok(/تدريب/.test(K.html) && !/دوام كامل/.test(K.html), 'an internship printed as such');
fresh(); ctx.update_('RECRUITMENT_REQUESTS', rqId, { Employment_Type: 'DAILY' }, 'x');
ok(/يومية/.test(must(api('join.contract', t.rec, { Joining_ID: N1.J.Joining_ID }), 'contract 2').html), 'daily contract printed as such');
fresh(); ctx.update_('RECRUITMENT_REQUESTS', rqId, { Employment_Type: 'FULL_TIME' }, 'x');

// ---- an upload sent to the offer (older pages) lands on the same document
const N2 = acceptedJoining('رامي فهمي عادل', '01088887777', { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' });
must(api('offer.noInsUpload', t.rec, { Offer_ID: N2.O.Offer_ID, files: [PDF('via-offer.pdf')] }), 'upload through the offer');
fresh(); ok(ackOf(N2.J.Joining_ID).Status === 'UPLOADED' && !ctx.get_('OFFERS', N2.O.Offer_ID).No_Ins_Form_File, 'it is on the joining document, not on the offer');

// ---- the upgrade: open joinings get the document; one uploaded on the offer moves onto it
const N3 = acceptedJoining('هاني جرجس لبيب', '01077776666', { No_Insurance: 'Y', No_Ins_Basis: 'صاحب معاش' });
// no delete in the mocks: an older joining is simulated by moving its row away
fresh(); if (ackOf(N3.J.Joining_ID)) ctx.update_('CANDIDATE_DOCS', ackOf(N3.J.Joining_ID).Doc_ID, { Doc_Code: 'OLD_X', Joining_ID: 'GONE' }, 'x');
fresh(); ctx.update_('OFFERS', N3.O.Offer_ID, { No_Ins_Form_File: 'OLD-OFFER-FILE' }, 'x');
ok(!ackOf(N3.J.Joining_ID), 'before: an older joining without the document');
delete props.MIG_0462; fresh(); ctx.migrate0462_();
const m = ackOf(N3.J.Joining_ID);
ok(m && m.Status === 'UPLOADED' && JSON.parse(m.Files_JSON)[0].id === 'OLD-OFFER-FILE', 'upgrade: the document added with the file already uploaded');
fresh(); ok(!ctx.get_('OFFERS', N3.O.Offer_ID).No_Ins_Form_File, 'the file kept in one place (moved off the offer)');
fresh(); ok(ctx.find_('CANDIDATE_DOCS', { Joining_ID: N2.J.Joining_ID, Doc_Code: 'NO_INS_ACK' }).length === 1, 'joinings that have it are left alone');
fresh(); ok(!ctx.findOne_('CANDIDATE_DOCS', { Joining_ID: I1.J.Joining_ID, Doc_Code: 'NO_INS_ACK' }), 'insured joinings untouched');

// ---- deletion reaches it: the signed acknowledgement is trashed with the person's other documents
fresh(); const per = ctx.get_('APPLICATIONS', N2.H.A).Person_ID, ackFile = JSON.parse(ackOf(N2.J.Joining_ID).Files_JSON)[0].id;
ctx.update_('JOININGS', N2.J.Joining_ID, { Status: 'DID_NOT_JOIN' }, 'x'); ctx.update_('APPLICATIONS', N2.H.A, { Stage: 'WITHDRAWN' }, 'x');
fresh(); const DA = vm.runInContext('DriveApp', ctx);
ctx.withLock_(() => ctx.purgePerson_('x', per, 'طلب حذف'));
fresh(); ok((DA.__files[ackFile] || {}).__trashed === true && ackOf(N2.J.Joining_ID).Files_JSON === '[]', 'deletion trashes the signed acknowledgement and clears its link');

console.log('\nPhase 50 (no-insurance acknowledgement as a joining document): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
