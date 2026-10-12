// v0.36.0: separation of duties (CHG-74…CHG-79) — the CEO's queue (top roles, company / sector heads, delegation of the
// CEO's authority) applied only after his approval; his trusted phone (device key + PIN, lock after 5 wrong PINs, short
// session, revoke, 90 days with reminders); the approval steps he decides from the phone; a request on the approver's own
// position goes to the CEO; delegation by process; the vacant-head alert; two-person approvals (wipe, admin sign-in
// reset); the monthly report and the quarterly access review.
const { ctx, mails, fresh, vm } = require('./mocks');
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
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
const day = n => { const d = new Date(Date.now() + 3 * 3600000 + n * 86400000); return d.toISOString().slice(0, 10); };   // Cairo time, like the portal
ctx.__ceoReal = true;                                   // the real CEO queue (the other phases run without it)
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الموارد البشرية', '', '', '', '', 'مدير قطاع الموارد البشرية', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع الموارد البشرية', 'التوظيف', '', '', '', 'مدير التوظيف', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p.Position_ID; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x');
const user = (email, name, pos, role) => {
  const u = must(api('users.save', tO, { Email: email, Full_Name_AR: name, Position_ID: pos || '' }), 'user ' + name);
  if (role) must(api('users.setRoles', tO, { User_ID: u.User_ID, roles: [{ Role_Code: role }], reason: 'x' }), 'roles ' + name);
  return u.User_ID;
};

// ---------- no CEO yet: the first CEO and heads are set directly, and it is audited ----------
const ceo = user('ceo@t.com', 'الرئيس', P['الرئيس التنفيذي'], 'CEO');
fresh(); ok(ctx.realRoles_(ceo).indexOf('CEO') >= 0, 'first CEO set directly (no CEO to approve yet)');
ok(ctx.all_('AUDIT_LOG').some(a => a.Action === 'NO_CEO_DIRECT'), 'no-CEO path audited');
ok(ctx.all_('CEO_APPROVALS').length === 0, 'nothing queued without a CEO');
const hs = user('hs@t.com', 'مدير القطاع', '', 'HR_SECTOR_MANAGER');
// giving the HR sector head position now waits for the CEO (a top head position)
let r = must(api('users.save', tO, { User_ID: hs, Email: 'hs@t.com', Full_Name_AR: 'مدير القطاع', Position_ID: P['مدير قطاع الموارد البشرية'] }), 'head position asked');
ok(!!r.pendingCeo, 'sector head position → CEO queue');
fresh(); ok(!ctx.get_('USERS', hs).Position_ID, 'position not linked before the CEO approves');
const hm = user('hm@t.com', 'مدير التوظيف', P['مدير التوظيف'], 'HR_MANAGER');
const acc = user('acc@t.com', 'مدير الحسابات', P['مدير الحسابات'], '');
const tC = login('ceo@t.com'), tS = login('hs@t.com'), tM = login('hm@t.com'), tA = login('acc@t.com');

// ---------- CEO / Board roles wait for the CEO ----------
r = must(api('users.setRoles', tS, { User_ID: acc, roles: [{ Role_Code: 'BOARD' }], reason: 'عضو مجلس' }), 'board role asked');
ok(!!r.pendingCeo, 'board role → CEO queue');
fresh(); ok(ctx.realRoles_(acc).indexOf('BOARD') < 0, 'board role not granted before approval');
bad(api('ceo.inbox', tS, {}), null, 'HR sector manager has no CEO inbox');
let inbox = must(api('ceo.inbox', tC, {}), 'ceo inbox');
ok(inbox.items.length === 2 && inbox.items.some(i => i.kind === 'ROLE') && inbox.items.some(i => i.kind === 'HEAD'), 'inbox lists role + head');
const caRole = inbox.items.find(i => i.kind === 'ROLE').id, caHead = inbox.items.find(i => i.kind === 'HEAD').id;
let q = must(api('ceo.queue', tS, {}), 'queue for HR sector');
ok(q.length === 2 && q.every(x => x.status === 'PENDING'), 'HR sector sees the queue');
bad(api('ceo.queue', tM, {}), null, 'HR manager cannot see the CEO queue');
bad(api('ceo.decide', tS, { kind: 'CA', id: caRole, decision: 'APPROVE' }), null, 'HR sector cannot approve for the CEO');
bad(api('ceo.decide', tC, { kind: 'CA', id: caRole, decision: 'REJECT', comment: '' }), /سبب/, 'rejection needs a reason');
must(api('ceo.decide', tC, { kind: 'CA', id: caRole, decision: 'APPROVE', comment: 'موافق' }), 'CEO approves role');
fresh(); ok(ctx.realRoles_(acc).indexOf('BOARD') >= 0, 'board role granted after approval');
ok(ctx.get_('CEO_APPROVALS', caRole).Status === 'APPROVED' && ctx.get_('CEO_APPROVALS', caRole).Decided_Via === 'PORTAL', 'decision recorded (portal)');
bad(api('ceo.decide', tC, { kind: 'CA', id: caRole, decision: 'APPROVE' }), /حدّث/, 'no second decision');
must(api('ceo.decide', tC, { kind: 'CA', id: caHead, decision: 'APPROVE' }), 'CEO approves head');
fresh(); ok(ctx.get_('USERS', hs).Position_ID === P['مدير قطاع الموارد البشرية'], 'head position linked after approval');
// a rejected one changes nothing
r = must(api('users.setRoles', tO, { User_ID: hm, roles: [{ Role_Code: 'HR_MANAGER' }, { Role_Code: 'CEO' }], reason: 'x' }), 'CEO role asked');
must(api('ceo.decide', tC, { kind: 'CA', id: r.pendingCeo, decision: 'REJECT', comment: 'مش محتاج' }), 'CEO rejects');
fresh(); ok(ctx.realRoles_(hm).indexOf('CEO') < 0 && ctx.realRoles_(hm).indexOf('HR_MANAGER') >= 0, 'rejected role change not applied');
ok(ctx.all_('NOTIFICATIONS').some(n => n.User_ID === ctx.get_('USERS', ctx.get_('CEO_APPROVALS', r.pendingCeo).Requested_By).User_ID && /رفض/.test(n.Title)), 'requester told of the rejection');

// ---------- the trusted phone ----------
bad(api('ceo.deviceCreate', tO, { pin: '4829' }), null, 'only the CEO creates a trusted device');
bad(api('ceo.deviceCreate', tC, { pin: '1234' }), /ورا بعض/, 'consecutive PIN refused');
bad(api('ceo.deviceCreate', tC, { pin: '7777' }), /متكرر/, 'repeated PIN refused');
bad(api('ceo.deviceCreate', tC, { pin: '12' }), /4/, 'short PIN refused');
const dev1 = must(api('ceo.deviceCreate', tC, { pin: '4829', label: 'آيفون' }), 'device 1');
ok(/^CED-\d+\.[A-Za-z0-9]{20,}$/.test(dev1.key) && dev1.days === 90, 'device key + 90 days');
fresh(); const devRow = ctx.all_('CEO_DEVICES')[0];
ok(devRow.Pin_Hash && devRow.Pin_Hash.indexOf('4829') < 0 && devRow.Token_Hash && JSON.stringify(devRow).indexOf(dev1.key.split('.')[1]) < 0, 'PIN and token stored hashed only');
bad(pub('ceoPage.unlock', { key: dev1.key.split('.')[0] + '.WRONGWRONGWRONGWRONGWRONG', pin: '4829' }), /مش متسجل/, 'wrong device token refused');
bad(pub('ceoPage.inbox', { key: dev1.key, session: 'nope' }), /الجلسة خلصت/, 'no session → PIN again');
for (let i = 0; i < 4; i++) bad(pub('ceoPage.unlock', { key: dev1.key, pin: '0000' }), /غلط/, 'wrong PIN ' + (i + 1));
bad(pub('ceoPage.unlock', { key: dev1.key, pin: '0000' }), /15 دقيقة/, '5th wrong PIN locks');
bad(pub('ceoPage.unlock', { key: dev1.key, pin: '4829' }), /متوقف/, 'right PIN refused while locked');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => /محاولات غلط/.test(n.Title)), 'owner told of the lock');
fresh(); ctx.update_('CEO_DEVICES', devRow.Device_ID, { Locked_Until: '2000-01-01T00:00:00' }, 'x');
const s1 = must(pub('ceoPage.unlock', { key: dev1.key, pin: '٤٨٢٩' }), 'unlock (Arabic digits)');
ok(s1.session && s1.minutes === 30, 'short session');
// a request that waits for the CEO, decided from the phone
r = must(api('users.setRoles', tS, { User_ID: acc, roles: [], reason: 'خرج من المجلس' }), 'board role removal asked');
let pin = must(pub('ceoPage.inbox', { key: dev1.key, session: s1.session }), 'page inbox');
ok(pin.items.length === 1 && pin.name === 'الرئيس', 'page inbox shows the item');
must(pub('ceoPage.decide', { key: dev1.key, session: s1.session, kind: 'CA', id: r.pendingCeo, decision: 'APPROVE' }), 'decided from the phone');
fresh(); ok(ctx.realRoles_(acc).indexOf('BOARD') < 0, 'removal applied');
ok(ctx.get_('CEO_APPROVALS', r.pendingCeo).Decided_Via === 'DEVICE' && ctx.get_('CEO_APPROVALS', r.pendingCeo).Device_ID === devRow.Device_ID, 'decision recorded as from the device');
const rep = must(pub('ceoPage.report', { key: dev1.key, session: s1.session, month: day(0).slice(0, 7) }), 'page report');
ok(rep.roleChanges.some(x => x.action === 'إضافة') && rep.roleChanges.some(x => x.action === 'إزالة'), 'monthly report lists role changes');
let devs = must(api('ceo.devices', tS, {}), 'devices for HR sector');
ok(devs.length === 1 && devs[0].active && devs[0].daysLeft >= 89, 'days left shown');
let sh = must(api('ceo.share', tS, {}), 'share');
ok(/\?ceo=1$/.test(sh.link) && sh.text.indexOf(sh.link) >= 0 && sh.daysLeft >= 89 && sh.hasCeo, 'WhatsApp text with the link and the days left');
ok(!/الرئيس|مدير/.test(sh.text.replace(/الرئيس التنفيذي/g, '')), 'no names in the WhatsApp text');
// reminders at 14 / 7 / 1 days, once each
fresh(); ctx.update_('CEO_DEVICES', devRow.Device_ID, { Expires_At: day(14) + 'T10:00:00' }, 'x');
fresh(); let dr = ctx.ceoDaily_(); fresh(); dr = ctx.ceoDaily_();
fresh(); ok(ctx.all_('NOTIFICATIONS').filter(n => /فاضل له 14 يوم/.test(n.Title)).length === 2, 'reminder at 14 days, once (owner + HR sector)');
let todoS = must(api('todo', tS, {}), 'todo HR sector');
ok(todoS.ceo.daysLeft === 14, 'days left on the HR sector manager\'s home');
// revoke
must(api('ceo.deviceRevoke', tS, { Device_ID: devRow.Device_ID }), 'revoke');
bad(pub('ceoPage.unlock', { key: dev1.key, pin: '4829' }), /اتلغى/, 'revoked device refused');
bad(pub('ceoPage.inbox', { key: dev1.key, session: s1.session }), /اتلغى/, 'open session ends with the revoke');
const dev2 = must(api('ceo.deviceCreate', tC, { pin: '5813' }), 'device 2');
fresh(); ctx.update_('CEO_DEVICES', dev2.key.split('.')[0], { Expires_At: '2000-01-01T00:00:00' }, 'x');
bad(pub('ceoPage.unlock', { key: dev2.key, pin: '5813' }), /انتهت/, 'expired device refused');
// a device whose user lost the CEO role stops working
const dev3 = must(api('ceo.deviceCreate', tC, { pin: '5813' }), 'device 3');
fresh(); const ceoRole = ctx.all_('USER_ROLES').find(x => x.User_ID === ceo && x.Role_Code === 'CEO');
ctx.update_('USER_ROLES', ceoRole.User_Role_ID || ceoRole[Object.keys(ceoRole)[0]], { Effective_To: '2000-01-01' }, 'x');
bad(pub('ceoPage.unlock', { key: dev3.key, pin: '5813' }), /مش حساب الرئيس/, 'device of a non-CEO refused');
fresh(); ctx.update_('USER_ROLES', ceoRole.User_Role_ID || ceoRole[Object.keys(ceoRole)[0]], { Effective_To: '' }, 'x');

// ---------- delegation of the CEO's authority waits for the CEO; delegation by process ----------
r = must(api('dlg.save', tO, { From_Position_ID: P['الرئيس التنفيذي'], To_User_ID: hs, Effective_To: day(10), Reason: 'سفر' }), 'CEO delegation asked');
ok(r.pendingCeo && r.Status === 'PENDING_CEO', 'CEO delegation pending');
let dl = must(api('dlg.list', tS, {}), 'dlg list');
ok(JSON.stringify(dl).indexOf('PENDING_CEO') >= 0, 'list shows it pending');
fresh(); ok(ctx.eligibleUsers_('POSITION:' + P['الرئيس التنفيذي'], '').indexOf(hs) < 0, 'not in effect before the CEO approves');
inbox = must(api('ceo.inbox', tC, {}), 'inbox delegation');
const caDlg = inbox.items.find(i => i.kind === 'DELEGATION');
ok(!!caDlg && /سفر/.test(caDlg.summary), 'delegation in the CEO inbox with the reason');
must(api('ceo.decide', tC, { kind: 'CA', id: caDlg.id, decision: 'APPROVE' }), 'CEO approves the delegation');
fresh(); ok(ctx.get_('DELEGATIONS', r.Delegation_ID).Status === 'Active' && ctx.eligibleUsers_('POSITION:' + P['الرئيس التنفيذي'], '').indexOf(hs) >= 0, 'in effect after approval');
// a second one, stopped while pending → the CEO item is cancelled
r = must(api('dlg.save', tS, { From_Position_ID: P['الرئيس التنفيذي'], To_User_ID: hm, Effective_To: day(5), Reason: 'إجازة' }), 'second CEO delegation');
must(api('dlg.stop', tS, { Delegation_ID: r.Delegation_ID, reason: 'مش محتاجينه' }), 'stopped while pending');
fresh(); ok(ctx.all_('CEO_APPROVALS').some(a => a.Ref_ID === r.Delegation_ID && a.Status === 'CANCELLED'), 'pending CEO item cancelled with the delegation');
// process scope: approvals only / team only
const tre = user('tre@t.com', 'نائب', '', '');
must(api('dlg.save', tS, { From_Position_ID: P['مدير الخزينة'], To_User_ID: tre, Effective_To: day(10), Reason: 'إجازة', Process_Scope: ['APPROVALS'] }), 'approvals-only delegation');
fresh(); ok(ctx.eligibleUsers_('POSITION:' + P['مدير الخزينة'], '').indexOf(tre) >= 0, 'approvals-only: approves');
ok(ctx.headedUnits_(ctx.get_('USERS', tre)).length === 0, 'approvals-only: does not follow the unit\'s work');
const tre2 = user('tre2@t.com', 'نائب تاني', '', '');
must(api('dlg.save', tS, { From_Position_ID: P['مدير الحسابات'], To_User_ID: tre2, Effective_To: day(10), Reason: 'إجازة', Process_Scope: ['TEAM'] }), 'team-only delegation');
fresh(); ok(ctx.eligibleUsers_('POSITION:' + P['مدير الحسابات'], '').indexOf(tre2) < 0, 'team-only: does not approve');
ok(ctx.headedUnits_(ctx.get_('USERS', tre2)).length > 0, 'team-only: follows the unit\'s work');
dl = must(api('dlg.list', tS, {}), 'dlg list scopes');
ok(JSON.stringify(dl).indexOf('اعتماد الطلبات') >= 0, 'scope text in the list');

// ---------- a request on the approver's own position goes to the CEO (CHG-74) ----------
// ---------- vacant head: HR is told the request went up a level ----------
mails.length = 0;
const rq2 = must(api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Reason_Category: 'WORKLOAD', Justification: 'توسع في الخزينة', Required_By_Date: '2099-01-01',
  lines: [{ Position_ID: P['أمين خزينة'], Requested_HC: 1 }], Exception_Justification: 'x' }), 'request in a unit with a vacant head');
fresh(); ok(ctx.all_('NOTIFICATIONS').some(n => n.Title === 'وظيفة رئيس وحدة شاغرة' && n.Link_ID === rq2.Request_ID), 'vacant head alert to HR');

// the HR approver's own position: the accounts manager also holds the HR manager role; his sector head asks to replace him
must(api('users.setRoles', tO, { User_ID: acc, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'acc HR role');
let fr = must(api('users.save', tO, { Email: 'fin@t.com', Full_Name_AR: 'مدير المالي', Position_ID: P['مدير القطاع المالي'] }), 'finance head asked');
must(api('ceo.decide', tC, { kind: 'CA', id: fr.pendingCeo, decision: 'APPROVE' }), 'CEO approves finance head');
const tF = login('fin@t.com'), tA2 = login('acc@t.com');
let rq = must(api('req.submit', tF, { Recruitment_Type: 'REPLACEMENT', Employment_Type: 'FULL_TIME', Reason_Category: 'RESIGNATION', Justification: 'بديل مدير الحسابات', Required_By_Date: '2099-01-01',
  lines: [{ Position_ID: P['مدير الحسابات'], Requested_HC: 1 }], replacements: [{ Employee_Name: 'فلان' }] }), 'request on the HR approver\'s own position');
let g = must(api('req.get', tF, { Request_ID: rq.Request_ID }), 'get');
must(api('req.action', tA2, { Request_ID: rq.Request_ID, action: 'APPROVE', hr: { HR_Classification: 'CRITICAL' } }), 'HR step approved by the one it concerns');
g = must(api('req.get', tF, { Request_ID: rq.Request_ID }), 'get again');
if (!g.chain.some(s => s.Step_Type === 'CEO')) console.log(JSON.stringify(g.chain.map(s => [s.Step_Type, s.Label, s.Status, s.Skip_Reason])));
ok(g.request.Status !== 'APPROVED' && g.chain.some(s => s.Step_Type === 'CEO' && s.Status === 'PENDING'), 'a CEO step was added for the request on the approver\'s own position');
const st1 = must(api('ceo.inbox', tC, {}), 'CEO inbox with the step').steps.find(s => s.ref === rq.Request_ID);
ok(!!st1, 'the request step is in the CEO inbox');
const sP = must(pub('ceoPage.unlock', { key: dev3.key, pin: '5813' }), 'unlock for the step');
must(pub('ceoPage.decide', { key: dev3.key, session: sP.session, kind: 'STEP', id: st1.id, decision: 'APPROVE' }), 'CEO decides the step from the phone');
ok(must(api('req.get', tF, { Request_ID: rq.Request_ID }), 'after CEO').request.Status === 'APPROVED', 'request approved after the CEO');
// the HR Sector Manager's request on his own position: his own approval is not enough → the CEO
const rq3 = must(api('req.submit', tS, { Recruitment_Type: 'REPLACEMENT', Employment_Type: 'FULL_TIME', Reason_Category: 'RESIGNATION', Justification: 'بديل مدير القطاع', Required_By_Date: '2099-01-01',
  lines: [{ Position_ID: P['مدير قطاع الموارد البشرية'], Requested_HC: 1 }], replacements: [{ Employee_Name: 'فلان' }] }), 'HR sector manager asks for his own position');
g = must(api('req.get', tS, { Request_ID: rq3.Request_ID }), 'get rq3');
ok(g.request.Status !== 'APPROVED' && g.chain.some(s => s.Step_Type === 'CEO' && s.Status === 'PENDING'), 'own position → waits for the CEO');
const st3 = must(api('ceo.inbox', tC, {}), 'inbox rq3').steps.find(s => s.ref === rq3.Request_ID);
must(api('ceo.decide', tC, { kind: 'STEP', id: st3.id, decision: 'APPROVE' }), 'CEO approves rq3');
g = must(api('req.get', tS, { Request_ID: rq3.Request_ID }), 'rq3 after');
ok(g.chain.some(s => s.Step_Type === 'CEO' && s.Status === 'APPROVED'), 'CEO step approved (a sector head job then goes to the board as before)');
// a board decision recorded on the board's behalf needs a proof file (CHG-79)
const EVJ = [{ name: 'whatsapp.jpg', mime: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAACAAIBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=' }];
bad(api('req.action', tO, { Request_ID: rq3.Request_ID, action: 'APPROVE', onBehalf: true, onBehalfMethod: 'WHATSAPP', comment: 'وافق رئيس المجلس' }), /إثبات/, 'on-behalf without proof refused');
must(api('req.action', tO, { Request_ID: rq3.Request_ID, action: 'APPROVE', onBehalf: true, onBehalfMethod: 'WHATSAPP', comment: 'وافق رئيس المجلس', files: EVJ }), 'on-behalf with proof');
ok(must(api('req.get', tS, { Request_ID: rq3.Request_ID }), 'rq3 final').request.Status === 'APPROVED', 'approved after the board proof');

// ---------- two-person approvals ----------
bad(api('demo.wipe', tO, { phrase: 'امسح الحركات', reason: 'x' }), /شخصين/, 'owner cannot wipe alone when another admin exists');
const dw = must(api('dual.request', tM, { Kind: 'WIPE', reason: 'خلصنا التجربة' }), 'wipe requested by the HR manager');
bad(api('dual.request', tM, { Kind: 'WIPE', reason: 'تاني مرة' }), /مستني/, 'duplicate pending request refused');
bad(api('dual.decide', tM, { Dual_ID: dw.Dual_ID, decision: 'APPROVE' }), null, 'requester cannot approve');
let dlst = must(api('dual.list', tO, {}), 'dual list owner');
ok(dlst.find(d => d.id === dw.Dual_ID).canDecide === true, 'owner can decide');
ok(must(api('dual.list', tM, {}), 'dual list requester').find(d => d.id === dw.Dual_ID).canDecide === false, 'requester cannot decide');
todoS = must(api('todo', tO, {}), 'owner todo'); ok(todoS.dual === 1, 'owner home shows the waiting request');
ok(must(api('dual.list', tS, {}), 'dual list HR sector').find(d => d.id === dw.Dual_ID).canDecide === true, 'HR sector manager can decide the wipe (CHG-77)');
must(api('dual.decide', tS, { Dual_ID: dw.Dual_ID, decision: 'REJECT', comment: 'لسه بدري' }), 'HR sector manager rejects the wipe');
fresh(); ok(ctx.get_('DUAL_REQUESTS', dw.Dual_ID).Status === 'REJECTED' && ctx.all_('USERS').length > 3, 'rejected: nothing wiped');
// admin sign-in reset
fresh(); ctx.mfaPut_(hm, { Enabled_At: ctx.nowIso_() }, 'x');
bad(api('mfa.reset', tO, { User_ID: hm, reason: 'غيّر الموبايل' }), /شخص/, 'admin reset by one person refused');
bad(api('dual.request', tS, { Kind: 'MFA_RESET', User_ID: acc, reason: 'غيّر الموبايل' }), /مش حساب مسؤول|مش مفعّل/, 'reset request only for admin accounts');
const dm = must(api('dual.request', tO, { Kind: 'MFA_RESET', User_ID: hm, reason: 'غيّر الموبايل' }), 'reset requested by the owner');
bad(api('dual.decide', tO, { Dual_ID: dm.Dual_ID, decision: 'APPROVE' }), /شخص تاني/, 'owner cannot approve his own request');
must(api('dual.decide', tS, { Dual_ID: dm.Dual_ID, decision: 'APPROVE', comment: 'اتأكدت بالتليفون' }), 'HR sector approves the reset');
fresh(); ok(!ctx.mfaOn_(hm) && ctx.get_('DUAL_REQUESTS', dm.Dual_ID).Status === 'DONE', 'reset done after the second person');
ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_ID === dm.Dual_ID && a.Action === 'APPROVED_RUN'), 'two-person decision audited');

// ---------- access review ----------
bad(api('access.review', tM, {}), null, 'HR manager cannot run the access review');
let ar = must(api('access.review', tS, {}), 'access review');
ok(ar.due === true && ar.users.some(u => u.id === hs && u.roles.indexOf('HR_SECTOR_MANAGER') >= 0), 'review lists users and roles, due');
ok(ar.delegations.length >= 3, 'review lists delegations');
bad(api('access.reviewDone', tS, { note: '' }), /ملاحظة/, 'review needs a note');
must(api('access.reviewDone', tS, { note: 'اتراجعت كلها' }), 'review signed off');
ar = must(api('access.review', tS, {}), 'access review again');
ok(ar.due === false && ar.last === day(0), 'review recorded with today\'s date');

// ---------- me.can ----------
const meC = must(api('me', tC, {}), 'me ceo'), meS = must(api('me', tS, {}), 'me hs'), meA = must(api('me', tA, {}), 'me acc');
ok(meC.can.ceo && !meC.can.ceoAdmin, 'CEO sees his approvals');
ok(meS.can.ceoAdmin && !meS.can.ceo, 'HR sector sees the CEO queue');
ok(!meA.can.ceo && !meA.can.ceoAdmin, 'a manager sees neither');

console.log(`phase36: ${pass} passed, ${failN} failed`);
