/**
 * Structural.gs — new position requests (structural change / PCR).
 * Chain: line management endorsement → HR review (recommendation; grade by HR Sector Manager only) → CEO final approval.
 * On final approval the position is created in the active org version (Structural_HC = number requested,
 * HC_Basis = MANPOWER_PLAN) and logged; the requester can then raise a normal recruitment request for it.
 * Simplification (Phase 2): changes are logged against the active org version; full version snapshots come later.
 */

var PCR_OPEN_ = ['IN_APPROVAL', 'HR_REVIEW', 'PENDING_CEO', 'PENDING_BOARD'];

function pcrTitle_(r) {
  if (r.Proposed_Title) return r.Proposed_Title;
  var j = get_('JOBS', r.Job_Code);
  return j ? j.Job_Title_AR : 'وظيفة جديدة';
}

function canViewPcr_(ctx, r) {
  var me = ctx.user.User_ID;
  if (r.Requester_User_ID === me || isRecRole_(ctx)) return true;
  if (managedScope_(ctx.user).indexOf(r.Org_Unit_ID) >= 0) return true;
  return where_('APPROVAL_INSTANCES', function (a) {
    return a.Entity_Type === 'PCR' && a.Entity_ID === r.PCR_ID &&
      (a.Decision_By === me || (a.Status === 'PENDING' && eligibleUsers_(a.Authority, r.Requester_User_ID).indexOf(me) >= 0));
  }).length > 0;
}

var PCR_FIELDS_ = ['Org_Unit_ID', 'Proposed_Title', 'Job_Code', 'Reports_To_Position_ID', 'Location_ID', 'Number_Of_Positions',
  'Justification', 'Qualifications', 'Responsibilities'];

/** Create/update a draft (DRAFT or RETURNED, requester only). */
function pcrSave_(ctx, p) {
  var scope = requestScopeUnits_(ctx);
  if (scope && !scope.length) throw userError_('طلب وظيفة جديدة بيرفعه مدير الوحدة. حسابك مش مربوط بوظيفة مدير — كلم HR.');
  var f = {};
  PCR_FIELDS_.forEach(function (k) { if (p[k] !== undefined) f[k] = str_(p[k]); });
  if (f.Org_Unit_ID) {
    if (!get_('ORG_UNITS', f.Org_Unit_ID)) throw userError_('الإدارة/القسم غير موجود.');
    if (scope && scope.indexOf(f.Org_Unit_ID) < 0) throw userError_('الوحدة دي خارج نطاق إدارتك.');
  }
  if (f.Job_Code && !get_('JOBS', f.Job_Code)) throw userError_('كود الوظيفة غير موجود.');
  if (f.Reports_To_Position_ID && !get_('POSITIONS', f.Reports_To_Position_ID)) throw userError_('وظيفة "يتبع لـ" غير موجودة.');
  if (f.Location_ID && !get_('LOCATIONS', f.Location_ID)) throw userError_('الموقع غير موجود.');
  if (f.Number_Of_Positions && (!/^\d+$/.test(f.Number_Of_Positions) || +f.Number_Of_Positions < 1 || +f.Number_Of_Positions > 99))
    throw userError_('عدد الوظائف لازم يكون من 1 لـ 99.');
  return withLock_(function () {
    var id = str_(p.PCR_ID);
    if (id) {
      var r = get_('POSITION_CHANGE_REQUESTS', id);
      if (!r) throw userError_('الطلب غير موجود.');
      if (r.Requester_User_ID !== ctx.user.User_ID) throw userError_('التعديل لصاحب الطلب بس.');
      if (['DRAFT', 'RETURNED'].indexOf(r.Status) < 0) throw userError_('الطلب مش قابل للتعديل في حالته الحالية.');
      update_('POSITION_CHANGE_REQUESTS', id, f, ctx.user.User_ID);
      return { PCR_ID: id };
    }
    f.PCR_ID = nextId_('PCR'); f.Version = '0'; f.Status = 'DRAFT'; f.Requester_User_ID = ctx.user.User_ID;
    insert_('POSITION_CHANGE_REQUESTS', f, ctx.user.User_ID);
    event_(ctx, 'PCR', f.PCR_ID, 'CREATED', '', null);
    return { PCR_ID: f.PCR_ID };
  });
}

function pcrSubmit_(ctx, p) {
  var id = pcrSave_(ctx, p).PCR_ID;
  var r = get_('POSITION_CHANGE_REQUESTS', id);
  var miss = [];
  if (!r.Org_Unit_ID) miss.push('الإدارة/القسم');
  if (!r.Proposed_Title && !r.Job_Code) miss.push('المسمى الوظيفي المقترح');
  if (!r.Number_Of_Positions) miss.push('العدد');
  if (str_(r.Justification).length < 10) miss.push('المبرر (10 حروف على الأقل)');
  if (str_(r.Responsibilities).length < 10) miss.push('المهام الرئيسية');
  if (miss.length) throw userError_('ناقص: ' + miss.join('، '));

  var requester = get_('USERS', r.Requester_User_ID);
  var steps = buildLineChain_(r.Org_Unit_ID, requester, 'ENDORSE');
  var hr = { Step_Type: 'HR', Authority: HR_APPROVER_ROLES, Label: 'مراجعة الموارد البشرية (توصية ودرجة)', Status: 'WAITING', Skip_Reason: '' };
  if (!eligibleUsers_(HR_APPROVER_ROLES, r.Requester_User_ID).length) { hr.Status = 'SKIPPED'; hr.Skip_Reason = 'لا يوجد معتمد HR غير صاحب الطلب'; }
  steps.push(hr);
  steps.push({ Step_Type: 'CEO', Authority: 'ROLE:CEO', Label: 'اعتماد الرئيس التنفيذي', Status: 'WAITING', Skip_Reason: '' });
  steps.push({ Step_Type: 'BOARD', Authority: 'ROLE:BOARD', Label: 'الاعتماد النهائي — مجلس الإدارة (الرئيس أو النائب)', Status: 'WAITING', Skip_Reason: '' });

  var version = num_(r.Version, 0) + 1;
  withLock_(function () {
    update_('POSITION_CHANGE_REQUESTS', id, { Version: String(version), Status: 'IN_APPROVAL', Submitted_At: nowIso_(), Decided_At: '' }, ctx.user.User_ID);
    writeChain_('PCR', id, version, steps, ctx.user.User_ID);
  });
  event_(ctx, 'PCR', id, version > 1 ? 'RESUBMITTED' : 'SUBMITTED', '', { version: version });
  audit_(ctx, { entityType: 'PCR', entityId: id, action: 'SUBMIT', newValue: 'v' + version });
  var next = activateNext_(ctx, 'PCR', id, version, r.Requester_User_ID, 'طلب وظيفة جديدة محتاج رأيك',
    id + ' — ' + pcrTitle_(r) + ' من ' + ctx.user.Full_Name_AR);
  warnIfNobody_(next, 'PCR', id);
  var st = statusFromStep_(next);
  withLock_(function () { update_('POSITION_CHANGE_REQUESTS', id, { Status: st }, 'SYSTEM'); });
  return { PCR_ID: id, Status: st };
}

/** p = { PCR_ID, action: APPROVE|RETURN|REJECT, comment, hr: { HR_Recommendation, Proposed_Grade, HR_Notes } } */
function pcrAction_(ctx, p) {
  var id = str_(p.PCR_ID);
  var r = get_('POSITION_CHANGE_REQUESTS', id);
  if (!r) throw userError_('الطلب غير موجود.');
  if (PCR_OPEN_.indexOf(r.Status) < 0) throw userError_('الطلب مش في مرحلة اعتماد.');
  var step = currentStep_('PCR', id, r.Version);
  var action = str_(p.action), comment = str_(p.comment);
  var onBehalf = boardOnBehalf_(ctx, step, p);
  if (!onBehalf && !canActOn_(ctx, step, r.Requester_User_ID)) throw userError_('الطلب مش عندك دلوقتي، أو اتاخد فيه قرار بالفعل.');
  if (onBehalf) comment = onBehalf;
  var title = pcrTitle_(r);

  if (action === 'RETURN' || action === 'REJECT') {
    if (comment.length < 3) throw userError_(action === 'RETURN' ? 'اكتب المطلوب تعديله.' : 'اكتب سبب الرفض.');
    decideStep_(ctx, step, action === 'RETURN' ? 'RETURNED' : 'REJECTED', comment);
    cancelOpenSteps_('PCR', id, r.Version);
    withLock_(function () {
      update_('POSITION_CHANGE_REQUESTS', id, action === 'RETURN' ? { Status: 'RETURNED' } : { Status: 'REJECTED', Decided_At: nowIso_() }, ctx.user.User_ID);
    });
    event_(ctx, 'PCR', id, action === 'RETURN' ? 'RETURNED' : 'REJECTED', comment, { step: step.Label });
    notify_([r.Requester_User_ID], action === 'RETURN' ? 'طلب الوظيفة الجديدة رجع لك للتعديل' : 'طلب الوظيفة الجديدة اترفض',
      id + ' — ' + title + ': ' + comment, 'PCR', id, true);
    return { PCR_ID: id, Status: action === 'RETURN' ? 'RETURNED' : 'REJECTED' };
  }
  if (action !== 'APPROVE') throw userError_('إجراء غير معروف.');

  var snap = null;
  stepUnchanged_(step);
  if (step.Step_Type === 'HR') {
    var hr = p.hr || {};
    var rec = str_(hr.HR_Recommendation);
    if (rec.length < 5) throw userError_('اكتب توصية HR.');
    var patch = { HR_Recommendation: rec, HR_Notes: str_(hr.HR_Notes) };
    var grade = str_(hr.Proposed_Grade);
    if (grade && grade !== r.Proposed_Grade) {
      if (!hasAnyRole_(ctx, [ROLE.HR_SECTOR])) throw userError_('تحديد الدرجة لمدير قطاع الموارد البشرية بس.');
      if (!get_('GRADES', grade)) throw userError_('الدرجة غير موجودة.');
      patch.Proposed_Grade = grade;
    }
    var res;
    withLock_(function () { res = update_('POSITION_CHANGE_REQUESTS', id, patch, ctx.user.User_ID); });
    auditDiff_(ctx, 'PCR', id, res.before, res.after, 'HR review');
    snap = patch;
  }
  decideStep_(ctx, step, 'APPROVED', comment, snap);
  event_(ctx, 'PCR', id, 'APPROVED_STEP', comment, { step: step.Label });

  var next = activateNext_(ctx, 'PCR', id, r.Version, r.Requester_User_ID, 'طلب وظيفة جديدة محتاج رأيك',
    id + ' — ' + title + ' (من ' + (userNames_()[r.Requester_User_ID] || '') + ')');
  warnIfNobody_(next, 'PCR', id);
  if (next) {
    var st = statusFromStep_(next);
    withLock_(function () { update_('POSITION_CHANGE_REQUESTS', id, { Status: st }, ctx.user.User_ID); });
    notify_([r.Requester_User_ID], 'طلب الوظيفة الجديدة اتقدم خطوة', id + ' — دلوقتي عند: ' + next.Label, 'PCR', id, false);
    return { PCR_ID: id, Status: st };
  }
  return finalizePcr_(ctx, id);
}

/** Final approval: create job (if new) and the position in the active org version. */
function finalizePcr_(ctx, id) {
  var r = get_('POSITION_CHANGE_REQUESTS', id);
  var posId, jobCode = r.Job_Code;
  var unit = get_('ORG_UNITS', r.Org_Unit_ID) || {};
  var reportsTo = r.Reports_To_Position_ID || unit.Head_Position_ID || '';
  withLock_(function () {
    if (!jobCode) {
      jobCode = nextId_('JOB');
      insert_('JOBS', { Job_Code: jobCode, Job_Title_AR: r.Proposed_Title, Job_Title_EN: '', Job_Family: '', Job_Level: '',
        Grade_Code: r.Proposed_Grade || '', Current_JD_Version: '', Status: 'Active', Effective_From: today_(), Effective_To: '' }, ctx.user.User_ID);
      jdFromPcr_(ctx.user.User_ID, jobCode, r);
    }
    posId = nextId_('POSITION');
    insert_('POSITIONS', { Position_ID: posId, Org_Version_ID: activeVersion_(), Job_Code: jobCode,
      Position_Title: r.Job_Code && r.Proposed_Title ? r.Proposed_Title : '', Org_Unit_ID: r.Org_Unit_ID,
      Reports_To_Position_ID: reportsTo, Location_ID: r.Location_ID, Is_Head_Of_Unit: 'N',
      Structural_HC: r.Number_Of_Positions, HC_Basis: 'MANPOWER_PLAN', Occupied_HC: '0', Occupied_Updated_At: '',
      Occupied_Updated_By: '', Status: 'Active', Effective_From: today_(), Effective_To: '' }, ctx.user.User_ID);
    insert_('POSITION_HISTORY', { History_ID: nextId_('POSITION_HISTORY'), Position_ID: posId, Field: 'CREATED', Old_Value: '',
      New_Value: 'Structural_HC=' + r.Number_Of_Positions, Reason: 'طلب وظيفة جديدة ' + id }, ctx.user.User_ID);
    update_('POSITION_CHANGE_REQUESTS', id, { Status: 'APPROVED', Decided_At: nowIso_(), Created_Position_ID: posId,
      Job_Code: jobCode }, ctx.user.User_ID);
  });
  event_(ctx, 'PCR', id, 'APPROVED', '', { position: posId, job: jobCode });
  audit_(ctx, { entityType: 'POSITION', entityId: posId, action: 'CREATE_FROM_PCR', newValue: id });
  notify_([r.Requester_User_ID], 'الوظيفة الجديدة اتعتمدت 🎉', pcrTitle_(r) + ' اتضافت للهيكل (' + posId +
    '). تقدر دلوقتي ترفع طلب توظيف عليها.', 'PCR', id, true);
  return { PCR_ID: id, Status: 'APPROVED', Position_ID: posId };
}

function pcrCancel_(ctx, p) {
  var id = str_(p.PCR_ID);
  var r = get_('POSITION_CHANGE_REQUESTS', id);
  if (!r) throw userError_('الطلب غير موجود.');
  if (r.Requester_User_ID !== ctx.user.User_ID && !hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('الإلغاء لصاحب الطلب أو HR.');
  if (['DRAFT', 'RETURNED'].concat(PCR_OPEN_).indexOf(r.Status) < 0) throw userError_('الطلب مينفعش يتلغي في حالته الحالية.');
  var reason = str_(p.comment);
  if (r.Status !== 'DRAFT' && reason.length < 3) throw userError_('اكتب سبب الإلغاء.');
  cancelOpenSteps_('PCR', id, r.Version);
  withLock_(function () { update_('POSITION_CHANGE_REQUESTS', id, { Status: 'CANCELLED', Decided_At: nowIso_() }, ctx.user.User_ID); });
  event_(ctx, 'PCR', id, 'CANCELLED', reason, null);
  return { PCR_ID: id, Status: 'CANCELLED' };
}

function pcrGet_(ctx, p) {
  var r = get_('POSITION_CHANGE_REQUESTS', p.PCR_ID);
  if (!r || !canViewPcr_(ctx, r)) throw userError_('الطلب غير موجود أو مالكش صلاحية تشوفه.');
  var names = userNames_();
  var unit = get_('ORG_UNITS', r.Org_Unit_ID) || {};
  var rt = r.Reports_To_Position_ID ? get_('POSITIONS', r.Reports_To_Position_ID) : null;
  var loc = get_('LOCATIONS', r.Location_ID) || {};
  r.requesterName = names[r.Requester_User_ID] || '';
  r.unitName = unit.Name_AR || '';
  r.reportsToTitle = rt ? (rt.Position_Title || (get_('JOBS', rt.Job_Code) || {}).Job_Title_AR || '') : '';
  r.locationName = loc.Name_AR || '';
  r.title = pcrTitle_(r);
  var step = PCR_OPEN_.indexOf(r.Status) >= 0 ? currentStep_('PCR', r.PCR_ID, r.Version) : null;
  var canAct = canActOn_(ctx, step, r.Requester_User_ID);
  var mine = r.Requester_User_ID === ctx.user.User_ID;
  return { pcr: r, chain: r.Version !== '0' ? chainView_(ctx, 'PCR', r.PCR_ID, r.Version, r.Requester_User_ID) : [],
    events: eventsFor_('PCR', r.PCR_ID), currentStep: step ? step.Label : '',
    can: { edit: mine && ['DRAFT', 'RETURNED'].indexOf(r.Status) >= 0,
      cancel: (mine || hasAnyRole_(ctx, HR_ADMIN_ROLES)) && ['DRAFT', 'RETURNED'].concat(PCR_OPEN_).indexOf(r.Status) >= 0,
      act: canAct, hrStep: canAct && step.Step_Type === 'HR', editGrade: hasAnyRole_(ctx, [ROLE.HR_SECTOR]),
      boardOnBehalf: !canAct && !!step && step.Step_Type === 'BOARD' && hasAnyRole_(ctx, [ROLE.HR_SECTOR]) } };
}

/** p = { box: 'mine'|'toApprove'|'all' } */
function pcrList_(ctx, p) {
  p = p || {};
  var me = ctx.user.User_ID, box = str_(p.box) || 'mine';
  var rows;
  if (box === 'toApprove') {
    var ids = {};
    where_('APPROVAL_INSTANCES', function (a) { return a.Entity_Type === 'PCR' && a.Status === 'PENDING'; }).forEach(function (a) {
      var r = get_('POSITION_CHANGE_REQUESTS', a.Entity_ID);
      if (r && r.Version === a.Entity_Version && eligibleUsers_(a.Authority, r.Requester_User_ID).indexOf(me) >= 0) ids[a.Entity_ID] = 1;
    });
    rows = Object.keys(ids).map(function (k) { return get_('POSITION_CHANGE_REQUESTS', k); });
  } else if (box === 'all') {
    if (!isRecRole_(ctx)) throw userError_('مالكش صلاحية.');
    rows = where_('POSITION_CHANGE_REQUESTS', function (r) { return r.Version !== '0'; });
  } else {
    rows = where_('POSITION_CHANGE_REQUESTS', function (r) { return r.Requester_User_ID === me; });
  }
  var names = userNames_();
  var units = {}; all_('ORG_UNITS').forEach(function (u) { units[u.Org_Unit_ID] = u.Name_AR; });
  return rows.map(function (r) {
    var step = PCR_OPEN_.indexOf(r.Status) >= 0 ? currentStep_('PCR', r.PCR_ID, r.Version) : null;
    return { PCR_ID: r.PCR_ID, Status: r.Status, title: pcrTitle_(r), unitName: units[r.Org_Unit_ID] || '',
      Number_Of_Positions: r.Number_Of_Positions, requesterName: names[r.Requester_User_ID] || '',
      Submitted_At: r.Submitted_At, Created_At: r.Created_At, currentStep: step ? step.Label : '',
      Created_Position_ID: r.Created_Position_ID };
  }).sort(function (a, b) { return (b.Submitted_At || b.Created_At) < (a.Submitted_At || a.Created_At) ? -1 : 1; });
}
