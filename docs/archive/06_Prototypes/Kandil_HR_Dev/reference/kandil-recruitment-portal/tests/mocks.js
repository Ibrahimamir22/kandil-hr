// Node harness: mocks the Apps Script services used by Phase 1 and runs an end-to-end scenario.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');

/* ---------- mocks ---------- */
let idc = 0;
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sh.data[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j]);
      out.push(o);
    }
    return out;
  }
  setValues(v) {
    if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`setValues dims ${v.length}x${v[0].length} vs ${this.nr}x${this.nc}`);
    if (this.r + this.nr - 1 > this.sh.maxRows) throw new Error('Range out of bounds: row ' + (this.r + this.nr - 1) + ' > ' + this.sh.maxRows);
    for (let i = 0; i < this.nr; i++) {
      const rr = this.r - 1 + i;
      this.sh.data[rr] = this.sh.data[rr] || [];
      for (let j = 0; j < this.nc; j++) {
        const val = v[i][j];
        if (typeof val !== 'string') throw new Error('Non-string cell written: ' + JSON.stringify(val));
        this.sh.data[rr][this.c - 1 + j] = val;
      }
    }
    this.sh.writes++;
    return this;
  }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; this.writes = 0; }
  getName() { return this.name; }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i] && this.data[i].some(x => x !== '' && x !== undefined)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.data.forEach(r => { if (r) for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== undefined) { m = Math.max(m, j + 1); break; } }); return m; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  deleteRows(start, n) { this.data.splice(start - 1, n); this.maxRows -= n; this.deletes = (this.deletes || 0) + 1; }
  getMaxColumns() { return this.maxCols || 26; }
  deleteColumns(c, n) { this.maxCols = (this.maxCols || 26) - n; }
  getRange(r, c, nr = 1, nc = 1) { if (r < 1 || c < 1) throw new Error('bad range'); return new Range(this, r, c, nr, nc); }
  setFrozenRows() {}
  getProtections() { return this.prot ? [this.prot] : []; }
  protect() { const p = { warn: false, setDescription() { return p; }, setWarningOnly(w) { p.warn = w; return p; } }; this.prot = p; return p; }
}
class SS {
  constructor(title) { this.id = 'ss' + (++idc); this.title = title; this.sheets = [new Sheet('Sheet1')]; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}
const store = {};
const props = {};
const cache = {};
const mails = [];
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console, JSON, Math, Date, String, Number, Object, Array, Error, parseInt, isNaN, RegExp,
  Logger: { log: () => {} },
  SpreadsheetApp: {
    create: t => { const s = new SS(t); store[s.id] = s; return s; },
    openById: id => { if (!store[id]) throw new Error('no ss ' + id); return store[id]; },
    flush: () => {},
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' }
  },
  DriveApp: (() => {
    const files = {}, subs = {};
    const trashed = {};
    const folder = id => ({ getId: () => id, getUrl: () => 'https://drive/' + id, setTrashed: v => { trashed[id] = v; },
      createFolder: n => { subs[id + '/' + n] = 1; return folder(id + '/' + n); },
      getFoldersByName: n => { let done = !subs[id + '/' + n]; return { hasNext: () => !done, next: () => { done = true; return folder(id + '/' + n); } }; },
      createFile: b => { const fid = 'file' + (Object.keys(files).length + 1); files[fid] = b; b.__folder = id; return { getId: () => fid }; },
      getFiles: () => { const ids = Object.keys(files).filter(f => files[f].__folder === id && !files[f].__trashed); let i = 0; return { hasNext: () => i < ids.length, next: () => fileObj(ids[i++]) }; },
      getFolders: () => { let done = true; return { hasNext: () => !done, next: () => null }; } });
    const copies = [];
    const fileObj = id => ({ moveTo: () => {}, setTrashed: v => { if (files[id]) files[id].__trashed = v; }, makeCopy: (name, f) => { copies.push({ id, name, folder: f ? f.getId() : '' }); return { getId: () => 'copy' + copies.length }; },
      getBlob: () => { if (!files[id]) throw new Error('no file ' + id); return files[id]; } });
    return { __files: files, __copies: copies, __trashed: trashed, createFolder: n => folder('f1'), getFolderById: id => folder(id), getFileById: fileObj };
  })(),
  ScriptApp: (() => {
    const triggers = [];
    let uidN = 0;
    const mk = fn => { const t = { fn, uid: 'T' + (++uidN), getHandlerFunction: () => fn, getUniqueId: () => t.uid }; const b = { timeBased: () => b, everyDays: () => b, everyHours: () => b, after: ms => { t.after = ms; return b; }, atHour: h => { t.hour = h; return b; }, inTimezone: () => b, create: () => { triggers.push(t); return t; } }; return b; };
    return { __triggers: triggers, getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getProjectTriggers: () => triggers.slice(), deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); }, newTrigger: mk };
  })(),
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, getProperties: () => Object.assign({}, props), setProperty: (k, v) => { if (String(v).length > 9216) throw new Error('property too big: ' + k); props[k] = String(v); }, setProperties: o => { Object.keys(o).forEach(k => { props[k] = String(o[k]); }); }, deleteProperty: k => { delete props[k]; } }) },
  Session: { __active: 'owner@test.com', getActiveUser: () => ({ getEmail: () => ctx.Session.__active }), getEffectiveUser: () => ({ getEmail: () => 'owner@test.com' }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = String(v); },
    getAll: ks => { const o = {}; ks.forEach(k => { if (cache[k] !== undefined) o[k] = cache[k]; }); return o; },
    putAll: o => { Object.keys(o).forEach(k => { if (Buffer.byteLength(String(o[k]), 'utf8') > 100 * 1024) throw new Error('cache value too big: ' + k); cache[k] = String(o[k]); }); },
    remove: k => { delete cache[k]; }, removeAll: ks => { ks.forEach(k => { delete cache[k]; }); } }) },
  MailApp: { getRemainingDailyQuota: () => 100, sendEmail: o => mails.push(o) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, MacAlgorithm: { HMAC_SHA_1: 'sha1', HMAC_SHA_256: 'sha256' },
    computeHmacSignature: (alg, value, key) => {
      const buf = v => typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(x => x & 255));
      return Array.from(crypto.createHmac(alg, buf(key)).update(buf(value)).digest()).map(b => b > 127 ? b - 256 : b);
    },
    computeDigest: (a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => Array.from(Buffer.from(s, 'base64')),
    base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
    newBlob: (bytes, mime, name) => { const b = { getBytes: () => bytes, getContentType: () => mime, getName: () => name, setName: n => { name = n; return b; }, getAs: m => { mime = m; return b; },
      getDataAsString: () => Buffer.from((typeof bytes === 'string' ? Array.from(Buffer.from(bytes, 'utf8')) : bytes).map(x => x & 255)).toString('utf8') }; return b; },
    // a zip reader for the local file headers (stored or deflated), enough for a .docx
    unzip: blob => {
      const buf = Buffer.from(blob.getBytes().map(x => x & 255)), out = [];
      let i = 0;
      while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
        const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nl = buf.readUInt16LE(i + 26), xl = buf.readUInt16LE(i + 28);
        const name = buf.slice(i + 30, i + 30 + nl).toString('utf8'), start = i + 30 + nl + xl, raw = buf.slice(start, start + size);
        const data = method === 8 ? require('zlib').inflateRawSync(raw) : raw;
        out.push(ctx.Utilities.newBlob(Array.from(data).map(x => x > 127 ? x - 256 : x), 'application/octet-stream', name));
        i = start + size;
      }
      if (!out.length) throw new Error('Could not unzip');
      return out;
    },
    formatDate: (d, tz, fmt) => {
      const x = new Date(d.getTime() + 3 * 3600000);
      const Y = x.getUTCFullYear(), M = pad(x.getUTCMonth() + 1), D = pad(x.getUTCDate());
      if (fmt === 'yyyy-MM-dd') return `${Y}-${M}-${D}`;
      return `${Y}-${M}-${D}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
    }
  },
  HtmlService: { createHtmlOutputFromFile: n => ({ getContent: () => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8') }) },
  // the Anthropic API in tests: set ctx.__fetch = (url, options) => ({ code, body }) — no handler = no network
  UrlFetchApp: { fetch: (url, o) => {
    if (!ctx.__fetch) throw new Error('No network in tests: ' + url);
    const r = ctx.__fetch(url, o || {});
    return { getResponseCode: () => r.code || 200, getContentText: () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body || {}) };
  } }
};
vm.createContext(ctx);
['Config.gs', 'Repo.gs', 'Audit.gs', 'Auth.gs', 'Perm.gs', 'Services.gs', 'Import.gs', 'Workflow.gs', 'Requests.gs', 'RequestChanges.gs', 'Vacancies.gs', 'Structural.gs', 'OrgAdmin.gs', 'Candidates.gs', 'Employees.gs', 'Grades.gs', 'JobDescriptions.gs', 'JdReview.gs', 'Presence.gs', 'I18nDict.gs', 'EnNamesDict.gs', 'I18n.gs', 'Sourcing.gs', 'Referrals.gs', 'Screening.gs', 'Pool.gs', 'Interviews.gs', 'Assessments.gs', 'Offers.gs', 'Pay.gs', 'Joining.gs', 'Privacy.gs', 'Daily.gs', 'Admin.gs', 'Security.gs', 'OrgChart.gs', 'Onboarding.gs', 'NewHire.gs', 'Probation.gs', 'Kpi.gs', 'Insights.gs', 'Readiness.gs', 'CvAi.gs', 'Photos.gs', 'Ceo.gs', 'Dual.gs', 'Ops.gs', 'Consent.gs', 'PrivacyRules.gs', 'Self.gs', 'Transfers.gs', 'Demo.gs', 'Reports.gs', 'Api.gs', 'Setup.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
// v0.36.0: tests written before the CEO queue grant CEO / Board roles and top positions directly (as when the portal has
// no CEO yet); a test of the queue itself sets ctx.__ceoReal = true
vm.runInContext('var __ceoQueue = ceoQueue_; ceoQueue_ = function () { return globalThis.__ceoReal ? __ceoQueue.apply(null, arguments) : null; };', ctx);
// v0.38.0: tests written before the consent gate move hand-added candidates freely; a test of the gate sets ctx.__consentReal = true
vm.runInContext('var __noRel = noRelationCheck_; noRelationCheck_ = function () { return globalThis.__relReal ? __noRel.apply(null, arguments) : null; };', ctx);
vm.runInContext('var __consentGate = consentGate_; consentGate_ = function () { return globalThis.__consentReal ? __consentGate.apply(null, arguments) : null; };', ctx);
// Tests written before v0.15.0 sign in with email codes only: switch the authenticator rules off after setup,
// unless a test sets ctx.__keepMfa = true before calling setupSystem().
(function () {
  const setup = ctx.setupSystem;
  ctx.setupSystem = function () {
    const r = setup.apply(this, arguments);
    if (!ctx.__keepMfa) {
      ctx.REPO_.tables = {};
      ctx.update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'NONE' }, 'x');
      ctx.update_('CONFIG', 'TOTP_AFTER_EMAIL_LOGINS', { Config_Value: '0' }, 'x');
      if (ctx.get_('CONFIG', 'HOURLY_QUIET_HOURS')) ctx.update_('CONFIG', 'HOURLY_QUIET_HOURS', { Config_Value: 'NONE' }, 'x');   // tests run at any hour
    }
    if (!ctx.__keepNet && ctx.get_('CONFIG', 'NET_REVIEW_REQUIRED')) { ctx.REPO_.tables = {}; ctx.update_('CONFIG', 'NET_REVIEW_REQUIRED', { Config_Value: 'N' }, 'x'); }   // v0.40.0: tests before the payroll net review
    if (!ctx.__keepPolicy) { ctx.REPO_.tables = {}; if (ctx.get_('CONFIG', 'USAGE_POLICY_REQUIRED')) ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'N' }, 'x'); }   // v0.38.0: tests before the policy gate
    return r;
  };
})();

/* ---------- helpers ---------- */
// v0.35.0: the apply page sends the server-signed time it opened; tests that call apply.submit directly get one
// (10 seconds old) unless they pass their own or set ctx.__noStamp
(function () {
  const ap = ctx.apiPublic;
  ctx.apiPublic = function (a, p) {
    if (a === 'apply.submit' && p && p.stamp === undefined && !ctx.__noStamp) {
      const t = String(vm.runInContext('Date.now()', ctx) - 10000);
      p = Object.assign({}, p, { stamp: t + '.' + ctx.hash_('APPLY:' + String(p.code || '').trim() + ':' + t).slice(0, 24) });
    }
    const r = ap.call(this, a, p);
    // the apply page in browser tests is filled in a second: its stamp is made 10 seconds old, like a person's
    if (a === 'apply.info' && r && r.ok && r.data && r.data.stamp && !ctx.__noStamp) {
      const t = String(vm.runInContext('Date.now()', ctx) - 10000);
      r.data.stamp = t + '.' + ctx.hash_('APPLY:' + String((p && p.code) || '').trim() + ':' + t).slice(0, 24);
    }
    return r;
  };
})();
// v0.34.0: joining needs a valid National ID — tests give the person of a joining a unique test one
let nidN = 0;
ctx.__nidForJoining = function (joiningId) {
  ctx.REPO_.tables = {};
  ctx.withLock_(() => { const j = ctx.get_('JOININGS', joiningId); const per = ctx.get_('PERSONS', j.Person_ID);
    if (!/^[23]\d{13}$/.test(per.National_ID || '')) ctx.update_('PERSONS', j.Person_ID, { National_ID: '2990101' + String(1000000 + (++nidN)).slice(1) + '0' }, 'TEST'); });
};
let pass = 0, failN = 0;
function ok(cond, msg) { if (cond) { pass++; } else { failN++; console.log('FAIL: ' + msg); } }
function fresh() { ctx.REPO_.tables = {}; ctx.REPO_.ss = {}; ctx.REPO_.heads = {}; ctx.REPO_.gens = null; ctx.REPO_.props = null; ctx.REPO_.pre = null; ctx.REPO_.act = ""; }       // each web request starts cold
function pub(a, p) { fresh(); return ctx.apiPublic(a, p); }
function api(a, t, p) { fresh(); return ctx.api(a, t, p); }
module.exports = { ctx, store, props, mails, fresh, vm };
