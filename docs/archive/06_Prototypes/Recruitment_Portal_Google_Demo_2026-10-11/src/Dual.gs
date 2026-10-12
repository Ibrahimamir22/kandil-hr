/**
 * Dual.gs — v0.36.0: two-person rule (CHG-77). Some actions are never done by one person alone:
 *   • WIPE        — wiping the transactions (demo data): asked by one user (e.g. the payroll & salaries supervisor),
 *                   approved and run by the HR Sector Manager (or the system owner);
 *   • MFA_RESET   — resetting the sign-in (authenticator) of an administrator (owner, HR Sector Manager, HR Manager);
 *   • TERMINATION — ending an employee's service by the company (termination, absence): the unit manager or HR asks,
 *                   the HR Sector Manager approves.
 * The one who asks can never be the one who approves. Each request and decision is audited.
 * While the portal has a single real administrator (nobody else could ask), the wipe stays possible for him alone and is
 * recorded as such; the go-live step (v0.37) locks the wipe for good.
 */

var DUAL_KINDS_ = { WIPE: 'مسح الحركات', MFA_RESET: 'إعادة ضبط دخول مسؤول', TERMINATION: 'إنهاء خدمة موظف' };
var DUAL_TERMINATION_REASONS_ = ['TERMINATION', 'ABSENCE'];

function dualAskRoles_() { return HR_ALL_ROLES; }
/** Who approves each kind. */
function dualApproverRoles_(kind) { return [ROLE.OWNER, ROLE.HR_SECTOR]; }

/** Admin accounts whose sign-in reset needs two people. */
function isAdminAccount_(userId) {
  var r = realRoles_(userId);
  return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER].some(function (x) { return r.indexOf(x) >= 0; });
}

/** True when someone other than this user could ask (a real, active HR user). */
function anotherAdmin_(userId) {
  return all_('USERS').some(function (u) {
    if (u.User_ID === userId || u.Status !== 'Active' || isDemoUser_(u)) return false;
    var r = realRoles_(u.User_ID);
    return HR_ALL_ROLES.some(function (x) { return r.indexOf(x) >= 0; });
  });
}

/**
 * Ask. p = { Kind, reason, …kind fields }:
 *   WIPE        —
 *   MFA_RESET   — User_ID
 *   TERMINATION — Employee_ID, Last_Working_Date, reasonCode, note   (the unit manager may ask for his own team)
 */
function dualRequest_(ctx, p) {
  var kind = str_(p.Kind), reason = str_(p.reason);
  if (!DUAL_KINDS_[kind]) throw userError_('نوع غير معروف.');
  if (ctx.readOnly) throw userError_('الحساب ده للعرض فقط.');
  if (reason.length < 5) throw userError_('اكتب سبب الطلب.');
  var ref = '', title = DUAL_KINDS_[kind], payload = {};
  if (kind === 'TERMINATION') {
    var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
    if (!e || e.Status !== 'Active') throw userError_('الموظف مش موجود أو خرج بالفعل.');
    var mine = empManagersOf_(e.Position_ID).indexOf(ctx.user.User_ID) >= 0;
    if (!mine && !hasAnyRole_(ctx, empAdminRoles_())) throw userError_('طلب إنهاء الخدمة لمدير الموظف أو الموارد البشرية.');
    if (DUAL_TERMINATION_REASONS_.indexOf(str_(p.reasonCode)) < 0) throw userError_('اختار سبب إنهاء الخدمة.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str_(p.Last_Working_Date))) throw userError_('حدد آخر يوم عمل.');
    ref = e.Employee_ID; title += ': ' + e.Full_Name + ' (' + e.Employee_ID + ')';
    payload = { Employee_ID: e.Employee_ID, Last_Working_Date: str_(p.Last_Working_Date), reasonCode: str_(p.reasonCode), note: str_(p.note).slice(0, 500) };
  } else {
    if (!hasAnyRole_(ctx, dualAskRoles_())) throw userError_('الطلب ده لفريق الموارد البشرية.');
    if (kind === 'MFA_RESET') {
      var t = get_('USERS', str_(p.User_ID));
      if (!t) throw userError_('المستخدم غير موجود.');
      if (!isAdminAccount_(t.User_ID)) throw userError_('الحساب ده مش حساب مسؤول — إعادة الضبط من شاشة المستخدمين على طول.');
      if (!mfaOn_(t.User_ID)) throw userError_('Authenticator مش مفعّل على الحساب ده أصلاً.');
      ref = t.User_ID; title += ': ' + t.Full_Name_AR; payload = { User_ID: t.User_ID };
    }
    if (kind === 'WIPE') { ref = 'ALL'; if (golive_()) throw userError_('البوابة في التشغيل الفعلي — مسح الحركات اتقفل نهائياً.'); }
  }
  var dup = where_('DUAL_REQUESTS', function (d) { return d.Status === 'PENDING' && d.Kind === kind && d.Ref_ID === ref; })[0];
  if (dup) throw userError_('فيه طلب زي ده مستني الموافقة بالفعل (' + dup.Dual_ID + ').');
  var row;
  withLock_(function () {
    row = insert_('DUAL_REQUESTS', { Dual_ID: nextId_('DUAL'), Kind: kind, Ref_ID: ref, Title: title.slice(0, 200), Payload_JSON: JSON.stringify(payload),
      Reason: reason.slice(0, 500), Requested_By: ctx.user.User_ID, Status: 'PENDING', Decided_By: '', Decided_At: '', Comment: '', Executed_At: '', Result: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'DUAL', entityId: row.Dual_ID, action: 'REQUESTED', newValue: kind + ' ' + ref, reason: reason });
  var approvers = dualApproverRoles_(kind).reduce(function (a, r) { return a.concat(roleHolders_(r)); }, [])
    .filter(function (u, i, a) { return u !== ctx.user.User_ID && a.indexOf(u) === i; });
  notify_(approvers, 'طلب محتاج موافقتك: ' + DUAL_KINDS_[kind], title + ' — من ' + ctx.user.Full_Name_AR + ': ' + reason, 'DUAL', row.Dual_ID, true);
  return row;
}

function dualList_(ctx) {
  var names = userNames_(), me = ctx.user.User_ID;
  var approverOf = function (k) { return hasAnyRole_(ctx, dualApproverRoles_(k)); };
  return where_('DUAL_REQUESTS', function (d) { return d.Requested_By === me || approverOf(d.Kind) || hasAnyRole_(ctx, HR_ADMIN_ROLES); })
    .sort(function (a, b) { return a.Dual_ID < b.Dual_ID ? 1 : -1; }).slice(0, 100).map(function (d) {
      return { id: d.Dual_ID, kind: d.Kind, kindName: DUAL_KINDS_[d.Kind], title: d.Title, reason: d.Reason, by: names[d.Requested_By] || d.Requested_By,
        at: d.Created_At, status: d.Status, decidedBy: names[d.Decided_By] || '', decidedAt: d.Decided_At, comment: d.Comment, result: d.Result,
        canDecide: d.Status === 'PENDING' && d.Requested_By !== me && approverOf(d.Kind) && !ctx.readOnly };
    });
}

/**
 * Approve (and run) or reject. p = { Dual_ID, decision: APPROVE|REJECT, comment, phrase?, code? } — a wipe still
 * needs the confirmation phrase (and the approver's authenticator code when he has one).
 */
function dualDecide_(ctx, p) {
  var d = get_('DUAL_REQUESTS', str_(p.Dual_ID)), decision = str_(p.decision), comment = str_(p.comment);
  if (!d || d.Status !== 'PENDING') throw userError_('الطلب ده اتاخد فيه قرار — حدّث الصفحة.');
  if (d.Requested_By === ctx.user.User_ID) throw userError_('اللي طلب مايوافقش على طلبه — لازم شخص تاني.');
  if (!hasAnyRole_(ctx, dualApproverRoles_(d.Kind)) || ctx.readOnly) throw userError_('الموافقة دي لمدير قطاع الموارد البشرية أو مالك النظام.');
  if (['APPROVE', 'REJECT'].indexOf(decision) < 0) throw userError_('اختار موافقة أو رفض.');
  if (decision === 'REJECT' && comment.length < 3) throw userError_('اكتب سبب الرفض.');
  var result = '', data = null;
  if (decision === 'APPROVE') { var run = dualRun_(ctx, d, p); result = run.text; data = run.data; }
  withLock_(function () {
    update_('DUAL_REQUESTS', d.Dual_ID, { Status: decision === 'APPROVE' ? 'DONE' : 'REJECTED', Decided_By: ctx.user.User_ID, Decided_At: nowIso_(),
      Comment: comment.slice(0, 500), Executed_At: decision === 'APPROVE' ? nowIso_() : '', Result: str_(result).slice(0, 300) }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'DUAL', entityId: d.Dual_ID, action: decision === 'APPROVE' ? 'APPROVED_RUN' : 'REJECTED', newValue: d.Kind + ' ' + d.Ref_ID, reason: comment });
  // after a wipe the notifications table starts empty — the requester sees the result in «موافقات الشخصين»
  if (!(d.Kind === 'WIPE' && decision === 'APPROVE'))
    notify_([d.Requested_By], decision === 'APPROVE' ? 'طلبك اتوافق عليه واتنفذ' : 'طلبك اترفض', d.Title + (comment ? ' — ' + comment : ''), 'DUAL', d.Dual_ID, true);
  return { ok: true, result: result, data: data };
}

function dualRun_(ctx, d, p) {
  var payload = {}; try { payload = JSON.parse(d.Payload_JSON || '{}') || {}; } catch (e) { payload = {}; }
  var rctx = { user: ctx.user, sessionId: ctx.sessionId, dualApproved: d.Dual_ID };
  if (d.Kind === 'WIPE') {
    var r = demoWipe_(rctx, { phrase: p.phrase, code: p.code, reason: d.Reason + ' (طلب ' + d.Dual_ID + ')' });
    return { text: 'اتمسح — نسخة احتياطية: ' + ((r.backup && r.backup.folder) || ''), data: r };
  }
  if (d.Kind === 'MFA_RESET') { var m = mfaReset_(rctx, { User_ID: payload.User_ID, reason: d.Reason + ' (طلب ' + d.Dual_ID + ')' }); return { text: 'اتعملت إعادة الضبط', data: m }; }
  if (d.Kind === 'TERMINATION') {
    var x = empExit_(rctx, { Employee_ID: payload.Employee_ID, Last_Working_Date: payload.Last_Working_Date, reasonCode: payload.reasonCode, note: payload.note || d.Reason });
    return { text: 'نهاية الخدمة اتسجلت (' + ((x.employee && x.employee.Exit_Date) || payload.Last_Working_Date) + ')', data: x };
  }
  throw userError_('نوع غير معروف.');
}

/** Go-live (v0.37): set once by the owner; until then false. */
function golive_() { return str_(cfg_('GOLIVE_AT', '')) !== ''; }

/** Two-person requests waiting for this user's decision. */
function dualTodo_(ctx) {
  if (ctx.readOnly) return 0;
  var me = ctx.user.User_ID;
  return where_('DUAL_REQUESTS', function (d) { return d.Status === 'PENDING' && d.Requested_By !== me && hasAnyRole_(ctx, dualApproverRoles_(d.Kind)); }).length;
}
