/**
 * OrgChart.gs — v0.16.0: the structure drawn as an org chart, by unit or by position.
 * Each position: approved headcount (Structural_HC) against actual (Occupied_HC) → status
 *   OVER (more than approved) · SHORT (fewer) · FULL · EMPTY (nobody, approved > 0) · NONE (0 approved, 0 actual)
 * plus what is already on the way: remaining headcount of open vacancies and new hires waiting to join.
 * Units roll up their own positions and everything below them. Sector colours come from SECTOR_COLORS
 * (or a fixed palette in sector order) — a separate visual channel from the status colours.
 * Who sees what: HR / recruitment / top management / consultant = the whole company; a line manager = his scope.
 */

var SECTOR_PALETTE_ = ['#1F5FBF', '#6D3FC0', '#0E7C86', '#B8862B', '#8B5E3C', '#3B4CA8', '#B0367A', '#4A6B82', '#5B7F2E', '#7A4A9E'];

function chartAllRoles_() {
  return HR_ALL_ROLES.concat([ROLE.REC_MANAGER, ROLE.REC_SUPERVISOR, ROLE.RECRUITER, ROLE.CEO, ROLE.BOARD, ROLE.CONSULTANT, ROLE.VIEWER]);
}

function hcStatus_(approved, occupied) {
  if (approved <= 0 && occupied <= 0) return 'NONE';
  if (occupied > approved) return 'OVER';
  if (occupied === 0) return 'EMPTY';
  if (occupied < approved) return 'SHORT';
  return 'FULL';
}

/** Colour per sector unit: SECTOR_COLORS {Org_Unit_ID or Unit_Code: '#rrggbb'} first, then the palette by sector order. */
function sectorColors_(sectors) {
  var custom = {};
  try { custom = JSON.parse(str_(cfg_('SECTOR_COLORS', '{}')) || '{}') || {}; } catch (e) { custom = {}; }
  var out = {}, i = 0;
  sectors.slice().sort(function (a, b) { return (a.Unit_Code || a.Name_AR) < (b.Unit_Code || b.Name_AR) ? -1 : 1; }).forEach(function (s) {
    var c = custom[s.Org_Unit_ID] || custom[s.Unit_Code];
    out[s.Org_Unit_ID] = /^#[0-9a-f]{6}$/i.test(str_(c)) ? str_(c) : SECTOR_PALETTE_[i % SECTOR_PALETTE_.length];
    i++;
  });
  return out;
}

function orgChart_(ctx) {
  var ver = activeVersion_();
  var units = where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Org_Version_ID === ver; });
  var byId = {}; units.forEach(function (u) { byId[u.Org_Unit_ID] = u; });

  // who sees what
  var all = hasAnyRole_(ctx, chartAllRoles_());
  var scope = null;
  if (!all) {
    scope = managedScope_(ctx.user);
    if (!scope.length) throw userError_('خريطة الهيكل الكاملة لفريق الموارد البشرية والإدارة العليا. المدير بيشوف الوحدات اللي تحت إدارته.');
  }
  var inScope = {}; (scope || units.map(function (u) { return u.Org_Unit_ID; })).forEach(function (id) { inScope[id] = 1; });

  // sector of every unit (nearest SECTOR ancestor, the unit itself included)
  var sectorOf = {};
  function findSector(id) {
    if (sectorOf[id] !== undefined) return sectorOf[id];
    var seen = {}, cur = byId[id], res = '';
    while (cur && !seen[cur.Org_Unit_ID]) {
      seen[cur.Org_Unit_ID] = 1;
      if (cur.Unit_Type === 'SECTOR') { res = cur.Org_Unit_ID; break; }
      cur = byId[cur.Parent_Org_Unit_ID];
    }
    sectorOf[id] = res;
    return res;
  }
  var colors = sectorColors_(units.filter(function (u) { return u.Unit_Type === 'SECTOR'; }));

  // what is on the way, per position
  var openVac = {}, joining = {}, vacPos = {};
  where_('VACANCIES', function (v) { return VAC_OPEN_.indexOf(v.Status) >= 0; }).forEach(function (v) {
    var left = Math.max(0, num_(v.Required_HC, 0) - num_(v.Joined_HC, 0));
    openVac[v.Position_ID] = (openVac[v.Position_ID] || 0) + left;
  });
  all_('VACANCIES').forEach(function (v) { vacPos[v.Vacancy_ID] = v.Position_ID; });
  where_('JOININGS', function (j) { return j.Status === 'PENDING'; }).forEach(function (j) {
    var pid = vacPos[j.Vacancy_ID]; if (pid) joining[pid] = (joining[pid] || 0) + 1;
  });

  var holders = holdersByPosition_(), jobs = {};
  all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j; });
  var positions = where_('POSITIONS', function (p) { return p.Status !== 'Closed' && p.Org_Version_ID === ver && inScope[p.Org_Unit_ID]; })
    .map(function (p) {
      var a = num_(p.Structural_HC, 0), o = num_(p.Occupied_HC, 0), job = jobs[p.Job_Code] || {};
      return {
        id: p.Position_ID, unit: p.Org_Unit_ID, title: p.Position_Title || job.Job_Title_AR || p.Job_Code, job: p.Job_Code, grade: job.Grade_Code || '',
        head: p.Is_Head_Of_Unit === 'Y', reportsTo: p.Reports_To_Position_ID, approved: a, occupied: o, status: hcStatus_(a, o),
        open: openVac[p.Position_ID] || 0, joining: joining[p.Position_ID] || 0,
        holders: holders[p.Position_ID] || []
      };
    });

  // own totals per unit, then roll up to the top of what this user may see
  var own = {};
  positions.forEach(function (p) {
    var s = own[p.unit] = own[p.unit] || { approved: 0, occupied: 0, positions: 0, over: 0, short: 0, empty: 0, open: 0, joining: 0 };
    s.approved += p.approved; s.occupied += p.occupied; s.positions++; s.open += p.open; s.joining += p.joining;
    if (p.status === 'OVER') s.over++; else if (p.status === 'SHORT') s.short++; else if (p.status === 'EMPTY') s.empty++;
  });
  var kids = {};
  units.forEach(function (u) { if (inScope[u.Org_Unit_ID]) (kids[u.Parent_Org_Unit_ID] = kids[u.Parent_Org_Unit_ID] || []).push(u.Org_Unit_ID); });
  var total = {}, guard = {};
  function roll(id) {
    if (total[id]) return total[id];
    if (guard[id]) return { approved: 0, occupied: 0, positions: 0, over: 0, short: 0, empty: 0, open: 0, joining: 0 };   // broken tree (loop)
    guard[id] = 1;
    var t = {}, o = own[id] || {};
    ['approved', 'occupied', 'positions', 'over', 'short', 'empty', 'open', 'joining'].forEach(function (k) { t[k] = o[k] || 0; });
    (kids[id] || []).forEach(function (c) { var r = roll(c); for (var k in t) t[k] += r[k]; });
    total[id] = t;
    return t;
  }
  var headHolder = function (u) { return u.Head_Position_ID ? (holders[u.Head_Position_ID] || []).join('، ') : ''; };
  var list = units.filter(function (u) { return inScope[u.Org_Unit_ID]; }).map(function (u) {
    var t = roll(u.Org_Unit_ID), sec = findSector(u.Org_Unit_ID);
    var head = u.Head_Position_ID ? get_('POSITIONS', u.Head_Position_ID) : null;
    return {
      id: u.Org_Unit_ID, parent: inScope[u.Parent_Org_Unit_ID] ? u.Parent_Org_Unit_ID : '', type: u.Unit_Type, name: u.Name_AR, code: u.Unit_Code,
      sector: sec, color: sec ? colors[sec] : '', headTitle: head ? (head.Position_Title || (jobs[head.Job_Code] || {}).Job_Title_AR || '') : '', headHolder: headHolder(u),
      own: own[u.Org_Unit_ID] || null, total: t, status: hcStatus_(t.approved, t.occupied)
    };
  });
  var top = list.filter(function (u) { return !u.parent; }).map(function (u) { return u.id; });
  var sum = { approved: 0, occupied: 0, positions: 0, over: 0, short: 0, empty: 0, open: 0, joining: 0 };
  top.forEach(function (id) { var r = total[id]; for (var k in sum) sum[k] += r[k]; });
  return {
    units: list, positions: positions, roots: top, summary: sum, all: all,
    sectors: units.filter(function (u) { return u.Unit_Type === 'SECTOR' && inScope[u.Org_Unit_ID]; })
      .map(function (u) { return { id: u.Org_Unit_ID, name: u.Name_AR, color: colors[u.Org_Unit_ID] }; }),
    asOf: nowIso_()
  };
}
