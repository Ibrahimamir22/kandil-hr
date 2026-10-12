// v0.39.0: the candidate's own page (CHG-83) — the link (7 days, a new link replaces the old, stops when his applications
// close), his consent there, completing his data and CV, confirming / declining an interview, answering the offer (each
// through the team's own rules, recorded as from the candidate), what the page never shows; private links 7 days and
// revoked when done (CHG-82); the preferred contact channel (COM-002); interview reminders by e-mail (INT-003).
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
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '8']].map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user'); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { mgr: user('mgr@t.com', 'مدير الحسابات', P['مدير الحسابات'].Position_ID), hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), hs: user('hs@t.com', 'مدير القطاع', '', ['HR_SECTOR_MANAGER']),
  rm: user('rm@t.com', 'مدير التوظيف', '', ['RECRUITMENT_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), ceo: user('ceo@t.com', 'الرئيس التنفيذي', '', ['CEO']) };
const t = { mgr: login('mgr@t.com'), hr: login('hr@t.com'), hs: login('hs@t.com'), rm: login('rm@t.com'), rec: login('rec@t.com'), ceo: login('ceo@t.com') };
const JOB = P['محاسب تكاليف'].Job_Code;
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x'); ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const rq = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسبين تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 6 }] }), 'request');
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
must(api('vac.assign', t.rm, { Vacancy_ID: V.Vacancy_ID, Lead_Recruiter_ID: U.rec }), 'assign'); must(api('vac.update', t.rm, { Vacancy_ID: V.Vacancy_ID, action: 'OPEN' }), 'open');
must(api('pay.structures', tO, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' }), 'structure');
const today = ctx.today_(), ver = String(ctx.cfg_('PRIVACY_VERSION', '1'));
fresh(); ctx.update_('VACANCIES', V.Vacancy_ID, { Apply_Enabled: 'Y', Apply_Code: ctx.get_('VACANCIES', V.Vacancy_ID).Apply_Code || 'APPLY38X' }, 'x');
fresh(); const code = ctx.get_('VACANCIES', V.Vacancy_ID).Apply_Code;


const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x');
ctx.__consentReal = true;
// ---------- 1. the link ----------
const C = must(api('cand.create', t.rec, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'كريم عادل منصور', Mobile: '01011112222', Email: 'karim@mail.test', Source: 'WALK_IN', consent: 'Y' }), 'hand-added').application;
bad(api('cand.selfLink', t.mgr, { Application_ID: C.Application_ID }), null, 'the hiring manager cannot send the page link');
const L1 = must(api('cand.selfLink', t.rec, { Application_ID: C.Application_ID }), 'link 1');
const tok = u => /\?me=([A-Za-z0-9]+)/.exec(u)[1];
ok(L1.until === ctx.addDaysIso_(7).slice(0, 10) && /صفحتك/.test(L1.text) && L1.phone === '201011112222', 'link 7 days with a WhatsApp text');
const L2 = must(api('cand.selfLink', t.rec, { Application_ID: C.Application_ID }), 'link 2');
bad(pub('self.info', { token: tok(L1.url) }), /اتلغى/, 'a new link replaces the old one');
const T2 = tok(L2.url);
// ---------- 2. consent first, nothing else before it ----------
let I = must(pub('self.info', { token: T2 }), 'page');
ok(I.consentOk === false && I.privacy && !I.apps.length && I.name === 'كريم', 'not consented yet: only the notice is shown');
bad(pub('self.save', { token: T2, fields: { City: 'مدينة نصر' } }), /إشعار الخصوصية/, 'no data before consent');
I = must(pub('self.consent', { token: T2, consent: 'Y', consentTransfer: 'Y', version: ver }), 'consent on the page');
fresh(); ok(ctx.get_('PERSONS', C.Person_ID).Consent_Version === ver && I.consentOk && I.apps.length === 1, 'consent recorded from the page');
// ---------- 3. completing his data ----------
bad(pub('self.save', { token: T2, fields: { Email: 'not-an-email' } }), /البريد/, 'the same checks as everywhere');
I = must(pub('self.save', { token: T2, fields: { City: 'مدينة نصر', Governorate: 'القاهرة', Experience_Years: '4', Preferred_Channel: 'WHATSAPP', National_ID: '29001011234567', Full_Name: 'اسم تاني خالص', Mobile: '01099999999' },
  cv: { name: 'cv.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 cv').toString('base64') } }), 'data saved');
fresh(); let per = ctx.get_('PERSONS', C.Person_ID);
ok(per.City === 'مدينة نصر' && per.Experience_Years === '4' && per.Preferred_Channel === 'WHATSAPP' && per.National_ID === '29001011234567' && per.CV_File_ID, 'his data, CV, channel and the empty National ID saved');
ok(per.Full_Name === 'كريم عادل منصور' && per.Mobile === '01011112222', 'name and mobile cannot be changed from the page');
must(pub('self.save', { token: T2, fields: { National_ID: '29902021234567' } }), 'NID again');
fresh(); ok(ctx.get_('PERSONS', C.Person_ID).National_ID === '29001011234567', 'a recorded National ID is not replaced from the page');
ok(ctx.find_('ACTIVITIES', { Application_ID: C.Application_ID }).some(a => /حدّث بياناته من صفحته/.test(a.Note)), 'logged on the application');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rec && /حدّث بياناته/.test(n.Title)), 'recruiter told');
ok(must(api('cand.app', t.rec, { Application_ID: C.Application_ID }), 'app').person.Preferred_Channel === 'WHATSAPP', 'the team sees the preferred channel');
// ---------- 4. interview: confirm / decline ----------
must(api('cand.move', t.rec, { Application_ID: C.Application_ID, to: 'SHORTLISTED' }), 'shortlist');
const tomorrow = ctx.addDaysYmd_(today, 1);
let iv = must(api('int.create', t.rec, { Application_ID: C.Application_ID, Round_ID: 'R1', Date: tomorrow, Time: '10:00', Mode: 'IN_PERSON', Location_ID: ctx.all_('LOCATIONS')[0].Location_ID, Place: 'الإدارة', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'interview').interview;
fresh(); ctx.update_('INTERVIEWS', iv.Interview_ID, { Status: 'MANAGER_CONFIRMED' }, 'x');
I = must(pub('self.info', { token: T2 }), 'page 2');
ok(!I.apps[0].interviews.length, 'not shown before the team invites him');
must(api('int.action', t.rec, { Interview_ID: iv.Interview_ID, action: 'INVITED', channel: 'WHATSAPP' }), 'invited');
I = must(pub('self.info', { token: T2 }), 'page 3');
const piv = I.apps[0].interviews[0];
ok(piv && piv.canAnswer && piv.date === tomorrow && /الإدارة/.test(piv.place), 'the invitation with date and place');
ok(!JSON.stringify(I).includes('Organizer_ID') && !JSON.stringify(I).includes('Lead_User_ID'), 'no internal fields on the page');
bad(pub('self.interview', { token: T2, Interview_ID: iv.Interview_ID, answer: 'DECLINE' }), /سبب/, 'decline needs a reason');
must(pub('self.interview', { token: T2, Interview_ID: iv.Interview_ID, answer: 'CONFIRM' }), 'candidate confirms');
fresh(); ok(ctx.get_('INTERVIEWS', iv.Interview_ID).Status === 'CONFIRMED' && ctx.get_('INTERVIEWS', iv.Interview_ID).Candidate_Confirmed_At, 'confirmed through the team\'s own rules');
ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'CANDIDATE_CONFIRM' && a.Entity_ID === iv.Interview_ID), 'recorded as from the candidate');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === U.rec && /أكّد المقابلة من صفحته/.test(n.Title)), 'organizer told');
bad(pub('self.interview', { token: T2, Interview_ID: iv.Interview_ID, answer: 'CONFIRM' }), null, 'nothing to answer twice');
// another person's interview through this link
const C3 = must(api('cand.create', t.rec, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'هالة سمير فهمي', Mobile: '01011113333', Source: 'WALK_IN', consent: 'Y' }), 'other').application;
fresh(); ctx.update_('PERSONS', C3.Person_ID, { Consent_Version: ver }, 'x');
must(api('cand.move', t.rec, { Application_ID: C3.Application_ID, to: 'SHORTLISTED' }), 'shortlist other');
const iv3 = must(api('int.create', t.rec, { Application_ID: C3.Application_ID, Round_ID: 'R1', Date: tomorrow, Time: '11:00', Mode: 'PHONE', panel: [{ User_ID: U.rec, Role: 'LEAD' }] }), 'iv other').interview;
bad(pub('self.interview', { token: T2, Interview_ID: iv3.Interview_ID, answer: 'CONFIRM' }), /غير موجودة/, 'someone else\'s interview refused');
// ---------- 5. interview reminders ----------
mails.length = 0; fresh();
ok(ctx.candidateReminder_(ctx.get_('INTERVIEWS', iv.Interview_ID), true) === true, '2-hour e-mail to the candidate');
ok(mails.some(m => m.to === 'karim@mail.test') && ctx.get_('INTERVIEWS', iv.Interview_ID).Cand_Reminded_2H_At, 'sent once and stamped');
fresh(); ok(ctx.candidateReminder_(ctx.get_('INTERVIEWS', iv.Interview_ID), true) === false, 'not twice');
fresh(); ok(ctx.candidateReminder_(ctx.get_('INTERVIEWS', iv.Interview_ID), false) === true, 'the day-before e-mail is separate');
// the panel's day-before reminder goes by e-mail too
mails.length = 0; fresh(); ctx.interviewSla_();
fresh(); ok(mails.some(m => m.to === 'rec@t.com' && /مقابلة/.test(m.subject + m.htmlBody)), 'panel day-before reminder by e-mail');
// ---------- 6. the offer ----------
fresh(); ctx.update_('INTERVIEWS', iv.Interview_ID, { Status: 'COMPLETED', Date: today }, 'x');
must(api('sel.save', t.rec, { Application_ID: C.Application_ID, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' }), 'select');
let O = must(api('offer.save', t.rec, { Application_ID: C.Application_ID, Contract_Basis: 'GROSS', Agreed_Amount: '5800', Joining_Date: '2099-02-01', Incentive_Amount: '', Variable_Note: 'ملاحظة داخلية' }), 'offer').offer;
O = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'SUBMIT' }), 'submit').offer;
if (O.Status === 'PENDING_APPROVAL') O = must(api('offer.action', t.ceo, { Offer_ID: O.Offer_ID, action: 'APPROVE', note: 'ok' }), 'approve').offer;
I = must(pub('self.info', { token: T2 }), 'page offer 0');
ok(!I.apps[0].offers.length, 'an approved offer is not shown before the team presents it');
O = must(api('offer.action', t.rec, { Offer_ID: O.Offer_ID, action: 'PRESENT', via: 'IN_PERSON' }), 'present').offer;
I = must(pub('self.info', { token: T2 }), 'page offer');
const po = I.apps[0].offers[0];
ok(po && /<div/.test(po.letter) && po.validUntil, 'the presented letter is shown');
ok(!JSON.stringify(I).includes('Incentive') && !JSON.stringify(I).includes('ملاحظة داخلية') && !JSON.stringify(I).includes('Approved_Package'), 'no incentive, internal notes or approvals on the page');
bad(pub('self.offer', { token: T2, Offer_ID: O.Offer_ID, answer: 'DECLINE', reason: 'NO_RESPONSE' }), /السبب|سبب/, 'decline needs a real reason');
must(pub('self.offer', { token: T2, Offer_ID: O.Offer_ID, answer: 'ACCEPT', note: 'متحمس أبدأ' }), 'candidate accepts');
fresh(); const Oa = ctx.get_('OFFERS', O.Offer_ID), Aa = ctx.get_('APPLICATIONS', C.Application_ID);
ok(Oa.Status === 'ACCEPTED' && /صفحة المرشح/.test(Oa.Response_Note) && Aa.Stage === 'ACCEPTED' && ctx.findOne_('JOININGS', { Application_ID: C.Application_ID }), 'accepted with the joining opened, noted as from the candidate');
ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'CANDIDATE_ACCEPT' && a.Entity_ID === O.Offer_ID), 'audited');
// ---------- 7. the link stops when his applications close ----------
fresh(); ctx.update_('APPLICATIONS', C.Application_ID, { Stage: 'JOINED' }, 'x');
bad(pub('self.info', { token: T2 }), /مفيش طلبات مفتوحة/, 'no open applications → the link is done');
// expiry
const L4 = must(api('cand.selfLink', t.rec, { Application_ID: C3.Application_ID }), 'link other');
fresh(); ctx.update_('PERSONS', C3.Person_ID, { Self_Link_Until: '2000-01-01T00:00:00' }, 'x');
bad(pub('self.info', { token: tok(L4.url) }), /انتهت/, 'expired link refused');
// ---------- 8. private links 7 days, revoked when done ----------
fresh(); ok(ctx.cfg_('DOC_LINK_DAYS') === 7 && ctx.cfg_('NHV_LINK_DAYS') === 7 && ctx.cfg_('PROB_LINK_DAYS') === 7 && ctx.cfg_('SELF_LINK_DAYS') === 7 && ctx.cfg_('CONSENT_LINK_DAYS') === 7, 'all private links 7 days');
fresh(); ctx.update_('CONFIG', 'DOC_LINK_DAYS', { Config_Value: '30' }, 'x'); ctx.update_('CONFIG', 'NHV_LINK_DAYS', { Config_Value: '20' }, 'x');
ctx.PropertiesService.getScriptProperties().deleteProperty('MIG_0390'); ctx.migrate0390_();
fresh(); ok(ctx.cfg_('DOC_LINK_DAYS') === 7 && ctx.cfg_('NHV_LINK_DAYS') === 20, 'upgrade: the old default 30 → 7, a value the owner changed stays');
const J = ctx.findOne_('JOININGS', { Application_ID: C.Application_ID });
const DL = must(api('join.action', t.rec, { Joining_ID: J.Joining_ID, action: 'LINK' }), 'docs link');
ok(DL.until === ctx.addDaysYmd_(today, 7), 'documents link 7 days');
fresh(); ctx.find_('CANDIDATE_DOCS', { Joining_ID: J.Joining_ID }).forEach(d => ctx.update_('CANDIDATE_DOCS', d.Doc_ID, { Status: 'WAIVED' }, 'x'));
const dt = /\?docs=([A-Za-z0-9]+)/.exec(DL.link)[1];
must(pub('docs.info', { token: dt }), 'docs page works');
must(api('doc.receipt', t.rec, { Joining_ID: J.Joining_ID }), 'receipt issued');
bad(pub('docs.info', { token: dt }), null, 'documents link revoked once the receipt is issued');

console.log(`phase39: ${pass} passed, ${failN} failed`);
