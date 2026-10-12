/**
 * Onboarding.gs — v0.17.0 (phase 6A): the new hire's onboarding program inside the portal.
 *  - Templates per job type (FACTORY / SHOWROOM / OFFICE): activities in four phases (before day one, day one,
 *    first week, first month), each with a day offset, an owner role and whether the employee acknowledges it.
 *  - A program opens when the joining date is confirmed (or by hand for an existing employee), its tasks dated
 *    from the start date and given to real people: HR site specialist, recruiter, supervisor, unit manager, buddy.
 *  - Joining date changes re-date the open tasks; "did not join" cancels the program; "joined" links the employee.
 *  - Tasks are done / skipped (with a reason) by their owner or HR; the program closes when nothing is left open,
 *    with the employee's acknowledgement of the whole program.
 *  - v0.41.0 (CHG-85): owners for IT, administration and safety (ONB_IT_USERS / ONB_ADMIN_USERS / ONB_SAFETY_USERS —
 *    the HR site specialist when empty); a custody & PPE log per employee (issued / returned / lost, signed receipt;
 *    open items are flagged at the end of service); an «arriving tomorrow» screen of who starts today and the next
 *    working day with what is still not ready.
 */

var ONB_PHASES_ = { BEFORE: 'قبل أول يوم', DAY1: 'اليوم الأول', WEEK1: 'الأسبوع الأول', MONTH1: 'الشهر الأول' };
var ONB_PHASE_ORDER_ = ['BEFORE', 'DAY1', 'WEEK1', 'MONTH1'];
var ONB_OWNERS_ = { HR_SITE: 'أخصائي HR الموقع', RECRUITER: 'مسؤول التوظيف', SUPERVISOR: 'المشرف المباشر', MANAGER: 'مدير الوحدة', BUDDY: 'الزميل المرافق (Buddy)',
  IT: 'تكنولوجيا المعلومات', ADMIN: 'الشؤون الإدارية', SAFETY: 'السلامة والصحة المهنية' };
var ONB_DEPT_CFG_ = { IT: 'ONB_IT_USERS', ADMIN: 'ONB_ADMIN_USERS', SAFETY: 'ONB_SAFETY_USERS' };
var ONB_DEPT_COL_ = { IT: 'IT_User_ID', ADMIN: 'Admin_User_ID', SAFETY: 'Safety_User_ID' };
var CUSTODY_KINDS_ = { CUSTODY: 'عهدة', PPE: 'مهمات وقاية شخصية' };
var CUSTODY_ST_ = { ISSUED: 'معاه', RETURNED: 'اترجعت', LOST: 'فُقدت / تالفة' };

/** Active users named in a setting (e-mails or user IDs, comma separated). */
function cfgUsers_(key) {
  var list = str_(cfg_(key, '')).split(/[,\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(String);
  if (!list.length) return [];
  return where_('USERS', function (u) { return u.Status === 'Active' && (list.indexOf(str_(u.User_ID).toLowerCase()) >= 0 || list.indexOf(str_(u.Email).toLowerCase()) >= 0); })
    .map(function (u) { return u.User_ID; });
}
/** The IT / administration / safety people (any of them). */
function onbLocHr_(locId) { var l = locId ? get_('LOCATIONS', locId) : null; return l ? str_(l.HR_Site_User_ID) : ''; }
function onbDeptUsers_() { return cfgUsers_('ONB_IT_USERS').concat(cfgUsers_('ONB_ADMIN_USERS'), cfgUsers_('ONB_SAFETY_USERS')); }
var ONB_TYPES_ = { FACTORY: 'مصنع', SHOWROOM: 'معرض', OFFICE: 'إدارة / مكتب' };

function onbAdminRoles_() { return candWorkRoles_().concat(HR_ALL_ROLES); }
function onbTemplateRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER]; }
function onbIsAdmin_(ctx) { return hasAnyRole_(ctx, onbAdminRoles_()); }

/* ---------------- default templates ---------------- */

/** [phase, day offset, owner, title, details, needs employee acknowledgement] */
var ONB_COMMON_ = [
  ['BEFORE', -3, 'HR_SITE', 'تجهيز ملف الموظف وتسجيل بياناته', 'ملف الموظف (ورقي + على البوابة)، كود الموظف، ومكانه في الهيكل.', 'N'],
  ['BEFORE', -2, 'RECRUITER', 'رسالة ترحيب بميعاد ومكان أول يوم', 'الساعة، المكان، يسأل على مين، اللبس، والمستندات اللي هيجيبها معاه.', 'N'],
  ['BEFORE', -1, 'MANAGER', 'تجهيز مكان العمل والأدوات', 'المكتب أو مكان الشغل، الأدوات والعهدة، وأي حسابات محتاجها.', 'N'],
  ['BEFORE', -1, 'ADMIN', 'تجهيز الكارنيه والمكتب وتسليم العهدة', 'كل حاجة بتتسلّم تتسجل في سجل العهدة بتوقيعه.', 'N'],
  ['BEFORE', -1, 'MANAGER', 'اختيار الزميل المرافق (Buddy)', 'زميل قديم في نفس القسم يرافقه أول شهر ويجاوب أسئلته — سجّل اسمه في البرنامج.', 'N'],
  ['DAY1', 0, 'HR_SITE', 'استقبال الموظف وجولة تعريفية بالمكان', 'الترحيب، جولة على المكان والخدمات (المطعم، المصلى، دورات المياه، مخارج الطوارئ).', 'N'],
  ['DAY1', 0, 'HR_SITE', 'شرح لائحة العمل والمواعيد والإجازات والجزاءات', 'المواعيد والبصمة، الإجازات والأذونات، الجزاءات، وقنوات الشكوى.', 'Y'],
  ['DAY1', 0, 'HR_SITE', 'تسليم الكارنيه وتسجيل البصمة على ZKBioTime (وجه + أصابع)', 'سجّل الوجه والأصابع على ZKBioTime، وحدد نوع التسجيل: ماكينات بس أو موبايل + ماكينات.', 'N', 'BIO'],
  ['DAY1', 0, 'SUPERVISOR', 'التعريف بالفريق وشرح مهام الوظيفة', 'الوصف الوظيفي المعتمد، المطلوب منه أول أسبوع، ومين يرجع له.', 'Y'],
  ['DAY1', 0, 'BUDDY', 'الغدا مع الموظف الجديد والإجابة على أسئلته', '', 'N'],
  ['WEEK1', 3, 'HR_SITE', 'التأكد من البصمة وبدء التأمينات', 'البصمة شغالة، وملف التأمينات اتقدم من أول يوم شغل.', 'N'],
  ['WEEK1', 5, 'SUPERVISOR', 'تدريب على رأس العمل حسب خطة الأسبوع الأول', '', 'N'],
  ['WEEK1', 5, 'BUDDY', 'متابعة يومية قصيرة مع الموظف', 'خمس دقايق كل يوم: محتاج إيه؟ في حاجة مش واضحة؟', 'N'],
  ['MONTH1', 14, 'SUPERVISOR', 'مراجعة أول أسبوعين مع الموظف', 'إيه اللي ماشي كويس وإيه اللي محتاج تدريب أكتر.', 'N'],
  ['MONTH1', 21, 'HR_SITE', 'مقابلة متابعة قصيرة (ارتياح الموظف)', 'مرتاح؟ في عوائق؟ المكان والمواصلات والفريق.', 'N'],
  ['MONTH1', 30, 'MANAGER', 'اجتماع نهاية الشهر الأول وأهداف فترة الاختبار', 'الأهداف ومعايير التقييم لحد نهاية فترة الاختبار.', 'Y']
];
var ONB_EXTRA_ = {
  FACTORY: [
    ['DAY1', 0, 'SAFETY', 'تدريب السلامة والصحة المهنية وتسليم مهمات الوقاية', 'مخاطر المكان، مهمات الوقاية الشخصية (تتسجل في سجل العهدة)، الإسعافات ومخارج الطوارئ.', 'Y'],
    ['DAY1', 0, 'SUPERVISOR', 'جولة على خط الإنتاج والتعريف بالماكينات', 'الماكينات اللي هيشتغل عليها وتعليمات تشغيلها الآمن.', 'N'],
    ['WEEK1', 4, 'SUPERVISOR', 'التعريف بمعايير الجودة والعيوب الشائعة', '', 'N']],
  SHOWROOM: [
    ['BEFORE', -2, 'IT', 'تجهيز حساب نظام البيع والجهاز', 'حسب الوظيفة — لو مش محتاج، علّمها «مش هتتعمل» بسبب.', 'N'],
    ['DAY1', 0, 'MANAGER', 'جولة في المعرض والتعريف بأقسام المنتجات', '', 'N'],
    ['WEEK1', 5, 'SUPERVISOR', 'تدريب على المنتجات والأسعار', 'النجف والإضاءة والأثاث، الخامات، والأسعار والعروض الحالية.', 'N'],
    ['WEEK1', 5, 'SUPERVISOR', 'تدريب على التعامل مع العملاء ونظام البيع والتحصيل', '', 'Y'],
    ['MONTH1', 20, 'MANAGER', 'بيع مع زميل خبير ثم تقييم', '', 'N']],
  OFFICE: [
    ['BEFORE', -2, 'IT', 'تجهيز الإيميل وحسابات الأنظمة', 'الجهاز، الإيميل والحسابات اللي الوظيفة محتاجاها.', 'N'],
    ['WEEK1', 4, 'MANAGER', 'التعريف بالإدارات اللي هيتعامل معاها', '', 'N'],
    ['WEEK1', 5, 'SUPERVISOR', 'شرح الإجراءات والنماذج والأنظمة المستخدمة', '', 'N']]
};

function seedOnboarding_() {
  if (all_('ONB_TEMPLATES').length) return;
  var names = { FACTORY: 'برنامج تهيئة المصانع', SHOWROOM: 'برنامج تهيئة المعارض', OFFICE: 'برنامج تهيئة الإدارات والمكاتب' };
  Object.keys(ONB_TYPES_).forEach(function (type) {
    var tid = 'ONT-' + type;
    insert_('ONB_TEMPLATES', { Template_ID: tid, Name_AR: names[type], Job_Type: type, Status: 'Active', Notes: '' }, 'SYSTEM');
    var rows = ONB_COMMON_.concat(ONB_EXTRA_[type]).sort(function (a, b) {
      return ONB_PHASE_ORDER_.indexOf(a[0]) - ONB_PHASE_ORDER_.indexOf(b[0]) || a[1] - b[1];
    });
    var ids = nextIds_('ONB_ITEM', rows.length);
    insertMany_('ONB_TEMPLATE_ITEMS', rows.map(function (r, i) {
      return { Item_ID: ids[i], Template_ID: tid, Phase: r[0], Day_Offset: String(r[1]), Owner_Role: r[2], Title_AR: r[3], Details: r[4],
        Needs_Ack: r[5], Sort_Order: String((i + 1) * 10), Status: 'Active', Kind: r[6] || '' };
    }), 'SYSTEM');
  });
}

/* ---------------- helpers ---------------- */

/** Job type of a place: factories and warehouses → FACTORY, showrooms → SHOWROOM, the rest → OFFICE. */
function onbTypeOfLocation_(locId) {
  var l = locId ? get_('LOCATIONS', locId) : null, t = l ? l.Location_Type : '';
  return ['FACTORY', 'WAREHOUSE'].indexOf(t) >= 0 ? 'FACTORY' : ['SHOWROOM', 'BRANCH_GROUP'].indexOf(t) >= 0 ? 'SHOWROOM' : 'OFFICE';
}
function onbTemplateFor_(type) {
  return where_('ONB_TEMPLATES', function (t) { return t.Job_Type === type && t.Status === 'Active'; })[0] ||
    where_('ONB_TEMPLATES', function (t) { return t.Status === 'Active'; })[0] || null;
}
/** Due date = start + offset; a day off moves forward (or back, before day one). */
function onbDue_(start, offset) {
  var n = num_(offset, 0), d = addDaysYmd_(start, n), step = n < 0 ? -1 : 1, guard = 0;
  while (isWeekend_(d) && guard++ < 7) d = addDaysYmd_(d, step);
  return d;
}
function onbPositionUsers_(posId) {
  if (!posId) return [];
  return find_('USERS', { Position_ID: posId, Status: 'Active' }).map(function (u) { return u.User_ID; });
}
/** Real people for each owner role. */
function onbResolveOwners_(posId, locId, vac) {
  var pos = posId ? get_('POSITIONS', posId) : null, out = {};
  var loc = locId ? get_('LOCATIONS', locId) : null;
  out.SUPERVISOR = pos ? (onbPositionUsers_(pos.Reports_To_Position_ID)[0] || '') : '';
  var unit = pos ? get_('ORG_UNITS', pos.Org_Unit_ID) : null;
  out.MANAGER = unit && unit.Head_Position_ID && unit.Head_Position_ID !== posId ? (onbPositionUsers_(unit.Head_Position_ID)[0] || '') : '';
  if (!out.MANAGER && pos) out.MANAGER = (managerUsersOf_(posId)[0] || '');
  if (!out.SUPERVISOR) out.SUPERVISOR = out.MANAGER;
  out.RECRUITER = vac ? str_(vac.Lead_Recruiter_ID) : '';
  out.HR_SITE = loc ? str_(loc.HR_Site_User_ID) : '';
  if (!out.HR_SITE) out.HR_SITE = out.RECRUITER;
  if (!out.RECRUITER) out.RECRUITER = out.HR_SITE;
  out.BUDDY = '';
  Object.keys(ONB_DEPT_CFG_).forEach(function (r) { out[r] = cfgUsers_(ONB_DEPT_CFG_[r])[0] || ''; });
  return out;
}
function onbOwnerOf_(o, role) {
  if (role === 'BUDDY') return str_(o.Buddy_User_ID) || str_(o.Supervisor_User_ID);
  if (ONB_DEPT_COL_[role]) return str_(o[ONB_DEPT_COL_[role]]) || str_(o.HR_Site_User_ID);      // nobody named → the HR site specialist
  var col = { HR_SITE: 'HR_Site_User_ID', RECRUITER: 'Recruiter_User_ID', SUPERVISOR: 'Supervisor_User_ID', MANAGER: 'Manager_User_ID' }[role];
  return col ? str_(o[col]) : str_(o.HR_Site_User_ID);
}
function onbUsersOf_(o) {
  return [o.HR_Site_User_ID, o.Recruiter_User_ID, o.Supervisor_User_ID, o.Manager_User_ID, o.Buddy_User_ID, o.IT_User_ID, o.Admin_User_ID, o.Safety_User_ID].filter(Boolean);
}
function onbCanView_(ctx, o) {
  if (onbIsAdmin_(ctx)) return true;
  var me = ctx.user.User_ID;
  if (onbUsersOf_(o).indexOf(me) >= 0) return true;
  if (find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID }).some(function (t) { return t.Owner_User_ID === me; })) return true;
  var pos = o.Position_ID ? get_('POSITIONS', o.Position_ID) : null;
  return !!(pos && managedScope_(ctx.user).indexOf(pos.Org_Unit_ID) >= 0);
}
function onbGet_(id) {
  var o = get_('ONBOARDINGS', str_(id));
  if (!o) throw userError_('برنامج التهيئة غير موجود.');
  return o;
}

/* ---------------- opening a program ---------------- */

/**
 * Opens a program (call under the lock or not — it takes the lock itself).
 * src = { joining?, vacancy?, employee?, Full_Name, Position_ID, Location_ID, Start_Date, Template_ID? }
 */
function onbCreate_(actor, src) {
  var type = onbTypeOfLocation_(src.Location_ID), tpl = src.Template_ID ? get_('ONB_TEMPLATES', src.Template_ID) : onbTemplateFor_(type);
  if (!tpl) throw userError_('مفيش قالب تهيئة نشط — ضيف قالب من «التهيئة» ← «القوالب».');
  var own = onbResolveOwners_(src.Position_ID, src.Location_ID, src.vacancy);
  var pos = src.Position_ID ? get_('POSITIONS', src.Position_ID) : null;
  var items = where_('ONB_TEMPLATE_ITEMS', function (i) { return i.Template_ID === tpl.Template_ID && i.Status === 'Active'; })
    .sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); });
  var o;
  withLock_(function () {
    o = insert_('ONBOARDINGS', {
      Onboarding_ID: nextId_('ONBOARDING'), Joining_ID: src.joining ? src.joining.Joining_ID : '', Employee_ID: str_(src.Employee_ID),
      Person_ID: src.joining ? src.joining.Person_ID : '', Full_Name: src.Full_Name, Position_ID: str_(src.Position_ID),
      Org_Unit_ID: pos ? pos.Org_Unit_ID : '', Location_ID: str_(src.Location_ID), Template_ID: tpl.Template_ID, Job_Type: tpl.Job_Type,
      Start_Date: src.Start_Date, Status: 'ACTIVE', HR_Site_User_ID: own.HR_SITE, Recruiter_User_ID: own.RECRUITER,
      Supervisor_User_ID: own.SUPERVISOR, Manager_User_ID: own.MANAGER, Buddy_Name: '', Buddy_User_ID: '', Buddy_Employee_ID: '',
      IT_User_ID: own.IT, Admin_User_ID: own.ADMIN, Safety_User_ID: own.SAFETY,
      Completed_At: '', Completed_By: '', Ack_At: '', Ack_Channel: '', Ack_Note: '', Cancel_Reason: ''
    }, actor);
    var ids = nextIds_('ONB_TASK', items.length);
    insertMany_('ONB_TASKS', items.map(function (it, i) {
      return { Task_ID: ids[i], Onboarding_ID: o.Onboarding_ID, Item_ID: it.Item_ID, Phase: it.Phase, Day_Offset: it.Day_Offset, Title: it.Title_AR,
        Details: it.Details, Owner_Role: it.Owner_Role, Owner_User_ID: onbOwnerOf_(o, it.Owner_Role), Due_Date: onbDue_(src.Start_Date, it.Day_Offset),
        Needs_Ack: it.Needs_Ack, Status: 'OPEN', Done_By: '', Done_At: '', Note: '', Ack: '', Reminded_At: '', Kind: it.Kind || '' };
    }), actor);
  });
  var who = {}; onbUsersOf_(o).forEach(function (u) { if (u !== actor) who[u] = 1; });
  notify_(Object.keys(who), 'برنامج تهيئة لموظف جديد — ' + src.Full_Name,
    'أول يوم ' + src.Start_Date + '. عليك مهام في البرنامج — افتحه وشوف مواعيدها.', 'ONBOARDING', o.Onboarding_ID, true);
  return o;
}

/** Hook: the joining date was confirmed → open the program once. */
function onbOnConfirm_(ctx, j, vac) {
  if (where_('ONBOARDINGS', function (o) { return o.Joining_ID === j.Joining_ID && o.Status !== 'CANCELLED'; }).length) return null;
  var per = get_('PERSONS', j.Person_ID) || {};
  try {
    return onbCreate_(ctx.user.User_ID, { joining: j, vacancy: vac, Full_Name: per.Full_Name || '', Position_ID: vac.Position_ID, Location_ID: vac.Location_ID, Start_Date: j.Planned_Date });
  } catch (e) { console.warn('onboarding open: ' + e); return null; }
}
/** Hook: a new start date → open tasks move with it. */
function onbRedate_(actor, joiningId, start) {
  var o = where_('ONBOARDINGS', function (x) { return x.Joining_ID === joiningId && x.Status === 'ACTIVE'; })[0];
  if (!o || o.Start_Date === start) return;
  withLock_(function () {
    update_('ONBOARDINGS', o.Onboarding_ID, { Start_Date: start }, actor);
    find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID }).forEach(function (t) {
      if (t.Status === 'OPEN' && t.Day_Offset !== '') update_('ONB_TASKS', t.Task_ID, { Due_Date: onbDue_(start, t.Day_Offset) }, actor);
    });
  });
}
function onbOnJoined_(ctx, j, vac, jd, empId) {
  var o = where_('ONBOARDINGS', function (x) { return x.Joining_ID === j.Joining_ID && x.Status === 'ACTIVE'; })[0];
  if (!o) {
    var per = get_('PERSONS', j.Person_ID) || {};
    try { o = onbCreate_(ctx.user.User_ID, { joining: j, vacancy: vac, Full_Name: per.Full_Name || '', Position_ID: vac.Position_ID, Location_ID: vac.Location_ID, Start_Date: jd, Employee_ID: empId }); }
    catch (e) { console.warn('onboarding open: ' + e); return; }
  }
  if (empId) withLock_(function () { update_('ONBOARDINGS', o.Onboarding_ID, { Employee_ID: empId }, ctx.user.User_ID); custodyLink_(ctx.user.User_ID, o.Onboarding_ID, empId); });
  onbRedate_(ctx.user.User_ID, j.Joining_ID, jd);
}
function onbOnDidNotJoin_(ctx, j, reason) {
  where_('ONBOARDINGS', function (x) { return x.Joining_ID === j.Joining_ID && x.Status === 'ACTIVE'; }).forEach(function (o) {
    withLock_(function () { update_('ONBOARDINGS', o.Onboarding_ID, { Status: 'CANCELLED', Cancel_Reason: 'ماستلمش: ' + reason }, ctx.user.User_ID); });
  });
}

/** By hand: a program for an employee already in the employees list. */
function onbStart_(ctx, p) {
  var e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
  if (!e || e.Status !== 'Active') throw userError_('اختار موظف على رأس العمل.');
  if (where_('ONBOARDINGS', function (o) { return o.Employee_ID === e.Employee_ID && o.Status === 'ACTIVE'; }).length) throw userError_('الموظف ده عليه برنامج تهيئة مفتوح بالفعل.');
  var start = str_(p.Start_Date) || e.Hire_Date || today_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw userError_('اختار تاريخ أول يوم.');
  if (str_(p.Template_ID) && !get_('ONB_TEMPLATES', p.Template_ID)) throw userError_('القالب غير موجود.');
  var o = onbCreate_(ctx.user.User_ID, { Employee_ID: e.Employee_ID, Full_Name: e.Full_Name, Position_ID: e.Position_ID, Location_ID: e.Location_ID, Start_Date: start, Template_ID: str_(p.Template_ID) });
  audit_(ctx, { entityType: 'ONBOARDING', entityId: o.Onboarding_ID, action: 'CREATE', newValue: e.Employee_ID });
  return { Onboarding_ID: o.Onboarding_ID };
}

/* ---------------- reading ---------------- */

function onbProgress_(tasks) {
  var done = tasks.filter(function (t) { return t.Status !== 'OPEN'; }).length, t = today_();
  return { done: done, total: tasks.length, overdue: tasks.filter(function (x) { return x.Status === 'OPEN' && x.Due_Date < t; }).length };
}
function onbRow_(o, names, tasksBy) {
  var ts = tasksBy[o.Onboarding_ID] || [], pr = onbProgress_(ts);
  if (o.Status !== 'ACTIVE') pr.overdue = 0;
  var pos = o.Position_ID ? get_('POSITIONS', o.Position_ID) : null, job = pos ? get_('JOBS', pos.Job_Code) : null;
  var loc = o.Location_ID ? get_('LOCATIONS', o.Location_ID) : null;
  return { id: o.Onboarding_ID, name: o.Full_Name, employeeId: o.Employee_ID, title: pos ? (pos.Position_Title || (job ? job.Job_Title_AR : '')) : '',
    location: loc ? loc.Name_AR : '', type: o.Job_Type, typeName: ONB_TYPES_[o.Job_Type] || o.Job_Type, start: o.Start_Date, status: o.Status,
    done: pr.done, total: pr.total, overdue: pr.overdue, buddy: o.Buddy_Name, hr: names[o.HR_Site_User_ID] || '', manager: names[o.Manager_User_ID] || '',
    completedAt: o.Completed_At, cancelReason: o.Cancel_Reason, joined: !!o.Employee_ID };
}

/** p.tab = mine (my open tasks) | active | closed */
function onbList_(ctx, p) {
  var tab = str_(p.tab) || 'mine', me = ctx.user.User_ID, admin = onbIsAdmin_(ctx), names = userNames_();
  var tasksBy = {};
  all_('ONB_TASKS').forEach(function (t) { (tasksBy[t.Onboarding_ID] = tasksBy[t.Onboarding_ID] || []).push(t); });
  var mine = where_('ONBOARDINGS', function (o) { return admin || onbCanView_(ctx, o); });
  var byId = {}; mine.forEach(function (o) { byId[o.Onboarding_ID] = o; });
  if (tab === 'mine') {
    var rows = [];
    mine.filter(function (o) { return o.Status === 'ACTIVE'; }).forEach(function (o) {
      (tasksBy[o.Onboarding_ID] || []).forEach(function (t) {
        if (t.Status !== 'OPEN' || t.Owner_User_ID !== me) return;
        rows.push({ taskId: t.Task_ID, onb: o.Onboarding_ID, name: o.Full_Name, title: t.Title, phase: t.Phase, phaseName: ONB_PHASES_[t.Phase] || t.Phase,
          due: t.Due_Date, needsAck: t.Needs_Ack === 'Y', role: ONB_OWNERS_[t.Owner_Role] || t.Owner_Role, start: o.Start_Date });
      });
    });
    rows.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    return { tab: tab, tasks: rows, admin: admin };
  }
  var list = mine.filter(function (o) { return tab === 'closed' ? o.Status !== 'ACTIVE' : o.Status === 'ACTIVE'; })
    .map(function (o) { return onbRow_(o, names, tasksBy); })
    .sort(function (a, b) { return tab === 'closed' ? (a.start < b.start ? 1 : -1) : (a.start < b.start ? -1 : 1); });
  return { tab: tab, rows: list, admin: admin };
}

function onbDetail_(ctx, p) {
  var o = onbGet_(p.Onboarding_ID);
  if (!onbCanView_(ctx, o)) throw userError_('مالكش صلاحية على البرنامج ده.');
  var names = userNames_(), admin = onbIsAdmin_(ctx), me = ctx.user.User_ID, today = today_();
  var tasks = find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID }).sort(function (a, b) {
    return ONB_PHASE_ORDER_.indexOf(a.Phase) - ONB_PHASE_ORDER_.indexOf(b.Phase) || (a.Due_Date < b.Due_Date ? -1 : a.Due_Date > b.Due_Date ? 1 : 0) || (a.Task_ID < b.Task_ID ? -1 : 1);
  }).map(function (t) {
    return { id: t.Task_ID, phase: t.Phase, title: t.Title, details: t.Details, role: t.Owner_Role, roleName: ONB_OWNERS_[t.Owner_Role] || t.Owner_Role,
      owner: names[t.Owner_User_ID] || '', ownerId: t.Owner_User_ID, due: t.Due_Date, status: t.Status, needsAck: t.Needs_Ack === 'Y', ack: t.Ack,
      doneBy: names[t.Done_By] || '', doneAt: t.Done_At, note: t.Note, late: o.Status === 'ACTIVE' && t.Status === 'OPEN' && t.Due_Date < today,
      canAct: o.Status === 'ACTIVE' && (admin || t.Owner_User_ID === me) && !ctx.readOnly, kind: t.Kind || '' };
  });
  var tb = {}; tb[o.Onboarding_ID] = find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID });
  var row = onbRow_(o, names, tb);
  row.owners = {
    HR_SITE: { id: o.HR_Site_User_ID, name: names[o.HR_Site_User_ID] || '' }, RECRUITER: { id: o.Recruiter_User_ID, name: names[o.Recruiter_User_ID] || '' },
    SUPERVISOR: { id: o.Supervisor_User_ID, name: names[o.Supervisor_User_ID] || '' }, MANAGER: { id: o.Manager_User_ID, name: names[o.Manager_User_ID] || '' },
    BUDDY: { id: o.Buddy_User_ID, name: o.Buddy_Name || names[o.Buddy_User_ID] || '', employeeId: o.Buddy_Employee_ID },
    IT: { id: o.IT_User_ID, name: names[o.IT_User_ID] || '' }, ADMIN: { id: o.Admin_User_ID, name: names[o.Admin_User_ID] || '' },
    SAFETY: { id: o.Safety_User_ID, name: names[o.Safety_User_ID] || '' }
  };
  row.custody = custodyRows_(o.Employee_ID, o.Onboarding_ID, names);
  row.canCustody = custodyCan_(ctx, o);
  row.ack = { at: o.Ack_At, channel: o.Ack_Channel, note: o.Ack_Note };
  row.completedBy = names[o.Completed_By] || '';
  row.applicationId = o.Joining_ID ? (get_('JOININGS', o.Joining_ID) || {}).Application_ID || '' : '';
  var tpl = get_('ONB_TEMPLATES', o.Template_ID);
  row.templateName = tpl ? tpl.Name_AR : '';
  row.gift = { item: o.Gift_Item, at: o.Gift_At, by: names[o.Gift_By] || '', signed: o.Gift_Signed === 'Y', note: o.Gift_Note };
  row.gifts = welcomeGifts_();
  row.insurance = insOf_(ctx, o.Joining_ID);
  row.att = attView_(attFor_(o.Employee_ID, o.Onboarding_ID), names);     // v0.44.0 (CHG-91)
  row.attLic = attLicenses_();
  return { onb: row, tasks: tasks, phases: ONB_PHASES_, roles: ONB_OWNERS_, admin: admin && !ctx.readOnly,
    canManage: o.Status === 'ACTIVE' && !ctx.readOnly && (admin || [o.Manager_User_ID, o.Supervisor_User_ID].indexOf(me) >= 0) };
}

/* ---------------- acting ---------------- */

/** p = { Task_ID, action: DONE | SKIP | REOPEN, note, ack: 'Y' } */
function onbTask_(ctx, p) {
  var t = get_('ONB_TASKS', str_(p.Task_ID));
  if (!t) throw userError_('المهمة غير موجودة.');
  var o = onbGet_(t.Onboarding_ID), me = ctx.user.User_ID, admin = onbIsAdmin_(ctx);
  if (o.Status !== 'ACTIVE') throw userError_('البرنامج ده اتقفل.');
  if (!admin && t.Owner_User_ID !== me) throw userError_('المهمة دي مش عليك — صاحبها ' + (userNames_()[t.Owner_User_ID] || 'غير محدد') + '.');
  var act = str_(p.action), note = str_(p.note).slice(0, 400), patch;
  if (act === 'DONE') {
    if (t.Status !== 'OPEN') throw userError_('المهمة اتقفلت بالفعل.');
    if (t.Kind === 'BIO') throw userError_('سجّل البصمة من زرار «تسجيل البصمة» — المهمة بتتقفل لوحدها لما الوجه والأصابع يتسجلوا.');
    if (t.Needs_Ack === 'Y' && str_(p.ack) !== 'Y') throw userError_('المهمة دي محتاجة إقرار الموظف — علّم إنه أقر (وقّع أو أكّد قدامك).');
    patch = { Status: 'DONE', Done_By: me, Done_At: nowIso_(), Note: note, Ack: t.Needs_Ack === 'Y' ? 'Y' : '' };
  } else if (act === 'SKIP') {
    if (t.Status !== 'OPEN') throw userError_('المهمة اتقفلت بالفعل.');
    if (note.length < 3) throw userError_('اكتب سبب إن المهمة مش هتتعمل.');
    patch = { Status: 'SKIPPED', Done_By: me, Done_At: nowIso_(), Note: note };
  } else if (act === 'REOPEN') {
    if (t.Status === 'OPEN') throw userError_('المهمة مفتوحة أصلاً.');
    if (!admin && t.Done_By !== me) throw userError_('اللي قفلها أو فريق الموارد البشرية بس يفتحها تاني.');
    patch = { Status: 'OPEN', Done_By: '', Done_At: '', Note: note || t.Note, Ack: '' };
  } else throw userError_('عملية غير معروفة.');
  withLock_(function () { update_('ONB_TASKS', t.Task_ID, patch, me); });
  event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'TASK_' + act, t.Title + (note ? ' — ' + note : ''));
  return { ok: true };
}

/** A task added by HR or the manager for this employee only. */
function onbTaskAdd_(ctx, p) {
  var o = onbGet_(p.Onboarding_ID), d = onbDetail_(ctx, p);
  if (!d.canManage) throw userError_('إضافة المهام لفريق الموارد البشرية والمدير والمشرف.');
  var title = str_(p.Title).slice(0, 160), phase = str_(p.Phase), role = str_(p.Owner_Role), due = str_(p.Due_Date);
  if (title.length < 3) throw userError_('اكتب المهمة.');
  if (!ONB_PHASES_[phase]) throw userError_('اختار المرحلة.');
  if (!ONB_OWNERS_[role]) throw userError_('اختار مسؤول المهمة.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw userError_('اختار تاريخ المهمة.');
  var t;
  withLock_(function () {
    t = insert_('ONB_TASKS', { Task_ID: nextId_('ONB_TASK'), Onboarding_ID: o.Onboarding_ID, Item_ID: '', Phase: phase, Day_Offset: '', Title: title,
      Details: str_(p.Details).slice(0, 400), Owner_Role: role, Owner_User_ID: onbOwnerOf_(o, role), Due_Date: due, Needs_Ack: str_(p.Needs_Ack) === 'Y' ? 'Y' : 'N',
      Status: 'OPEN', Done_By: '', Done_At: '', Note: '', Ack: '', Reminded_At: '' }, ctx.user.User_ID);
  });
  if (t.Owner_User_ID && t.Owner_User_ID !== ctx.user.User_ID) notify_([t.Owner_User_ID], 'مهمة تهيئة جديدة عليك — ' + o.Full_Name, title + ' · ' + due, 'ONBOARDING', o.Onboarding_ID);
  event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'TASK_ADDED', title);
  return { Task_ID: t.Task_ID };
}

/** Change who does what, and set the buddy. Open tasks of a changed role move to the new person. */
function onbOwners_(ctx, p) {
  var o = onbGet_(p.Onboarding_ID), d = onbDetail_(ctx, p);
  if (!d.canManage) throw userError_('تغيير المسؤولين لفريق الموارد البشرية والمدير والمشرف.');
  var patch = {}, cols = { HR_SITE: 'HR_Site_User_ID', RECRUITER: 'Recruiter_User_ID', SUPERVISOR: 'Supervisor_User_ID', MANAGER: 'Manager_User_ID',
    IT: 'IT_User_ID', ADMIN: 'Admin_User_ID', SAFETY: 'Safety_User_ID' };
  var owners = p.owners || {};
  Object.keys(cols).forEach(function (r) {
    if (owners[r] === undefined) return;
    var u = str_(owners[r]);
    if (u && !(get_('USERS', u) || {}).Status) throw userError_('المستخدم غير موجود.');
    if (u !== str_(o[cols[r]])) patch[cols[r]] = u;
  });
  if (p.buddy) {
    var bn = str_(p.buddy.name).slice(0, 80), bu = str_(p.buddy.userId), be = str_(p.buddy.employeeId);
    if (bu && !get_('USERS', bu)) throw userError_('المستخدم غير موجود.');
    if (bn !== o.Buddy_Name) patch.Buddy_Name = bn;
    if (bu !== o.Buddy_User_ID) patch.Buddy_User_ID = bu;
    if (be !== o.Buddy_Employee_ID) patch.Buddy_Employee_ID = be;
  }
  if (!Object.keys(patch).length) return { ok: true, changed: 0 };
  var after, moved = {};
  withLock_(function () {
    after = update_('ONBOARDINGS', o.Onboarding_ID, patch, ctx.user.User_ID).after;
    find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID }).forEach(function (t) {
      if (t.Status !== 'OPEN') return;
      var nu = onbOwnerOf_(after, t.Owner_Role);
      if (nu !== t.Owner_User_ID) { update_('ONB_TASKS', t.Task_ID, { Owner_User_ID: nu }, ctx.user.User_ID); if (nu) moved[nu] = (moved[nu] || 0) + 1; }
    });
  });
  auditDiff_(ctx, 'ONBOARDING', o.Onboarding_ID, o, after, '');
  Object.keys(moved).filter(function (u) { return u !== ctx.user.User_ID; }).forEach(function (u) {
    notify_([u], 'عليك مهام تهيئة — ' + o.Full_Name, moved[u] + ' مهمة اتحولتلك في برنامج التهيئة.', 'ONBOARDING', o.Onboarding_ID);
  });
  return { ok: true, changed: Object.keys(patch).length };
}

/** Close the program: nothing open (or HR with a reason), and the employee's acknowledgement of the whole program. */
function onbComplete_(ctx, p) {
  var o = onbGet_(p.Onboarding_ID);
  if (!onbIsAdmin_(ctx) && o.Manager_User_ID !== ctx.user.User_ID) throw userError_('قفل البرنامج لفريق الموارد البشرية أو مدير الوحدة.');
  if (o.Status !== 'ACTIVE') throw userError_('البرنامج اتقفل بالفعل.');
  if (!o.Employee_ID && !str_(p.reason)) throw userError_('الموظف لسه ماستلمش — سجّل الاستلام الأول.');
  var open = find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID, Status: 'OPEN' }).length;
  if (open) {
    if (!onbIsAdmin_(ctx)) throw userError_('لسه في ' + open + ' مهمة مفتوحة — اقفلها أو علّمها «مش هتتعمل» بسبب.');
    if (str_(p.reason).length < 5) throw userError_('لسه في ' + open + ' مهمة مفتوحة — اكتب سبب قفل البرنامج قبلها.');
  }
  var ch = str_(p.ackChannel);
  if (['PAPER', 'IN_PERSON', 'NONE'].indexOf(ch) < 0) throw userError_('سجّل إقرار الموظف بالبرنامج: وقّع ورقي، أو أكّد قدامك، أو مفيش إقرار (بسبب).');
  if (ch === 'NONE' && str_(p.ackNote).length < 3) throw userError_('اكتب سبب عدم وجود إقرار من الموظف.');
  withLock_(function () {
    update_('ONBOARDINGS', o.Onboarding_ID, { Status: 'COMPLETED', Completed_At: nowIso_(), Completed_By: ctx.user.User_ID,
      Ack_At: ch === 'NONE' ? '' : nowIso_(), Ack_Channel: ch, Ack_Note: str_(p.ackNote).slice(0, 300) + (open ? ' | قفل بمهام مفتوحة: ' + str_(p.reason).slice(0, 200) : '') }, ctx.user.User_ID);
  });
  event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'COMPLETED', ch + (open ? ' — ' + open + ' open: ' + str_(p.reason) : ''));
  return { ok: true };
}

function onbCancel_(ctx, p) {
  var o = onbGet_(p.Onboarding_ID), reason = str_(p.reason);
  if (o.Status !== 'ACTIVE') throw userError_('البرنامج اتقفل بالفعل.');
  if (reason.length < 3) throw userError_('اكتب سبب الإلغاء.');
  withLock_(function () { update_('ONBOARDINGS', o.Onboarding_ID, { Status: 'CANCELLED', Cancel_Reason: reason.slice(0, 300) }, ctx.user.User_ID); });
  event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'CANCELLED', reason);
  return { ok: true };
}

/* ---------------- templates ---------------- */

function onbTemplates_(ctx) {
  var items = {};
  all_('ONB_TEMPLATE_ITEMS').forEach(function (i) { (items[i.Template_ID] = items[i.Template_ID] || []).push(i); });
  return {
    rows: all_('ONB_TEMPLATES').map(function (t) {
      t.items = (items[t.Template_ID] || []).sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); });
      t.typeName = ONB_TYPES_[t.Job_Type] || t.Job_Type;
      return t;
    }),
    phases: ONB_PHASES_, roles: ONB_OWNERS_, types: ONB_TYPES_, canEdit: hasAnyRole_(ctx, onbTemplateRoles_()) && !ctx.readOnly
  };
}
/** p = { Item_ID?, Template_ID, Phase, Day_Offset, Owner_Role, Title_AR, Details, Needs_Ack, Status } */
function onbItemSave_(ctx, p) {
  var tpl = get_('ONB_TEMPLATES', str_(p.Template_ID));
  if (!tpl) throw userError_('القالب غير موجود.');
  var title = str_(p.Title_AR).slice(0, 160), phase = str_(p.Phase), role = str_(p.Owner_Role), off = str_(p.Day_Offset);
  if (title.length < 3) throw userError_('اكتب النشاط.');
  if (!ONB_PHASES_[phase]) throw userError_('اختار المرحلة.');
  if (!ONB_OWNERS_[role]) throw userError_('اختار المسؤول.');
  if (!/^-?\d{1,3}$/.test(off)) throw userError_('اليوم لازم يكون رقم (سالب قبل أول يوم، 0 = أول يوم).');
  var n = Number(off);
  var range = { BEFORE: [-30, -1], DAY1: [0, 0], WEEK1: [1, 7], MONTH1: [8, 60] }[phase];
  if (n < range[0] || n > range[1]) throw userError_('اليوم مش مناسب للمرحلة: «' + ONB_PHASES_[phase] + '» من ' + range[0] + ' لـ ' + range[1] + '.');
  var status = str_(p.Status) || 'Active';
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');
  var f = { Template_ID: tpl.Template_ID, Phase: phase, Day_Offset: off, Owner_Role: role, Title_AR: title, Details: str_(p.Details).slice(0, 400),
    Needs_Ack: str_(p.Needs_Ack) === 'Y' ? 'Y' : 'N', Status: status };
  return withLock_(function () {
    if (str_(p.Item_ID)) {
      var res = update_('ONB_TEMPLATE_ITEMS', p.Item_ID, f, ctx.user.User_ID);
      auditDiff_(ctx, 'ONB_ITEM', p.Item_ID, res.before, res.after, '');
      return res.after;
    }
    var last = where_('ONB_TEMPLATE_ITEMS', function (i) { return i.Template_ID === tpl.Template_ID; }).reduce(function (m, i) { return Math.max(m, num_(i.Sort_Order, 0)); }, 0);
    f.Item_ID = nextId_('ONB_ITEM'); f.Sort_Order = String(last + 10);
    var c = insert_('ONB_TEMPLATE_ITEMS', f, ctx.user.User_ID);
    audit_(ctx, { entityType: 'ONB_ITEM', entityId: c.Item_ID, action: 'CREATE', newValue: title });
    return c;
  });
}
/** p = { Template_ID?, Name_AR, Job_Type, Status, copyFrom? } */
function onbTemplateSave_(ctx, p) {
  var name = str_(p.Name_AR).slice(0, 100), type = str_(p.Job_Type), status = str_(p.Status) || 'Active';
  if (name.length < 3) throw userError_('اكتب اسم القالب.');
  if (!ONB_TYPES_[type]) throw userError_('اختار نوع الشغل.');
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');
  return withLock_(function () {
    if (str_(p.Template_ID)) {
      var res = update_('ONB_TEMPLATES', p.Template_ID, { Name_AR: name, Job_Type: type, Status: status }, ctx.user.User_ID);
      auditDiff_(ctx, 'ONB_TEMPLATE', p.Template_ID, res.before, res.after, '');
      return res.after;
    }
    var t = insert_('ONB_TEMPLATES', { Template_ID: nextId_('ONB_TEMPLATE'), Name_AR: name, Job_Type: type, Status: status, Notes: '' }, ctx.user.User_ID);
    var src = str_(p.copyFrom) ? where_('ONB_TEMPLATE_ITEMS', function (i) { return i.Template_ID === str_(p.copyFrom); }) : [];
    if (src.length) {
      var ids = nextIds_('ONB_ITEM', src.length);
      insertMany_('ONB_TEMPLATE_ITEMS', src.map(function (i, k) {
        return { Item_ID: ids[k], Template_ID: t.Template_ID, Phase: i.Phase, Day_Offset: i.Day_Offset, Owner_Role: i.Owner_Role, Title_AR: i.Title_AR,
          Details: i.Details, Needs_Ack: i.Needs_Ack, Sort_Order: i.Sort_Order, Status: i.Status };
      }), ctx.user.User_ID);
    }
    audit_(ctx, { entityType: 'ONB_TEMPLATE', entityId: t.Template_ID, action: 'CREATE', newValue: name });
    return t;
  });
}

/* ---------------- counters & daily ---------------- */

function onbTodo_(ctx) {
  var me = ctx.user.User_ID, t = today_(), soon = addDaysYmd_(t, 2), out = { due: 0, overdue: 0, open: 0 };
  var active = {}; where_('ONBOARDINGS', function (o) { return o.Status === 'ACTIVE'; }).forEach(function (o) { active[o.Onboarding_ID] = 1; });
  where_('ONB_TASKS', function (x) { return x.Status === 'OPEN' && x.Owner_User_ID === me && active[x.Onboarding_ID]; }).forEach(function (x) {
    out.open++;
    if (x.Due_Date < t) out.overdue++; else if (x.Due_Date <= soon) out.due++;
  });
  return out;
}

/** Daily: one reminder per late task to its owner (grouped per person). */
function onbDaily_() {
  var t = today_(), per = {}, names = {}, n = 0;
  var active = {}; where_('ONBOARDINGS', function (o) { return o.Status === 'ACTIVE'; }).forEach(function (o) { active[o.Onboarding_ID] = o; });
  var late = where_('ONB_TASKS', function (x) { return x.Status === 'OPEN' && x.Due_Date < t && !x.Reminded_At && x.Owner_User_ID && active[x.Onboarding_ID]; });
  if (!late.length) return { reminded: 0 };
  withLock_(function () { late.forEach(function (x) { update_('ONB_TASKS', x.Task_ID, { Reminded_At: nowIso_() }, 'SYSTEM'); }); });
  late.forEach(function (x) { (per[x.Owner_User_ID] = per[x.Owner_User_ID] || []).push(x); });
  Object.keys(per).forEach(function (u) {
    var xs = per[u], o = active[xs[0].Onboarding_ID];
    notify_([u], 'مهام تهيئة متأخرة عليك (' + xs.length + ')', xs.slice(0, 3).map(function (x) { return active[x.Onboarding_ID].Full_Name + ': ' + x.Title; }).join(' · '), 'ONBOARDING', xs.length === 1 ? o.Onboarding_ID : '', false);
    n += xs.length;
  });
  return { reminded: n };
}

/* ---------------- employee e-file ---------------- */

/** What the employee file adds to emp.get: hiring, documents, onboarding, pay (pay roles only). */
function empFile_(ctx, e) {
  var j = where_('JOININGS', function (x) { return x.Employee_ID === e.Employee_ID && x.Status === 'JOINED'; })[0] || null;
  var out = { joining: null, docs: [], onboarding: null, offer: null };
  if (j) {
    var v = get_('VACANCIES', j.Vacancy_ID) || {};
    out.joining = { id: j.Joining_ID, applicationId: j.Application_ID, joined: j.Joined_Date, planned: j.Planned_Date, vacancy: j.Vacancy_ID, receipt: j.Receipt_ID,
      noInsurance: j.No_Insurance === 'Y' };
    var canDocs = hasAnyRole_(ctx, candWorkRoles_());
    out.docs = canDocs ? find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID }).map(function (d) {
      var files = []; try { files = JSON.parse(d.Files_JSON || '[]'); } catch (x) {}
      return { id: d.Doc_ID, name: d.Name, status: d.Status, required: d.Required === 'Y', physical: d.Physical, expiry: d.Expiry_Date || '', files: files.length };
    }) : [];
    out.docsHidden = !canDocs;
    if (hasAnyRole_(ctx, payViewRoles_())) {
      var of = j.Offer_ID ? get_('OFFERS', j.Offer_ID) : null;
      if (of) out.offer = { no: of.Offer_No, version: of.Version, grade: of.Grade_Code, package: of.Final_Accepted || of.Approved_Package || of.Fixed_Package, contract: of.Contract_Basis || '' };
    }
  }
  var o = where_('ONBOARDINGS', function (x) { return x.Employee_ID === e.Employee_ID || (j && x.Joining_ID === j.Joining_ID); })
    .sort(function (a, b) { return a.Onboarding_ID < b.Onboarding_ID ? 1 : -1; })[0];
  if (o) {
    var pr = onbProgress_(find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID }));
    if (o.Status !== 'ACTIVE') pr.overdue = 0;
    out.onboarding = { id: o.Onboarding_ID, status: o.Status, start: o.Start_Date, done: pr.done, total: pr.total, overdue: pr.overdue, buddy: o.Buddy_Name };
  }
  out.canStartOnb = !o && e.Status === 'Active' && onbIsAdmin_(ctx) && !ctx.readOnly;
  out.custody = custodyRows_(e.Employee_ID, '', userNames_());
  out.canCustody = custodyCan_(ctx, o || null) && e.Status === 'Active';
  if (j) {
    out.insurance = insOf_(ctx, j.Joining_ID);
    if (hasAnyRole_(ctx, nhvRoles_())) out.voice = find_('NHV_SURVEYS', { Joining_ID: j.Joining_ID }).map(function (s) { return { day: num_(s.Round_Day, 0), status: s.Status, avg: s.Avg_Score, min: s.Min_Score }; });
  }
  return out;
}


/* ---------------- v0.41.0 (CHG-85): custody & PPE log ---------------- */

/** HR / onboarding admins, the IT / admin / safety people, and the program's own owners. */
function custodyCan_(ctx, o) {
  if (ctx.readOnly) return false;
  if (onbIsAdmin_(ctx)) return true;
  var me = ctx.user.User_ID;
  if (onbDeptUsers_().indexOf(me) >= 0) return true;
  return !!(o && onbUsersOf_(o).indexOf(me) >= 0);
}
function custodyRows_(empId, onbId, names) {
  return where_('ONB_CUSTODY', function (c) { return (empId && c.Employee_ID === empId) || (onbId && c.Onboarding_ID === onbId); })
    .sort(function (a, b) { return a.Custody_ID < b.Custody_ID ? -1 : 1; }).map(function (c) {
      return { id: c.Custody_ID, kind: c.Kind, kindName: CUSTODY_KINDS_[c.Kind] || c.Kind, item: c.Item, serial: c.Serial, qty: c.Qty, issuedOn: c.Issued_On,
        issuedBy: names[c.Issued_By] || '', signed: c.Signed === 'Y', status: c.Status, statusName: CUSTODY_ST_[c.Status] || c.Status,
        returnedOn: c.Returned_On, returnedBy: names[c.Returned_By] || '', note: c.Return_Note };
    });
}
/**
 * p = { action: ISSUE | RETURN | LOST, Onboarding_ID | Employee_ID, Custody_ID, Kind, Item, Serial, Qty, Signed, Issued_On, note }
 * The item is recorded on the employee (or on the program before he has a code; linked when he joins).
 */
function custodyAction_(ctx, p) {
  var act = str_(p.action), me = ctx.user.User_ID, row;
  if (act === 'ISSUE') {
    var o = str_(p.Onboarding_ID) ? onbGet_(p.Onboarding_ID) : null, e = null;
    if (!o) { e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) }); if (!e || e.Status !== 'Active') throw userError_('اختار الموظف.'); }
    if (!custodyCan_(ctx, o)) throw userError_('سجل العهدة للموارد البشرية وتكنولوجيا المعلومات والشؤون الإدارية والسلامة.');
    var kind = str_(p.Kind), item = str_(p.Item).slice(0, 120), qty = str_(p.Qty) || '1', on = str_(p.Issued_On) || today_();
    if (!CUSTODY_KINDS_[kind]) throw userError_('اختار النوع: عهدة أو مهمات وقاية.');
    if (item.length < 2) throw userError_('اكتب الصنف.');
    if (!/^\d{1,3}$/.test(qty) || Number(qty) < 1) throw userError_('العدد رقم من 1 لـ 999.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > today_()) throw userError_('تاريخ التسليم غلط.');
    withLock_(function () {
      row = insert_('ONB_CUSTODY', { Custody_ID: nextId_('ONB_CUSTODY'), Employee_ID: o ? str_(o.Employee_ID) : e.Employee_ID, Onboarding_ID: o ? o.Onboarding_ID : '',
        Full_Name: o ? o.Full_Name : e.Full_Name, Kind: kind, Item: item, Serial: str_(p.Serial).slice(0, 60), Qty: qty, Issued_On: on, Issued_By: me,
        Signed: str_(p.Signed) === 'Y' ? 'Y' : '', Status: 'ISSUED', Returned_On: '', Returned_By: '', Return_Note: '' }, me);
    });
    audit_(ctx, { entityType: 'CUSTODY', entityId: row.Custody_ID, action: 'ISSUE', newValue: kind + ' ' + item + ' × ' + qty });
    return { ok: true, id: row.Custody_ID };
  }
  if (act === 'RETURN' || act === 'LOST') {
    var c = get_('ONB_CUSTODY', str_(p.Custody_ID));
    if (!c || c.Status !== 'ISSUED') throw userError_('الصنف غير موجود أو اتقفل.');
    var oo = c.Onboarding_ID ? get_('ONBOARDINGS', c.Onboarding_ID) : null;
    if (!custodyCan_(ctx, oo)) throw userError_('سجل العهدة للموارد البشرية وتكنولوجيا المعلومات والشؤون الإدارية والسلامة.');
    if (act === 'LOST' && str_(p.note).length < 3) throw userError_('اكتب اللي حصل.');
    withLock_(function () { update_('ONB_CUSTODY', c.Custody_ID, { Status: act === 'RETURN' ? 'RETURNED' : 'LOST', Returned_On: today_(), Returned_By: me, Return_Note: str_(p.note).slice(0, 200) }, me); });
    audit_(ctx, { entityType: 'CUSTODY', entityId: c.Custody_ID, action: act, newValue: c.Item, reason: str_(p.note) });
    return { ok: true };
  }
  throw userError_('عملية غير معروفة.');
}
/** Hook: the new hire joined — items given before he had a code move onto his code. */
function custodyLink_(actorId, onbId, empId) {
  where_('ONB_CUSTODY', function (c) { return c.Onboarding_ID === onbId && !c.Employee_ID; }).forEach(function (c) { update_('ONB_CUSTODY', c.Custody_ID, { Employee_ID: empId }, actorId); });
}
/** End of service: the open items, for the exit notice. */
function custodyOpen_(empId) { return where_('ONB_CUSTODY', function (c) { return c.Employee_ID === empId && c.Status === 'ISSUED'; }); }

/* ---------------- v0.41.0 (CHG-85): arriving today and tomorrow ---------------- */

/** Who starts today or on the next working day, and what is not ready yet (date, documents, tasks before day one, custody). */
function onbArrivals_(ctx) {
  var me = ctx.user.User_ID, admin = onbIsAdmin_(ctx), dept = onbDeptUsers_().indexOf(me) >= 0, scope = admin || dept ? null : managedScope_(ctx.user);
  if (scope && !scope.length) throw userError_('الشاشة دي للموارد البشرية والتوظيف وتكنولوجيا المعلومات والشؤون الإدارية والسلامة ومديرين الوحدات.');
  var day = today_(), tmr = nextWorkDay_(), names = userNames_(), rows = [];
  where_('JOININGS', function (j) { return j.Status === 'PENDING' && j.Planned_Date >= day && j.Planned_Date <= tmr; }).forEach(function (j) {
    var v = get_('VACANCIES', j.Vacancy_ID) || {}, pos = get_('POSITIONS', v.Position_ID) || {};
    if (scope && scope.indexOf(pos.Org_Unit_ID) < 0) return;
    var per = get_('PERSONS', j.Person_ID) || {}, S = docSummary_(find_('CANDIDATE_DOCS', { Joining_ID: j.Joining_ID }), day);
    var o = where_('ONBOARDINGS', function (x) { return x.Joining_ID === j.Joining_ID && x.Status === 'ACTIVE'; })[0];
    var open = o ? find_('ONB_TASKS', { Onboarding_ID: o.Onboarding_ID, Status: 'OPEN' }).filter(function (t) { return t.Phase === 'BEFORE' || t.Phase === 'DAY1'; }) : [];
    rows.push({ joiningId: j.Joining_ID, applicationId: j.Application_ID, onb: o ? o.Onboarding_ID : '', name: per.Full_Name, title: v.Vacancy_ID ? vacTitle_(v).ar : '',
      location: locName_(v.Location_ID), date: j.Planned_Date, today: j.Planned_Date === day, confirmed: !!j.Date_Confirmed_At, cleared: S.cleared, docsOpen: S.open,
      open: open.map(function (t) { return { title: t.Title, role: ONB_OWNERS_[t.Owner_Role] || t.Owner_Role, owner: names[t.Owner_User_ID] || '', mine: t.Owner_User_ID === me, late: t.Due_Date < day }; }),
      custody: o ? custodyRows_('', o.Onboarding_ID, names).length : 0 });
  });
  rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return { day: day, next: tmr, rows: rows };
}


/* ---------------- v0.44.0 (CHG-91): attendance enrolment on ZKBioTime ---------------- */

var ONB_BIO_OLD_ = 'تسليم الكارنيه وتسجيل البصمة';
var ONB_BIO_TITLE_ = 'تسليم الكارنيه وتسجيل البصمة على ZKBioTime (وجه + أصابع)';
var ONB_BIO_DETAILS_ = 'سجّل الوجه والأصابع على ZKBioTime، وحدد نوع التسجيل: ماكينات بس أو موبايل + ماكينات.';
var ATT_TYPES_ = { MACHINES: 'ماكينات بس', MOBILE: 'موبايل + ماكينات' };
var ATT_ST_ = { ACTIVE: 'مسجّل', STOP_DUE: 'مطلوب إيقافه على ZKBioTime', STOPPED: 'اتوقف' };

/** The enrolment of an employee (or of a new hire's program before he has an employee code); the latest wins. */
function attFor_(empId, onbId) {
  var rows = where_('ATT_ENROLL', function (r) { return (empId && r.Employee_ID === empId) || (onbId && r.Onboarding_ID === onbId); });
  if (empId && !rows.length) find_('ONBOARDINGS', { Employee_ID: empId }).forEach(function (o) { rows = rows.concat(find_('ATT_ENROLL', { Onboarding_ID: o.Onboarding_ID })); });
  rows.sort(function (a, b) { return a.Enroll_ID < b.Enroll_ID ? 1 : -1; });
  return rows[0] || null;
}
function attView_(r, names) {
  if (!r) return null;
  names = names || userNames_();
  return { id: r.Enroll_ID, face: r.Face === 'Y', finger: r.Finger === 'Y', type: r.Punch_Type, typeName: ATT_TYPES_[r.Punch_Type] || '', code: r.Bio_Code, note: r.Note,
    status: r.Status, statusName: ATT_ST_[r.Status] || r.Status, by: names[r.Recorded_By] || '', at: r.Recorded_At, stopDueAt: r.Stop_Due_At,
    stoppedBy: names[r.Stopped_By] || '', stoppedAt: r.Stopped_At };
}
/** Mobile licences in use: every mobile enrolment not stopped on ZKBioTime yet. */
function attLicenses_(exceptId) {
  var used = where_('ATT_ENROLL', function (r) { return r.Punch_Type === 'MOBILE' && r.Status !== 'STOPPED' && r.Enroll_ID !== exceptId; }).length;
  return { limit: num_(cfg_('ATT_MOBILE_LICENSES', '150'), 150), used: used };
}
function attIsHr_(ctx) { return hasAnyRole_(ctx, HR_ALL_ROLES) && !ctx.readOnly; }

/**
 * Record (or correct) an enrolment. p = { Task_ID | Employee_ID, face, finger, type: MACHINES|MOBILE, code, note }.
 * From the onboarding task: HR or the task's owner (the site HR specialist); the task is closed with it.
 * From the employee file (existing employees): HR roles.
 */
function attSave_(ctx, p) {
  var me = ctx.user.User_ID, task = str_(p.Task_ID) ? get_('ONB_TASKS', str_(p.Task_ID)) : null, o = null, e = null;
  if (ctx.readOnly) throw userError_('حسابك للعرض بس.');
  if (task) {
    if (task.Kind !== 'BIO') throw userError_('المهمة دي مش مهمة تسجيل البصمة.');
    o = onbGet_(task.Onboarding_ID);
    if (o.Status !== 'ACTIVE') throw userError_('البرنامج ده اتقفل.');
    if (!attIsHr_(ctx) && task.Owner_User_ID !== me) throw userError_('تسجيل البصمة للموارد البشرية أو صاحب المهمة.');
    if (o.Employee_ID) e = findOne_('EMPLOYEES', { Employee_ID: o.Employee_ID });
  } else {
    if (!attIsHr_(ctx)) throw userError_('تسجيل البصمة للموارد البشرية بس.');
    e = findOne_('EMPLOYEES', { Employee_ID: str_(p.Employee_ID) });
    if (!e) throw userError_('الموظف غير موجود.');
    if (e.Status !== 'Active') throw userError_('الموظف ده خرج — مفيش تسجيل بصمة له.');
  }
  var face = str_(p.face) === 'Y', finger = str_(p.finger) === 'Y', type = str_(p.type), note = str_(p.note).slice(0, 300), code = str_(p.code).slice(0, 40);
  if (!ATT_TYPES_[type]) throw userError_('اختار نوع التسجيل: ماكينات بس أو موبايل + ماكينات.');
  if ((!face || !finger) && note.length < 10) throw userError_('الوجه والأصابع الاتنين لازم يتسجلوا — ولو واحد منهم مش ممكن، اكتب السبب.');
  var cur = attFor_(e ? e.Employee_ID : '', o ? o.Onboarding_ID : '');
  if (cur && cur.Status === 'STOPPED') cur = null;
  if (cur && !task && !hasAnyRole_(ctx, HR_ALL_ROLES)) throw userError_('تعديل التسجيل للموارد البشرية بس.');
  var r;
  withLock_(function () {
    if (type === 'MOBILE') {
      var L = attLicenses_(cur ? cur.Enroll_ID : '');
      if (L.used >= L.limit) throw userError_('ليسنسات الموبايل خلصت (' + L.used + ' من ' + L.limit + ') — اختار «ماكينات بس»، أو أوقف ليسنس حد خرج.');
    }
    var fields = { Employee_ID: e ? e.Employee_ID : '', Onboarding_ID: o ? o.Onboarding_ID : (cur ? cur.Onboarding_ID : ''), Person_ID: o ? o.Person_ID : (cur ? cur.Person_ID : ''),
      Full_Name: e ? e.Full_Name : o.Full_Name, Face: face ? 'Y' : 'N', Finger: finger ? 'Y' : 'N', Punch_Type: type, Bio_Code: code, Note: note, Status: 'ACTIVE',
      Recorded_By: me, Recorded_At: nowIso_(), Stop_Due_At: '', Stopped_By: '', Stopped_At: '' };
    if (cur) { r = update_('ATT_ENROLL', cur.Enroll_ID, fields, me).after; }
    else { fields.Enroll_ID = nextId_('ATT_ENROLL'); r = insert_('ATT_ENROLL', fields, me); }
    if (task && task.Status === 'OPEN') update_('ONB_TASKS', task.Task_ID, { Status: 'DONE', Done_By: me, Done_At: nowIso_(),
      Note: (face ? 'وجه ✓ ' : 'وجه ✗ ') + (finger ? 'أصابع ✓' : 'أصابع ✗') + ' · ' + ATT_TYPES_[type] + (note ? ' — ' + note : '') }, me);
  });
  audit_(ctx, { entityType: 'ATT_ENROLL', entityId: r.Enroll_ID, action: cur ? 'UPDATE' : 'CREATE', newValue: (e ? e.Employee_ID : o.Onboarding_ID) + ' · ' + type + ' · face ' + r.Face + ' · finger ' + r.Finger });
  if (o) event_(ctx, 'ONBOARDING', o.Onboarding_ID, 'BIO_ENROLLED', ATT_TYPES_[type]);
  return { att: attView_(r), lic: attLicenses_() };
}

/** HR records that the enrolment was stopped on ZKBioTime (after an exit) — frees a mobile licence. */
function attStop_(ctx, p) {
  if (!attIsHr_(ctx)) throw userError_('إيقاف البصمة للموارد البشرية بس.');
  var r = get_('ATT_ENROLL', str_(p.Enroll_ID));
  if (!r) throw userError_('التسجيل غير موجود.');
  if (r.Status === 'STOPPED') throw userError_('اتوقف بالفعل.');
  withLock_(function () { update_('ATT_ENROLL', r.Enroll_ID, { Status: 'STOPPED', Stopped_By: ctx.user.User_ID, Stopped_At: nowIso_() }, ctx.user.User_ID); });
  audit_(ctx, { entityType: 'ATT_ENROLL', entityId: r.Enroll_ID, action: 'STOP', newValue: r.Employee_ID || r.Onboarding_ID });
  return { lic: attLicenses_() };
}

/** On an exit: an active enrolment is due to be stopped — HR is told. */
function attExitDue_(actor, e, last) {
  var r = attFor_(e.Employee_ID, '');
  if (!r || r.Status !== 'ACTIVE') return false;
  update_('ATT_ENROLL', r.Enroll_ID, { Status: 'STOP_DUE', Stop_Due_At: nowIso_(), Employee_ID: e.Employee_ID }, actor);
  notify_(roleHolders_(ROLE.HR_MANAGER).concat([onbLocHr_(e.Location_ID)]).filter(String), 'أوقف بصمة ' + e.Full_Name + ' على ZKBioTime — آخر يوم ' + last,
    (r.Punch_Type === 'MOBILE' ? 'مسجّل موبايل + ماكينات — إيقافه بيرجّع ليسنس موبايل. ' : 'مسجّل على الماكينات. ') + 'بعد الإيقاف علّم «اتوقف» من ملف الموظف.', 'EMP_FILE', e.Employee_ID, true);
  return true;
}
