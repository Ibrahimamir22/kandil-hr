/**
 * Requests.gs — recruitment requests (form HR-REC-F02): draft → submit → approval chain → vacancies.
 *
 * Status:  DRAFT → IN_APPROVAL (line managers) → HR_REVIEW → [PENDING_CEO] → APPROVED
 *          any open status → RETURNED (edit & resubmit = new version) · REJECTED · CANCELLED
 * One request = one job. Lines = positions of that job (one line per location) → one vacancy per line.
 */

var REQ_OPEN_ = ['IN_APPROVAL', 'HR_REVIEW', 'PENDING_CEO', 'PENDING_BOARD'];
var VAC_OPEN_ = ['APPROVED', 'PREPARATION', 'OPEN', 'ON_HOLD', 'PARTIALLY_FILLED', 'FROZEN'];
/** v0.41.0 (CHG-86): a paused vacancy — on hold (recruitment manager) or frozen (a management hiring freeze, HR managers). */
function vacPaused_(st) { return st === 'ON_HOLD' || st === 'FROZEN'; }

/** Option lists shared with the UI (lazy — see Api.gs note on load order). */
function reqOptions_() {
  return {
    recruitmentTypes: [
      { code: 'REPLACEMENT', name: 'بديل لموظف ترك العمل / انتقل' },
      { code: 'VACANT', name: 'شاغر ضمن الهيكل المعتمد' },
      { code: 'ADDITIONAL', name: 'زيادة عدد عن الهيكل (استثناء)' },
      { code: 'TEMPORARY', name: 'احتياج مؤقت / موسمي' }
    ],
    employmentTypes: [
      { code: 'FULL_TIME', name: 'دوام كامل' }, { code: 'PART_TIME', name: 'دوام جزئي' },
      { code: 'CONTRACT', name: 'عقد محدد المدة' }, { code: 'TEMPORARY', name: 'مؤقت / موسمي' },
      { code: 'INTERNSHIP', name: 'تدريب' }, { code: 'DAILY', name: 'يومية' }
    ],
    workModels: [
      { code: 'ON_SITE', name: 'من الموقع' }, { code: 'FIELD', name: 'ميداني' },
      { code: 'HYBRID', name: 'مختلط' }, { code: 'REMOTE', name: 'عن بعد' }
    ],
    shifts: [
      { code: 'FIXED', name: 'وردية ثابتة' }, { code: 'ROTATING', name: 'ورديات متغيرة' },
      { code: 'NIGHT', name: 'وردية ليلية' }, { code: 'FLEXIBLE', name: 'مرن' }
    ],
    reasonCategories: [
      { code: 'RESIGNATION', name: 'استقالة' }, { code: 'TERMINATION', name: 'إنهاء خدمة' },
      { code: 'TRANSFER', name: 'نقل / ترقية' }, { code: 'RETIREMENT', name: 'معاش / وفاة' },
      { code: 'WORKLOAD', name: 'زيادة حجم العمل' }, { code: 'NEW_ACTIVITY', name: 'نشاط / مشروع جديد' },
      { code: 'EXPANSION', name: 'توسع' }, { code: 'OTHER', name: 'أخرى' }
    ],
    priorities: [
      { code: 'NORMAL', name: 'عادي' }, { code: 'IMPORTANT', name: 'مهم' }, { code: 'CRITICAL', name: 'حرج' }
    ],
    proficiency: [
      { code: 'BASIC', name: 'أساسي' }, { code: 'GOOD', name: 'جيد' },
      { code: 'ADVANCED', name: 'متقدم' }, { code: 'EXPERT', name: 'خبير' }
    ],
    importance: [ { code: 'ESSENTIAL', name: 'أساسية' }, { code: 'PREFERRED', name: 'مفضلة' } ],
    // all items (stopped ones still name old records); the screens offer only the active ones, in list order
    reasons: all_('REASON_MASTER').sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); })
      .map(function (r) { return { process: r.Process, code: r.Code, name: r.Label_AR, note: r.Requires_Note === 'Y', active: r.Status === 'Active' }; })
  };
}

function optCodes_(list) { return list.map(function (o) { return o.code; }); }
function isRecRole_(ctx) {
  return hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.HR_STAFF, ROLE.REC_MANAGER,
    ROLE.REC_SUPERVISOR, ROLE.RECRUITER, ROLE.CEO, ROLE.BOARD, ROLE.VIEWER]);
}

/* ---------------- HC figures ---------------- */

/** Open HC per position = Σ(Required − Joined) of vacancies still being worked. */
/**
 * Open HC per position (approved, still to fill) and — v0.40.0 (HC-005) — the HC held by requests still under approval
 * (map._r), so two requests for the same position never both see the same free place. exceptRequestId leaves a
 * request's own lines out (when it looks at itself).
 */
function openHcByPosition_(exceptRequestId) {
  var m = {}, r = {};
  where_('VACANCIES', function (v) { return VAC_OPEN_.indexOf(v.Status) >= 0; }).forEach(function (v) {
    m[v.Position_ID] = (m[v.Position_ID] || 0) + Math.max(0, num_(v.Required_HC, 0) - num_(v.Joined_HC, 0));
  });
  var pending = {};
  where_('RECRUITMENT_REQUESTS', function (q) { return REQ_OPEN_.indexOf(q.Status) >= 0 && q.Request_ID !== exceptRequestId; }).forEach(function (q) { pending[q.Request_ID] = 1; });
  if (Object.keys(pending).length) all_('REQUEST_LINES').forEach(function (l) {
    if (!pending[l.Request_ID]) return;
    r[l.Position_ID] = (r[l.Position_ID] || 0) + num_(str_(l.Approved_HC) !== '' ? l.Approved_HC : l.Requested_HC, 0);
  });
  m._r = r;
  return m;
}

function hcOf_(pos, openMap) {
  var s = num_(pos.Structural_HC, 0), o = num_(pos.Occupied_HC, 0), op = openMap[pos.Position_ID] || 0, rs = (openMap._r || {})[pos.Position_ID] || 0;
  return { structural: s, occupied: o, open: op, reserved: rs, available: s - o - op - rs };
}

/** Units the user may raise requests for: headed units + below; HR admins → everything. */
function requestScopeUnits_(ctx) {
  if (hasAnyRole_(ctx, HR_ADMIN_ROLES)) return null;
  return managedScope_(ctx.user);
}

/** Positions the user can request for, with HC figures. p = { q, unitId } */
function reqScopePositions_(ctx, p) {
  p = p || {};
  var ver = activeVersion_();
  var scope = requestScopeUnits_(ctx);
  var openMap = openHcByPosition_();
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j; });
  var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u; });
  var locs = {}, locType = {}; all_('LOCATIONS').forEach(function (l) { locs[l.Location_ID] = l.Name_AR; locType[l.Location_ID] = l.Location_Type; });
  var q = norm_(p.q);
  var jdv = {}; find_('JOB_DESCRIPTIONS', { Status: 'Approved' }).forEach(function (d) { jdv[d.Job_Code] = d.Version; });
  var rows = where_('POSITIONS', function (x) {
    if (x.Org_Version_ID !== ver || x.Status === 'Closed') return false;
    if (scope && scope.indexOf(x.Org_Unit_ID) < 0) return false;
    if (str_(p.unitId) && x.Org_Unit_ID !== p.unitId) return false;
    if (q) {
      var j = jobs[x.Job_Code] || {};
      var hay = norm_([x.Position_ID, x.Job_Code, x.Position_Title, j.Job_Title_AR, (units[x.Org_Unit_ID] || {}).Name_AR].join(' '));
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }).slice(0, 400).map(function (x) {
    var j = jobs[x.Job_Code] || {};
    var hc = hcOf_(x, openMap);
    return { Position_ID: x.Position_ID, Job_Code: x.Job_Code, title: x.Position_Title || j.Job_Title_AR || x.Job_Code,
      grade: j.Grade_Code || '', Org_Unit_ID: x.Org_Unit_ID, unitName: (units[x.Org_Unit_ID] || {}).Name_AR || '',
      Location_ID: x.Location_ID, locationName: locs[x.Location_ID] || '', branchGroup: locType[x.Location_ID] === 'BRANCH_GROUP',
      structural: hc.structural, occupied: hc.occupied, open: hc.open, available: hc.available, jd: jdv[x.Job_Code] || '' };
  });
  return { canRequest: scope === null || scope.length > 0, rows: rows };
}

/* ---------------- read helpers ---------------- */

function reqChildren_(table, requestId) {
  return where_(table, function (r) { return r.Request_ID === requestId && r.Status !== 'Deleted'; });
}

function reqTitle_(req) {
  var job = get_('JOBS', req.Job_Code);
  return job ? job.Job_Title_AR : (req.Job_Code || 'طلب توظيف');
}

function statusFromStep_(step, prefix) {
  if (!step) return 'APPROVED';
  if (step.Step_Type === 'HR' || step.Step_Type === 'HC_EXC') return 'HR_REVIEW';
  if (step.Step_Type === 'CEO') return 'PENDING_CEO';
  if (step.Step_Type === 'BOARD') return 'PENDING_BOARD';
  return 'IN_APPROVAL';
}

/** Who may see a request. */
function canViewRequest_(ctx, req) {
  var me = ctx.user.User_ID;
  if (req.Requester_User_ID === me) return true;
  if (isRecRole_(ctx)) return true;
  var scope = managedScope_(ctx.user);
  if (scope.indexOf(req.Org_Unit_ID) >= 0) return true;
  return where_('APPROVAL_INSTANCES', function (a) {
    return a.Entity_Type === 'REQUEST' && a.Entity_ID === req.Request_ID &&
      (a.Decision_By === me || (a.Status === 'PENDING' && eligibleUsers_(a.Authority, req.Requester_User_ID).indexOf(me) >= 0));
  }).length > 0;
}

/* ---------------- save (draft) ---------------- */

var REQ_TEXT_FIELDS_ = ['Recruitment_Type', 'Required_By_Date', 'Employment_Type', 'Work_Model', 'Shift_Pattern',
  'Reason_Category', 'Justification', 'Requested_Priority', 'Priority_Reason', 'Education', 'Specialization',
  'Experience_Years', 'Experience_Context', 'Duties', 'Working_Conditions', 'Notes', 'Exception_Justification'];

/**
 * Create or update a draft (DRAFT or RETURNED, requester only).
 * p = { Request_ID?, <REQ_TEXT_FIELDS_>, lines:[{Position_ID, Requested_HC}], replacements:[…], skills:[…] }
 */
function requestSave_(ctx, p) {
  var opts = reqOptions_();
  var scope = requestScopeUnits_(ctx);
  if (scope && !scope.length) throw userError_('طلبات التوظيف بيرفعها مديرين الوحدات. حسابك مش مربوط بوظيفة مدير — كلم HR.');

  var lines = (p.lines || []).filter(function (l) { return str_(l.Position_ID); });
  var jobCode = '', unitId = '', seen = {};
  lines.forEach(function (l) {
    var pos = get_('POSITIONS', l.Position_ID);
    if (!pos || pos.Status === 'Closed') throw userError_('الوظيفة ' + l.Position_ID + ' غير موجودة.');
    if (scope && scope.indexOf(pos.Org_Unit_ID) < 0) throw userError_('الوظيفة ' + l.Position_ID + ' خارج نطاق إدارتك.');
    if (jobCode && pos.Job_Code !== jobCode) throw userError_('الطلب الواحد لوظيفة واحدة. اعمل طلب منفصل لكل وظيفة.');
    // positions under «الفروع» (BRANCH_GROUP) are requested for one specific branch per line
    var ploc = get_('LOCATIONS', pos.Location_ID) || {};
    if (ploc.Location_Type === 'BRANCH_GROUP') {
      var br = get_('LOCATIONS', str_(l.Location_ID));
      if (!br || br.Location_Type !== 'SHOWROOM' || br.Status === 'Inactive') throw userError_('اختار الفرع لكل سطر من وظايف الفروع.');
      l.Location_ID = br.Location_ID;
    } else l.Location_ID = pos.Location_ID;
    var key = pos.Position_ID + '|' + l.Location_ID;
    if (seen[key]) throw userError_('نفس الوظيفة/الموقع مكرر في الطلب.');
    seen[key] = 1;
    jobCode = pos.Job_Code;
    if (!unitId) unitId = pos.Org_Unit_ID;
    var hc = str_(l.Requested_HC);
    if (!/^\d+$/.test(hc) || Number(hc) < 1 || Number(hc) > 999) throw userError_('العدد المطلوب لازم يكون رقم من 1 لـ 999.');
  });

  var fields = {};
  REQ_TEXT_FIELDS_.forEach(function (f) { if (p[f] !== undefined) fields[f] = str_(p[f]); });
  checkOpt_(fields.Recruitment_Type, opts.recruitmentTypes, 'نوع التعيين');
  checkOpt_(fields.Employment_Type, opts.employmentTypes, 'نوع التوظيف');
  checkOpt_(fields.Work_Model, opts.workModels, 'نمط العمل');
  checkOpt_(fields.Shift_Pattern, opts.shifts, 'الورديات');
  checkOpt_(fields.Reason_Category, opts.reasonCategories, 'سبب الاحتياج');
  checkOpt_(fields.Requested_Priority, opts.priorities, 'الأولوية');
  if (fields.Required_By_Date && !/^\d{4}-\d{2}-\d{2}$/.test(fields.Required_By_Date)) throw userError_('تاريخ الاحتياج غير صحيح.');
  if (fields.Experience_Years && !/^\d{1,2}$/.test(fields.Experience_Years)) throw userError_('سنوات الخبرة لازم تكون رقم.');
  if (jobCode) { fields.Job_Code = jobCode; fields.Org_Unit_ID = unitId; }

  var reps = (p.replacements || []).filter(function (r) { return str_(r.Employee_Name) || str_(r.Employee_ID); });
  var skills = (p.skills || []).filter(function (s) { return str_(s.Skill); });
  skills.forEach(function (s) {
    checkOpt_(str_(s.Proficiency), opts.proficiency, 'مستوى المهارة');
    checkOpt_(str_(s.Importance), opts.importance, 'أهمية المهارة');
  });

  return withLock_(function () {
    var req, id = str_(p.Request_ID);
    if (id) {
      req = get_('RECRUITMENT_REQUESTS', id);
      if (!req) throw userError_('الطلب غير موجود.');
      if (req.Requester_User_ID !== ctx.user.User_ID) throw userError_('التعديل لصاحب الطلب بس.');
      if (['DRAFT', 'RETURNED'].indexOf(req.Status) < 0) throw userError_('الطلب مش قابل للتعديل في حالته الحالية.');
      req = update_('RECRUITMENT_REQUESTS', id, fields, ctx.user.User_ID).after;
      ['REQUEST_LINES', 'REQUEST_REPLACEMENTS', 'REQUEST_SKILLS'].forEach(function (t) {
        reqChildren_(t, id).forEach(function (r) { update_(t, r[SCHEMA[t].key], { Status: 'Deleted' }, ctx.user.User_ID); });
      });
    } else {
      fields.Request_ID = nextId_('REQUEST');
      fields.Version = '0';
      fields.Status = 'DRAFT';
      fields.Requester_User_ID = ctx.user.User_ID;
      fields.Requester_Position_ID = ctx.user.Position_ID || '';
      fields.HC_Exception = 'N';
      req = insert_('RECRUITMENT_REQUESTS', fields, ctx.user.User_ID);
      id = req.Request_ID;
      event_(ctx, 'REQUEST', id, 'CREATED', '', null);
    }
    if (lines.length) {
      var lIds = nextIds_('REQ_LINE', lines.length);
      insertMany_('REQUEST_LINES', lines.map(function (l, i) {
        return { Line_ID: lIds[i], Request_ID: id, Position_ID: l.Position_ID, Location_ID: l.Location_ID,
          Requested_HC: str_(l.Requested_HC), Approved_HC: '', Structural_HC_At_Submit: '', Occupied_HC_At_Submit: '',
          Open_HC_At_Submit: '', Available_HC_At_Submit: '', Vacancy_ID: '', Status: 'Active' };
      }), ctx.user.User_ID);
    }
    if (reps.length) {
      var rIds = nextIds_('REPLACEMENT', reps.length);
      insertMany_('REQUEST_REPLACEMENTS', reps.map(function (r, i) {
        return { Replacement_ID: rIds[i], Request_ID: id, Employee_Name: str_(r.Employee_Name), Employee_ID: str_(r.Employee_ID),
          Position_Title: str_(r.Position_Title), Last_Working_Date: str_(r.Last_Working_Date), Reason: str_(r.Reason), Status: 'Active' };
      }), ctx.user.User_ID);
    }
    if (skills.length) {
      var sIds = nextIds_('SKILL', skills.length);
      insertMany_('REQUEST_SKILLS', skills.map(function (s, i) {
        return { Skill_ID: sIds[i], Request_ID: id, Skill: str_(s.Skill), Proficiency: str_(s.Proficiency),
          Importance: str_(s.Importance) || 'ESSENTIAL', Status: 'Active' };
      }), ctx.user.User_ID);
    }
    return { Request_ID: id, Status: req.Status };
  });
}

function checkOpt_(val, list, label) {
  if (val && optCodes_(list).indexOf(val) < 0) throw userError_('قيمة غير صحيحة في: ' + label);
}

/* ---------------- submit ---------------- */

/** Save then submit. Builds the approval chain for a new version. */
function requestSubmit_(ctx, p) {
  var saved = requestSave_(ctx, p);
  try { return requestSubmitSaved_(ctx, p, saved.Request_ID); }
  catch (e) { e.data = { Request_ID: saved.Request_ID }; throw e; }   // the screen keeps the draft — no copies
}
function requestSubmitSaved_(ctx, p, id) {
  var req = get_('RECRUITMENT_REQUESTS', id);
  var lines = reqChildren_('REQUEST_LINES', id);
  var reps = reqChildren_('REQUEST_REPLACEMENTS', id);

  var miss = [];
  if (!lines.length) miss.push('وظيفة واحدة على الأقل مع العدد');
  if (!req.Recruitment_Type) miss.push('نوع التعيين');
  if (!req.Employment_Type) miss.push('نوع التوظيف');
  if (!req.Required_By_Date) miss.push('تاريخ الاحتياج');
  if (!req.Reason_Category) miss.push('سبب الاحتياج');
  if (str_(req.Justification).length < 10) miss.push('مبرر الاحتياج (10 حروف على الأقل)');
  if (req.Recruitment_Type === 'REPLACEMENT' && !reps.length) miss.push('بيانات الموظف اللي هيتم استبداله');
  if (req.Requested_Priority === 'CRITICAL' && str_(req.Priority_Reason).length < 5) miss.push('سبب الأولوية الحرجة');
  if (miss.length) throw userError_('ناقص: ' + miss.join('، '));
  if (req.Required_By_Date < today_()) throw userError_('تاريخ الاحتياج لازم يكون النهارده أو بعد كده.');

  var openMap = openHcByPosition_();
  var exception = false, snaps = [];
  lines.forEach(function (l) {
    var pos = get_('POSITIONS', l.Position_ID);
    var hc = hcOf_(pos, openMap);
    if (num_(l.Requested_HC, 0) > hc.available) exception = true;
    snaps.push({ l: l, hc: hc });
  });
  if (exception) {
    if (str_(cfg_('HC_ENFORCEMENT_MODE', 'WARN')) === 'BLOCK')
      throw userError_('العدد المطلوب أكبر من المتاح في الهيكل، والنظام مضبوط على منع الاستثناءات. كلم HR.');
    if (str_(req.Exception_Justification).length < 10)
      throw userError_('العدد المطلوب أكبر من المتاح في الهيكل — اكتب مبرر الاستثناء (10 حروف على الأقل).');
  }

  var version = num_(req.Version, 0) + 1;
  var steps = requestChain_(req, lines, exception);

  withLock_(function () {
    snaps.forEach(function (s) {
      update_('REQUEST_LINES', s.l.Line_ID, { Structural_HC_At_Submit: String(s.hc.structural), Occupied_HC_At_Submit: String(s.hc.occupied),
        Open_HC_At_Submit: String(s.hc.open), Available_HC_At_Submit: String(s.hc.available), Approved_HC: '' }, ctx.user.User_ID);
    });
    var jdA = req.Job_Code ? jdApproved_(req.Job_Code) : null;
    update_('RECRUITMENT_REQUESTS', id, { Version: String(version), HC_Exception: exception ? 'Y' : 'N', Submitted_At: nowIso_(), JD_Version: jdA ? jdA.Version : '',
      Decided_At: '', Status: 'IN_APPROVAL' }, ctx.user.User_ID);
    insert_('REQUEST_VERSIONS', { Version_ID: nextId_('REQ_VERSION'), Request_ID: id, Version: String(version),
      Snapshot_JSON: JSON.stringify(requestSnapshot_(id)), Reason: version > 1 ? 'إعادة إرسال بعد التعديل' : 'إرسال' }, ctx.user.User_ID);
    writeChain_('REQUEST', id, version, steps, ctx.user.User_ID);
  });
  event_(ctx, 'REQUEST', id, version > 1 ? 'RESUBMITTED' : 'SUBMITTED', '', { version: version, exception: exception });
  audit_(ctx, { entityType: 'REQUEST', entityId: id, action: 'SUBMIT', newValue: 'v' + version });

  var title = reqTitle_(req);
  if (steps.some(function (s) { return s.selfApprove; })) {
    // HR Sector Manager's own request: his submission is the HR approval (classification = his requested priority)
    var hrStep = chainOf_('REQUEST', id, version).filter(function (a) { return a.Step_Type === 'HR' && a.Status === 'WAITING'; })[0];
    var snap = applyHrReview_(ctx, get_('RECRUITMENT_REQUESTS', id), { HR_Classification: req.Requested_Priority || 'NORMAL' });
    decideStep_(ctx, hrStep, 'APPROVED', 'اعتماد مدير قطاع الموارد البشرية مع التقديم', snap);
    event_(ctx, 'REQUEST', id, 'APPROVED_STEP', 'اعتماد مدير قطاع الموارد البشرية مع التقديم', { step: hrStep.Label });
    // ... and his submission is also the separate HC-exception approval
    var excStep = chainOf_('REQUEST', id, version).filter(function (a) { return a.Step_Type === 'HC_EXC' && a.Status === 'WAITING'; })[0];
    if (excStep) {
      decideStep_(ctx, excStep, 'APPROVED', 'اعتماد استثناء العدد من مدير قطاع الموارد البشرية مع التقديم', { lines: hcExcessLines_(id) });
      event_(ctx, 'REQUEST', id, 'HC_EXC_APPROVED', 'اعتماد مدير قطاع الموارد البشرية مع التقديم', { step: excStep.Label });
    }
  }
  var next = activateNext_(ctx, 'REQUEST', id, version, req.Requester_User_ID,
    'طلب توظيف محتاج اعتمادك', id + ' — ' + title + ' من ' + ctx.user.Full_Name_AR);
  if (!next && steps.some(function (s) { return s.selfApprove; })) {
    var fin = finalizeRequest_(ctx, id);
    fin.exception = exception;
    return fin;
  }
  warnIfNobody_(next, 'REQUEST', id);
  var status = statusFromStep_(next);
  withLock_(function () { update_('RECRUITMENT_REQUESTS', id, { Status: status }, 'SYSTEM'); });
  return { Request_ID: id, Status: status, exception: exception };
}

function isHrSectorUser_(userId) {
  return activeRoles_(userId).some(function (r) { return r.Role_Code === ROLE.HR_SECTOR; });
}

/** Line chain → HR → [HC exception] → [CEO] → [board]. */
function requestChain_(req, lines, exception) {
  var requester = get_('USERS', req.Requester_User_ID);
  var steps = buildLineChain_(req.Org_Unit_ID, requester, 'LINE');
  var targetPos = lines.map(function (l) { return 'POSITION:' + l.Position_ID; });
  steps.forEach(function (s) {
    if (s.Status === 'WAITING' && targetPos.indexOf(s.Authority) >= 0) {
      s.Status = 'SKIPPED'; s.Skip_Reason = 'الوظيفة المطلوبة هي نفسها وظيفة المعتمد';
    }
  });
  var hr = { Step_Type: 'HR', Authority: HR_APPROVER_ROLES, Label: 'مراجعة واعتماد الموارد البشرية', Status: 'WAITING', Skip_Reason: '' };
  var hrSkipped = false;
  // Owner's rule: the HR Sector Manager's own approval is enough for any job, except jobs reporting
  // directly to the CEO (the board rule still adds CEO + board for those).
  var selfHr = isHrSectorUser_(req.Requester_User_ID);
  if (selfHr) {
    steps.forEach(function (s) {
      if (s.Status === 'WAITING') { s.Status = 'SKIPPED'; s.Skip_Reason = 'الطلب من مدير قطاع الموارد البشرية — اعتماده كافي'; }
    });
    hr.Label = 'اعتماد مدير قطاع الموارد البشرية (صاحب الطلب)';
    hr.selfApprove = true;
  } else if (!eligibleUsers_(HR_APPROVER_ROLES, req.Requester_User_ID).length) {
    hr.Status = 'SKIPPED'; hrSkipped = true;
    hr.Skip_Reason = eligibleUsers_(HR_APPROVER_ROLES, '').length ? 'صاحب الطلب هو معتمد HR الوحيد — يروح للرئيس التنفيذي'
      : 'لا يوجد مستخدم بدور مدير الموارد البشرية';
  }
  steps.push(hr);
  // HC above the structure: a separate approval by the HR Sector Manager only (CHG-40/2)
  if (exception) {
    var exc = hcExcStep_();
    if (selfHr) exc.selfApprove = true;
    steps.push(exc);
  }

  var sectorHeads = where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Unit_Type === 'SECTOR' && u.Head_Position_ID; })
    .map(function (u) { return 'POSITION:' + u.Head_Position_ID; });
  var t = { unitIds: unitAncestors_(req.Org_Unit_ID).map(function (u) { return u.Org_Unit_ID; }), jobCode: req.Job_Code,
    positionIds: lines.map(function (l) { return l.Position_ID; }) };
  var board = ruleApplies_('RECRUITMENT_REQUEST', 'BOARD_REQUIRED', t);
  // v0.36.0 (CHG-74): the HR Sector Manager's own approval never covers his own position — that concerns him personally
  var personal = selfHr && requester && str_(requester.Position_ID) && targetPos.indexOf('POSITION:' + requester.Position_ID) >= 0;
  var ceo = hrSkipped || board || personal || targetPos.some(function (x) { return sectorHeads.indexOf(x) >= 0; }) ||
    ruleApplies_('RECRUITMENT_REQUEST', 'CEO_REQUIRED', t);
  if (ceo) steps.push(ceoStep_());
  if (board) steps.push(boardStep_());
  return steps;
}

/** Separate approval of an HC exception — HR Sector Manager only. */
function hcExcStep_() {
  return { Step_Type: 'HC_EXC', Authority: 'ROLE:' + ROLE.HR_SECTOR, Label: 'اعتماد استثناء العدد — مدير قطاع الموارد البشرية',
    Status: 'WAITING', Skip_Reason: '' };
}

/** Per line: the number being approved (approved, else requested) against what the structure has free now. */
function hcExcessLines_(id) {
  var openMap = openHcByPosition_(id);
  return reqChildren_('REQUEST_LINES', id).map(function (l) {
    var pos = get_('POSITIONS', l.Position_ID);
    var hc = pos ? hcOf_(pos, openMap) : { available: 0 };
    var want = num_(str_(l.Approved_HC) !== '' ? l.Approved_HC : l.Requested_HC, 0);
    return { Line_ID: l.Line_ID, Position_ID: l.Position_ID, Location_ID: l.Location_ID, want: want,
      available: hc.available, over: Math.max(0, want - Math.max(hc.available, 0)) };
  });
}

/** After HR review: when the approved numbers fit the structure, the exception step is not needed any more. */
function resolveHcExcStep_(id, ver) {
  var exc = chainOf_('REQUEST', id, ver).filter(function (a) { return a.Step_Type === 'HC_EXC' && a.Status === 'WAITING'; })[0];
  if (!exc) return null;
  if (hcExcessLines_(id).some(function (l) { return l.over > 0; })) return exc;
  withLock_(function () {
    update_('APPROVAL_INSTANCES', exc.Approval_ID, { Status: 'SKIPPED', Skip_Reason: 'العدد المعتمد في حدود المتاح بالهيكل — مفيش استثناء' }, 'SYSTEM');
  });
  return null;
}

function ceoStep_() {
  return { Step_Type: 'CEO', Authority: 'ROLE:CEO', Label: 'اعتماد الرئيس التنفيذي', Status: 'WAITING', Skip_Reason: '' };
}
/** Chairman or Vice Chairman — either one approves for the board. */
function boardStep_() {
  return { Step_Type: 'BOARD', Authority: 'ROLE:BOARD', Label: 'اعتماد مجلس الإدارة (الرئيس أو النائب)', Status: 'WAITING', Skip_Reason: '' };
}
var BOARD_METHODS_ = { MEETING: 'اجتماع', WHATSAPP: 'واتساب', PHONE: 'تليفون', EMAIL: 'إيميل', PAPER: 'توقيع ورقي', OTHER: 'أخرى' };
/**
 * HR Sector Manager records the board's decision on its behalf (Chairman / Vice approved outside the portal).
 * Returns the comment to store ("[بالنيابة عن مجلس الإدارة — عبر واتساب] …"), or '' when not an on-behalf action.
 */
function boardOnBehalf_(ctx, step, p) {
  if (!p.onBehalf || !step || step.Step_Type !== 'BOARD') return '';
  if (!hasAnyRole_(ctx, [ROLE.HR_SECTOR])) throw userError_('تسجيل قرار المجلس بالنيابة لمدير قطاع الموارد البشرية بس.');
  var m = BOARD_METHODS_[str_(p.onBehalfMethod)];
  if (!m) throw userError_('اختار وسيلة الاعتماد (اجتماع، واتساب، تليفون…).');
  var note = str_(p.comment);
  if (note.length < 3) throw userError_('اكتب ملاحظة للتذكرة: مين اعتمد وإمتى.');
  // v0.36.0 (CHG-78): the decision needs its proof — minutes, a written approval or a WhatsApp screenshot
  var checked = evidenceCheck_(p.files);
  if (!checked.length) throw userError_('ارفع إثبات القرار: محضر، موافقة مكتوبة، أو صورة رسالة الواتساب.');
  var saved = evidenceSave_('BOARD ' + step.Entity_ID, checked.slice(0, 2));
  return '[بالنيابة عن مجلس الإدارة — عبر ' + m + '] ' + note + ' [إثبات: ' + saved.map(function (f) { return f.id; }).join('، ') + ']';
}

function appendStep_(ctx, id, ver, s, chain) {
  withLock_(function () {
    insert_('APPROVAL_INSTANCES', { Approval_ID: nextId_('APPROVAL'), Entity_Type: 'REQUEST', Entity_ID: id, Entity_Version: ver,
      Sequence: String(chain.length + 1), Step_Type: s.Step_Type, Authority: s.Authority, Label: s.Label, Status: 'WAITING',
      Activated_At: '', Decision_By: '', Decision_At: '', Comment: '', Skip_Reason: '', Snapshot_JSON: '' }, ctx.user.User_ID);
  });
  chain.push({ Step_Type: s.Step_Type });
}

/** A pending step nobody can act on: alert HR admins so it doesn't stall silently. */
function warnIfNobody_(step, entityType, entityId) {
  if (!step || step.Authority === '') return;
  var req = entityType === 'REQUEST' ? get_('RECRUITMENT_REQUESTS', entityId) : get_('POSITION_CHANGE_REQUESTS', entityId);
  if (eligibleUsers_(step.Authority, req ? req.Requester_User_ID : '').length) return;
  notify_(eligibleUsers_('ROLE:' + HR_ADMIN_ROLES.join('|'), ''), 'خطوة اعتماد بدون مستخدم',
    entityId + ' واقف عند "' + step.Label + '" ومفيش مستخدم مسند له الدور/الوظيفة. أضف المستخدم أو فعّل تفويض.', entityType, entityId, true);
}

function requestSnapshot_(id) {
  return { request: get_('RECRUITMENT_REQUESTS', id), lines: reqChildren_('REQUEST_LINES', id),
    replacements: reqChildren_('REQUEST_REPLACEMENTS', id), skills: reqChildren_('REQUEST_SKILLS', id) };
}

/* ---------------- decisions ---------------- */

/**
 * p = { Request_ID, action: APPROVE|RETURN|REJECT|SEND_CEO, comment, reasonCode,
 *       hr: { HR_Classification, HR_Notes, Employment_Type, Required_By_Date, Education, Specialization,
 *             Experience_Years, lines:[{Line_ID, Approved_HC}] } }
 */
function requestAction_(ctx, p) {
  var id = str_(p.Request_ID);
  var req = get_('RECRUITMENT_REQUESTS', id);
  if (!req) throw userError_('الطلب غير موجود.');
  if (REQ_OPEN_.indexOf(req.Status) < 0) throw userError_('الطلب مش في مرحلة اعتماد.');
  var step = currentStep_('REQUEST', id, req.Version);
  var action = str_(p.action);
  var comment = str_(p.comment);
  // HR Sector Manager may record the board's decision on its behalf (e.g. a decision taken in a meeting)
  var onBehalf = boardOnBehalf_(ctx, step, p);
  if (!onBehalf && !canActOn_(ctx, step, req.Requester_User_ID)) throw userError_('الطلب مش عندك دلوقتي، أو اتاخد فيه قرار بالفعل.');
  if (onBehalf) comment = onBehalf;
  var reasonLabel = reasonLabel_(action === 'REJECT' ? 'REQUEST_REJECT' : 'REQUEST_RETURN', p.reasonCode);
  var fullComment = [reasonLabel, comment].filter(String).join(' — ');
  var title = reqTitle_(req);
  var ver = req.Version;

  if (action === 'RETURN' || action === 'REJECT') {
    if (comment.length < 3 && !reasonLabel) throw userError_(action === 'RETURN' ? 'اكتب المطلوب تعديله.' : 'اكتب سبب الرفض.');
    decideStep_(ctx, step, action === 'RETURN' ? 'RETURNED' : 'REJECTED', fullComment);
    cancelOpenSteps_('REQUEST', id, ver);
    withLock_(function () {
      update_('RECRUITMENT_REQUESTS', id, action === 'RETURN' ? { Status: 'RETURNED' } : { Status: 'REJECTED', Decided_At: nowIso_() }, ctx.user.User_ID);
    });
    event_(ctx, 'REQUEST', id, action === 'RETURN' ? 'RETURNED' : 'REJECTED', fullComment, { step: step.Label });
    audit_(ctx, { entityType: 'REQUEST', entityId: id, action: action, reason: fullComment });
    notify_([req.Requester_User_ID], action === 'RETURN' ? 'طلبك رجع لك للتعديل' : 'طلبك اترفض',
      id + ' — ' + title + ' — ' + step.Label + ': ' + fullComment, 'REQUEST', id, true);
    return { Request_ID: id, Status: action === 'RETURN' ? 'RETURNED' : 'REJECTED' };
  }

  if (['APPROVE', 'SEND_CEO', 'SEND_BOARD', 'APPROVE_WITHIN_HC'].indexOf(action) < 0) throw userError_('إجراء غير معروف.');
  if (action === 'APPROVE_WITHIN_HC' && step.Step_Type !== 'HC_EXC') throw userError_('«الاعتماد في حدود المتاح» من خطوة اعتماد الاستثناء بس.');
  var chain = chainOf_('REQUEST', id, ver);
  var has = function (type) { return chain.some(function (a) { return a.Step_Type === type && a.Status !== 'SKIPPED' && a.Status !== 'CANCELLED'; }); };
  if (action === 'SEND_CEO') {
    if (step.Step_Type !== 'HR') throw userError_('التحويل للرئيس التنفيذي من خطوة HR بس.');
    if (has('CEO')) throw userError_('الطلب في طريقه للرئيس التنفيذي بالفعل.');
  }
  if (action === 'SEND_BOARD') {
    if (step.Step_Type !== 'HR') throw userError_('التحويل لمجلس الإدارة من خطوة HR بس.');
    if (!hasAnyRole_(ctx, [ROLE.HR_SECTOR])) throw userError_('التحويل لمجلس الإدارة لمدير قطاع الموارد البشرية بس.');
    if (has('BOARD')) throw userError_('الطلب في طريقه لمجلس الإدارة بالفعل.');
    if (comment.length < 3) throw userError_('اكتب سبب التحويل لمجلس الإدارة.');
  }
  var snapshot = null;
  stepUnchanged_(step);       // before HR edits are written (the decision itself is re-checked atomically in decideStep_)
  if (step.Step_Type === 'HR') snapshot = applyHrReview_(ctx, req, p.hr || {});
  if (step.Step_Type === 'HC_EXC') {
    var exLines = hcExcessLines_(id);
    if (action === 'APPROVE_WITHIN_HC') {
      comment = ['اعتماد في حدود المتاح بالهيكل بس — الاستثناء مرفوض', comment].filter(String).join(' — ');
      capToAvailable_(ctx, req, exLines);
      exLines = hcExcessLines_(id);
    }
    snapshot = { lines: exLines };
  }

  decideStep_(ctx, step, 'APPROVED', comment, snapshot);
  event_(ctx, 'REQUEST', id, step.Step_Type === 'HC_EXC' ? (action === 'APPROVE_WITHIN_HC' ? 'HC_EXC_CAPPED' : 'HC_EXC_APPROVED') : 'APPROVED_STEP',
    comment, { step: step.Label, onBehalf: !!onBehalf });
  if (step.Step_Type === 'HR') {
    var excWaiting = resolveHcExcStep_(id, ver);
    // the HR Sector Manager reviewing as HR may give the exception approval in the same go — still its own record
    if (excWaiting && p.alsoHcExc && eligibleUsers_(excWaiting.Authority, req.Requester_User_ID).indexOf(ctx.user.User_ID) >= 0) {
      withLock_(function () { update_('APPROVAL_INSTANCES', excWaiting.Approval_ID, { Activated_At: nowIso_() }, 'SYSTEM'); });
      decideStep_(ctx, excWaiting, 'APPROVED', 'اعتماد الاستثناء مع مراجعة الموارد البشرية', { lines: hcExcessLines_(id) });
      event_(ctx, 'REQUEST', id, 'HC_EXC_APPROVED', 'اعتماد الاستثناء مع مراجعة الموارد البشرية', { step: excWaiting.Label });
    }
  }

  if (action === 'SEND_CEO') {
    appendStep_(ctx, id, ver, ceoStep_(), chain);
    event_(ctx, 'REQUEST', id, 'SENT_TO_CEO', comment, null);
  } else if (step.Step_Type === 'HR' && action === 'APPROVE' && !has('CEO') && reqTouchesApprover_(ctx, id)) {
    // v0.36.0 (CHG-74): a request on the approver's own position concerns him personally → the CEO decides
    appendStep_(ctx, id, ver, ceoStep_(), chain);
    event_(ctx, 'REQUEST', id, 'SENT_TO_CEO', 'الطلب على وظيفة المعتمد نفسه — بيروح للرئيس التنفيذي', null);
  }
  if (action === 'SEND_BOARD') {
    if (!has('CEO')) appendStep_(ctx, id, ver, ceoStep_(), chain);
    appendStep_(ctx, id, ver, boardStep_(), chain);
    event_(ctx, 'REQUEST', id, 'SENT_TO_BOARD', comment, null);
  }

  var next = activateNext_(ctx, 'REQUEST', id, ver, req.Requester_User_ID, 'طلب توظيف محتاج اعتمادك',
    id + ' — ' + title + ' (من ' + (userNames_()[req.Requester_User_ID] || '') + ')');
  warnIfNobody_(next, 'REQUEST', id);
  if (next) {
    var st = statusFromStep_(next);
    withLock_(function () { update_('RECRUITMENT_REQUESTS', id, { Status: st }, ctx.user.User_ID); });
    notify_([req.Requester_User_ID], 'طلبك اتقدم خطوة', id + ' — اعتمده ' + ctx.user.Full_Name_AR + '، ودلوقتي عند: ' + next.Label,
      'REQUEST', id, false);
    return { Request_ID: id, Status: st };
  }
  return finalizeRequest_(ctx, id);
}

/** HC exception refused: each line is cut to what the structure has free now (never above the number asked). */
function capToAvailable_(ctx, req, exLines) {
  var total = 0, changes = [];
  exLines.forEach(function (l) {
    var v = Math.min(l.want, Math.max(l.available, 0));
    total += v;
    if (v !== l.want) changes.push({ line: l.Line_ID, position: l.Position_ID, from: String(l.want), to: String(v) });
    l.capped = v;
  });
  if (!total) throw userError_('مفيش عدد متاح في الهيكل للطلب ده — ارفض الطلب أو رجّعه للتعديل.');
  withLock_(function () { exLines.forEach(function (l) { update_('REQUEST_LINES', l.Line_ID, { Approved_HC: String(l.capped) }, ctx.user.User_ID); }); });
  if (changes.length) {
    event_(ctx, 'REQUEST', req.Request_ID, 'HR_EDITED', 'الاستثناء اترفض — العدد اتعدل للمتاح بالهيكل', { fields: [], lines: changes });
    notify_([req.Requester_User_ID], 'HR عدّل في طلبك', req.Request_ID + ' — استثناء العدد اترفض والعدد اتعدل للمتاح: ' +
      changes.map(function (c) { return 'العدد ' + c.from + ' ← ' + c.to; }).join('، '), 'REQUEST', req.Request_ID, true);
  }
}

/** v0.36.0: the request includes the approver's own position (his replacement, his job) — it concerns him personally. */
function reqTouchesApprover_(ctx, id) {
  var pos = str_(ctx.user.Position_ID);
  return !!pos && reqChildren_('REQUEST_LINES', id).some(function (l) { return l.Position_ID === pos; });
}

function reasonLabel_(process, code) {
  if (!str_(code)) return '';
  var r = where_('REASON_MASTER', function (x) { return x.Process === process && x.Code === code; })[0];
  return r && r.Code !== 'OTHER' ? r.Label_AR : '';
}

/** HR review: classification + allowed edits. Every change is recorded and the requester told. */
function applyHrReview_(ctx, req, hr) {
  var opts = reqOptions_();
  var cls = str_(hr.HR_Classification);
  if (optCodes_(opts.priorities).indexOf(cls) < 0) throw userError_('اختار تصنيف الأولوية (HR).');
  var patch = { HR_Classification: cls, HR_Notes: str_(hr.HR_Notes), Reviewed_By: ctx.user.User_ID, Reviewed_At: nowIso_() };
  if (hr.HR_Internal_Notes !== undefined) patch.HR_Internal_Notes = str_(hr.HR_Internal_Notes).slice(0, 3000);
  var editable = ['Employment_Type', 'Required_By_Date', 'Education', 'Specialization', 'Experience_Years'];
  editable.forEach(function (f) { if (hr[f] !== undefined && str_(hr[f]) !== '') patch[f] = str_(hr[f]); });
  checkOpt_(patch.Employment_Type, opts.employmentTypes, 'نوع التوظيف');
  if (patch.Required_By_Date && !/^\d{4}-\d{2}-\d{2}$/.test(patch.Required_By_Date)) throw userError_('تاريخ الاحتياج غير صحيح.');

  var lines = reqChildren_('REQUEST_LINES', req.Request_ID);
  var given = {};
  (hr.lines || []).forEach(function (l) { given[str_(l.Line_ID)] = str_(l.Approved_HC); });
  var total = 0, lineChanges = [];
  var linePatches = lines.map(function (l) {
    var v = given[l.Line_ID] !== undefined && given[l.Line_ID] !== '' ? given[l.Line_ID] : l.Requested_HC;
    if (!/^\d+$/.test(v) || Number(v) > 999) throw userError_('العدد المعتمد لازم يكون رقم صحيح.');
    total += Number(v);
    if (v !== l.Requested_HC) lineChanges.push({ line: l.Line_ID, position: l.Position_ID, from: l.Requested_HC, to: v });
    return { id: l.Line_ID, v: v };
  });
  if (!total) throw userError_('إجمالي العدد المعتمد صفر — استخدم "رفض" بدل الاعتماد.');
  // v0.34.0 (§4.2): any HR edit of the requester's request carries a reason; a classification change goes to the priority history
  var edits = editable.some(function (f) { return patch[f] !== undefined && str_(patch[f]) !== str_(req[f]); }) || lineChanges.length > 0;
  var why = str_(hr.Edit_Reason) || str_(hr.HR_Notes);
  if (edits && why.length < 3) throw userError_('اكتب سبب التعديل في «ملاحظات لصاحب الطلب» — بتوصله مع التعديل.');
  var oldCls = str_(req.HR_Classification) || str_(req.Requested_Priority);

  var changes = [];
  var res;
  withLock_(function () {
    res = update_('RECRUITMENT_REQUESTS', req.Request_ID, patch, ctx.user.User_ID);
    linePatches.forEach(function (lp) { update_('REQUEST_LINES', lp.id, { Approved_HC: lp.v }, ctx.user.User_ID); });
    if (oldCls && oldCls !== cls) insert_('PRIORITY_HISTORY', { Priority_History_ID: nextId_('PRIORITY_HISTORY'), Entity_Type: 'REQUEST', Entity_ID: req.Request_ID,
      Field: 'HR_Classification', Old_Value: oldCls, New_Value: cls, Reason: why || 'مراجعة HR' }, ctx.user.User_ID);
  });
  editable.forEach(function (f) {
    if (str_(res.before[f]) !== str_(res.after[f])) changes.push({ field: f, from: res.before[f], to: res.after[f] });
  });
  auditDiff_(ctx, 'REQUEST', req.Request_ID, res.before, res.after, why || 'HR review');
  if (changes.length || lineChanges.length) {
    event_(ctx, 'REQUEST', req.Request_ID, 'HR_EDITED', str_(hr.HR_Notes), { fields: changes, lines: lineChanges });
    notify_([req.Requester_User_ID], 'HR عدّل في طلبك', req.Request_ID + ' — ' +
      changes.map(function (c) { return fieldLabel_(c.field) + ': ' + (c.from || '—') + ' ← ' + c.to; })
        .concat(lineChanges.map(function (c) { return 'العدد ' + c.from + ' ← ' + c.to; })).join('، '),
      'REQUEST', req.Request_ID, true);
  }
  return { classification: cls, fields: changes, lines: lineChanges };
}

function fieldLabel_(f) {
  return { Employment_Type: 'نوع التوظيف', Required_By_Date: 'تاريخ الاحتياج', Education: 'المؤهل',
    Specialization: 'التخصص', Experience_Years: 'سنوات الخبرة' }[f] || f;
}

/** Chain finished → APPROVED + one vacancy per line with Approved_HC > 0. */
function finalizeRequest_(ctx, id) {
  var req = get_('RECRUITMENT_REQUESTS', id);
  var lines = reqChildren_('REQUEST_LINES', id).filter(function (l) { return num_(l.Approved_HC || l.Requested_HC, 0) > 0; });
  var created = [], topped = [];
  withLock_(function () {
    // v0.28.0: a line of a headcount-increase request adds to its vacancy while that one is still open
    lines = lines.filter(function (l) { var t = topupVacancy_(ctx, l); if (t) topped.push(t); return !t; });
    var vIds = nextIds_('VACANCY', lines.length);
    lines.forEach(function (l, i) {
      var pos = get_('POSITIONS', l.Position_ID);
      insert_('VACANCIES', { Vacancy_ID: vIds[i], Request_ID: id, Line_ID: l.Line_ID, Position_ID: l.Position_ID,
        Job_Code: pos.Job_Code, Org_Unit_ID: pos.Org_Unit_ID, Location_ID: l.Location_ID,
        Required_HC: l.Approved_HC || l.Requested_HC, Joined_HC: '0', Status: 'APPROVED', Recruitment_Start_Date: '',
        Required_By_Date: req.Required_By_Date, HR_Classification: req.HR_Classification || req.Requested_Priority || 'NORMAL',
        Pin_Until: '', Pin_Reason: '', Lead_Recruiter_ID: '', Closed_At: '', Close_Reason: '' }, ctx.user.User_ID);
      update_('REQUEST_LINES', l.Line_ID, { Vacancy_ID: vIds[i], Status: 'Approved' }, ctx.user.User_ID);
      created.push(vIds[i]);
    });
    update_('RECRUITMENT_REQUESTS', id, { Status: 'APPROVED', Decided_At: nowIso_() }, ctx.user.User_ID);
  });
  created.forEach(function (v) { event_(ctx, 'VACANCY', v, 'CREATED', '', { request: id }); });
  topped.forEach(function (t) { event_(ctx, 'VACANCY', t.vacancy, 'HC_INCREASED', '', { request: id, add: t.add, hc: t.hc }); });
  if (req.Parent_Request_ID) event_(ctx, 'REQUEST', req.Parent_Request_ID, 'INCREASE_APPROVED', '', { request: id, vacancies: topped.map(function (t) { return t.vacancy; }).concat(created) });
  event_(ctx, 'REQUEST', id, 'APPROVED', '', { vacancies: created.concat(topped.map(function (t) { return t.vacancy; })) });
  audit_(ctx, { entityType: 'REQUEST', entityId: id, action: 'APPROVE_FINAL', newValue: created.join(',') });
  var title = reqTitle_(req);
  if (topped.length) {
    var leads = topped.map(function (t) { return (get_('VACANCIES', t.vacancy) || {}).Lead_Recruiter_ID; }).filter(Boolean);
    notify_([req.Requester_User_ID].concat(leads), 'زيادة العدد اتعتمدت',
      id + ' — ' + title + ': ' + topped.map(function (t) { return t.vacancy + ' +' + t.add + ' (بقى ' + t.hc + ')'; }).join('، '), 'REQUEST', id, true);
  }
  if (created.length) {
    notify_([req.Requester_User_ID], 'طلبك اتعتمد 🎉', id + ' — ' + title + '. اتفتح ' + created.length +
      ' شاغر وفريق التوظيف هيبدأ عليه.', 'REQUEST', id, true);
    notify_(eligibleUsers_('ROLE:' + [ROLE.REC_MANAGER, ROLE.HR_MANAGER].join('|'), ''), 'شواغر جديدة محتاجة توزيع',
      title + ' — ' + created.length + ' شاغر من الطلب ' + id, 'VACANCY', created[0] || '', true);
  }
  return { Request_ID: id, Status: 'APPROVED', vacancies: created, topped: topped };
}

/* ---------------- cancel ---------------- */

function requestCancel_(ctx, p) {
  var id = str_(p.Request_ID);
  var req = get_('RECRUITMENT_REQUESTS', id);
  if (!req) throw userError_('الطلب غير موجود.');
  if (req.Requester_User_ID !== ctx.user.User_ID && !hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('الإلغاء لصاحب الطلب أو HR.');
  if (['DRAFT', 'RETURNED'].concat(REQ_OPEN_).indexOf(req.Status) < 0) throw userError_('الطلب ده مينفعش يتلغي في حالته الحالية.');
  var reason = str_(p.comment);
  if (req.Status !== 'DRAFT' && reason.length < 3) throw userError_('اكتب سبب الإلغاء.');
  var wasPending = currentStep_('REQUEST', id, req.Version);
  cancelOpenSteps_('REQUEST', id, req.Version);
  withLock_(function () { update_('RECRUITMENT_REQUESTS', id, { Status: 'CANCELLED', Decided_At: nowIso_() }, ctx.user.User_ID); });
  event_(ctx, 'REQUEST', id, 'CANCELLED', reason, null);
  audit_(ctx, { entityType: 'REQUEST', entityId: id, action: 'CANCEL', reason: reason });
  if (wasPending) notify_(eligibleUsers_(wasPending.Authority, req.Requester_User_ID), 'طلب اتلغى', id + ' — ' + reqTitle_(req) + ' اتلغى من صاحبه.', 'REQUEST', id, false);
  if (req.Requester_User_ID !== ctx.user.User_ID) notify_([req.Requester_User_ID], 'طلبك اتلغى', id + ' — ' + reason, 'REQUEST', id, true);
  return { Request_ID: id, Status: 'CANCELLED' };
}

/* ---------------- read ---------------- */

function requestGet_(ctx, p) {
  var id = str_(p.Request_ID);
  var req = get_('RECRUITMENT_REQUESTS', id);
  if (!req || !canViewRequest_(ctx, req)) throw userError_('الطلب غير موجود أو مالكش صلاحية تشوفه.');
  var names = userNames_();
  var jobs = get_('JOBS', req.Job_Code) || {};
  var unit = get_('ORG_UNITS', req.Org_Unit_ID) || {};
  var locs = {}; all_('LOCATIONS').forEach(function (l) { locs[l.Location_ID] = l.Name_AR; });
  var openMap = openHcByPosition_(id);
  var lines = reqChildren_('REQUEST_LINES', id).map(function (l) {
    var pos = get_('POSITIONS', l.Position_ID) || {};
    var hc = pos.Position_ID ? hcOf_(pos, openMap) : {};
    l.title = pos.Position_Title || jobs.Job_Title_AR || '';
    l.locationName = locs[l.Location_ID] || '';
    l.nowAvailable = hc.available;
    l.nowStructural = hc.structural; l.nowOccupied = hc.occupied; l.nowOpen = hc.open; l.nowReserved = hc.reserved;
    return l;
  });
  var step = currentStep_('REQUEST', id, req.Version);
  var canAct = canActOn_(ctx, step, req.Requester_User_ID);
  var mine = req.Requester_User_ID === ctx.user.User_ID;
  var chain = req.Version !== '0' ? chainView_(ctx, 'REQUEST', id, req.Version, req.Requester_User_ID) : [];
  var vacancies = where_('VACANCIES', function (v) { return v.Request_ID === id; }).map(function (v) {
    v.locationName = locs[v.Location_ID] || ''; return v;
  });
  req.requesterName = names[req.Requester_User_ID] || '';
  req.jobTitle = jobs.Job_Title_AR || '';
  req.grade = jobs.Grade_Code || '';
  req.jdApproved = req.Job_Code ? ((jdApproved_(req.Job_Code) || {}).Version || '') : '';
  req.unitName = unit.Name_AR || '';
  req.unitPath = unitAncestors_(req.Org_Unit_ID).reverse().filter(function (u) { return u.Unit_Type !== 'COMPANY'; })
    .map(function (u) { return u.Name_AR; }).join(' ‹ ');
  req.reviewedByName = names[req.Reviewed_By] || '';
  var hrTeam = hasAnyRole_(ctx, hrTeamRoles_());
  if (!hrTeam) delete req.HR_Internal_Notes;            // internal HR notes never reach the requester or line managers
  var chainRows = chainOf_('REQUEST', id, req.Version);
  var excWaiting = chainRows.filter(function (a) { return a.Step_Type === 'HC_EXC' && a.Status === 'WAITING'; })[0];
  var openNow = REQ_OPEN_.indexOf(req.Status) >= 0;
  return {
    request: req, lines: lines, replacements: reqChildren_('REQUEST_REPLACEMENTS', id), skills: reqChildren_('REQUEST_SKILLS', id),
    chain: chain, events: eventsFor_('REQUEST', id), vacancies: vacancies,
    versions: where_('REQUEST_VERSIONS', function (v) { return v.Request_ID === id; }).map(function (v) {
      return { Version: v.Version, at: v.Created_At, reason: v.Reason };
    }),
    can: {
      edit: mine && ['DRAFT', 'RETURNED'].indexOf(req.Status) >= 0,
      cancel: (mine || hasAnyRole_(ctx, HR_ADMIN_ROLES)) && ['DRAFT', 'RETURNED'].concat(REQ_OPEN_).indexOf(req.Status) >= 0,
      act: canAct,
      hrStep: canAct && step.Step_Type === 'HR',
      hcExcStep: canAct && step.Step_Type === 'HC_EXC',
      alsoHcExc: canAct && step.Step_Type === 'HR' && !!excWaiting && eligibleUsers_(excWaiting.Authority, req.Requester_User_ID).indexOf(ctx.user.User_ID) >= 0,
      internalNotes: hrTeam,
      sendCeo: canAct && step.Step_Type === 'HR' && !chainOf_('REQUEST', id, req.Version).some(function (a) { return a.Step_Type === 'CEO' && a.Status !== 'SKIPPED'; }),
      sendBoard: canAct && step.Step_Type === 'HR' && hasAnyRole_(ctx, [ROLE.HR_SECTOR]) &&
        !chainOf_('REQUEST', id, req.Version).some(function (a) { return a.Step_Type === 'BOARD' && a.Status !== 'SKIPPED'; }),
      boardOnBehalf: !canAct && !!step && step.Step_Type === 'BOARD' && hasAnyRole_(ctx, [ROLE.HR_SECTOR])
    },
    currentStep: step ? step.Label : '',
    change: requestChangeInfo_(ctx, id),
    parent: req.Parent_Request_ID || '',
    increases: where_('RECRUITMENT_REQUESTS', function (r) { return r.Parent_Request_ID === id; }).map(function (r) {
      return { id: r.Request_ID, status: r.Status, hc: reqChildren_('REQUEST_LINES', r.Request_ID).reduce(function (s, l) { return s + num_(l.Approved_HC || l.Requested_HC, 0); }, 0), at: r.Submitted_At };
    }),
    hcLines: req.HC_Exception === 'Y' && openNow ? hcExcessLines_(id) : []
  };
}

/** Roles that see and write the internal HR notes on a request (HR + recruitment team). */
function hrTeamRoles_() {
  return HR_ALL_ROLES.concat([ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR, ROLE.RECRUITER]);
}

/** p = { Request_ID, HR_Internal_Notes } — internal note any time; audited, never shown to the requester. */
function requestHrNote_(ctx, p) {
  var req = get_('RECRUITMENT_REQUESTS', str_(p.Request_ID));
  if (!req || req.Version === '0') throw userError_('الطلب غير موجود.');
  var note = str_(p.HR_Internal_Notes).slice(0, 3000);
  var res;
  withLock_(function () { res = update_('RECRUITMENT_REQUESTS', req.Request_ID, { HR_Internal_Notes: note }, ctx.user.User_ID); });
  auditDiff_(ctx, 'REQUEST', req.Request_ID, res.before, res.after, 'ملاحظات HR الداخلية');
  return { HR_Internal_Notes: note, at: nowIso_(), by: ctx.user.Full_Name_AR };
}

/** p = { box: 'mine'|'toApprove'|'team'|'all', status } */
function requestsList_(ctx, p) {
  p = p || {};
  var me = ctx.user.User_ID;
  var box = str_(p.box) || 'mine';
  var rows;
  if (box === 'toApprove') {
    var ids = {};
    where_('APPROVAL_INSTANCES', function (a) { return a.Entity_Type === 'REQUEST' && a.Status === 'PENDING'; }).forEach(function (a) {
      var r = get_('RECRUITMENT_REQUESTS', a.Entity_ID);
      if (r && r.Version === a.Entity_Version && eligibleUsers_(a.Authority, r.Requester_User_ID).indexOf(me) >= 0) ids[a.Entity_ID] = a;
    });
    rows = Object.keys(ids).map(function (k) { return get_('RECRUITMENT_REQUESTS', k); });
  } else if (box === 'all') {
    if (!isRecRole_(ctx)) throw userError_('مالكش صلاحية على كل الطلبات.');
    rows = where_('RECRUITMENT_REQUESTS', function (r) { return r.Version !== '0'; });
  } else if (box === 'team') {
    var scope = managedScope_(ctx.user);
    rows = where_('RECRUITMENT_REQUESTS', function (r) { return r.Version !== '0' && scope.indexOf(r.Org_Unit_ID) >= 0; });
  } else {
    rows = where_('RECRUITMENT_REQUESTS', function (r) { return r.Requester_User_ID === me; });
  }
  if (str_(p.status)) rows = rows.filter(function (r) { return r.Status === p.status; });
  return summarizeRequests_(rows);
}

function summarizeRequests_(rows) {
  var names = userNames_();
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j.Job_Title_AR; });
  var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
  var lines = {}; where_('REQUEST_LINES', function (l) { return l.Status !== 'Deleted'; }).forEach(function (l) {
    var x = lines[l.Request_ID] = lines[l.Request_ID] || { req: 0, appr: 0, n: 0 };
    x.req += num_(l.Requested_HC, 0); x.appr += num_(l.Approved_HC, 0); x.n++;
  });
  var today = today_();
  return rows.map(function (r) {
    var step = REQ_OPEN_.indexOf(r.Status) >= 0 ? currentStep_('REQUEST', r.Request_ID, r.Version) : null;
    var l = lines[r.Request_ID] || { req: 0, appr: 0, n: 0 };
    return { Request_ID: r.Request_ID, Status: r.Status, jobTitle: jobs[r.Job_Code] || '', unitName: units[r.Org_Unit_ID] || '',
      requesterName: names[r.Requester_User_ID] || '', requestedHC: l.req, approvedHC: l.appr, locations: l.n,
      Recruitment_Type: r.Recruitment_Type, Required_By_Date: r.Required_By_Date, Requested_Priority: r.Requested_Priority,
      HR_Classification: r.HR_Classification, HC_Exception: r.HC_Exception, Submitted_At: r.Submitted_At, Created_At: r.Created_At,
      currentStep: step ? step.Label : '', waitingDays: step && step.Activated_At ? daysBetween_(step.Activated_At.slice(0, 10), today) : '' };
  }).sort(function (a, b) { return (b.Submitted_At || b.Created_At) < (a.Submitted_At || a.Created_At) ? -1 : 1; });
}

function daysBetween_(fromYmd, toYmd) {
  var a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  var b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/* ---------------- "المطلوب منك" ---------------- */

/**
 * v0.35.0: the «what's waiting for you» counts are kept 60 seconds per user under a key made of every table's
 * generation — any write anywhere changes the key, so the counts are never stale, and repeated calls cost one cache read.
 */
function myTodo_(ctx) {
  var gens = tcGens_(), sig = Object.keys(gens).sort().map(function (k) { return gens[k]; }).join('.'), h = 0;
  for (var i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  var c = tcCache_(), key = 'TD_' + ctx.user.User_ID + '_' + (ctx.readOnly ? 'r' : 'w') + '_' + h;
  if (c && sig) { try { var hit = c.get(key); if (hit) return JSON.parse(hit); } catch (e) {} }
  var out = myTodoCompute_(ctx);
  if (c && sig) { try { c.put(key, JSON.stringify(out), 60); } catch (e) {} }
  return out;
}
function myTodoCompute_(ctx) {
  var me = ctx.user.User_ID;
  var todo = { approvals: 0, pcrApprovals: 0, returned: 0, drafts: 0, unread: 0, myVacancies: 0, unassigned: 0, overdue: 0,
    myOpenRequests: 0, canRequest: false };
  where_('APPROVAL_INSTANCES', function (a) { return a.Status === 'PENDING'; }).forEach(function (a) {
    var r = a.Entity_Type === 'REQUEST' ? get_('RECRUITMENT_REQUESTS', a.Entity_ID) : get_('POSITION_CHANGE_REQUESTS', a.Entity_ID);
    if (!r || r.Version !== a.Entity_Version) return;
    if (eligibleUsers_(a.Authority, r.Requester_User_ID).indexOf(me) < 0) return;
    if (a.Entity_Type === 'REQUEST') todo.approvals++; else todo.pcrApprovals++;
  });
  where_('RECRUITMENT_REQUESTS', function (r) { return r.Requester_User_ID === me; }).forEach(function (r) {
    if (r.Status === 'RETURNED') todo.returned++;
    else if (r.Status === 'DRAFT') todo.drafts++;
    else if (REQ_OPEN_.indexOf(r.Status) >= 0) todo.myOpenRequests++;
  });
  where_('POSITION_CHANGE_REQUESTS', function (r) { return r.Requester_User_ID === me && r.Status === 'RETURNED'; })
    .forEach(function () { todo.returned++; });
  todo.unread = where_('NOTIFICATIONS', function (n) { return n.User_ID === me && n.Read_At === ''; }).length;
  var myVac = {};
  where_('VACANCY_RECRUITERS', function (r) { return r.User_ID === me && r.Active === 'Y'; }).forEach(function (r) { myVac[r.Vacancy_ID] = 1; });
  var t = today_();
  where_('VACANCIES', function (v) { return VAC_OPEN_.indexOf(v.Status) >= 0; }).forEach(function (v) {
    if (myVac[v.Vacancy_ID]) todo.myVacancies++;
    if (!v.Lead_Recruiter_ID) todo.unassigned++;
    if (v.Required_By_Date && v.Required_By_Date < t) todo.overdue++;
  });
  if (!hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR])) { todo.unassigned = 0; }
  if (!isRecRole_(ctx)) todo.overdue = 0;
  var sc = requestScopeUnits_(ctx);
  todo.canRequest = !ctx.readOnly && (sc === null || sc.length > 0);
  todo.cand = candTodo_(ctx);
  todo.iv = intTodo_(ctx);
  todo.offer = offerTodo_(ctx);
  todo.join = joiningTodo_(ctx);
  todo.feedback = feedbackTodo_(ctx);
  todo.onb = onbTodo_(ctx);
  todo.ins = insTodo_(ctx);
  todo.nhv = nhvTodo_(ctx);
  todo.trf = trfTodo_(ctx);
  todo.prob = probTodo_(ctx);
  todo.ceo = ceoTodo_(ctx);
  todo.dual = dualTodo_(ctx);
  todo.incidents = incidentTodo_(ctx);
  todo.jdr = jdrTodo_(ctx);     // v0.45.0 (CHG-96)
  return todo;
}

/** Record that a request was printed (who / when / status at print time) — for document control. */
function requestPrinted_(ctx, p) {
  var req = get_('RECRUITMENT_REQUESTS', str_(p.Request_ID));
  if (!req || !canViewRequest_(ctx, req)) throw userError_('الطلب غير موجود أو مالكش صلاحية تشوفه.');
  audit_(ctx, { entityType: 'REQUEST', entityId: req.Request_ID, action: 'PRINT', newValue: str_(p.label).slice(0, 60) || req.Status });
  return { at: nowIso_(), by: ctx.user.Full_Name_AR };
}
