/**
 * Admin.gs — HR admin screens added in v0.8.1 (decision CHG-40/5 and /10):
 *   • Delegation / acting authority: a unit head's approval authority given to another user for a period.
 *     Each delegation is its own record; it is only ever stopped, never rewritten (blueprint 6.3).
 *   • Editable lists: request reject / return reasons, candidate reject / withdraw reasons, end-of-service
 *     reasons and candidate activity types (REASON_MASTER). Codes never change; items are stopped, not deleted.
 *   • Job change history (JOB_VERSIONS) for the job / grade edit on the job page.
 */

/* ---------------- delegation ---------------- */

var DLG_MAX_DAYS_ = 90;           // v0.34.0 (CHG-76): 90 days, renewable
/** v0.36.0: what a delegation may cover. APPROVALS = approval steps (requests, new positions); TEAM = the unit's work
 *  that follows its head (candidates on the shortlist, transfers, probation …). ALL = both. */
var DLG_SCOPES_ = { APPROVALS: 'اعتماد الطلبات', TEAM: 'متابعة شغل الوحدة (المرشحين، النقل، فترة الاختبار)' };
function dlgScopeClean_(v) {
  var list = (Array.isArray(v) ? v : str_(v).split(',')).map(str_).filter(function (x) { return DLG_SCOPES_[x]; });
  return !list.length || list.length === Object.keys(DLG_SCOPES_).length ? 'ALL' : list.join(',');
}
function dlgScopeHas_(d, proc) { var s = str_(d.Process_Scope); return !s || s === 'ALL' || s.split(',').indexOf(proc) >= 0; }
function dlgScopeText_(s) { return !s || s === 'ALL' ? 'كل صلاحيات الوظيفة' : s.split(',').map(function (x) { return DLG_SCOPES_[x] || x; }).join('، '); }

function delegationState_(d, today) {
  if (d.Status === 'PENDING_CEO') return 'PENDING_CEO';
  if (d.Status !== 'Active') return 'ENDED';
  if (d.Effective_To && d.Effective_To < today) return 'ENDED';
  if (d.Effective_From && d.Effective_From > today) return 'UPCOMING';
  return 'ACTIVE';
}

/** Positions that head an active unit (their holders approve) — the authority a delegation can carry. */
function headPositions_() {
  var holders = holdersByPosition_();
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  var out = {};
  where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Head_Position_ID && u.Org_Version_ID === activeVersion_(); })
    .forEach(function (u) {
      var p = get_('POSITIONS', u.Head_Position_ID);
      if (!p || out[p.Position_ID]) return;
      out[p.Position_ID] = { id: p.Position_ID, title: p.Position_Title || jobs[p.Job_Code] || p.Position_ID, unit: u.Name_AR,
        unitType: u.Unit_Type, holders: (holders[p.Position_ID] || []).join('، ') };
    });
  return Object.keys(out).map(function (k) { return out[k]; })
    .sort(function (a, b) { return UNIT_TYPES.indexOf(a.unitType) - UNIT_TYPES.indexOf(b.unitType) || (a.unit < b.unit ? -1 : 1); });
}

function delegationsList_(ctx) {
  var today = today_(), names = userNames_();
  var heads = headPositions_(), byPos = {};
  heads.forEach(function (h) { byPos[h.id] = h; });
  var rows = all_('DELEGATIONS').map(function (d) {
    var h = byPos[d.From_Position_ID] || {};
    var pos = h.id ? null : get_('POSITIONS', d.From_Position_ID);
    return { Delegation_ID: d.Delegation_ID, From_Position_ID: d.From_Position_ID, posTitle: h.title || (pos ? pos.Position_Title : d.From_Position_ID),
      unit: h.unit || '', holders: h.holders || '', To_User_ID: d.To_User_ID, toName: names[d.To_User_ID] || d.To_User_ID,
      Effective_From: d.Effective_From, Effective_To: d.Effective_To, Reason: d.Reason, state: delegationState_(d, today),
      byName: names[d.Created_By] || d.Created_By, at: d.Created_At, scope: d.Process_Scope || 'ALL', scopeText: dlgScopeText_(d.Process_Scope),
      rejected: d.Status === 'Rejected' };
  }).sort(function (a, b) {
    var o = { PENDING_CEO: 0, ACTIVE: 1, UPCOMING: 2, ENDED: 3 };
    return o[a.state] - o[b.state] || (a.Delegation_ID < b.Delegation_ID ? 1 : -1);
  });
  return { rows: rows, heads: heads, canEdit: hasAnyRole_(ctx, HR_ADMIN_ROLES), scopes: DLG_SCOPES_,
    users: where_('USERS', function (u) { return u.Status === 'Active'; }).map(function (u) { return { id: u.User_ID, name: u.Full_Name_AR }; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; }) };
}

/** p = { From_Position_ID, To_User_ID, Effective_From, Effective_To, Reason } */
function delegationSave_(ctx, p) {
  var posId = str_(p.From_Position_ID), to = str_(p.To_User_ID);
  var head = headPositions_().filter(function (h) { return h.id === posId; })[0];
  if (!head) throw userError_('اختار وظيفة مدير وحدة — التفويض بيكون لصلاحية اعتماد مدير.');
  var u = get_('USERS', to);
  if (!u || u.Status !== 'Active') throw userError_('اختار المستخدم اللي هيتفوّض له.');
  if (u.Position_ID === posId) throw userError_('المستخدم ده هو نفسه شاغل الوظيفة.');
  // v0.34.0 (CHG-74): nobody delegates authority to himself; top units' heads only by the owner / HR sector manager
  if (to === ctx.user.User_ID) throw userError_('ماينفعش تفوّض صلاحية لنفسك — مدير قطاع الموارد البشرية أو مالك النظام يعملها.');
  if ((head.unitType === 'COMPANY' || head.unitType === 'SECTOR') && !hasAnyRole_(ctx, protectedRoles_()))
    throw userError_('تفويض صلاحية رئيس الشركة أو مدير قطاع بيعمله مدير قطاع الموارد البشرية أو مالك النظام بس.');
  var today = today_();
  var from = str_(p.Effective_From) || today, end = str_(p.Effective_To);
  [from, end].forEach(function (d) { if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw userError_('التاريخ غير صحيح.'); });
  if (!end) throw userError_('حدد آخر يوم في التفويض.');
  if (end < from) throw userError_('آخر يوم قبل أول يوم.');
  if (end < today) throw userError_('آخر يوم في التفويض عدّى.');
  if (daysBetween_(from, end) > DLG_MAX_DAYS_) throw userError_('التفويض أقصاه 90 يوم — جدّده بعدها لو لسه محتاج.');
  var reason = str_(p.Reason);
  if (reason.length < 3) throw userError_('اكتب سبب التفويض (مثلاً: إجازة سنوية).');
  var dup = where_('DELEGATIONS', function (d) {
    return d.From_Position_ID === posId && d.To_User_ID === to && delegationState_(d, today) !== 'ENDED' &&
      !(d.Effective_To < from || (end && d.Effective_From > end));
  });
  if (dup.length) throw userError_('في تفويض ساري لنفس المستخدم على نفس الوظيفة في نفس الفترة.');
  // v0.36.0 (CHG-76): the processes delegated — anything not listed stays with the position's holder
  var scope = dlgScopeClean_(p.Process_Scope);
  // a delegation of the company head's (CEO's) authority takes effect only after the CEO approves it
  var needCeo = head.unitType === 'COMPANY' && ceoUsers_().length > 0;
  var row;
  withLock_(function () {
    row = insert_('DELEGATIONS', { Delegation_ID: nextId_('DELEGATION'), From_Position_ID: posId, To_User_ID: to, Process_Scope: scope,
      Effective_From: from, Effective_To: end, Reason: reason, Status: needCeo ? 'PENDING_CEO' : 'Active' }, ctx.user.User_ID);
  });
  if (needCeo) {
    ceoQueue_(ctx, 'DELEGATION', row.Delegation_ID, 'تفويض صلاحية ' + head.title + ' لـ ' + u.Full_Name_AR + ' من ' + from + ' لحد ' + end,
      'الصلاحيات: ' + dlgScopeText_(scope) + ' · السبب: ' + reason, { Delegation_ID: row.Delegation_ID });
    audit_(ctx, { entityType: 'DELEGATION', entityId: row.Delegation_ID, action: 'CREATE', newValue: posId + ' → ' + to + ' (' + from + ' : ' + end + ') — مستني الرئيس التنفيذي', reason: reason });
    row.pendingCeo = true;
    return row;
  }
  audit_(ctx, { entityType: 'DELEGATION', entityId: row.Delegation_ID, action: 'CREATE', newValue: posId + ' → ' + to + ' (' + from + ' : ' + end + ')', reason: reason });
  notify_([to], 'اتفوضت لك صلاحية اعتماد', head.title + ' — ' + head.unit + ' من ' + from + ' لحد ' + end +
    '. هتوصلك طلبات الاعتماد بتاعة الوظيفة دي في الفترة دي. السبب: ' + reason, '', '', true);
  var holderIds = where_('USERS', function (x) { return x.Status === 'Active' && x.Position_ID === posId; }).map(function (x) { return x.User_ID; });
  notify_(holderIds, 'تفويض على صلاحية اعتمادك', u.Full_Name_AR + ' يقدر يعتمد بدلك من ' + from + ' لحد ' + end + '. السبب: ' + reason, '', '', false);
  return row;
}

/** p = { Delegation_ID, reason } — stops it from today (the record stays). */
function delegationStop_(ctx, p) {
  var d = get_('DELEGATIONS', str_(p.Delegation_ID));
  if (!d) throw userError_('التفويض غير موجود.');
  if (delegationState_(d, today_()) === 'ENDED') throw userError_('التفويض منتهي بالفعل.');
  var reason = requireReason_(p);
  var res;
  withLock_(function () {
    res = update_('DELEGATIONS', d.Delegation_ID, { Status: 'Ended', Effective_To: d.Effective_From > yesterday_() ? d.Effective_From : yesterday_() }, ctx.user.User_ID);
    // v0.36.0: one still waiting for the CEO leaves his list too
    where_('CEO_APPROVALS', function (a) { return a.Kind === 'DELEGATION' && a.Ref_ID === d.Delegation_ID && a.Status === 'PENDING'; })
      .forEach(function (a) { update_('CEO_APPROVALS', a.CA_ID, { Status: 'CANCELLED', Comment: 'التفويض اتوقف: ' + reason }, ctx.user.User_ID); });
  });
  auditDiff_(ctx, 'DELEGATION', d.Delegation_ID, res.before, res.after, reason);
  notify_([d.To_User_ID], 'التفويض اتوقف', 'تفويض الاعتماد على ' + ((get_('POSITIONS', d.From_Position_ID) || {}).Position_Title || d.From_Position_ID) +
    ' اتوقف. السبب: ' + reason, '', '', false);
  return res.after;
}

/* ---------------- editable lists (REASON_MASTER) ---------------- */

var LIST_PROCESSES_ = [
  ['REQUEST_REJECT', 'أسباب رفض طلب التوظيف'],
  ['REQUEST_RETURN', 'أسباب إرجاع الطلب للتعديل'],
  ['CANDIDATE_REJECT', 'أسباب رفض المرشح'],
  ['CANDIDATE_WITHDRAW', 'أسباب انسحاب المرشح'],
  ['EMPLOYEE_EXIT', 'أسباب نهاية الخدمة'],
  ['ACTIVITY_TYPE', 'أنواع أنشطة المرشحين'],
  ['HIRING_RESTRICTION', 'أسباب قيود إعادة التعيين']
];
/** Items the portal's own logic relies on: they can be renamed, not stopped. */
var LIST_LOCKED_ = { ACTIVITY_TYPE: ['CALL', 'WHATSAPP', 'EMAIL', 'NOTE'], CANDIDATE_REJECT: ['VACANCY_CANCELLED'], CANDIDATE_WITHDRAW: ['TRANSFERRED', 'DUPLICATE'] };

function listLocked_(process, code) {
  return code === 'OTHER' || (LIST_LOCKED_[process] || []).indexOf(code) >= 0;
}

function listsGet_(ctx) {
  var by = {};
  all_('REASON_MASTER').forEach(function (r) { (by[r.Process] = by[r.Process] || []).push(r); });
  return {
    canEdit: hasAnyRole_(ctx, HR_ADMIN_ROLES),
    processes: LIST_PROCESSES_.map(function (x) {
      var items = (by[x[0]] || []).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); })
        .map(function (r) { r.locked = listLocked_(x[0], r.Code); return r; });
      return { code: x[0], name: x[1], items: items };
    })
  };
}

/** p = { Reason_ID? | Process, Label_AR, Label_EN, Requires_Note (Y/N), Sort_Order, Status } */
function listItemSave_(ctx, p) {
  var id = str_(p.Reason_ID);
  var cur = id ? get_('REASON_MASTER', id) : null;
  if (id && !cur) throw userError_('البند غير موجود.');
  var process = cur ? cur.Process : str_(p.Process);
  if (!LIST_PROCESSES_.some(function (x) { return x[0] === process; })) throw userError_('اختار القائمة.');
  var label = str_(p.Label_AR).replace(/\s+/g, ' ');
  if (label.length < 2) throw userError_('اكتب الاسم بالعربي.');
  var same = where_('REASON_MASTER', function (r) { return r.Process === process && norm_(r.Label_AR) === norm_(label) && r.Reason_ID !== id; });
  if (same.length) throw userError_('في بند بنفس الاسم في القائمة دي.');
  var note = str_(p.Requires_Note) === 'Y' ? 'Y' : 'N';
  var status = str_(p.Status) || 'Active';
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');
  var order = str_(p.Sort_Order);
  if (order && !/^\d{1,4}$/.test(order)) throw userError_('الترتيب لازم يكون رقم.');
  var fields = { Label_AR: label, Label_EN: str_(p.Label_EN).replace(/\s+/g, ' '), Requires_Note: note, Status: status };
  if (order) fields.Sort_Order = order;
  if (cur && status === 'Inactive' && cur.Status !== 'Inactive') {
    if (listLocked_(process, cur.Code)) throw userError_('البند ده أساسي في البوابة — تقدر تغيّر اسمه بس، مش توقفه.');
    var active = where_('REASON_MASTER', function (r) { return r.Process === process && r.Status === 'Active' && r.Reason_ID !== cur.Reason_ID; });
    if (!active.length) throw userError_('لازم يفضل بند واحد نشط على الأقل في القائمة.');
  }
  return withLock_(function () {
    if (!cur) {
      var max = 0;
      where_('REASON_MASTER', function (r) { return r.Process === process; }).forEach(function (r) { max = Math.max(max, num_(r.Sort_Order, 0)); });
      var rid = nextId_('REASON');
      fields.Reason_ID = rid;
      fields.Process = process;
      fields.Code = 'C' + rid.replace(/\D/g, '');
      fields.Sort_Order = fields.Sort_Order || String(max + 10);
      if (fields.Status !== 'Active') fields.Status = 'Active';
      var row = insert_('REASON_MASTER', fields, ctx.user.User_ID);
      audit_(ctx, { entityType: 'REASON', entityId: rid, action: 'CREATE', newValue: process + ': ' + label });
      I18N_SERVER_TR_ = null;
      return row;
    }
    var res = update_('REASON_MASTER', cur.Reason_ID, fields, ctx.user.User_ID);
    auditDiff_(ctx, 'REASON', cur.Reason_ID, res.before, res.after, str_(p.reason));
    I18N_SERVER_TR_ = null;
    return res.after;
  });
}

/** Active activity types for the candidate screens: [{ code, name, note }]. */
function activityTypes_() {
  var list = find_('REASON_MASTER', { Process: 'ACTIVITY_TYPE', Status: 'Active' }, { sort: 'Sort_Order' })
    .sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); });
  return list.map(function (r) { return { code: r.Code, name: r.Label_AR, note: r.Requires_Note === 'Y' }; });
}

/* ---------------- job change history ---------------- */

var JOB_HIST_FIELDS_ = ['Job_Title_AR', 'Job_Title_EN', 'Job_Family', 'Job_Level', 'Grade_Code', 'Status'];

/** p = { Job_Code } — newest first: when, who, why, and what changed. */
function jobHistory_(ctx, p) {
  var code = str_(p.Job_Code);
  var job = get_('JOBS', code);
  if (!job) throw userError_('الوظيفة غير موجودة.');
  var names = userNames_();
  var vers = find_('JOB_VERSIONS', { Job_Code: code }).sort(function (a, b) { return num_(a.Version, 0) - num_(b.Version, 0); });
  var states = vers.map(function (v) { try { return JSON.parse(v.Snapshot_JSON || '{}'); } catch (e) { return {}; } }).concat([job]);
  return vers.map(function (v, i) {
    var a = states[i], b = states[i + 1];
    return { at: v.Created_At, by: names[v.Created_By] || v.Created_By, reason: v.Change_Reason,
      changes: JOB_HIST_FIELDS_.filter(function (f) { return str_(a[f]) !== str_(b[f]); })
        .map(function (f) { return { field: f, from: str_(a[f]), to: str_(b[f]) }; }) };
  }).reverse();
}
