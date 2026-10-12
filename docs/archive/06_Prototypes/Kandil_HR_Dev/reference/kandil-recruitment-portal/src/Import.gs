/**
 * Import.gs — structure import from rows pasted out of Excel (tab-separated).
 * One row per position. Columns (fixed order, header row optional):
 *   Company | Sector | Department | Section | Sub_Unit | Job_Code | Job_Title | Location |
 *   Reports_To_Job_Title | Is_Head_Of_Unit | Grade | Structural_HC | [Position_Title | Unit_Code | Job_Family]
 * Position_Title: name of this position when it differs from the job title (e.g. "فني تجهيز - منتج خاص");
 *   it also separates two positions of the same job in the same unit. Reports_To_Job_Title matches it first.
 * Unit_Code: code of the deepest unit on the row (set when the unit is created). Job_Family: family of a new job.
 * Preview never writes. Commit writes only when there are no errors.
 * Re-importing the same rows is safe: existing units/jobs/locations/positions are matched, not duplicated.
 */

var IMPORT_COLS = ['Company', 'Sector', 'Department', 'Section', 'Sub_Unit', 'Job_Code', 'Job_Title',
  'Location', 'Reports_To_Job_Title', 'Is_Head_Of_Unit', 'Grade', 'Structural_HC',
  'Position_Title', 'Unit_Code', 'Job_Family'];   // last three optional (v0.2.2)

function parseImportText_(text) {
  var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  var rows = [];
  lines.forEach(function (line, i) {
    if (!line.replace(/\t/g, '').trim()) return;
    var cells = line.split('\t').map(function (c) { return str_(c).replace(/^"|"$/g, ''); });
    while (cells.length < IMPORT_COLS.length) cells.push('');
    rows.push({ line: i + 1, cells: cells });
  });
  if (rows.length) {
    var first = norm_(rows[0].cells[0]);
    if (first === 'company' || first === 'الشركة' || first === 'شركة') rows.shift();
  }
  return rows;
}

function yes_(v) { var s = norm_(v); return s === 'y' || s === 'yes' || s === 'نعم' || s === '1' || s === 'true'; }

/** p = { text } */
function importStructure_(ctx, p, commit) {
  var rows = parseImportText_(p.text);
  if (!rows.length) throw userError_('مافيش بيانات. الصق الصفوف من ملف الإكسيل.');
  if (rows.length > 3000) throw userError_('الحد الأقصى 3000 صف في المرة.');

  var ver = activeVersion_();
  var errors = [], warnings = [];
  var err = function (r, m) { errors.push({ line: r.line, msg: m }); };
  var warn = function (r, m) { warnings.push({ line: r.line, msg: m }); };

  /* ---- existing data indexes ---- */
  var unitIdx = {};                       // parentId|TYPE|normName -> unit
  var unitsById = {};
  where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Org_Version_ID === ver; }).forEach(function (u) {
    unitIdx[(u.Parent_Org_Unit_ID || '') + '|' + u.Unit_Type + '|' + norm_(u.Name_AR)] = u;
    unitsById[u.Org_Unit_ID] = u;
  });
  var locIdx = {};
  all_('LOCATIONS').forEach(function (l) { locIdx[norm_(l.Name_AR)] = l; if (l.Name_EN) locIdx[norm_(l.Name_EN)] = l; });
  var jobsByCode = {}, jobsByTitle = {};
  all_('JOBS').forEach(function (j) { jobsByCode[j.Job_Code] = j; jobsByTitle[norm_(j.Job_Title_AR)] = j; });
  var grades = {}; all_('GRADES').forEach(function (g) { grades[g.Grade_Code] = 1; });
  var posIdx = {};                       // unit|job|loc -> position
  var existingPositions = where_('POSITIONS', function (x) { return x.Org_Version_ID === ver && x.Status !== 'Closed'; });
  existingPositions.forEach(function (x) {
    posIdx[x.Org_Unit_ID + '|' + x.Job_Code + '|' + (x.Location_ID || '') + (x.Position_Title ? '|' + norm_(x.Position_Title) : '')] = x;
  });

  /* ---- plan ---- */
  var seq = { U: 0, L: 0, J: 0, P: 0 };
  var tmp = function (k) { seq[k]++; return 'NEW-' + k + seq[k]; };
  var newUnits = [], newLocs = [], newJobs = [], newPositions = [];
  var headSet = {};                      // unitId -> positionId set in this import
  var planned = [];                      // row -> { unitId, positionId, jobTitleNorm, reportsTo, isHead, row }

  rows.forEach(function (r) {
    var c = {};
    IMPORT_COLS.forEach(function (name, i) { c[name] = str_(r.cells[i]); });

    // 1. path
    var path = [c.Company, c.Sector, c.Department, c.Section, c.Sub_Unit];
    if (!c.Company) return err(r, 'اسم الشركة فاضي.');
    if (!c.Job_Title && !c.Job_Code) return err(r, 'اسم الوظيفة فاضي.');
    var lastFilled = -1;
    for (var i = 0; i < path.length; i++) if (path[i]) lastFilled = i;
    for (var g = 0; g < lastFilled; g++) {
      if (!path[g]) return err(r, 'في مستوى فاضي في النص (' + UNIT_TYPES[g] + ') ومستوى أقل منه مليان.');
    }

    // 2. units
    var parentId = '';
    var unitId = '';
    for (var lv = 0; lv <= lastFilled; lv++) {
      var key = parentId + '|' + UNIT_TYPES[lv] + '|' + norm_(path[lv]);
      var u = unitIdx[key];
      if (!u) {
        u = { Org_Unit_ID: tmp('U'), Org_Version_ID: ver, Unit_Type: UNIT_TYPES[lv], Unit_Code: '',
          Name_AR: path[lv], Name_EN: '', Parent_Org_Unit_ID: parentId, Head_Position_ID: '', Status: 'Active',
          Effective_From: today_(), Effective_To: '' };
        unitIdx[key] = u; unitsById[u.Org_Unit_ID] = u;
        newUnits.push(u);
      }
      parentId = u.Org_Unit_ID;
      unitId = u.Org_Unit_ID;
    }
    if (c.Unit_Code && unitId) {
      var cu = unitsById[unitId];
      if (!cu.Unit_Code) cu.Unit_Code = c.Unit_Code;
      else if (cu.Unit_Code !== c.Unit_Code) warn(r, 'الوحدة "' + cu.Name_AR + '" كودها ' + cu.Unit_Code + '؛ الكود ' + c.Unit_Code + ' اتجاهل.');
    }
    var companyId = unitIdx['|COMPANY|' + norm_(c.Company)].Org_Unit_ID;

    // 3. location
    var locId = '';
    if (c.Location) {
      var l = locIdx[norm_(c.Location)];
      if (!l) {
        l = { Location_ID: tmp('L'), Name_AR: c.Location, Name_EN: '', Location_Type: '',
          Company_Org_Unit_ID: companyId, Governorate: '', Status: 'Active' };
        locIdx[norm_(c.Location)] = l;
        newLocs.push(l);
      }
      locId = l.Location_ID;
    } else {
      warn(r, 'الموقع فاضي؛ الوظيفة هتتسجل من غير موقع.');
    }

    // 4. job
    var job = null;
    if (c.Job_Code) {
      job = jobsByCode[c.Job_Code];
      if (job && c.Job_Title && norm_(job.Job_Title_AR) !== norm_(c.Job_Title)) {
        warn(r, 'كود ' + c.Job_Code + ' مسجل باسم "' + job.Job_Title_AR + '"؛ هيتستخدم الاسم المسجل.');
      }
    } else {
      job = jobsByTitle[norm_(c.Job_Title)];
    }
    var gradeOk = !c.Grade || grades[c.Grade];
    if (c.Grade && !gradeOk) warn(r, 'الدرجة "' + c.Grade + '" مش موجودة في جدول الدرجات؛ اتجاهلت.');
    if (!job) {
      job = { Job_Code: c.Job_Code || tmp('J'), Job_Title_AR: c.Job_Title, Job_Title_EN: '', Job_Family: c.Job_Family,
        Job_Level: '', Grade_Code: '', Current_JD_Version: '', Status: 'Active', Effective_From: today_(), Effective_To: '',
        __new: true };
      jobsByCode[job.Job_Code] = job; jobsByTitle[norm_(job.Job_Title_AR)] = job;
      newJobs.push(job);
    }
    if (c.Grade && gradeOk && c.Grade !== job.Grade_Code) {
      if (job.__new && !job.Grade_Code) job.Grade_Code = c.Grade;          // new job in this file: take the grade
      else warn(r, 'الدرجة في الملف (' + c.Grade + ') مختلفة عن المسجلة (' + (job.Grade_Code || 'فاضية') + ')؛ ماتغيرتش. تعديل الدرجة من شاشة الوظائف.');
    }

    // 5. position
    var hc = c.Structural_HC === '' ? String(cfg_('DEFAULT_STRUCTURAL_HC', 1)) : c.Structural_HC;
    if (!/^\d+$/.test(hc)) return err(r, 'العدد المعتمد لازم يكون رقم صحيح.');
    var ptitle = c.Position_Title && norm_(c.Position_Title) !== norm_(job.Job_Title_AR) ? c.Position_Title : '';
    var pkey = unitId + '|' + job.Job_Code + '|' + locId + (ptitle ? '|' + norm_(ptitle) : '');
    var pos = posIdx[pkey];
    var isNew = false;
    if (pos) {
      if (pos.__import) { warn(r, 'صف مكرر لنفس الوظيفة في نفس القسم والموقع؛ اتجاهل.'); return; }
      warn(r, 'الوظيفة موجودة قبل كده (' + pos.Position_ID + ')؛ ماتضافتش تاني.');
    } else {
      pos = { Position_ID: tmp('P'), Org_Version_ID: ver, Job_Code: job.Job_Code,
        Position_Title: ptitle,
        Org_Unit_ID: unitId, Reports_To_Position_ID: '', Location_ID: locId,
        Is_Head_Of_Unit: yes_(c.Is_Head_Of_Unit) ? 'Y' : 'N', Structural_HC: hc, HC_Basis: 'BASELINE_TEMP',
        Occupied_HC: '0', Occupied_Updated_At: '', Occupied_Updated_By: '', Status: 'Active',
        Effective_From: today_(), Effective_To: '', __import: true };
      posIdx[pkey] = pos;
      newPositions.push(pos);
      isNew = true;
    }

    // 6. head of unit
    if (yes_(c.Is_Head_Of_Unit)) {
      var unitObj = unitsById[unitId];
      if (headSet[unitId] && headSet[unitId] !== pos.Position_ID) {
        return err(r, 'الوحدة "' + unitObj.Name_AR + '" ليها أكتر من مدير في الملف.');
      }
      if (unitObj.Head_Position_ID === pos.Position_ID) {
        /* already the head — nothing to change */
      } else if (unitObj.Head_Position_ID && !headSet[unitId]) {
        warn(r, 'الوحدة "' + unitObj.Name_AR + '" ليها مدير مسجل قبل كده؛ ماتغيرش.');
      } else {
        headSet[unitId] = pos.Position_ID;
      }
    }

    planned.push({ r: r, pos: pos, isNew: isNew, unitId: unitId, reportsToTitle: c.Reports_To_Job_Title });
  });

  /* ---- heads & reports-to (second pass) ---- */
  var headOf = function (unitId) { return headSet[unitId] || (unitsById[unitId] ? unitsById[unitId].Head_Position_ID : ''); };
  var positionsByUnit = {};
  existingPositions.concat(newPositions).forEach(function (x) {
    (positionsByUnit[x.Org_Unit_ID] = positionsByUnit[x.Org_Unit_ID] || []).push(x);
  });
  var titleOf = function (x) { var j = jobsByCode[x.Job_Code]; return norm_(x.Position_Title || (j ? j.Job_Title_AR : '')); };

  planned.forEach(function (pl) {
    if (!pl.isNew) return;
    var pos = pl.pos, rt = '';
    if (pl.reportsToTitle) {
      var want = norm_(pl.reportsToTitle);
      var u = pl.unitId;
      while (u && !rt) {
        var cands = (positionsByUnit[u] || []).filter(function (x) { return x !== pos && titleOf(x) === want; });
        if (cands.length > 1) warn(pl.r, 'في أكتر من وظيفة باسم "' + pl.reportsToTitle + '"؛ اتربطت بأول واحدة.');
        if (cands.length) rt = cands[0].Position_ID;
        u = unitsById[u] ? unitsById[u].Parent_Org_Unit_ID : '';
      }
      if (!rt) warn(pl.r, 'ملقتش "' + pl.reportsToTitle + '" في نفس الإدارة أو فوقها؛ هيتربط بمدير الوحدة.');
    }
    if (!rt) {
      if (pos.Is_Head_Of_Unit === 'Y') {
        var parent = unitsById[pl.unitId] ? unitsById[pl.unitId].Parent_Org_Unit_ID : '';
        while (parent && !headOf(parent)) parent = unitsById[parent] ? unitsById[parent].Parent_Org_Unit_ID : '';
        rt = parent ? headOf(parent) : '';
      } else {
        var h = headOf(pl.unitId);
        var up = pl.unitId;
        while (up && (!h || h === pos.Position_ID)) {
          up = unitsById[up] ? unitsById[up].Parent_Org_Unit_ID : '';
          h = up ? headOf(up) : '';
        }
        rt = h || '';
      }
    }
    pos.Reports_To_Position_ID = rt;
  });

  var unitsWithoutHead = newUnits.filter(function (u) { return !headOf(u.Org_Unit_ID); }).map(function (u) { return u.Name_AR; });
  if (unitsWithoutHead.length) {
    warnings.push({ line: 0, msg: unitsWithoutHead.length + ' وحدة من غير مدير محدد (Is_Head_Of_Unit): ' +
      unitsWithoutHead.slice(0, 10).join('، ') + (unitsWithoutHead.length > 10 ? '…' : '') });
  }

  var summary = {
    rows: rows.length,
    unitsNew: newUnits.length, locationsNew: newLocs.length, jobsNew: newJobs.length, positionsNew: newPositions.length,
    errors: errors, warnings: warnings.slice(0, 300), warningsTotal: warnings.length,
    sample: newPositions.slice(0, 30).map(function (x) {
      var j = jobsByCode[x.Job_Code];
      return { unit: unitsById[x.Org_Unit_ID].Name_AR, job: j ? j.Job_Title_AR : x.Job_Code,
        head: x.Is_Head_Of_Unit, hc: x.Structural_HC };
    }),
    committed: false
  };
  if (!commit) return summary;
  if (errors.length) throw userError_('في ' + errors.length + ' خطأ لازم يتصلحوا قبل الحفظ.');
  if (!newUnits.length && !newLocs.length && !newJobs.length && !newPositions.length && !Object.keys(headSet).length) {
    throw userError_('مافيش حاجة جديدة تتحفظ.');
  }

  /* ---- commit: allocate real IDs, remap, write in batches ---- */
  withLock_(function () {
    var map = {};
    var alloc = function (list, keyField, entity) {
      var needs = list.filter(function (o) { return str_(o[keyField]).indexOf('NEW-') === 0; });
      if (!needs.length) return;
      var ids = nextIds_(entity, needs.length);
      needs.forEach(function (o, i) { map[o[keyField]] = ids[i]; o[keyField] = ids[i]; });
    };
    alloc(newUnits, 'Org_Unit_ID', 'ORG_UNIT');
    alloc(newLocs, 'Location_ID', 'LOCATION');
    alloc(newJobs, 'Job_Code', 'JOB');
    alloc(newPositions, 'Position_ID', 'POSITION');
    var m = function (v) { return map[v] || v; };
    newUnits.forEach(function (u) { u.Parent_Org_Unit_ID = m(u.Parent_Org_Unit_ID); });
    newLocs.forEach(function (l) { l.Company_Org_Unit_ID = m(l.Company_Org_Unit_ID); });
    newPositions.forEach(function (x) {
      x.Org_Unit_ID = m(x.Org_Unit_ID); x.Job_Code = m(x.Job_Code); x.Location_ID = m(x.Location_ID);
      x.Reports_To_Position_ID = m(x.Reports_To_Position_ID); delete x.__import;
    });
    Object.keys(headSet).forEach(function (uid) {
      var realUnit = m(uid), realPos = m(headSet[uid]);
      var nu = newUnits.filter(function (u) { return u.Org_Unit_ID === realUnit; })[0];
      if (nu) nu.Head_Position_ID = realPos;
    });

    var actor = ctx.user.User_ID;
    insertMany_('ORG_UNITS', newUnits, actor);
    insertMany_('LOCATIONS', newLocs, actor);
    insertMany_('JOBS', newJobs, actor);
    insertMany_('POSITIONS', newPositions, actor);
    // Heads for units that already existed.
    Object.keys(headSet).forEach(function (uid) {
      var realUnit = m(uid);
      var isNewUnit = newUnits.some(function (u) { return u.Org_Unit_ID === realUnit; });
      if (!isNewUnit) {
        var res = update_('ORG_UNITS', realUnit, { Head_Position_ID: m(headSet[uid]) }, actor);
        auditDiff_(ctx, 'ORG_UNIT', realUnit, res.before, res.after, 'Structure import');
      }
    });
    audit_(ctx, { entityType: 'ORG_VERSION', entityId: ver, action: 'STRUCTURE_IMPORT',
      newValue: JSON.stringify({ units: newUnits.length, locations: newLocs.length, jobs: newJobs.length,
        positions: newPositions.length, rows: rows.length }), reason: str_(p.reason) || 'Structure import' });
  });
  summary.committed = true;
  return summary;
}
