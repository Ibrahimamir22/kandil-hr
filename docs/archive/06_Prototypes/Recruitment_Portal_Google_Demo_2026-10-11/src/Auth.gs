/**
 * Auth.gs — Phase 1 identity: one-time code by email + server-side session token.
 * Designed as a swappable module: moving to Google Workspace replaces this file only.
 */

function hash_(text) {
  var pepper = sprop_('AUTH_PEPPER') || PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER') || '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pepper + '|' + text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var h = (b & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function randomCode_() {
  var hex = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  var n = parseInt(hex, 16) % 900000 + 100000;
  return String(n);
}

function normEmail_(e) { return str_(e).toLowerCase(); }

function findUserByEmail_(email) {
  var e = normEmail_(email);
  var list = where_('USERS', function (u) { return normEmail_(u.Email) === e; });
  return list.length ? list[0] : null;
}

var GENERIC_CODE_MSG = 'لو الإيميل مسجل ونشط، هيوصلك كود الدخول خلال دقيقة.';

/** Step 1: send a login code. Always answers generically (does not reveal who is registered). */
function authRequestCode_(email) {
  email = normEmail_(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw userError_('اكتب إيميل صحيح.');
  // v0.34.0: the same answer for everyone — registered or not, limited or not (nothing reveals who has an account)
  if (MailApp.getRemainingDailyQuota() < 1) throw userError_('حد الإيميلات اليومي خلص. كلم HR أو جرب بكرة.');
  var user = findUserByEmail_(email);
  if (!user || user.Status !== 'Active' || accountExpired_(user)) return { ok: true, message: GENERIC_CODE_MSG };
  // authenticator turned on: email codes stop for this account (same answer, nothing revealed)
  if (mfaOn_(user.User_ID)) {
    audit_(null, { userId: user.User_ID, entityType: 'USER', entityId: user.User_ID, action: 'LOGIN_CODE_SKIPPED', newValue: 'TOTP' });
    return { ok: true, message: GENERIC_CODE_MSG };
  }

  // limits: 3 codes per address per 15 minutes, 10 per day, and LOGIN_CODES_HOURLY_MAX for the whole portal per hour —
  // someone asking codes for staff addresses can no longer burn the day's e-mails (a limited request gets the same answer)
  var windowStart = addMinutesIso_(-15), dayStart = addMinutesIso_(-1440), hourStart = addMinutesIso_(-60), mine15 = 0, mineDay = 0, allHour = 0;
  all_('LOGIN_CODES').forEach(function (c) {
    if (c.Created_At >= hourStart) allHour++;
    if (normEmail_(c.Email) !== email) return;
    if (c.Created_At >= windowStart) mine15++;
    if (c.Created_At >= dayStart) mineDay++;
  });
  if (mine15 >= 3 || mineDay >= 10 || allHour >= num_(cfg_('LOGIN_CODES_HOURLY_MAX', 40), 40)) {
    audit_(null, { userId: user.User_ID, entityType: 'USER', entityId: user.User_ID, action: 'LOGIN_CODE_LIMITED', newValue: mine15 + '/' + mineDay + '/' + allHour });
    return { ok: true, message: GENERIC_CODE_MSG };
  }

  var code = randomCode_();
  var minutes = cfg_('OTP_MINUTES', 10);
  withLock_(function () {
    insert_('LOGIN_CODES', {
      Code_ID: nextId_('LOGIN_CODE'),
      Email: email,
      Code_Hash: hash_(email + ':' + code),
      Expires_At: addMinutesIso_(minutes),
      Attempts: '0',
      Used_At: ''
    }, user.User_ID);
  });

  var lang = userLang_(user);
  sendMail_({
    to: email,
    subject: tr_('كود الدخول — بوابة التوظيف قنديل مصر', lang),
    htmlBody: '<div dir="' + (lang === 'en' ? 'ltr' : 'rtl') + '" style="font-family:Arial,sans-serif;font-size:15px">' +
      tr_('كود الدخول بتاعك:', lang) + ' <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
      tr_('صالح لمدة ' + minutes + ' دقائق. لو ماطلبتش الكود ده تجاهل الرسالة.', lang) + '</div>',
    name: 'Kandil Recruitment Portal'
  });
  try { mailSent_(); } catch (e) { /* counter only */ }
  audit_(null, { userId: user.User_ID, entityType: 'USER', entityId: user.User_ID, action: 'LOGIN_CODE_SENT' });
  return { ok: true, message: GENERIC_CODE_MSG };
}

/** Step 2: verify the code and open a session. */
function authVerifyCode_(email, code, userAgent, remember, device) {
  email = normEmail_(email);
  code = latinDigits_(code).replace(/\s+/g, '');      // Arabic keyboards type ٠١٢…
  var user = findUserByEmail_(email);
  // v0.34.0: one answer for an unknown address, a wrong, old or used-up code — the screen reveals nothing about the account
  var fail = userError_('الكود غلط أو انتهت صلاحيته. اكتب آخر كود وصلك على الإيميل، أو اطلب كود جديد.');
  if (!user || user.Status !== 'Active' || accountExpired_(user) || mfaOn_(user.User_ID)) throw fail;

  var maxAttempts = cfg_('OTP_MAX_ATTEMPTS', 5);
  var token, sessionId, wrong = false;
  // read, count and use the code while holding the lock, so parallel guesses cannot pass the attempts limit
  withLock_(function () {
    var codes = where_('LOGIN_CODES', function (c) { return normEmail_(c.Email) === email && c.Used_At === ''; })
      .sort(function (a, b) { return a.Created_At < b.Created_At ? 1 : -1; });
    if (!codes.length) throw fail;
    var c = codes[0];
    if (c.Expires_At < nowIso_() || num_(c.Attempts, 0) >= maxAttempts) throw fail;
    if (hash_(email + ':' + code) !== c.Code_Hash) {
      update_('LOGIN_CODES', c.Code_ID, { Attempts: String(num_(c.Attempts, 0) + 1) }, user.User_ID);
      wrong = true;
      return;
    }
    update_('LOGIN_CODES', c.Code_ID, { Used_At: nowIso_() }, user.User_ID);
    var opened = openSession_(user, userAgent, !!remember, device);
    token = opened.token; sessionId = opened.sessionId;
    countEmailLogin_(user);
  });
  if (wrong) {
    audit_(null, { userId: user.User_ID, entityType: 'USER', entityId: user.User_ID, action: 'LOGIN_FAILED' });
    throw fail;
  }
  newDeviceAlerts_();
  audit_({ user: user, sessionId: sessionId }, { entityType: 'USER', entityId: user.User_ID, action: 'LOGIN' });
  return { token: token };
}

/** Resolve a token to { user, sessionId } or throw AUTH error. */
function sessionFromToken_(token) {
  token = str_(token);
  if (!token) throw authError_();
  var th = hash_(token);
  var cache = CacheService.getScriptCache();
  // the cache keeps «session id|time of the last call» (v0.37.0: the server's idle lock, without an extra cache call)
  var hit = str_(cache.get('S_' + th)).split('|'), sid = hit[0], seen = hit[1] || '';
  var s = sid ? get_('SESSIONS', sid) : null;
  if (!s) {
    var found = where_('SESSIONS', function (x) { return x.Token_Hash === th; });
    s = found.length ? found[0] : null; seen = '';
  }
  if (!s || s.Token_Hash !== th || s.Revoked_At !== '' || s.Expires_At < nowIso_()) throw authError_();
  // v0.37.0 (CHG-82): the idle lock on the server — a session with no call for IDLE_MINUTES is ended
  var idle = num_(cfg_('IDLE_MINUTES', 30), 30);
  var limit = seen ? addMinutesIso_(-(idle + 2)) : addMinutesIso_(-(idle + 32));     // the sheet's time is touched every 30 minutes only
  if (idle > 0 && (seen || s.Last_Seen_At) < limit) {
    withLock_(function () { update_('SESSIONS', s.Session_ID, { Revoked_At: nowIso_(), Revoked_By: 'IDLE' }, s.User_ID); });
    try { cache.remove('S_' + th); } catch (e) {}
    throw authError_();
  }
  cache.put('S_' + th, s.Session_ID + '|' + nowIso_(), 21600);

  var user = get_('USERS', s.User_ID);
  if (!user || user.Status !== 'Active' || accountExpired_(user)) throw authError_();

  // Touch Last_Seen_At at most every 30 minutes to avoid a write per call.
  if (s.Last_Seen_At < addMinutesIso_(-30)) {
    withLock_(function () { update_('SESSIONS', s.Session_ID, { Last_Seen_At: nowIso_() }, user.User_ID); });
  }
  return { user: user, sessionId: s.Session_ID };
}

function authLogout_(ctx) {
  withLock_(function () {
    update_('SESSIONS', ctx.sessionId, { Revoked_At: nowIso_(), Revoked_By: ctx.user.User_ID }, ctx.user.User_ID);
  });
  audit_(ctx, { entityType: 'USER', entityId: ctx.user.User_ID, action: 'LOGOUT' });
  return { ok: true };
}

/** Revoke every active session of a user (used when a user is deactivated). */
function revokeUserSessions_(ctx, userId) {
  var active = where_('SESSIONS', function (s) { return s.User_ID === userId && s.Revoked_At === ''; });
  withLock_(function () {
    active.forEach(function (s) {
      update_('SESSIONS', s.Session_ID, { Revoked_At: nowIso_(), Revoked_By: ctx.user.User_ID }, ctx.user.User_ID);
    });
  });
  return active.length;
}

function userError_(msg) { var e = new Error(msg); e.userFacing = true; return e; }
function authError_() { var e = new Error('انتهت الجلسة. سجل دخول تاني.'); e.userFacing = true; e.auth = true; return e; }
