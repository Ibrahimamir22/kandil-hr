/**
 * Employees.gs — employee master, end of service, transfers, bulk import, and the
 * occupied headcount computed from employees.
 *
 * Occupied HC of a position = active employees on it whose last working day has not passed.
 * Once employees are loaded (CONFIG OCCUPIED_FROM_EMPLOYEES = Y) the column POSITIONS.Occupied_HC is
 * kept as a cache, recounted after every change and once a day (exits whose last day passed).
 * Employee personal data lives in its own spreadsheet (KE-REC-EMPLOYEES), HR only.
 */

function empRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.HR_STAFF]; }
function empAdminRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }

var EMP_KINDS_ = { PERMANENT: 'معيّن', DAILY: 'يومية', CONTRACT: 'عقد محدد المدة', TEMPORARY: 'مؤقت / موسمي' };

function occFromEmployees_() { return !!cfg_('OCCUPIED_FROM_EMPLOYEES', false); }

/** Is the employee still counted on his position today? */
function empCounts_(e, day) {
  day = day || today_();
  return e.Status === 'Active' && (!e.Exit_Date || e.Exit_Date >= day);
}

/** Recount Occupied_HC for the given positions (all when null). Must be safe to call often. */
function recountOccupied_(positionIds, actorId) {
  if (!occFromEmployees_()) return 0;
  var day = today_(), counts = {};
  find_('EMPLOYEES', { Status: 'Active' }).forEach(function (e) {
    if (empCounts_(e, day) && e.Position_ID) counts[e.Position_ID] = (counts[e.Position_ID] || 0) + 1;
  });
  var changed = 0;
  withLock_(function () {
    var list = positionIds ? positionIds.map(function (id) { return get_('POSITIONS', id); }).filter(Boolean) : all_('POSITIONS');
    list.forEach(function (p) {
      var nv = String(counts[p.Position_ID] || 0);
      if (str_(p.Occupied_HC) === nv) return;
      update_('POSITIONS', p.Position_ID, { Occupied_HC: nv, Occupied_Updated_At: nowIso_(), Occupied_Updated_By: actorId || 'SYSTEM' }, actorId || 'SYSTEM');
      insert_('POSITION_HISTORY', { History_ID: nextId_('POSITION_HISTORY'), Position_ID: p.Position_ID, Field: 'Occupied_HC',
        Old_Value: str_(p.Occupied_HC), New_Value: nv, Reason: 'إعادة حساب من سجل الموظفين' }, actorId || 'SYSTEM');
      changed++;
    });
  });
  return changed;
}

/** Once a day (first call of the day): exits whose last working day has passed become Exited. */
function empDailyRefresh_() {
  var day = today_();
  if (sprop_('EMP_DAILY') === day) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('EMP_DAILY') === day || !occFromEmployees_()) return;
  props.setProperty('EMP_DAILY', day);
  var due = find_('EMPLOYEES', { Status: 'Active' }).filter(function (e) { return e.Exit_Date && e.Exit_Date < day; });
  if (!due.length) return;
  var pos = {};
  withLock_(function () {
    due.forEach(function (e) {
      update_('EMPLOYEES', e.Employee_ID, { Status: 'Exited' }, 'SYSTEM');
      if (e.Position_ID) pos[e.Position_ID] = 1;
    });
  });
  recountOccupied_(Object.keys(pos), 'SYSTEM');
  due.forEach(function (e) { empCloseAccounts_('SYSTEM', e.Employee_ID); });
}

/** v0.34.0: the portal accounts of an employee who left are closed (sessions, recruitment work handed back). */
function empCloseAccounts_(actorId, employeeId) {
  find_('USERS', { Employee_ID: employeeId, Status: 'Active' }).forEach(function (u) {
    var res = withLock_(function () { return userOffboard_(actorId, u.User_ID, 'نهاية خدمة'); });
    audit_(null, { userId: actorId, entityType: 'USER', entityId: u.User_ID, action: 'CLOSED_ON_EXIT', newValue: employeeId });
    offboardNotify_(u.User_ID, res);
  });
}

function empHistory_(actorId, e, event, fields) {
  var o = { History_ID: nextId_('EMP_HISTORY'), Employee_ID: e.Employee_ID, Event: event, From_Position_ID: '', To_Position_ID: '',
    From_Location_ID: '', To_Location_ID: '', Event_Date: today_(), Reason_Code: '', Note: '', Ref: '' };
  for (var k in fields) o[k] = str_(fields[k]);
  return insert_('EMPLOYEE_HISTORY', o, actorId);
}

/**
 * Location for an employee on a position. Branch-group positions take the branch he works in;
 * left blank (e.g. the showrooms manager / area staff) he stays on «الفروع» itself.
 */
function empLocation_(pos, locId) {
  var ploc = get_('LOCATIONS', pos.Location_ID) || {};
  if (ploc.Location_Type !== 'BRANCH_GROUP' || !str_(locId) || str_(locId) === pos.Location_ID) return pos.Location_ID;
  var br = get_('LOCATIONS', str_(locId));
  if (!br || br.Location_Type !== 'SHOWROOM') throw userError_('الفرع المختار مش موجود.');
  return br.Location_ID;
}

function empCode_(v) {
  var c = latinDigits_(v).replace(/\s+/g, '').replace(/\.0+$/, '');
  if (!/^[A-Za-z0-9-]{1,20}$/.test(c)) throw userError_('كود الموظف غير صحيح: ' + str_(v));
  return c;
}

/* ---------------- views ---------------- */

function empView_(e, maps) {
  var pos = maps.pos[e.Position_ID] || {};
  return { Employee_ID: e.Employee_ID, Full_Name: e.Full_Name, Position_ID: e.Position_ID, Location_ID: e.Location_ID,
    Hire_Date: e.Hire_Date, Employment_Kind: e.Employment_Kind, kindName: EMP_KINDS_[e.Employment_Kind] || e.Employment_Kind,
    Job_Type: e.Job_Type, Status: e.Status, Exit_Date: e.Exit_Date, Exit_Reason: e.Exit_Reason, Exit_Note: e.Exit_Note,
    title: pos.title || '', unitName: pos.unitName || '', locationName: maps.loc[e.Location_ID] || '', Notes: e.Notes,
    leaving: e.Status === 'Active' && !!e.Exit_Date, User_ID: maps.userByEmp[e.Employee_ID] || '',
    Temp_Transfer_ID: e.Temp_Transfer_ID || '', Temp_Until: e.Temp_Until || '', Temp_Position_ID: e.Temp_Position_ID || '' };
}

function empMaps_() {
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
  var pos = {}; all_('POSITIONS').forEach(function (p) { pos[p.Position_ID] = { title: p.Position_Title || jobs[p.Job_Code] || p.Job_Code, unitName: units[p.Org_Unit_ID] || '', unitId: p.Org_Unit_ID }; });
  var loc = {}; all_('LOCATIONS').forEach(function (l) { loc[l.Location_ID] = l.Name_AR; });
  var userByEmp = {}; all_('USERS').forEach(function (u) { if (u.Employee_ID) userByEmp[u.Employee_ID] = u.User_ID; });
  return { pos: pos, loc: loc, userByEmp: userByEmp };
}

/** p = { q, status: active|leaving|exited|all, unitId, locationId, positionId } */
function empList_(ctx, p) {
  p = p || {};
  empDailyRefresh_();
  var maps = empMaps_(), q = norm_(latinDigits_(p.q)), st = str_(p.status) || 'active';
  var units = str_(p.unitId) ? descendants_(p.unitId) : null;
  var all = find_('EMPLOYEES', {});
  var counts = { active: 0, leaving: 0, exited: 0, all: all.length };
  all.forEach(function (e) { if (e.Status === 'Active') { counts.active++; if (e.Exit_Date) counts.leaving++; } else if (e.Status === 'Exited') counts.exited++; });
  var rows = all.filter(function (e) {
    if (st === 'active' && e.Status !== 'Active') return false;
    if (st === 'leaving' && !(e.Status === 'Active' && e.Exit_Date)) return false;
    if (st === 'exited' && e.Status !== 'Exited') return false;
    if (str_(p.positionId) && e.Position_ID !== p.positionId) return false;
    if (str_(p.locationId) && e.Location_ID !== p.locationId) return false;
    if (units && units.indexOf((maps.pos[e.Position_ID] || {}).unitId) < 0) return false;
    if (q) {
      var hay = norm_([e.Employee_ID, e.Full_Name, (maps.pos[e.Position_ID] || {}).title, (maps.pos[e.Position_ID] || {}).unitName, maps.loc[e.Location_ID]].join(' '));
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) { return a.Full_Name < b.Full_Name ? -1 : 1; });
  var total = rows.length;
  return { total: total, counts: counts, rows: rows.slice(0, Math.min(num_(p.limit, 300), 1000)).map(function (e) { return empView_(e, maps); }),
    fromEmployees: occFromEmployees_(), canAdmin: hasAnyRole_(ctx, empAdminRoles_()),
    disability: hasAnyRole_(ctx, HR_ALL_ROLES) ? disabilityShare_() : null };     // v0.38.0 (CHG-81): the legal 5 %, HR only
}

function empGet_(ctx, p) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e) throw userError_('الموظف غير موجود.');
  var maps = empMaps_(), names = userNames_();
  var out = empView_(e, maps);
  out.history = find_('EMPLOYEE_HISTORY', { Employee_ID: e.Employee_ID }, { sort: '-History_ID' }).map(function (h) {
    h.fromTitle = (maps.pos[h.From_Position_ID] || {}).title || ''; h.toTitle = (maps.pos[h.To_Position_ID] || {}).title || '';
    h.fromLoc = maps.loc[h.From_Location_ID] || ''; h.toLoc = maps.loc[h.To_Location_ID] || '';
    h.byName = names[h.Created_By] || (h.Created_By === 'SYSTEM' ? 'النظام' : h.Created_By);
    h.reasonName = reasonLabelAny_('EMPLOYEE_EXIT', h.Reason_Code);
    return h;
  });
  out.exitReasonName = reasonLabelAny_('EMPLOYEE_EXIT', e.Exit_Reason);
  out.canAdmin = hasAnyRole_(ctx, empAdminRoles_());
  out.file = empFile_(ctx, e);
  out.att = attView_(attFor_(e.Employee_ID, ''), names);     // v0.44.0 (CHG-91)
  out.attLic = attLicenses_();
  out.canAtt = attIsHr_(ctx);
  return out;
}

function reasonLabelAny_(process, code) {
  if (!code) return '';
  var r = findOne_('REASON_MASTER', { Process: process, Code: code });
  return r ? r.Label_AR : code;
}

/* ---------------- single-employee actions ---------------- */

/** Add or edit one employee. p = { Employee_ID, Full_Name, Position_ID, Location_ID, Hire_Date, Employment_Kind, Job_Type, Notes, isNew, reason } */
function empSave_(ctx, p) {
  var code = empCode_(p.Employee_ID);
  var name = str_(p.Full_Name).replace(/\s+/g, ' ');
  if (name.length < 5) throw userError_('اكتب اسم الموظف بالكامل.');
  var pos = get_('POSITIONS', str_(p.Position_ID));
  if (!pos || pos.Status === 'Closed') throw userError_('اختار المكان الوظيفي.');
  var loc = empLocation_(pos, p.Location_ID);
  var hire = str_(p.Hire_Date);
  if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) throw userError_('تاريخ التعيين غير صحيح.');
  var kind = EMP_KINDS_[str_(p.Employment_Kind)] ? str_(p.Employment_Kind) : 'PERMANENT';
  var cur = findOne_('EMPLOYEES', { Employee_ID: code });
  var fields = { Full_Name: name, Hire_Date: hire, Employment_Kind: kind, Job_Type: str_(p.Job_Type).slice(0, 40), Notes: str_(p.Notes).slice(0, 500) };
  var res, posIds = [pos.Position_ID];
  withLock_(function () {
    if (str_(p.isNew) === 'Y') {
      if (cur) throw userError_('الكود ده متسجل لموظف تاني: ' + cur.Full_Name);
      fields.Employee_ID = code; fields.Position_ID = pos.Position_ID; fields.Location_ID = loc; fields.Status = 'Active';
      fields.Exit_Date = ''; fields.Exit_Reason = ''; fields.Exit_Note = ''; fields.Source = 'MANUAL';
      res = { after: insert_('EMPLOYEES', fields, ctx.user.User_ID) };
      empHistory_(ctx.user.User_ID, res.after, 'HIRE', { To_Position_ID: pos.Position_ID, To_Location_ID: loc, Event_Date: hire || today_(), Note: 'إضافة يدوية' });
    } else {
      if (!cur) throw userError_('الموظف غير موجود.');
      if (cur.Position_ID !== pos.Position_ID || cur.Location_ID !== loc) throw userError_('تغيير المكان الوظيفي أو الفرع بيتعمل من «نقل».');
      res = update_('EMPLOYEES', code, fields, ctx.user.User_ID);
    }
  });
  if (res.before) auditDiff_(ctx, 'EMPLOYEE', code, res.before, res.after, str_(p.reason));
  else audit_(ctx, { entityType: 'EMPLOYEE', entityId: code, action: 'CREATE', newValue: name });
  recountOccupied_(posIds, ctx.user.User_ID);
  return res.after;
}

/** Move an employee to another position / branch. p = { Employee_ID, Position_ID, Location_ID, Event_Date, reason, Ref } */
function empTransfer_(ctx, p) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e || e.Status !== 'Active') throw userError_('الموظف مش موجود أو مش شغال.');
  var pos = get_('POSITIONS', str_(p.Position_ID));
  if (!pos || pos.Status === 'Closed') throw userError_('اختار المكان الوظيفي الجديد.');
  var loc = empLocation_(pos, p.Location_ID);
  if (pos.Position_ID === e.Position_ID && loc === e.Location_ID) throw userError_('الموظف على نفس المكان بالفعل.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب النقل.');
  var date = str_(p.Event_Date) || today_();
  withLock_(function () {
    update_('EMPLOYEES', e.Employee_ID, { Position_ID: pos.Position_ID, Location_ID: loc }, ctx.user.User_ID);
    empHistory_(ctx.user.User_ID, e, 'TRANSFER', { From_Position_ID: e.Position_ID, To_Position_ID: pos.Position_ID, From_Location_ID: e.Location_ID,
      To_Location_ID: loc, Event_Date: date, Note: reason, Ref: str_(p.Ref) });
    // keep the user account's position in step (approvals follow the position)
    find_('USERS', { Employee_ID: e.Employee_ID, Status: 'Active' }).forEach(function (u) {
      if (u.Position_ID === e.Position_ID) update_('USERS', u.User_ID, { Position_ID: pos.Position_ID }, ctx.user.User_ID);
    });
  });
  audit_(ctx, { entityType: 'EMPLOYEE', entityId: e.Employee_ID, action: 'TRANSFER', oldValue: e.Position_ID, newValue: pos.Position_ID, reason: reason });
  recountOccupied_([e.Position_ID, pos.Position_ID], ctx.user.User_ID);
  return findOne_('EMPLOYEES', { Employee_ID: e.Employee_ID });
}

/**
 * End of service. p = { Employee_ID, Last_Working_Date, reasonCode, note }
 * A future last day keeps him counted until then and tells his manager — with a ready replacement request.
 */
function empExit_(ctx, p) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e || e.Status !== 'Active') throw userError_('الموظف مش موجود أو خرج بالفعل.');
  var last = str_(p.Last_Working_Date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) throw userError_('حدد آخر يوم عمل.');
  var r = findOne_('REASON_MASTER', { Process: 'EMPLOYEE_EXIT', Code: str_(p.reasonCode), Status: 'Active' });
  if (!r) throw userError_('اختار سبب نهاية الخدمة.');
  var note = str_(p.note);
  if (r.Requires_Note === 'Y' && note.length < 3) throw userError_('اكتب توضيح للسبب.');
  // v0.36.0 (CHG-77): ending service by the company — the manager or HR asks, the HR Sector Manager approves
  if (DUAL_TERMINATION_REASONS_.indexOf(r.Code) >= 0 && !ctx.dualApproved)
    throw userError_('إنهاء الخدمة بقرار الشركة محتاج شخصين: اطلبه من «اطلب إنهاء الخدمة»، ومدير قطاع الموارد البشرية يوافق.');
  var done = last < today_();
  withLock_(function () {
    update_('EMPLOYEES', e.Employee_ID, { Exit_Date: last, Exit_Reason: r.Code, Exit_Note: note, Status: done ? 'Exited' : 'Active' }, ctx.user.User_ID);
    empHistory_(ctx.user.User_ID, e, done ? 'EXIT' : 'EXIT_NOTICE', { From_Position_ID: e.Position_ID, From_Location_ID: e.Location_ID, Event_Date: last,
      Reason_Code: r.Code, Note: note });
  });
  audit_(ctx, { entityType: 'EMPLOYEE', entityId: e.Employee_ID, action: done ? 'EXIT' : 'EXIT_NOTICE', newValue: last, reason: r.Label_AR });
  if (done) empCloseAccounts_(ctx.user.User_ID, e.Employee_ID);     // v0.34.0: a person who left has no way back into the portal
  recountOccupied_([e.Position_ID], ctx.user.User_ID);
  var mgr = empManagersOf_(e.Position_ID);
  var title = (empMaps_().pos[e.Position_ID] || {}).title || '';
  if (mgr.length) notify_(mgr, done ? 'نهاية خدمة موظف في فريقك' : 'موظف في فريقك آخر يوم له ' + last,
    e.Full_Name + ' (' + e.Employee_ID + ') — ' + title + ' — ' + r.Label_AR + '. لو محتاج بديل، افتح الإشعار وابدأ طلب بديل جاهز.', 'EMP_EXIT', e.Employee_ID, true);
  // v0.41.0 (CHG-85): custody and protective equipment still with him — HR, administration, IT and safety are told
  var cust = custodyOpen_(e.Employee_ID);
  if (cust.length) notify_(roleHolders_(ROLE.HR_MANAGER).concat(onbDeptUsers_(), [onbLocHr_(e.Location_ID)]),
    'عهدة لسه مع ' + e.Full_Name + ' — آخر يوم ' + last, cust.map(function (c) { return c.Item + (c.Qty !== '1' ? ' × ' + c.Qty : ''); }).join('، ') + ' — استلمها قبل إخلاء الطرف.', 'EMP_FILE', e.Employee_ID, true);
  var attDue = attExitDue_(ctx.user.User_ID, e, last);     // v0.44.0 (CHG-91): stop the fingerprint on ZKBioTime
  return { employee: findOne_('EMPLOYEES', { Employee_ID: e.Employee_ID }), notified: mgr.length, custodyOpen: cust.length, attStopDue: attDue };
}

/** Nearest manager with a portal account: direct manager, unit head, then up the units. */
function empManagersOf_(positionId) {
  var pos = get_('POSITIONS', positionId);
  if (!pos) return [];
  var tried = {}, unit = get_('ORG_UNITS', pos.Org_Unit_ID), cands = [];
  if (pos.Reports_To_Position_ID) cands.push(pos.Reports_To_Position_ID);
  for (var guard = 0; unit && guard < 8; guard++) {
    if (unit.Head_Position_ID && unit.Head_Position_ID !== positionId) cands.push(unit.Head_Position_ID);
    unit = unit.Parent_Org_Unit_ID ? get_('ORG_UNITS', unit.Parent_Org_Unit_ID) : null;
  }
  for (var i = 0; i < cands.length; i++) {
    if (tried[cands[i]]) continue;
    tried[cands[i]] = 1;
    var us = find_('USERS', { Position_ID: cands[i], Status: 'Active' }).map(function (u) { return u.User_ID; });
    if (us.length) return us;
  }
  return [];
}

/** Undo a recorded exit (wrong entry or the employee stayed). p = { Employee_ID, reason } */
function empExitCancel_(ctx, p) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e || !e.Exit_Date) throw userError_('مفيش نهاية خدمة مسجلة للموظف ده.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب الإلغاء.');
  withLock_(function () {
    update_('EMPLOYEES', e.Employee_ID, { Exit_Date: '', Exit_Reason: '', Exit_Note: '', Status: 'Active' }, ctx.user.User_ID);
    empHistory_(ctx.user.User_ID, e, 'EXIT_CANCELLED', { To_Position_ID: e.Position_ID, To_Location_ID: e.Location_ID, Note: reason });
  });
  audit_(ctx, { entityType: 'EMPLOYEE', entityId: e.Employee_ID, action: 'EXIT_CANCEL', reason: reason });
  recountOccupied_([e.Position_ID], ctx.user.User_ID);
  return findOne_('EMPLOYEES', { Employee_ID: e.Employee_ID });
}

/** Data a manager needs to raise a replacement request for a leaving / exited employee. */
function empReplacement_(ctx, p) {
  if (str_(p.Transfer_ID)) {                       // v0.41 (CHG-85): the place a permanent transfer left empty
    var t = get_('TRANSFER_REQUESTS', str_(p.Transfer_ID));
    if (!t || t.Status !== 'DONE' || t.Transfer_Type === 'TEMPORARY') throw userError_('طلب النقل غير موجود أو لسه ماتنفذش.');
    var sc = requestScopeUnits_(ctx), fp = get_('POSITIONS', t.From_Position_ID) || {};
    if (sc && sc.indexOf(fp.Org_Unit_ID) < 0) throw userError_('الوظيفة دي مش في نطاق إدارتك.');
    var mp = empMaps_();
    return { Employee_ID: t.Employee_ID, Employee_Name: t.Full_Name, Position_ID: t.From_Position_ID, Location_ID: t.From_Location_ID,
      Position_Title: (mp.pos[t.From_Position_ID] || {}).title || '', Last_Working_Date: t.Effective_Date,
      Reason: 'نقل داخلي ' + t.Transfer_ID, Reason_Category: 'TRANSFER' };
  }
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e) throw userError_('الموظف غير موجود.');
  var scope = requestScopeUnits_(ctx);
  var pos = get_('POSITIONS', e.Position_ID) || {};
  if (scope && scope.indexOf(pos.Org_Unit_ID) < 0) throw userError_('الموظف ده مش في نطاق إدارتك.');
  var maps = empMaps_();
  return { Employee_ID: e.Employee_ID, Employee_Name: e.Full_Name, Position_ID: e.Position_ID, Location_ID: e.Location_ID,
    Position_Title: (maps.pos[e.Position_ID] || {}).title || '', Last_Working_Date: e.Exit_Date,
    Reason: reasonLabelAny_('EMPLOYEE_EXIT', e.Exit_Reason), Reason_Category: exitToReqReason_(e.Exit_Reason) };
}
function exitToReqReason_(code) {
  return { RESIGNATION: 'RESIGNATION', TERMINATION: 'TERMINATION', CONTRACT_END: 'TERMINATION', RETIREMENT: 'RETIREMENT', DEATH: 'RETIREMENT',
    ABSENCE: 'TERMINATION', TRANSFER_GROUP: 'TRANSFER' }[code] || 'OTHER';
}

/** Create a portal user for an employee (link to his position). p = { Employee_ID, Email } */
function empMakeUser_(ctx, p) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e || e.Status !== 'Active') throw userError_('الموظف مش موجود أو مش شغال.');
  var exists = find_('USERS', { Employee_ID: e.Employee_ID });
  if (exists.length) throw userError_('الموظف ليه مستخدم بالفعل.');
  return usersSave_(ctx, { Email: p.Email, Full_Name_AR: e.Full_Name, Employee_ID: e.Employee_ID, Position_ID: e.Position_ID, Status: 'Active' });
}

/* ---------------- vacancy fills (when occupied HC comes from employees) ---------------- */

/** Validate a fill before anything is written. Returns the plan used by empFillApply_. */
function empFillCheck_(v, method, p) {
  var pos = get_('POSITIONS', v.Position_ID);
  if (!pos) throw userError_('وظيفة الشاغر مش موجودة في الهيكل.');
  var loc = empLocation_(pos, v.Location_ID);
  var raw = str_(p.Employee_ID);
  if (!raw) throw userError_(method === 'INTERNAL_TRANSFER' ? 'اكتب كود الموظف المنقول.' : 'اكتب كود الموظف الجديد (من شؤون العاملين) — العدد الفعلي بيتحسب من سجل الموظفين.');
  var code = empCode_(raw);
  var cur = findOne_('EMPLOYEES', { Employee_ID: code });
  if (method === 'INTERNAL_TRANSFER') {
    if (!cur || cur.Status !== 'Active') throw userError_('الكود ' + code + ' مش لموظف شغال حالياً.');
    return { code: code, emp: cur, loc: loc, pos: pos };
  }
  if (cur && cur.Status === 'Active') throw userError_('الكود ' + code + ' لموظف شغال بالفعل (' + cur.Full_Name + '). لو اتنقل استخدم «نقل داخلي».');
  return { code: code, emp: cur, loc: loc, pos: pos, rehire: !!cur };
}

function empKindFromRequest_(v) {
  var req = get_('RECRUITMENT_REQUESTS', v.Request_ID) || {};
  return { DAILY: 'DAILY', CONTRACT: 'CONTRACT', TEMPORARY: 'TEMPORARY' }[req.Employment_Type] || 'PERMANENT';
}

/** Runs inside the fill lock. */
function empFillApply_(ctx, v, fill, plan, date) {
  var actor = ctx.user.User_ID, ref = fill.Fill_ID + ' / ' + v.Vacancy_ID;
  if (fill.Method === 'INTERNAL_TRANSFER') {
    var e = plan.emp;
    update_('EMPLOYEES', e.Employee_ID, { Position_ID: plan.pos.Position_ID, Location_ID: plan.loc }, actor);
    empHistory_(actor, e, 'TRANSFER', { From_Position_ID: e.Position_ID, To_Position_ID: plan.pos.Position_ID, From_Location_ID: e.Location_ID,
      To_Location_ID: plan.loc, Event_Date: date, Note: 'نقل على شاغر', Ref: ref });
    find_('USERS', { Employee_ID: e.Employee_ID, Status: 'Active' }).forEach(function (u) {
      if (u.Position_ID === e.Position_ID) update_('USERS', u.User_ID, { Position_ID: plan.pos.Position_ID }, actor);
    });
    return;
  }
  var fields = { Full_Name: fill.Employee_Name, Position_ID: plan.pos.Position_ID, Location_ID: plan.loc, Hire_Date: date,
    Employment_Kind: empKindFromRequest_(v), Status: 'Active', Exit_Date: '', Exit_Reason: '', Exit_Note: '', Source: 'FILL:' + fill.Fill_ID };
  var e2;
  if (plan.rehire) e2 = update_('EMPLOYEES', plan.code, fields, actor).after;
  else { fields.Employee_ID = plan.code; fields.Job_Type = ''; fields.Notes = ''; e2 = insert_('EMPLOYEES', fields, actor); }
  empHistory_(actor, e2, plan.rehire ? 'REHIRE' : 'HIRE', { To_Position_ID: plan.pos.Position_ID, To_Location_ID: plan.loc, Event_Date: date,
    Note: 'تعيين على شاغر', Ref: ref });
}

/** Undo the employee side of a voided fill. Runs inside the void lock. */
function empFillVoid_(ctx, f, v, reason) {
  var actor = ctx.user.User_ID, e = findOne_('EMPLOYEES', { Employee_ID: f.Employee_ID });
  if (!e) return;
  if (f.Method === 'INTERNAL_TRANSFER') {
    if (e.Position_ID !== v.Position_ID || !f.Source_Position_ID) return;      // moved again since — leave as is
    var back = get_('POSITIONS', f.Source_Position_ID) || {};
    var hist = find_('EMPLOYEE_HISTORY', { Employee_ID: e.Employee_ID, Event: 'TRANSFER' }, { sort: '-History_ID' })
      .filter(function (h) { return h.Ref.indexOf(f.Fill_ID) === 0; })[0];
    var backLoc = hist ? hist.From_Location_ID : back.Location_ID;
    update_('EMPLOYEES', e.Employee_ID, { Position_ID: f.Source_Position_ID, Location_ID: backLoc }, actor);
    empHistory_(actor, e, 'TRANSFER_VOIDED', { From_Position_ID: v.Position_ID, To_Position_ID: f.Source_Position_ID, From_Location_ID: e.Location_ID,
      To_Location_ID: backLoc, Note: reason, Ref: f.Fill_ID });
    find_('USERS', { Employee_ID: e.Employee_ID, Status: 'Active' }).forEach(function (u) {
      if (u.Position_ID === v.Position_ID) update_('USERS', u.User_ID, { Position_ID: f.Source_Position_ID }, actor);
    });
    return;
  }
  if (e.Source !== 'FILL:' + f.Fill_ID || e.Status !== 'Active') return;
  update_('EMPLOYEES', e.Employee_ID, { Status: 'Cancelled' }, actor);
  empHistory_(actor, e, 'HIRE_VOIDED', { From_Position_ID: e.Position_ID, From_Location_ID: e.Location_ID, Note: reason, Ref: f.Fill_ID });
}

/** Lists the employee screens need. */
function empOptions_(ctx) {
  var maps = empMaps_();
  var locs = all_('LOCATIONS').filter(function (l) { return l.Status !== 'Inactive'; });
  var locType = {}; locs.forEach(function (l) { locType[l.Location_ID] = l.Location_Type; });
  var positions = find_('POSITIONS', { Status: ['Active', 'Frozen'] }).map(function (p) {
    var m = maps.pos[p.Position_ID] || {};
    return { id: p.Position_ID, title: m.title, unitName: m.unitName, locationId: p.Location_ID, locationName: maps.loc[p.Location_ID] || '',
      branchGroup: locType[p.Location_ID] === 'BRANCH_GROUP', structural: num_(p.Structural_HC, 0), occupied: num_(p.Occupied_HC, 0) };
  }).sort(function (a, b) { return (a.unitName + a.title) < (b.unitName + b.title) ? -1 : 1; });
  return {
    kinds: Object.keys(EMP_KINDS_).map(function (k) { return { code: k, name: EMP_KINDS_[k] }; }),
    exitReasons: find_('REASON_MASTER', { Process: 'EMPLOYEE_EXIT', Status: 'Active' }, { sort: 'Sort_Order' })
      .map(function (r) { return { code: r.Code, name: r.Label_AR, note: r.Requires_Note === 'Y' }; }),
    branches: locs.filter(function (l) { return l.Location_Type === 'SHOWROOM'; }).map(function (l) { return { id: l.Location_ID, name: l.Name_AR }; }),
    positions: positions, fromEmployees: occFromEmployees_(), canAdmin: hasAnyRole_(ctx, empAdminRoles_())
  };
}

/* ---------------- bulk import (review workbook) ---------------- */

/**
 * p = { rows: [{ code, name, hire, jobType, status, position (label or POS id), branch (name), email }], commit, skipErrors, createUsers, reason }
 * Upserts employees; never exits anyone missing from the file (the file may be partial).
 */
function empImport_(ctx, p) {
  var rows = p.rows || [];
  if (!rows.length) throw userError_('الملف فاضي.');
  var locByName = {}; all_('LOCATIONS').forEach(function (l) { locByName[norm_(l.Name_AR)] = l; });
  var errors = [], ok = [], seen = {}, users = [], noBranch = [];
  rows.forEach(function (r, i) {
    var line = i + 2, code;
    try { code = empCode_(r.code); } catch (e) { errors.push({ line: line, msg: 'كود غير صحيح' }); return; }
    if (seen[code]) { errors.push({ line: line, code: code, msg: 'الكود مكرر في الملف' }); return; }
    seen[code] = 1;
    var name = str_(r.name).replace(/\s+/g, ' ');
    if (name.length < 3) { errors.push({ line: line, code: code, msg: 'الاسم ناقص' }); return; }
    var m = /POS-\d+/.exec(str_(r.position));
    if (!m) { errors.push({ line: line, code: code, name: name, msg: 'مفيش مكان وظيفي معتمد' }); return; }
    var pos = get_('POSITIONS', m[0]);
    if (!pos || pos.Status === 'Closed') { errors.push({ line: line, code: code, name: name, msg: 'المكان ' + m[0] + ' مش موجود في الهيكل' }); return; }
    var ploc = get_('LOCATIONS', pos.Location_ID) || {}, loc = pos.Location_ID;
    if (ploc.Location_Type === 'BRANCH_GROUP') {
      if (!str_(r.branch)) noBranch.push({ line: line, code: code, name: name });
      else {
        var br = locByName[norm_(r.branch)];
        if (!br || br.Location_Type !== 'SHOWROOM') { errors.push({ line: line, code: code, name: name, msg: 'الفرع «' + str_(r.branch) + '» مش موجود في المواقع' }); return; }
        loc = br.Location_ID;
      }
    }
    var hire = str_(r.hire).slice(0, 10);
    if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = '';
    var kind = /يومي/.test(str_(r.status)) ? 'DAILY' : 'PERMANENT';
    ok.push({ Employee_ID: code, Full_Name: name, Position_ID: pos.Position_ID, Location_ID: loc, Hire_Date: hire, Employment_Kind: kind,
      Job_Type: str_(r.jobType).slice(0, 40) });
    if (str_(r.email)) users.push({ code: code, email: str_(r.email).toLowerCase(), name: name, pos: pos.Position_ID });
  });
  // summary
  var existing = {}; find_('EMPLOYEES', {}).forEach(function (e) { existing[e.Employee_ID] = e; });
  var newCount = 0, moved = 0, same = 0, perPos = {};
  ok.forEach(function (o) {
    var ex = existing[o.Employee_ID];
    if (!ex) newCount++; else if (ex.Position_ID !== o.Position_ID || ex.Location_ID !== o.Location_ID) moved++; else same++;
    perPos[o.Position_ID] = (perPos[o.Position_ID] || 0) + 1;
  });
  var maps = empMaps_();
  var over = Object.keys(perPos).map(function (id) {
    var pos = get_('POSITIONS', id);
    return { Position_ID: id, title: (maps.pos[id] || {}).title, unitName: (maps.pos[id] || {}).unitName, employees: perPos[id], structural: num_(pos.Structural_HC, 0) };
  }).filter(function (x) { return x.employees > x.structural; }).sort(function (a, b) { return (b.employees - b.structural) - (a.employees - a.structural); });
  var summary = { total: rows.length, valid: ok.length, errors: errors, newCount: newCount, moved: moved, same: same, over: over,
    users: users.length, positionsUsed: Object.keys(perPos).length, noBranch: noBranch };
  if (!p.commit) return summary;
  if (errors.length && str_(p.skipErrors) !== 'Y') throw userError_('في ' + errors.length + ' سطر فيهم أخطاء — صلحهم أو اختار «تجاهل السطور اللي فيها أخطاء».');
  var reason = str_(p.reason) || 'تحميل الموظفين';
  var touched = {};
  withLock_(function () {
    var add = [];
    ok.forEach(function (o) {
      var ex = existing[o.Employee_ID];
      touched[o.Position_ID] = 1;
      if (!ex) {
        add.push(Object.assign({ Status: 'Active', Exit_Date: '', Exit_Reason: '', Exit_Note: '', Source: 'IMPORT', Notes: '' }, o));
      } else {
        if (ex.Position_ID !== o.Position_ID || ex.Location_ID !== o.Location_ID) {
          touched[ex.Position_ID] = 1;
          empHistory_(ctx.user.User_ID, ex, 'TRANSFER', { From_Position_ID: ex.Position_ID, To_Position_ID: o.Position_ID, From_Location_ID: ex.Location_ID,
            To_Location_ID: o.Location_ID, Note: 'تصحيح من ملف التحميل: ' + reason });
        }
        update_('EMPLOYEES', o.Employee_ID, { Full_Name: o.Full_Name, Position_ID: o.Position_ID, Location_ID: o.Location_ID,
          Hire_Date: o.Hire_Date || ex.Hire_Date, Employment_Kind: o.Employment_Kind, Job_Type: o.Job_Type || ex.Job_Type }, ctx.user.User_ID);
      }
    });
    if (add.length) {
      insertMany_('EMPLOYEES', add, ctx.user.User_ID);
      var hIds = nextIds_('EMP_HISTORY', add.length);
      insertMany_('EMPLOYEE_HISTORY', add.map(function (o, i) {
        return { History_ID: hIds[i], Employee_ID: o.Employee_ID, Event: 'IMPORT', From_Position_ID: '', To_Position_ID: o.Position_ID, From_Location_ID: '',
          To_Location_ID: o.Location_ID, Event_Date: o.Hire_Date || today_(), Reason_Code: '', Note: reason, Ref: '' };
      }), ctx.user.User_ID);
    }
    if (!occFromEmployees_()) update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, ctx.user.User_ID);
  });
  invalidate_('CONFIG');
  audit_(ctx, { entityType: 'EMPLOYEE', entityId: 'IMPORT', action: 'IMPORT', newValue: ok.length + ' employees', reason: reason });
  var recounted = recountOccupied_(null, ctx.user.User_ID);
  // portal users for managers with an email (skips existing emails)
  var created = 0, linked = 0, skipped = [];
  if (str_(p.createUsers) === 'Y') users.forEach(function (u) {
    try {
      var ex = findUserByEmail_(u.email);
      if (ex) {
        if (ex.Employee_ID && ex.Employee_ID !== u.code) { skipped.push(u.email + ' (مربوط بموظف تاني)'); return; }
        if (ex.Employee_ID === u.code && (ex.Position_ID || '') === u.pos) { skipped.push(u.email + ' (موجود)'); return; }
        var newPos = ex.Position_ID || u.pos;
        // v0.34.0 (CHG-74): the import never moves the importer himself, nor puts anyone on a unit head position unless a boss imports
        if (newPos !== str_(ex.Position_ID) && (ex.User_ID === ctx.user.User_ID || (isHeadPosition_(newPos) && !hasAnyRole_(ctx, protectedRoles_()))))
          newPos = str_(ex.Position_ID);
        update_('USERS', ex.User_ID, { Employee_ID: u.code, Position_ID: newPos }, ctx.user.User_ID);
        linked++; return;
      }
      usersSave_(ctx, { Email: u.email, Full_Name_AR: u.name, Employee_ID: u.code, Position_ID: u.pos, Status: 'Active' });
      created++;
    } catch (e) { skipped.push(u.email + ' — ' + (e.message || e)); }
  });
  summary.committed = true; summary.recounted = recounted; summary.usersCreated = created; summary.usersLinked = linked; summary.usersSkipped = skipped;
  return summary;
}
