/**
 * Transfers.gs — v0.19.0 (phase 6C): internal transfer requests.
 *  - Opened by the employee's current manager (his unit is in the manager's scope), the receiving manager (the target
 *    position is in his scope — v0.41, CHG-85) or the HR team.
 *  - v0.41 (CHG-85): the two managers give an opinion (support / object with a reason) — only HR decides; a temporary
 *    transfer (to an end date: the employee keeps his own position and headcount, the cover is recorded and ends by
 *    itself); a handover list ticked before the move; on a permanent move the old manager is offered a replacement.
 *  - The target position must have room: an open vacancy on it (the transfer fills — and closes — it) or
 *    approved headcount above actual (minus other transfers already heading there).
 *  - Approvals in order: current manager → new manager → HR manager → HR sector manager (only when pay changes).
 *    A step whose approver is the requester is approved at submission; a step with nobody to approve is skipped
 *    and the reason recorded (as in recruitment requests).
 *  - Pay: allowances tied to the job or the unit (grade, collar, transport zone, job-nature rate) are detected and
 *    force a salary-items change; the items (from → to) and any agreed different benefits are approved by the HR
 *    sector manager. Amounts are shown to HR and pay roles only.
 *  - Schedule (working hours) and location changes are recorded.
 *  - Executed on the effective date (now, or by the daily job): the employee moves (vacancy filled when linked),
 *    headcount recounted, managers notified, salary-items notice printable for payroll.
 */

var TRF_STEPS_ = { FROM_MGR: 'المدير الحالي', TO_MGR: 'المدير الجديد', HR: 'مدير الموارد البشرية', PAY: 'مدير قطاع الموارد البشرية (مفردات الراتب)' };
var TRF_ST_ = { PENDING: 'في الاعتماد', APPROVED: 'معتمد — مستني تاريخ النقل', DONE: 'اتنفذ', REJECTED: 'مرفوض', CANCELLED: 'اتلغى' };
var TRF_TYPES_ = { PERMANENT: 'نقل دائم', TEMPORARY: 'نقل مؤقت (انتداب)' };
var TRF_OPINION_STEPS_ = ['FROM_MGR', 'TO_MGR'];          // v0.41: managers give an opinion; HR decides
var TRF_HANDOVER_DEFAULT_ = ['تسليم العهد والأدوات', 'تسليم الشغل الجاري والملفات', 'تسليم الحسابات وكلمات السر للمدير', 'تعريف البديل أو الزميل اللي هيستلم'];
function trfHandoverItems_() {
  var a = []; try { a = JSON.parse(str_(cfg_('TRF_HANDOVER_ITEMS', '')) || '[]'); } catch (e) { a = []; }
  a = Array.isArray(a) ? a.map(str_).filter(String) : [];
  return a.length ? a : TRF_HANDOVER_DEFAULT_.slice();
}

function trfHrRoles_() { return HR_ALL_ROLES.slice(); }
function trfPayRoles_() { return HR_ALL_ROLES.concat(payViewRoles_()); }

/* ---------------- helpers ---------------- */

function trfEmployee_(id) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(id) });
  if (!e || e.Status !== 'Active') throw userError_('اختار موظف على رأس العمل.');
  if (e.Exit_Date) throw userError_('الموظف ده عليه نهاية خدمة مسجلة.');
  return e;
}
/**
 * Can this user open a transfer for this employee? HR always; his current manager (the employee is in his scope);
 * v0.41: the receiving manager — only towards a position in his own scope (toPos given), never for himself.
 */
function trfCanOpen_(ctx, e, toPos) {
  if (ctx.readOnly) return false;
  if (hasAnyRole_(ctx, trfHrRoles_())) return true;
  var pos = get_('POSITIONS', e.Position_ID), scope = managedScope_(ctx.user);
  if (!pos || pos.Position_ID === ctx.user.Position_ID) return false;
  if (scope.indexOf(pos.Org_Unit_ID) >= 0) return true;
  if (toPos === undefined) return scope.length > 0;              // a receiving manager may look at him (targets are limited)
  return !!(toPos && scope.indexOf(toPos.Org_Unit_ID) >= 0);
}
/** The receiving manager's case: the employee is outside his scope. */
function trfAsReceiver_(ctx, e) {
  if (hasAnyRole_(ctx, trfHrRoles_())) return false;
  var pos = get_('POSITIONS', e.Position_ID);
  return !(pos && managedScope_(ctx.user).indexOf(pos.Org_Unit_ID) >= 0);
}
function trfOpenFor_(posId, exceptId) {
  return where_('TRANSFER_REQUESTS', function (t) { return t.To_Position_ID === posId && ['PENDING', 'APPROVED'].indexOf(t.Status) >= 0 && t.Transfer_ID !== exceptId; });
}
/** Room on a position: open vacancies (remaining) and free approved headcount, less transfers already heading there. */
function trfRoom_(posId, exceptId) {
  var pos = get_('POSITIONS', posId);
  if (!pos) return { vacancies: [], free: 0, pending: 0, room: 0 };
  var vacs = where_('VACANCIES', function (v) { return v.Position_ID === posId && ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0; })
    .map(function (v) {
      var used = trfOpenFor_(posId, exceptId).filter(function (t) { return t.Vacancy_ID === v.Vacancy_ID; }).length;
      return { id: v.Vacancy_ID, left: Math.max(0, num_(v.Required_HC, 0) - num_(v.Joined_HC, 0) - used), status: v.Status };
    }).filter(function (v) { return v.left > 0; });
  var pending = trfOpenFor_(posId, exceptId).filter(function (t) { return !t.Vacancy_ID; }).length;
  var free = Math.max(0, num_(pos.Structural_HC, 0) - num_(pos.Occupied_HC, 0) - pending);
  var vacLeft = vacs.reduce(function (s, v) { return s + v.left; }, 0);
  return { vacancies: vacs, free: free, pending: pending, room: Math.max(free, vacLeft) };
}

function trfPosInfo_(posId, locId) {
  var pos = get_('POSITIONS', posId) || {}, job = get_('JOBS', pos.Job_Code) || {}, unit = get_('ORG_UNITS', pos.Org_Unit_ID) || {};
  var loc = get_('LOCATIONS', locId || pos.Location_ID) || null;
  return { id: pos.Position_ID, title: pos.Position_Title || job.Job_Title_AR || '', unit: unit.Name_AR || '', unitId: pos.Org_Unit_ID, job: pos.Job_Code,
    grade: job.Grade_Code || '', collar: job.Collar || '', location: loc ? loc.Name_AR : '', locationId: loc ? loc.Location_ID : '', zone: loc ? locZone_(loc) : '' };
}
/** Allowances tied to the job or the unit that differ between the two places. */
function trfPayFlags_(from, to) {
  var flags = [];
  if (from.grade !== to.grade) flags.push({ key: 'GRADE', ar: 'الدرجة (وبدلاتها)', from: from.grade || '—', to: to.grade || '—' });
  if (from.collar !== to.collar) flags.push({ key: 'COLLAR', ar: 'التصنيف (إداري / فني)', from: from.collar || '—', to: to.collar || '—' });
  if (from.zone !== to.zone) flags.push({ key: 'TRANSPORT', ar: 'بدل الانتقالات (منطقة الموقع)', from: from.location, to: to.location });
  var rates = find_('JOB_NATURE_RATES', {}).filter(function (r) { return r.Status !== 'Inactive'; });
  if (rates.length) {
    var rf = suggestRate_({ Org_Unit_ID: from.unitId }, rates), rt = suggestRate_({ Org_Unit_ID: to.unitId }, rates);
    if (rf !== rt) {
      var nm = function (id) { var r = rates.filter(function (x) { return x.Rate_ID === id; })[0]; return r ? r.Department + ' (' + r.Amount + ')' : 'مفيش'; };
      flags.push({ key: 'JOB_NATURE', ar: 'بدل طبيعة العمل (القسم)', from: nm(rf), to: nm(rt) });
    }
  }
  return flags;
}

function trfStepUsers_(step, t) {
  if (step === 'FROM_MGR') return managerUsersOf_(t.From_Position_ID);
  if (step === 'TO_MGR') return managerUsersOf_(t.To_Position_ID);
  if (step === 'HR') return roleHolders_(ROLE.HR_MANAGER).concat(roleHolders_(ROLE.HR_SECTOR));
  if (step === 'PAY') return roleHolders_(ROLE.HR_SECTOR);
  return [];
}
function trfSteps_(t) { try { return JSON.parse(t.Steps_JSON || '[]'); } catch (e) { return []; } }

/** Move to the next open step; approve steps of the requester; skip steps with nobody. Returns the updated row fields. */
function trfAdvance_(t, steps, requester) {
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    if (s.status !== 'WAITING') continue;
    var users = trfStepUsers_(s.step, t).filter(function (u, k, a) { return a.indexOf(u) === k; });
    if (users.indexOf(requester) >= 0) { s.status = 'APPROVED'; s.by = requester; s.at = nowIso_(); s.note = 'صاحب الطلب'; continue; }
    if (!users.length) { s.status = 'SKIPPED'; s.at = nowIso_(); s.note = 'مفيش حد على الخطوة دي (الوظيفة شاغرة أو مفيش حساب)'; continue; }
    s.users = users;
    return { Steps_JSON: JSON.stringify(steps), Current_Step: s.step, Status: 'PENDING' };
  }
  return { Steps_JSON: JSON.stringify(steps), Current_Step: '', Status: 'APPROVED' };
}

/* ---------------- options for the form ---------------- */

/** p = { q, Employee_ID } — employees this user may move, and (with Employee_ID) target positions with room. */
function trfOptions_(ctx, p) {
  var hr = hasAnyRole_(ctx, trfHrRoles_()), scope = hr ? null : managedScope_(ctx.user);
  if (!hr && !scope.length) throw userError_('طلب النقل بيفتحه المدير الحالي للموظف أو فريق الموارد البشرية.');
  var q = norm_(p.q), posTitle = {};
  var wide = !!scope && q.length >= 3;          // v0.41: a receiving manager finds any employee by name / code (3 letters at least)
  var emps = find_('EMPLOYEES', { Status: 'Active' }).filter(function (e) {
    if (e.Exit_Date) return false;
    var pos = get_('POSITIONS', e.Position_ID);
    if (!pos) return false;
    if (scope && scope.indexOf(pos.Org_Unit_ID) < 0 && !wide) return false;
    if (pos.Position_ID === ctx.user.Position_ID) return false;
    if (q && norm_(e.Full_Name + ' ' + e.Employee_ID).indexOf(q) < 0) return false;
    return true;
  }).slice(0, 30).map(function (e) { var i = trfPosInfo_(e.Position_ID, e.Location_ID); return { id: e.Employee_ID, name: e.Full_Name, title: i.title, unit: i.unit, location: i.location }; });
  return { employees: emps, types: TRF_TYPES_, handover: trfHandoverItems_(), tempMaxDays: num_(cfg_('TRF_TEMP_MAX_DAYS', 180), 180), branches: all_('LOCATIONS').filter(function (l) { return l.Location_Type === 'SHOWROOM' && l.Status !== 'Inactive'; }).map(function (l) { return { id: l.Location_ID, name: l.Name_AR }; }) };
}
/** p = { q, Employee_ID } — positions with room for this employee (and the pay flags of each, on demand). */
function trfTargets_(ctx, p) {
  var e = trfEmployee_(p.Employee_ID);
  if (!trfCanOpen_(ctx, e)) throw userError_('مالكش صلاحية تفتح نقل للموظف ده.');
  var recv = trfAsReceiver_(ctx, e), scope = recv ? managedScope_(ctx.user) : null, temp = str_(p.Transfer_Type) === 'TEMPORARY';
  var res = positionsSearch_(ctx, { q: p.q, limit: 200 }).rows.filter(function (x) { return x.Position_ID !== e.Position_ID && x.Status !== 'Closed' &&
    (!scope || scope.indexOf((get_('POSITIONS', x.Position_ID) || {}).Org_Unit_ID) >= 0); });
  var out = [];
  res.forEach(function (x) {
    if (out.length >= 25) return;
    var r = trfRoom_(x.Position_ID);
    if (!r.room && !temp) return;              // a temporary cover keeps the employee's own position — no room needed
    out.push({ id: x.Position_ID, title: x.jobTitle, unit: x.unitName, location: x.locationName, grade: x.grade, vacancies: r.vacancies, free: r.free,
      branchGroup: (get_('LOCATIONS', x.Location_ID) || {}).Location_Type === 'BRANCH_GROUP' });
  });
  return { rows: out };
}
/** p = { Employee_ID, To_Position_ID, To_Location_ID } — the pay flags preview. */
function trfPreview_(ctx, p) {
  var e = trfEmployee_(p.Employee_ID);
  if (!trfCanOpen_(ctx, e)) throw userError_('مالكش صلاحية تفتح نقل للموظف ده.');
  var toPos = get_('POSITIONS', str_(p.To_Position_ID));
  if (!toPos) throw userError_('اختار الوظيفة الجديدة.');
  if (!trfCanOpen_(ctx, e, toPos)) throw userError_('كمدير مستلم، النقل بيكون لوظيفة في نطاقك بس.');
  var from = trfPosInfo_(e.Position_ID, e.Location_ID), to = trfPosInfo_(toPos.Position_ID, empLocation_(toPos, p.To_Location_ID));
  return { from: from, to: to, flags: trfPayFlags_(from, to), room: trfRoom_(toPos.Position_ID), steps: Object.keys(TRF_STEPS_).map(function (k) { return { step: k, name: TRF_STEPS_[k] }; }) };
}

/* ---------------- submit ---------------- */

/**
 * p = { Employee_ID, To_Position_ID, To_Location_ID, Vacancy_ID, Effective_Date, Reason,
 *       New_Schedule, Pay_Change: 'Y', Pay_Items: [{item, from, to, note}], Pay_Note }
 */
function trfSubmit_(ctx, p) {
  var e = trfEmployee_(p.Employee_ID), me = ctx.user.User_ID;
  if (!trfCanOpen_(ctx, e)) throw userError_('طلب النقل بيفتحه المدير الحالي للموظف أو المدير المستلم أو فريق الموارد البشرية.');
  var type = str_(p.Transfer_Type) || 'PERMANENT';
  if (!TRF_TYPES_[type]) throw userError_('اختار نوع النقل.');
  if (e.Temp_Transfer_ID) throw userError_('الموظف منتدب مؤقتاً دلوقتي (' + e.Temp_Transfer_ID + ') — استنى رجوعه أو أنهِ الانتداب الأول.');
  if (where_('TRANSFER_REQUESTS', function (t) { return t.Employee_ID === e.Employee_ID && ['PENDING', 'APPROVED'].indexOf(t.Status) >= 0; }).length)
    throw userError_('الموظف ده عليه طلب نقل مفتوح بالفعل.');
  var toPos = get_('POSITIONS', str_(p.To_Position_ID));
  if (!toPos || toPos.Status === 'Closed') throw userError_('اختار الوظيفة الجديدة.');
  if (!trfCanOpen_(ctx, e, toPos)) throw userError_('كمدير مستلم، النقل بيكون لوظيفة في نطاقك بس.');
  var toLoc = empLocation_(toPos, p.To_Location_ID);
  if (toPos.Position_ID === e.Position_ID && toLoc === e.Location_ID) throw userError_('الموظف على نفس المكان بالفعل.');
  var date = str_(p.Effective_Date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw userError_('اختار تاريخ النقل.');
  if (date < addDaysYmd_(today_(), -30)) throw userError_('تاريخ النقل قديم أوي — أقصى حاجة 30 يوم قبل النهارده.');
  var reason = str_(p.Reason);
  if (reason.length < 10) throw userError_('اكتب سبب النقل (10 حروف على الأقل).');
  var end = '';
  if (type === 'TEMPORARY') {
    end = str_(p.End_Date);
    var maxD = num_(cfg_('TRF_TEMP_MAX_DAYS', 180), 180);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= date) throw userError_('اختار تاريخ نهاية الانتداب (بعد تاريخ البداية).');
    if (end > addDaysYmd_(date, maxD)) throw userError_('أقصى مدة للانتداب ' + maxD + ' يوم — أكتر من كده يبقى نقل دائم.');
  }
  // room on the target (a temporary cover keeps the employee's own position: no room, no vacancy)
  var room = trfRoom_(toPos.Position_ID), vac = str_(p.Vacancy_ID);
  if (type === 'TEMPORARY') vac = '';
  else if (toPos.Position_ID !== e.Position_ID) {
    if (room.vacancies.length) {
      if (!vac && room.vacancies.length === 1) vac = room.vacancies[0].id;
      if (!vac && !room.free) throw userError_('اختار الشاغر اللي النقل هيقفله.');
      if (vac && !room.vacancies.some(function (v) { return v.id === vac; })) throw userError_('الشاغر المختار مش مفتوح على الوظيفة دي أو اكتمل.');
    } else {
      vac = '';
      if (!room.free) throw userError_('الوظيفة دي مفيهاش مكان شاغر (العدد الفعلي = المعتمد). النقل لازم يكون على مكان شاغر أو شاغر مفتوح.');
    }
  } else vac = '';      // same position, another branch
  // pay
  var from = trfPosInfo_(e.Position_ID, e.Location_ID), to = trfPosInfo_(toPos.Position_ID, toLoc), flags = trfPayFlags_(from, to);
  var payChange = str_(p.Pay_Change) === 'Y' || flags.length > 0;
  var items = (Array.isArray(p.Pay_Items) ? p.Pay_Items : []).map(function (x) {
    return { item: str_(x.item).slice(0, 80), from: str_(x.from).slice(0, 40), to: str_(x.to).slice(0, 40), note: str_(x.note).slice(0, 120) };
  }).filter(function (x) { return x.item; }).slice(0, 15);
  if (payChange && !items.length && str_(p.Pay_Note).length < 5) throw userError_(flags.length ? 'النقل ده بيغيّر بدلات مرتبطة بالوظيفة أو القسم — اكتب بنود تعديل مفردات الراتب (أو سبب إن مفيش تغيير).' : 'اكتب بنود تعديل مفردات الراتب.');
  var steps = ['FROM_MGR', 'TO_MGR', 'HR'].concat(payChange ? ['PAY'] : []).map(function (s) { return { step: s, status: 'WAITING' }; });
  var t;
  withLock_(function () {
    t = insert_('TRANSFER_REQUESTS', {
      Transfer_ID: nextId_('TRANSFER'), Employee_ID: e.Employee_ID, Full_Name: e.Full_Name, From_Position_ID: e.Position_ID, From_Location_ID: e.Location_ID,
      To_Position_ID: toPos.Position_ID, To_Location_ID: toLoc, Vacancy_ID: vac, Effective_Date: date, Reason: reason.slice(0, 500),
      New_Schedule: str_(p.New_Schedule).slice(0, 200), Pay_Change: payChange ? 'Y' : 'N', Pay_Items_JSON: JSON.stringify(items), Pay_Note: str_(p.Pay_Note).slice(0, 300),
      Pay_Flags_JSON: JSON.stringify(flags), Requester_User_ID: me, Steps_JSON: '[]', Current_Step: '', Status: 'PENDING', Done_At: '', Done_By: '',
      Reject_Reason: '', Payroll_Notified_At: '', Transfer_Type: type, End_Date: end,
      Handover_JSON: JSON.stringify(trfHandoverItems_().map(function (x) { return { item: x, done: '', by: '', at: '' }; })), Temp_Ended_At: '', Temp_Reminded_At: ''
    }, me);
    var adv = trfAdvance_(t, steps, me);
    t = update_('TRANSFER_REQUESTS', t.Transfer_ID, adv, me).after;
  });
  event_(ctx, 'TRANSFER', t.Transfer_ID, 'SUBMITTED', TRF_TYPES_[type] + ' — ' + e.Full_Name + ': ' + from.title + ' → ' + to.title + (end ? ' (لحد ' + end + ')' : ''));
  // the receiving manager opened it: the current manager hears about it at once (his opinion is asked in turn)
  if (trfAsReceiver_(ctx, e)) notify_(managerUsersOf_(e.Position_ID).filter(function (u) { return u !== me; }), 'طلب نقل لموظف عندك — ' + e.Full_Name,
    (ctx.user.Full_Name_AR || '') + ' طالب نقله لـ ' + to.title + ' من ' + date + '. هيتطلب رأيك، والقرار للموارد البشرية.', 'TRANSFER', t.Transfer_ID, true);
  trfAfterStep_(ctx, t);
  return trfView_(ctx, t);
}

/** After a step: notify the next approvers, or execute when approved and due. */
function trfAfterStep_(ctx, t) {
  if (t.Status === 'PENDING') {
    var s = trfSteps_(t).filter(function (x) { return x.step === t.Current_Step; })[0];
    notify_((s && s.users) || [], 'طلب نقل مستني اعتمادك — ' + t.Full_Name, TRF_STEPS_[t.Current_Step] + ' · تاريخ النقل ' + t.Effective_Date, 'TRANSFER', t.Transfer_ID, true);
  } else if (t.Status === 'APPROVED') {
    if (t.Effective_Date <= today_()) trfExecute_(ctx, t);
    else notify_([t.Requester_User_ID], 'طلب النقل اتعتمد — ' + t.Full_Name, 'هيتنفذ تلقائي يوم ' + t.Effective_Date + '.', 'TRANSFER', t.Transfer_ID);
  }
}

/** Move the employee (fill the vacancy when linked). */
function trfExecute_(ctx, t) {
  var e = findOne_('EMPLOYEES', { Employee_ID: t.Employee_ID }), me = ctx.user.User_ID;
  if (!e || e.Status !== 'Active') {
    withLock_(function () { update_('TRANSFER_REQUESTS', t.Transfer_ID, { Status: 'CANCELLED', Reject_Reason: 'الموظف مش على رأس العمل يوم التنفيذ' }, me); });
    return;
  }
  var note = 'نقل داخلي ' + t.Transfer_ID + (t.New_Schedule ? ' — مواعيد: ' + t.New_Schedule : '');
  var hoOpen = trfHandover_(t).filter(function (h) { return !h.done; }).map(function (h) { return h.item; });
  if (t.Transfer_Type === 'TEMPORARY') { trfTempStart_(ctx, t, e, hoOpen); return; }
  var v = t.Vacancy_ID ? get_('VACANCIES', t.Vacancy_ID) : null;
  if (v && ['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED'].indexOf(v.Status) >= 0 && occFromEmployees_()) {
    vacancyFill_(ctx, { Vacancy_ID: v.Vacancy_ID, Method: 'INTERNAL_TRANSFER', Employee_ID: e.Employee_ID, Employee_Name: e.Full_Name,
      Source_Position_ID: e.Position_ID, Effective_Date: t.Effective_Date, Notes: note });
    if (t.To_Location_ID && t.To_Location_ID !== (findOne_('EMPLOYEES', { Employee_ID: e.Employee_ID }) || {}).Location_ID)
      withLock_(function () { update_('EMPLOYEES', e.Employee_ID, { Location_ID: t.To_Location_ID }, me); });
  } else {
    empTransfer_(ctx, { Employee_ID: e.Employee_ID, Position_ID: t.To_Position_ID, Location_ID: t.To_Location_ID, Event_Date: t.Effective_Date, reason: note, Ref: t.Transfer_ID });
  }
  withLock_(function () { update_('TRANSFER_REQUESTS', t.Transfer_ID, { Status: 'DONE', Done_At: nowIso_(), Done_By: me }, me); });
  event_(ctx, 'TRANSFER', t.Transfer_ID, 'DONE', t.Effective_Date);
  var to = [t.Requester_User_ID].concat(managerUsersOf_(t.From_Position_ID), managerUsersOf_(t.To_Position_ID));
  if (t.Pay_Change === 'Y') to = to.concat(roleHolders_(ROLE.HR_MANAGER));
  notify_(to.filter(function (u) { return u && u !== me; }), 'اتنفذ النقل — ' + t.Full_Name,
    'تاريخ النقل ' + t.Effective_Date + (t.Pay_Change === 'Y' ? ' · فيه تعديل مفردات راتب — اطبع الإخطار للمرتبات.' : '') +
    (hoOpen.length ? ' · التسليم لسه ناقص: ' + hoOpen.join('، ') : ''), 'TRANSFER', t.Transfer_ID, true);
  // v0.41 (CHG-85): the old place is empty now — the old manager is offered a ready replacement request
  if (t.From_Position_ID !== t.To_Position_ID) notify_(managerUsersOf_(t.From_Position_ID).filter(function (u) { return u && u !== me; }),
    'مكان ' + t.Full_Name + ' فضي بعد النقل — محتاج بديل؟', 'افتح الإشعار وابدأ طلب بديل جاهز ببيانات الوظيفة.', 'TRANSFER_REP', t.Transfer_ID, false);
}

/** v0.41: a temporary cover starts — the employee keeps his own position (and headcount); the cover is recorded on him. */
function trfTempStart_(ctx, t, e, hoOpen) {
  var me = ctx.user.User_ID;
  withLock_(function () {
    update_('EMPLOYEES', e.Employee_ID, { Temp_Position_ID: t.To_Position_ID, Temp_Location_ID: t.To_Location_ID, Temp_Until: t.End_Date, Temp_Transfer_ID: t.Transfer_ID }, me);
    empHistory_(me, e, 'TEMP_ASSIGN', { From_Position_ID: e.Position_ID, To_Position_ID: t.To_Position_ID, From_Location_ID: e.Location_ID,
      To_Location_ID: t.To_Location_ID, Event_Date: t.Effective_Date, Note: 'انتداب لحد ' + t.End_Date, Ref: t.Transfer_ID });
    update_('TRANSFER_REQUESTS', t.Transfer_ID, { Status: 'DONE', Done_At: nowIso_(), Done_By: me }, me);
  });
  event_(ctx, 'TRANSFER', t.Transfer_ID, 'TEMP_STARTED', t.Effective_Date + ' → ' + t.End_Date);
  notify_([t.Requester_User_ID].concat(managerUsersOf_(t.From_Position_ID), managerUsersOf_(t.To_Position_ID)).filter(function (u) { return u && u !== me; }),
    'بدأ الانتداب — ' + t.Full_Name, 'من ' + t.Effective_Date + ' لحد ' + t.End_Date + ' — وظيفته الأصلية محفوظة.' + (hoOpen.length ? ' التسليم لسه ناقص: ' + hoOpen.join('، ') : ''),
    'TRANSFER', t.Transfer_ID, true);
}

/** v0.41: the cover ends (its end date passed, or HR ends it early) — he is back on his own position. */
function trfTempEnd_(ctx, t, why) {
  var me = ctx.user.User_ID, e = findOne_('EMPLOYEES', { Employee_ID: t.Employee_ID });
  withLock_(function () {
    if (e && e.Temp_Transfer_ID === t.Transfer_ID) {
      update_('EMPLOYEES', e.Employee_ID, { Temp_Position_ID: '', Temp_Location_ID: '', Temp_Until: '', Temp_Transfer_ID: '' }, me);
      empHistory_(me, e, 'TEMP_END', { From_Position_ID: t.To_Position_ID, To_Position_ID: e.Position_ID, From_Location_ID: t.To_Location_ID,
        To_Location_ID: e.Location_ID, Event_Date: today_(), Note: why, Ref: t.Transfer_ID });
    }
    update_('TRANSFER_REQUESTS', t.Transfer_ID, { Temp_Ended_At: nowIso_() }, me);
  });
  event_(ctx, 'TRANSFER', t.Transfer_ID, 'TEMP_ENDED', why);
  notify_([t.Requester_User_ID].concat(managerUsersOf_(t.From_Position_ID), managerUsersOf_(t.To_Position_ID)).filter(function (u) { return u && u !== me; }),
    'انتهى الانتداب — ' + t.Full_Name, why + ' — رجع لوظيفته الأصلية.', 'TRANSFER', t.Transfer_ID, false);
}

function trfHandover_(t) { try { return JSON.parse(t.Handover_JSON || '[]') || []; } catch (e) { return []; } }

/* ---------------- act ---------------- */

/** p = { Transfer_ID, action: APPROVE | REJECT | CANCEL | NOTIFIED, note } */
function trfAction_(ctx, p) {
  var t = get_('TRANSFER_REQUESTS', str_(p.Transfer_ID));
  if (!t) throw userError_('طلب النقل غير موجود.');
  var act = str_(p.action), me = ctx.user.User_ID, note = str_(p.note);
  if (act === 'APPROVE' || act === 'REJECT') {
    if (t.Status !== 'PENDING') throw userError_('الطلب مش مستني اعتماد.');
    var steps = trfSteps_(t), s = steps.filter(function (x) { return x.step === t.Current_Step; })[0];
    var users = trfStepUsers_(t.Current_Step, t);
    if (!s || users.indexOf(me) < 0) throw userError_('الخطوة دي مش عندك — مستنية ' + TRF_STEPS_[t.Current_Step] + '.');
    var opinion = TRF_OPINION_STEPS_.indexOf(s.step) >= 0;          // v0.41: a manager's word is an opinion, HR decides
    if (act === 'REJECT' && note.length < 3) throw userError_(opinion ? 'اكتب سبب اعتراضك — هيوصل للموارد البشرية مع الطلب.' : 'اكتب سبب الرفض.');
    s.status = act === 'APPROVE' ? 'APPROVED' : opinion ? 'OBJECTED' : 'REJECTED'; s.by = me; s.at = nowIso_(); s.note = note.slice(0, 300);
    var patch;
    if (act === 'REJECT' && !opinion) patch = { Steps_JSON: JSON.stringify(steps), Status: 'REJECTED', Current_Step: '', Reject_Reason: note.slice(0, 300) };
    else patch = trfAdvance_(t, steps, t.Requester_User_ID);
    withLock_(function () { t = update_('TRANSFER_REQUESTS', t.Transfer_ID, patch, me).after; });
    event_(ctx, 'TRANSFER', t.Transfer_ID, act === 'APPROVE' ? (opinion ? 'SUPPORTED_' : 'APPROVED_') + s.step : opinion ? 'OBJECTED_' + s.step : 'REJECTED', note);
    if (act === 'REJECT' && opinion) {
      notify_([t.Requester_User_ID].filter(function (u) { return u !== me; }), 'اعتراض على طلب النقل — ' + t.Full_Name, TRF_STEPS_[s.step] + ': ' + note + ' (القرار للموارد البشرية)', 'TRANSFER', t.Transfer_ID, false);
      trfAfterStep_(ctx, t);
    } else if (act === 'REJECT') notify_([t.Requester_User_ID], 'طلب النقل اترفض — ' + t.Full_Name, TRF_STEPS_[s.step] + ': ' + note, 'TRANSFER', t.Transfer_ID, true);
    else trfAfterStep_(ctx, t);
  } else if (act === 'CANCEL') {
    if (['PENDING', 'APPROVED'].indexOf(t.Status) < 0) throw userError_('الطلب اتقفل بالفعل.');
    if (t.Requester_User_ID !== me && !hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('الإلغاء لصاحب الطلب أو مديرين الموارد البشرية.');
    if (note.length < 3) throw userError_('اكتب سبب الإلغاء.');
    withLock_(function () { t = update_('TRANSFER_REQUESTS', t.Transfer_ID, { Status: 'CANCELLED', Current_Step: '', Reject_Reason: note.slice(0, 300) }, me).after; });
    event_(ctx, 'TRANSFER', t.Transfer_ID, 'CANCELLED', note);
  } else if (act === 'HANDOVER') {
    // v0.41: the handover list — ticked by the current manager, the requester or HR, until the move is done
    if (['PENDING', 'APPROVED'].indexOf(t.Status) < 0 && !(t.Status === 'DONE' && t.Transfer_Type === 'TEMPORARY' && !t.Temp_Ended_At)) throw userError_('الطلب اتقفل.');
    if (!(hasAnyRole_(ctx, trfHrRoles_()) || t.Requester_User_ID === me || managerUsersOf_(t.From_Position_ID).indexOf(me) >= 0)) throw userError_('التسليم يسجله المدير الحالي أو الموارد البشرية.');
    var ho = trfHandover_(t), i = Number(p.index);
    if (str_(p.item)) { if (ho.length >= 15) throw userError_('القائمة كاملة.'); ho.push({ item: str_(p.item).slice(0, 120), done: '', by: '', at: '' }); }
    else {
      if (!(i >= 0 && i < ho.length)) throw userError_('البند غير موجود.');
      ho[i].done = str_(p.done) === 'Y' ? 'Y' : ''; ho[i].by = ho[i].done ? me : ''; ho[i].at = ho[i].done ? nowIso_() : '';
    }
    withLock_(function () { t = update_('TRANSFER_REQUESTS', t.Transfer_ID, { Handover_JSON: JSON.stringify(ho) }, me).after; });
  } else if (act === 'END_TEMP') {
    if (t.Transfer_Type !== 'TEMPORARY' || t.Status !== 'DONE' || t.Temp_Ended_At) throw userError_('مفيش انتداب شغال على الطلب ده.');
    if (!hasAnyRole_(ctx, trfHrRoles_())) throw userError_('إنهاء الانتداب بدري للموارد البشرية.');
    if (note.length < 3) throw userError_('اكتب سبب إنهاء الانتداب.');
    trfTempEnd_(ctx, t, 'اتنهى بدري: ' + note.slice(0, 200));
  } else if (act === 'NOTIFIED') {
    if (t.Status !== 'DONE' || t.Pay_Change !== 'Y') throw userError_('مفيش إخطار مرتبات على الطلب ده.');
    if (t.Payroll_Notified_At) throw userError_('اتسجل إخطار المرتبات قبل كده.');
    if (!hasAnyRole_(ctx, trfHrRoles_())) throw userError_('إخطار المرتبات لفريق الموارد البشرية.');
    withLock_(function () { t = update_('TRANSFER_REQUESTS', t.Transfer_ID, { Payroll_Notified_At: nowIso_() }, me).after; });
    event_(ctx, 'TRANSFER', t.Transfer_ID, 'PAYROLL_NOTIFIED', '');
  } else throw userError_('عملية غير معروفة.');
  return trfView_(ctx, get_('TRANSFER_REQUESTS', t.Transfer_ID));
}

/* ---------------- read ---------------- */

function trfCanView_(ctx, t) {
  if (hasAnyRole_(ctx, trfHrRoles_()) || ctx.readOnly) return true;
  var me = ctx.user.User_ID;
  if (t.Requester_User_ID === me) return true;
  if (trfSteps_(t).some(function (s) { return s.by === me || (s.users || []).indexOf(me) >= 0; })) return true;
  return managerUsersOf_(t.From_Position_ID).indexOf(me) >= 0 || managerUsersOf_(t.To_Position_ID).indexOf(me) >= 0;
}
function trfView_(ctx, t) {
  var names = userNames_(), payOk = hasAnyRole_(ctx, trfPayRoles_());
  var from = trfPosInfo_(t.From_Position_ID, t.From_Location_ID), to = trfPosInfo_(t.To_Position_ID, t.To_Location_ID);
  var steps = trfSteps_(t).map(function (s) {
    return { step: s.step, name: TRF_STEPS_[s.step], status: s.status, opinion: TRF_OPINION_STEPS_.indexOf(s.step) >= 0, by: names[s.by] || '', at: s.at || '', note: s.note || '',
      waitingFor: s.status === 'WAITING' && t.Current_Step === s.step ? (s.users || []).map(function (u) { return names[u] || u; }) : [] };
  });
  var cur = t.Status === 'PENDING' ? trfStepUsers_(t.Current_Step, t) : [];
  var x = { id: t.Transfer_ID, employeeId: t.Employee_ID, name: t.Full_Name, from: from, to: to, vacancy: t.Vacancy_ID, date: t.Effective_Date, reason: t.Reason,
    schedule: t.New_Schedule, locationChange: from.locationId !== to.locationId, payChange: t.Pay_Change === 'Y', status: t.Status, statusName: TRF_ST_[t.Status] || t.Status,
    type: t.Transfer_Type || 'PERMANENT', typeName: TRF_TYPES_[t.Transfer_Type || 'PERMANENT'], endDate: t.End_Date, tempEndedAt: t.Temp_Ended_At,
    tempActive: t.Transfer_Type === 'TEMPORARY' && t.Status === 'DONE' && !t.Temp_Ended_At,
    handover: trfHandover_(t).map(function (h) { return { item: h.item, done: h.done === 'Y', by: names[h.by] || '', at: h.at }; }),
    canHandover: !ctx.readOnly && (['PENDING', 'APPROVED'].indexOf(t.Status) >= 0 || (t.Transfer_Type === 'TEMPORARY' && t.Status === 'DONE' && !t.Temp_Ended_At)) &&
      (hasAnyRole_(ctx, trfHrRoles_()) || t.Requester_User_ID === ctx.user.User_ID || managerUsersOf_(t.From_Position_ID).indexOf(ctx.user.User_ID) >= 0),
    canEndTemp: !ctx.readOnly && t.Transfer_Type === 'TEMPORARY' && t.Status === 'DONE' && !t.Temp_Ended_At && hasAnyRole_(ctx, trfHrRoles_()),
    step: t.Current_Step, stepName: TRF_STEPS_[t.Current_Step] || '', steps: steps, requester: names[t.Requester_User_ID] || '', at: t.Created_At,
    rejectReason: t.Reject_Reason, doneAt: t.Done_At, payrollNotifiedAt: t.Payroll_Notified_At,
    canAct: !ctx.readOnly && t.Status === 'PENDING' && cur.indexOf(ctx.user.User_ID) >= 0,
    canCancel: !ctx.readOnly && ['PENDING', 'APPROVED'].indexOf(t.Status) >= 0 && (t.Requester_User_ID === ctx.user.User_ID || hasAnyRole_(ctx, HR_ADMIN_ROLES)),
    canNotify: !ctx.readOnly && t.Status === 'DONE' && t.Pay_Change === 'Y' && !t.Payroll_Notified_At && hasAnyRole_(ctx, trfHrRoles_()),
    payVisible: payOk };
  try { x.flags = JSON.parse(t.Pay_Flags_JSON || '[]'); } catch (e) { x.flags = []; }
  if (payOk) { try { x.payItems = JSON.parse(t.Pay_Items_JSON || '[]'); } catch (e) { x.payItems = []; } x.payNote = t.Pay_Note; }
  return x;
}
function trfGet_(ctx, p) {
  var t = get_('TRANSFER_REQUESTS', str_(p.Transfer_ID));
  if (!t) throw userError_('طلب النقل غير موجود.');
  if (!trfCanView_(ctx, t)) throw userError_('مالكش صلاحية على الطلب ده.');
  var v = trfView_(ctx, t);
  v.events = eventsFor_('TRANSFER', t.Transfer_ID).map(function (e) { return { event: e.Event, by: (userNames_()[e.Actor_ID] || ''), at: e.Created_At, note: e.Comment }; });
  return v;
}
/** p.tab = mine (waiting for me) | open | done | all */
function trfList_(ctx, p) {
  var tab = str_(p.tab) || 'mine', me = ctx.user.User_ID;
  var rows = where_('TRANSFER_REQUESTS', function (t) { return trfCanView_(ctx, t); }).filter(function (t) {
    if (tab === 'mine') return t.Status === 'PENDING' && trfStepUsers_(t.Current_Step, t).indexOf(me) >= 0;
    if (tab === 'open') return ['PENDING', 'APPROVED'].indexOf(t.Status) >= 0 || (t.Transfer_Type === 'TEMPORARY' && t.Status === 'DONE' && !t.Temp_Ended_At);
    if (tab === 'done') return ['DONE', 'REJECTED', 'CANCELLED'].indexOf(t.Status) >= 0;
    return true;
  }).sort(function (a, b) { return a.Created_At < b.Created_At ? 1 : -1; }).map(function (t) { return trfView_(ctx, t); });
  return { tab: tab, rows: rows, canOpen: !ctx.readOnly && (hasAnyRole_(ctx, trfHrRoles_()) || managedScope_(ctx.user).length > 0) };
}
function trfTodo_(ctx) {
  if (ctx.readOnly) return 0;
  var me = ctx.user.User_ID;
  return where_('TRANSFER_REQUESTS', function (t) { return t.Status === 'PENDING'; }).filter(function (t) { return trfStepUsers_(t.Current_Step, t).indexOf(me) >= 0; }).length;
}

/** Daily: approved transfers whose date came → execute (as the last approver). */
function trfDaily_() {
  var t0 = today_(), n = 0;
  where_('TRANSFER_REQUESTS', function (t) { return t.Status === 'APPROVED' && t.Effective_Date <= t0; }).forEach(function (t) {
    var last = trfSteps_(t).filter(function (s) { return s.by; }).pop();
    var u = get_('USERS', last ? last.by : t.Requester_User_ID) || get_('USERS', t.Requester_User_ID);
    try { trfExecute_({ user: u, sessionId: '' }, t); n++; } catch (e) { console.error('transfer ' + t.Transfer_ID + ': ' + e); }
  });
  // v0.41: temporary covers — ended when their end date passed (every day); a reminder a week before (working days)
  var ended = 0, reminded = 0, weekend = isWeekend_(t0), soon = addDaysYmd_(t0, 7), hr = null;
  where_('TRANSFER_REQUESTS', function (t) { return t.Transfer_Type === 'TEMPORARY' && t.Status === 'DONE' && !t.Temp_Ended_At; }).forEach(function (t) {
    var u = get_('USERS', t.Done_By) || get_('USERS', t.Requester_User_ID) || { User_ID: 'SYSTEM' };
    if (t.End_Date < t0) { try { trfTempEnd_({ user: u, sessionId: '' }, t, 'خلصت مدة الانتداب (' + t.End_Date + ')'); ended++; } catch (e) { console.error('temp ' + t.Transfer_ID + ': ' + e); } return; }
    if (!weekend && t.End_Date <= soon && !t.Temp_Reminded_At) {
      if (!hr) hr = roleHolders_(ROLE.HR_MANAGER);
      withLock_(function () { update_('TRANSFER_REQUESTS', t.Transfer_ID, { Temp_Reminded_At: nowIso_() }, 'SYSTEM'); });
      notify_([t.Requester_User_ID].concat(managerUsersOf_(t.To_Position_ID), hr), 'الانتداب بيخلص ' + t.End_Date + ' — ' + t.Full_Name,
        'لو محتاجين يكمّل، اعملوا طلب جديد (نقل دائم أو انتداب تاني) قبل الميعاد.', 'TRANSFER', t.Transfer_ID, false);
      reminded++;
    }
  });
  return { executed: n, tempEnded: ended, tempReminded: reminded };
}
