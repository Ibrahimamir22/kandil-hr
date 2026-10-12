/**
 * Repo.gs — the ONLY code that touches spreadsheets.
 * All cells are stored as plain text (sheets are formatted '@' at setup), so values
 * round-trip exactly: codes keep leading zeros, dates stay ISO strings.
 */

var REPO_ = { ss: {}, tables: {} };   // per-execution cache
var LOCK_HELD_ = false;
var PENDING_ = {};   // table → { t, rows: { sheetRow: row } }: row updates made while holding the lock, written together at release
var DIRTY_ = {};
var APPENDQ_ = {};
var EVDIRTY_ = {};    // v0.35.0: per-entity timeline cache keys to drop once the new events are on the sheet   // table → rows for append-only logs queued while holding the lock (v0.32.2)     // tables written in this execution: their shared-cache copy is retired once the writes are flushed

/* ---------------- script properties (read once per execution) ---------------- */

/** A script property, from one read of all of them per execution. Writers still use PropertiesService directly. */
function sprop_(key) {
  if (!REPO_.props) REPO_.props = PropertiesService.getScriptProperties().getProperties() || {};
  var v = REPO_.props[key];
  return v === undefined ? null : v;
}
function spropsReset_() { REPO_.props = null; }

/* v0.35.0: a value bigger than one script property (9 KB) kept in numbered parts: KEY_n = count, KEY_0 … */
function propPutBig_(key, s) {
  var props = PropertiesService.getScriptProperties(), size = 8000, n = Math.ceil(s.length / size), put = {};
  propDelBig_(key);
  for (var i = 0; i < n; i++) put[key + '_' + i] = s.slice(i * size, (i + 1) * size);
  put[key + '_n'] = String(n);
  props.setProperties(put);
}
function propGetBig_(key) {
  var all = PropertiesService.getScriptProperties().getProperties() || {}, n = num_(all[key + '_n'], -1);
  if (n < 0) return all[key] || null;                                       // written before 0.35 as one property
  var parts = []; for (var i = 0; i < n; i++) parts.push(all[key + '_' + i] || '');
  return parts.join('');
}
function propDelBig_(key) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties() || {}, n = num_(all[key + '_n'], 0);
  props.deleteProperty(key); props.deleteProperty(key + '_n');
  for (var i = 0; i < n; i++) props.deleteProperty(key + '_' + i);
}

/* ---------------- shared table cache (across requests) ----------------
 * Each table has a generation id in CacheService ('TG_' + table). A table read from the sheet outside the lock is
 * stored under its current generation; every write retires the generation AFTER the write reaches the sheet
 * (SpreadsheetApp.flush), so a copy made before a write is never served after it. Reads under the lock always go
 * to the sheet: every write is computed from fresh data. Snapshots also expire on their own (TC_TTL_).
 */
// CacheService takes at most 100 KB per value — in bytes, and Arabic text is up to 3 bytes a character: 30,000 characters per chunk
// v0.35.0: up to 80 chunks (~2.4 M characters) — the applications and candidates tables stay cached for years, not months
var TC_TTL_ = 21600, TC_GEN_TTL_ = 21600, TC_CHUNK_ = 30000, TC_MAX_CHUNKS_ = 80;
// big append-only logs, short-lived codes and counters (USER_MFA may be cached: secrets in it are encrypted, and sign-in reads it under the lock)
var TC_SKIP_ = { AUDIT_LOG: 1, EVENTS: 1, LOGIN_CODES: 1, ID_SEQUENCES: 1, PHOTOS: 1 };   // photos: cached one by one (Photos.gs)

function tcOn_(table) { return !TC_SKIP_[table]; }
function tcCache_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }
function tcNewGen_() { return Utilities.getUuid().slice(0, 8); }

/**
 * Generation ids of all tables, read in one call per execution — together with the action's table hint
 * (v0.32.0: 'AH_' + action = the tables, and their chunk counts, this action read last time).
 */
function tcGens_() {
  if (REPO_.gens) return REPO_.gens;
  REPO_.gens = {};
  var c = tcCache_();
  if (!c) return REPO_.gens;
  try {
    var keys = Object.keys(SCHEMA).map(function (t) { return 'TG_' + t; });
    if (REPO_.act) keys.push('AH_' + REPO_.act);
    keys.push('EV_EPOCH');
    var got = c.getAll(keys) || {};
    Object.keys(got).forEach(function (k) { if (k.indexOf('TG_') === 0) REPO_.gens[k.slice(3)] = got[k]; });
    REPO_.evEpoch = got.EV_EPOCH || '';
    if (REPO_.act && got['AH_' + REPO_.act]) { try { REPO_.hint = JSON.parse(got['AH_' + REPO_.act]) || null; } catch (e) { REPO_.hint = null; } }
  } catch (e) { console.warn('cache gens: ' + e); }
  return REPO_.gens;
}

/**
 * v0.32.0: one cache call for every table the action is known to read (instead of one call per table).
 * Fetched the first time a table is wanted; each copy is checked against the table's generation when used.
 */
function tcPrefetch_() {
  if (REPO_.pre) return REPO_.pre;
  REPO_.pre = {};
  var gens = tcGens_(), hint = REPO_.hint, c = tcCache_();
  if (!hint || !c) return REPO_.pre;
  var keys = [], want = [];
  Object.keys(hint).forEach(function (t) {
    var gen = gens[t], n = num_(hint[t], 0);
    if (!gen || !SCHEMA[t] || !tcOn_(t) || n < 1 || n > TC_MAX_CHUNKS_) return;
    var k = tcKeys_(t, gen).slice(0, n + 1);
    want.push({ t: t, gen: gen, keys: k });
    keys = keys.concat(k);
  });
  if (!keys.length) return REPO_.pre;
  try {
    var got = c.getAll(keys) || {};
    want.forEach(function (w) {
      var n = num_(got[w.keys[0]], 0), parts = [];
      if (!n || n > w.keys.length - 1) return;           // not cached, or more chunks than hinted: the table reads on its own
      for (var i = 0; i < n; i++) { var p = got[w.keys[i + 1]]; if (p === undefined || p === null) return; parts.push(p); }
      REPO_.pre[w.t] = { gen: w.gen, s: parts.join('') };
    });
  } catch (e) { console.warn('cache prefetch: ' + e); }
  return REPO_.pre;
}
/** Remember a table this action read and its chunk count (saved as the action's hint at the end of the call). */
function tcUse_(table, n) { if (REPO_.act && n) { REPO_.used = REPO_.used || {}; REPO_.used[table] = n; } }
/** Save the action's hint when it read tables (or more chunks) the hint did not have. One cache write, only on change. */
function tcHintSave_() {
  var act = REPO_.act, used = REPO_.used;
  if (!act || !used) return;
  var hint = REPO_.hint || {}, changed = false, out = {};
  Object.keys(hint).forEach(function (t) { if (SCHEMA[t]) out[t] = hint[t]; });
  Object.keys(used).forEach(function (t) { if (num_(out[t], 0) < used[t]) { out[t] = used[t]; changed = true; } });
  if (!changed) return;
  var c = tcCache_();
  try { if (c) c.put('AH_' + act, JSON.stringify(out), TC_GEN_TTL_); } catch (e) { console.warn('cache hint: ' + e); }
}
/** Start of a request: which action it is (for the hint), and nothing prefetched yet. */
function tcBegin_(action) { REPO_.act = action || ''; REPO_.pre = null; REPO_.hint = null; REPO_.used = {}; }
function tcKeys_(table, gen) {
  var keys = ['TS_' + table + '_' + gen + '_n'];
  for (var i = 0; i < TC_MAX_CHUNKS_; i++) keys.push('TS_' + table + '_' + gen + '_' + i);
  return keys;
}
/**
 * { headers, raw: [[sheetRow, v1, v2…]] } from the shared cache, or null.
 * v0.35.0: also under the lock — the generations are read again when the lock is taken, and every writer retires a
 * table's generation after flushing and before releasing the lock, so a copy under the current generation is exact.
 */
function tcGet_(table) {
  if (!tcOn_(table) || DIRTY_[table]) return null;
  var gen = tcGens_()[table], c = tcCache_();
  if (!gen || !c) return null;
  try {
    var pre = tcPrefetch_()[table];
    if (pre && pre.gen === gen) { tcUse_(table, Math.ceil(pre.s.length / TC_CHUNK_)); return JSON.parse(pre.s); }
    var keys = tcKeys_(table, gen), got = c.getAll(keys) || {}, n = num_(got[keys[0]], 0);
    if (!n) return null;
    var parts = [];
    for (var i = 0; i < n; i++) { var p = got[keys[i + 1]]; if (p === undefined || p === null) return null; parts.push(p); }
    tcUse_(table, n);
    return JSON.parse(parts.join(''));
  } catch (e) { console.warn('cache read ' + table + ': ' + e); return null; }
}
/**
 * Make sure a table has a generation BEFORE its sheet is read (v0.35.0). A generation created after the read could
 * replace one a writer set in between, and the old data would then be served under it.
 */
function tcGenEnsure_(table) {
  if (!tcOn_(table)) return '';
  var gens = tcGens_(), c = tcCache_();
  if (gens[table] || !c) return gens[table] || '';
  var g = tcNewGen_();
  try { c.put('TG_' + table, g, TC_GEN_TTL_); gens[table] = g; } catch (e) { return ''; }
  return g;
}
function tcPut_(table, snap, gen) {
  if (!tcOn_(table) || DIRTY_[table] || !gen) return;
  var c = tcCache_();
  if (!c) return;
  var gens = tcGens_(), put = {};
  if (gens[table] !== gen) return;                              // retired since the read began
  var s = JSON.stringify(snap), n = Math.ceil(s.length / TC_CHUNK_);
  if (n > TC_MAX_CHUNKS_) return;                               // too big to cache: always read from the sheet
  tcUse_(table, n);
  var keys = tcKeys_(table, gen);
  for (var i = 0; i < n; i++) put[keys[i + 1]] = s.slice(i * TC_CHUNK_, (i + 1) * TC_CHUNK_);
  try {
    c.putAll(put, TC_TTL_);
    c.put(keys[0], String(n), TC_TTL_);                          // the count last: a reader never sees half a copy
  } catch (e) { console.warn('cache write ' + table + ': ' + e); }
}
/** Note a write. Outside the lock it is flushed and the cached copy retired right away. */
function markDirty_(table) {
  if (!tcOn_(table)) return;
  DIRTY_[table] = 1;
  if (!LOCK_HELD_) { SpreadsheetApp.flush(); tcRetire_(); }
}
/** Give every written table a new generation (call only after the writes are flushed to the sheet). */
function tcRetire_(all) {
  var names = all ? Object.keys(SCHEMA).filter(tcOn_) : Object.keys(DIRTY_);
  DIRTY_ = {};
  var evKeys = Object.keys(EVDIRTY_);
  EVDIRTY_ = {};
  if (evKeys.length || all) {
    var c0 = tcCache_();
    try { if (c0 && evKeys.length) c0.removeAll(evKeys); if (c0 && all) { c0.put('EV_EPOCH', tcNewGen_(), TC_GEN_TTL_); c0.remove('PHIDX'); } } catch (e) { console.warn('timeline cache: ' + e); }
    if (all) REPO_.evEpoch = null;
  }
  if (!names.length) return;
  var put = {}, gens = tcGens_(), old = [];
  names.forEach(function (t) {
    if (gens[t]) old = old.concat(tcKeys_(t, gens[t]));                // v0.35.0: the retired copy's chunks are removed too
    var g = tcNewGen_(); put['TG_' + t] = g; gens[t] = g;
  });
  var c = tcCache_();
  if (!c) return;
  try { c.putAll(put, TC_GEN_TTL_); } catch (e) { console.error('cache retire failed (' + names.join(',') + '): ' + e); }
  // removing the old chunks keeps the cache from filling up with dead copies (which pushed out live ones and photos)
  try { if (old.length) c.removeAll(old); } catch (e) { console.warn('cache cleanup: ' + e); }
}
/** After a schema upgrade, a wipe or a manual repair: nothing cached before it is used again. */
function tcResetAll_() { tcRetire_(true); }

/** Write the row updates held back while holding the lock — one setValues per run of adjacent rows. */
function flushAppends_(only) {
  Object.keys(APPENDQ_).forEach(function (table) {
    if (only && table !== only) return;
    var arr = APPENDQ_[table];
    delete APPENDQ_[table];
    if (!arr.length) return;
    var h = headersOf_(table), sh = h.sheet, start = sh.getLastRow() + 1, needEnd = start + arr.length - 1, maxRows = sh.getMaxRows();
    if (needEnd > maxRows) sh.insertRowsAfter(maxRows, Math.max(needEnd - maxRows, 500));
    sh.getRange(start, 1, arr.length, h.headers.length).setValues(arr.map(function (o) { return rowArray_(h, o); }));
  });
}
function flushPending_(only) {
  flushAppends_(only);
  Object.keys(PENDING_).forEach(function (table) {
    if (only && table !== only) return;
    var p = PENDING_[table];
    delete PENDING_[table];
    var rows = Object.keys(p.rows).map(Number).sort(function (a, b) { return a - b; });
    var sh = tSheet_(p.t), i = 0;
    if (p.grow && rows.length) {
      // insertRowsAfter copies the text format of the row above, so new rows stay plain text.
      var maxRows = sh.getMaxRows(), needEnd = rows[rows.length - 1];
      if (needEnd > maxRows) sh.insertRowsAfter(maxRows, Math.max(needEnd - maxRows, 500));
    }
    while (i < rows.length) {
      var j = i;
      while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
      var block = rows.slice(i, j + 1).map(function (r) { return rowArray_(p.t, p.rows[r]); });
      sh.getRange(rows[i], 1, block.length, p.t.headers.length).setValues(block);
      i = j + 1;
    }
  });
}

/* ---------------- time & small utils ---------------- */

function nowIso_() {
  return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}
function today_() {
  return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
}
function addMinutesIso_(minutes) {
  return Utilities.formatDate(new Date(Date.now() + minutes * 60000), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}
function addDaysIso_(days) { return addMinutesIso_(days * 1440); }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function norm_(v) { return str_(v).replace(/\s+/g, ' ').toLowerCase(); }
function num_(v, dflt) { var n = Number(str_(v)); return str_(v) === '' || isNaN(n) ? dflt : n; }

/** Run fn while holding the script lock (re-entrant within one execution). */
function withLock_(fn) {
  if (LOCK_HELD_) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw userError_('النظام مشغول بعملية تانية. استنى ثواني وجرب تاني.');
  LOCK_HELD_ = true;
  lockFreshTables_();         // v0.35.0: keep only copies still current (another user may have just written)
  var done = false;
  try { var r = fn(); done = true; return r; }
  finally {
    // v0.35.0: an error drops the writes held back in this block — nothing half-done reaches the sheet
    if (!done) discardPending_();
    try { flushPending_(); }
    finally {
      LOCK_HELD_ = false;
      // write everything BEFORE the next one reads, then retire the shared copies of what changed
      try { SpreadsheetApp.flush(); tcRetire_(); } finally { lock.releaseLock(); }
    }
  }
}

/**
 * Taking the lock: read the generations again (one cache call) and keep only the tables whose copy is still the
 * current generation; everything else is read again (from the shared cache when it holds the current copy).
 */
function lockFreshTables_() {
  var had = REPO_.tables || {};
  REPO_.tables = {};
  REPO_.gens = null;
  var gens = tcGens_();
  Object.keys(had).forEach(function (name) {
    var t = had[name];
    if (t && t.gen && gens[name] === t.gen && !PENDING_[name] && !APPENDQ_[name]) REPO_.tables[name] = t;
  });
}

/** After an error under the lock: forget the held-back writes and the in-memory copies they changed. */
function discardPending_() {
  Object.keys(PENDING_).forEach(function (t) { delete REPO_.tables[t]; });
  Object.keys(APPENDQ_).forEach(function (t) { delete REPO_.tables[t]; });
  PENDING_ = {}; APPENDQ_ = {};          // DIRTY_ stays: anything already flushed in this block is still retired
}

/* ---------------- spreadsheet access ---------------- */

function ss_(group) {
  if (REPO_.ss[group]) return REPO_.ss[group];
  var id = sprop_(SS_PROP[group]) || PropertiesService.getScriptProperties().getProperty(SS_PROP[group]);
  if (!id) throw new Error('System not set up: missing spreadsheet ' + group + '. Run setupSystem().');
  REPO_.ss[group] = SpreadsheetApp.openById(id);
  return REPO_.ss[group];
}

function sheet_(table) {
  var def = SCHEMA[table];
  if (!def) throw new Error('Unknown table: ' + table);
  var sh = ss_(def.ss).getSheetByName(table);
  if (!sh) throw new Error('Missing sheet ' + table + '. Run setupSystem().');
  return sh;
}

/** Load a table into memory: { headers, idx, rows:[obj], keyIndex:{key:rowPos} }. */
function load_(table) {
  if (REPO_.tables[table]) return REPO_.tables[table];
  if (PENDING_[table] || APPENDQ_[table]) flushPending_(table);          // re-reading a table with held-back writes: write them first
  var snap = tcGet_(table), sh = null, gen = snap ? tcGens_()[table] : '';
  if (!snap) {
    gen = tcGenEnsure_(table);                      // before the read (see tcGenEnsure_)
    sh = sheet_(table);
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    var values = lastRow > 0 && lastCol > 0 ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
    snap = { headers: values[0].map(str_), raw: [] };
    for (var r = 1; r < values.length; r++) {
      if (values[r].join('') === '') continue;
      snap.raw.push([r + 1].concat(values[r].map(str_)));
    }
    tcPut_(table, snap, gen);
  }
  var headers = snap.headers, idx = {};
  headers.forEach(function (h, i) { if (h) idx[h] = i; });
  var key = SCHEMA[table].key;
  var rows = [], keyIndex = {};
  snap.raw.forEach(function (row) {
    var o = {};
    headers.forEach(function (h, i) { if (h) o[h] = row[i + 1] === undefined ? '' : row[i + 1]; });
    o.__row = row[0];                      // sheet row, internal only — never an identity
    rows.push(o);
    if (o[key] !== '') keyIndex[o[key]] = rows.length - 1;
  });
  REPO_.tables[table] = { name: table, headers: headers, idx: idx, rows: rows, keyIndex: keyIndex, sheet: sh, gen: gen };
  return REPO_.tables[table];
}
/** The table's sheet, opened only when something is written (a cached read never opens the spreadsheet). */
function tSheet_(t) { return t.sheet || (t.sheet = sheet_(t.name)); }

function invalidate_(table) { delete REPO_.tables[table]; }

/** Public-ish readers (return copies without __row). */
function all_(table) {
  return load_(table).rows.map(clean_);
}
function get_(table, keyVal) {
  var t = load_(table);
  var i = t.keyIndex[str_(keyVal)];
  return i === undefined ? null : clean_(t.rows[i]);
}
function where_(table, pred) {
  return load_(table).rows.filter(function (r) { return pred(r); }).map(clean_);
}
/**
 * Query by simple field filters — the shape a SQL database answers directly
 * (WHERE col = x AND col2 IN (...) ORDER BY ... LIMIT n), so moving off Sheets later
 * only changes this function. New code uses find_/findOne_ instead of where_ closures.
 *   filter: { Col: 'value' | ['a','b'] }      opts: { sort: 'Col' | '-Col', limit: n }
 */
function find_(table, filter, opts) {
  filter = filter || {}; opts = opts || {};
  var keys = Object.keys(filter);
  var t = load_(table);
  var keyCol = SCHEMA[table].key;
  var rows;
  if (keys.length === 1 && keys[0] === keyCol && !Array.isArray(filter[keyCol])) {
    var i = t.keyIndex[str_(filter[keyCol])];
    rows = i === undefined ? [] : [t.rows[i]];
  } else {
    // v0.35.0: an equality filter uses a per-column index (built once per execution, kept up to date by insert/update),
    // so «for each interview, find its panel» no longer scans the whole panel table every time
    var base = t.rows, ixCol = null;
    for (var q = 0; q < keys.length; q++) if (!Array.isArray(filter[keys[q]]) && t.idx[keys[q]] !== undefined) { ixCol = keys[q]; break; }
    if (ixCol) base = (colIndex_(t, ixCol)[str_(filter[ixCol])] || []).map(function (pos) { return t.rows[pos]; });
    rows = base.filter(function (r) {
      for (var k = 0; k < keys.length; k++) {
        var want = filter[keys[k]], have = r[keys[k]];
        if (Array.isArray(want) ? want.map(str_).indexOf(have) < 0 : str_(want) !== have) return false;
      }
      return true;
    });
  }
  if (opts.sort) {
    var desc = opts.sort.charAt(0) === '-', col = desc ? opts.sort.slice(1) : opts.sort;
    rows = rows.slice().sort(function (a, b) { return (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (desc ? -1 : 1); });
  }
  if (opts.limit) rows = rows.slice(0, opts.limit);
  return rows.map(clean_);
}
/** value → row positions of one column (ascending), built on first use. */
function colIndex_(t, col) {
  t.ix = t.ix || {};
  if (t.ix[col]) return t.ix[col];
  var m = {};
  t.rows.forEach(function (r, i) { var v = r[col] === undefined ? '' : r[col]; (m[v] || (m[v] = [])).push(i); });
  return (t.ix[col] = m);
}
/** Keep the column indexes right after a row changed (old values → new) or was added (before = null). */
function colIndexTouch_(t, pos, before, after) {
  if (!t.ix) return;
  Object.keys(t.ix).forEach(function (col) {
    var m = t.ix[col], nv = after[col] === undefined ? '' : after[col];
    if (before) {
      var ov = before[col] === undefined ? '' : before[col];
      if (ov === nv) return;
      var a = m[ov]; if (a) { var j = a.indexOf(pos); if (j >= 0) a.splice(j, 1); }
      var b = m[nv] || (m[nv] = []), k = 0;
      while (k < b.length && b[k] < pos) k++;
      b.splice(k, 0, pos);
    } else (m[nv] || (m[nv] = [])).push(pos);
  });
}
function findOne_(table, filter) { return find_(table, filter, { limit: 1 })[0] || null; }

function clean_(o) {
  var c = {};
  for (var k in o) if (k !== '__row') c[k] = o[k];
  return c;
}

/**
 * A cell value as written to the sheet. Text that starts with "=" would become a formula when it reaches the
 * sheet (e.g. a name typed on the public apply page), so its first "=" is stored as the look-alike "＝" (U+FF1D).
 * No real value in the portal starts with "=" (JSON starts with [ or {).
 */
function cellText_(v) {
  var s = str_(v);
  // v0.35.0: a cell holds at most 50,000 characters — refuse clearly instead of failing half-way through a write
  if (s.length > 49000) throw userError_('النص ده أطول من اللي الشيت يقدر يشيله في خانة واحدة (50 ألف حرف) — اختصره.');
  return s.charAt(0) === '=' ? '\uFF1D' + s.slice(1) : s;
}

function rowArray_(t, obj) {
  return t.headers.map(function (h) { return h ? cellText_(obj[h]) : ''; });
}

/** Tables that only ever grow and are read far less often than written (audit trail, timeline events, notifications). */
var APPEND_ONLY_ = { AUDIT_LOG: 1, EVENTS: 1, NOTIFICATIONS: 1, ACTIVITIES: 1, CV_AI_RUNS: 1 };   // v0.32.0: + activities, AI readings (keys from the ID sequence)

/** Header row of a table, read once per execution (no full-table read). */
function headersOf_(table) {
  REPO_.heads = REPO_.heads || {};
  if (REPO_.heads[table]) return REPO_.heads[table];
  var sh = sheet_(table), lastCol = sh.getLastColumn();
  REPO_.heads[table] = { sheet: sh, headers: lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_) : [] };
  return REPO_.heads[table];
}

/** Insert one or many objects. Standard columns are filled automatically. */
function insertMany_(table, objs, actorId) {
  if (!objs.length) return [];
  // every write runs under the lock, on rows read fresh from the sheet (row positions and key checks are then exact)
  if (!LOCK_HELD_) return withLock_(function () { return insertMany_(table, objs, actorId); });
  // append-only logs: write at the end without loading the whole table (keys come from the ID sequence, so they are unique)
  if (APPEND_ONLY_[table] && !REPO_.tables[table]) return appendRows_(table, objs, actorId, true);
  var t = load_(table);
  var def = SCHEMA[table];
  var ts = nowIso_();
  var key = def.key;
  var arr = objs.map(function (o) {
    var obj = {};
    for (var k in o) obj[k] = o[k];
    if (!def.noStd) {
      obj.Created_At = obj.Created_At || ts;
      obj.Created_By = obj.Created_By || actorId || 'SYSTEM';
    }
    if (str_(obj[key]) === '') throw new Error(table + ': missing key ' + key);
    if (t.keyIndex[str_(obj[key])] !== undefined) throw new Error(table + ': duplicate key ' + obj[key]);
    return obj;
  });
  // v0.32.2: new rows are held back like updates and written at lock release — rows added one after the other
  // in the same lock go to the sheet in one write (a stage of demo data made ~300 single-row writes)
  if (t.nextRow === undefined) t.nextRow = tSheet_(t).getLastRow() + 1;
  var start = t.nextRow;
  t.nextRow += arr.length;
  var p = PENDING_[table] || (PENDING_[table] = { t: t, rows: {} });
  p.t = t; p.grow = true;
  arr.forEach(function (o, i) {
    var stored = {};
    t.headers.forEach(function (h) { if (h) stored[h] = str_(o[h]); });
    stored.__row = start + i;
    t.rows.push(stored);
    t.keyIndex[stored[key]] = t.rows.length - 1;
    colIndexTouch_(t, t.rows.length - 1, null, stored);
    p.rows[stored.__row] = stored;
  });
  markDirty_(table);
  return arr.map(clean_);
}
function insert_(table, obj, actorId) { return insertMany_(table, [obj], actorId)[0]; }

/** later = true (under the lock): queued and written at lock release, one write per table (v0.32.2). */
function appendRows_(table, objs, actorId, later) {
  var h = headersOf_(table), def = SCHEMA[table], ts = nowIso_();
  var arr = objs.map(function (o) {
    var obj = {};
    for (var k in o) obj[k] = o[k];
    if (!def.noStd) { obj.Created_At = obj.Created_At || ts; obj.Created_By = obj.Created_By || actorId || 'SYSTEM'; }
    if (str_(obj[def.key]) === '') throw new Error(table + ': missing key ' + def.key);
    return obj;
  });
  if (later && LOCK_HELD_) {
    (APPENDQ_[table] = APPENDQ_[table] || []).push.apply(APPENDQ_[table], arr);
    markDirty_(table);
    return arr.map(clean_);
  }
  var sh = h.sheet, start = sh.getLastRow() + 1, needEnd = start + arr.length - 1, maxRows = sh.getMaxRows();
  if (needEnd > maxRows) sh.insertRowsAfter(maxRows, Math.max(needEnd - maxRows, 500));
  sh.getRange(start, 1, arr.length, h.headers.length).setValues(arr.map(function (o) { return rowArray_(h, o); }));
  markDirty_(table);
  return arr.map(clean_);
}

/** Update by key with a patch. Returns { before, after }. */
function update_(table, keyVal, patch, actorId) {
  if (!LOCK_HELD_) return withLock_(function () { return update_(table, keyVal, patch, actorId); });
  var t = load_(table);
  var i = t.keyIndex[str_(keyVal)];
  if (i === undefined) throw new Error(table + ': not found ' + keyVal);
  var cur = t.rows[i];
  var before = clean_(cur);
  for (var k in patch) {
    if (k === SCHEMA[table].key || k === '__row') continue;
    if (t.idx[k] === undefined) throw new Error(table + ': unknown column ' + k);
    cur[k] = str_(patch[k]);
  }
  if (!SCHEMA[table].noStd) {
    cur.Updated_At = nowIso_();
    cur.Updated_By = actorId || 'SYSTEM';
  }
  colIndexTouch_(t, i, before, cur);
  // held back and written at lock release, together with the other rows changed meanwhile (one write per block)
  var p = PENDING_[table] || (PENDING_[table] = { t: t, rows: {} });
  p.t = t;
  p.rows[cur.__row] = cur;
  markDirty_(table);
  return { before: before, after: clean_(cur) };
}

/* ---------------- IDs ---------------- */

/** Reserve `count` sequential IDs for an entity. Must run under the lock. */
function nextIds_(entity, count) {
  return withLock_(function () {
    // ID_SEQUENCES is never cached: under the lock it is always read from the sheet, and we are the only writer
    var seq = get_('ID_SEQUENCES', entity);
    if (!seq) throw new Error('No ID sequence for ' + entity);
    var year = new Date().getFullYear();
    var last = num_(seq.Last_Number, 0);
    var patch = {};
    if (seq.Year_Scoped === 'Y' && str_(seq.Year) !== String(year)) { last = 0; patch.Year = String(year); }
    var pad = num_(seq.Pad_Length, 4);
    var ids = [];
    for (var i = 1; i <= count; i++) {
      var n = String(last + i);
      while (n.length < pad) n = '0' + n;
      ids.push(seq.Prefix + '-' + (seq.Year_Scoped === 'Y' ? year + '-' : '') + n);
    }
    patch.Last_Number = String(last + count);
    update_('ID_SEQUENCES', entity, patch, 'SYSTEM');
    return ids;
  });
}
function nextId_(entity) { return nextIds_(entity, 1)[0]; }

/**
 * Repair ID counters that fell behind the data (e.g. after overlapping writes):
 * every counter is raised to the highest number already used with its prefix.
 */
function repairSequences_(skipLogs) {
  var maxBy = {};
  Object.keys(SCHEMA).forEach(function (table) {
    if (skipLogs && (table === 'AUDIT_LOG' || table === 'EVENTS')) return;    // v0.35.0: the weekly run leaves the big logs out
    var key = SCHEMA[table].key;
    load_(table).rows.forEach(function (r) {
      var m = /^([A-Z]+)-(?:(\d{4})-)?(\d+)$/.exec(r[key] || '');
      if (!m) return;
      var k = m[1] + '|' + (m[2] || ''), n = Number(m[3]);
      if (!maxBy[k] || n > maxBy[k]) maxBy[k] = n;
    });
  });
  var fixed = [];
  invalidate_('ID_SEQUENCES');
  all_('ID_SEQUENCES').forEach(function (s) {
    var k = s.Prefix + '|' + (s.Year_Scoped === 'Y' ? s.Year : '');
    var mx = maxBy[k] || 0;
    if (mx > num_(s.Last_Number, 0)) {
      update_('ID_SEQUENCES', s.Entity, { Last_Number: String(mx) }, 'SYSTEM');
      fixed.push(s.Entity + ' ' + s.Last_Number + '→' + mx);
    }
  });
  if (fixed.length) console.log('Repaired ID counters: ' + fixed.join(', '));
  return fixed;
}

/* ---------------- working days (WEEKEND_DAYS) ---------------- */

var DOW_ = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
/** Weekly days off, as JS day numbers (default Friday and Saturday). */
function weekendDays_() {
  return str_(cfg_('WEEKEND_DAYS', 'FRI,SAT')).toUpperCase().split(/[,\s]+/).filter(function (k) { return k in DOW_; }).map(function (k) { return DOW_[k]; });
}
function ymdMs_(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str_(ymd)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
function isWeekend_(ymd) { var ms = ymdMs_(ymd); return !isNaN(ms) && weekendDays_().indexOf(new Date(ms).getUTCDay()) >= 0; }
/** Working days from one date to another (the start day not counted, weekly days off skipped). */
function workDaysBetween_(fromYmd, toYmd) {
  var a = ymdMs_(fromYmd), b = ymdMs_(toYmd), off = weekendDays_(), n = 0;
  if (isNaN(a) || isNaN(b)) return 0;
  for (var t = a + 86400000; t <= b; t += 86400000) if (off.indexOf(new Date(t).getUTCDay()) < 0) n++;
  return n;
}
/** Minutes between two local 'yyyy-MM-ddTHH:mm[:ss]' times, leaving out the weekly days off. */
function workMinutesBetween_(fromIso, toIso) {
  var m1 = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str_(fromIso)), m2 = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str_(toIso));
  if (!m1 || !m2) return null;
  var a = Date.UTC(+m1[1], +m1[2] - 1, +m1[3], +(m1[4] || 0), +(m1[5] || 0), +(m1[6] || 0)), b = Date.UTC(+m2[1], +m2[2] - 1, +m2[3], +(m2[4] || 0), +(m2[5] || 0), +(m2[6] || 0));
  if (b <= a) return Math.round((b - a) / 60000);
  var off = weekendDays_(), total = 0, day = Date.UTC(+m1[1], +m1[2] - 1, +m1[3]);
  for (; day < b; day += 86400000) {
    var s = Math.max(a, day), e = Math.min(b, day + 86400000);
    if (e > s && off.indexOf(new Date(day).getUTCDay()) < 0) total += e - s;
  }
  return Math.round(total / 60000);
}

/* ---------------- config ---------------- */

function cfg_(key, dflt) {
  var c = get_('CONFIG', key);
  if (!c || c.Config_Value === '') return dflt;
  if (c.Value_Type === 'NUMBER') return num_(c.Config_Value, dflt);
  if (c.Value_Type === 'BOOL') return c.Config_Value === 'Y';
  return c.Config_Value;
}
