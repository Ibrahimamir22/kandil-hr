/**
 * Pay.gs — v0.13.1: Kandil's package rules for offers. The portal calculates an offer package; it never pays anyone.
 *
 *   • Allowances come from the grade table (ALLOWANCE_GRADES, versioned): transport, meal, phone, cost of living
 *     (+ representation when set), and the job-nature allowance per unit / department (JOB_NATURE_RATES) for eligible jobs.
 *   • Transport: Inshas zone = the first column; everywhere else = first + second column; plus any temporary
 *     transport decided for a location (TEMP_TRANSPORT, with dates).
 *   • Gross contract: basic = agreed total − all allowances.
 *     Net contract: basic = agreed net − all allowances; the portal finds the gross that leaves exactly that net,
 *     and the difference is the «Net allowance».
 *   • Contribution wage (أجر الاشتراك, social insurance) = full wage × ratio, capped, rounded, with a floor.
 *     Comprehensive wage (الأجر الشامل, the tax base) = the contribution wage, topped up to the minimum wage.
 *     Employee insurance = rate × contribution wage. Tax on (comprehensive − employee insurance) per year after the
 *     personal exemption. Net = full − insurance − tax. The martyrs fund is borne by the company.
 *   • Every figure lives in CONFIG / the tables, edited by the HR Sector Manager — nothing is hard-coded.
 */

var AUTO_ITEMS_ = ['TRANSPORT', 'MEAL', 'PHONE', 'COST_OF_LIVING', 'JOB_NATURE', 'NET_ALLOWANCE', 'BASIC'];
var COLLARS_ = { W: 'إداري (White)', B: 'فني / حرفي (Blue)', G: 'Gray' };

function payRules_() {
  var br = cfg_('PAY_TAX_BRACKETS', [[40000, 0], [55000, 10], [70000, 15], [200000, 20], [400000, 22.5], [1200000, 25], [0, 27.5]]);
  if (typeof br === 'string') { try { br = JSON.parse(br); } catch (e) { br = []; } }
  return { ratio: num_(cfg_('PAY_CONTRIB_RATIO', 60), 60), min: num_(cfg_('PAY_CONTRIB_MIN', 5500), 5500), max: num_(cfg_('PAY_CONTRIB_MAX', 16700), 16700),
    round: num_(cfg_('PAY_CONTRIB_ROUND', 500), 500), compMin: num_(cfg_('PAY_COMPREHENSIVE_MIN', 7000), 7000), insRate: num_(cfg_('PAY_EMP_INS_RATE', 11), 11),
    exemption: num_(cfg_('PAY_TAX_EXEMPTION', 20000), 20000), brackets: br, martyr: num_(cfg_('PAY_MARTYR_RATE', 0.05), 0.05) };
}

function r2_(x) { return Math.round(x * 100) / 100; }

/** Annual tax on an annual taxable amount (after the exemption), progressive brackets [limit, rate%] — limit 0 = no limit. */
function annualTax_(taxable, brackets) {
  var tax = 0, lower = 0;
  for (var i = 0; i < brackets.length && taxable > lower; i++) {
    var lim = num_(brackets[i][0], 0) || Infinity, rate = num_(brackets[i][1], 0) / 100;
    tax += (Math.min(taxable, lim) - lower) * rate;
    lower = lim;
  }
  return tax;
}

/** Deductions and net of a full monthly wage. */
function payOf_(full, R, noIns) {
  R = R || payRules_();
  var c = full * R.ratio / 100;
  c = Math.min(c, R.max);
  if (R.round > 0) c = Math.round(c / R.round) * R.round;
  c = Math.max(c, R.min);
  var comp = Math.max(c, R.compMin);
  var ins = noIns ? 0 : r2_(c * R.insRate / 100);
  if (noIns) c = 0;                                         // contract without social insurance (CEO / board decision)
  var taxable = Math.max(0, (comp - ins) * 12 - R.exemption);
  var tax = r2_(annualTax_(taxable, R.brackets) / 12);
  return { full: r2_(full), contrib: c, comprehensive: comp, insurance: ins, tax: tax, net: r2_(full - ins - tax), martyr: r2_(full * R.martyr / 100) };
}

/** Smallest whole-pound gross whose net reaches the agreed net. */
function grossForNet_(net, R, noIns) {
  R = R || payRules_();
  var g = Math.ceil(net), i = 0;
  while (i++ < 200) {
    var d = net - payOf_(g, R, noIns).net;
    if (d <= 0.004) break;
    g += Math.max(1, Math.ceil(d));
  }
  // step back while a smaller gross still reaches the net (insurance rounding steps)
  while (g > net && payOf_(g - 1, R, noIns).net >= net - 0.004) g--;
  return g;
}

/* ---------------- tables ---------------- */

function allowanceRow_(grade) {
  if (!str_(grade)) return null;
  return find_('ALLOWANCE_GRADES', { Grade_Code: str_(grade), Status: 'Active' }).filter(function (r) { return !r.Effective_From || r.Effective_From <= today_(); })
    .sort(function (a, b) { return num_(b.Version, 0) - num_(a.Version, 0); })[0] || null;
}
function locZone_(loc) {
  if (!loc) return 'OTHER';
  if (str_(loc.Transport_Zone)) return loc.Transport_Zone;
  return /[إا]نشاص/.test(loc.Name_AR) || /inshas/i.test(loc.Name_EN) ? 'INSHAS' : 'OTHER';
}
function tempTransport_(locId, day) {
  day = day || today_();
  return find_('TEMP_TRANSPORT', { Location_ID: str_(locId), Status: 'Active' }).filter(function (t) { return (!t.From_Date || t.From_Date <= day) && (!t.To_Date || t.To_Date >= day); });
}

/** Pay profile of a vacancy: job, grade, collar, location zone, allowance row, job-nature eligibility. */
function payProfile_(v) {
  var job = findOne_('JOBS', { Job_Code: v.Job_Code }) || {}, grade = str_(job.Grade_Code), row = allowanceRow_(grade);
  var loc = findOne_('LOCATIONS', { Location_ID: v.Location_ID }) || null;
  var jn = str_(job.Job_Nature) || (row ? row.Job_Nature_Eligible : 'N');
  return { job: job, grade: grade, row: row, collar: str_(job.Collar) || (row ? row.Collar : ''), loc: loc, zone: locZone_(loc), jobNature: jn === 'Y',
    temp: loc ? tempTransport_(loc.Location_ID) : [] };
}

/** Job-nature rate suggested for a vacancy's unit (department name inside the unit path). */
function suggestRate_(v, rates) {
  var names = [], u = findOne_('ORG_UNITS', { Org_Unit_ID: v.Org_Unit_ID }), guard = 0;
  while (u && guard++ < 8) { names.push(norm_(u.Name_AR)); u = u.Parent_Org_Unit_ID ? findOne_('ORG_UNITS', { Org_Unit_ID: u.Parent_Org_Unit_ID }) : null; }
  var strip = function (s) { return norm_(s).replace(/^ال/, '').replace(/[ةه]$/, ''); };
  var best = null;
  rates.forEach(function (r) {
    var d = strip(r.Department); if (!d) return;
    var hit = names.some(function (n) { return n.split(' ').map(strip).indexOf(d) >= 0 || strip(n) === d; });
    if (hit && (!best || num_(r.Amount, 0) > num_(best.Amount, 0))) best = r;
  });
  return best ? best.Rate_ID : '';
}

/**
 * Compute an offer package.
 * p = { Contract_Basis: GROSS|NET, Agreed_Amount, Other_Allowance, Representation, Job_Nature_Rate_ID, Job_Nature_Amount, extra: {CODE: amount} }
 * → { comps: [{c,a}], full, basic, allowances, netAllowance, pay: payOf_, profile }
 */
function packageOf_(v, p) {
  var P = payProfile_(v), R = payRules_(), row = P.row;
  var basis = str_(p.Contract_Basis) === 'NET' ? 'NET' : 'GROSS', noIns = str_(p.No_Insurance) === 'Y';
  var amount = Number(money_(p.Agreed_Amount, basis === 'NET' ? 'الصافي المتفق عليه' : 'الإجمالي المتفق عليه', true));
  var items = {};
  if (row) {
    var tr = num_(row.Transport_Inshas, 0) + (P.zone === 'INSHAS' ? 0 : num_(row.Transport_Other_Add, 0));
    P.temp.forEach(function (t) { tr += num_(t.Amount, 0); });
    items.TRANSPORT = tr; items.MEAL = num_(row.Meal, 0); items.PHONE = num_(row.Phone, 0); items.COST_OF_LIVING = num_(row.Cost_Of_Living, 0);
    if (num_(row.Representation, 0)) items.REPRESENTATION = num_(row.Representation, 0);
  }
  var rep = str_(p.Representation);
  if (rep !== '') items.REPRESENTATION = Number(money_(rep, 'بدل التمثيل', false) || 0);
  var jnAmt = 0, rate = null;
  if (str_(p.Job_Nature_Rate_ID)) {
    rate = findOne_('JOB_NATURE_RATES', { Rate_ID: str_(p.Job_Nature_Rate_ID) });
    if (!rate || rate.Status !== 'Active') throw userError_('قسم بدل طبيعة العمل غير موجود.');
    jnAmt = num_(rate.Amount, 0);
  }
  if (str_(p.Job_Nature_Amount) !== '') jnAmt = Number(money_(p.Job_Nature_Amount, 'بدل طبيعة العمل', false) || 0);
  if (jnAmt) items.JOB_NATURE = jnAmt;
  var other = Number(money_(p.Other_Allowance, 'البدلات الأخرى', false) || 0);
  if (other) items.OTHER_ALLOW = other;
  var active = {}; payComponents_().forEach(function (c) { active[c.Component_Code] = c; });
  Object.keys(p.extra || {}).forEach(function (k) {
    var c = active[k]; if (!c || c.Kind !== 'FIXED' || AUTO_ITEMS_.indexOf(k) >= 0 || items[k] !== undefined) return;
    var a = Number(money_(p.extra[k], c.Name_AR, false) || 0); if (a) items[k] = a;
  });
  var sumA = Object.keys(items).reduce(function (s, k) { return s + items[k]; }, 0);
  var basic = r2_(amount - sumA);
  if (basic <= 0) throw userError_('المبلغ المتفق عليه (' + money0_(amount) + ') أقل من مجموع البدلات (' + money0_(sumA) + ') — الأساسي هيطلع بالسالب.');
  var full, netAllow = 0;
  if (basis === 'GROSS') full = amount;
  else { full = grossForNet_(amount, R, noIns); netAllow = r2_(full - amount); }
  var comps = [{ c: 'BASIC', a: String(basic) }];
  ['TRANSPORT', 'MEAL', 'PHONE', 'COST_OF_LIVING', 'REPRESENTATION', 'JOB_NATURE', 'OTHER_ALLOW'].concat(Object.keys(items).filter(function (k) {
    return ['TRANSPORT', 'MEAL', 'PHONE', 'COST_OF_LIVING', 'REPRESENTATION', 'JOB_NATURE', 'OTHER_ALLOW'].indexOf(k) < 0; }))
    .forEach(function (k) { if (items[k]) comps.push({ c: k, a: String(r2_(items[k])), n: k === 'JOB_NATURE' && rate ? rate.Group_Name + ' — ' + rate.Department : '' }); });
  if (netAllow > 0) comps.push({ c: 'NET_ALLOWANCE', a: String(netAllow) });
  return { basis: basis, noIns: noIns, amount: amount, comps: comps, full: full, basic: basic, allowances: r2_(sumA), netAllowance: netAllow, pay: payOf_(full, R, noIns),
    rateId: rate ? rate.Rate_ID : '', profile: P, noTable: !row };
}

/* ---------------- admin: allowance table, job nature, temporary transport, zones, rules, job classes ---------------- */

/** p = { rows: [{ grade, collar, inshas, otherAdd, meal, phone, rep, col, jn }], from, reason } — a new version for each grade that changed. */
function allowancesSave_(ctx, p) {
  var reason = requireReason_(p), from = str_(p.from) || today_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw userError_('تاريخ السريان غلط.');
  var n = 0;
  withLock_(function () {
    (Array.isArray(p.rows) ? p.rows : []).forEach(function (r) {
      var g = str_(r.grade);
      if (!get_('GRADES', g)) throw userError_('درجة غير موجودة: ' + g);
      var f = { Collar: ['W', 'B', 'G'].indexOf(str_(r.collar)) >= 0 ? str_(r.collar) : '', Transport_Inshas: money_(r.inshas, 'انتقالات إنشاص — درجة ' + g, false) || '0',
        Transport_Other_Add: money_(r.otherAdd, 'إضافة باقي المواقع — درجة ' + g, false) || '0', Meal: money_(r.meal, 'الغذاء — درجة ' + g, false) || '0',
        Phone: money_(r.phone, 'التليفون — درجة ' + g, false) || '0', Representation: money_(r.rep, 'التمثيل — درجة ' + g, false),
        Cost_Of_Living: money_(r.col, 'غلاء المعيشة — درجة ' + g, false) || '0', Job_Nature_Eligible: str_(r.jn) === 'Y' ? 'Y' : 'N' };
      var cur = find_('ALLOWANCE_GRADES', { Grade_Code: g, Status: 'Active' });
      var same = cur.length === 1 && Object.keys(f).every(function (k) { return str_(cur[0][k]) === str_(f[k]); }) && cur[0].Effective_From === from;
      if (same) return;
      var ver = find_('ALLOWANCE_GRADES', { Grade_Code: g }).reduce(function (m, x) { return Math.max(m, num_(x.Version, 0)); }, 0) + 1;
      cur.forEach(function (x) { update_('ALLOWANCE_GRADES', x.Row_ID, { Status: 'Superseded' }, ctx.user.User_ID); });
      f.Row_ID = nextId_('ALLOW_GRADE'); f.Grade_Code = g; f.Version = String(ver); f.Effective_From = from; f.Status = 'Active'; f.Notes = reason;
      insert_('ALLOWANCE_GRADES', f, ctx.user.User_ID);
      n++;
    });
  });
  if (n) audit_(ctx, { entityType: 'ALLOWANCE_GRADES', entityId: 'TABLE', action: 'NEW_VERSION', newValue: n + ' grade(s) from ' + from, reason: reason });
  return { changed: n };
}

/** p = { Rate_ID?, Unit_Group, Group_Name, Department, Amount, Year, Status } */
function rateSave_(ctx, p) {
  var f = { Unit_Group: str_(p.Unit_Group).slice(0, 30), Group_Name: str_(p.Group_Name).slice(0, 60), Department: str_(p.Department).slice(0, 60),
    Amount: money_(p.Amount, 'القيمة', true), Year: str_(p.Year) || today_().slice(0, 4), Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active' };
  if (f.Group_Name.length < 2 || f.Department.length < 2) throw userError_('اكتب الوحدة والقسم.');
  var res;
  withLock_(function () {
    if (str_(p.Rate_ID)) { if (!get_('JOB_NATURE_RATES', p.Rate_ID)) throw userError_('غير موجود.'); res = update_('JOB_NATURE_RATES', p.Rate_ID, f, ctx.user.User_ID).after; }
    else { f.Rate_ID = nextId_('JOB_NATURE'); res = insert_('JOB_NATURE_RATES', f, ctx.user.User_ID); }
  });
  audit_(ctx, { entityType: 'JOB_NATURE_RATE', entityId: res.Rate_ID, action: 'SAVE', newValue: f.Group_Name + ' / ' + f.Department + ' = ' + f.Amount });
  return res;
}

/** p = { Temp_ID?, Location_ID, Amount, From_Date, To_Date, Reason, Status } */
function tempTransportSave_(ctx, p) {
  if (!get_('LOCATIONS', str_(p.Location_ID))) throw userError_('اختار الموقع.');
  var f = { Location_ID: str_(p.Location_ID), Amount: money_(p.Amount, 'المبلغ', true), From_Date: str_(p.From_Date), To_Date: str_(p.To_Date),
    Reason: str_(p.Reason).slice(0, 300), Status: str_(p.Status) === 'Inactive' ? 'Inactive' : 'Active' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.From_Date)) throw userError_('اختار تاريخ البداية.');
  if (f.To_Date && (!/^\d{4}-\d{2}-\d{2}$/.test(f.To_Date) || f.To_Date < f.From_Date)) throw userError_('تاريخ النهاية لازم بعد البداية.');
  if (f.Reason.length < 5) throw userError_('اكتب القرار / السبب.');
  var res;
  withLock_(function () {
    if (str_(p.Temp_ID)) res = update_('TEMP_TRANSPORT', p.Temp_ID, f, ctx.user.User_ID).after;
    else { f.Temp_ID = nextId_('TEMP_TRANSPORT'); res = insert_('TEMP_TRANSPORT', f, ctx.user.User_ID); }
  });
  audit_(ctx, { entityType: 'TEMP_TRANSPORT', entityId: res.Temp_ID, action: 'SAVE', newValue: f.Location_ID + ' +' + f.Amount + ' ' + f.From_Date + '→' + f.To_Date, reason: f.Reason });
  return res;
}

/** p = { zones: { Location_ID: INSHAS|OTHER } } */
function zonesSave_(ctx, p) {
  var z = p.zones || {}, n = 0;
  withLock_(function () {
    Object.keys(z).forEach(function (id) {
      var l = get_('LOCATIONS', id), v = str_(z[id]) === 'INSHAS' ? 'INSHAS' : 'OTHER';
      if (l && l.Transport_Zone !== v) { update_('LOCATIONS', id, { Transport_Zone: v }, ctx.user.User_ID); n++; }
    });
  });
  if (n) audit_(ctx, { entityType: 'LOCATION', entityId: 'ZONES', action: 'TRANSPORT_ZONE', newValue: n + ' location(s)' });
  return { changed: n };
}

var PAY_RULE_KEYS_ = ['PAY_CONTRIB_RATIO', 'PAY_CONTRIB_MIN', 'PAY_CONTRIB_MAX', 'PAY_CONTRIB_ROUND', 'PAY_COMPREHENSIVE_MIN', 'PAY_EMP_INS_RATE', 'PAY_TAX_EXEMPTION', 'PAY_TAX_BRACKETS', 'PAY_MARTYR_RATE'];

/** p = { values: { KEY: value }, reason } */
function payRulesSave_(ctx, p) {
  var reason = requireReason_(p), vals = p.values || {}, n = 0;
  Object.keys(vals).forEach(function (k) {
    if (PAY_RULE_KEYS_.indexOf(k) < 0) throw userError_('إعداد غير معروف.');
    if (k === 'PAY_TAX_BRACKETS') {
      var b; try { b = JSON.parse(str_(vals[k])); } catch (e) { throw userError_('الشرائح لازم تكون بالشكل [[حد، نسبة]، …].'); }
      if (!Array.isArray(b) || !b.length || b.some(function (x) { return !Array.isArray(x) || x.length !== 2 || isNaN(Number(x[0])) || isNaN(Number(x[1])); })) throw userError_('الشرائح لازم تكون بالشكل [[حد، نسبة]، …].');
    } else if (!/^\d+(\.\d+)?$/.test(latinDigits_(vals[k]).trim())) throw userError_('القيمة لازم تكون رقم.');
  });
  Object.keys(vals).forEach(function (k) {
    var v = k === 'PAY_TAX_BRACKETS' ? str_(vals[k]) : latinDigits_(vals[k]).trim();
    var cur = get_('CONFIG', k);
    if (cur && str_(cur.Config_Value) === v) return;
    configUpdate_(ctx, { Config_Key: k, Config_Value: v, reason: reason });
    n++;
  });
  return { changed: n };
}

/** p = { jobs: [{ Job_Code, Collar, Job_Nature }] } */
function jobPaySave_(ctx, p) {
  var n = 0;
  withLock_(function () {
    (Array.isArray(p.jobs) ? p.jobs : []).forEach(function (j) {
      var cur = get_('JOBS', str_(j.Job_Code)); if (!cur) return;
      var f = { Collar: ['W', 'B', 'G'].indexOf(str_(j.Collar)) >= 0 ? str_(j.Collar) : '', Job_Nature: ['Y', 'N'].indexOf(str_(j.Job_Nature)) >= 0 ? str_(j.Job_Nature) : '' };
      if (str_(cur.Collar) === f.Collar && str_(cur.Job_Nature) === f.Job_Nature) return;
      update_('JOBS', cur.Job_Code, f, ctx.user.User_ID); n++;
    });
  });
  if (n) audit_(ctx, { entityType: 'JOB', entityId: 'PAY_CLASS', action: 'UPDATE', newValue: n + ' job(s)' });
  return { changed: n };
}

/** Admin data for the pay screen tabs. */
function payAdminExtra_() {
  var rules = {}; PAY_RULE_KEYS_.forEach(function (k) { var c = get_('CONFIG', k); rules[k] = c ? c.Config_Value : ''; });
  var locs = {}; all_('LOCATIONS').forEach(function (l) { locs[l.Location_ID] = l; });
  return {
    allowances: all_('GRADES').filter(function (g) { return g.Status === 'Active'; }).sort(function (a, b) { return num_(b.Level_Order, 0) - num_(a.Level_Order, 0); })
      .map(function (g) { var r = allowanceRow_(g.Grade_Code) || {}; return { grade: g.Grade_Code, row: r.Row_ID ? r : null }; }),
    rates: find_('JOB_NATURE_RATES', {}).sort(function (a, b) { return (a.Group_Name + a.Department) < (b.Group_Name + b.Department) ? -1 : 1; }),
    temps: find_('TEMP_TRANSPORT', {}).map(function (t) { t.locationName = (locs[t.Location_ID] || {}).Name_AR || t.Location_ID; return t; }),
    locations: all_('LOCATIONS').filter(function (l) { return l.Status !== 'Inactive'; }).map(function (l) { return { id: l.Location_ID, name: l.Name_AR, zone: locZone_(l) }; }),
    rules: rules,
    jobs: all_('JOBS').filter(function (j) { return j.Status !== 'Inactive'; }).sort(function (a, b) { return a.Job_Code < b.Job_Code ? -1 : 1; })
      .map(function (j) { var r = allowanceRow_(j.Grade_Code); return { code: j.Job_Code, title: j.Job_Title_AR, grade: j.Grade_Code, collar: j.Collar, jobNature: j.Job_Nature,
        defCollar: r ? r.Collar : '', defJn: r ? r.Job_Nature_Eligible : '' }; })
  };
}

/** p = { full } — what a full wage costs and leaves (calculator on the pay screen). */
function payPreview_(ctx, p) {
  var f = Number(money_(p.full, 'الأجر', true));
  return payOf_(f);
}
