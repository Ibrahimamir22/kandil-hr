/**
 * Ceo.gs — v0.36.0: the CEO's approvals (CHG-74, CHG-75, CHG-76, CHG-78).
 *
 * What waits for the CEO:
 *   • CEO_APPROVALS — decisions the portal will not take without him: giving or removing the CEO / Board roles, putting a
 *     user on the head position of the company or a sector, and a delegation of the company head's authority;
 *   • the approval steps of requests and new-position requests that are his (ROLE:CEO or his position).
 *
 * How he approves — without signing in each time:
 *   • once, signed in on his phone, he marks it a trusted device and chooses a PIN (4–6 digits, stored hashed). The phone
 *     keeps a random device key (only its hash is on the server). It lasts CEO_DEVICE_DAYS (90) days; the owner and the
 *     HR Sector Manager see the days left and are reminded at 14, 7 and 1 day;
 *   • the HR Sector Manager sends him the portal link (?ceo=1) on WhatsApp; the page asks for the PIN (device key + PIN —
 *     the link alone opens nothing), lists what is waiting and records each decision with the device;
 *   • a wrong PIN 5 times pauses the device 15 minutes and tells the owner.
 *   He can also decide from the portal itself when signed in («موافقات الرئيس التنفيذي»).
 *
 * Oversight: a monthly report to the CEO (decisions under delegation, two steps by one person, role and delegation
 * changes) and a quarterly access review by the HR Sector Manager.
 */

var CEO_KINDS_ = { ROLE: 'أدوار الإدارة العليا', HEAD: 'رئيس الشركة أو مدير قطاع', DELEGATION: 'تفويض صلاحية الرئيس التنفيذي' };
var CEO_SESSION_MIN_ = 30;

function ceoUsers_() {
  return roleHolders_(ROLE.CEO).filter(function (u) { var x = get_('USERS', u); return x && x.Status === 'Active' && !isDemoUser_(x); });
}
function ceoAdminRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }

/** The head position of the company / a sector (giving it to someone needs the CEO). */
function isTopHeadPosition_(posId) {
  posId = str_(posId);
  return !!posId && where_('ORG_UNITS', function (u) {
    return u.Status === 'Active' && u.Head_Position_ID === posId && (u.Unit_Type === 'COMPANY' || u.Unit_Type === 'SECTOR');
  }).length > 0;
}
function isCompanyHeadPosition_(posId) {
  posId = str_(posId);
  return !!posId && where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Head_Position_ID === posId && u.Unit_Type === 'COMPANY'; }).length > 0;
}

/**
 * Put a decision in the CEO's queue. Returns the row, or null when the portal has no CEO yet (the very first CEO is
 * set up by the owner directly — recorded in the audit log).
 */
function ceoQueue_(ctx, kind, refId, title, summary, payload) {
  if (!ceoUsers_().length) {
    audit_(ctx, { entityType: 'CEO_APPROVAL', entityId: refId, action: 'NO_CEO_DIRECT', newValue: kind, reason: title });
    return null;
  }
  var open = where_('CEO_APPROVALS', function (a) { return a.Status === 'PENDING' && a.Kind === kind && a.Ref_ID === str_(refId); })[0];
  var row;
  withLock_(function () {
    if (open) update_('CEO_APPROVALS', open.CA_ID, { Status: 'CANCELLED', Comment: 'اتبعت طلب أحدث' }, ctx.user.User_ID);
    row = insert_('CEO_APPROVALS', { CA_ID: nextId_('CEO_APPROVAL'), Kind: kind, Ref_ID: str_(refId), Title: str_(title).slice(0, 200),
      Summary: str_(summary).slice(0, 1000), Payload_JSON: JSON.stringify(payload || {}), Requested_By: ctx.user.User_ID, Status: 'PENDING',
      Decided_By: '', Decided_At: '', Decided_Via: '', Device_ID: '', Comment: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'CEO_APPROVAL', entityId: row.CA_ID, action: 'QUEUED', newValue: kind + ' ' + refId, reason: title });
  notify_(ceoUsers_(), 'مطلوب موافقتك: ' + (CEO_KINDS_[kind] || kind), str_(title), 'CEO', row.CA_ID, false);
  notify_(roleHolders_(ROLE.HR_SECTOR).filter(function (u) { return u !== ctx.user.User_ID; }), 'اتبعت للرئيس التنفيذي للموافقة', str_(title), 'CEO', row.CA_ID, false);
  return row;
}

/** For the owner / HR Sector Manager: what is waiting for the CEO (and what he decided lately). */
function ceoQueueList_(ctx) {
  var names = userNames_();
  return where_('CEO_APPROVALS', function (a) { return a.Status === 'PENDING' || str_(a.Decided_At) >= addDaysIso_(-30); })
    .sort(function (a, b) { return a.CA_ID < b.CA_ID ? 1 : -1; }).map(function (a) {
      return { id: a.CA_ID, kindName: CEO_KINDS_[a.Kind] || a.Kind, title: a.Title, status: a.Status, by: names[a.Requested_By] || a.Requested_By,
        at: a.Created_At, decidedAt: a.Decided_At, via: a.Decided_Via, comment: a.Comment };
    });
}

/* ---------------- what is waiting ---------------- */

/** The CEO's inbox: queued decisions + approval steps that are his. */
function ceoInbox_(ctx) {
  var me = ctx.user.User_ID, names = userNames_(), out = { items: [], steps: [] };
  where_('CEO_APPROVALS', function (a) { return a.Status === 'PENDING'; }).sort(function (a, b) { return a.CA_ID < b.CA_ID ? -1 : 1; }).forEach(function (a) {
    out.items.push({ id: a.CA_ID, kind: a.Kind, kindName: CEO_KINDS_[a.Kind] || a.Kind, title: a.Title, summary: a.Summary,
      by: names[a.Requested_By] || a.Requested_By, at: a.Created_At });
  });
  find_('APPROVAL_INSTANCES', { Status: 'PENDING' }).forEach(function (a) {
    var def = a.Entity_Type === 'REQUEST' ? { t: 'RECRUITMENT_REQUESTS', title: reqTitle_ } : a.Entity_Type === 'PCR' ? { t: 'POSITION_CHANGE_REQUESTS', title: pcrTitle_ } : null;
    if (!def) return;
    var r = get_(def.t, a.Entity_ID);
    if (!r || r.Version !== a.Entity_Version) return;
    if (eligibleUsers_(a.Authority, r.Requester_User_ID).indexOf(me) < 0) return;
    out.steps.push({ id: a.Approval_ID, type: a.Entity_Type, ref: a.Entity_ID, label: a.Label, title: a.Entity_ID + ' — ' + def.title(r),
      by: names[r.Requester_User_ID] || '', at: a.Activated_At || a.Created_At });
  });
  out.count = out.items.length + out.steps.length;
  return out;
}

/** p = { kind: 'CA' | 'STEP', id, decision: APPROVE | REJECT, comment } */
function ceoDecide_(ctx, p) {
  var decision = str_(p.decision), comment = str_(p.comment).slice(0, 500);
  if (['APPROVE', 'REJECT'].indexOf(decision) < 0) throw userError_('اختار موافقة أو رفض.');
  if (decision === 'REJECT' && comment.length < 3) throw userError_('اكتب سبب الرفض.');
  if (str_(p.kind) === 'STEP') return ceoDecideStep_(ctx, str_(p.id), decision, comment);
  if (!hasAnyRole_(ctx, [ROLE.CEO])) throw userError_('القرار ده للرئيس التنفيذي بس.');
  var a = get_('CEO_APPROVALS', str_(p.id));
  if (!a || a.Status !== 'PENDING') throw userError_('الطلب ده اتاخد فيه قرار أو اتلغى — حدّث الصفحة.');
  var via = ctx.viaDevice ? 'DEVICE' : 'PORTAL';
  var res = null;
  if (decision === 'APPROVE') res = ceoApply_(a);
  withLock_(function () {
    var cur = get_('CEO_APPROVALS', a.CA_ID);
    if (!cur || cur.Status !== 'PENDING') throw userError_('الطلب ده اتاخد فيه قرار — حدّث الصفحة.');
    update_('CEO_APPROVALS', a.CA_ID, { Status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', Decided_By: ctx.user.User_ID, Decided_At: nowIso_(),
      Decided_Via: via, Device_ID: ctx.deviceId || '', Comment: comment }, ctx.user.User_ID);
    if (decision === 'REJECT' && a.Kind === 'DELEGATION') {
      var d = get_('DELEGATIONS', a.Ref_ID);
      if (d && d.Status === 'PENDING_CEO') update_('DELEGATIONS', d.Delegation_ID, { Status: 'Rejected' }, ctx.user.User_ID);
    }
  });
  audit_(ctx, { entityType: 'CEO_APPROVAL', entityId: a.CA_ID, action: decision === 'APPROVE' ? 'CEO_APPROVED' : 'CEO_REJECTED', newValue: a.Kind + ' ' + a.Ref_ID + ' · ' + via, reason: comment });
  notify_([a.Requested_By], decision === 'APPROVE' ? 'الرئيس التنفيذي وافق' : 'الرئيس التنفيذي رفض', a.Title + (comment ? ' — ' + comment : ''), 'CEO', a.CA_ID, true);
  return { ok: true, status: decision, result: res };
}

/** Carry out an approved queued decision, as the person who asked for it (the CEO's approval is the missing piece). */
function ceoApply_(a) {
  var payload = {}; try { payload = JSON.parse(a.Payload_JSON || '{}') || {}; } catch (e) { payload = {}; }
  var asker = get_('USERS', a.Requested_By);
  if (!asker) throw userError_('اللي طلب القرار ده مش موجود — اطلب منه يبعته تاني.');
  var actx = { user: asker, sessionId: 'CEO-APPROVED', ceoApproved: true };
  if (a.Kind === 'ROLE') return usersSetRoles_(actx, payload);
  if (a.Kind === 'HEAD') return usersSave_(actx, payload);
  if (a.Kind === 'DELEGATION') {
    var d = get_('DELEGATIONS', a.Ref_ID);
    if (!d || d.Status !== 'PENDING_CEO') throw userError_('التفويض ده اتلغى أو اتعدّل.');
    withLock_(function () { update_('DELEGATIONS', d.Delegation_ID, { Status: 'Active' }, asker.User_ID); });
    notify_([d.To_User_ID], 'التفويض بقى ساري', 'الرئيس التنفيذي وافق على تفويضك من ' + d.Effective_From + ' لحد ' + d.Effective_To + '.', '', '', true);
    return { delegation: d.Delegation_ID };
  }
  throw userError_('نوع غير معروف.');
}

/** An approval step of a request / new-position request, decided from the CEO page. */
function ceoDecideStep_(ctx, approvalId, decision, comment) {
  var a = get_('APPROVAL_INSTANCES', approvalId);
  if (!a || a.Status !== 'PENDING') throw userError_('الخطوة دي اتاخد فيها قرار — حدّث الصفحة.');
  var p = { action: decision, comment: comment || 'موافقة الرئيس التنفيذي' };
  if (a.Entity_Type === 'REQUEST') { p.Request_ID = a.Entity_ID; return requestAction_(ctx, p); }
  if (a.Entity_Type === 'PCR') { p.PCR_ID = a.Entity_ID; return pcrAction_(ctx, p); }
  throw userError_('نوع غير معروف.');
}

/* ---------------- trusted device + PIN ---------------- */

function ceoPinWeak_(pin) {
  if (!/^\d{4,6}$/.test(pin)) return 'الرقم السري لازم يكون من 4 لـ 6 أرقام.';
  if (/^(\d)\1+$/.test(pin)) return 'الرقم السري مايبقاش رقم واحد متكرر.';
  if ('0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) return 'الرقم السري مايبقاش أرقام ورا بعض.';
  return '';
}
function ceoPinHash_(deviceId, pin) { return hash_('CEO-PIN:' + deviceId + ':' + pin); }

/** The CEO, signed in on his phone, marks it trusted. p = { pin, label } → { key } (kept by the phone only). */
function ceoDeviceCreate_(ctx, p) {
  if (!hasAnyRole_(ctx, [ROLE.CEO]) || ctx.readOnly) throw userError_('الجهاز الموثوق للرئيس التنفيذي بس — من حسابه هو.');
  var pin = latinDigits_(p.pin).replace(/\s+/g, ''), weak = ceoPinWeak_(pin);
  if (weak) throw userError_(weak);
  var days = num_(cfg_('CEO_DEVICE_DAYS', 90), 90), token = randomToken_(), row;
  withLock_(function () {
    var id = nextId_('CEO_DEVICE');
    row = insert_('CEO_DEVICES', { Device_ID: id, User_ID: ctx.user.User_ID, Token_Hash: hash_('CEO-DEV:' + token), Pin_Hash: ceoPinHash_(id, pin),
      Label: str_(p.label).slice(0, 60) || 'موبايل', Expires_At: addDaysIso_(days), Revoked_At: '', Revoked_By: '', Last_Used_At: '', Fails: '0',
      Locked_Until: '', Reminded_Days: '' }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'CEO_DEVICE', entityId: row.Device_ID, action: 'CREATED', newValue: row.Expires_At.slice(0, 10) });
  notify_(roleHolders_(ROLE.OWNER).concat(roleHolders_(ROLE.HR_SECTOR)), 'الرئيس التنفيذي فعّل جهاز موثوق',
    'صالح لحد ' + row.Expires_At.slice(0, 10) + '. تقدر تبعتله لينك الموافقات على الواتساب.', 'CEO', '', false);
  return { key: row.Device_ID + '.' + token, expires: row.Expires_At.slice(0, 10), days: days };
}

/** Devices: the CEO sees his own; the owner / HR Sector Manager see all with the days left. */
function ceoDevices_(ctx) {
  var all = hasAnyRole_(ctx, ceoAdminRoles_()), me = ctx.user.User_ID, names = userNames_(), now = nowIso_();
  if (!all && !hasAnyRole_(ctx, [ROLE.CEO])) throw userError_('مالكش صلاحية.');
  return where_('CEO_DEVICES', function (d) { return all || d.User_ID === me; }).map(function (d) {
    var active = !d.Revoked_At && d.Expires_At > now;
    return { id: d.Device_ID, user: names[d.User_ID] || d.User_ID, label: d.Label, expires: d.Expires_At.slice(0, 10), active: active,
      daysLeft: active ? Math.max(0, Math.ceil((Date.parse(d.Expires_At.slice(0, 10)) - Date.parse(today_())) / 86400000)) : 0,
      lastUsed: d.Last_Used_At, revoked: d.Revoked_At };
  }).sort(function (a, b) { return a.expires < b.expires ? 1 : -1; });
}

function ceoDeviceRevoke_(ctx, p) {
  var d = get_('CEO_DEVICES', str_(p.Device_ID));
  if (!d) throw userError_('الجهاز غير موجود.');
  if (d.User_ID !== ctx.user.User_ID && !hasAnyRole_(ctx, ceoAdminRoles_())) throw userError_('مالكش صلاحية.');
  withLock_(function () { update_('CEO_DEVICES', d.Device_ID, { Revoked_At: nowIso_(), Revoked_By: ctx.user.User_ID }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'CEO_DEVICE', entityId: d.Device_ID, action: 'REVOKED' });
  return { ok: true };
}

/** Days left on the CEO's newest active device (null = none) — shown to the owner / HR Sector Manager. */
function ceoDeviceDaysLeft_() {
  var now = nowIso_(), best = null;
  find_('CEO_DEVICES', {}).forEach(function (d) {
    if (d.Revoked_At || d.Expires_At <= now) return;
    var left = Math.max(0, Math.ceil((Date.parse(d.Expires_At.slice(0, 10)) - Date.parse(today_())) / 86400000));
    if (best === null || left > best) best = left;
  });
  return best;
}

/* ---------------- the CEO page (public: device key + PIN) ---------------- */

function ceoDeviceFromKey_(key) {
  var m = /^(CED-\d+)\.([A-Za-z0-9]{20,})$/.exec(str_(key));
  if (!m) throw userError_('الجهاز ده مش متسجل — افتح البوابة من موبايلك وفعّل «جهاز موثوق».');
  var d = get_('CEO_DEVICES', m[1]);
  if (!d || d.Token_Hash !== hash_('CEO-DEV:' + m[2])) throw userError_('الجهاز ده مش متسجل — افتح البوابة من موبايلك وفعّل «جهاز موثوق».');
  if (d.Revoked_At) throw userError_('الجهاز ده اتلغى — فعّل جهاز موثوق جديد من البوابة.');
  if (d.Expires_At <= nowIso_()) throw userError_('صلاحية الجهاز انتهت (90 يوم) — افتح البوابة من موبايلك وفعّله تاني.');
  var u = get_('USERS', d.User_ID);
  if (!u || u.Status !== 'Active' || realRoles_(u.User_ID).indexOf(ROLE.CEO) < 0) throw userError_('الحساب ده مش حساب الرئيس التنفيذي.');
  return { d: d, u: u };
}

/** p = { key, pin } → { session } valid CEO_SESSION_MIN_ minutes. */
function ceoUnlock_(p) {
  var D = ceoDeviceFromKey_(p.key), d = D.d, pin = latinDigits_(p.pin).replace(/\s+/g, ''), res = null, locked = false;
  withLock_(function () {
    var cur = get_('CEO_DEVICES', d.Device_ID);
    if (str_(cur.Locked_Until) && cur.Locked_Until > nowIso_()) { locked = true; return; }
    if (ceoPinHash_(d.Device_ID, pin) !== cur.Pin_Hash) {
      var f = num_(cur.Fails, 0) + 1;
      update_('CEO_DEVICES', d.Device_ID, f >= 5 ? { Fails: '0', Locked_Until: addMinutesIso_(15) } : { Fails: String(f) }, 'CEO-PAGE');
      if (f >= 5) locked = 'now';
      return;
    }
    update_('CEO_DEVICES', d.Device_ID, { Fails: '0', Last_Used_At: nowIso_() }, D.u.User_ID);
    var token = randomToken_();
    tcCache_().put('CEOS_' + hash_(token), d.Device_ID, CEO_SESSION_MIN_ * 60);
    res = { session: token, name: D.u.Full_Name_AR, minutes: CEO_SESSION_MIN_ };
  });
  if (locked === 'now') notify_(roleHolders_(ROLE.OWNER), 'محاولات غلط على جهاز الرئيس التنفيذي', '5 أرقام سرية غلط ورا بعض — الجهاز اتوقف 15 دقيقة.', 'CEO', '', true);
  if (locked) throw userError_('الجهاز متوقف 15 دقيقة بعد محاولات غلط.');
  if (!res) { audit_(null, { userId: D.u.User_ID, entityType: 'CEO_DEVICE', entityId: d.Device_ID, action: 'PIN_WRONG' }); throw userError_('الرقم السري غلط.'); }
  audit_(null, { userId: D.u.User_ID, entityType: 'CEO_DEVICE', entityId: d.Device_ID, action: 'UNLOCKED' });
  return res;
}

/** The CEO's context from the page's short session (device key must still be valid). */
function ceoPageCtx_(p) {
  var D = ceoDeviceFromKey_(p.key), sid = '';
  try { sid = tcCache_().get('CEOS_' + hash_(str_(p.session))) || ''; } catch (e) { sid = ''; }
  if (!sid || sid !== D.d.Device_ID) { var e2 = userError_('الجلسة خلصت — اكتب الرقم السري تاني.'); e2.relock = true; throw e2; }
  return { user: D.u, sessionId: 'CEO-DEVICE:' + D.d.Device_ID, viaDevice: true, deviceId: D.d.Device_ID };
}
function ceoPageInbox_(p) { var c = ceoPageCtx_(p); var out = ceoInbox_(c); out.name = c.user.Full_Name_AR; return out; }
function ceoPageDecide_(p) { return ceoDecide_(ceoPageCtx_(p), p); }
function ceoPageReport_(p) { return ceoMonthlyReport_(ceoPageCtx_(p), p); }

/* ---------------- sending the link ---------------- */

/** For the HR Sector Manager: how many items wait, the link and a WhatsApp text without personal data. */
function ceoShare_(ctx) {
  if (!hasAnyRole_(ctx, ceoAdminRoles_())) throw userError_('لمدير قطاع الموارد البشرية ومالك النظام.');
  var ceos = ceoUsers_(), n = 0;
  ceos.forEach(function (u) { var c = { user: get_('USERS', u), sessionId: 'X' }; n = Math.max(n, ceoInbox_(c).count); });
  var link = ScriptApp.getService().getUrl() + '?ceo=1';
  var mobile = ceos.length ? str_((get_('USERS', ceos[0]) || {}).Mobile) : '';
  var intl = latinDigits_(mobile).replace(/\D/g, '');
  if (/^01\d{9}$/.test(intl)) intl = '2' + intl;
  return { count: n, link: link, phone: intl, text: 'صباح الخير، فيه ' + n + ' موافقة مستنية حضرتك على بوابة التوظيف: ' + link,
    daysLeft: ceoDeviceDaysLeft_(), hasCeo: ceos.length > 0 };
}

/* ---------------- daily: reminders of the days left ---------------- */

function ceoDaily_() {
  var now = nowIso_(), out = { reminded: 0 };
  find_('CEO_DEVICES', {}).forEach(function (d) {
    if (d.Revoked_At || d.Expires_At <= now) return;
    var left = Math.ceil((Date.parse(d.Expires_At.slice(0, 10)) - Date.parse(today_())) / 86400000);
    if ([14, 7, 1].indexOf(left) < 0 || str_(d.Reminded_Days).split(',').indexOf(String(left)) >= 0) return;
    notify_(roleHolders_(ROLE.OWNER).concat(roleHolders_(ROLE.HR_SECTOR)), 'جهاز الرئيس التنفيذي فاضل له ' + left + ' يوم',
      'بعدها لينك الموافقات مش هيشتغل — الرئيس يفتح البوابة من موبايله ويفعّل «جهاز موثوق» تاني.', 'CEO', '', left === 1);
    withLock_(function () { update_('CEO_DEVICES', d.Device_ID, { Reminded_Days: [str_(d.Reminded_Days), String(left)].filter(String).join(',') }, 'SYSTEM'); });
    out.reminded++;
  });
  try { out.report = ceoMonthlyDaily_(); } catch (e) { console.warn('ceo report: ' + e); }
  try { out.review = accessReviewDaily_(); } catch (e) { console.warn('access review: ' + e); }
  return out;
}

/* ---------------- monthly report to the CEO ---------------- */

/** p = { month: 'YYYY-MM' } (default: last month). */
function ceoMonthlyReport_(ctx, p) {
  if (!hasAnyRole_(ctx, [ROLE.CEO].concat(ceoAdminRoles_()))) throw userError_('مالكش صلاحية.');
  var month = /^\d{4}-\d{2}$/.test(str_(p && p.month)) ? str_(p.month) : addDaysYmd_(today_().slice(0, 8) + '01', -1).slice(0, 7);
  var names = userNames_(), out = { month: month, delegated: [], doubles: [], roleChanges: [], delegations: [] };
  var users = {}; all_('USERS').forEach(function (u) { users[u.User_ID] = u; });
  var byChain = {};
  find_('APPROVAL_INSTANCES', { Status: 'APPROVED' }).forEach(function (a) {
    if (str_(a.Decision_At).slice(0, 7) !== month) return;
    var k = a.Entity_Type + '|' + a.Entity_ID + '|' + a.Entity_Version;
    (byChain[k] = byChain[k] || []).push(a);
    var m = /^POSITION:(.+)$/.exec(a.Authority), u = users[a.Decision_By];
    if (m && u && u.Position_ID !== m[1]) out.delegated.push({ ref: a.Entity_ID, step: a.Label, by: names[a.Decision_By] || a.Decision_By, at: a.Decision_At.slice(0, 10) });
  });
  Object.keys(byChain).forEach(function (k) {
    var by = {}; byChain[k].forEach(function (a) { (by[a.Decision_By] = by[a.Decision_By] || []).push(a.Label); });
    Object.keys(by).forEach(function (u) { if (by[u].length > 1) out.doubles.push({ ref: k.split('|')[1], by: names[u] || u, steps: by[u] }); });
  });
  where_('AUDIT_LOG', function (a) { return str_(a.Timestamp).slice(0, 7) === month && (a.Action === 'ROLE_GRANTED' || a.Action === 'ROLE_REMOVED'); }).forEach(function (a) {
    out.roleChanges.push({ user: names[a.Entity_ID] || a.Entity_ID, action: a.Action === 'ROLE_GRANTED' ? 'إضافة' : 'إزالة', role: a.New_Value || a.Old_Value, by: names[a.User_ID] || a.User_ID, at: a.Timestamp.slice(0, 10) });
  });
  where_('DELEGATIONS', function (d) { return str_(d.Created_At).slice(0, 7) === month || str_(d.Updated_At).slice(0, 7) === month; }).forEach(function (d) {
    out.delegations.push({ id: d.Delegation_ID, to: names[d.To_User_ID] || d.To_User_ID, from: d.Effective_From, until: d.Effective_To, status: d.Status, scope: d.Process_Scope || 'ALL' });
  });
  return out;
}

/** On the 1st: the report goes to the CEO (notification + e-mail) once a month. */
function ceoMonthlyDaily_() {
  var props = PropertiesService.getScriptProperties(), key = 'CEO_REPORT_' + today_().slice(0, 7);
  if (today_().slice(8, 10) !== '01' || props.getProperty(key)) return 'skip';
  props.setProperty(key, 'Y');
  var ceos = ceoUsers_();
  if (!ceos.length) return 'no ceo';
  var R = ceoMonthlyReport_({ user: get_('USERS', ceos[0]), sessionId: 'SYSTEM' }, {});
  notify_(ceos, 'تقرير الشهر للرئيس التنفيذي — ' + R.month,
    R.delegated.length + ' قرار بالتفويض · ' + R.doubles.length + ' طلب اعتمد فيه شخص واحد أكتر من خطوة · ' + R.roleChanges.length + ' تغيير أدوار · ' + R.delegations.length + ' تفويض. التفاصيل في صفحة الموافقات.', 'CEO', '', true);
  return R.month;
}

/* ---------------- quarterly access review ---------------- */

/** The roles and delegations to review (HR Sector Manager / owner). */
function accessReview_(ctx) {
  if (!hasAnyRole_(ctx, ceoAdminRoles_())) throw userError_('مراجعة الصلاحيات لمدير قطاع الموارد البشرية ومالك النظام.');
  var names = userNames_(), roles = {};
  all_('USER_ROLES').forEach(function (r) {
    if (!isEffective_(r.Effective_From, r.Effective_To)) return;
    (roles[r.User_ID] = roles[r.User_ID] || []).push(r.Role_Code + (r.Scope_Type === 'ORG_UNIT' ? ' (' + unitName_(r.Scope_Org_Unit_ID) + ')' : ''));
  });
  var users = all_('USERS').filter(function (u) { return u.Status === 'Active' && !isDemoUser_(u); }).map(function (u) {
    return { id: u.User_ID, name: u.Full_Name_AR, email: u.Email, roles: roles[u.User_ID] || [], lastLogin: u.Last_Login_At, position: u.Position_ID };
  });
  var dl = where_('DELEGATIONS', function (d) { return d.Status === 'Active' || d.Status === 'PENDING_CEO'; }).map(function (d) {
    return { id: d.Delegation_ID, to: names[d.To_User_ID] || d.To_User_ID, from: d.Effective_From, until: d.Effective_To, status: d.Status, scope: d.Process_Scope || 'ALL' };
  });
  return { users: users, delegations: dl, last: str_(cfg_('ACCESS_REVIEW_LAST', '')), due: accessReviewDue_() };
}
function accessReviewDue_() {
  var last = str_(cfg_('ACCESS_REVIEW_LAST', ''));
  return !last || last < addDaysYmd_(today_(), -92);
}
function accessReviewDone_(ctx, p) {
  if (!hasAnyRole_(ctx, ceoAdminRoles_()) || ctx.readOnly) throw userError_('مراجعة الصلاحيات لمدير قطاع الموارد البشرية ومالك النظام.');
  var note = str_(p.note);
  if (note.length < 3) throw userError_('اكتب ملاحظة المراجعة (مثلاً: اتشالت صلاحيتين، والباقي مظبوط).');
  withLock_(function () {
    if (get_('CONFIG', 'ACCESS_REVIEW_LAST')) update_('CONFIG', 'ACCESS_REVIEW_LAST', { Config_Value: today_() }, ctx.user.User_ID);
  });
  invalidate_('CONFIG');
  audit_(ctx, { entityType: 'ACCESS_REVIEW', entityId: today_(), action: 'REVIEWED', reason: note });
  return { last: today_() };
}
/** Quarter start: remind the HR Sector Manager (once). */
function accessReviewDaily_() {
  var d = today_(), props = PropertiesService.getScriptProperties(), key = 'ACCESS_REVIEW_ASKED_' + d.slice(0, 7);
  if (['01', '04', '07', '10'].indexOf(d.slice(5, 7)) < 0 || d.slice(8, 10) !== '01' || props.getProperty(key)) return 'skip';
  props.setProperty(key, 'Y');
  notify_(roleHolders_(ROLE.HR_SECTOR), 'مراجعة الصلاحيات كل 3 شهور', 'راجع أدوار المستخدمين والتفويضات من «المستخدمين ← مراجعة الصلاحيات» واعتمد المراجعة.', 'USERS', '', true);
  return 'asked';
}

function unitName_(id) { var u = get_('ORG_UNITS', id); return u ? u.Name_AR : id; }

/** Home counts: the CEO's waiting decisions; for the owner / HR Sector Manager the CEO queue, the phone's days left and a due access review. */
function ceoTodo_(ctx) {
  var out = { inbox: 0, queued: 0, daysLeft: null, review: false };
  if (ctx.readOnly) return out;
  if (hasAnyRole_(ctx, [ROLE.CEO])) out.inbox = ceoInbox_(ctx).count;
  if (hasAnyRole_(ctx, ceoAdminRoles_())) {
    out.queued = where_('CEO_APPROVALS', function (a) { return a.Status === 'PENDING'; }).length;
    if (ceoUsers_().length) out.daysLeft = ceoDeviceDaysLeft_();
    out.review = hasAnyRole_(ctx, ceoAdminRoles_()) && accessReviewDue_() && all_('USERS').length > 3;
  }
  return out;
}
