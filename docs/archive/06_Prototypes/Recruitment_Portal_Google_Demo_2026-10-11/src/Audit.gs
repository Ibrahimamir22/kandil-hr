/**
 * Audit.gs — append-only audit trail. Entries are buffered per request and flushed once.
 */

var AUDIT_BUF_ = [];

/**
 * Queue one audit entry.
 * e = { entityType, entityId, action, field, oldValue, newValue, reason, onBehalfOf }
 */
function audit_(ctx, e) {
  AUDIT_BUF_.push({
    Timestamp: nowIso_(),
    User_ID: ctx && ctx.user ? ctx.user.User_ID : (e.userId || 'SYSTEM'),
    On_Behalf_Of: e.onBehalfOf || '',
    Entity_Type: e.entityType || '',
    Entity_ID: e.entityId || '',
    Action: e.action || '',
    Field: e.field || '',
    Old_Value: e.oldValue === undefined ? '' : String(e.oldValue),
    New_Value: e.newValue === undefined ? '' : String(e.newValue),
    Reason: e.reason || '',
    Session_ID: ctx && ctx.sessionId ? ctx.sessionId : ''
  });
}

/** One entry per changed field between two row snapshots. */
function auditDiff_(ctx, entityType, entityId, before, after, reason) {
  var skip = { Created_At: 1, Created_By: 1, Updated_At: 1, Updated_By: 1,
    Occupied_Updated_At: 1, Occupied_Updated_By: 1 };   // bookkeeping stamps; the audit row itself records who/when
  Object.keys(after).forEach(function (k) {
    if (skip[k]) return;
    if (str_(before[k]) !== str_(after[k])) {
      audit_(ctx, { entityType: entityType, entityId: entityId, action: 'UPDATE', field: k,
        oldValue: before[k], newValue: after[k], reason: reason });
    }
  });
}

function flushAudit_() {
  if (!AUDIT_BUF_.length) return;
  var buf = AUDIT_BUF_;
  AUDIT_BUF_ = [];
  withLock_(function () {
    var ids = nextIds_('AUDIT', buf.length);
    buf.forEach(function (b, i) { b.Audit_ID = ids[i]; });
    var head = auditChainSeal_(buf);          // v0.49.0 (CHG-106): each row sealed and chained to the one before
    insertMany_('AUDIT_LOG', buf, 'SYSTEM');
    PropertiesService.getScriptProperties().setProperty('AUDIT_CHAIN_HEAD', head);
  });
}

/* ---------------- v0.49.0 (CHG-106): a tamper-evident audit log ----------------
   Every row gets Content_Hash = HMAC(key, its fields) and Chain_Hash = HMAC(key, previous Chain_Hash | Content_Hash); the key
   lives in Script Properties, never in a sheet, so someone who can reach the spreadsheet but not the script cannot forge a row.
   The last Chain_Hash is kept as AUDIT_CHAIN_HEAD (a deleted tail shows), the last archived one as AUDIT_CHAIN_ANCHOR (monthly
   archiving). Deletion of a person's data blanks values and marks the row Redacted — its seals stay, so the chain still holds.
   The daily job checks the whole live log; a break is reported to the system owner and on the readiness screen. */
var AUDIT_SEAL_FIELDS_ = ['Audit_ID', 'Timestamp', 'User_ID', 'On_Behalf_Of', 'Entity_Type', 'Entity_ID', 'Action', 'Field', 'Old_Value', 'New_Value', 'Reason', 'Session_ID'];
function auditKey_() {
  var props = PropertiesService.getScriptProperties(), k = props.getProperty('AUDIT_KEY');
  if (!k) { k = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); props.setProperty('AUDIT_KEY', k); }
  return k;
}
function auditMac_(text, key) { return Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, text, key)).slice(0, 24); }
/** Two seals in one cell: «fields.values» — the row's fields without its values, and the values (Old / New). Deleting a person's
 *  data may blank the values (the row is marked Redacted); the first seal still guards everything else on the row. */
var AUDIT_VALUE_FIELDS_ = ['Old_Value', 'New_Value'];
function auditContent_(r, key) {
  var f = AUDIT_SEAL_FIELDS_.filter(function (x) { return AUDIT_VALUE_FIELDS_.indexOf(x) < 0; });
  return auditMac_(JSON.stringify(f.map(function (x) { return str_(r[x]); })), key).slice(0, 16) + '.' + auditMac_(JSON.stringify(AUDIT_VALUE_FIELDS_.map(function (x) { return str_(r[x]); })), key).slice(0, 16);
}
function auditSealRow_(r, prev, key) { r.Content_Hash = auditContent_(r, key); r.Chain_Hash = auditMac_(prev + '|' + r.Content_Hash, key); r.Redacted = ''; return r.Chain_Hash; }
/** Seal a batch in order, starting from the current head (call under the lock). Returns the new head. */
function auditChainSeal_(rows) {
  var key = auditKey_(), prev = PropertiesService.getScriptProperties().getProperty('AUDIT_CHAIN_HEAD') || '';
  rows.forEach(function (r) { prev = auditSealRow_(r, prev, key); });
  return prev;
}
/** Check the live log. Returns { ok, checked, sealed, redacted, problems: [{ id, kind }] }. */
function auditChainVerify_() {
  var props = PropertiesService.getScriptProperties(), key = auditKey_(), started = Date.now();
  var rows = all_('AUDIT_LOG'), out = { ok: true, checked: 0, sealed: 0, redacted: 0, problems: [], at: nowIso_() };
  var bad = function (id, kind) { out.ok = false; if (out.problems.length < 20) out.problems.push({ id: str_(id), kind: kind }); };
  var first = -1; for (var i = 0; i < rows.length; i++) if (str_(rows[i].Chain_Hash)) { first = i; break; }
  if (first < 0) return out;                                       // nothing sealed yet (a log from before v0.49.0)
  var prev = first === 0 ? (props.getProperty('AUDIT_CHAIN_ANCHOR') || '') : '';
  for (var j = first; j < rows.length; j++) {
    if (Date.now() - started > 240000) { out.partial = true; break; }
    var r = rows[j]; out.checked++;
    if (!str_(r.Chain_Hash) || !str_(r.Content_Hash)) { bad(r.Audit_ID, 'UNSEALED'); prev = ''; continue; }     // a row added outside the portal
    out.sealed++;
    var want = auditContent_(r, key).split('.'), have = str_(r.Content_Hash).split('.');
    if (want[0] !== have[0]) bad(r.Audit_ID, 'EDITED');                                                          // a field changed
    else if (str_(r.Redacted) === 'Y') {
      out.redacted++;
      if ((str_(r.Old_Value) && r.Old_Value !== 'محذوف') || (str_(r.New_Value) && r.New_Value !== 'محذوف')) bad(r.Audit_ID, 'EDITED');
    } else if (want[1] !== have[1]) bad(r.Audit_ID, 'EDITED');                                                   // a value changed
    if (auditMac_(prev + '|' + str_(r.Content_Hash), key) !== str_(r.Chain_Hash)) bad(r.Audit_ID, 'BROKEN');     // a row removed or moved before it
    prev = str_(r.Chain_Hash);
  }
  var head = props.getProperty('AUDIT_CHAIN_HEAD') || '';
  if (!out.partial && head && prev !== head) bad('', 'TAIL');                                                     // the newest rows removed
  props.setProperty('AUDIT_CHAIN_STATUS', JSON.stringify({ ok: out.ok, at: out.at, checked: out.checked, problems: out.problems.slice(0, 5), partial: !!out.partial }));
  return out;
}
/** Daily step: check, and tell the system owner once a day when the log does not hold. */
function auditChainDaily_() {
  var r = auditChainVerify_();
  if (r.ok) return 'ok ' + r.checked;
  var props = PropertiesService.getScriptProperties(), day = today_();
  if (props.getProperty('AUDIT_CHAIN_ALERT_DAY') !== day) {
    props.setProperty('AUDIT_CHAIN_ALERT_DAY', day);
    var KIND = { UNSEALED: 'سطر اتضاف من برا البوابة', EDITED: 'قيمة اتعدلت', BROKEN: 'سطر اتشال أو اتنقل قبله', TAIL: 'آخر السطور اتشالت' };
    var txt = r.problems.map(function (p) { return (p.id ? p.id + ': ' : '') + (KIND[p.kind] || p.kind); }).join('\n');
    var owners = roleUserIds_([ROLE.OWNER, ROLE.HR_SECTOR]);
    notify_(owners, 'سجل التدقيق اتلعب فيه من برا البوابة', txt, 'CONFIG', '', false);
    try { if (OWNER_EMAIL && mailOk_('APPROVAL') && sendMail_({ to: OWNER_EMAIL, subject: 'تنبيه أمني: سجل التدقيق في بوابة التوظيف اتعدل من برا البوابة',
      htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif">الفحص اليومي لقى تعديل في سجل التدقيق مش من البوابة:<br><pre>' + escHtml_(txt) + '</pre>راجع مين عنده وصول للشيتات فوراً.</div>' })) mailSent_(); } catch (e) {}
  }
  return 'BROKEN ' + r.problems.length;
}
