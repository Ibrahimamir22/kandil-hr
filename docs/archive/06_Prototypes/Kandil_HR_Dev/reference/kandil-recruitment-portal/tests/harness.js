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
    const files = {};
    const folder = id => ({ getId: () => id, getUrl: () => 'https://drive/' + id,
      createFolder: n => folder(id + '/' + n),
      createFile: b => { const fid = 'file' + (Object.keys(files).length + 1); files[fid] = b; return { getId: () => fid }; } });
    return { __files: files, createFolder: n => folder('f1'), getFolderById: id => folder(id),
      getFileById: id => ({ moveTo: () => {}, getBlob: () => { if (!files[id]) throw new Error('no file ' + id); return files[id]; } }) };
  })(),
  ScriptApp: (() => {
    const triggers = [];
    const mk = fn => { const t = { fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, everyDays: () => b, everyHours: () => b, atHour: h => { t.hour = h; return b; }, inTimezone: () => b, create: () => { triggers.push(t); return t; } }; return b; };
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
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => Array.from(Buffer.from(s, 'base64')),
    base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
    newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getContentType: () => mime, getName: () => name }),
    formatDate: (d, tz, fmt) => {
      const x = new Date(d.getTime() + 3 * 3600000);
      const Y = x.getUTCFullYear(), M = pad(x.getUTCMonth() + 1), D = pad(x.getUTCDate());
      if (fmt === 'yyyy-MM-dd') return `${Y}-${M}-${D}`;
      return `${Y}-${M}-${D}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
    }
  },
  HtmlService: { createHtmlOutputFromFile: n => ({ getContent: () => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8') }) }
};
ctx.Utilities.MacAlgorithm = { HMAC_SHA_1: 'sha1', HMAC_SHA_256: 'sha256' };
ctx.Utilities.computeHmacSignature = (alg, value, key) => {
  const buf = v => typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(x => x & 255));
  return Array.from(crypto.createHmac(alg, buf(key)).update(buf(value)).digest()).map(b => b > 127 ? b - 256 : b);
};
vm.createContext(ctx);
['Reports.gs','Demo.gs','Transfers.gs','NewHire.gs','Probation.gs','Kpi.gs','Insights.gs','Readiness.gs','CvAi.gs','Photos.gs','Ceo.gs','Dual.gs','Ops.gs','Consent.gs','PrivacyRules.gs','Self.gs','Onboarding.gs','OrgChart.gs','Security.gs','Privacy.gs','Joining.gs','Pay.gs','Offers.gs','Assessments.gs','Interviews.gs','Pool.gs','Screening.gs','Referrals.gs','Admin.gs','Daily.gs','Sourcing.gs','EnNamesDict.gs','I18nDict.gs','I18n.gs','JobDescriptions.gs','JdReview.gs','Presence.gs','Grades.gs','Employees.gs','Candidates.gs','OrgAdmin.gs','Structural.gs','Vacancies.gs','Requests.gs','RequestChanges.gs','Workflow.gs','Setup.gs','Api.gs','Import.gs','Services.gs','Perm.gs','Auth.gs','Audit.gs','Repo.gs','Config.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
vm.runInContext('var __ceoQueue = ceoQueue_; ceoQueue_ = function () { return globalThis.__ceoReal ? __ceoQueue.apply(null, arguments) : null; };', ctx);
// v0.38.0: tests written before the consent gate move hand-added candidates freely; a test of the gate sets ctx.__consentReal = true
vm.runInContext('var __noRel = noRelationCheck_; noRelationCheck_ = function () { return globalThis.__relReal ? __noRel.apply(null, arguments) : null; };', ctx);
vm.runInContext('var __consentGate = consentGate_; consentGate_ = function () { return globalThis.__consentReal ? __consentGate.apply(null, arguments) : null; };', ctx);

/* ---------- helpers ---------- */
let pass = 0, failN = 0;
function ok(cond, msg) { if (cond) { pass++; } else { failN++; console.log('FAIL: ' + msg); } }
function fresh() { ctx.REPO_.tables = {}; ctx.REPO_.ss = {}; ctx.REPO_.heads = {}; ctx.REPO_.gens = null; ctx.REPO_.props = null; }       // each web request starts cold
function pub(a, p) { fresh(); return ctx.apiPublic(a, p); }
function api(a, t, p) { fresh(); return ctx.api(a, t, p); }
function sheet(table) { const g = ctx.SCHEMA[table].ss; return store[props[ctx.SS_PROP[g]]].getSheetByName(table); }
function login(email) {
  mails.length = 0;
  const r = pub('auth.requestCode', { email });
  if (!r.ok) throw new Error('requestCode failed ' + r.error);
  const m = mails[0]; if (!m) return null;
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(m.htmlBody)[1];
  const v = pub('auth.verifyCode', { email, code, userAgent: 'test' });
  if (!v.ok) throw new Error('verify failed ' + v.error);
  return v.data.token;
}

/* ---------- scenario ---------- */
ctx.setupSystem();
fresh(); ctx.update_('CONFIG', 'TOTP_REQUIRED_ROLES', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'TOTP_AFTER_EMAIL_LOGINS', { Config_Value: '0' }, 'x');   ctx.update_('CONFIG', 'USAGE_POLICY_REQUIRED', { Config_Value: 'N' }, 'x');   // v0.15.0 rules are tested in phase16, the v0.38 policy in phase38
ok(Object.keys(ctx.SCHEMA).every(t => sheet(t)), 'all sheets created');
ok(sheet('POSITIONS').getRange(1, 1, 1, 3).getValues()[0][0] === 'Position_ID', 'headers written');
ok(store[props.SS_CORE].getSheetByName('Sheet1') === null, 'default sheet removed');
ctx.setupSystem();   // idempotent
fresh();
ok(ctx.all_('ROLES').length === 11 && ctx.all_('CONFIG').length === 150 && ctx.all_('REASON_MASTER').length === 49 && ctx.all_('MESSAGE_TEMPLATES').length === 24 && ctx.all_('RECRUITMENT_SOURCES').length === 13, 'seeds not duplicated on rerun: ' + ctx.all_('CONFIG').length + '/' + ctx.all_('REASON_MASTER').length);

// schema migration: extra column appended at end only
ctx.SCHEMA.USERS.cols.push('Test_New_Col');
ctx.setupSystem();
const uh = sheet('USERS').getRange(1, 1, 1, sheet('USERS').getLastColumn()).getValues()[0];
ok(uh[uh.length - 1] === 'Test_New_Col' && uh[0] === 'User_ID', 'new column appended at far right');
ctx.SCHEMA.USERS.cols.pop();

vm.runInContext("OWNER_EMAIL='Owner@Test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
fresh(); ctx.bootstrapOwner();   // re-run safe
fresh();
ok(ctx.all_('USERS').length === 1 && ctx.all_('USER_ROLES').length === 2, 'owner bootstrapped once with 2 roles');

// login flow
mails.length = 0;
let r = pub('auth.requestCode', { email: 'nobody@test.com' });
ok(r.ok && mails.length === 0, 'unknown email: generic answer, no mail');
r = pub('auth.requestCode', { email: 'bad' });
ok(!r.ok, 'invalid email rejected');
mails.length = 0;
pub('auth.requestCode', { email: 'owner@test.com' });
ok(mails.length === 1, 'code mailed');
r = pub('auth.verifyCode', { email: 'owner@test.com', code: '000000' });
ok(!r.ok, 'wrong code rejected');
fresh(); ok(ctx.all_('LOGIN_CODES')[0].Attempts === '1', 'attempt counted');
const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
r = pub('auth.verifyCode', { email: 'OWNER@test.com', code });
ok(r.ok && r.data.token, 'right code accepted (case-insensitive email)');
const tOwner = r.data.token;
r = pub('auth.verifyCode', { email: 'owner@test.com', code });
ok(!r.ok, 'code cannot be reused');
fresh(); ok(ctx.all_('SESSIONS')[0].Token_Hash !== tOwner, 'token stored hashed');

r = api('me', 'garbage');
ok(!r.ok && r.auth, 'bad token → auth error');
r = api('me', tOwner);
ok(r.ok && r.data.can.importStructure && r.data.can.editGrade, 'owner capabilities');

// import
const T = '\t';
const rows = [
  ctx.IMPORT_COLS.join(T),
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''].join(T),
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''].join(T),
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', 'FIN-007', 'مدير الحسابات', 'العبور', '', 'Y', '', ''].join(T),
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'رئيس قسم التكاليف', 'العبور', '', 'Y', '', ''].join(T),
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'العبور', 'رئيس قسم التكاليف', '', '', '2'].join(T),
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'محاسب تكاليف', 'إنشاص', '', '', 'G99', ''].join(T),
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', 'مدير الحسابات', '', '', ''].join(T),
  ['قنديل مصر', 'قطاع التصنيع', 'مصنع العبور', '', '', '', 'فني تجميع', 'العبور', '', '', '', ''].join(T)
].join('\n');
r = api('import.preview', tOwner, { text: rows });
ok(r.ok && r.data.errors.length === 0, 'preview no errors ' + JSON.stringify(r.data && r.data.errors));
ok(r.data.unitsNew === 6 && r.data.positionsNew === 8 && r.data.locationsNew === 2 && r.data.jobsNew === 7,
  'preview counts ' + JSON.stringify({ u: r.data.unitsNew, p: r.data.positionsNew, l: r.data.locationsNew, j: r.data.jobsNew }));
ok(r.data.warnings.some(w => /G99/.test(w.msg)), 'unknown grade warned');
fresh(); ok(ctx.all_('ORG_UNITS').length === 0, 'preview wrote nothing');

const bad = rows + '\n' + ['قنديل مصر', '', 'إدارة يتيمة', '', '', '', 'x', 'العبور', '', '', '', ''].join(T) +
  '\n' + ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'التكاليف', '', '', 'مدير تاني', 'العبور', '', 'Y', '', ''].join(T);
r = api('import.preview', tOwner, { text: bad });
ok(r.ok && r.data.errors.length === 2, 'gap + double head detected ' + JSON.stringify(r.data.errors));
r = api('import.commit', tOwner, { text: bad });
ok(!r.ok, 'commit blocked with errors');

r = api('import.commit', tOwner, { text: rows, reason: 'initial' });
ok(r.ok && r.data.committed, 'commit ok ' + (r.error || ''));
fresh();
const units = ctx.all_('ORG_UNITS'), positions = ctx.all_('POSITIONS'), jobs = ctx.all_('JOBS');
ok(units.length === 6 && positions.length === 8 && jobs.length === 7, 'written counts');
ok(units.every(u => /^OU-\d{4}$/.test(u.Org_Unit_ID)) && positions.every(p => /^POS-\d{6}$/.test(p.Position_ID)), 'real ids');
ok(jobs.some(j => j.Job_Code === 'FIN-007'), 'given job code kept');
const byTitle = t => positions.filter(p => (jobs.find(j => j.Job_Code === p.Job_Code) || {}).Job_Title_AR === t);
const ceo = byTitle('الرئيس التنفيذي')[0], cfo = byTitle('مدير القطاع المالي')[0], accMgr = byTitle('مدير الحسابات')[0];
const costHead = byTitle('رئيس قسم التكاليف')[0], costAcc = byTitle('محاسب تكاليف'), gen = byTitle('محاسب عام')[0], tech = byTitle('فني تجميع')[0];
ok(cfo.Reports_To_Position_ID === ceo.Position_ID, 'sector head reports to CEO');
ok(accMgr.Reports_To_Position_ID === cfo.Position_ID, 'dept head reports to sector head');
ok(costHead.Reports_To_Position_ID === accMgr.Position_ID, 'section head reports to dept head');
ok(costAcc.length === 2 && costAcc.every(p => p.Reports_To_Position_ID === costHead.Position_ID), 'cost accountants (2 locations) report to section head');
ok(costAcc.some(p => p.Structural_HC === '2') && costAcc.some(p => p.Structural_HC === '1'), 'HC from file / default 1');
ok(gen.Reports_To_Position_ID === accMgr.Position_ID, 'explicit reports-to resolved');
ok(tech.Reports_To_Position_ID === ceo.Position_ID, 'unit without head → climbs to nearest head');
const finUnit = units.find(u => u.Name_AR === 'الحسابات');
ok(finUnit.Head_Position_ID === accMgr.Position_ID, 'unit head set');
ok(positions.every(p => p.HC_Basis === 'BASELINE_TEMP'), 'HC basis temporary');

r = api('import.commit', tOwner, { text: rows });
ok(!r.ok && /مافيش/.test(r.error), 're-import adds nothing');
fresh(); ok(ctx.all_('POSITIONS').length === 8, 'no duplicates after re-import');

// add-on import extends existing structure
r = api('import.commit', tOwner, { text: ['قنديل مصر', 'القطاع المالي', 'الحسابات', 'الخزينة', '', '', 'أمين خزينة', 'العبور', '', '', '', ''].join(T) });
ok(r.ok && r.data.unitsNew === 1 && r.data.positionsNew === 1, 'incremental import');
fresh();
const treasurer = ctx.all_('POSITIONS').find(p => (ctx.get_('JOBS', p.Job_Code) || {}).Job_Title_AR === 'أمين خزينة');
ok(treasurer.Reports_To_Position_ID === accMgr.Position_ID, 'new headless section → dept head');

// tree & search
r = api('org.tree', tOwner);
ok(r.ok && r.data.length === 7, 'tree units');
const finSector = units.find(u => u.Name_AR === 'القطاع المالي');
r = api('positions.search', tOwner, { unitId: finSector.Org_Unit_ID });
ok(r.ok && r.data.total === 7, 'search by unit incl. children = ' + (r.data && r.data.total));
r = api('positions.search', tOwner, { q: 'تكاليف' });
ok(r.data.total === 3, 'text search');

// users & roles
r = api('users.save', tOwner, { Email: 'acc.manager@test.com', Full_Name_AR: 'مدير الحسابات', Position_ID: accMgr.Position_ID });
ok(r.ok, 'create manager user ' + (r.error || ''));
const mgrId = r.data.User_ID;
r = api('users.save', tOwner, { Email: 'acc.manager@test.com', Full_Name_AR: 'تاني' });
ok(!r.ok, 'duplicate email blocked');
r = api('users.save', tOwner, { Email: 'hr@test.com', Full_Name_AR: 'مدير الموارد', Position_ID: 'POS-999999' });
ok(!r.ok, 'bad position blocked');
r = api('users.save', tOwner, { Email: 'hr@test.com', Full_Name_AR: 'مدير الموارد' });
const hrId = r.data.User_ID;
r = api('users.setRoles', tOwner, { User_ID: hrId, roles: [{ Role_Code: 'HR_MANAGER', Scope_Type: 'ALL' }], reason: 'x' });
ok(r.ok && r.data.added === 1, 'grant HR manager');

const tMgr = login('acc.manager@test.com');
r = api('me', tMgr);
ok(r.ok && r.data.headedUnits.length === 1 && r.data.managedUnitCount === 3, 'manager scope from position: ' + JSON.stringify(r.data && [r.data.headedUnits, r.data.managedUnitCount]));
r = api('users.list', tMgr);
ok(!r.ok, 'manager cannot list users');
r = api('positions.update', tMgr, { Position_ID: gen.Position_ID, Structural_HC: '3', reason: 'test' });
ok(!r.ok, 'manager cannot edit HC');

const tHr = login('hr@test.com');
r = api('users.setRoles', tHr, { User_ID: hrId, roles: [{ Role_Code: 'HR_MANAGER' }, { Role_Code: 'SYS_OWNER' }] });
ok(!r.ok, 'HR manager cannot grant SYS_OWNER');
r = api('import.preview', tHr, { text: rows });
ok(!r.ok, 'HR manager cannot import');
r = api('positions.update', tHr, { Position_ID: gen.Position_ID, Structural_HC: '3' });
ok(!r.ok, 'reason required');
r = api('positions.update', tHr, { Position_ID: gen.Position_ID, Structural_HC: '-1', reason: 'اختبار' });
ok(!r.ok, 'negative HC blocked');
r = api('positions.update', tHr, { Position_ID: gen.Position_ID, Structural_HC: '3', Occupied_HC: '2', reason: 'اختبار' });
ok(r.ok && r.data.Structural_HC === '3' && r.data.Occupied_Updated_By === hrId, 'HC updated');
r = api('positions.history', tHr, { Position_ID: gen.Position_ID });
ok(r.ok && r.data.length === 2, 'position history 2 rows');
r = api('positions.update', tHr, { Position_ID: gen.Position_ID, Reports_To_Position_ID: gen.Position_ID, reason: 'x y z' });
ok(!r.ok, 'self reports-to blocked');

// grades: only HR sector
fresh(); ctx.insert_('GRADES', { Grade_Code: 'G07', Grade_Name: 'Grade 7', Level_Order: '7', Status: 'Active' }, 'SYSTEM');
r = api('jobs.update', tHr, { Job_Code: 'FIN-007', Grade_Code: 'G07', reason: 'درجة' });
ok(!r.ok && /مدير قطاع/.test(r.error), 'HR manager cannot change grade');
r = api('jobs.update', tOwner, { Job_Code: 'FIN-007', Grade_Code: 'G07', reason: 'درجة' });
ok(r.ok && r.data.Grade_Code === 'G07', 'HR sector changes grade');
fresh(); ok(ctx.all_('JOB_VERSIONS').length === 1, 'job version snapshot');

// config
r = api('config.update', tOwner, { Config_Key: 'HC_ENFORCEMENT_MODE', Config_Value: 'MAYBE', reason: 'x y z' });
ok(!r.ok, 'invalid config value blocked');
r = api('config.update', tOwner, { Config_Key: 'SESSION_DAYS', Config_Value: '7', reason: 'أمان' });
ok(r.ok, 'config updated');

// owner protection & deactivation
const ownerId = ctx.all_('USERS').find(u => u.Email === 'owner@test.com').User_ID;
r = api('users.setRoles', tOwner, { User_ID: ownerId, roles: [{ Role_Code: 'HR_SECTOR_MANAGER' }] });
ok(!r.ok, 'cannot remove last owner');
r = api('users.save', tOwner, { User_ID: mgrId, Email: 'acc.manager@test.com', Full_Name_AR: 'مدير الحسابات', Position_ID: accMgr.Position_ID, Status: 'Inactive', reason: 'ترك العمل' });
ok(r.ok, 'deactivate manager');
r = api('me', tMgr);
ok(!r.ok && r.auth, 'deactivated user session revoked');
mails.length = 0; pub('auth.requestCode', { email: 'acc.manager@test.com' });
ok(mails.length === 0, 'inactive user gets no code');

// audit
r = api('audit.search', tOwner, { entityId: gen.Position_ID });
ok(r.ok && r.data.total === 2 && r.data.rows[0].Reason === 'اختبار', 'audit per field ' + JSON.stringify(r.data && r.data.total));
r = api('audit.search', tOwner, { action: 'STRUCTURE_IMPORT' });
ok(r.data.total === 2, 'import audited');
fresh();
const auditIds = ctx.all_('AUDIT_LOG').map(a => a.Audit_ID);
ok(new Set(auditIds).size === auditIds.length, 'audit ids unique');

// throttle
mails.length = 0;
for (let i = 0; i < 3; i++) pub('auth.requestCode', { email: 'hr@test.com' });
const sentBefore = mails.length;
r = pub('auth.requestCode', { email: 'hr@test.com' });
ok(r.ok && r.data.ok && mails.length === sentBefore, 'code throttle after 3 in 15 min (v0.34: same answer, no e-mail sent)');
r = pub('auth.requestCode', { email: 'nobody@test.com' });
ok(r.ok && r.data.message === ctx.GENERIC_CODE_MSG, 'an unknown address gets the same answer');

// logout
r = api('auth.logout', tOwner);
ok(r.ok, 'logout');
r = api('me', tOwner);
ok(!r.ok && r.auth, 'token dead after logout');

// big import crosses the 1000-row sheet limit
const tOwner2 = (() => { fresh(); ctx.update_('LOGIN_CODES', ctx.all_('LOGIN_CODES')[0].Code_ID, {}, 'x'); return null; })();
const cfgLines = [];
for (let i = 0; i < 1100; i++) cfgLines.push(['قنديل مصر', 'قطاع التصنيع', 'مصنع العبور', 'خط ' + (i % 20), '', '', 'عامل ' + i, 'العبور', '', '', '', ''].join(T));
vm.runInContext("OWNER_EMAIL='owner@test.com';", ctx);
// fresh login for owner (throttle is per email; clear old codes by aging them)
fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
const tO = login('owner@test.com');
r = api('import.commit', tO, { text: cfgLines.join('\n') });
ok(r.ok && r.data.positionsNew === 1100, 'bulk 1100 rows ' + (r.error || ''));
fresh(); ok(ctx.all_('POSITIONS').length === 1109, 'positions persisted beyond 1000 rows');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
