// v0.45.0 (CHG-96): manager review rounds for draft JDs — HR opens a round, each job's direct manager (from the structure)
// gets one e-mail and an inbox item, reads the draft (no grade), answers agree / notes; one reminder; HR follows and closes.
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
fresh(); if (!ctx.all_('GRADES').length) ctx.seedGrades_();
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'العمليات', '', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '12', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', '', '', '', 'رئيس قسم الدهان', 'العبور', '', 'Y', '9', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'مشرف الرش', 'العبور', '', 'Y', '8', ''],
  ['قنديل مصر', 'العمليات', 'الدهان', 'خط الرش', '', '', 'فني رش', 'العبور', 'مشرف الرش', '', '5', ''],
  ['قنديل مصر', 'الجودة', '', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '13', ''],
  ['قنديل مصر', 'الجودة', '', '', '', '', 'أخصائي جودة', 'العبور', 'مدير الجودة', '', '6', '']].map(r => r.join('\t')).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const C = t => P[t].Job_Code;
function user(email, name, pos, roles) { const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + name); if (roles) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }), 'roles'); return u.User_ID; }
const U = { hr: user('hr@t.com', 'منى', '', ['HR_MANAGER']), rec: user('rec@t.com', 'سارة', '', ['RECRUITER']), st: user('st@t.com', 'هالة', '', ['HR_STAFF']),
  pm: user('pm@t.com', 'مدير الإنتاج', P['مدير الإنتاج'].Position_ID), head: user('head@t.com', 'رئيس قسم الدهان', P['رئيس قسم الدهان'].Position_ID),
  sup: user('sup@t.com', 'مشرف الرش', P['مشرف الرش'].Position_ID) };
const tH = login('hr@t.com'), tR = login('rec@t.com'), tS = login('st@t.com'), tPM = login('pm@t.com'), tHead = login('head@t.com'), tSup = login('sup@t.com');
const resp = Array.from({ length: 8 }, (_, i) => 'مسؤولية رقم ' + (i + 1) + ' بنتيجتها');
['فني رش', 'مشرف الرش', 'رئيس قسم الدهان', 'أخصائي جودة'].forEach(t => must(api('jd.save', tO, { Job_Code: C(t), Purpose: 'الغرض من وظيفة ' + t + ' بوضوح', Career_Level: 'JL2', resp }), 'draft ' + t));
// an approved JD (not a draft) is never sent
must(api('jd.save', tO, { Job_Code: C('مدير الإنتاج'), Purpose: 'إدارة الإنتاج بكفاءة وأمان', Career_Level: 'JL6', resp }), 'draft pm');
must(api('jd.approve', tO, { Job_Code: C('مدير الإنتاج'), reason: 'x' }), 'approve pm');

// ---- preview: who reviews what, nothing written ----
let r = api('jdr.start', tR, { all: 'Y', preview: true });
ok(!r.ok, 'a recruiter cannot open a round');
r = api('jdr.start', tPM, { all: 'Y', preview: true });
ok(!r.ok, 'a manager cannot open a round');
let pv = must(api('jdr.start', tH, { all: 'Y', preview: true }), 'preview');
ok(pv.drafts === 4 && pv.jobs === 3 && pv.rows === 3 && pv.reviewers === 3, 'preview: 4 drafts, 3 with a reviewer: ' + JSON.stringify([pv.drafts, pv.jobs, pv.rows, pv.reviewers]));
ok(pv.noReviewer.length === 1 && pv.noReviewer[0].code === C('أخصائي جودة') && /مدير الجودة/.test(pv.noReviewer[0].missing[0]), 'the job whose manager has no account is listed with that manager');
fresh(); ok(ctx.all_('JD_REVIEWS').length === 0 && ctx.all_('JD_REVIEW_ROUNDS').length === 0, 'preview writes nothing');
r = api('jdr.start', tH, { all: 'Y', due: ctx.today_() });
ok(!r.ok && /بعد النهارده/.test(r.error), 'the due date must be after today');

// ---- start: rows, notifications, one e-mail per manager ----
mails.length = 0; fresh(); const n0 = ctx.all_('NOTIFICATIONS').length;
const st = must(api('jdr.start', tH, { all: 'Y' }), 'start');
fresh(); const rows = ctx.all_('JD_REVIEWS'), round = ctx.get_('JD_REVIEW_ROUNDS', st.Round_ID);
const who = code => rows.filter(x => x.Job_Code === code).map(x => x.Reviewer_User_ID);
ok(round.Status === 'OPEN' && round.Due_Date === ctx.jdrAddWorkDays_(ctx.today_(), 10), 'the round is open, due in 10 working days: ' + round.Due_Date);
ok(who(C('فني رش'))[0] === U.sup && who(C('مشرف الرش'))[0] === U.head && who(C('رئيس قسم الدهان'))[0] === U.pm, 'each draft goes to its direct manager from the structure');
ok(!who(C('مدير الإنتاج')).length, 'an approved JD is not sent');
const nn = ctx.all_('NOTIFICATIONS').slice(n0);
ok([U.sup, U.head, U.pm].every(u => nn.some(n => n.User_ID === u && n.Link_Type === 'JDR')), 'every reviewer has a portal notification');
const mFor = e => mails.filter(m => m.to === e && /مراجعتك/.test(m.subject));
ok(mFor('sup@t.com').length === 1 && /فني رش/.test(mFor('sup@t.com')[0].htmlBody) && mFor('pm@t.com').length === 1 && st.mailed === 3, 'one e-mail per manager listing his job: ' + st.mailed);
ok(!mails.some(m => /Job Level|الدرجة/.test(m.htmlBody || '')), 'no grade in the e-mails');
ok(rows.every(x => x.Mailed_At), 'every row marked mailed');
r = api('jdr.start', tH, { all: 'Y' });
ok(!r.ok && /مفيش مسودات جديدة/.test(r.error), 'the same drafts are not sent twice while the round is open');

// ---- the manager: inbox, list, the draft without the grade ----
fresh(); let td = must(api('todo', tSup, {}), 'todo');
ok(td.jdr && td.jdr.n === 1, 'the manager has one item in «المطلوب منك»');
const mine = must(api('jdr.mine', tSup, {}), 'mine').rows;
ok(mine.length === 1 && mine[0].code === C('فني رش') && mine[0].status === 'PENDING', 'he sees only his own review');
const g = must(api('jdr.get', tSup, { Review_ID: mine[0].Review_ID }), 'get');
ok(g.jd.Purpose && g.jd.resp.length === 8 && g.job.title === 'فني رش', 'he reads the draft');
ok(!/Grade_Code|"grade"|Job Level/.test(JSON.stringify(g)) && !('Confirm_Notes' in g.jd), 'no grade and no HR notes in what he gets');
r = api('jdr.get', tHead, { Review_ID: mine[0].Review_ID });
ok(!r.ok, 'another manager cannot open it');
ok(must(api('jdr.get', tH, { Review_ID: mine[0].Review_ID }), 'hr get').jd.Purpose, 'HR can open any review');

// ---- answers ----
r = api('jdr.answer', tSup, { Review_ID: mine[0].Review_ID, decision: 'NOTES', comment: '' });
ok(!r.ok && /اكتب ملاحظاتك/.test(r.error), 'notes are required');
r = api('jdr.answer', tHead, { Review_ID: mine[0].Review_ID, decision: 'OK' });
ok(!r.ok, 'nobody answers for someone else');
r = api('jdr.answer', tH, { Review_ID: mine[0].Review_ID, decision: 'OK' });
ok(!r.ok, 'HR cannot answer for the manager either');
must(api('jdr.answer', tSup, { Review_ID: mine[0].Review_ID, decision: 'NOTES', comment: 'المسؤولية 3 مش بتاعة الفني، دي بتاعة المشرف' }), 'answer notes');
fresh(); ok(ctx.get_('JD_REVIEWS', mine[0].Review_ID).Status === 'NOTES' && /المشرف/.test(ctx.get_('JD_REVIEWS', mine[0].Review_ID).Comment), 'the notes are saved');
ok(!must(api('todo', tSup, {}), 'todo 2').jdr, 'answered → the inbox item is gone');
const headRow = must(api('jdr.mine', tHead, {}), 'mine head').rows[0];
must(api('jdr.answer', tHead, { Review_ID: headRow.Review_ID, decision: 'OK' }), 'answer ok');

// ---- mail budget and the reminder ----
fresh(); const pmRow = ctx.find_('JD_REVIEWS', { Reviewer_User_ID: U.pm })[0];
ctx.withLock_(() => ctx.update_('JD_REVIEWS', pmRow.Review_ID, { Mailed_At: '' }, 'x'));
vm.runInContext('var __mo = mailOk_; mailOk_ = function () { return false; };', ctx);
fresh(); mails.length = 0; ctx.jdrDaily_();
fresh(); ok(!mails.length && !ctx.get_('JD_REVIEWS', pmRow.Review_ID).Mailed_At, 'no budget left today → not sent, stays for the next run');
vm.runInContext('mailOk_ = __mo;', ctx);
fresh(); mails.length = 0; ctx.jdrDaily_();
fresh(); ok(mFor('pm@t.com').length === 1 && ctx.get_('JD_REVIEWS', pmRow.Review_ID).Mailed_At, 'the next run sends it');
fresh(); ctx.withLock_(() => ctx.update_('JD_REVIEW_ROUNDS', st.Round_ID, { Due_Date: ctx.jdrAddWorkDays_(ctx.today_(), 2) }, 'x'));
fresh(); mails.length = 0; ctx.jdrDaily_();
ok(mails.length === 1 && mails[0].to === 'pm@t.com' && /تذكير/.test(mails[0].subject), 'one reminder 2 working days before, only to who has not answered');
fresh(); mails.length = 0; ctx.jdrDaily_();
ok(!mails.length, 'the reminder is sent once');
fresh(); ok(must(api('todo', tPM, {}), 'todo pm').jdr.soon === true, 'his inbox item shows it is due soon');

// ---- HR follow-up and closing ----
const s1 = must(api('jdr.status', tS, {}), 'status (HR staff reads)');
ok(s1.rows.length === 3 && s1.count.NOTES === 1 && s1.count.OK === 1 && s1.count.PENDING === 1 && !s1.canRun, 'HR staff follow the round but cannot run it');
ok(!api('jdr.status', tR, {}).ok, 'a recruiter (no JD screens) does not see it');
ok(s1.rows.some(x => x.status === 'NOTES' && /المشرف/.test(x.comment) && x.reviewer === 'مشرف الرش'), 'HR sees every note with its reviewer');
r = api('jdr.status', tSup, {});
ok(!r.ok, 'a manager does not see the round');
r = api('jdr.close', tS, { Round_ID: st.Round_ID });
ok(!r.ok, 'HR staff cannot close it');
must(api('jdr.close', tH, { Round_ID: st.Round_ID }), 'close');
r = api('jdr.answer', tPM, { Review_ID: pmRow.Review_ID, decision: 'OK' });
ok(!r.ok && /اتقفلت/.test(r.error), 'after closing no answer is taken');
ok(!must(api('jdr.mine', tPM, {}), 'mine closed').rows.length && !must(api('todo', tPM, {}), 'todo closed').jdr, 'closed → gone from the manager');
fresh(); mails.length = 0; ctx.jdrDaily_();
ok(!mails.length, 'no mail for a closed round');
// a new round after closing sends the drafts again
const st2 = must(api('jdr.start', tH, { family: ctx.get_('JOBS', C('فني رش')).Job_Family || '', all: ctx.get_('JOBS', C('فني رش')).Job_Family ? '' : 'Y' }), 'second round');
ok(st2.rows >= 1, 'a new round can be opened after the first is closed');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'JD_REVIEW' && a.Action === 'START') && ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'JD_REVIEW' && a.Action === 'NOTES'), 'start and answers are audited');

console.log('\nPhase 48 (JD manager review rounds): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
