/**
 * Security.gs — v0.15.0
 *  - Sign-in with an authenticator app (Google Authenticator etc.): TOTP, RFC 6238 (SHA-1, 6 digits, 30 s).
 *    It is an alternative to the email code. Once a user turns it on, email codes stop for him
 *    (that is the point: no mailbox = no way in, and no Gmail quota used).
 *  - Who must turn it on: roles in TOTP_REQUIRED_ROLES from the first sign-in; everyone else after
 *    TOTP_AFTER_EMAIL_LOGINS sign-ins by email code.
 *  - Recovery codes (8, shown once), reset by the system owner / HR sector manager, and an emergency
 *    reset for the owner from the Apps Script editor.
 *  - Consultant accounts: see everything, change nothing, end on a date, confidentiality acknowledgement.
 *  - Notes ("ملاحظة") from any screen, reviewed by the owner / HR sector manager.
 * Secrets live in the SECURITY spreadsheet (USER_MFA), encrypted with a key kept in Script Properties,
 * and are never returned to the page after the set-up step.
 */

var B32_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
var RC_ALPHA_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // recovery codes: no 0/O, 1/I
var MFA_ISSUER_DEFAULT_ = 'Kandil Recruitment';

/** Interim confidentiality text for consultant accounts — the final wording comes after legal review. */
var CONSULTANT_NDA_AR_ = 'أقر بأن كل ما أطّلع عليه في بوابة التوظيف — بيانات المرشحين والموظفين والمرتبات والهيكل والسياسات — معلومات سرية خاصة بقنديل مصر وشركاتها. أستخدمها فقط لغرض تقييم النظام وإبداء الملاحظات المتفق عليه، ولا أنسخها أو أصوّرها أو أشاركها مع أي طرف، ولا أحتفظ بها بعد انتهاء المهمة. أعلم أن دخولي مسجل، وأن الحساب للعرض فقط وينتهي في التاريخ المحدد.';
var CONSULTANT_NDA_EN_ = 'I acknowledge that everything I see in the recruitment portal — candidate and employee data, pay, structure and policies — is confidential information of Kandil Egypt and its companies. I will use it only to review the system and give the agreed feedback, will not copy, photograph or share it with anyone, and will not keep it after the engagement ends. I know my access is logged, view-only, and ends on the set date.';

/* ---------------- bytes, base32, HMAC ---------------- */

function sb_(b) { b = b & 255; return b > 127 ? b - 256 : b; }            // Apps Script wants signed bytes
function ub_(arr) { return arr.map(function (b) { return b & 255; }); }

function b32Encode_(bytes) {
  var bits = 0, val = 0, out = '';
  ub_(bytes).forEach(function (b) {
    val = ((val << 8) | b) & 0xFFFF; bits += 8;
    while (bits >= 5) { out += B32_.charAt((val >>> (bits - 5)) & 31); bits -= 5; }
  });
  if (bits > 0) out += B32_.charAt((val << (5 - bits)) & 31);
  return out;
}
function b32Decode_(s) {
  s = str_(s).toUpperCase().replace(/[\s=-]/g, '');
  var bits = 0, val = 0, out = [];
  for (var i = 0; i < s.length; i++) {
    var v = B32_.indexOf(s.charAt(i));
    if (v < 0) throw new Error('bad base32');
    val = ((val << 5) | v) & 0xFFFF; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return out;
}

/** n pseudo-random bytes (SHA-256 over fresh random UUIDs). */
function randomBytes_(n) {
  var out = [];
  while (out.length < n) {
    var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid() + Date.now() + out.length, Utilities.Charset.UTF_8);
    out = out.concat(ub_(d));
  }
  return out.slice(0, n);
}

/** TOTP code for a secret (unsigned bytes) at a 30-second step. */
function totpAt_(secret, step) {
  var msg = [0, 0, 0, 0, (step >>> 24) & 255, (step >>> 16) & 255, (step >>> 8) & 255, step & 255];
  var h = ub_(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg.map(sb_), secret.map(sb_)));
  var off = h[h.length - 1] & 15;
  var bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  var c = String(bin % 1000000);
  while (c.length < 6) c = '0' + c;
  return c;
}
function totpStep_() { return Math.floor(Date.now() / 30000); }

/** The step a code matches (now, or one step either side for phone clock drift), or 0. Never a used step. */
function totpMatch_(secret, code, lastStep) {
  var now = totpStep_(), last = num_(lastStep, 0);
  for (var d = -1; d <= 1; d++) {
    var st = now + d;
    if (st > last && totpAt_(secret, st) === code) return st;
  }
  return 0;
}

/* ---------------- secret storage ---------------- */

function mfaKey_() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('MFA_KEY');
  if (!k) { k = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); props.setProperty('MFA_KEY', k); }
  return k;
}
function mfaStream_(userId, n) {
  var out = [], i = 0;
  while (out.length < n) {
    out = out.concat(ub_(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, userId + '|' + (i++), mfaKey_())));
  }
  return out;
}
function mfaSeal_(userId, bytes) {
  var ks = mfaStream_(userId, bytes.length);
  return Utilities.base64Encode(bytes.map(function (b, i) { return sb_(b ^ ks[i]); }));
}
function mfaOpen_(userId, sealed) {
  var raw = ub_(Utilities.base64Decode(str_(sealed))), ks = mfaStream_(userId, raw.length);
  return raw.map(function (b, i) { return (b ^ ks[i]) & 255; });
}

function mfaRow_(userId) { return get_('USER_MFA', userId); }
function mfaPut_(userId, fields, actor) {
  if (mfaRow_(userId)) return update_('USER_MFA', userId, fields, actor).after;
  var row = { User_ID: userId };
  for (var k in fields) row[k] = fields[k];
  return insert_('USER_MFA', row, actor);
}
function mfaOn_(userId) { var m = mfaRow_(userId); return !!(m && m.Enabled_At); }

/* ---------------- who must use it ---------------- */

function realRoles_(userId) { return activeRoles_(userId).map(function (r) { return r.Role_Code; }); }
function mfaRequiredRoles_() {
  return str_(cfg_('TOTP_REQUIRED_ROLES', [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.HR_STAFF, ROLE.REC_MANAGER,
    ROLE.REC_SUPERVISOR, ROLE.RECRUITER, ROLE.CONSULTANT].join(','))).split(/[\s,]+/).filter(String);
}

/** v0.37.0 (CHG-82): ALL = every user; the exempt roles (the CEO, who approves from his trusted phone) never. */
function mfaNeeded_(userId) {
  var need = mfaRequiredRoles_(), mine = realRoles_(userId);
  var exempt = str_(cfg_('TOTP_EXEMPT_ROLES', ROLE.CEO)).split(/[\s,]+/).filter(String);
  if (mine.some(function (r) { return exempt.indexOf(r) >= 0; })) return false;
  return need.indexOf('ALL') >= 0 || mine.some(function (r) { return need.indexOf(r) >= 0; });
}

/** { enabled, required, byRole, logins, free, left, recoveryLeft } for a user. */
function mfaState_(user) {
  var m = mfaRow_(user.User_ID) || {};
  var byRole = mfaNeeded_(user.User_ID);
  var free = num_(cfg_('TOTP_AFTER_EMAIL_LOGINS', 3), 3), logins = num_(m.Email_Logins, 0);
  var enabled = !!m.Enabled_At;
  return {
    enabled: enabled, enabledAt: str_(m.Enabled_At), byRole: byRole,
    required: !enabled && (byRole || (free > 0 && logins > free)),
    logins: logins, free: free, left: free > 0 ? Math.max(0, free - logins) : -1,
    recoveryLeft: enabled ? num_(m.Recovery_Left, 0) : 0
  };
}

/* ---------------- consultant (view only) ---------------- */

function isConsultant_(userId) { return realRoles_(userId).indexOf(ROLE.CONSULTANT) >= 0; }
function accountExpired_(user) { return !!str_(user.Access_Expires_At) && str_(user.Access_Expires_At) < today_(); }

/**
 * Actions a consultant may call. Everything else is refused on the server whatever the page shows.
 * A function entry decides by the payload (the same action reads or saves).
 */
function consultantActions_() {
  // viewing only: a person's full data export (privacy.export) is left out on purpose
  var read = ['me', 'boot', 'lookups', 'process.map', 'todo', 'auth.logout', 'ping', 'inc.list', 'policy.accept', 'me.setLang', 'me.pref', 'notif.list', 'notif.read', 'nda.accept',
    'feedback.add', 'feedback.list', 'mfa.start', 'mfa.confirm', 'mfa.codes',
    'search.all', 'users.list', 'photo.get', 'org.tree', 'org.chart', 'onb.list', 'onb.get', 'onb.templates', 'ins.list', 'nhv.list', 'nhv.get', 'trf.list', 'trf.get', 'prob.list', 'prob.get', 'med.list', 'kpi.run', 'ins.run', 'golive.get', 'positions.search', 'positions.history', 'jobs.list', 'jobs.history', 'config.list', 'audit.search',
    'org.unitHistory', 'rules.list', 'dlg.list', 'lists.get', 'daily.status',
    'req.options', 'req.positions', 'req.get', 'req.list', 'vac.list', 'vac.get', 'vac.recruiters', 'pcr.get', 'pcr.list',
    'cand.options', 'cand.tasks', 'cand.search', 'cand.pipeline', 'cand.app', 'cand.cv', 'cand.empSearch',
    'src.list', 'ad.list', 'ref.list', 'sq.list', 'pool.suggest', 'pool.list', 'src.metrics', 'restrict.list',
    'int.people', 'int.get', 'int.list', 'int.compare', 'int.file', 'int.analytics', 'rt.list',
    'offer.list', 'offer.letter', 'offer.file', 'offer.preview', 'offer.incentive', 'pay.admin', 'pay.preview',
    'join.list', 'doc.file', 'doctype.list', 'privacy.admin', 'privacy.due', 'privacy.find', 'dsr.list',
    'iq.list', 'tpl.list', 'emp.options', 'emp.list', 'emp.get', 'emp.replacement', 'jd.list', 'jd.get', 'jd.kit', 'comp.list', 'jdr.status', 'jdr.mine', 'jdr.get', 'presence.list'];
  var map = {};
  read.forEach(function (a) { map[a] = true; });
  // v0.37.0 (CHG-82): after go-live, no personal-data screens for a consultant
  if (golive_()) CONSULTANT_PERSONAL_.forEach(function (a) { delete map[a]; });
  map['int.plan'] = function (p) { return p.rounds === undefined; };     // read the plan, not save it
  map['report.run'] = function (p) { return !p.export; };              // view a report, not export it
  map['kpi.settings'] = function (p) { return p.op !== 'save'; };       // read the KPI settings, not save them
  return map;
}
function consultantMay_(action, p) {
  var r = consultantActions_()[action];
  return typeof r === 'function' ? !!r(p || {}) : !!r;
}

/**
 * Runs once per call, right after the session check: consultant view rights, then the gates
 * (authenticator set-up, confidentiality acknowledgement) that must be passed before anything else.
 */
var GATE_OPEN_ = ['me', 'boot', 'lookups', 'req.options', 'auth.logout', 'ping', 'policy.accept', 'me.setLang', 'mfa.start', 'mfa.confirm', 'nda.accept'];
function securityCheck_(ctx, action, p) {
  if (isConsultant_(ctx.user.User_ID)) {
    ctx.readOnly = true;
    // sees what an HR sector manager sees (never the system owner's technical rights); writes are refused below
    ctx._roles = [ROLE.CONSULTANT].concat(Object.keys(ROLE).map(function (k) { return ROLE[k]; })
      .filter(function (r) { return r !== ROLE.OWNER && r !== ROLE.CONSULTANT; }));
  }
  var gate = gateOf_(ctx);
  if (gate && GATE_OPEN_.indexOf(action) < 0) {
    var e = userError_(gate === 'MFA' ? 'لازم تفعّل تطبيق Authenticator الأول عشان تكمل.' : 'لازم توافق على إقرار السرية الأول عشان تكمل.');
    e.data = { gate: gate };
    throw e;
  }
  if (ctx.readOnly && !consultantMay_(action, p)) {
    throw userError_('الحساب ده للعرض فقط — مش ممكن تحفظ أو تعدّل حاجة. لو عندك ملاحظة استخدم زرار «ملاحظة».');
  }
}
function gateOf_(ctx) {
  if (ctx._gate !== undefined) return ctx._gate;
  var st = mfaState_(ctx.user);
  if (isDemoUser_(ctx.user)) { st.required = false; ctx._mfa = st; ctx._gate = ''; return ''; }   // demo people enter only through the owner's «try as»
  ctx._mfa = st;
  ctx._gate = st.required ? 'MFA' : (ctx.readOnly && !str_(ctx.user.Nda_Accepted_At) ? 'NDA' : policyNeeded_(ctx.user) ? 'POLICY' : '');   // v0.38.0: the usage policy
  return ctx._gate;
}

/** The security part of the profile the page gets on start. */
function securityProfile_(ctx) {
  var gate = gateOf_(ctx), st = ctx._mfa, lang = userLang_(ctx.user);
  return {
    gate: gate,
    mfa: { enabled: st.enabled, required: st.required, byRole: st.byRole, left: st.left, recoveryLeft: st.recoveryLeft },
    readOnly: !!ctx.readOnly,
    accessExpires: str_(ctx.user.Access_Expires_At),
    policy: gate === 'POLICY' ? str_(cfg_(lang === 'en' ? 'USAGE_POLICY_EN' : 'USAGE_POLICY_AR', '')) || str_(cfg_('USAGE_POLICY_AR', '')) : '',
    nda: gate === 'NDA' ? str_(cfg_(lang === 'en' ? 'CONSULTANT_NDA_EN' : 'CONSULTANT_NDA_AR', '')) || str_(cfg_('CONSULTANT_NDA_AR', '')) : '',
    feedbackAdmin: feedbackAdmin_(ctx),
    prefs: userPrefs_(ctx.user),
    scopeView: !ctx.readOnly && hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]),
    demo: isDemoUser_(ctx.user)
  };
}

function ndaAccept_(ctx) {
  if (!ctx.readOnly) throw userError_('الإقرار ده لحسابات الاستشاري بس.');
  withLock_(function () { update_('USERS', ctx.user.User_ID, { Nda_Accepted_At: nowIso_() }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'USER', entityId: ctx.user.User_ID, action: 'NDA_ACCEPTED' });
  return { ok: true };
}

/* ---------------- sign-in ---------------- */

/** Opens a session for a user (call under the lock). Returns the token. */
function openSession_(user, userAgent, remember, device) {
  deviceSeen_(user, userAgent, device);                 // v0.49.0 (CHG-104)
  var token = randomToken_();
  var sessionId = nextId_('SESSION');
  // v0.37.0 (CHG-82): one working day, or REMEMBER_DAYS with «remember me»
  var until = remember ? addDaysIso_(num_(cfg_('REMEMBER_DAYS', 7), 7)) : addMinutesIso_(num_(cfg_('SESSION_HOURS', 12), 12) * 60);
  insert_('SESSIONS', {
    Session_ID: sessionId, User_ID: user.User_ID, Token_Hash: hash_(token),
    Expires_At: until, Last_Seen_At: nowIso_(),
    Revoked_At: '', Revoked_By: '', User_Agent: str_(userAgent).slice(0, 200), Remember: remember ? 'Y' : ''
  }, user.User_ID);
  update_('USERS', user.User_ID, { Last_Login_At: nowIso_() }, user.User_ID);
  return { token: token, sessionId: sessionId };
}

/* v0.49.0 (CHG-104): «sign-in from a new device». The page keeps a random device id in its own storage; each sign-in from a
   device the account has not used before is recorded and, unless it is the first device we know of for the account, the
   user is told in the portal and by e-mail («if it was not you, tell the system administrator now»). Only a hash of the id
   is kept, with the browser and system name. Demo accounts and «try as» sessions are left out. */
var NEWDEV_ = [];
function uaLabel_(ua) {
  ua = str_(ua);
  var b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'متصفح';
  var o = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'جهاز';
  return b + ' — ' + o;
}
/** Runs under the lock (inside openSession_). */
function deviceSeen_(user, userAgent, device) {
  if (isDemoUser_(user) || /^DEMO-AS:/.test(str_(userAgent))) return;
  var d = str_(device), key = /^[A-Za-z0-9-]{8,64}$/.test(d) ? 'D:' + d : 'U:' + str_(userAgent).slice(0, 200);
  var h = hash_(user.User_ID + '|' + key), mine = find_('USER_DEVICES', { User_ID: user.User_ID }), now = nowIso_();
  var cur = mine.filter(function (x) { return x.Device_Hash === h; })[0];
  if (cur) { update_('USER_DEVICES', cur.Device_ID, { Last_At: now }, user.User_ID); return; }
  var label = uaLabel_(userAgent);
  insert_('USER_DEVICES', { Device_ID: nextId_('USER_DEVICE'), User_ID: user.User_ID, Device_Hash: h, Label: label, First_At: now, Last_At: now }, user.User_ID);
  if (mine.length) NEWDEV_.push({ user: user, label: label, at: now });     // the first device we know of is not «new»
}
/** After the sign-in's lock: tell the user about each new device. */
function newDeviceAlerts_() {
  var list = NEWDEV_; NEWDEV_ = [];
  list.forEach(function (a) {
    var u = a.user, lang = userLang_(u), when = a.at.slice(0, 16).replace('T', ' ');
    audit_(null, { userId: u.User_ID, entityType: 'USER', entityId: u.User_ID, action: 'NEW_DEVICE', newValue: a.label });
    try { notify_([u.User_ID], tr_('دخول لحسابك من جهاز جديد', lang), a.label + ' · ' + when + ' — ' + tr_('لو مش انت، كلّم مدير النظام فوراً عشان يقفل الحساب.', lang), '', '', false); } catch (e) {}
    try {
      if (u.Email && mailOk_('APPROVAL') && sendMail_({ to: u.Email, subject: tr_('تنبيه: دخول لحسابك في بوابة التوظيف من جهاز جديد', lang), name: 'Kandil Recruitment Portal',
        htmlBody: '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:15px">' + tr_('حسابك في بوابة التوظيف — قنديل مصر اتفتح من جهاز جديد:', lang) +
          '<br><b>' + escHtml_(a.label) + '</b> · <span dir="ltr">' + escHtml_(when) + '</span><br><br>' + tr_('لو ده انت، مش محتاج تعمل حاجة.', lang) + '<br><b>' +
          tr_('لو مش انت: كلّم مدير النظام فوراً عشان يقفل الحساب ويراجع الدخول.', lang) + '</b></div>' })) mailSent_();
    } catch (e) { console.warn('new device mail: ' + e); }
  });
}

/* v0.49.0 (CHG-105): accounts nobody uses stop by themselves. An active account with no sign-in for DORMANT_DAYS (counted from
   its creation when it never signed in) is stopped the same way as stopping it by hand — sessions closed, its recruitment work
   back to «not assigned» — and the owner and the HR Sector Manager are told. The system owner, the CEO and the board are never
   stopped this way (the CEO approves from his trusted phone; the board rarely signs in). Turning it on again is a normal edit. */
function dormantDaily_() {
  var days = num_(cfg_('DORMANT_DAYS', 60), 60);
  if (!(days > 0)) return 'off';
  var cut = addDaysYmd_(today_(), -days), exempt = {};
  where_('USER_ROLES', function (r) { return [ROLE.OWNER, ROLE.CEO, ROLE.BOARD].indexOf(r.Role_Code) >= 0 && isEffective_(r.Effective_From, r.Effective_To); })
    .forEach(function (r) { exempt[r.User_ID] = 1; });
  var stale = where_('USERS', function (u) {
    if (u.Status !== 'Active' || isDemoUser_(u) || exempt[u.User_ID] || normEmail_(u.Email) === normEmail_(OWNER_EMAIL)) return false;
    var last = str_(u.Last_Login_At) || str_(u.Created_At);
    return !!last && last.slice(0, 10) < cut;
  });
  var names = [];
  stale.forEach(function (u) {
    var res = withLock_(function () {
      update_('USERS', u.User_ID, { Status: 'Inactive' }, 'SYSTEM');
      return userOffboard_('SYSTEM', u.User_ID, 'الحساب ماتستخدمش ' + days + ' يوم');
    });
    audit_(null, { userId: 'SYSTEM', entityType: 'USER', entityId: u.User_ID, action: 'DORMANT_STOPPED', newValue: str_(u.Last_Login_At) || 'never', reason: 'DORMANT_DAYS ' + days });
    try { offboardNotify_(u.User_ID, res); } catch (e) {}
    names.push(u.Full_Name_AR + (u.Last_Login_At ? ' (آخر دخول ' + str_(u.Last_Login_At).slice(0, 10) + ')' : ' (مادخلش خالص)'));
  });
  if (names.length) {
    notify_(roleUserIds_([ROLE.OWNER, ROLE.HR_SECTOR]), 'اتوقف ' + names.length + ' حساب مش مستخدم', names.join('، ') + ' — مادخلوش من ' + days + ' يوم. ترجّع أي حساب من «المستخدمين».', '', '', false);
    try { if (OWNER_EMAIL && mailOk_('APPROVAL') && sendMail_({ to: OWNER_EMAIL, subject: 'بوابة التوظيف: اتوقف ' + names.length + ' حساب مش مستخدم',
      htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif">الحسابات دي مادخلتش البوابة من ' + days + ' يوم واتوقفت لوحدها:<br>' + names.map(escHtml_).join('<br>') + '<br><br>لو حد فيهم محتاج يرجع، فعّل حسابه من «المستخدمين».</div>' })) mailSent_(); } catch (e) {}
  }
  return 'stopped ' + names.length;
}

var TOTP_FAIL_MSG = 'الكود غلط، أو الحساب ده مش مفعّل عليه Authenticator. اتأكد من الإيميل واكتب الكود اللي ظاهر في التطبيق دلوقتي.';

/** Sign in with the authenticator code, or with one recovery code. */
function authTotp_(email, code, userAgent, remember, device) {
  email = normEmail_(email);
  code = latinDigits_(code).replace(/\s+/g, '').toUpperCase();
  var user = findUserByEmail_(email);
  if (!user || user.Status !== 'Active' || accountExpired_(user)) throw userError_(TOTP_FAIL_MSG);
  var res = null, wrong = false, locked = false, recovery = false;
  withLock_(function () {
    var m = mfaRow_(user.User_ID);
    if (!m || !m.Enabled_At) { wrong = true; return; }
    // v0.34.0: a pause stops guessing the 6-digit code, but a recovery code still works (nobody can lock the owner out)
    var isRecovery = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code);
    if (!isRecovery && str_(m.Locked_Until) && m.Locked_Until > nowIso_()) { locked = true; return; }
    var patch = null;
    if (/^\d{6}$/.test(code)) {
      var st = totpMatch_(mfaOpen_(user.User_ID, m.Secret_Enc), code, m.Last_Step);
      if (st) patch = { Last_Step: String(st), Fails: '0' };
    } else if (/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code)) {
      var h = hash_('rc:' + user.User_ID + ':' + code.replace('-', ''));
      var list = JSON.parse(str_(m.Recovery_JSON) || '[]'), i = list.indexOf(h);
      if (i >= 0) {
        list.splice(i, 1); recovery = true;
        patch = { Recovery_JSON: JSON.stringify(list), Recovery_Left: String(list.length), Fails: '0' };
      }
    }
    if (!patch) {
      var fails = num_(m.Fails, 0) + 1, max = num_(cfg_('TOTP_MAX_FAILS', 5), 5);
      update_('USER_MFA', user.User_ID, fails >= max ? { Fails: '0', Locked_Until: addMinutesIso_(num_(cfg_('TOTP_LOCK_MINUTES', 5), 5)) } : { Fails: String(fails) }, user.User_ID);
      wrong = true; locked = fails >= max;
      return;
    }
    update_('USER_MFA', user.User_ID, patch, user.User_ID);
    res = openSession_(user, userAgent, !!remember, device);
  });
  newDeviceAlerts_();
  if (!res) {
    audit_(null, { userId: user.User_ID, entityType: 'USER', entityId: user.User_ID, action: 'LOGIN_FAILED', newValue: 'TOTP' });
    flushAudit_();
    if (locked) throw userError_('محاولات كتير غلط ورا بعض — الدخول بكود التطبيق متوقف ' + num_(cfg_('TOTP_LOCK_MINUTES', 5), 5) + ' دقايق لحماية حسابك (كود الاسترداد شغال). لو مش انت اللي بتحاول، بلّغ مدير النظام.');
    throw userError_(TOTP_FAIL_MSG);
  }
  audit_({ user: user, sessionId: res.sessionId }, { entityType: 'USER', entityId: user.User_ID, action: 'LOGIN', newValue: recovery ? 'RECOVERY_CODE' : 'TOTP' });
  if (recovery) {
    var left = num_(mfaRow_(user.User_ID).Recovery_Left, 0);
    notify_([user.User_ID], 'اتدخل على حسابك بكود استرداد', 'فاضل معاك ' + left + ' من أكواد الاسترداد. لو مش انت، بلّغ مدير النظام فوراً. تقدر تطلع أكواد جديدة من «الأمان» (اضغط على اسمك فوق).', '', '');
  }
  return { token: res.token, recovery: recovery };
}

/** Counts a successful email-code sign-in (for the "after N email sign-ins" rule). Call under the lock. */
function countEmailLogin_(user) {
  var m = mfaRow_(user.User_ID);
  mfaPut_(user.User_ID, { Email_Logins: String(num_(m && m.Email_Logins, 0) + 1) }, user.User_ID);
}

/* ---------------- set-up, recovery codes, reset ---------------- */

function mfaStart_(ctx) {
  var u = ctx.user, m = mfaRow_(u.User_ID);
  if (m && m.Enabled_At) throw userError_('Authenticator مفعّل على حسابك بالفعل. لو غيّرت الموبايل، اطلب «إعادة ضبط» من مدير النظام.');
  var secret = randomBytes_(20), b32 = b32Encode_(secret);
  withLock_(function () { mfaPut_(u.User_ID, { Pending_Enc: mfaSeal_(u.User_ID, secret), Pending_At: nowIso_() }, u.User_ID); });
  var issuer = str_(cfg_('TOTP_ISSUER', MFA_ISSUER_DEFAULT_)) || MFA_ISSUER_DEFAULT_;
  return {
    secret: b32.replace(/(.{4})/g, '$1 ').trim(), account: u.Email, issuer: issuer,
    uri: 'otpauth://totp/' + encodeURIComponent(issuer + ':' + u.Email) + '?secret=' + b32 + '&issuer=' + encodeURIComponent(issuer) +
      '&algorithm=SHA1&digits=6&period=30'
  };
}

function newRecoveryCodes_(userId) {
  var codes = [], hashes = [], bytes = randomBytes_(64);
  for (var i = 0; i < 8; i++) {
    var c = '';
    for (var j = 0; j < 8; j++) c += RC_ALPHA_.charAt(bytes[i * 8 + j] % RC_ALPHA_.length);
    codes.push(c.slice(0, 4) + '-' + c.slice(4));
    hashes.push(hash_('rc:' + userId + ':' + c));
  }
  return { codes: codes, fields: { Recovery_JSON: JSON.stringify(hashes), Recovery_Left: String(codes.length) } };
}

function mfaConfirm_(ctx, p) {
  var u = ctx.user, code = latinDigits_(p.code).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) throw userError_('اكتب الكود اللي ظاهر في التطبيق (6 أرقام).');
  var out = null;
  withLock_(function () {
    var m = mfaRow_(u.User_ID);
    if (m && m.Enabled_At) throw userError_('Authenticator مفعّل على حسابك بالفعل.');
    if (!m || !m.Pending_Enc || m.Pending_At < addMinutesIso_(-30)) throw userError_('خطوة التفعيل انتهت — ابدأ من الأول وامسح الكود الجديد.');
    var st = totpMatch_(mfaOpen_(u.User_ID, m.Pending_Enc), code, 0);
    if (!st) throw userError_('الكود غلط. اتأكد إن وقت الموبايل مضبوط «تلقائي»، واكتب الكود اللي ظاهر دلوقتي في التطبيق.');
    var rc = newRecoveryCodes_(u.User_ID);
    var f = { Secret_Enc: m.Pending_Enc, Pending_Enc: '', Pending_At: '', Enabled_At: nowIso_(), Last_Step: String(st), Fails: '0', Locked_Until: '' };
    for (var k in rc.fields) f[k] = rc.fields[k];
    update_('USER_MFA', u.User_ID, f, u.User_ID);
    out = rc.codes;
  });
  audit_(ctx, { entityType: 'USER', entityId: u.User_ID, action: 'MFA_ENABLED' });
  ctx._gate = undefined;
  return { codes: out };
}

/** New recovery codes (the old ones stop working). Needs a current authenticator code. */
function mfaCodes_(ctx, p) {
  var u = ctx.user, code = latinDigits_(p.code).replace(/\s+/g, ''), out = null;
  withLock_(function () {
    var m = mfaRow_(u.User_ID);
    if (!m || !m.Enabled_At) throw userError_('Authenticator مش مفعّل على حسابك.');
    var st = /^\d{6}$/.test(code) ? totpMatch_(mfaOpen_(u.User_ID, m.Secret_Enc), code, m.Last_Step) : 0;
    if (!st) throw userError_('اكتب الكود اللي ظاهر في التطبيق دلوقتي (6 أرقام).');
    var rc = newRecoveryCodes_(u.User_ID);
    rc.fields.Last_Step = String(st);
    update_('USER_MFA', u.User_ID, rc.fields, u.User_ID);
    out = rc.codes;
  });
  audit_(ctx, { entityType: 'USER', entityId: u.User_ID, action: 'MFA_RECOVERY_CODES' });
  return { codes: out };
}

function mfaResetRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }

/** Turn the authenticator off for another user (lost / changed phone). He sets it up again at his next sign-in. */
function mfaReset_(ctx, p) {
  var id = str_(p.User_ID), reason = str_(p.reason);
  var target = get_('USERS', id);
  if (!target) throw userError_('المستخدم غير موجود.');
  if (id === ctx.user.User_ID) throw userError_('ماينفعش تعمل إعادة ضبط لحسابك انت — استخدم كود استرداد، أو اطلبها من مدير نظام تاني.');
  if (reason.length < 3) throw userError_('اكتب سبب إعادة الضبط.');
  if (realRoles_(id).indexOf(ROLE.OWNER) >= 0 && !hasAnyRole_(ctx, [ROLE.OWNER])) throw userError_('إعادة ضبط حساب مالك النظام لمالك نظام تاني بس.');
  if (!mfaOn_(id)) throw userError_('Authenticator مش مفعّل على الحساب ده أصلاً.');
  // v0.36.0 (CHG-77): an administrator's sign-in is reset by two people (one asks, another approves)
  if (isAdminAccount_(id) && !ctx.dualApproved) throw userError_('ده حساب مسؤول — إعادة الضبط محتاجة طلب من شخص وموافقة شخص تاني («موافقات الشخصين»).');
  var n = 0;
  withLock_(function () {
    update_('USER_MFA', id, { Secret_Enc: '', Pending_Enc: '', Pending_At: '', Enabled_At: '', Last_Step: '', Fails: '0', Locked_Until: '',
      Recovery_JSON: '', Recovery_Left: '0', Reset_At: nowIso_(), Reset_By: ctx.user.User_ID }, ctx.user.User_ID);
    n = revokeUserSessions_(ctx, id);
  });
  audit_(ctx, { entityType: 'USER', entityId: id, action: 'MFA_RESET', reason: reason, newValue: 'sessions closed: ' + n });
  notify_([id], 'اتعملك إعادة ضبط لتطبيق Authenticator', 'ادخل بكود على الإيميل، وفعّل التطبيق من جديد على موبايلك.', '', '');
  return { ok: true, sessionsClosed: n };
}

/**
 * EMERGENCY — if the system owner lost his phone and his recovery codes:
 *   1) Apps Script editor ▸ Project Settings ▸ Script Properties ▸ add  EMERGENCY_RESET = YES
 *   2) editor ▸ select emergencyResetAuthenticator ▸ Run
 * It turns the authenticator off for OWNER_EMAIL (he signs in by email code and sets it up again) and
 * removes the property. Without the property it refuses — only someone with editor access can set it.
 */
function emergencyResetAuthenticator() {
  requireEditor_();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('EMERGENCY_RESET') !== 'YES') throw new Error('Set the script property EMERGENCY_RESET = YES first (Project Settings), then run again.');
  props.deleteProperty('EMERGENCY_RESET');
  var u = findUserByEmail_(OWNER_EMAIL);
  if (!u) throw new Error('OWNER_EMAIL is not a portal user.');
  withLock_(function () {
    if (mfaRow_(u.User_ID)) update_('USER_MFA', u.User_ID, { Secret_Enc: '', Pending_Enc: '', Enabled_At: '', Last_Step: '', Fails: '0',
      Locked_Until: '', Recovery_JSON: '', Recovery_Left: '0', Reset_At: nowIso_(), Reset_By: 'EDITOR' }, 'SYSTEM');
  });
  audit_(null, { userId: 'SYSTEM', entityType: 'USER', entityId: u.User_ID, action: 'MFA_RESET', reason: 'Emergency reset from the script editor' });
  flushAudit_();
  Logger.log('Authenticator turned off for ' + u.Email + ' — sign in with an email code and set it up again.');
  return u.User_ID;
}

/** Authenticator status of every user (for the users screen). No secrets. */
function mfaSummary_() {
  var out = {};
  all_('USER_MFA').forEach(function (m) {
    out[m.User_ID] = { on: str_(m.Enabled_At), logins: num_(m.Email_Logins, 0), recoveryLeft: num_(m.Recovery_Left, 0), resetAt: str_(m.Reset_At) };
  });
  return out;
}

/* ---------------- notes ---------------- */

function feedbackAdmin_(ctx) { return !ctx.readOnly && hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]); }

function feedbackAdd_(ctx, p) {
  var text = str_(p.text).slice(0, 2000);
  if (text.length < 3) throw userError_('اكتب ملاحظتك.');
  var row;
  withLock_(function () {
    row = insert_('FEEDBACK', { Feedback_ID: nextId_('FEEDBACK'), User_ID: ctx.user.User_ID, Screen: str_(p.screen).slice(0, 40),
      Screen_Title: str_(p.title).slice(0, 120), Text: text, Status: 'NEW', Reply: '', Replied_By: '', Replied_At: '' }, ctx.user.User_ID);
  });
  var admins = roleHolders_(ROLE.OWNER).concat(roleHolders_(ROLE.HR_SECTOR)).filter(function (id) { return id !== ctx.user.User_ID; });
  notify_(admins, 'ملاحظة جديدة على البوابة', ctx.user.Full_Name_AR + ' — ' + (row.Screen_Title || row.Screen) + ': ' + text.slice(0, 140), 'FEEDBACK', row.Feedback_ID);
  return { Feedback_ID: row.Feedback_ID };
}

function feedbackList_(ctx, p) {
  var admin = feedbackAdmin_(ctx), names = {};
  all_('USERS').forEach(function (u) { names[u.User_ID] = u.Full_Name_AR; });
  var rows = where_('FEEDBACK', function (f) {
    return (admin || f.User_ID === ctx.user.User_ID) && (!str_(p.status) || f.Status === str_(p.status));
  }).sort(function (a, b) { return a.Created_At < b.Created_At ? 1 : -1; }).map(function (f) {
    return { id: f.Feedback_ID, user: names[f.User_ID] || f.User_ID, mine: f.User_ID === ctx.user.User_ID, screen: f.Screen,
      title: f.Screen_Title, text: f.Text, status: f.Status, reply: f.Reply, repliedBy: names[f.Replied_By] || '', repliedAt: f.Replied_At, at: f.Created_At,
      consultant: isConsultant_(f.User_ID) };
  });
  return { rows: rows, admin: admin };
}

function feedbackSave_(ctx, p) {
  var f = get_('FEEDBACK', str_(p.Feedback_ID));
  if (!f) throw userError_('الملاحظة غير موجودة.');
  var status = str_(p.Status) || f.Status, reply = p.Reply === undefined ? f.Reply : str_(p.Reply).slice(0, 2000);
  if (['NEW', 'SEEN', 'PLANNED', 'DONE', 'DECLINED'].indexOf(status) < 0) throw userError_('حالة غير معروفة.');
  if (status === 'DECLINED' && reply.length < 3) throw userError_('اكتب سبب عدم التنفيذ في الرد.');
  var replied = reply !== f.Reply && reply !== '';
  var res;
  withLock_(function () {
    var patch = { Status: status, Reply: reply };
    if (replied) { patch.Replied_By = ctx.user.User_ID; patch.Replied_At = nowIso_(); }
    res = update_('FEEDBACK', f.Feedback_ID, patch, ctx.user.User_ID);
  });
  auditDiff_(ctx, 'FEEDBACK', f.Feedback_ID, { Status: f.Status, Reply: f.Reply }, { Status: res.after.Status, Reply: res.after.Reply }, '');
  if (replied && f.User_ID !== ctx.user.User_ID) notify_([f.User_ID], 'رد على ملاحظتك', (f.Screen_Title || f.Screen) + ': ' + reply.slice(0, 160), 'FEEDBACK', f.Feedback_ID);
  return { ok: true };
}

/** Number of new notes (nav badge for the owner / HR sector manager). */
function feedbackTodo_(ctx) {
  if (!feedbackAdmin_(ctx)) return 0;
  return where_('FEEDBACK', function (f) { return f.Status === 'NEW'; }).length;
}

function consultantExpiryCheck_(ymd) {
  var max = num_(cfg_('CONSULTANT_MAX_DAYS', 180), 180);
  var limit = Utilities.formatDate(new Date(Date.now() + max * 86400000), APP.TZ, 'yyyy-MM-dd');
  if (str_(ymd) > limit) throw userError_('أقصى مدة لحساب الاستشاري ' + max + ' يوم (لحد ' + limit + ').');
}

/* ---------------- personal display preferences (v0.15.1) ---------------- */

function userPrefs_(user) { try { var p = JSON.parse(str_(user.Prefs_JSON) || '{}'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } }

/** Saves one display preference of the signed-in user: which screen intros are closed, scope colours on the menu. */
function mePref_(ctx, p) {
  var key = str_(p.key), prefs = userPrefs_(get_('USERS', ctx.user.User_ID) || ctx.user);
  if (key === 'intro') {
    var view = str_(p.view);
    if (!/^[a-z]{2,20}$/i.test(view)) throw userError_('شاشة غير معروفة.');
    prefs.introHidden = prefs.introHidden || {};
    if (p.value) prefs.introHidden[view] = 1; else delete prefs.introHidden[view];
  } else if (key === 'scopeDots') {
    prefs.scopeDots = !!p.value;
  } else throw userError_('إعداد غير معروف.');
  withLock_(function () { update_('USERS', ctx.user.User_ID, { Prefs_JSON: JSON.stringify(prefs) }, ctx.user.User_ID); });
  return prefs;
}

/* ---------------- editor-only entry points (v0.34.0) ----------------
 * The web app runs as the owner for anyone, so every function without a trailing «_» can be called from a browser
 * (google.script.run). The ones meant for the Apps Script editor or a schedule check who is calling. */

/** Only from the Apps Script editor: the signed-in user is the account the script runs as (a browser visitor has no email here). */
function requireEditor_() {
  var a = '', e = '';
  try { a = str_(Session.getActiveUser().getEmail()).toLowerCase(); } catch (x) {}
  try { e = str_(Session.getEffectiveUser().getEmail()).toLowerCase(); } catch (x) {}
  if (!a || !e || a !== e) throw new Error('Run this from the Apps Script editor (script owner only).');
}

/** A scheduled run (its event names one of this project's triggers) or the editor. */
function requireTriggerOrEditor_(ev) {
  var uid = ev && typeof ev === 'object' ? str_(ev.triggerUid) : '';
  if (uid) {
    var ok = false;
    try { ok = ScriptApp.getProjectTriggers().some(function (t) { return str_(t.getUniqueId()) === uid; }); } catch (x) {}
    if (ok) return;
  }
  requireEditor_();
}
