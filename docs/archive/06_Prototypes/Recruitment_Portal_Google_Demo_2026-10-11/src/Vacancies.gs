/**
 * Vacancies.gs — one vacancy per approved request line (= one location).
 * Status: APPROVED (waiting to start) → OPEN ⇄ ON_HOLD → [PARTIALLY_FILLED → FILLED: later phases]
 *         CANCELLED / CLOSED (with reason)
 * Dynamic priority score = classification + age band + due-date urgency + pin (weights in CONFIG).
 */

function vacManagerRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR]; }
function recruiterRoles_() { return [ROLE.RECRUITER, ROLE.REC_SUPERVISOR, ROLE.REC_MANAGER, ROLE.HR_STAFF, ROLE.HR_MANAGER]; }

var VAC_STATUS_AR_ = { APPROVED: 'معتمدة — لم تبدأ', PREPARATION: 'تحضير', OPEN: 'جاري التوظيف', ON_HOLD: 'متوقفة مؤقتاً', FROZEN: 'مجمّدة بقرار الإدارة',
  PARTIALLY_FILLED: 'اكتملت جزئياً', FILLED: 'اكتملت', CANCELLED: 'ملغاة', CLOSED: 'مغلقة' };

function priorityWeights_() {
  var d = { NORMAL: 20, IMPORTANT: 40, CRITICAL: 60, AGE_16_30: 10, AGE_31_60: 25, AGE_60_PLUS: 40,
    DUE_OVERDUE: 30, DUE_7: 20, DUE_30: 10, PIN: 100 };
  try {
    var c = JSON.parse(cfg_('PRIORITY_WEIGHTS', '{}') || '{}');
    for (var k in c) if (typeof c[k] === 'number') d[k] = c[k];
  } catch (e) { console.warn('PRIORITY_WEIGHTS is not valid JSON; using defaults'); }
  return d;
}

/** Score with its parts so the UI can explain "why is this on top". */
function vacancyScore_(v, W, today) {
  var parts = [];
  var cls = v.HR_Classification || 'NORMAL';
  parts.push({ k: 'تصنيف ' + ({ NORMAL: 'عادي', IMPORTANT: 'مهم', CRITICAL: 'حرج' }[cls] || cls), v: W[cls] || 0 });
  var start = (v.Recruitment_Start_Date || v.Created_At || today).slice(0, 10);
  var age = Math.max(0, daysBetween_(start, today));
  if (age > 60) parts.push({ k: 'مفتوحة أكتر من 60 يوم', v: W.AGE_60_PLUS });
  else if (age > 30) parts.push({ k: 'مفتوحة 31–60 يوم', v: W.AGE_31_60 });
  else if (age > 15) parts.push({ k: 'مفتوحة 16–30 يوم', v: W.AGE_16_30 });
  var due = v.Required_By_Date ? daysBetween_(today, v.Required_By_Date) : null;
  if (due !== null) {
    if (due < 0) parts.push({ k: 'متأخرة عن تاريخ الاحتياج', v: W.DUE_OVERDUE });
    else if (due <= 7) parts.push({ k: 'الاحتياج خلال أسبوع', v: W.DUE_7 });
    else if (due <= 30) parts.push({ k: 'الاحتياج خلال شهر', v: W.DUE_30 });
  }
  if (v.Pin_Until && v.Pin_Until >= today) parts.push({ k: 'مثبتة: ' + (v.Pin_Reason || ''), v: W.PIN });
  var score = parts.reduce(function (s, p) { return s + (p.v || 0); }, 0);
  return { score: score, parts: parts, ageDays: age, dueDays: due };
}

/** Which vacancies the user may see: null = all. */
function vacancyVisibility_(ctx) {
  if (hasAnyRole_(ctx, vacManagerRoles_().concat([ROLE.HR_STAFF, ROLE.CEO, ROLE.VIEWER]))) return { all: true };
  var mine = {};
  where_('VACANCY_RECRUITERS', function (r) { return r.User_ID === ctx.user.User_ID && r.Active === 'Y'; })
    .forEach(function (r) { mine[r.Vacancy_ID] = 1; });
  return { all: false, ids: mine, units: managedScope_(ctx.user) };
}

/** p = { view: 'active'|'closed'|'all', mine: bool } */
function vacanciesList_(ctx, p) {
  p = p || {};
  var vis = vacancyVisibility_(ctx);
  var view = str_(p.view) || 'active';
  var W = priorityWeights_(), today = today_();
  var names = userNames_();
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
  var locs = {}; all_('LOCATIONS').forEach(function (l) { locs[l.Location_ID] = l.Name_AR; });
  var team = {};
  where_('VACANCY_RECRUITERS', function (r) { return r.Active === 'Y'; }).forEach(function (r) {
    (team[r.Vacancy_ID] = team[r.Vacancy_ID] || []).push(r.User_ID);
  });
  var me = ctx.user.User_ID;
  var rows = where_('VACANCIES', function (v) {
    var active = VAC_OPEN_.indexOf(v.Status) >= 0;
    if (view === 'active' && !active) return false;
    if (view === 'closed' && active) return false;
    if (p.mine && (team[v.Vacancy_ID] || []).indexOf(me) < 0) return false;
    if (!vis.all && !vis.ids[v.Vacancy_ID] && vis.units.indexOf(v.Org_Unit_ID) < 0) return false;
    return true;
  }).map(function (v) {
    var sc = vacancyScore_(v, W, today);
    v.jobTitle = jobs[v.Job_Code] || v.Job_Code;
    v.unitName = units[v.Org_Unit_ID] || '';
    v.locationName = locs[v.Location_ID] || '';
    v.leadName = names[v.Lead_Recruiter_ID] || '';
    v.team = (team[v.Vacancy_ID] || []).map(function (u) { return names[u] || u; });
    v.statusName = VAC_STATUS_AR_[v.Status] || v.Status;
    v.remaining = Math.max(0, num_(v.Required_HC, 0) - num_(v.Joined_HC, 0));
    v.score = VAC_OPEN_.indexOf(v.Status) >= 0 && !vacPaused_(v.Status) ? sc.score : 0;
    v.scoreParts = sc.parts; v.ageDays = sc.ageDays; v.dueDays = sc.dueDays;
    return v;
  }).sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var da = a.Required_By_Date || '9999', db = b.Required_By_Date || '9999';
    return da < db ? -1 : da > db ? 1 : (a.Vacancy_ID < b.Vacancy_ID ? -1 : 1);
  });
  return { rows: rows, canManage: hasAnyRole_(ctx, vacManagerRoles_()), canPrioritize: hasAnyRole_(ctx, HR_ADMIN_ROLES) };
}

function vacancyGet_(ctx, p) {
  var v = get_('VACANCIES', p.Vacancy_ID);
  if (!v) throw userError_('الشاغر غير موجود.');
  var vis = vacancyVisibility_(ctx);
  if (!vis.all && !vis.ids[v.Vacancy_ID] && vis.units.indexOf(v.Org_Unit_ID) < 0) throw userError_('مالكش صلاحية على الشاغر ده.');
  var names = userNames_();
  var list = vacanciesList_(ctx, { view: 'all' }).rows.filter(function (x) { return x.Vacancy_ID === v.Vacancy_ID; })[0] || v;
  list.recruiterHistory = where_('VACANCY_RECRUITERS', function (r) { return r.Vacancy_ID === v.Vacancy_ID; }).map(function (r) {
    r.name = names[r.User_ID] || r.User_ID; r.byName = names[r.Assigned_By] || ''; return r;
  });
  list.priorityHistory = where_('PRIORITY_HISTORY', function (h) { return h.Entity_Type === 'VACANCY' && h.Entity_ID === v.Vacancy_ID; })
    .map(function (h) { h.byName = names[h.Created_By] || ''; return h; });
  list.events = eventsFor_('VACANCY', v.Vacancy_ID);
  var req = get_('RECRUITMENT_REQUESTS', v.Request_ID) || {};
  list.requesterName = names[req.Requester_User_ID] || '';
  list.fills = where_('VACANCY_FILLS', function (f) { return f.Vacancy_ID === v.Vacancy_ID; }).map(function (f) {
    var sp = f.Source_Position_ID ? get_('POSITIONS', f.Source_Position_ID) : null;
    f.sourceTitle = sp ? (sp.Position_Title || (get_('JOBS', sp.Job_Code) || {}).Job_Title_AR || '') + ' — ' +
      ((get_('ORG_UNITS', sp.Org_Unit_ID) || {}).Name_AR || '') : '';
    f.byName = names[f.Created_By] || '';
    return f;
  });
  return { vacancy: list, canManage: hasAnyRole_(ctx, vacManagerRoles_()), canPrioritize: hasAnyRole_(ctx, HR_ADMIN_ROLES) };
}

/** p = { Vacancy_ID, action: OPEN|HOLD|RESUME|FREEZE|UNFREEZE|CANCEL|CLOSE, reason } */
function vacancyUpdate_(ctx, p) {
  var v = get_('VACANCIES', p.Vacancy_ID);
  if (!v) throw userError_('الشاغر غير موجود.');
  var a = str_(p.action), reason = str_(p.reason);
  var patch = {};
  if (a === 'OPEN') {
    if (['APPROVED', 'PREPARATION'].indexOf(v.Status) < 0) throw userError_('الشاغر لازم يكون معتمد ولم يبدأ.');
    if (!v.Lead_Recruiter_ID) throw userError_('حدد مسؤول التوظيف الأول قبل بدء التوظيف.');
    patch = { Status: 'OPEN', Recruitment_Start_Date: v.Recruitment_Start_Date || today_() };
  } else if (a === 'HOLD') {
    if (['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED'].indexOf(v.Status) < 0) throw userError_('الشاغر مش شغال عشان يتوقف.');
    if (reason.length < 3) throw userError_('اكتب سبب الإيقاف.');
    patch = { Status: 'ON_HOLD' };
  } else if (a === 'FREEZE') {
    // v0.41.0 (CHG-86): a management hiring freeze — HR managers only, the status before it is kept to come back to
    if (!hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('تجميد الشاغر بقرار من مديرين الموارد البشرية بس.');
    if (['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED', 'ON_HOLD'].indexOf(v.Status) < 0) throw userError_('الشاغر مش شغال عشان يتجمد.');
    if (reason.length < 5) throw userError_('اكتب سبب التجميد (قرار الإدارة).');
    patch = { Status: 'FROZEN', Frozen_From: v.Status, Frozen_Reason: reason.slice(0, 300), Frozen_By: ctx.user.User_ID, Frozen_At: nowIso_() };
  } else if (a === 'UNFREEZE') {
    if (!hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('فك التجميد لمديرين الموارد البشرية بس.');
    if (v.Status !== 'FROZEN') throw userError_('الشاغر مش مجمّد.');
    var back = v.Frozen_From && v.Frozen_From !== 'FROZEN' ? v.Frozen_From : (v.Recruitment_Start_Date ? 'OPEN' : 'APPROVED');
    if (back === 'OPEN' || back === 'PARTIALLY_FILLED') back = num_(v.Joined_HC, 0) > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
    patch = { Status: back, Frozen_From: '' };
  } else if (a === 'RESUME') {
    if (v.Status !== 'ON_HOLD') throw userError_('الشاغر مش متوقف.');
    patch = { Status: v.Recruitment_Start_Date ? (num_(v.Joined_HC, 0) > 0 ? 'PARTIALLY_FILLED' : 'OPEN') : 'APPROVED' };
  } else if (a === 'CANCEL' || a === 'CLOSE') {
    if (a === 'CANCEL' && !hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('إلغاء الشاغر لمدير HR بس.');
    if (VAC_OPEN_.indexOf(v.Status) < 0) throw userError_('الشاغر مقفول بالفعل.');
    if (reason.length < 3) throw userError_('اكتب السبب.');
    patch = { Status: a === 'CANCEL' ? 'CANCELLED' : 'CLOSED', Closed_At: nowIso_(), Close_Reason: reason };
  } else throw userError_('إجراء غير معروف.');
  // cancelling: every open candidate needs a decision first (transfer / talent pool / regret / hold) — CHG-40/4
  var plan = a === 'CANCEL' ? checkCancelDecisions_(ctx, v, p.decisions) : [];

  var res, done = null;
  withLock_(function () {
    res = update_('VACANCIES', v.Vacancy_ID, patch, ctx.user.User_ID);
    if (plan.length) done = applyCancelDecisions_(ctx, v, plan, reason);
    requestCloseCheck_(ctx, v.Request_ID);
  });
  if (done) res.after.decisions = done;
  if (ctx._cancelledIvs && ctx._cancelledIvs.length) tellCancelled_(ctx._cancelledIvs, 'الشاغر اتلغى');
  auditDiff_(ctx, 'VACANCY', v.Vacancy_ID, res.before, res.after, reason);
  event_(ctx, 'VACANCY', v.Vacancy_ID, 'STATUS_' + patch.Status, reason, { from: v.Status });
  var req = get_('RECRUITMENT_REQUESTS', v.Request_ID);
  if (req && a !== 'RESUME') {
    var jt = (get_('JOBS', v.Job_Code) || {}).Job_Title_AR || v.Job_Code;
    notify_([req.Requester_User_ID], 'تحديث على شاغر ' + jt, v.Vacancy_ID + ' — ' + VAC_STATUS_AR_[patch.Status] + (reason ? ': ' + reason : ''),
      'VACANCY', v.Vacancy_ID, a !== 'OPEN');
  }
  return res.after;
}

/** Users who can be assigned to vacancies. */
function recruitersList_(ctx) {
  var roles = recruiterRoles_();
  var ids = {};
  where_('USER_ROLES', function (r) { return roles.indexOf(r.Role_Code) >= 0 && isEffective_(r.Effective_From, r.Effective_To); })
    .forEach(function (r) { ids[r.User_ID] = 1; });
  return Object.keys(ids).map(function (id) { return get_('USERS', id); })
    .filter(function (u) { return u && u.Status === 'Active'; })
    .map(function (u) { return { id: u.User_ID, name: u.Full_Name_AR }; });
}

/** p = { Vacancy_ID, Lead_Recruiter_ID, recruiters:[User_ID], reason } */
function vacancyAssign_(ctx, p, quiet) {
  var v = get_('VACANCIES', p.Vacancy_ID);
  if (!v) throw userError_('الشاغر غير موجود.');
  if (VAC_OPEN_.indexOf(v.Status) < 0) throw userError_('الشاغر مقفول.');
  var allowed = {}; recruitersList_(ctx).forEach(function (r) { allowed[r.id] = 1; });
  var lead = str_(p.Lead_Recruiter_ID);
  if (!lead) throw userError_('اختار المسؤول الأول.');
  var desired = {}; desired[lead] = 'LEAD';
  (p.recruiters || []).forEach(function (u) { u = str_(u); if (u && !desired[u]) desired[u] = 'SUPPORT'; });
  Object.keys(desired).forEach(function (u) { if (!allowed[u]) throw userError_('المستخدم ' + u + ' مالوش دور توظيف.'); });
  var reason = str_(p.reason);
  var current = where_('VACANCY_RECRUITERS', function (r) { return r.Vacancy_ID === v.Vacancy_ID && r.Active === 'Y'; });
  if (current.length && reason.length < 3) throw userError_('اكتب سبب تغيير الفريق.');
  var added = [], removed = [];
  withLock_(function () {
    current.forEach(function (r) {
      if (desired[r.User_ID] === r.Role) { delete desired[r.User_ID]; return; }
      update_('VACANCY_RECRUITERS', r.VR_ID, { Active: 'N', Ended_At: nowIso_(), Reason: reason }, ctx.user.User_ID);
      removed.push(r.User_ID);
    });
    var add = Object.keys(desired);
    if (add.length) {
      var ids = nextIds_('VAC_RECRUITER', add.length);
      insertMany_('VACANCY_RECRUITERS', add.map(function (u, i) {
        added.push(u);
        return { VR_ID: ids[i], Vacancy_ID: v.Vacancy_ID, User_ID: u, Role: desired[u], Active: 'Y', Assigned_By: ctx.user.User_ID,
          Ended_At: '', Reason: reason };
      }), ctx.user.User_ID);
    }
    update_('VACANCIES', v.Vacancy_ID, { Lead_Recruiter_ID: lead }, ctx.user.User_ID);
    reassignOwners_(ctx.user.User_ID, v.Vacancy_ID);   // candidates of someone who left the team go to the lead
  });
  var names = userNames_();
  event_(ctx, 'VACANCY', v.Vacancy_ID, 'TEAM_CHANGED', reason, { lead: names[lead], added: added.map(function (u) { return names[u]; }),
    removed: removed.map(function (u) { return names[u]; }) });
  audit_(ctx, { entityType: 'VACANCY', entityId: v.Vacancy_ID, action: 'ASSIGN', newValue: lead, reason: reason });
  var jt = (get_('JOBS', v.Job_Code) || {}).Job_Title_AR || v.Job_Code;
  var loc = (get_('LOCATIONS', v.Location_ID) || {}).Name_AR || '';
  if (quiet) { quiet.push({ vacancy: v.Vacancy_ID, title: jt + (loc ? ' (' + loc + ')' : ''), added: added }); return get_('VACANCIES', v.Vacancy_ID); }
  notify_(added.filter(function (u) { return u !== ctx.user.User_ID; }), 'اتسند لك شاغر جديد',
    v.Vacancy_ID + ' — ' + jt + (loc ? ' (' + loc + ')' : ''), 'VACANCY', v.Vacancy_ID, true);
  return get_('VACANCIES', v.Vacancy_ID);
}

/**
 * v0.28.0 (VAC-005): many vacancies in one step.
 *   p = { Vacancy_IDs: [..], Lead_Recruiter_ID, recruiters: [..], reason }        → the same team on every selected vacancy
 *   p = { From_User_ID, To_User_ID, reason }                                        → everything one recruiter has moves to another
 *       (same role on each vacancy: lead stays lead, support stays support; candidates and next actions follow)
 * Each vacancy goes through vacancyAssign_ (same checks, history and audit); one notification per person for the lot.
 */
function vacancyAssignMany_(ctx, p) {
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب السبب.');
  var jobs = [], from = str_(p.From_User_ID), to = str_(p.To_User_ID);
  if (from) {
    if (!to || to === from) throw userError_('اختار الموظف اللي هيستلم الشغل.');
    var allowed = {}; recruitersList_(ctx).forEach(function (r) { allowed[r.id] = 1; });
    if (!allowed[to]) throw userError_('المستخدم ' + to + ' مالوش دور توظيف.');
    where_('VACANCIES', function (v) { return VAC_OPEN_.indexOf(v.Status) >= 0; }).forEach(function (v) {
      var team = where_('VACANCY_RECRUITERS', function (r) { return r.Vacancy_ID === v.Vacancy_ID && r.Active === 'Y'; });
      if (v.Lead_Recruiter_ID !== from && !team.some(function (r) { return r.User_ID === from; })) return;
      var lead = v.Lead_Recruiter_ID === from || !v.Lead_Recruiter_ID ? to : v.Lead_Recruiter_ID;
      var sup = team.filter(function (r) { return r.Role !== 'LEAD'; }).map(function (r) { return r.User_ID === from ? to : r.User_ID; })
        .filter(function (u, i, a) { return u !== lead && a.indexOf(u) === i; });
      jobs.push({ Vacancy_ID: v.Vacancy_ID, Lead_Recruiter_ID: lead, recruiters: sup });
    });
    if (!jobs.length) throw userError_('مفيش شواغر مفتوحة على الموظف ده.');
  } else {
    var ids = (p.Vacancy_IDs || []).map(str_).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (!ids.length) throw userError_('اختار شاغر واحد على الأقل.');
    if (ids.length > 200) throw userError_('أقصى عدد في المرة 200 شاغر.');
    if (!str_(p.Lead_Recruiter_ID)) throw userError_('اختار المسؤول الأول.');
    ids.forEach(function (id) { jobs.push({ Vacancy_ID: id, Lead_Recruiter_ID: str_(p.Lead_Recruiter_ID), recruiters: p.recruiters || [] }); });
  }
  var done = [], failed = [], quiet = [];
  jobs.forEach(function (j) {
    try { vacancyAssign_(ctx, { Vacancy_ID: j.Vacancy_ID, Lead_Recruiter_ID: j.Lead_Recruiter_ID, recruiters: j.recruiters, reason: reason }, quiet); done.push(j.Vacancy_ID); }
    catch (e) { failed.push({ id: j.Vacancy_ID, error: e && e.userFacing ? e.message : 'خطأ غير متوقع' }); }
  });
  var per = {};
  quiet.forEach(function (q) { q.added.forEach(function (u) { if (u !== ctx.user.User_ID) (per[u] = per[u] || []).push(q); }); });
  Object.keys(per).forEach(function (u) {
    var list = per[u];
    notify_([u], list.length === 1 ? 'اتسند لك شاغر جديد' : 'اتسند لك ' + list.length + ' شواغر',
      list.slice(0, 10).map(function (q) { return q.vacancy + ' — ' + q.title; }).join('، ') + (list.length > 10 ? ' …' : ''), 'VACANCY', list[0].vacancy, true);
  });
  if (from && done.length) notify_([from].filter(function (u) { return u !== ctx.user.User_ID; }), 'شغلك اتنقل لزميل',
    done.length + ' شاغر اتنقلوا لـ ' + (userNames_()[to] || to) + ': ' + reason, 'VACANCY', done[0], false);
  audit_(ctx, { entityType: 'VACANCY', entityId: done.slice(0, 20).join(','), action: from ? 'MOVE_ALL' : 'ASSIGN_MANY', newValue: from ? from + '→' + to : str_(p.Lead_Recruiter_ID), reason: reason });
  return { done: done, failed: failed };
}

/** p = { Vacancy_ID, HR_Classification?, Pin_Until?, Pin_Reason?, reason } — HR managers only. */
function vacancyPriority_(ctx, p) {
  var v = get_('VACANCIES', p.Vacancy_ID);
  if (!v) throw userError_('الشاغر غير موجود.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب تغيير الأولوية.');
  var patch = {};
  if (p.HR_Classification !== undefined) {
    if (['NORMAL', 'IMPORTANT', 'CRITICAL'].indexOf(str_(p.HR_Classification)) < 0) throw userError_('تصنيف غير صحيح.');
    patch.HR_Classification = str_(p.HR_Classification);
  }
  if (p.Pin_Until !== undefined) {
    var pin = str_(p.Pin_Until);
    if (pin && (!/^\d{4}-\d{2}-\d{2}$/.test(pin) || pin < today_())) throw userError_('تاريخ التثبيت لازم يكون النهارده أو بعد كده.');
    patch.Pin_Until = pin;
    patch.Pin_Reason = pin ? str_(p.Pin_Reason) || reason : '';
  }
  var res;
  withLock_(function () {
    res = update_('VACANCIES', v.Vacancy_ID, patch, ctx.user.User_ID);
    var ch = ['HR_Classification', 'Pin_Until'].filter(function (f) { return str_(res.before[f]) !== str_(res.after[f]); });
    if (ch.length) {
      var ids = nextIds_('PRIORITY_HISTORY', ch.length);
      insertMany_('PRIORITY_HISTORY', ch.map(function (f, i) {
        return { Priority_History_ID: ids[i], Entity_Type: 'VACANCY', Entity_ID: v.Vacancy_ID, Field: f,
          Old_Value: res.before[f], New_Value: res.after[f], Reason: reason };
      }), ctx.user.User_ID);
    }
  });
  auditDiff_(ctx, 'VACANCY', v.Vacancy_ID, res.before, res.after, reason);
  event_(ctx, 'VACANCY', v.Vacancy_ID, 'PRIORITY_CHANGED', reason, { classification: res.after.HR_Classification, pin: res.after.Pin_Until });
  return res.after;
}

/* ---------------- filling a vacancy (Phase 2 interim; MOV-001) ---------------- */

var FILL_METHOD_AR_ = { EXTERNAL: 'تعيين من الخارج', INTERNAL_TRANSFER: 'نقل داخلي' };

/** Move Occupied HC on a position by delta, with position history. Must run under the lock. */
function adjustOccupied_(ctx, positionId, delta, reason) {
  var pos = get_('POSITIONS', positionId);
  if (!pos) return;
  var old = num_(pos.Occupied_HC, 0), nv = Math.max(0, old + delta);
  if (nv === old) return;
  update_('POSITIONS', positionId, { Occupied_HC: String(nv), Occupied_Updated_At: nowIso_(), Occupied_Updated_By: ctx.user.User_ID }, ctx.user.User_ID);
  insert_('POSITION_HISTORY', { History_ID: nextId_('POSITION_HISTORY'), Position_ID: positionId, Field: 'Occupied_HC',
    Old_Value: String(old), New_Value: String(nv), Reason: reason }, ctx.user.User_ID);
  audit_(ctx, { entityType: 'POSITION', entityId: positionId, action: 'UPDATE', field: 'Occupied_HC', oldValue: old, newValue: nv, reason: reason });
}

/**
 * VAC-002 (v0.40.0): a request closes by itself when every vacancy it made is filled, closed or cancelled, and opens
 * again (back to APPROVED) when one of them reopens — e.g. a wrong fill is voided. Runs inside the caller's lock.
 */
var VAC_DONE_ = ['FILLED', 'CLOSED', 'CANCELLED'];
function requestCloseCheck_(ctx, requestId) {
  var req = requestId && get_('RECRUITMENT_REQUESTS', requestId);
  if (!req || (req.Status !== 'APPROVED' && req.Status !== 'CLOSED')) return null;
  var vs = find_('VACANCIES', { Request_ID: requestId });
  if (!vs.length) return null;
  var done = vs.every(function (x) { return VAC_DONE_.indexOf(x.Status) >= 0; });
  var to = done ? 'CLOSED' : 'APPROVED';
  if (to === req.Status) return null;
  update_('RECRUITMENT_REQUESTS', requestId, { Status: to, Closed_At: done ? nowIso_() : '' }, ctx.user.User_ID);
  event_(ctx, 'REQUEST', requestId, done ? 'REQUEST_CLOSED' : 'REQUEST_REOPENED', done ? 'كل شواغر الطلب اتقفلت' : 'شاغر من الطلب رجع مفتوح', {});
  if (done) notify_([req.Requester_User_ID], 'طلب التوظيف ' + requestId + ' اتقفل', 'كل شواغر الطلب اكتملت أو اتقفلت.', 'REQUEST', requestId, false);
  return to;
}

function fillStatus_(v, joined) {
  var req = num_(v.Required_HC, 0);
  if (joined >= req) return 'FILLED';
  return joined > 0 ? 'PARTIALLY_FILLED' : (v.Recruitment_Start_Date ? 'OPEN' : 'APPROVED');
}

/**
 * Record one person who filled the vacancy.
 * p = { Vacancy_ID, Method: EXTERNAL|INTERNAL_TRANSFER, Employee_Name, Employee_ID, Source_Position_ID, Effective_Date, Notes }
 */
function vacancyFill_(ctx, p) {
  var v = get_('VACANCIES', p.Vacancy_ID);
  if (!v) throw userError_('الشاغر غير موجود.');
  var over = p._overHire === 'Y';   // a candidate joining from an accepted offer: the offer already passed the headcount check
  if (['APPROVED', 'PREPARATION', 'OPEN', 'PARTIALLY_FILLED'].concat(over ? ['FILLED'] : []).indexOf(v.Status) < 0)
    throw userError_(v.Status === 'ON_HOLD' ? 'الشاغر متوقف — استأنفه الأول.' : v.Status === 'FROZEN' ? 'الشاغر مجمّد بقرار الإدارة — فك التجميد الأول.' : 'الشاغر مش مفتوح.');
  var method = str_(p.Method);
  if (!FILL_METHOD_AR_[method]) throw userError_('اختار طريقة الشغل: تعيين من الخارج أو نقل داخلي.');
  var name = str_(p.Employee_Name), date = str_(p.Effective_Date);
  if (name.length < 3 && !(method === 'INTERNAL_TRANSFER' && occFromEmployees_())) throw userError_('اكتب اسم الموظف.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw userError_('اكتب تاريخ الانضمام / النقل.');
  var src = str_(p.Source_Position_ID);
  var empMode = occFromEmployees_(), empPlan = null;
  if (empMode) {
    empPlan = empFillCheck_(v, method, p);          // validates the code / employee before anything is written
    if (method === 'INTERNAL_TRANSFER') { src = empPlan.emp.Position_ID; name = empPlan.emp.Full_Name; }
    if (src === v.Position_ID) throw userError_('الموظف أصلاً على نفس وظيفة الشاغر.');
  } else if (method === 'INTERNAL_TRANSFER') {
    if (!src || !get_('POSITIONS', src)) throw userError_('حدد الوظيفة الحالية للموظف المنقول.');
    if (src === v.Position_ID) throw userError_('الوظيفة الحالية هي نفس وظيفة الشاغر.');
    if (!str_(p.Employee_ID)) throw userError_('اكتب كود الموظف المنقول.');
  } else src = '';
  var joined = num_(v.Joined_HC, 0);
  if (!over && joined >= num_(v.Required_HC, 0)) throw userError_('الشاغر اكتمل بالفعل.');

  var label = FILL_METHOD_AR_[method] + ' — ' + name + ' (' + v.Vacancy_ID + ')';
  var fill, after;
  withLock_(function () {
    fill = insert_('VACANCY_FILLS', { Fill_ID: nextId_('VAC_FILL'), Vacancy_ID: v.Vacancy_ID, Method: method, Employee_Name: name,
      Employee_ID: empPlan ? empPlan.code : str_(p.Employee_ID), Source_Position_ID: src, Effective_Date: date, Notes: str_(p.Notes), Status: 'Active',
      Voided_By: '', Voided_At: '', Void_Reason: '' }, ctx.user.User_ID);
    var nj = joined + 1, st = fillStatus_(v, nj);
    var patch = { Joined_HC: String(nj), Status: st, Recruitment_Start_Date: v.Recruitment_Start_Date || date };
    if (st === 'FILLED') { patch.Closed_At = nowIso_(); patch.Close_Reason = 'اكتمل العدد'; }
    after = update_('VACANCIES', v.Vacancy_ID, patch, ctx.user.User_ID).after;
    requestCloseCheck_(ctx, v.Request_ID);
    if (empMode) empFillApply_(ctx, v, fill, empPlan, date);
    else {
      adjustOccupied_(ctx, v.Position_ID, +1, label);
      if (src) adjustOccupied_(ctx, src, -1, label);
    }
  });
  if (empMode) recountOccupied_([v.Position_ID].concat(src ? [src] : []), ctx.user.User_ID);
  event_(ctx, 'VACANCY', v.Vacancy_ID, 'FILLED_' + method, str_(p.Notes), { name: name, employeeId: str_(p.Employee_ID), date: date, fill: fill.Fill_ID });
  audit_(ctx, { entityType: 'VACANCY', entityId: v.Vacancy_ID, action: 'FILL', newValue: method + ' ' + name });
  var req = get_('RECRUITMENT_REQUESTS', v.Request_ID);
  var jt = (get_('JOBS', v.Job_Code) || {}).Job_Title_AR || v.Job_Code;
  if (req) notify_([req.Requester_User_ID], after.Status === 'FILLED' ? 'اكتمل شاغر ' + jt + ' 🎉' : 'انضم موظف على شاغر ' + jt,
    FILL_METHOD_AR_[method] + ': ' + name + ' بتاريخ ' + date + ' (' + after.Joined_HC + ' من ' + after.Required_HC + ')', 'VACANCY', v.Vacancy_ID, true);
  return { vacancy: after, fill: fill };
}

/** Undo a wrong fill record (HR managers). Reverses Joined HC and Occupied HC. p = { Fill_ID, reason } */
function vacancyFillVoid_(ctx, p) {
  var f = get_('VACANCY_FILLS', p.Fill_ID);
  if (!f || f.Status !== 'Active') throw userError_('السجل غير موجود أو اتلغى قبل كده.');
  var reason = str_(p.reason);
  if (reason.length < 3) throw userError_('اكتب سبب الإلغاء.');
  var v = get_('VACANCIES', f.Vacancy_ID);
  if (['CANCELLED', 'CLOSED'].indexOf(v.Status) >= 0) throw userError_('الشاغر مقفول — مينفعش تعديل التعيينات عليه.');
  var label = 'إلغاء تسجيل ' + FILL_METHOD_AR_[f.Method] + ' — ' + f.Employee_Name + ': ' + reason;
  var after;
  withLock_(function () {
    update_('VACANCY_FILLS', f.Fill_ID, { Status: 'Voided', Voided_By: ctx.user.User_ID, Voided_At: nowIso_(), Void_Reason: reason }, ctx.user.User_ID);
    var nj = Math.max(0, num_(v.Joined_HC, 0) - 1);
    after = update_('VACANCIES', v.Vacancy_ID, { Joined_HC: String(nj), Status: fillStatus_(v, nj), Closed_At: '', Close_Reason: '' }, ctx.user.User_ID).after;
    requestCloseCheck_(ctx, v.Request_ID);
    if (occFromEmployees_()) empFillVoid_(ctx, f, v, reason);
    else {
      adjustOccupied_(ctx, v.Position_ID, -1, label);
      if (f.Source_Position_ID) adjustOccupied_(ctx, f.Source_Position_ID, +1, label);
    }
  });
  if (occFromEmployees_()) recountOccupied_([v.Position_ID].concat(f.Source_Position_ID ? [f.Source_Position_ID] : []), ctx.user.User_ID);
  event_(ctx, 'VACANCY', v.Vacancy_ID, 'FILL_VOIDED', reason, { name: f.Employee_Name });
  audit_(ctx, { entityType: 'VACANCY', entityId: v.Vacancy_ID, action: 'FILL_VOID', oldValue: f.Fill_ID, reason: reason });
  return after;
}
