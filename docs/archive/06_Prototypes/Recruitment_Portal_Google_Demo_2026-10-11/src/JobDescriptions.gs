/**
 * JobDescriptions.gs — job descriptions (one per job code, versioned) built on the competency library.
 *
 * - HR writes and approves (HR staff draft, HR managers approve). Any change = a new version; old ones stay (Superseded).
 * - Lists inside a JD are stored as JSON text: Responsibilities ["…"], KPIs [[name, formula / purpose, freq, type W|M|'', weight]],
 *   Authority [[decision, level]], Competencies_JSON [{c: code, l: level, m: how measured}].
 * - Library: COMPETENCIES (levels + required level per job level JL1..JL7), COMP_QUESTIONS, COMP_TESTS.
 * - Hiring requests on a job without an approved JD only warn; the request keeps the JD version it was raised on.
 */

var JL_CODES_ = ['JL1', 'JL2', 'JL3', 'JL4', 'JL5', 'JL6', 'JL7'];
/** v0.42.1 (CHG-88): responsibilities by job level (JD standard v1.0, 4.2 — indicative); hard limits 3 … 16. */
var JD_RESP_MIN_ = 3, JD_RESP_MAX_ = 16;
var JD_RESP_BANDS_ = { JL1: [5, 8], JL2: [5, 8], JL3: [6, 10], JL4: [8, 12], JL5: [8, 12], JL6: [8, 16], JL7: [8, 16] };
/** The count against the hard limits and the level's band: { n, band, error, over, under }. */
function jdRespCheck_(f) {
  var n = jsonArr_(f.Responsibilities).length, band = JD_RESP_BANDS_[str_(f.Career_Level)] || null;
  var out = { n: n, band: band, error: '', over: !!(band && n > band[1]), under: !!(band && n < band[0]) };
  if (n < JD_RESP_MIN_) out.error = 'اكتب ' + JD_RESP_MIN_ + ' مسؤوليات على الأقل.';
  else if (n > JD_RESP_MAX_) out.error = 'أقصى عدد ' + JD_RESP_MAX_ + ' مسؤولية (' + n + ' مكتوبة) — اجمع المهام الصغيرة تحت النتيجة اللي بتخدمها.';
  return out;
}
/** v0.42.2 (CHG-89): weighted / monitoring KPIs. Weighted weights add up to exactly 100 (hard); counts by level are indicative. */
var JD_KPI_BANDS_ = { JL1: [3, 5], JL2: [3, 5], JL3: [3, 5], JL4: [4, 6], JL5: [4, 6], JL6: [5, 7], JL7: [5, 7] }, JD_MON_MAX_ = 4;
var KPI_TYPE_IN_ = { 'موزون': 'W', 'متابعة': 'M', W: 'W', M: 'M' };
/** { error, warnings[] } for a KPI list (each [name, formula, freq, type, weight]). */
function jdKpiCheck_(kpis, level) {
  var w = kpis.filter(function (k) { return k[3] === 'W'; }), m = kpis.filter(function (k) { return k[3] === 'M'; }), out = { error: '', warnings: [] };
  var noW = w.filter(function (k) { return !(num_(k[4], 0) > 0); });
  if (noW.length) out.error = 'المؤشر الموزون «' + noW[0][0] + '» من غير وزن.';
  else if (w.length) {
    var sum = Math.round(w.reduce(function (a, k) { return a + num_(k[4], 0); }, 0) * 100) / 100;
    if (sum !== 100) out.error = 'مجموع أوزان المؤشرات الموزونة ' + sum + ' — لازم يبقى 100 بالظبط.';
  }
  var b = JD_KPI_BANDS_[str_(level)];
  if (!w.length && kpis.length) out.warnings.push('مفيش مؤشرات موزونة — حدد النوع والوزن لكل مؤشر.');
  if (b && w.length && (w.length < b[0] || w.length > b[1])) out.warnings.push(w.length + ' مؤشر موزون — نطاق ' + level + ': ' + b[0] + '–' + b[1] + '.');
  if (m.length > JD_MON_MAX_) out.warnings.push(m.length + ' مؤشرات متابعة — الإرشاد ' + JD_MON_MAX_ + ' بالكتير.');
  return out;
}
var JL_NAMES_ = { JL1: 'عامل / مساعد', JL2: 'فني / تنفيذي', JL3: 'أخصائي', JL4: 'مشرف', JL5: 'رئيس قسم', JL6: 'مدير إدارة', JL7: 'رئيس قطاع' };
/** v0.44.2 (CHG-93): level from the Korn Ferry grade, for a job with no level of its own (never stored). */
function jlFromGrade_(grade, title) {
  var g = Number(str_(grade));
  if (!(g >= 1 && g <= 15) || g % 1) return '';
  if (g === 8) return /^(مشرف|رئيس)/.test(str_(title)) ? 'JL4' : 'JL3';
  return g <= 2 ? 'JL1' : g <= 5 ? 'JL2' : g <= 7 ? 'JL3' : g <= 10 ? 'JL5' : g <= 13 ? 'JL6' : 'JL7';
}
/** The job's own level (approved JD / jobs screen), else the one from its grade. */
function jobLevel_(job) {
  var l = str_(job && job.Job_Level);
  return /^JL[1-7]$/.test(l) ? l : jlFromGrade_(job && job.Grade_Code, job && job.Job_Title_AR);
}
var COMP_GROUPS_ = {"CORE": "أساسية", "LEAD": "قيادية", "SLS": "فنية — مبيعات المعارض", "PRD": "فنية — الإنتاج والتصنيع", "FIN": "فنية — المالية والمحاسبة", "HRM": "فنية — الموارد البشرية", "ITS": "فنية — تكنولوجيا المعلومات", "ADM": "فنية — الشؤون الإدارية والأمن", "LGL": "فنية — الشؤون القانونية", "IAU": "فنية — المراجعة الداخلية", "OSH": "فنية — السلامة والصحة المهنية", "COM": "فنية — المبيعات والمشروعات والتصدير", "MKT": "فنية — التسويق", "DSN": "فنية — التصميم والتطوير", "MNT": "فنية — الصيانة", "QLT": "فنية — الجودة", "PLN": "فنية — التخطيط", "SCM": "فنية — سلسلة الإمداد"};
var PROF_NAMES_ = { 1: 'أساسي', 2: 'متمكن', 3: 'متقدم', 4: 'خبير' };

function jdEditRoles_() { return HR_ALL_ROLES; }
function jdApproveRoles_() { return HR_ADMIN_ROLES; }

/** Weighted first (heaviest first), then monitoring, then the old ones without a type. */
function jdKpiSorted_(k) { var o = { W: 0, '': 1, M: 2 }; return k.slice().sort(function (a, b) { return (o[a[3] || ''] - o[b[3] || '']) || (num_(b[4], 0) - num_(a[4], 0)); }); }
function jsonArr_(s) { try { var v = JSON.parse(str_(s) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

/* ---------------- read ---------------- */

function jdVersions_(jobCode) {
  return find_('JOB_DESCRIPTIONS', { Job_Code: jobCode }).sort(function (a, b) { return num_(b.Version, 0) - num_(a.Version, 0); });
}
function jdApproved_(jobCode) { return jdVersions_(jobCode).filter(function (d) { return d.Status === 'Approved'; })[0] || null; }
function jdDraft_(jobCode) { return jdVersions_(jobCode).filter(function (d) { return d.Status === 'Draft'; })[0] || null; }

function compMap_() { var m = {}; all_('COMPETENCIES').forEach(function (c) { if (c.Status !== 'Inactive') m[c.Comp_Code] = c; }); return m; }

function jdView_(d, comps) {
  if (!d) return null;
  comps = comps || compMap_();
  return { JD_ID: d.JD_ID, Job_Code: d.Job_Code, Version: d.Version, Status: d.Status, Purpose: d.Purpose,
    resp: jsonArr_(d.Responsibilities), kpis: jsonArr_(d.KPIs), auth: jsonArr_(d.Authority),
    Qualifications: d.Qualifications, Experience: d.Experience, Working_Conditions: d.Working_Conditions,
    Reporting_Relationship: d.Reporting_Relationship, Career_Level: d.Career_Level, Dimensions: d.Dimensions,
    Relations_Internal: d.Relations_Internal, Relations_External: d.Relations_External, Variants: d.Variants,
    Practical_Test: d.Practical_Test, Trade: d.Trade, Confirm_Notes: d.Confirm_Notes, Change_Reason: d.Change_Reason, Resp_Reason: d.Resp_Reason || '', Certifications: d.Certifications || '',
    respBand: JD_RESP_BANDS_[d.Career_Level] || null,
    comps: jsonArr_(d.Competencies_JSON).map(function (x) {
      var c = comps[x.c] || {};
      return { code: x.c, level: num_(x.l, 0), method: x.m || '', name: c.Name_AR || x.c, group: c.Group_Code || '',
        groupName: COMP_GROUPS_[c.Group_Code] || '', levelName: PROF_NAMES_[num_(x.l, 0)] || '', behaviour: c['Level_' + num_(x.l, 0)] || '' };
    }),
    Updated_At: d.Updated_At || d.Created_At, Updated_By: d.Updated_By || d.Created_By, Approved_By: d.Approved_By, Approved_At: d.Approved_At };
}

/** Jobs with their JD status. p = { q, status: all|approved|draft|none, family } */
function jdList_(ctx, p) {
  p = p || {};
  var ds = {}; all_('JOB_DESCRIPTIONS').forEach(function (d) {
    var x = ds[d.Job_Code] = ds[d.Job_Code] || {};
    if (d.Status === 'Approved') x.approved = d.Version;
    if (d.Status === 'Draft') x.draft = d.Version;
  });
  var posCount = {}; find_('POSITIONS', { Status: ['Active', 'Frozen'] }).forEach(function (x) { posCount[x.Job_Code] = (posCount[x.Job_Code] || 0) + 1; });
  var q = norm_(p.q), fams = cfg_('JOB_FAMILIES', '{}'), famMap = {};
  try { famMap = JSON.parse(fams); } catch (e) {}
  var counts = { all: 0, approved: 0, draft: 0, none: 0 };
  var rows = all_('JOBS').filter(function (j) { return j.Status !== 'Inactive' && posCount[j.Job_Code]; }).map(function (j) {
    var s = ds[j.Job_Code] || {};
    var st = s.approved ? 'approved' : s.draft ? 'draft' : 'none';
    counts.all++; counts[st]++;
    return { Job_Code: j.Job_Code, title: j.Job_Title_AR, family: j.Job_Family, familyName: famMap[j.Job_Family] || j.Job_Family,
      grade: j.Grade_Code, level: j.Job_Level, levelAuto: j.Job_Level ? '' : jobLevel_(j), approved: s.approved || '', draft: s.draft || '', status: st, positions: posCount[j.Job_Code] };
  }).filter(function (r) {
    if (p.status && p.status !== 'all' && r.status !== p.status) return false;
    if (p.family && r.family !== p.family) return false;
    if (q && norm_([r.Job_Code, r.title, r.familyName].join(' ')).indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return a.Job_Code < b.Job_Code ? -1 : 1; });
  var families = Object.keys(famMap).map(function (k) { return { code: k, name: famMap[k] }; });
  return { rows: rows, counts: counts, families: families, canEdit: hasAnyRole_(ctx, jdEditRoles_()), canApprove: hasAnyRole_(ctx, jdApproveRoles_()) };
}

/** One job's JD. Non-HR users see the approved version only. p = { Job_Code, Version? } */
/**
 * v0.43.0 (CHG-90): where the job is done and to whom it reports — from its active positions, not from the JD
 * (one JD serves every position of the job). The manager is the position it reports to, else the unit head.
 */
function jdSites_(code) {
  var seen = {}, out = [];
  var title = function (pid) { var p = pid ? get_('POSITIONS', pid) : null; return p ? (p.Position_Title || (get_('JOBS', p.Job_Code) || {}).Job_Title_AR || '') : ''; };
  find_('POSITIONS', { Job_Code: code, Status: ['Active', 'Frozen'] }).forEach(function (p) {
    var u = get_('ORG_UNITS', p.Org_Unit_ID) || {};
    var mgr = title(p.Reports_To_Position_ID) || (u.Head_Position_ID && u.Head_Position_ID !== p.Position_ID ? title(u.Head_Position_ID) : '');
    var site = { location: locName_(p.Location_ID), unit: u.Name_AR || '', manager: mgr };
    var k = site.location + '|' + site.unit + '|' + site.manager;
    if (!seen[k]) { seen[k] = 1; out.push(site); }
  });
  return out;
}

function jdGet_(ctx, p) {
  var code = str_(p.Job_Code);
  var job = get_('JOBS', code);
  if (!job) throw userError_('الوظيفة غير موجودة.');
  var hr = hasAnyRole_(ctx, HR_ALL_ROLES);
  var comps = compMap_();
  var all = jdVersions_(code);
  var approved = all.filter(function (d) { return d.Status === 'Approved'; })[0] || null;
  var draft = hr ? all.filter(function (d) { return d.Status === 'Draft'; })[0] || null : null;
  var pick = str_(p.Version) ? all.filter(function (d) { return d.Version === str_(p.Version) && (hr || d.Status !== 'Draft'); })[0] : null;
  var names = userNames_();
  var famMap = {}; try { famMap = JSON.parse(cfg_('JOB_FAMILIES', '{}')); } catch (e) {}
  var posCount = find_('POSITIONS', { Job_Code: code, Status: ['Active', 'Frozen'] }).length;
  var out = { job: { Job_Code: code, title: job.Job_Title_AR, titleEn: job.Job_Title_EN, family: job.Job_Family, familyName: famMap[job.Job_Family] || '', grade: job.Grade_Code,
      level: job.Job_Level, levelAuto: job.Job_Level ? '' : jobLevel_(job), levelName: JL_NAMES_[jobLevel_(job)] || '', positions: posCount, status: job.Status || 'Active', sites: jdSites_(code) },
    canEditJob: hasAnyRole_(ctx, HR_ADMIN_ROLES), canEditGrade: hasAnyRole_(ctx, [ROLE.HR_SECTOR]),
    approved: jdView_(approved, comps), draft: jdView_(draft, comps), picked: jdView_(pick, comps),
    versions: all.filter(function (d) { return hr || d.Status !== 'Draft'; }).map(function (d) {
      return { Version: d.Version, Status: d.Status, at: d.Approved_At || d.Updated_At || d.Created_At,
        by: names[d.Approved_By || d.Updated_By || d.Created_By] || '', reason: d.Change_Reason };
    }),
    canEdit: hasAnyRole_(ctx, jdEditRoles_()), canApprove: hasAnyRole_(ctx, jdApproveRoles_()), canSend: !!approved && !ctx.readOnly && jdCanSend_(ctx) };
  [out.approved, out.draft, out.picked].forEach(function (v) { if (v) { v.byName = names[v.Updated_By] || ''; v.approvedByName = names[v.Approved_By] || ''; } });
  return out;
}

/* ---------------- send a JD by e-mail (v0.28.0, ORG-003) ---------------- */

/** Who may send: the HR / recruitment team and unit managers. Recipients: active portal users only (owner decision). */
function jdCanSend_(ctx) { return hasAnyRole_(ctx, hrTeamRoles_()) || managedScope_(ctx.user).length > 0; }

/** The approved JD as a printable page (also the PDF attachment). */
function jdMailHtml_(job, d) {
  var e = function (x) { return String(x === undefined || x === null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var sec = function (t, body) { return body ? '<h3 style="color:#A8111C;font-size:15px;margin:16px 0 6px;border-bottom:2px solid #C6A151;padding-bottom:3px">' + t + '</h3>' + body : ''; };
  var p = function (x) { return x ? '<p style="margin:0;white-space:pre-line">' + e(x) + '</p>' : ''; };
  var ol = function (a) { return a.length ? '<ol style="margin:0;padding-inline-start:20px">' + a.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ol>' : ''; };
  var tbl = function (head, rows) { return rows.length ? '<table style="border-collapse:collapse;width:100%;font-size:12.5px"><tr>' + head.map(function (h) { return '<th style="border:1px solid #DDD;background:#F6F2EC;padding:4px 6px;text-align:start">' + h + '</th>'; }).join('') + '</tr>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td style="border:1px solid #DDD;padding:4px 6px">' + e(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : ''; };
  return '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:13.5px;line-height:1.8;color:#1F1A17;max-width:760px">' +
    '<div style="color:#A8111C;font-weight:bold">قنديل مصر — الوصف الوظيفي</div><h2 style="margin:4px 0">' + e(job.Job_Title_AR) + '</h2>' +
    '<div style="color:#6E6862;font-size:12px">' + e(job.Job_Code) + ' · الإصدار المعتمد ' + e(d.Version) + (d.Approved_At ? ' · ' + e(String(d.Approved_At).slice(0, 10)) : '') + '</div>' +
    sec('الغرض من الوظيفة', p(d.Purpose)) + sec('المسؤوليات', ol(d.resp)) +
    sec('مؤشرات الأداء', tbl(['المؤشر', 'طريقة الحساب / الغرض', 'الدورية', 'الوزن'], jdKpiSorted_(d.kpis).map(function (k) { return [k[0], k[1], k[2], k[3] === 'W' ? k[4] + '%' : k[3] === 'M' ? 'متابعة' : '']; }))) +
    sec('الصلاحيات', tbl(['الصلاحية', 'المستوى'], d.auth.map(function (a) { return [a[0], a[1]]; }))) +
    sec('المؤهل', p(d.Qualifications)) + sec('الخبرة', p(d.Experience)) + (d.Certifications ? sec('الشهادات والتراخيص المطلوبة', ol(str_(d.Certifications).split('\n'))) : '') + sec('ظروف العمل', p(d.Working_Conditions)) +
    sec('الكفاءات المطلوبة', tbl(['الكفاءة', 'المستوى', 'طريقة القياس'], d.comps.map(function (c) { return [c.name, c.levelName, c.method]; }))) +
    '</div>';
}

/** Active portal users with an e-mail, for the recipient picker. */
function jdRecipients_(ctx) {
  if (!jdCanSend_(ctx)) throw userError_('إرسال الوصف الوظيفي لفريق الموارد البشرية والتوظيف والمديرين.');
  return all_('USERS').filter(function (u) { return u.Status === 'Active' && str_(u.Email); })
    .map(function (u) { var pos = u.Position_ID ? get_('POSITIONS', u.Position_ID) : null, j = pos ? get_('JOBS', pos.Job_Code) : null;
      return { id: u.User_ID, name: u.Full_Name_AR, job: j ? j.Job_Title_AR : '' }; })
    .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
}

/** p = { Job_Code, to: [User_ID], note } — the approved version, in the mail and as a PDF, to up to 10 portal users. */
function jdSend_(ctx, p) {
  if (!jdCanSend_(ctx)) throw userError_('إرسال الوصف الوظيفي لفريق الموارد البشرية والتوظيف والمديرين.');
  var job = get_('JOBS', str_(p.Job_Code));
  if (!job) throw userError_('الوظيفة غير موجودة.');
  var d = jdView_(jdApproved_(job.Job_Code));
  if (!d) throw userError_('الوظيفة دي مالهاش وصف وظيفي معتمد — الإرسال للإصدار المعتمد بس.');
  var ids = (p.to || []).map(str_).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; });
  if (!ids.length) throw userError_('اختار مستخدم واحد على الأقل.');
  if (ids.length > 10) throw userError_('أقصى عدد 10 مستخدمين في المرة.');
  var users = ids.map(function (id) {
    var u = get_('USERS', id);
    if (!u || u.Status !== 'Active' || !str_(u.Email)) throw userError_('المستخدم ' + id + ' مش موجود أو مالوش إيميل.');
    return u;
  });
  if (!mailOk_()) throw userError_('وصلنا لحد الإيميلات النهارده — جرّب بكره أو اطبع الوصف.');
  var note = str_(p.note).slice(0, 500), html = jdMailHtml_(job, d), att = [];
  try { att = [Utilities.newBlob(html, 'text/html', 'jd.html').getAs('application/pdf').setName('الوصف الوظيفي - ' + job.Job_Title_AR + ' (' + job.Job_Code + ').pdf')]; } catch (e) { att = []; }
  var sent = [];
  users.forEach(function (u) {
    var body = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8">' + (u.Full_Name_AR ? 'أ/ ' + escHtml_(u.Full_Name_AR) + '،<br>' : '') +
      escHtml_(ctx.user.Full_Name_AR) + ' بعتلك الوصف الوظيفي المعتمد لوظيفة «' + escHtml_(job.Job_Title_AR) + '».' + (note ? '<br><b>ملاحظة:</b> ' + escHtml_(note) : '') + '</div><hr>' + html;
    if (sendMail_({ to: u.Email, name: 'Kandil Recruitment Portal', subject: 'الوصف الوظيفي — ' + job.Job_Title_AR + ' (' + job.Job_Code + ')', htmlBody: body, attachments: att })) { mailSent_(); sent.push(u.User_ID); }
  });
  audit_(ctx, { entityType: 'JD', entityId: job.Job_Code, action: 'SENT', newValue: 'v' + d.Version + ' → ' + sent.join(','), reason: note });
  event_(ctx, 'JD', job.Job_Code, 'SENT', note, { version: d.Version, to: users.map(function (u) { return u.Full_Name_AR; }) });
  return { sent: sent.length, version: d.Version, pdf: att.length > 0 };
}

/** Interview kit for a job: its JD competencies with questions (up to the job's level) and practical tests. */
function jdInterviewKit_(ctx, p) {
  var code = str_(p.Job_Code);
  var d = jdApproved_(code) || (hasAnyRole_(ctx, HR_ALL_ROLES) ? jdDraft_(code) : null);
  if (!d) throw userError_('الوظيفة مالهاش وصف وظيفي لسه.');
  var v = jdView_(d);
  var jl = str_(d.Career_Level) || 'JL2', jlIdx = JL_CODES_.indexOf(jl);
  var tests = {}; all_('COMP_TESTS').forEach(function (t) { if (t.Status !== 'Inactive') tests[t.Comp_Code] = t; });
  var qs = {}; find_('COMP_QUESTIONS', { Status: 'Active' }, { sort: 'Seq' }).forEach(function (q) {
    if (JL_CODES_.indexOf(q.From_Level || 'JL1') > jlIdx) return;
    (qs[q.Comp_Code] = qs[q.Comp_Code] || []).push({ q: q.Question, strong: q.Strong, weak: q.Weak });
  });
  return { Job_Code: code, title: (get_('JOBS', code) || {}).Job_Title_AR, Version: d.Version, Status: d.Status, certs: d.Certifications || '', level: jl, levelName: JL_NAMES_[jl],
    comps: v.comps.map(function (c) {
      var t = tests[c.code];
      return { code: c.code, name: c.name, groupName: c.groupName, level: c.level, levelName: c.levelName, behaviour: c.behaviour, method: c.method,
        questions: qs[c.code] || [], test: c.code === 'PR02' && d.Practical_Test ? { name: d.Practical_Test, how: '', duration: '', pass: '', owner: '' }
          : t ? { name: t.Test_Name, how: t.Method, duration: t.Duration, pass: t.Pass_Criteria, owner: t.Owner } : null };
    }) };
}

/* ---------------- write ---------------- */

function jdClean_(p) {
  var lines = function (v) { return (Array.isArray(v) ? v : str_(v).split(/\n/)).map(str_).filter(Boolean); };
  var pairs = function (v, n) {
    return (Array.isArray(v) ? v : []).map(function (r) { r = (r || []).map(str_); while (r.length < n) r.push(''); return r.slice(0, n); })
      .filter(function (r) { return r[0]; });
  };
  var kpis = pairs(p.kpis, 5).map(function (k) {
    var t = KPI_TYPE_IN_[k[3]];
    if (k[3] && !t) throw userError_('نوع المؤشر «' + k[0] + '» لازم يبقى «موزون» أو «متابعة».');
    t = t || '';
    var wt = t === 'W' ? str_(k[4]).replace(/[%\s]/g, '') : '';
    if (wt && !/^\d+(\.\d+)?$/.test(wt)) throw userError_('وزن المؤشر «' + k[0] + '» لازم يبقى رقم.');
    return [k[0], k[1], k[2], t, wt];
  });
  var comps = (Array.isArray(p.comps) ? p.comps : []).map(function (c) {
    return { c: str_(c.code || c.c), l: Math.max(1, Math.min(4, num_(c.level || c.l, 1))), m: str_(c.method || c.m) };
  }).filter(function (c) { return c.c; });
  var seen = {}; comps = comps.filter(function (c) { if (seen[c.c]) return false; seen[c.c] = 1; return true; });
  var jl = str_(p.Career_Level);
  if (jl && JL_CODES_.indexOf(jl) < 0) throw userError_('مستوى الوظيفة غير صحيح.');
  return { Purpose: str_(p.Purpose), Responsibilities: JSON.stringify(lines(p.resp)), KPIs: JSON.stringify(kpis),
    Authority: JSON.stringify(pairs(p.auth, 2)), Qualifications: str_(p.Qualifications), Experience: str_(p.Experience),
    Working_Conditions: str_(p.Working_Conditions), Reporting_Relationship: str_(p.Reporting_Relationship), Career_Level: jl,
    Dimensions: str_(p.Dimensions), Relations_Internal: str_(p.Relations_Internal), Relations_External: str_(p.Relations_External),
    Variants: str_(p.Variants), Practical_Test: str_(p.Practical_Test), Trade: str_(p.Trade), Confirm_Notes: str_(p.Confirm_Notes),
    Competencies_JSON: JSON.stringify(comps), Change_Reason: str_(p.Change_Reason), Resp_Reason: str_(p.Resp_Reason),
    Certifications: lines(p.Certifications).join('\n') };
}

/** Insert or update the job's draft (a new version above the latest). Runs inside a lock. */
function jdUpsertDraft_(actor, jobCode, fields) {
  var all = jdVersions_(jobCode);
  var draft = all.filter(function (d) { return d.Status === 'Draft'; })[0];
  if (draft) return update_('JOB_DESCRIPTIONS', draft.JD_ID, fields, actor).after;
  var v = all.length ? num_(all[0].Version, 0) + 1 : 1;
  var row = { JD_ID: nextId_('JD'), Job_Code: jobCode, Version: String(v), Status: 'Draft', Effective_From: '', Approved_By: '', Approved_At: '',
    Technical_Skills: '', Behavioral_Competencies: '', Physical_Requirements: '', Submitted_By: actor };
  for (var k in fields) row[k] = fields[k];
  return insert_('JOB_DESCRIPTIONS', row, actor);
}

/** Save a draft. p = { Job_Code, Purpose, resp[], kpis[[]], auth[[]], comps[{code,level,method}], … } */
function jdSave_(ctx, p) {
  var code = str_(p.Job_Code);
  if (!get_('JOBS', code)) throw userError_('الوظيفة غير موجودة.');
  var f = jdClean_(p);
  if (f.Purpose.length < 10) throw userError_('اكتب الغرض من الوظيفة.');
  var rc = jdRespCheck_(f);
  if (rc.error) throw userError_(rc.error);
  if (rc.over && f.Resp_Reason.length < 10) throw userError_('المسؤوليات (' + rc.n + ') أكتر من نطاق مستوى ' + f.Career_Level + ' (' + rc.band[0] + '–' + rc.band[1] + ') — اكتب سبب الزيادة.');
  if (!rc.over) f.Resp_Reason = '';
  var kc = jdKpiCheck_(jsonArr_(f.KPIs), f.Career_Level);     // v0.42.2 (CHG-89)
  if (kc.error) throw userError_(kc.error);
  var d;
  withLock_(function () { d = jdUpsertDraft_(ctx.user.User_ID, code, f); });
  audit_(ctx, { entityType: 'JD', entityId: code, action: 'SAVE_DRAFT', newValue: 'v' + d.Version });
  return { Job_Code: code, Version: d.Version };
}

function jdApproveOne_(actor, code, reason) {
  var d = jdDraft_(code);
  if (!d) return null;
  var prev = jdApproved_(code);
  if (prev) update_('JOB_DESCRIPTIONS', prev.JD_ID, { Status: 'Superseded', Effective_To: today_() }, actor);
  var at = nowIso_();
  update_('JOB_DESCRIPTIONS', d.JD_ID, { Status: 'Approved', Approved_By: actor, Approved_At: at, Effective_From: today_(),
    Change_Reason: d.Change_Reason || reason || (prev ? '' : 'الإصدار الأول') }, actor);
  var patch = { Current_JD_Version: d.Version };
  if (d.Career_Level) patch.Job_Level = d.Career_Level;
  update_('JOBS', code, patch, actor);
  return d.Version;
}

/** Approve the draft of one job, or every draft. p = { Job_Code? , all: 'Y', reason } */
function jdApprove_(ctx, p) {
  var codes = str_(p.all) === 'Y'
    ? Object.keys(find_('JOB_DESCRIPTIONS', { Status: 'Draft' }).reduce(function (m, d) { m[d.Job_Code] = 1; return m; }, {}))
    : [str_(p.Job_Code)];
  if (!codes.length || !codes[0]) throw userError_('مفيش مسودات للاعتماد.');
  var done = [];
  withLock_(function () { codes.forEach(function (c) { var v = jdApproveOne_(ctx.user.User_ID, c, str_(p.reason)); if (v) done.push(c + ' v' + v); }); });
  if (!done.length) throw userError_('مفيش مسودة للوظيفة دي.');
  audit_(ctx, { entityType: 'JD', entityId: codes.length > 1 ? 'BULK' : codes[0], action: 'APPROVE', newValue: done.join(', '), reason: str_(p.reason) });
  return { approved: done.length, items: done };
}

function jdDiscard_(ctx, p) {
  var d = jdDraft_(str_(p.Job_Code));
  if (!d) throw userError_('مفيش مسودة.');
  withLock_(function () { update_('JOB_DESCRIPTIONS', d.JD_ID, { Status: 'Discarded' }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'JD', entityId: d.Job_Code, action: 'DISCARD_DRAFT', oldValue: 'v' + d.Version });
  return { ok: true };
}

/** A new job created by an approved new-position request starts with a JD draft from that request. */
function jdFromPcr_(actor, jobCode, r) {
  var resp = str_(r.Responsibilities).split(/\n|•|- /).map(str_).filter(function (x) { return x.length > 3; });
  jdUpsertDraft_(actor, jobCode, { Purpose: str_(r.Justification), Responsibilities: JSON.stringify(resp), KPIs: '[]', Authority: '[]',
    Qualifications: str_(r.Qualifications), Experience: '', Working_Conditions: '', Reporting_Relationship: '', Career_Level: '',
    Dimensions: '', Relations_Internal: '', Relations_External: '', Variants: '', Practical_Test: '', Trade: '',
    Confirm_Notes: 'مسودة من طلب الوظيفة الجديدة ' + r.PCR_ID + ' — كمّلها واعتمدها', Competencies_JSON: '[]', Change_Reason: 'وظيفة جديدة ' + r.PCR_ID });
}

/* ---------------- library ---------------- */

function compList_(ctx) {
  var tests = {}; all_('COMP_TESTS').forEach(function (t) { tests[t.Comp_Code] = t.Test_Name; });
  return { groups: COMP_GROUPS_, levels: JL_NAMES_, prof: PROF_NAMES_,
    comps: all_('COMPETENCIES').filter(function (c) { return c.Status !== 'Inactive'; }).sort(function (a, b) { return a.Comp_Code < b.Comp_Code ? -1 : 1; }).map(function (c) {
      return { code: c.Comp_Code, group: c.Group_Code, name: c.Name_AR, nameEn: c.Name_EN, def: c.Definition, methods: c.Methods,
        levels: [c.Level_1, c.Level_2, c.Level_3, c.Level_4], req: JL_CODES_.map(function (j) { return num_(c['Req_' + j], 0); }), test: tests[c.Comp_Code] || '' };
    }) };
}

/**
 * Bulk import (parsed in the browser from the review workbooks).
 * p = { kind: 'library', comps: [...], questions: [...], tests: [...] }
 *   | { kind: 'jds', jds: [{ code, purpose, resp[], kpis[[]], auth[[]], comps[{c,l,m}], level, … }], commit }
 */
function jdImport_(ctx, p) {
  var actor = ctx.user.User_ID;
  if (p.kind === 'library') {
    var comps = p.comps || [];
    if (!comps.length) throw userError_('مفيش كفاءات في الملف.');
    var bad = comps.filter(function (c) { return !/^[A-Z]{1,3}\d{2}$/.test(str_(c.code)) || !COMP_GROUPS_[str_(c.group)] || !str_(c.name); });
    if (bad.length) throw userError_('سطور كفاءات ناقصة أو كود غير صحيح: ' + bad.slice(0, 5).map(function (c) { return c.code || '?'; }).join('، '));
    if (!p.commit) return { comps: comps.length, questions: (p.questions || []).length, tests: (p.tests || []).length };
    withLock_(function () {
      comps.forEach(function (c) {
        var row = { Group_Code: str_(c.group), Name_AR: str_(c.name), Name_EN: str_(c.nameEn), Definition: str_(c.def), Methods: str_(c.methods),
          Level_1: str_(c.levels[0]), Level_2: str_(c.levels[1]), Level_3: str_(c.levels[2]), Level_4: str_(c.levels[3]), Status: 'Active' };
        JL_CODES_.forEach(function (j, i) { row['Req_' + j] = String(num_((c.req || [])[i], 0)); });
        if (get_('COMPETENCIES', c.code)) update_('COMPETENCIES', c.code, row, actor);
        else { row.Comp_Code = str_(c.code); insert_('COMPETENCIES', row, actor); }
      });
      // questions are replaced as a set (they have no stable id in the workbook)
      find_('COMP_QUESTIONS', { Status: 'Active' }).forEach(function (q) { update_('COMP_QUESTIONS', q.Question_ID, { Status: 'Inactive' }, actor); });
      var qs = (p.questions || []).filter(function (q) { return str_(q.q) && str_(q.code); });
      if (qs.length) {
        var ids = nextIds_('COMP_QUESTION', qs.length);
        insertMany_('COMP_QUESTIONS', qs.map(function (q, i) {
          return { Question_ID: ids[i], Comp_Code: str_(q.code), Seq: String(num_(q.seq, i + 1)), Question: str_(q.q), Strong: str_(q.strong),
            Weak: str_(q.weak), From_Level: JL_CODES_.indexOf(str_(q.from)) >= 0 ? str_(q.from) : 'JL1', Status: 'Active' };
        }), actor);
      }
      (p.tests || []).forEach(function (t) {
        if (!str_(t.code)) return;
        var row = { Test_Name: str_(t.name), Method: str_(t.how), Duration: str_(t.duration), Pass_Criteria: str_(t.pass), Owner: str_(t.owner), Status: 'Active' };
        if (get_('COMP_TESTS', t.code)) update_('COMP_TESTS', t.code, row, actor); else { row.Comp_Code = str_(t.code); insert_('COMP_TESTS', row, actor); }
      });
    });
    audit_(ctx, { entityType: 'COMPETENCY', entityId: 'LIBRARY', action: 'IMPORT', newValue: comps.length + ' comps' });
    return { committed: true, comps: comps.length, questions: (p.questions || []).length, tests: (p.tests || []).length };
  }
  if (p.kind === 'jds') {
    var jds = p.jds || [];
    if (!jds.length) throw userError_('مفيش أوصاف في الملف.');
    var known = compMap_(), errors = [], warnings = [], ok = [];
    jds.forEach(function (j) {
      var code = str_(j.code);
      if (!get_('JOBS', code)) { errors.push({ code: code, title: j.title, msg: 'كود الوظيفة مش موجود في البوابة' }); return; }
      if (!str_(j.purpose) || !(j.resp || []).length) { errors.push({ code: code, title: j.title, msg: 'الغرض أو المسؤوليات ناقصة' }); return; }
      var rc = jdRespCheck_({ Responsibilities: JSON.stringify(j.resp), Career_Level: j.level });     // v0.42.1 (CHG-88)
      if (rc.error) { errors.push({ code: code, title: j.title, msg: rc.error }); return; }
      var cl;
      try { cl = jdClean_({ kpis: j.kpis }); } catch (eK) { errors.push({ code: code, title: j.title, msg: eK.message }); return; }
      var kc = jdKpiCheck_(jsonArr_(cl.KPIs), j.level);     // v0.42.2 (CHG-89)
      if (kc.error) { errors.push({ code: code, title: j.title, msg: kc.error }); return; }
      kc.warnings.forEach(function (w) { warnings.push({ code: code, title: j.title, msg: w }); });
      if (rc.over && str_(j.respReason).length < 10) warnings.push({ code: code, title: j.title, msg: rc.n + ' مسؤولية فوق نطاق ' + j.level + ' (' + rc.band[0] + '–' + rc.band[1] + ') — هيتطلب سبب الزيادة عند أول تعديل' });
      var unknown = (j.comps || []).filter(function (c) { return !known[c.c]; }).map(function (c) { return c.c; });
      if (unknown.length) { errors.push({ code: code, title: j.title, msg: 'كفاءات مش في المكتبة: ' + unknown.join('، ') + ' — حمّل المكتبة الأول' }); return; }
      ok.push(j);
    });
    var existing = { approved: 0, draft: 0 };
    ok.forEach(function (j) { if (jdApproved_(j.code)) existing.approved++; if (jdDraft_(j.code)) existing.draft++; });
    var summary = { total: jds.length, valid: ok.length, errors: errors, warnings: warnings, replacesDrafts: existing.draft, newVersionsOver: existing.approved };
    if (!p.commit) return summary;
    if (!ok.length) throw userError_('مفيش أوصاف سليمة للتحميل.');
    withLock_(function () {
      ok.forEach(function (j) {
        jdUpsertDraft_(actor, j.code, jdClean_({ Purpose: j.purpose, resp: j.resp, kpis: j.kpis, auth: j.auth, comps: j.comps,
          Qualifications: j.edu, Experience: j.exp, Working_Conditions: j.cond, Reporting_Relationship: j.reports, Career_Level: j.level,
          Dimensions: j.dims, Relations_Internal: j.relIn, Relations_External: j.relOut, Variants: j.variants, Practical_Test: j.test,
          Trade: j.trade, Confirm_Notes: j.confirm, Change_Reason: str_(p.reason) || 'تحميل من ملف الأوصاف', Resp_Reason: j.respReason, Certifications: j.certs }));
      });
    });
    audit_(ctx, { entityType: 'JD', entityId: 'IMPORT', action: 'IMPORT', newValue: ok.length + ' drafts', reason: str_(p.reason) });
    summary.committed = true;
    return summary;
  }
  throw userError_('نوع تحميل غير معروف.');
}
