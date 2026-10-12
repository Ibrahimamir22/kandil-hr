/**
 * RequestChanges.gs — v0.28.0 (REQ-011): changing a recruitment request after its final approval.
 *
 * Owner decision: only a HEADCOUNT INCREASE goes back to approval. Everything else — the required-by date, the
 * job specification, the priority, the employment type / work model / shifts, the branch of a branch line and a
 * headcount DECREASE — is recorded by HR (HR_ADMIN_ROLES) with a reason, applied at once to the request and its
 * vacancies, and kept as an amendment row in REQUEST_VERSIONS (the approved version number itself never moves,
 * so the approval chain of the request stays readable).
 *
 * An increase opens a linked supplementary request (Parent_Request_ID) for the extra number only. It runs the
 * normal chain — line managers, HR, the HC exception when the structure has no room, CEO / board when the rules
 * say so. On its final approval the extra number is added to the same vacancy (REQUEST_LINES.Topup_Vacancy_ID);
 * if that vacancy closed meanwhile, a new vacancy is opened as for any request. The requester (or HR) asks for it.
 */

var REQ_CHANGE_FIELDS_ = ['Required_By_Date', 'Requested_Priority', 'Employment_Type', 'Work_Model', 'Shift_Pattern', 'Education',
  'Specialization', 'Experience_Years', 'Experience_Context', 'Duties', 'Working_Conditions', 'Notes'];

/** Open vacancies of an approved request, by line. */
function reqOpenVacancies_(id) {
  var m = {};
  where_('VACANCIES', function (v) { return v.Request_ID === id && VAC_OPEN_.indexOf(v.Status) >= 0; }).forEach(function (v) { m[v.Line_ID] = v; });
  return m;
}

/** Candidates already committed on a vacancy (joined, or accepted an offer and waiting to join). */
function vacCommitted_(v) {
  var accepted = where_('APPLICATIONS', function (a) { return a.Vacancy_ID === v.Vacancy_ID && a.Stage === 'ACCEPTED'; }).length;
  return num_(v.Joined_HC, 0) + accepted;
}

/** What the change screen needs. */
function requestChangeInfo_(ctx, id) {
  var req = get_('RECRUITMENT_REQUESTS', id);
  if (!req || req.Status !== 'APPROVED') return null;
  var hr = hasAnyRole_(ctx, HR_ADMIN_ROLES), mine = req.Requester_User_ID === ctx.user.User_ID;
  var open = reqOpenVacancies_(id);
  if (!Object.keys(open).length || (!hr && !mine)) return null;
  var locs = {}; all_('LOCATIONS').forEach(function (l) { locs[l.Location_ID] = l; });
  return {
    minor: hr,                                   // HR records every change except an increase
    increase: hr || mine,                        // the requester (or HR) may ask for more
    branches: all_('LOCATIONS').filter(function (l) { return l.Location_Type === 'SHOWROOM' && l.Status !== 'Inactive'; })
      .map(function (l) { return { id: l.Location_ID, name: l.Name_AR }; }),
    lines: reqChildren_('REQUEST_LINES', id).filter(function (l) { return open[l.Line_ID]; }).map(function (l) {
      var v = open[l.Line_ID], pos = get_('POSITIONS', l.Position_ID) || {}, pl = locs[pos.Location_ID] || {};
      return { Line_ID: l.Line_ID, Vacancy_ID: v.Vacancy_ID, hc: num_(v.Required_HC, 0), min: Math.max(1, vacCommitted_(v)),
        Location_ID: v.Location_ID, locationName: (locs[v.Location_ID] || {}).Name_AR || '', branch: pl.Location_Type === 'BRANCH_GROUP' };
    }),
    pendingIncrease: where_('RECRUITMENT_REQUESTS', function (r) { return r.Parent_Request_ID === id && REQ_OPEN_.concat(['DRAFT', 'RETURNED']).indexOf(r.Status) >= 0; })
      .map(function (r) { return r.Request_ID; })
  };
}

/**
 * p = { Request_ID, fields: { Required_By_Date, … }, lines: [{ Line_ID, HC, Location_ID }], reason }
 * → { applied: [changed field names], increase: { Request_ID, Status } | null }
 */
function requestChange_(ctx, p) {
  var id = str_(p.Request_ID), req = get_('RECRUITMENT_REQUESTS', id);
  if (!req) throw userError_('الطلب غير موجود.');
  if (req.Status !== 'APPROVED') throw userError_('التعديل ده للطلبات المعتمدة بس — قبل الاعتماد الطلب بيرجع لصاحبه للتعديل.');
  var info = requestChangeInfo_(ctx, id);
  if (!info) throw userError_('مفيش شاغر مفتوح على الطلب ده، أو مالكش صلاحية تعدّله.');
  var reason = str_(p.reason);
  if (reason.length < 5) throw userError_('اكتب سبب التعديل (5 حروف على الأقل).');
  var opts = reqOptions_(), me = ctx.user.User_ID;

  // ---- request fields (HR only)
  var patch = {}, changedF = [];
  var fin = p.fields || {};
  REQ_CHANGE_FIELDS_.forEach(function (f) {
    if (fin[f] === undefined) return;
    var v = str_(fin[f]);
    if (v === str_(req[f])) return;
    patch[f] = v; changedF.push(f);
  });
  if (changedF.length && !info.minor) throw userError_('تعديل بيانات الطلب بعد الاعتماد بيسجله HR. تقدر تطلب زيادة العدد بس.');
  checkOpt_(patch.Employment_Type, opts.employmentTypes, 'نوع التوظيف');
  checkOpt_(patch.Work_Model, opts.workModels, 'نمط العمل');
  checkOpt_(patch.Shift_Pattern, opts.shifts, 'الورديات');
  checkOpt_(patch.Requested_Priority, opts.priorities, 'الأولوية');
  if (patch.Required_By_Date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.Required_By_Date)) throw userError_('تاريخ الاحتياج غير صحيح.');
    if (patch.Required_By_Date < today_()) throw userError_('تاريخ الاحتياج لازم يكون النهارده أو بعد كده.');
  }
  if (patch.Experience_Years && !/^\d{1,2}$/.test(patch.Experience_Years)) throw userError_('سنوات الخبرة لازم تكون رقم.');
  if (patch.Requested_Priority === 'CRITICAL' && !str_(req.Priority_Reason)) patch.Priority_Reason = reason;

  // ---- lines: decrease / branch now (HR), increase → supplementary request
  var byLine = {}; info.lines.forEach(function (l) { byLine[l.Line_ID] = l; });
  var lineOps = [], ups = [];
  (p.lines || []).forEach(function (q) {
    var l = byLine[str_(q.Line_ID)];
    if (!l) throw userError_('السطر ' + str_(q.Line_ID) + ' مالوش شاغر مفتوح.');
    var hcS = str_(q.HC), hc = hcS === '' ? l.hc : Number(hcS);
    if (!/^\d+$/.test(String(hc)) || hc < 1 || hc > 999) throw userError_('العدد لازم يكون رقم من 1 لـ 999.');
    var loc = str_(q.Location_ID) || l.Location_ID;
    if (loc !== l.Location_ID) {
      if (!l.branch) throw userError_('موقع الوظيفة دي ثابت من الهيكل — تغيير الموقع بيكون بنقل الوظيفة في الهيكل.');
      if (!info.branches.some(function (b) { return b.id === loc; })) throw userError_('اختار فرع صحيح.');
    }
    if (hc < l.hc) {
      if (hc < l.min) throw userError_('شاغر ' + l.Vacancy_ID + ': فيه ' + l.min + ' اتعينوا أو قبلوا العرض — العدد مايقلش عن كده.');
    }
    if (hc > l.hc) ups.push({ l: l, add: hc - l.hc, loc: loc });
    if (hc < l.hc || loc !== l.Location_ID) lineOps.push({ l: l, hc: Math.min(hc, l.hc), loc: loc });
  });
  if (lineOps.length && !info.minor) throw userError_('تقليل العدد أو تغيير الفرع بعد الاعتماد بيسجله HR.');
  if (ups.length && !info.increase) throw userError_('زيادة العدد يطلبها صاحب الطلب أو HR.');
  if (ups.length && info.pendingIncrease.length) throw userError_('فيه طلب زيادة عدد لسه تحت الاعتماد (' + info.pendingIncrease.join('، ') + ') — استنى قراره الأول.');
  if (!changedF.length && !lineOps.length && !ups.length) throw userError_('مفيش تغيير.');

  var res = { applied: [], increase: null };
  // ---- minor changes: applied now
  if (changedF.length || lineOps.length) {
    withLock_(function () {
      if (changedF.length || patch.Priority_Reason) {
        var r = update_('RECRUITMENT_REQUESTS', id, patch, me);
        auditDiff_(ctx, 'REQUEST', id, r.before, r.after, 'تعديل بعد الاعتماد: ' + reason);
      }
      lineOps.forEach(function (o) {
        var lp = {}, vp = {};
        if (o.hc !== o.l.hc) {
          lp.Approved_HC = String(o.hc); vp.Required_HC = String(o.hc);
          // v0.40.0 (VAC-002): cut down to those already hired → the vacancy is filled (and the request may close)
          var cv = get_('VACANCIES', o.l.Vacancy_ID), joined = num_(cv.Joined_HC, 0);
          if (joined >= o.hc && !vacPaused_(cv.Status)) { vp.Status = 'FILLED'; vp.Closed_At = nowIso_(); vp.Close_Reason = 'اكتمل العدد بعد تعديل الطلب'; }
        }
        if (o.loc !== o.l.Location_ID) { lp.Location_ID = o.loc; vp.Location_ID = o.loc; }
        update_('REQUEST_LINES', o.l.Line_ID, lp, me);
        var rv = update_('VACANCIES', o.l.Vacancy_ID, vp, me);
        auditDiff_(ctx, 'VACANCY', o.l.Vacancy_ID, rv.before, rv.after, 'تعديل الطلب ' + id + ' بعد الاعتماد: ' + reason);
      });
      if (lineOps.length) requestCloseCheck_(ctx, id);
      if (patch.Required_By_Date) Object.keys(reqOpenVacancies_(id)).forEach(function (lid) {
        var v = reqOpenVacancies_(id)[lid];
        update_('VACANCIES', v.Vacancy_ID, { Required_By_Date: patch.Required_By_Date }, me);
      });
      var n = where_('REQUEST_VERSIONS', function (x) { return x.Request_ID === id && str_(x.Version).indexOf(req.Version + '.') === 0; }).length + 1;
      insert_('REQUEST_VERSIONS', { Version_ID: nextId_('REQ_VERSION'), Request_ID: id, Version: req.Version + '.' + n,
        Snapshot_JSON: JSON.stringify(requestSnapshot_(id)), Reason: 'تعديل بعد الاعتماد: ' + reason }, me);
    });
    res.applied = changedF.concat(lineOps.map(function (o) { return o.l.Vacancy_ID; }));
    event_(ctx, 'REQUEST', id, 'CHANGED_AFTER_APPROVAL', reason, {
      fields: changedF, lines: lineOps.map(function (o) { return { vacancy: o.l.Vacancy_ID, hc: o.hc !== o.l.hc ? o.l.hc + ' ← ' + o.hc : '', branch: o.loc !== o.l.Location_ID }; })
    });
    lineOps.forEach(function (o) { event_(ctx, 'VACANCY', o.l.Vacancy_ID, 'REQUEST_CHANGED', reason, { request: id, hc: o.hc, from: o.l.hc }); });
    var tell = [req.Requester_User_ID];
    Object.keys(reqOpenVacancies_(id)).forEach(function (lid) { var v = reqOpenVacancies_(id)[lid]; if (v.Lead_Recruiter_ID) tell.push(v.Lead_Recruiter_ID); });
    notify_(tell.filter(function (u, i, a) { return u && u !== me && a.indexOf(u) === i; }), 'تعديل على طلب توظيف معتمد',
      id + ' — ' + reqTitle_(req) + ': ' + reason, 'REQUEST', id, true);
  }

  // ---- increase: a linked request through the normal approval chain
  if (ups.length) res.increase = requestIncrease_(ctx, req, ups, reason);
  return res;
}

function requestIncrease_(ctx, req, ups, reason) {
  var me = ctx.user.User_ID, id = req.Request_ID, nid;
  var fields = {};
  REQ_TEXT_FIELDS_.forEach(function (f) { fields[f] = str_(req[f]); });
  if (fields.Recruitment_Type === 'REPLACEMENT') fields.Recruitment_Type = 'VACANT';   // the extra number replaces nobody
  if (!fields.Required_By_Date || fields.Required_By_Date < today_()) fields.Required_By_Date = addDaysYmd_(today_(), 30);
  fields.Justification = ('زيادة العدد على الطلب المعتمد ' + id + ': ' + reason);
  fields.Exception_Justification = fields.Exception_Justification || ('زيادة العدد على الطلب المعتمد ' + id + ': ' + reason);
  withLock_(function () {
    nid = nextId_('REQUEST');
    insert_('RECRUITMENT_REQUESTS', Object.assign(fields, { Request_ID: nid, Version: '0', Status: 'DRAFT', Requester_User_ID: req.Requester_User_ID,
      Requester_Position_ID: req.Requester_Position_ID, Org_Unit_ID: req.Org_Unit_ID, Job_Code: req.Job_Code, HC_Exception: 'N',
      HR_Classification: '', Parent_Request_ID: id }), me);
    var ids = nextIds_('REQ_LINE', ups.length);
    insertMany_('REQUEST_LINES', ups.map(function (u, i) {
      return { Line_ID: ids[i], Request_ID: nid, Position_ID: get_('REQUEST_LINES', u.l.Line_ID).Position_ID, Location_ID: u.loc,
        Requested_HC: String(u.add), Approved_HC: '', Structural_HC_At_Submit: '', Occupied_HC_At_Submit: '', Open_HC_At_Submit: '',
        Available_HC_At_Submit: '', Vacancy_ID: '', Status: 'Active', Topup_Vacancy_ID: u.l.Vacancy_ID };
    }), me);
    reqChildren_('REQUEST_SKILLS', id).forEach(function (s) {
      insert_('REQUEST_SKILLS', { Skill_ID: nextId_('SKILL'), Request_ID: nid, Skill: s.Skill, Proficiency: s.Proficiency, Importance: s.Importance, Status: 'Active' }, me);
    });
  });
  event_(ctx, 'REQUEST', nid, 'CREATED', reason, { parent: id });
  event_(ctx, 'REQUEST', id, 'INCREASE_REQUESTED', reason, { request: nid, lines: ups.map(function (u) { return { vacancy: u.l.Vacancy_ID, add: u.add }; }) });
  audit_(ctx, { entityType: 'REQUEST', entityId: id, action: 'INCREASE_REQUESTED', newValue: nid, reason: reason });
  var out = requestSubmitSaved_(ctx, {}, nid);
  return { Request_ID: nid, Status: out.Status, exception: out.exception };
}

/** finalizeRequest_ hook: a line of a supplementary request adds to its vacancy while that vacancy is still open. */
function topupVacancy_(ctx, l) {
  var vid = str_(l.Topup_Vacancy_ID);
  if (!vid) return null;
  var v = get_('VACANCIES', vid);
  if (!v || VAC_OPEN_.indexOf(v.Status) < 0) return null;
  var add = num_(l.Approved_HC || l.Requested_HC, 0), hc = num_(v.Required_HC, 0) + add;
  var patch = { Required_HC: String(hc) };
  update_('VACANCIES', vid, patch, ctx.user.User_ID);
  update_('REQUEST_LINES', l.Line_ID, { Vacancy_ID: vid, Status: 'Approved' }, ctx.user.User_ID);
  var parent = get_('RECRUITMENT_REQUESTS', v.Request_ID);
  if (parent) {
    var pl = get_('REQUEST_LINES', v.Line_ID);
    if (pl) update_('REQUEST_LINES', pl.Line_ID, { Approved_HC: String(num_(pl.Approved_HC || pl.Requested_HC, 0) + add) }, ctx.user.User_ID);
  }
  return { vacancy: vid, add: add, hc: hc };
}
