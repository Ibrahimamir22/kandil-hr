/**
 * v0.33.0 — profile photos of candidates (P:<Person_ID>) and portal users (U:<User_ID>).
 *
 * Built not to slow anything down:
 *   • Only a small thumbnail is kept (resized in the browser to 160×160 JPEG, ~8 KB), in its own sheet PHOTOS —
 *     the candidate and user tables stay as small as before.
 *   • A screen shows at once with initials; the page then asks for the photos of everything on it in ONE call
 *     (photo.get), in the background. Each photo is cached on its own for 6 hours (one cache call for the batch);
 *     the sheet is read only for photos not cached yet.
 *   • The browser keeps the photos it already has for as long as the page is open (never saved on the device).
 * Candidate photos follow candidate access (same vacancies); user photos are visible to every signed-in user.
 */

var PHOTO_MAX_CHARS_ = 40000;          // data URL of the thumbnail (160×160 JPEG is ~10 KB)
var PHOTO_CACHE_TTL_ = 21600;
var PHOTO_BATCH_MAX_ = 80;

function photoKey_(id) { return 'PH_' + id; }
function photoKind_(id) { var m = /^([PU]):([A-Z]+-[0-9-]+)$/.exec(str_(id)); return m ? { kind: m[1], ref: m[2] } : null; }

/** Validate a thumbnail sent by the page: a JPEG / PNG data URL, small. '' = remove. */
function photoClean_(data) {
  var s = str_(data);
  if (!s) return '';
  var m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/.exec(s);
  if (!m || s.length > PHOTO_MAX_CHARS_) throw userError_('الصورة لازم تكون JPG أو PNG وصغيرة (البوابة بتصغّرها لوحدها).');
  var bytes = Utilities.base64Decode(m[2]);
  var real = sniffMime_(bytes);
  if (real !== 'image/jpeg' && real !== 'image/png') throw userError_('الملف ده مش صورة.');
  return s;
}

/** Which of the asked candidate ids this user may see (same rule as the candidate itself). */
function photoPersonsAllowed_(ctx, personIds) {
  var ok = {};
  if (!personIds.length) return ok;
  if (candAll_(ctx)) { personIds.forEach(function (p) { ok[p] = 1; }); return ok; }
  var want = {}; personIds.forEach(function (p) { want[p] = 1; });
  var vacs = {};
  all_('APPLICATIONS').forEach(function (a) {
    if (!want[a.Person_ID] || ok[a.Person_ID]) return;
    var v = vacs[a.Vacancy_ID];
    if (v === undefined) v = vacs[a.Vacancy_ID] = findOne_('VACANCIES', { Vacancy_ID: a.Vacancy_ID });
    var acc = vacancyAccess_(ctx, v);
    // v0.38.0 (CHG-81): the hiring manager sees the photo only after the candidate's first interview is done
    if (acc === 'FULL' || (acc === 'SHORTLIST' && MGR_STAGES_.indexOf(a.Stage) >= 0 &&
      find_('INTERVIEWS', { Application_ID: a.Application_ID }).some(function (iv) { return INT_DONE_.indexOf(iv.Status) >= 0; }))) ok[a.Person_ID] = 1;
  });
  return ok;
}

/** p = { ids: ['P:CND-000001', 'U:USR-0001', …] } → { id: dataUrl | '' } for the ids this user may see. */
function photoGet_(ctx, p) {
  var ids = (Array.isArray(p.ids) ? p.ids : []).map(str_).filter(function (id, i, a) { return photoKind_(id) && a.indexOf(id) === i; }).slice(0, PHOTO_BATCH_MAX_);
  var persons = ids.filter(function (id) { return id.charAt(0) === 'P'; }).map(function (id) { return id.slice(2); });
  var allowedP = photoPersonsAllowed_(ctx, persons);
  ids = ids.filter(function (id) { return id.charAt(0) === 'U' || allowedP[id.slice(2)]; });
  var out = {};
  if (!ids.length) return out;
  var c = tcCache_(), got = {};
  try { if (c) got = c.getAll(ids.map(photoKey_)) || {}; } catch (e) { got = {}; }
  var miss = [];
  ids.forEach(function (id) {
    var v = got[photoKey_(id)];
    if (v === undefined || v === null) miss.push(id); else out[id] = v === '-' ? '' : v;
  });
  if (miss.length) {
    var put = {};
    miss.forEach(function (id) { var d = photoRead_(id); out[id] = d; put[photoKey_(id)] = d || '-'; });
    try { if (c) c.putAll(put, PHOTO_CACHE_TTL_); } catch (e) { console.warn('photo cache: ' + e); }
  }
  return out;
}

/* ---------------- v0.35.0: one row, never the whole sheet ----------------
 * PHIDX (cache, 6 hours) maps each photo id to its sheet row; it is built from the id column only. A photo is read or
 * written in its own row after checking the id in that row — 2,000 photos no longer mean 20–80 MB per read. */
var PHOTO_IDX_KEY_ = 'PHIDX';

function photoSheet_() { return sheet_('PHOTOS'); }
function photoIndex_(rebuild) {
  var c = tcCache_();
  if (!rebuild && c) { try { var hit = c.get(PHOTO_IDX_KEY_); if (hit) return JSON.parse(hit); } catch (e) {} }
  var sh = photoSheet_(), last = sh.getLastRow(), idx = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { var k = str_(r[0]); if (k) idx[k] = i + 2; });
  try { if (c) c.put(PHOTO_IDX_KEY_, JSON.stringify(idx), PHOTO_CACHE_TTL_); } catch (e) {}
  return idx;
}
/** The stored data URL of one photo ('' when none). */
function photoRead_(id) {
  for (var attempt = 0; attempt < 2; attempt++) {
    var idx = photoIndex_(attempt > 0), row = idx[id];
    if (!row) { if (attempt === 0) continue; return ''; }
    var v = photoSheet_().getRange(row, 1, 1, 2).getValues()[0];
    if (str_(v[0]) === id) return str_(v[1]);
  }
  return '';
}

/** Store (or remove, data = '') the photo of a candidate or a user. p = { id, data } */
function photoSet_(ctx, p) {
  var k = photoKind_(p.id);
  if (!k) throw userError_('صورة غير معروفة.');
  if (ctx.readOnly) throw userError_('الحساب ده للعرض فقط.');
  if (k.kind === 'U') {
    if (k.ref !== ctx.user.User_ID && !hasAnyRole_(ctx, HR_ADMIN_ROLES)) throw userError_('تقدر تغيّر صورتك إنت بس.');
    if (!get_('USERS', k.ref)) throw userError_('المستخدم غير موجود.');
  } else {
    var per = get_('PERSONS', k.ref);
    if (!per || per.Status !== 'Active') throw userError_('المرشح غير موجود.');
    requirePersonFull_(ctx, k.ref);
    // v0.38.0 (CHG-81): the photo has its own consent — the recruiter confirms the candidate agreed
    if (p.data && str_(p.photoConsent) !== 'Y' && per.Photo_Consent !== 'Y') throw userError_('أكّد إن المرشح موافق إن صورته تتحفظ (الموافقة على الصورة منفصلة واختيارية).');
  }
  var data = photoClean_(p.data), id = k.kind + ':' + k.ref;
  if (k.kind === 'P' && data && str_(p.photoConsent) === 'Y' && get_('PERSONS', k.ref).Photo_Consent !== 'Y') withLock_(function () {
    update_('PERSONS', k.ref, { Photo_Consent: 'Y' }, ctx.user.User_ID);
    consentLog_(ctx.user.User_ID, { Person_ID: k.ref, Kind: 'PHOTO', Version: str_(cfg_('PRIVACY_VERSION', '1')), Channel: 'RECRUITER' });
  });
  photoStore_(ctx.user.User_ID, id, data);
  audit_(ctx, { entityType: k.kind === 'U' ? 'USER' : 'PERSON', entityId: k.ref, action: data ? 'PHOTO_SET' : 'PHOTO_REMOVED' });
  return { id: id, data: data };
}

/** Write the photo row and refresh its cached copy. */
function photoStore_(actorId, id, data) {
  withLock_(function () {
    var sh = photoSheet_(), idx = photoIndex_(true), row = idx[id];      // rebuilt under the lock: exact row numbers
    if (row) sh.getRange(row, 2, 1, 1).setValues([[cellText_(data)]]);
    else if (data) {
      row = Math.max(sh.getLastRow(), 1) + 1;
      if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
      sh.getRange(row, 1, 1, 2).setValues([[id, cellText_(data)]]);
      idx[id] = row;
    }
    var c = tcCache_();
    try { if (c) c.put(PHOTO_IDX_KEY_, JSON.stringify(idx), PHOTO_CACHE_TTL_); } catch (e) {}
    delete REPO_.tables.PHOTOS;
  });
  var c = tcCache_();
  try { if (c) c.put(photoKey_(id), data || '-', PHOTO_CACHE_TTL_); } catch (e) {}
}

/** Privacy: a candidate's photo goes with the rest of the data. */
function photoPurge_(actorId, personId) {
  var id = 'P:' + personId;
  if (photoIndex_(false)[id] || photoIndex_(true)[id]) photoStore_(actorId, id, '');
}
