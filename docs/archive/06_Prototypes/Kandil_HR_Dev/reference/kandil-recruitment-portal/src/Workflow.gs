/**
 * Workflow.gs — shared engine for approval chains, timeline events and notifications.
 * Used by recruitment requests (REQUEST) and position change requests (PCR).
 *
 * Step statuses: WAITING (queued) → PENDING (current) → APPROVED / RETURNED / REJECTED
 *                SKIPPED (resolved away, with reason) · CANCELLED (request returned/rejected/cancelled)
 * Authority:     POSITION:<Position_ID>  or  ROLE:<CODE>|<CODE>
 */

var UNIT_HEAD_LABEL = { SECTION: 'رئيس القسم', SUB_UNIT: 'مسؤول الوحدة', DEPARTMENT: 'مدير الإدارة', SECTOR: 'مدير القطاع' };
var HR_APPROVER_ROLES = 'ROLE:HR_MANAGER|HR_SECTOR_MANAGER';

/* ---------------- events & notifications ---------------- */

function event_(ctx, entityType, entityId, eventCode, comment, data) {
  EVDIRTY_[evKey_(entityType, entityId)] = 1;            // dropped after the write reaches the sheet
  withLock_(function () {
    insert_('EVENTS', { Event_ID: nextId_('EVENT'), Entity_Type: entityType, Entity_ID: entityId, Event: eventCode,
      Actor_ID: ctx && ctx.user ? ctx.user.User_ID : 'SYSTEM', Comment: str_(comment),
      Data_JSON: data ? JSON.stringify(data) : '' }, ctx && ctx.user ? ctx.user.User_ID : 'SYSTEM');
  });
}

/**
 * v0.35.0: an entity's timeline is cached on its own (6 hours) — a request or interview page no longer reads the whole
 * EVENTS sheet. A new event drops the entity's copy once it is written; a wipe changes the epoch in the key.
 */
function evKey_(type, id) {
  if (REPO_.evEpoch === undefined || REPO_.evEpoch === null) tcGens_();
  return 'EV_' + (REPO_.evEpoch || '0') + '_' + type + '_' + id;
}
function eventsFor_(entityType, entityId) {
  var names = userNames_(), c = tcCache_(), key = evKey_(entityType, entityId), list = null;
  if (c && !EVDIRTY_[key]) { try { var hit = c.get(key); if (hit) list = JSON.parse(hit); } catch (e) { list = null; } }
  if (!list) {
    list = where_('EVENTS', function (e) { return e.Entity_Type === entityType && e.Entity_ID === entityId; })
      .sort(function (a, b) { return a.Event_ID < b.Event_ID ? -1 : 1; });
    if (c && !EVDIRTY_[key] && !LOCK_HELD_) { try { var s = JSON.stringify(list); if (s.length < 90000) c.put(key, s, 600); } catch (e) {} }   // 10 minutes: a page read in the same second as a new event heals quickly
  }
  return list.map(function (e) { e.actorName = names[e.Actor_ID] || (e.Actor_ID === 'SYSTEM' ? 'النظام' : e.Actor_ID); return e; });
}

function userNames_() {
  var m = {};
  all_('USERS').forEach(function (u) { m[u.User_ID] = u.Full_Name_AR; });
  return m;
}

/**
 * In-app notification for each user; optional email when allowed by config and quota.
 * Email never blocks the business action.
 */
/**
 * v0.35.0: inside notifyBatch_ (the daily job's steps) notifications are collected and written together under one lock
 * at the end, and their e-mails go out after it — instead of one lock (about a second) per notification.
 */
var NB_ = null;
function notifyBatch_(fn) {
  if (NB_) return fn();
  NB_ = [];
  try { return fn(); }
  finally { var queued = NB_; NB_ = null; notifyFlush_(queued); }      // written even when the step stopped half-way
}
function notifyFlush_(queued) {
  if (queued.length) {
    withLock_(function () {
      var rows = [];
      queued.forEach(function (q) { q.list.forEach(function (u) { rows.push({ User_ID: u, Title: q.title, Body: q.body || '', Link_Type: q.linkType || '', Link_ID: q.linkId || '', Read_At: '' }); }); });
      var ids = nextIds_('NOTIFICATION', rows.length);
      rows.forEach(function (x, i) { x.Notification_ID = ids[i]; });
      insertMany_('NOTIFICATIONS', rows, 'SYSTEM');
    });
    queued.forEach(function (q) { if (q.email) notifyMail_(q.list, q.title, q.body); });
  }
}

function notify_(userIds, title, body, linkType, linkId, email) {
  var ids = {};
  (userIds || []).forEach(function (u) { if (u) ids[u] = 1; });
  var list = Object.keys(ids);
  if (!list.length) return;
  if (NB_) { NB_.push({ list: list, title: title, body: body, linkType: linkType, linkId: linkId, email: email }); return; }
  withLock_(function () {
    var nIds = nextIds_('NOTIFICATION', list.length);
    insertMany_('NOTIFICATIONS', list.map(function (u, i) {
      return { Notification_ID: nIds[i], User_ID: u, Title: title, Body: body || '', Link_Type: linkType || '',
        Link_ID: linkId || '', Read_At: '' };
    }), 'SYSTEM');
  });
  if (email) notifyMail_(list, title, body);
}

function notifyMail_(list, title, body) {
  if (!cfg_('EMAIL_APPROVALS', true)) return;
  list.forEach(function (u) {
    try {
      var usr = get_('USERS', u);
      if (!usr || usr.Status !== 'Active' || !usr.Email) return;
      if (!mailOk_()) return;   // EMAIL_DAILY_BUDGET reached, or keep headroom for login codes
      var lang = userLang_(usr), t = tr_(title, lang);
      sendMail_({ to: usr.Email, subject: tr_(title + ' — بوابة التوظيف قنديل مصر', lang), name: 'Kandil Recruitment Portal',
        htmlBody: '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' +
          '<b>' + escHtml_(t) + '</b><br>' + escHtml_(tr_(body || '', lang)) +
          '<br><br><span style="color:#6F7B85">' + tr_('افتح بوابة التوظيف للمتابعة.', lang) + '</span></div>' });
      mailSent_();
    } catch (e) { console.warn('notify email failed: ' + e); }
  });
}

function escHtml_(s) {
  return str_(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

function notificationsList_(ctx) {
  return where_('NOTIFICATIONS', function (n) { return n.User_ID === ctx.user.User_ID; })
    .sort(function (a, b) { return a.Notification_ID < b.Notification_ID ? 1 : -1; }).slice(0, 60);
}

function notificationsRead_(ctx, p) {
  var mine = where_('NOTIFICATIONS', function (n) {
    return n.User_ID === ctx.user.User_ID && n.Read_At === '' && (!p.Notification_ID || n.Notification_ID === p.Notification_ID);
  });
  withLock_(function () { mine.forEach(function (n) { update_('NOTIFICATIONS', n.Notification_ID, { Read_At: nowIso_() }, ctx.user.User_ID); }); });
  return { read: mine.length };
}

/* ---------------- authority resolution ---------------- */

/** Active users who can act on an authority string, excluding `excludeUserId` (no self-approval). */
function eligibleUsers_(authority, excludeUserId) {
  var out = {};
  if (authority.indexOf('POSITION:') === 0) {
    var pos = authority.slice(9);
    where_('USERS', function (u) { return u.Status === 'Active' && u.Position_ID === pos; }).forEach(function (u) { out[u.User_ID] = 1; });
    where_('DELEGATIONS', function (d) {
      return d.From_Position_ID === pos && d.Status === 'Active' && isEffective_(d.Effective_From, d.Effective_To) && dlgScopeHas_(d, 'APPROVALS');
    }).forEach(function (d) {
      var u = get_('USERS', d.To_User_ID);
      if (u && u.Status === 'Active') out[u.User_ID] = 1;
    });
  } else if (authority.indexOf('ROLE:') === 0) {
    var roles = authority.slice(5).split('|');
    where_('USER_ROLES', function (r) { return roles.indexOf(r.Role_Code) >= 0 && isEffective_(r.Effective_From, r.Effective_To); })
      .forEach(function (r) {
        var u = get_('USERS', r.User_ID);
        if (u && u.Status === 'Active') out[u.User_ID] = 1;
      });
  }
  delete out[excludeUserId];
  return Object.keys(out);
}

function unitAncestors_(unitId) {
  var chain = [], seen = {}, u = get_('ORG_UNITS', unitId);
  while (u && !seen[u.Org_Unit_ID]) {
    seen[u.Org_Unit_ID] = 1;
    chain.push(u);
    u = u.Parent_Org_Unit_ID ? get_('ORG_UNITS', u.Parent_Org_Unit_ID) : null;
  }
  return chain;
}

/**
 * Line-management chain above the requester for a target unit, up to and including the sector head.
 * Levels at or below the requester's own headed unit are not included; missing or vacant heads are
 * recorded as SKIPPED; consecutive steps resolving to the same people are collapsed.
 */
var VACANT_HEADS_ = [];
/** After a chain is written: tell HR about the head positions it skipped because nobody holds them. */
function vacantHeadsAlert_(entityType, entityId) {
  var list = VACANT_HEADS_; VACANT_HEADS_ = [];
  if (!list.length) return;
  notify_(eligibleUsers_('ROLE:' + HR_ADMIN_ROLES.join('|'), ''), 'وظيفة رئيس وحدة شاغرة',
    entityId + ' طلع للمستوى الأعلى لأن «' + list.join('، ') + '» شاغرة. عيّن حد في الوظيفة أو فعّل تفويض.', entityType, entityId, false);
}
function buildLineChain_(targetUnitId, requester, stepType) {
  var anc = unitAncestors_(targetUnitId);
  var headed = headedUnits_(requester);
  var start = 0;
  anc.forEach(function (u, i) { if (headed.indexOf(u.Org_Unit_ID) >= 0) start = i + 1; });
  var steps = [], lastKey = null;
  for (var i = start; i < anc.length; i++) {
    var u = anc[i];
    if (u.Unit_Type === 'COMPANY') break;
    var label = (UNIT_HEAD_LABEL[u.Unit_Type] || 'مدير الوحدة') + ' — ' + u.Name_AR;
    var step = { Step_Type: stepType, Authority: u.Head_Position_ID ? 'POSITION:' + u.Head_Position_ID : '', Label: label,
      Status: 'WAITING', Skip_Reason: '' };
    if (!u.Head_Position_ID) { step.Status = 'SKIPPED'; step.Skip_Reason = 'لا توجد وظيفة مدير محددة لهذه الوحدة'; }
    else {
      var holders = eligibleUsers_(step.Authority, '');
      var elig = holders.filter(function (x) { return x !== requester.User_ID; });
      if (!holders.length) {
        step.Status = 'SKIPPED'; step.Skip_Reason = 'الوظيفة شاغرة ولا يوجد تفويض ساري';
        // v0.36.0 (CHG-78): the request goes up a level, and HR is told the head position is empty
        VACANT_HEADS_.push(label);
      }
      else if (!elig.length) { step.Status = 'SKIPPED'; step.Skip_Reason = 'صاحب الطلب نفسه — لا اعتماد ذاتي'; }
      else {
        var key = elig.slice().sort().join(',');
        if (key === lastKey) { step.Status = 'SKIPPED'; step.Skip_Reason = 'نفس المعتمد في الخطوة السابقة'; }
        lastKey = key;
      }
    }
    steps.push(step);
    if (u.Unit_Type === 'SECTOR') break;
  }
  return steps;
}

/** Write a chain for an entity version. Steps: [{Step_Type, Authority, Label, Status, Skip_Reason}] */
function writeChain_(entityType, entityId, version, steps, actorId) {
  withLock_(function () {
    var ids = nextIds_('APPROVAL', steps.length);
    insertMany_('APPROVAL_INSTANCES', steps.map(function (s, i) {
      return { Approval_ID: ids[i], Entity_Type: entityType, Entity_ID: entityId, Entity_Version: String(version),
        Sequence: String(i + 1), Step_Type: s.Step_Type, Authority: s.Authority, Label: s.Label, Status: s.Status,
        Activated_At: '', Decision_By: '', Decision_At: '', Comment: '', Skip_Reason: s.Skip_Reason || '', Snapshot_JSON: '' };
    }), actorId);
  });
  vacantHeadsAlert_(entityType, entityId);
}

function chainOf_(entityType, entityId, version) {
  return where_('APPROVAL_INSTANCES', function (a) {
    return a.Entity_Type === entityType && a.Entity_ID === entityId && a.Entity_Version === String(version);
  }).sort(function (a, b) { return num_(a.Sequence, 0) - num_(b.Sequence, 0); });
}

function currentStep_(entityType, entityId, version) {
  return chainOf_(entityType, entityId, version).filter(function (a) { return a.Status === 'PENDING'; })[0] || null;
}

/** Activate the next WAITING step; notifies eligible users. Returns the step or null when the chain is done. */
function activateNext_(ctx, entityType, entityId, version, requesterId, title, body) {
  var next = chainOf_(entityType, entityId, version).filter(function (a) { return a.Status === 'WAITING'; })[0];
  if (!next) return null;
  withLock_(function () { update_('APPROVAL_INSTANCES', next.Approval_ID, { Status: 'PENDING', Activated_At: nowIso_() }, 'SYSTEM'); });
  next.Status = 'PENDING';
  var who = eligibleUsers_(next.Authority, requesterId);
  notify_(who, title, body, entityType, entityId, true);
  return next;
}

function cancelOpenSteps_(entityType, entityId, version) {
  var open = chainOf_(entityType, entityId, version).filter(function (a) { return a.Status === 'WAITING' || a.Status === 'PENDING'; });
  withLock_(function () { open.forEach(function (a) { update_('APPROVAL_INSTANCES', a.Approval_ID, { Status: 'CANCELLED' }, 'SYSTEM'); }); });
}

function decideStep_(ctx, step, status, comment, snapshot) {
  withLock_(function () {
    stepUnchanged_(step);      // two approvers clicking at the same moment: only the first decision counts
    update_('APPROVAL_INSTANCES', step.Approval_ID, { Status: status, Decision_By: ctx.user.User_ID, Decision_At: nowIso_(),
      Comment: str_(comment), Snapshot_JSON: snapshot ? JSON.stringify(snapshot) : '' }, ctx.user.User_ID);
  });
}

/** Throws when the step was decided (or moved on) since the caller read it. Reads fresh data under the lock. */
function stepUnchanged_(step) {
  var cur = withLock_(function () { return get_('APPROVAL_INSTANCES', step.Approval_ID); });
  if (!cur || cur.Status !== step.Status) throw userError_('الخطوة دي اتاخد فيها قرار بالفعل من حد تاني — افتح الطلب من جديد.');
}

function canActOn_(ctx, step, requesterId) {
  if (!step || step.Status !== 'PENDING') return false;
  return eligibleUsers_(step.Authority, requesterId).indexOf(ctx.user.User_ID) >= 0;
}

/** Steps with display info: eligible people names and a canAct flag for the viewer. */
function chainView_(ctx, entityType, entityId, version, requesterId) {
  var names = userNames_();
  return chainOf_(entityType, entityId, version).map(function (a) {
    var elig = a.Authority ? eligibleUsers_(a.Authority, requesterId) : [];
    return { Approval_ID: a.Approval_ID, Sequence: a.Sequence, Step_Type: a.Step_Type, Label: a.Label, Status: a.Status,
      Skip_Reason: a.Skip_Reason, Comment: a.Comment, Activated_At: a.Activated_At, Decision_At: a.Decision_At,
      decidedBy: names[a.Decision_By] || '', people: elig.map(function (u) { return names[u] || u; }),
      canAct: a.Status === 'PENDING' && elig.indexOf(ctx.user.User_ID) >= 0,
      waitDays: a.Status === 'PENDING' ? stepWaitDays_(a) : 0 };             // v0.41: working days, as the deadline counts them
  });
}

/**
 * Rule check (AUTHORITY_RULES, effective-dated, Active = Y).
 * Rule_Type: CEO_REQUIRED | BOARD_REQUIRED. Scope_Type: ALL | ORG_UNIT (the unit or anything under it) | JOB |
 * TARGET_REPORTS_TO with Scope_Value COMPANY_HEAD (positions reporting directly to the company head = CEO).
 * t = { unitIds: [target unit + ancestors], jobCode, positionIds: [target positions] }
 */
function ruleApplies_(process, ruleType, t) {
  var heads = null;
  return where_('AUTHORITY_RULES', function (r) {
    if (r.Process !== process || r.Rule_Type !== ruleType || r.Active !== 'Y') return false;
    if (!isEffective_(r.Effective_From, r.Effective_To)) return false;
    if (r.Scope_Type === 'ALL') return true;
    if (r.Scope_Type === 'ORG_UNIT') return t.unitIds.indexOf(r.Scope_Value) >= 0;
    if (r.Scope_Type === 'JOB') return r.Scope_Value === t.jobCode;
    if (r.Scope_Type === 'TARGET_REPORTS_TO' && r.Scope_Value === 'COMPANY_HEAD') {
      heads = heads || where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Unit_Type === 'COMPANY' && u.Head_Position_ID; })
        .map(function (u) { return u.Head_Position_ID; });
      return (t.positionIds || []).some(function (pid) {
        var pos = get_('POSITIONS', pid);
        return pos && heads.indexOf(pos.Reports_To_Position_ID) >= 0;
      });
    }
    return false;
  }).length > 0;
}

/** Back-compat wrapper. */
function ceoRuleApplies_(process, unitIds, jobCode) {
  return ruleApplies_(process, 'CEO_REQUIRED', { unitIds: unitIds, jobCode: jobCode, positionIds: [] });
}
