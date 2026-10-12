/**
 * OrgAdmin.gs — day-to-day structure maintenance from the portal (no files):
 * add / rename / move / close a unit, set or change its head, add a position, move or close a position.
 * Every change needs a reason and is written to ORG_UNIT_HISTORY / POSITION_HISTORY and the audit log.
 * Rules that protect the rest of the system: no cycles, a child is always below its parent's type,
 * nothing is closed while it still has active units, positions, open vacancies or open requests.
 */

function orgEditRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }

function unitHistory_(ctx, unitId, changes, reason) {
  if (!changes.length) return;
  var ids = nextIds_('ORG_UNIT_HISTORY', changes.length);
  insertMany_('ORG_UNIT_HISTORY', changes.map(function (c, i) {
    return { History_ID: ids[i], Org_Unit_ID: unitId, Field: c.f, Old_Value: str_(c.o), New_Value: str_(c.n), Reason: reason };
  }), ctx.user.User_ID);
  changes.forEach(function (c) {
    audit_(ctx, { entityType: 'ORG_UNIT', entityId: unitId, action: c.a || 'UPDATE', field: c.f, oldValue: c.o, newValue: c.n, reason: reason });
  });
}

function posHistory_(ctx, posId, field, oldV, newV, reason) {
  insert_('POSITION_HISTORY', { History_ID: nextId_('POSITION_HISTORY'), Position_ID: posId, Field: field,
    Old_Value: str_(oldV), New_Value: str_(newV), Reason: reason }, ctx.user.User_ID);
  audit_(ctx, { entityType: 'POSITION', entityId: posId, action: 'UPDATE', field: field, oldValue: oldV, newValue: newV, reason: reason });
}

function activeUnit_(id) {
  var u = get_('ORG_UNITS', id);
  if (!u || u.Status !== 'Active') throw userError_('الوحدة غير موجودة أو مقفولة.');
  return u;
}

/** Open work that blocks closing/moving: vacancies still being worked and requests still in approval. */
function openWorkOnPositions_(posIds) {
  var vac = where_('VACANCIES', function (v) { return posIds.indexOf(v.Position_ID) >= 0 && VAC_OPEN_.indexOf(v.Status) >= 0; });
  var reqIds = {};
  where_('REQUEST_LINES', function (l) { return posIds.indexOf(l.Position_ID) >= 0 && l.Status !== 'Deleted'; })
    .forEach(function (l) { reqIds[l.Request_ID] = 1; });
  var reqs = Object.keys(reqIds).map(function (id) { return get_('RECRUITMENT_REQUESTS', id); })
    .filter(function (r) { return r && ['DRAFT', 'RETURNED'].concat(REQ_OPEN_).indexOf(r.Status) >= 0; });
  return { vacancies: vac.map(function (v) { return v.Vacancy_ID; }), requests: reqs.map(function (r) { return r.Request_ID; }) };
}
function blockIfOpenWork_(posIds, what) {
  var w = openWorkOnPositions_(posIds);
  if (w.vacancies.length || w.requests.length) {
    throw userError_(what + ' عليها شغل مفتوح: ' + (w.vacancies.length ? 'شواغر ' + w.vacancies.join('، ') : '') +
      (w.vacancies.length && w.requests.length ? ' و' : '') + (w.requests.length ? 'طلبات ' + w.requests.join('، ') : '') +
      '. اقفلها أو استنى لما تخلص الأول.');
  }
}

/* ---------------- units ---------------- */

/** Create (no Org_Unit_ID) or rename / recode (with Org_Unit_ID). p = { Org_Unit_ID?, Parent_Org_Unit_ID, Unit_Type, Name_AR, Name_EN, Unit_Code, reason } */
function orgUnitSave_(ctx, p) {
  var name = str_(p.Name_AR);
  if (name.length < 2) throw userError_('اكتب اسم الوحدة.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب التعديل.');
  var id = str_(p.Org_Unit_ID);
  return withLock_(function () {
    if (!id) {
      var type = str_(p.Unit_Type);
      if (UNIT_TYPES.indexOf(type) < 1) throw userError_('اختار نوع الوحدة.');
      var parent = activeUnit_(p.Parent_Org_Unit_ID);
      if (UNIT_TYPES.indexOf(parent.Unit_Type) >= UNIT_TYPES.indexOf(type))
        throw userError_('نوع الوحدة لازم يكون أقل من الوحدة الأم (' + parent.Name_AR + ').');
      dupNameCheck_(parent.Org_Unit_ID, name, '');
      var code = str_(p.Unit_Code).toUpperCase();
      if (!code) code = nextUnitCode_(parent);
      if (!code && type === 'SECTOR') throw userError_('اكتب كود القطاع (2–4 حروف إنجليزي، زي OPS).');
      if (code && !/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(code)) throw userError_('كود الوحدة: حروف إنجليزي كابيتال وأرقام وشَرطة بس.');
      if (code && where_('ORG_UNITS', function (x) { return x.Status === 'Active' && x.Unit_Code === code; }).length)
        throw userError_('الكود ' + code + ' مستخدم لوحدة تانية.');
      var u = insert_('ORG_UNITS', { Org_Unit_ID: nextId_('ORG_UNIT'), Org_Version_ID: activeVersion_(), Unit_Type: type,
        Unit_Code: code, Name_AR: name, Name_EN: str_(p.Name_EN), Parent_Org_Unit_ID: parent.Org_Unit_ID,
        Head_Position_ID: '', Status: 'Active', Effective_From: today_(), Effective_To: '' }, ctx.user.User_ID);
      unitHistory_(ctx, u.Org_Unit_ID, [{ f: 'CREATED', o: '', n: name + ' تحت ' + parent.Name_AR, a: 'CREATE' }], reason);
      return u;
    }
    var cur = activeUnit_(id);
    dupNameCheck_(cur.Parent_Org_Unit_ID, name, id);
    var res = update_('ORG_UNITS', id, { Name_AR: name, Name_EN: str_(p.Name_EN), Unit_Code: str_(p.Unit_Code) }, ctx.user.User_ID);
    unitHistory_(ctx, id, ['Name_AR', 'Name_EN', 'Unit_Code'].filter(function (f) { return res.before[f] !== res.after[f]; })
      .map(function (f) { return { f: f, o: res.before[f], n: res.after[f] }; }), reason);
    return res.after;
  });
}

/** Next child code under a parent: FAD-03 → FAD-03-01, FAD-03-02 … (empty when the parent has no code or is the company). */
function nextUnitCode_(parent) {
  if (!parent.Unit_Code || parent.Unit_Type === 'COMPANY') return '';
  var pre = parent.Unit_Code + '-', max = 0;
  all_('ORG_UNITS').forEach(function (u) {
    if (u.Unit_Code && u.Unit_Code.indexOf(pre) === 0) {
      var n = Number(u.Unit_Code.slice(pre.length).split('-')[0]);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  var s = String(max + 1); while (s.length < 2) s = '0' + s;
  return pre + s;
}

function jobFamilies_() {
  try { return JSON.parse(cfg_('JOB_FAMILIES', '{}') || '{}'); } catch (e) { return {}; }
}

/** Next job code in a family: PRD-094 → PRD-095. */
function nextJobCode_(fam) {
  var max = 0, pre = fam + '-';
  all_('JOBS').forEach(function (j) {
    if (j.Job_Code.indexOf(pre) === 0) { var n = Number(j.Job_Code.slice(pre.length)); if (!isNaN(n) && n > max) max = n; }
  });
  var s = String(max + 1); while (s.length < 3) s = '0' + s;
  return pre + s;
}

function dupNameCheck_(parentId, name, selfId) {
  var n = norm_(name);
  if (where_('ORG_UNITS', function (u) {
    return u.Status === 'Active' && u.Parent_Org_Unit_ID === parentId && norm_(u.Name_AR) === n && u.Org_Unit_ID !== selfId;
  }).length) throw userError_('في وحدة بنفس الاسم تحت نفس الوحدة الأم.');
}

/** Move a unit (with everything under it) under another parent. p = { Org_Unit_ID, Parent_Org_Unit_ID, reason } */
function orgUnitMove_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب النقل.');
  return withLock_(function () {
    // checked while holding the lock: two opposite moves at the same moment cannot make a loop in the tree
    var u = activeUnit_(p.Org_Unit_ID);
    if (u.Unit_Type === 'COMPANY') throw userError_('الشركة مينفعش تتنقل.');
    var np = activeUnit_(p.Parent_Org_Unit_ID);
    if (np.Org_Unit_ID === u.Parent_Org_Unit_ID) throw userError_('الوحدة أصلاً تحت الوحدة دي.');
    if (descendants_(u.Org_Unit_ID).indexOf(np.Org_Unit_ID) >= 0 || unitAncestors_(np.Org_Unit_ID).some(function (x) { return x.Org_Unit_ID === u.Org_Unit_ID; }))
      throw userError_('مينفعش تنقل الوحدة تحت وحدة تابعة لها.');
    if (UNIT_TYPES.indexOf(np.Unit_Type) >= UNIT_TYPES.indexOf(u.Unit_Type))
      throw userError_('الوحدة الأم الجديدة لازم تكون أعلى من نوع الوحدة.');
    var old = get_('ORG_UNITS', u.Parent_Org_Unit_ID) || {};
    var res = update_('ORG_UNITS', u.Org_Unit_ID, { Parent_Org_Unit_ID: np.Org_Unit_ID }, ctx.user.User_ID);
    // the unit head now reports to the nearest head above the new parent
    if (u.Head_Position_ID) {
      var above = nearestHeadFrom_(np.Org_Unit_ID);
      var hp = get_('POSITIONS', u.Head_Position_ID);
      if (hp && above && hp.Reports_To_Position_ID !== above) {
        update_('POSITIONS', hp.Position_ID, { Reports_To_Position_ID: above }, ctx.user.User_ID);
        posHistory_(ctx, hp.Position_ID, 'Reports_To_Position_ID', hp.Reports_To_Position_ID, above, reason);
      }
    }
    unitHistory_(ctx, u.Org_Unit_ID, [{ f: 'Parent_Org_Unit_ID', o: old.Name_AR || u.Parent_Org_Unit_ID, n: np.Name_AR, a: 'MOVE' }], reason);
    return res.after;
  });
}

/** Nearest head position at this unit or above. */
function nearestHeadFrom_(unitId) {
  var anc = unitAncestors_(unitId);
  for (var i = 0; i < anc.length; i++) if (anc[i].Head_Position_ID) return anc[i].Head_Position_ID;
  return '';
}

/**
 * Set / change / clear the head position of a unit. p = { Org_Unit_ID, Head_Position_ID ('' clears), reason }
 * Positions in the unit that reported to the old head (or to nobody, or — when the unit had no head — to the head above) now report to the new head.
 */
function orgUnitSetHead_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب التعديل.');
  var u = activeUnit_(p.Org_Unit_ID);
  var nh = str_(p.Head_Position_ID), oh = u.Head_Position_ID;
  if (nh === oh) throw userError_('دي نفس وظيفة المدير الحالية.');
  var npos = null;
  if (nh) {
    npos = get_('POSITIONS', nh);
    if (!npos || npos.Status === 'Closed') throw userError_('الوظيفة غير موجودة أو مقفولة.');
    if (npos.Org_Unit_ID !== u.Org_Unit_ID) throw userError_('وظيفة المدير لازم تكون جوه نفس الوحدة.');
    var other = where_('ORG_UNITS', function (x) { return x.Status === 'Active' && x.Head_Position_ID === nh && x.Org_Unit_ID !== u.Org_Unit_ID; })[0];
    if (other) throw userError_('الوظيفة دي مديرة لوحدة تانية (' + other.Name_AR + ').');
  }
  var repointed = 0;
  withLock_(function () {
    update_('ORG_UNITS', u.Org_Unit_ID, { Head_Position_ID: nh }, ctx.user.User_ID);
    if (oh && get_('POSITIONS', oh)) {
      update_('POSITIONS', oh, { Is_Head_Of_Unit: 'N' }, ctx.user.User_ID);
      posHistory_(ctx, oh, 'Is_Head_Of_Unit', 'Y', 'N', reason);
    }
    if (npos) {
      var above = nearestHeadFrom_(u.Parent_Org_Unit_ID);
      var hp = { Is_Head_Of_Unit: 'Y' };
      if (above && npos.Reports_To_Position_ID !== above) hp.Reports_To_Position_ID = above;
      update_('POSITIONS', nh, hp, ctx.user.User_ID);
      posHistory_(ctx, nh, 'Is_Head_Of_Unit', 'N', 'Y', reason);
      if (hp.Reports_To_Position_ID) posHistory_(ctx, nh, 'Reports_To_Position_ID', npos.Reports_To_Position_ID, above, reason);
      where_('POSITIONS', function (x) {
        return x.Org_Unit_ID === u.Org_Unit_ID && x.Position_ID !== nh && x.Status !== 'Closed' &&
          (x.Reports_To_Position_ID === oh || !x.Reports_To_Position_ID || (!oh && x.Reports_To_Position_ID === above));
      }).forEach(function (x) {
        update_('POSITIONS', x.Position_ID, { Reports_To_Position_ID: nh }, ctx.user.User_ID);
        posHistory_(ctx, x.Position_ID, 'Reports_To_Position_ID', x.Reports_To_Position_ID, nh, reason);
        repointed++;
      });
    }
    var title = function (pid) { var x = pid ? get_('POSITIONS', pid) : null; return x ? (x.Position_Title || (get_('JOBS', x.Job_Code) || {}).Job_Title_AR || pid) : ''; };
    unitHistory_(ctx, u.Org_Unit_ID, [{ f: 'Head_Position_ID', o: title(oh), n: title(nh) || '(بدون مدير)', a: 'SET_HEAD' }], reason);
  });
  // steps waiting on the old head will not move by themselves — tell HR admins
  var stuck = oh ? where_('APPROVAL_INSTANCES', function (a) { return a.Status === 'PENDING' && a.Authority === 'POSITION:' + oh; }) : [];
  if (stuck.length) notify_(eligibleUsers_('ROLE:' + HR_ADMIN_ROLES.join('|'), ''), 'طلبات عند مدير الوحدة القديم',
    u.Name_AR + ': ' + stuck.length + ' خطوة اعتماد لسه عند صاحب وظيفة المدير القديمة. لو مش هيعتمدها، رجّع الطلب واتبعت تاني.', '', '', false);
  return { unit: get_('ORG_UNITS', u.Org_Unit_ID), repointed: repointed, pendingOnOldHead: stuck.length };
}

/** Close a unit: only when empty (no active child units, no active positions). p = { Org_Unit_ID, reason } */
function orgUnitClose_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب القفل.');
  var u = activeUnit_(p.Org_Unit_ID);
  if (u.Unit_Type === 'COMPANY') throw userError_('الشركة مينفعش تتقفل.');
  var kids = where_('ORG_UNITS', function (x) { return x.Status === 'Active' && x.Parent_Org_Unit_ID === u.Org_Unit_ID; });
  if (kids.length) throw userError_('تحت الوحدة ' + kids.length + ' وحدة شغالة — انقلها أو اقفلها الأول.');
  var pos = where_('POSITIONS', function (x) { return x.Org_Unit_ID === u.Org_Unit_ID && x.Status !== 'Closed'; });
  if (pos.length) throw userError_('في الوحدة ' + pos.length + ' وظيفة شغالة — انقلها لوحدة تانية أو اقفلها الأول.');
  return withLock_(function () {
    var res = update_('ORG_UNITS', u.Org_Unit_ID, { Status: 'Closed', Effective_To: today_(), Head_Position_ID: '' }, ctx.user.User_ID);
    unitHistory_(ctx, u.Org_Unit_ID, [{ f: 'Status', o: 'Active', n: 'Closed', a: 'CLOSE' }], reason);
    return res.after;
  });
}

function orgUnitHistory_(ctx, p) {
  var names = userNames_();
  return where_('ORG_UNIT_HISTORY', function (h) { return h.Org_Unit_ID === str_(p.Org_Unit_ID); })
    .map(function (h) { h.byName = names[h.Created_By] || ''; return h; })
    .sort(function (a, b) { return a.History_ID < b.History_ID ? 1 : -1; });
}

/* ---------------- positions ---------------- */

/**
 * Add a position to a unit. p = { Org_Unit_ID, Job_Code | New_Job_Title, Position_Title, Location_ID,
 *   Reports_To_Position_ID (default: unit head, or the head above when the new position is not the head), Structural_HC, reason }
 */
function orgPositionCreate_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب الإضافة.');
  var u = activeUnit_(p.Org_Unit_ID);
  var hc = nonNegInt_(str_(p.Structural_HC) || '1', 'العدد المعتمد');
  var jobCode = str_(p.Job_Code), newTitle = str_(p.New_Job_Title);
  if (jobCode && !get_('JOBS', jobCode)) throw userError_('كود الوظيفة غير موجود.');
  if (!jobCode && newTitle.length < 2) throw userError_('اختار وظيفة موجودة أو اكتب مسمى وظيفة جديدة.');
  if (str_(p.Location_ID) && !get_('LOCATIONS', p.Location_ID)) throw userError_('الموقع غير موجود.');
  var rt = str_(p.Reports_To_Position_ID) || u.Head_Position_ID || nearestHeadFrom_(u.Parent_Org_Unit_ID);
  if (rt && !get_('POSITIONS', rt)) throw userError_('وظيفة "يتبع لـ" غير موجودة.');
  return withLock_(function () {
    if (!jobCode) {
      var dup = where_('JOBS', function (j) { return j.Status !== 'Closed' && norm_(j.Job_Title_AR) === norm_(newTitle); })[0];
      var fam = str_(p.Job_Family);
      var fams = jobFamilies_();
      if (dup) jobCode = dup.Job_Code;
      else {
        if (Object.keys(fams).length && !fams[fam]) throw userError_('اختار العائلة الوظيفية للمسمى الجديد.');
        jobCode = fam ? nextJobCode_(fam) : nextId_('JOB');
        insert_('JOBS', { Job_Code: jobCode, Job_Title_AR: newTitle, Job_Title_EN: '', Job_Family: fam, Job_Level: '', Grade_Code: '',
          Current_JD_Version: '', Status: 'Active', Effective_From: today_(), Effective_To: '' }, ctx.user.User_ID);
        audit_(ctx, { entityType: 'JOB', entityId: jobCode, action: 'CREATE', newValue: newTitle, reason: reason });
      }
    }
    var pos = insert_('POSITIONS', { Position_ID: nextId_('POSITION'), Org_Version_ID: activeVersion_(), Job_Code: jobCode,
      Position_Title: str_(p.Position_Title), Org_Unit_ID: u.Org_Unit_ID, Reports_To_Position_ID: rt, Location_ID: str_(p.Location_ID),
      Is_Head_Of_Unit: 'N', Structural_HC: hc, HC_Basis: 'BASELINE_TEMP', Occupied_HC: '0', Occupied_Updated_At: '', Occupied_Updated_By: '',
      Status: 'Active', Effective_From: today_(), Effective_To: '' }, ctx.user.User_ID);
    posHistory_(ctx, pos.Position_ID, 'CREATED', '', u.Name_AR + ' · العدد ' + hc, reason);
    return pos;
  });
}

/** Move a position to another unit. p = { Position_ID, Org_Unit_ID, Reports_To_Position_ID?, reason } */
function orgPositionMove_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب النقل.');
  var pos = get_('POSITIONS', p.Position_ID);
  if (!pos || pos.Status === 'Closed') throw userError_('الوظيفة غير موجودة أو مقفولة.');
  var u = activeUnit_(p.Org_Unit_ID);
  if (u.Org_Unit_ID === pos.Org_Unit_ID) throw userError_('الوظيفة أصلاً في الوحدة دي.');
  if (where_('ORG_UNITS', function (x) { return x.Status === 'Active' && x.Head_Position_ID === pos.Position_ID; }).length)
    throw userError_('دي وظيفة مدير الوحدة — غيّر مدير الوحدة الأول.');
  blockIfOpenWork_([pos.Position_ID], 'الوظيفة');
  var rt = str_(p.Reports_To_Position_ID) || u.Head_Position_ID || nearestHeadFrom_(u.Parent_Org_Unit_ID);
  var from = get_('ORG_UNITS', pos.Org_Unit_ID) || {};
  return withLock_(function () {
    var res = update_('POSITIONS', pos.Position_ID, { Org_Unit_ID: u.Org_Unit_ID, Reports_To_Position_ID: rt }, ctx.user.User_ID);
    posHistory_(ctx, pos.Position_ID, 'Org_Unit_ID', from.Name_AR || pos.Org_Unit_ID, u.Name_AR, reason);
    if (rt !== pos.Reports_To_Position_ID) posHistory_(ctx, pos.Position_ID, 'Reports_To_Position_ID', pos.Reports_To_Position_ID, rt, reason);
    // positions that reported to this one keep reporting to it (they follow their manager only if moved explicitly)
    return res.after;
  });
}

/* ---------------- approval rules (CEO / board) ---------------- */

var RULE_TYPES_ = { CEO_REQUIRED: 'اعتماد الرئيس التنفيذي', BOARD_REQUIRED: 'اعتماد مجلس الإدارة' };

function rulesList_(ctx) {
  var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  var names = userNames_();
  return where_('AUTHORITY_RULES', function (r) { return r.Process === 'RECRUITMENT_REQUEST' && RULE_TYPES_[r.Rule_Type]; })
    .map(function (r) {
      r.typeName = RULE_TYPES_[r.Rule_Type];
      r.scopeName = r.Scope_Type === 'ALL' ? 'كل طلبات التوظيف'
        : r.Scope_Type === 'ORG_UNIT' ? 'الوحدة: ' + (units[r.Scope_Value] || r.Scope_Value) + ' وكل اللي تحتها'
        : r.Scope_Type === 'JOB' ? 'الوظيفة: ' + (jobs[r.Scope_Value] || r.Scope_Value) + ' (' + r.Scope_Value + ')'
        : r.Scope_Type === 'TARGET_REPORTS_TO' ? 'الوظايف التابعة للرئيس التنفيذي مباشرة'
        : r.Scope_Type === 'TARGET_HEAD_OF' ? 'وظايف رؤساء القطاعات' : r.Scope_Type;
      if (/^[\x00-\x7F]*$/.test(r.Notes || '')) {   // seeded English notes → Arabic for display
        r.Notes = r.Scope_Type === 'TARGET_HEAD_OF' ? 'قاعدة أساسية: وظايف رؤساء القطاعات بتروح للرئيس التنفيذي'
          : r.Scope_Type === 'TARGET_REPORTS_TO' ? 'قاعدة أساسية: الوظايف التابعة للرئيس التنفيذي مباشرة بتروح لمجلس الإدارة' : r.Notes;
      }
      r.effective = r.Active === 'Y' && isEffective_(r.Effective_From, r.Effective_To);
      r.byName = names[r.Created_By] || r.Created_By;
      return r;
    }).sort(function (a, b) { return a.Rule_ID < b.Rule_ID ? 1 : -1; });
}

/** p = { Rule_Type, Scope_Type: ORG_UNIT|JOB|ALL, Scope_Value, Effective_From, Effective_To, Notes } */
function ruleSave_(ctx, p) {
  var type = str_(p.Rule_Type), st = str_(p.Scope_Type), sv = str_(p.Scope_Value);
  if (!RULE_TYPES_[type]) throw userError_('اختار نوع الاعتماد.');
  if (['ORG_UNIT', 'JOB', 'ALL'].indexOf(st) < 0) throw userError_('اختار النطاق.');
  if (st === 'ORG_UNIT' && !get_('ORG_UNITS', sv)) throw userError_('اختار الوحدة.');
  if (st === 'JOB' && !get_('JOBS', sv)) throw userError_('اختار الوظيفة.');
  var from = str_(p.Effective_From) || today_(), to = str_(p.Effective_To);
  [from, to].forEach(function (d) { if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw userError_('التاريخ غير صحيح.'); });
  if (to && to < from) throw userError_('تاريخ النهاية قبل البداية.');
  var notes = str_(p.Notes);
  if (notes.length < 3) throw userError_('اكتب سبب القاعدة (مثلاً: طلب المجلس لحد إعادة الهيكلة).');
  return withLock_(function () {
    var r = insert_('AUTHORITY_RULES', { Rule_ID: nextId_('RULE'), Process: 'RECRUITMENT_REQUEST', Rule_Type: type, Scope_Type: st,
      Scope_Value: st === 'ALL' ? '' : sv, Authority: type === 'BOARD_REQUIRED' ? 'BOARD' : 'CEO', Effective_From: from, Effective_To: to,
      Active: 'Y', Notes: notes }, ctx.user.User_ID);
    audit_(ctx, { entityType: 'AUTHORITY_RULE', entityId: r.Rule_ID, action: 'CREATE', newValue: type + ' ' + st + ' ' + sv, reason: notes });
    return r;
  });
}

/** Stop a rule (kept for history). p = { Rule_ID, reason } */
function ruleStop_(ctx, p) {
  var r = get_('AUTHORITY_RULES', p.Rule_ID);
  if (!r || r.Process !== 'RECRUITMENT_REQUEST' || !RULE_TYPES_[r.Rule_Type]) throw userError_('القاعدة غير موجودة.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب الإيقاف.');
  return withLock_(function () {
    var res = update_('AUTHORITY_RULES', r.Rule_ID, { Active: 'N', Effective_To: r.Effective_To && r.Effective_To < today_() ? r.Effective_To : today_() }, ctx.user.User_ID);
    auditDiff_(ctx, 'AUTHORITY_RULE', r.Rule_ID, res.before, res.after, reason);
    return res.after;
  });
}
