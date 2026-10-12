/**
 * Services.gs — core business services: profile, users & roles, org structure,
 * positions, jobs, locations, config, audit search.
 */

function protectedRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR]; }
/** v0.34.0 (CHG-74): roles only the owner / HR sector manager may grant or remove — the top of the approval chain too. */
function bossOnlyRoles_() { return [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.CEO, ROLE.BOARD]; }
/** A position that heads a unit (approvals follow it). */
function isHeadPosition_(posId) {
  posId = str_(posId);
  return !!posId && where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Head_Position_ID === posId; }).length > 0;
}

function yesterday_() {
  return Utilities.formatDate(new Date(Date.now() - 86400000), APP.TZ, 'yyyy-MM-dd');
}
function requireReason_(p) {
  var r = str_(p.reason);
  if (r.length < 3) throw userError_('اكتب سبب التعديل.');
  return r;
}
function nonNegInt_(v, label) {
  var s = str_(v);
  if (!/^\d+$/.test(s)) throw userError_(label + ' لازم يكون رقم صحيح (0 أو أكتر).');
  return s;
}
function activeVersion_() { return cfg_('ORG_VERSION_ACTIVE', 'ORGV-2026.01'); }

/* ---------------- profile & lookups ---------------- */

function meProfile_(ctx) {
  var u = ctx.user;
  var pos = u.Position_ID ? get_('POSITIONS', u.Position_ID) : null;
  var job = pos ? get_('JOBS', pos.Job_Code) : null;
  var unit = pos ? get_('ORG_UNITS', pos.Org_Unit_ID) : null;
  var roleNames = {};
  all_('ROLES').forEach(function (r) { roleNames[r.Role_Code] = r.Role_Name_AR; });
  var headed = headedUnits_(u).map(function (id) { var x = get_('ORG_UNITS', id); return x ? x.Name_AR : id; });
  return {
    user: { User_ID: u.User_ID, Email: u.Email, Full_Name_AR: u.Full_Name_AR, Full_Name_EN: u.Full_Name_EN },
    position: pos ? { Position_ID: pos.Position_ID, title: pos.Position_Title || (job ? job.Job_Title_AR : ''),
                      unit: unit ? unit.Name_AR : '' } : null,
    roles: (ctx.readOnly ? [ROLE.CONSULTANT] : roleCodes_(ctx)).map(function (c) { return { code: c, name: roleNames[c] || c }; }),
    headedUnits: headed,
    managedUnitCount: managedScope_(u).length,
    can: {
      hrAdmin: hasAnyRole_(ctx, HR_ADMIN_ROLES),
      hrAll: hasAnyRole_(ctx, HR_ALL_ROLES),
      importStructure: hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]),
      config: hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]),
      editGrade: hasAnyRole_(ctx, [ROLE.HR_SECTOR]),
      recView: isRecRole_(ctx),
      vacManage: hasAnyRole_(ctx, vacManagerRoles_()),
      recruiter: hasAnyRole_(ctx, recruiterRoles_()),
      orgEdit: hasAnyRole_(ctx, orgEditRoles_()),
      candidates: hasAnyRole_(ctx, candWorkRoles_()),
      candAll: hasAnyRole_(ctx, candAllRoles_()),
      templates: hasAnyRole_(ctx, templateEditRoles_()),
      employees: hasAnyRole_(ctx, empRoles_()),
      empAdmin: hasAnyRole_(ctx, empAdminRoles_()),
      jd: hasAnyRole_(ctx, HR_ALL_ROLES),
      jobEdit: hasAnyRole_(ctx, HR_ADMIN_ROLES),
      lists: hasAnyRole_(ctx, HR_ALL_ROLES),
      restrict: hasAnyRole_(ctx, restrictionRoles_()),
      rehire: hasAnyRole_(ctx, rehireRoles_()),
      jdApprove: hasAnyRole_(ctx, jdApproveRoles_()),
      presence: hasAnyRole_(ctx, presenceRoles_()),     // v0.45.1 (CHG-98)
      intManage: hasAnyRole_(ctx, intManageRoles_()),
      iqEdit: hasAnyRole_(ctx, iqEditRoles_()),
      pay: hasAnyRole_(ctx, payViewRoles_()),
      payEdit: hasAnyRole_(ctx, payEditRoles_()),
      privacy: hasAnyRole_(ctx, privacyRoles_()),
      insurance: hasAnyRole_(ctx, insRoles_()),
      nhv: hasAnyRole_(ctx, nhvRoles_()),
      onbDept: onbDeptUsers_().indexOf(ctx.user.User_ID) >= 0,          // v0.41: IT / administration / safety people
      probAdmin: hasAnyRole_(ctx, probAdminRoles_()),
      medical: hasAnyRole_(ctx, medRoles_()),
      kpi: hasAnyRole_(ctx, kpiRoles_()) || hasAnyRole_(ctx, probAdminRoles_()),
      insights: hasAnyRole_(ctx, insightRoles_()),
      golive: hasAnyRole_(ctx, goliveRoles_()),
      cvaiAdmin: hasAnyRole_(ctx, cvaiAdminRoles_()),
      ceoAdmin: hasAnyRole_(ctx, ceoAdminRoles_()),
      ceo: hasAnyRole_(ctx, [ROLE.CEO]),
      dualAsk: hasAnyRole_(ctx, HR_ALL_ROLES) || hasAnyRole_(ctx, empAdminRoles_()),
      incidents: incCanReport_(ctx) || (ctx.readOnly && hasAnyRole_(ctx, opsRoles_())),
      live: golive_(),
      reports: hasAnyRole_(ctx, reportRoles_()),
      demo: !ctx.readOnly && !isDemoUser_(ctx.user) && realRoles_(ctx.user.User_ID).indexOf(ROLE.OWNER) >= 0 && !golive_(),
      offers: hasAnyRole_(ctx, candWorkRoles_().concat(offerApproverRoles_()).concat([ROLE.CEO, ROLE.BOARD]))
    },
    empMode: occFromEmployees_(),
    scopeUnits: requestScopeUnits_(ctx),
    todo: myTodo_(ctx),
    idleMinutes: cfg_('IDLE_MINUTES', 30),
    lang: userLang_(u), langChoice: langChoiceAllowed_(ctx), defaultLang: defaultLang_(),
    app: { name: APP.NAME, version: APP.VERSION },
    security: securityProfile_(ctx),
    // owner / HR sector manager: is the scheduled daily job installed? (without it the first visitor of the day waits for it)
    jobs: !ctx.readOnly && hasAnyRole_(ctx, [ROLE.OWNER, ROLE.HR_SECTOR]) ? { daily: sprop_('DAILY_TRIGGER') === 'Y' } : null
  };
}

function lookups_(ctx) {
  return {
    roles: where_('ROLES', function (r) { return r.Status === 'Active'; })
      .map(function (r) { return { code: r.Role_Code, name: r.Role_Name_AR }; }),
    units: where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Org_Version_ID === activeVersion_(); })
      .map(function (u) { return { id: u.Org_Unit_ID, name: u.Name_AR, type: u.Unit_Type, parent: u.Parent_Org_Unit_ID }; }),
    locations: all_('LOCATIONS').map(function (l) {
      return { id: l.Location_ID, name: l.Name_AR, type: l.Location_Type, status: l.Status, address: l.Address, governorate: l.Governorate, nameEn: l.Name_EN, hrSite: l.HR_Site_User_ID, insOffice: l.Insurance_Office };
    }),
    poolMonths: num_(cfg_('RETENTION_POOL_MONTHS', 12), 12),
    grades: all_('GRADES').map(function (g) { return { code: g.Grade_Code, name: g.Grade_Name }; }),
    families: jobFamilies_(),
    enNamesJson: JSON.stringify(enNames_())   // text, not an object: names are keys and may end with "_" 
  };
}

/* ---------------- users & roles ---------------- */

function usersList_(ctx) {
  var roles = {};
  all_('USER_ROLES').forEach(function (r) {
    if (!isEffective_(r.Effective_From, r.Effective_To)) return;
    (roles[r.User_ID] = roles[r.User_ID] || []).push({
      Role_Code: r.Role_Code, Scope_Type: r.Scope_Type || 'ALL',
      Scope_Org_Unit_ID: r.Scope_Org_Unit_ID, Include_Children: r.Include_Children
    });
  });
  var mfa = mfaSummary_();
  return all_('USERS').map(function (u) {
    u.mfa = mfa[u.User_ID] || { on: '', logins: 0, recoveryLeft: 0, resetAt: '' };
    var pos = u.Position_ID ? get_('POSITIONS', u.Position_ID) : null;
    var job = pos ? get_('JOBS', pos.Job_Code) : null;
    u.positionTitle = pos ? (pos.Position_Title || (job ? job.Job_Title_AR : '')) : '';
    u.roles = roles[u.User_ID] || [];
    return u;
  });
}

function usersSave_(ctx, p) {
  var email = normEmail_(p.Email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw userError_('الإيميل غير صحيح.');
  if (!str_(p.Full_Name_AR)) throw userError_('اكتب الاسم بالعربي.');
  var dup = findUserByEmail_(email);
  if (dup && dup.User_ID !== str_(p.User_ID)) throw userError_('الإيميل ده مسجل لمستخدم تاني.');
  if (str_(p.Position_ID) && !get_('POSITIONS', p.Position_ID)) throw userError_('رقم الوظيفة (Position) غير موجود.');
  var status = str_(p.Status) || 'Active';
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');

  var fields = {
    Email: email, Full_Name_AR: str_(p.Full_Name_AR), Full_Name_EN: str_(p.Full_Name_EN),
    Employee_ID: str_(p.Employee_ID), Position_ID: str_(p.Position_ID), Mobile: str_(p.Mobile), Status: status
  };
  if (str_(p.User_ID) && str_(p.Position_ID) && isConsultant_(str_(p.User_ID))) throw userError_('الاستشاري مايتربطش بوظيفة في الهيكل.');
  if (p.Access_Expires_At !== undefined) {
    var exp = str_(p.Access_Expires_At);
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw userError_('تاريخ انتهاء الحساب غير صحيح.');
    if (exp && exp < today_()) throw userError_('تاريخ انتهاء الحساب لازم يكون النهارده أو بعده.');
    var old = str_(p.User_ID) ? get_('USERS', p.User_ID) : null;
    if (!exp && old && isConsultant_(old.User_ID)) throw userError_('حساب الاستشاري لازم يكون ليه تاريخ انتهاء.');
    if (exp && old && isConsultant_(old.User_ID)) consultantExpiryCheck_(exp);
    fields.Access_Expires_At = exp;
  }
  if (p.Lang !== undefined) {
    var lang = str_(p.Lang);
    if (['', 'ar', 'en'].indexOf(lang) < 0) throw userError_('لغة غير معروفة.');
    fields.Lang = lang;
  }
  var emailChanged = false, posChanged = !!fields.Position_ID;
  if (str_(p.User_ID)) {
    var cur = get_('USERS', p.User_ID);
    if (!cur) throw userError_('المستخدم غير موجود.');
    emailChanged = normEmail_(cur.Email) !== email;
    posChanged = str_(cur.Position_ID) !== fields.Position_ID;
    userEditGuard_(ctx, cur, emailChanged);
    // v0.34.0 (CHG-74): nobody moves himself to another position (a position carries approval authority)
    if (posChanged && cur.User_ID === ctx.user.User_ID) throw userError_('ماينفعش تغيّر وظيفتك انت — مدير قطاع الموارد البشرية أو مالك النظام يغيّرها.');
  }
  // a unit head's position carries the unit's approvals: only the owner / HR sector manager put someone there
  if (posChanged && isHeadPosition_(fields.Position_ID) && !hasAnyRole_(ctx, protectedRoles_()))
    throw userError_('ربط مستخدم بوظيفة مدير وحدة بيعمله مدير قطاع الموارد البشرية أو مالك النظام بس.');
  // v0.36.0 (CHG-74): the head of the company or of a sector — only with the CEO's approval
  if (posChanged && isTopHeadPosition_(fields.Position_ID) && !ctx.ceoApproved) {
    var pos0 = get_('POSITIONS', fields.Position_ID) || {};
    var q = ceoQueue_(ctx, 'HEAD', str_(p.User_ID) || email, 'ربط ' + fields.Full_Name_AR + ' بوظيفة ' + (pos0.Position_Title || fields.Position_ID),
      'الوظيفة دي بتعتمد طلبات الشركة أو القطاع كله.', p);
    if (q) return Object.assign(str_(p.User_ID) ? clean_(get_('USERS', p.User_ID) || {}) : {}, { pendingCeo: q.CA_ID });
  }
  var out = withLock_(function () {
    if (!str_(p.User_ID)) {
      fields.User_ID = nextId_('USER');
      fields.Last_Login_At = '';
      var created = insert_('USERS', fields, ctx.user.User_ID);
      audit_(ctx, { entityType: 'USER', entityId: created.User_ID, action: 'CREATE', newValue: email });
      return { after: created };
    }
    if (str_(p.User_ID) === ctx.user.User_ID && status === 'Inactive') throw userError_('ماينفعش توقف حسابك انت.');
    var res = update_('USERS', p.User_ID, fields, ctx.user.User_ID);
    auditDiff_(ctx, 'USER', p.User_ID, res.before, res.after, str_(p.reason));
    // a new email = a new way in: close the sessions opened through the old one
    if (emailChanged) revokeUserSessions_(ctx, p.User_ID);
    if (res.before.Status === 'Active' && status === 'Inactive') res.offboard = userOffboard_(ctx.user.User_ID, p.User_ID, 'الحساب اتوقف');
    return res;
  });
  if (out.offboard) offboardNotify_(out.after.User_ID, out.offboard);
  return out.after;
}

/**
 * v0.34.0: an account that stops (deactivated, or its employee left) — sessions closed, and its recruitment work goes back
 * to «not assigned» (vacancy lead cleared, team membership ended, candidates without an owner) so nothing waits on
 * someone who is gone. Runs inside a lock. Returns { sessions, vacancies, apps }.
 */
function userOffboard_(actorId, userId, why) {
  var out = { sessions: 0, vacancies: [], apps: 0 }, now = nowIso_();
  var u = get_('USERS', userId);
  if (u && u.Status === 'Active') update_('USERS', userId, { Status: 'Inactive' }, actorId);
  where_('SESSIONS', function (s) { return s.User_ID === userId && s.Revoked_At === ''; }).forEach(function (s) {
    update_('SESSIONS', s.Session_ID, { Revoked_At: now, Revoked_By: actorId }, actorId); out.sessions++;
  });
  where_('VACANCY_RECRUITERS', function (r) { return r.User_ID === userId && r.Active === 'Y'; }).forEach(function (r) {
    update_('VACANCY_RECRUITERS', r.VR_ID, { Active: 'N', Ended_At: now, Reason: str_(why).slice(0, 200) }, actorId);
    if (out.vacancies.indexOf(r.Vacancy_ID) < 0) out.vacancies.push(r.Vacancy_ID);
  });
  where_('VACANCIES', function (v) { return v.Lead_Recruiter_ID === userId && VAC_OPEN_.indexOf(v.Status) >= 0; }).forEach(function (v) {
    update_('VACANCIES', v.Vacancy_ID, { Lead_Recruiter_ID: '' }, actorId);
    if (out.vacancies.indexOf(v.Vacancy_ID) < 0) out.vacancies.push(v.Vacancy_ID);
  });
  where_('APPLICATIONS', function (a) { return (a.Owner_User_ID === userId || a.Next_Action_Owner === userId) && LIVE_STAGES_().indexOf(a.Stage) >= 0; }).forEach(function (a) {
    var patch = {};
    if (a.Owner_User_ID === userId) patch.Owner_User_ID = '';
    if (a.Next_Action_Owner === userId) patch.Next_Action_Owner = '';
    update_('APPLICATIONS', a.Application_ID, patch, actorId); out.apps++;
  });
  return out;
}

/** After userOffboard_: tell the recruitment managers which vacancies need a new recruiter. */
function offboardNotify_(userId, res) {
  if (!res || (!res.vacancies.length && !res.apps)) return;
  var u = get_('USERS', userId) || {};
  notify_(roleHolders_(ROLE.REC_MANAGER).concat(roleHolders_(ROLE.HR_MANAGER)), 'شغل محتاج أخصائي جديد',
    str_(u.Full_Name_AR) + ' حسابه اتقفل — ' + res.vacancies.length + ' شاغر رجع «غير موزّع» و' + res.apps + ' مرشح من غير مسؤول. وزّعهم من «الشواغر».', 'VACANCY', res.vacancies[0] || '', true);
}

/**
 * Who may edit an existing account. The email is the key to the account (sign-in codes go there), so:
 *  - the system owner's account: the owner only; HR sector manager accounts: the owner or the HR sector manager;
 *  - a demo account's email never changes (demo people sign in only through the owner's «try as»);
 *  - the email of someone who has already signed in: the owner or the HR sector manager only.
 */
function userEditGuard_(ctx, target, emailChanged) {
  var theirs = realRoles_(target.User_ID), boss = hasAnyRole_(ctx, protectedRoles_());
  if (theirs.indexOf(ROLE.OWNER) >= 0 && target.User_ID !== ctx.user.User_ID && !hasAnyRole_(ctx, [ROLE.OWNER])) {
    throw userError_('حساب مالك النظام بيعدّله مالك النظام بس.');
  }
  if (!boss && theirs.some(function (r) { return protectedRoles_().indexOf(r) >= 0; })) {
    throw userError_('حساب مدير قطاع الموارد البشرية أو مالك النظام بيعدّله مالك النظام أو مدير القطاع بس.');
  }
  if (emailChanged && isDemoUser_(target)) throw userError_('إيميل المستخدم التجريبي مايتغيرش — الدخول بصفته من «جرّب بصفته» بس.');
  if (emailChanged && str_(target.Last_Login_At) && !boss) {
    throw userError_('المستخدم ده دخل البوابة قبل كده — تغيير إيميله لمالك النظام أو مدير قطاع الموارد البشرية بس.');
  }
}

/**
 * Replace a user's active roles with the given list.
 * p = { User_ID, roles: [{ Role_Code, Scope_Type, Scope_Org_Unit_ID, Include_Children }], reason }
 */
function usersSetRoles_(ctx, p) {
  var userId = str_(p.User_ID);
  if (!get_('USERS', userId)) throw userError_('المستخدم غير موجود.');
  // v0.34.0 (CHG-74): nobody changes his own roles — another administrator does it
  if (userId === ctx.user.User_ID) throw userError_('ماينفعش تعدّل أدوارك انت — مستخدم تاني من الإدارة يعدّلها.');
  var validRoles = {};
  all_('ROLES').forEach(function (r) { validRoles[r.Role_Code] = 1; });

  var desired = {};
  (p.roles || []).forEach(function (r) {
    var code = str_(r.Role_Code);
    if (!validRoles[code]) throw userError_('دور غير معروف: ' + code);
    var st = str_(r.Scope_Type) || 'ALL';
    if (['ALL', 'ORG_UNIT'].indexOf(st) < 0) throw userError_('نطاق غير صحيح.');
    var unit = st === 'ORG_UNIT' ? str_(r.Scope_Org_Unit_ID) : '';
    if (st === 'ORG_UNIT' && !get_('ORG_UNITS', unit)) throw userError_('اختار الإدارة/القسم لنطاق الدور.');
    var inc = st === 'ORG_UNIT' ? (str_(r.Include_Children) || 'Y') : '';
    desired[[code, st, unit, inc].join('|')] = { Role_Code: code, Scope_Type: st, Scope_Org_Unit_ID: unit, Include_Children: inc };
  });

  var current = activeRoles_(userId);
  var currentKeys = {};
  current.forEach(function (r) {
    currentKeys[[r.Role_Code, r.Scope_Type || 'ALL', r.Scope_Org_Unit_ID || '', r.Include_Children || ''].join('|')] = r;
  });

  var toEnd = Object.keys(currentKeys).filter(function (k) { return !desired[k]; }).map(function (k) { return currentKeys[k]; });
  var toAdd = Object.keys(desired).filter(function (k) { return !currentKeys[k]; }).map(function (k) { return desired[k]; });

  // consultant (view only): a role on its own, with an end date, granted by the owner / HR sector manager only
  var wantsConsultant = Object.keys(desired).some(function (k) { return desired[k].Role_Code === ROLE.CONSULTANT; });
  if (wantsConsultant) {
    if (Object.keys(desired).length > 1) throw userError_('دور «استشاري (عرض فقط)» لازم يبقى لوحده — شيل باقي الأدوار.');
    var target = get_('USERS', userId);
    if (!str_(target.Access_Expires_At)) throw userError_('حدد تاريخ انتهاء حساب الاستشاري الأول (من بيانات المستخدم).');
    consultantExpiryCheck_(target.Access_Expires_At);
    if (target.Position_ID) throw userError_('الاستشاري مايتربطش بوظيفة في الهيكل — شيل الوظيفة من بيانات المستخدم الأول.');
  }
  if (toEnd.concat(toAdd).some(function (r) { return r.Role_Code === ROLE.CONSULTANT; }) && !hasAnyRole_(ctx, protectedRoles_())) {
    throw userError_('دور الاستشاري بيمنحه مدير قطاع الموارد البشرية أو مالك النظام بس.');
  }
  var touchesProtected = toEnd.concat(toAdd).some(function (r) { return bossOnlyRoles_().indexOf(r.Role_Code) >= 0; });
  if (touchesProtected && !hasAnyRole_(ctx, protectedRoles_())) {
    throw userError_('أدوار مالك النظام ومدير قطاع الموارد البشرية والرئيس التنفيذي ومجلس الإدارة بيمنحها مدير القطاع أو مالك النظام بس.');
  }
  // v0.36.0 (CHG-74): giving or removing the CEO / Board roles waits for the CEO's approval
  var touchesTop = toEnd.concat(toAdd).some(function (r) { return r.Role_Code === ROLE.CEO || r.Role_Code === ROLE.BOARD; });
  if (touchesTop && !ctx.ceoApproved) {
    var tu = get_('USERS', userId);
    var q = ceoQueue_(ctx, 'ROLE', userId, 'أدوار ' + tu.Full_Name_AR + ': ' + toAdd.map(function (r) { return '+' + r.Role_Code; }).concat(toEnd.map(function (r) { return '−' + r.Role_Code; })).join(' '),
      str_(p.reason), { User_ID: userId, roles: p.roles || [], reason: str_(p.reason) });
    if (q) return { pendingCeo: q.CA_ID, User_ID: userId };
  }
  // Never leave the system without an active owner.
  if (toEnd.some(function (r) { return r.Role_Code === ROLE.OWNER; })) {
    var owners = where_('USER_ROLES', function (r) {
      return r.Role_Code === ROLE.OWNER && isEffective_(r.Effective_From, r.Effective_To) && r.User_ID !== userId;
    });
    if (!owners.length) throw userError_('لازم يفضل مالك نظام واحد على الأقل.');
  }
  var reason = str_(p.reason);

  withLock_(function () {
    toEnd.forEach(function (r) {
      update_('USER_ROLES', r.User_Role_ID, { Effective_To: yesterday_() }, ctx.user.User_ID);
      audit_(ctx, { entityType: 'USER', entityId: userId, action: 'ROLE_REMOVED', field: 'Role', oldValue: r.Role_Code, reason: reason });
    });
    if (toAdd.length) {
      var ids = nextIds_('USER_ROLE', toAdd.length);
      insertMany_('USER_ROLES', toAdd.map(function (r, i) {
        return { User_Role_ID: ids[i], User_ID: userId, Role_Code: r.Role_Code, Scope_Type: r.Scope_Type,
          Scope_Org_Unit_ID: r.Scope_Org_Unit_ID, Include_Children: r.Include_Children,
          Effective_From: today_(), Effective_To: '', Granted_By: ctx.user.User_ID };
      }), ctx.user.User_ID);
      toAdd.forEach(function (r) {
        audit_(ctx, { entityType: 'USER', entityId: userId, action: 'ROLE_GRANTED', field: 'Role', newValue: r.Role_Code, reason: reason });
      });
    }
  });
  return { added: toAdd.length, removed: toEnd.length };
}

/* ---------------- org structure ---------------- */

function orgTree_(ctx) {
  var ver = activeVersion_();
  var units = where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Org_Version_ID === ver; });
  var stats = {};
  where_('POSITIONS', function (p) { return p.Status !== 'Closed' && p.Org_Version_ID === ver; }).forEach(function (p) {
    var s = stats[p.Org_Unit_ID] = stats[p.Org_Unit_ID] || { positions: 0, structural: 0, occupied: 0 };
    s.positions++;
    s.structural += num_(p.Structural_HC, 0);
    s.occupied += num_(p.Occupied_HC, 0);
  });
  var holders = holdersByPosition_();
  return units.map(function (u) {
    var head = u.Head_Position_ID ? get_('POSITIONS', u.Head_Position_ID) : null;
    var headJob = head ? get_('JOBS', head.Job_Code) : null;
    return {
      id: u.Org_Unit_ID, parent: u.Parent_Org_Unit_ID, type: u.Unit_Type, name: u.Name_AR, code: u.Unit_Code,
      headPositionId: u.Head_Position_ID,
      headTitle: head ? (head.Position_Title || (headJob ? headJob.Job_Title_AR : '')) : '',
      headHolder: head ? (holders[head.Position_ID] || []).join('، ') : '',
      stats: stats[u.Org_Unit_ID] || { positions: 0, structural: 0, occupied: 0 }
    };
  });
}

function holdersByPosition_() {
  var map = {};
  where_('USERS', function (u) { return u.Status === 'Active' && u.Position_ID; }).forEach(function (u) {
    (map[u.Position_ID] = map[u.Position_ID] || []).push(u.Full_Name_AR);
  });
  return map;
}

/** p = { unitId, includeChildren, q, locationId, limit } */
function positionsSearch_(ctx, p) {
  var ver = activeVersion_();
  var units = null;
  if (str_(p.unitId)) units = p.includeChildren === false ? [p.unitId] : descendants_(p.unitId);
  var q = norm_(p.q);
  var jobs = {}; all_('JOBS').forEach(function (j) { jobs[j.Job_Code] = j; });
  var unitNames = {}; all_('ORG_UNITS').forEach(function (u) { unitNames[u.Org_Unit_ID] = u.Name_AR; });
  var locs = {}; all_('LOCATIONS').forEach(function (l) { locs[l.Location_ID] = l.Name_AR; });
  var holders = holdersByPosition_();
  var limit = Math.min(num_(p.limit, 300), 1000);

  var rows = where_('POSITIONS', function (x) {
    if (x.Org_Version_ID !== ver) return false;
    if (units && units.indexOf(x.Org_Unit_ID) < 0) return false;
    if (str_(p.locationId) && x.Location_ID !== p.locationId) return false;
    if (q) {
      var j = jobs[x.Job_Code] || {};
      var hay = norm_([x.Position_ID, x.Job_Code, x.Position_Title, j.Job_Title_AR, j.Job_Title_EN, unitNames[x.Org_Unit_ID]].join(' '));
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  var total = rows.length;
  rows = rows.slice(0, limit).map(function (x) {
    var j = jobs[x.Job_Code] || {};
    var rt = x.Reports_To_Position_ID ? get_('POSITIONS', x.Reports_To_Position_ID) : null;
    var rtJob = rt ? jobs[rt.Job_Code] || {} : {};
    x.jobTitle = x.Position_Title || j.Job_Title_AR || '';
    x.grade = j.Grade_Code || '';
    x.unitName = unitNames[x.Org_Unit_ID] || '';
    x.locationName = locs[x.Location_ID] || '';
    x.reportsToTitle = rt ? (rt.Position_Title || rtJob.Job_Title_AR || '') : '';
    x.holders = (holders[x.Position_ID] || []).join('، ');
    x.availableHC = String(num_(x.Structural_HC, 0) - num_(x.Occupied_HC, 0));
    return x;
  });
  return { total: total, rows: rows };
}

/** p = { Position_ID, Structural_HC?, Occupied_HC?, HC_Basis?, Status?, Position_Title?, Location_ID?, Reports_To_Position_ID?, reason } */
function positionUpdate_(ctx, p) {
  var reason = requireReason_(p);
  var pos = get_('POSITIONS', p.Position_ID);
  if (!pos) throw userError_('الوظيفة غير موجودة.');
  var patch = {};
  if (p.Structural_HC !== undefined) patch.Structural_HC = nonNegInt_(p.Structural_HC, 'العدد المعتمد');
  if (p.Occupied_HC !== undefined && occFromEmployees_()) {
    if (nonNegInt_(p.Occupied_HC, 'العدد الفعلي') !== str_(pos.Occupied_HC))
      throw userError_('العدد الفعلي بيتحسب تلقائياً من سجل الموظفين — عدّله من شاشة «الموظفين» (تعيين، نقل، نهاية خدمة).');
  } else if (p.Occupied_HC !== undefined) {
    patch.Occupied_HC = nonNegInt_(p.Occupied_HC, 'العدد الفعلي');
    if (patch.Occupied_HC !== pos.Occupied_HC) {
      patch.Occupied_Updated_At = nowIso_();
      patch.Occupied_Updated_By = ctx.user.User_ID;
    }
  }
  if (p.HC_Basis !== undefined) {
    if (['BASELINE_TEMP', 'MANPOWER_PLAN'].indexOf(p.HC_Basis) < 0) throw userError_('أساس العدد غير صحيح.');
    patch.HC_Basis = p.HC_Basis;
  }
  if (p.Status !== undefined) {
    if (['Active', 'Frozen', 'Closed'].indexOf(p.Status) < 0) throw userError_('حالة غير صحيحة.');
    patch.Status = p.Status;
    if (p.Status === 'Closed' && pos.Status !== 'Closed') {
      if (where_('ORG_UNITS', function (u) { return u.Status === 'Active' && u.Head_Position_ID === pos.Position_ID; }).length)
        throw userError_('دي وظيفة مدير الوحدة — غيّر مدير الوحدة الأول قبل ما تقفلها.');
      blockIfOpenWork_([pos.Position_ID], 'الوظيفة');
      patch.Effective_To = today_();
    }
  }
  if (p.Position_Title !== undefined) patch.Position_Title = str_(p.Position_Title);
  if (p.Location_ID !== undefined) {
    if (str_(p.Location_ID) && !get_('LOCATIONS', p.Location_ID)) throw userError_('الموقع غير موجود.');
    patch.Location_ID = str_(p.Location_ID);
  }
  if (p.Reports_To_Position_ID !== undefined) {
    var rt = str_(p.Reports_To_Position_ID);
    if (rt && !get_('POSITIONS', rt)) throw userError_('وظيفة المدير المباشر غير موجودة.');
    if (rt === pos.Position_ID) throw userError_('الوظيفة ماينفعش تتبع نفسها.');
    patch.Reports_To_Position_ID = rt;
  }

  return withLock_(function () {
    var res = update_('POSITIONS', pos.Position_ID, patch, ctx.user.User_ID);
    var changed = Object.keys(patch).filter(function (k) {
      return k.indexOf('Occupied_Updated') !== 0 && k !== 'Effective_To' && str_(res.before[k]) !== str_(res.after[k]);
    });
    if (changed.length) {
      var ids = nextIds_('POSITION_HISTORY', changed.length);
      insertMany_('POSITION_HISTORY', changed.map(function (k, i) {
        return { History_ID: ids[i], Position_ID: pos.Position_ID, Field: k,
          Old_Value: res.before[k], New_Value: res.after[k], Reason: reason };
      }), ctx.user.User_ID);
    }
    auditDiff_(ctx, 'POSITION', pos.Position_ID, res.before, res.after, reason);
    return res.after;
  });
}

function positionHistory_(ctx, p) {
  return where_('POSITION_HISTORY', function (h) { return h.Position_ID === str_(p.Position_ID); })
    .sort(function (a, b) { return a.Created_At < b.Created_At ? 1 : -1; });
}

/* ---------------- jobs & locations ---------------- */

function jobsList_(ctx) {
  var count = {};
  all_('POSITIONS').forEach(function (p) { if (p.Status !== 'Closed') count[p.Job_Code] = (count[p.Job_Code] || 0) + 1; });
  return all_('JOBS').map(function (j) { j.positions = count[j.Job_Code] || 0; return j; });
}

/** Grade changes are restricted to the HR Sector Manager (blueprint 3.5). */
function jobUpdate_(ctx, p) {
  var reason = requireReason_(p);
  var job = get_('JOBS', p.Job_Code);
  if (!job) throw userError_('الوظيفة غير موجودة في كتالوج الوظائف.');
  var patch = {};
  ['Job_Title_AR', 'Job_Title_EN', 'Job_Family', 'Job_Level', 'Status'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = str_(p[k]).replace(/\s+/g, ' ');
  });
  if (patch.Job_Title_AR !== undefined && patch.Job_Title_AR.length < 2) throw userError_('اكتب اسم الوظيفة بالعربي.');
  if (patch.Status && ['Active', 'Inactive'].indexOf(patch.Status) < 0) throw userError_('حالة غير صحيحة.');
  if (patch.Job_Level && !/^JL[1-7]$/.test(patch.Job_Level)) throw userError_('المستوى الوظيفي غير صحيح.');
  if (patch.Job_Family && !jobFamilies_()[patch.Job_Family]) throw userError_('العائلة الوظيفية غير موجودة.');
  if (patch.Job_Title_AR && patch.Job_Title_AR !== job.Job_Title_AR &&
      where_('JOBS', function (j) { return j.Job_Code !== job.Job_Code && j.Status !== 'Inactive' && norm_(j.Job_Title_AR) === norm_(patch.Job_Title_AR); }).length)
    throw userError_('في وظيفة تانية بنفس الاسم في الكتالوج.');
  if (patch.Status === 'Inactive' && job.Status !== 'Inactive') {
    var used = find_('POSITIONS', { Job_Code: job.Job_Code, Status: ['Active', 'Frozen'] }).length;
    if (used) throw userError_('الوظيفة عليها ' + used + ' مكان وظيفي في الهيكل — اقفلهم أو انقلهم لوظيفة تانية الأول.');
  }
  if (p.Grade_Code !== undefined && str_(p.Grade_Code) !== job.Grade_Code) {
    if (!hasAnyRole_(ctx, [ROLE.HR_SECTOR])) throw userError_('تعديل الدرجة الوظيفية لمدير قطاع الموارد البشرية بس.');
    if (str_(p.Grade_Code) && !get_('GRADES', p.Grade_Code)) throw userError_('الدرجة غير موجودة.');
    patch.Grade_Code = str_(p.Grade_Code);
  }
  if (!Object.keys(patch).some(function (k) { return str_(patch[k]) !== str_(job[k]); })) throw userError_('مفيش تعديل.');
  return withLock_(function () {
    var versions = where_('JOB_VERSIONS', function (v) { return v.Job_Code === job.Job_Code; });
    insert_('JOB_VERSIONS', { Job_Version_ID: nextId_('JOB_VERSION'), Job_Code: job.Job_Code,
      Version: String(versions.length + 1), Snapshot_JSON: JSON.stringify(job), Change_Reason: reason }, ctx.user.User_ID);
    var res = update_('JOBS', job.Job_Code, patch, ctx.user.User_ID);
    auditDiff_(ctx, 'JOB', job.Job_Code, res.before, res.after, reason);
    return res.after;
  });
}

/**
 * Locations. Types: FACTORY, SHOWROOM (= one branch), BRANCH_GROUP («الفروع»: positions shared by all branches;
 * a request for them picks the branch), WAREHOUSE, OFFICE, HQ.
 */
var LOCATION_TYPES_ = ['FACTORY', 'SHOWROOM', 'BRANCH_GROUP', 'WAREHOUSE', 'OFFICE', 'HQ'];
function locationSave_(ctx, p) {
  var name = str_(p.Name_AR).replace(/\s+/g, ' ');
  if (!name) throw userError_('اكتب اسم الموقع.');
  if (LOCATION_TYPES_.concat(['']).indexOf(str_(p.Location_Type)) < 0) throw userError_('نوع موقع غير صحيح.');
  var status = str_(p.Status) || 'Active';
  if (['Active', 'Inactive'].indexOf(status) < 0) throw userError_('حالة غير صحيحة.');
  var dup = where_('LOCATIONS', function (l) { return norm_(l.Name_AR) === norm_(name) && l.Location_ID !== str_(p.Location_ID); });
  if (dup.length) throw userError_('في موقع بنفس الاسم.');
  var fields = { Name_AR: name, Name_EN: str_(p.Name_EN), Location_Type: str_(p.Location_Type),
    Company_Org_Unit_ID: str_(p.Company_Org_Unit_ID), Governorate: str_(p.Governorate), Status: status, Address: str_(p.Address).slice(0, 300) };
  if (p.HR_Site_User_ID !== undefined) {
    if (str_(p.HR_Site_User_ID) && !get_('USERS', str_(p.HR_Site_User_ID))) throw userError_('أخصائي HR الموقع غير موجود في المستخدمين.');
    fields.HR_Site_User_ID = str_(p.HR_Site_User_ID);
  }
  if (p.Insurance_Office !== undefined) fields.Insurance_Office = str_(p.Insurance_Office).slice(0, 80);
  if (str_(p.Location_ID) && status === 'Inactive') {
    var cur = get_('LOCATIONS', p.Location_ID);
    if (cur && cur.Status !== 'Inactive') {
      var posUsing = where_('POSITIONS', function (x) { return x.Location_ID === cur.Location_ID && x.Status !== 'Closed'; }).length;
      if (posUsing) throw userError_('الموقع عليه ' + posUsing + ' مكان وظيفي — انقلهم لموقع تاني الأول.');
      var vacUsing = where_('VACANCIES', function (v) { return v.Location_ID === cur.Location_ID && VAC_OPEN_.indexOf(v.Status) >= 0; }).length;
      if (vacUsing) throw userError_('الموقع عليه ' + vacUsing + ' شاغر مفتوح — اقفلهم أو انقلهم الأول.');
    }
  }
  return withLock_(function () {
    if (!str_(p.Location_ID)) {
      fields.Location_ID = nextId_('LOCATION');
      var c = insert_('LOCATIONS', fields, ctx.user.User_ID);
      audit_(ctx, { entityType: 'LOCATION', entityId: c.Location_ID, action: 'CREATE', newValue: c.Name_AR });
      return c;
    }
    var res = update_('LOCATIONS', p.Location_ID, fields, ctx.user.User_ID);
    auditDiff_(ctx, 'LOCATION', p.Location_ID, res.before, res.after, str_(p.reason));
    return res.after;
  });
}

/* ---------------- config ---------------- */

var CONFIG_RULES = {
  HC_ENFORCEMENT_MODE: ['WARN', 'BLOCK'],
  DEFAULT_LANG: ['ar', 'en'],
  CVAI_MODEL: ['claude-haiku-4-5', 'claude-sonnet-5-5']
};

function configUpdate_(ctx, p) {
  var reason = requireReason_(p);
  var c = get_('CONFIG', p.Config_Key);
  if (!c) throw userError_('الإعداد غير موجود.');
  var v = str_(p.Config_Value);
  if (c.Value_Type === 'NUMBER' && (v === '' || isNaN(Number(v)))) throw userError_('القيمة لازم تكون رقم.');
  if (c.Value_Type === 'BOOL' && ['Y', 'N'].indexOf(v) < 0) throw userError_('القيمة لازم تكون Y أو N.');
  if (c.Value_Type === 'JSON') {
    try { var j = JSON.parse(v); if (!j || typeof j !== 'object') throw 0; }
    catch (e) { throw userError_('القيمة لازم تكون JSON صحيح، زي {"NORMAL":20}.'); }
  }
  if (CONFIG_RULES[c.Config_Key] && CONFIG_RULES[c.Config_Key].indexOf(v) < 0) {
    throw userError_('القيم المسموحة: ' + CONFIG_RULES[c.Config_Key].join(' / '));
  }
  if (c.Config_Key === 'DIGEST_TIME' && !/^([01]?\d|2[0-3]):00$/.test(v)) throw userError_('اكتب الساعة بالشكل ده: 08:00 (ساعة كاملة).');
  var out = withLock_(function () {
    var res = update_('CONFIG', c.Config_Key, { Config_Value: v }, ctx.user.User_ID);
    auditDiff_(ctx, 'CONFIG', c.Config_Key, res.before, res.after, reason);
    return res.after;
  });
  if (c.Config_Key === 'DIGEST_TIME') out.trigger = tryInstallTriggers_();   // move the daily job to the new hour
  return out;
}

/* ---------------- audit explorer ---------------- */

/** p = { entityId, userId, action, from, to } — newest first, max 300. */
function auditSearch_(ctx, p) {
  var eid = str_(p.entityId), uid = str_(p.userId), act = str_(p.action).toUpperCase();
  var from = str_(p.from), to = str_(p.to), page = Math.max(0, num_(p.page, 0));
  // v0.35.0: without a record number the search covers the last 90 days unless a period is given (older rows are archived monthly)
  if (!eid && !from) from = addDaysYmd_(today_(), -90);
  var rows = where_('AUDIT_LOG', function (a) {
    if (eid && a.Entity_ID !== eid) return false;
    if (uid && a.User_ID !== uid) return false;
    if (act && a.Action !== act) return false;
    if (from && a.Timestamp.slice(0, 10) < from) return false;
    if (to && a.Timestamp.slice(0, 10) > to) return false;
    return true;
  });
  rows.sort(function (a, b) { return a.Timestamp < b.Timestamp ? 1 : (a.Timestamp > b.Timestamp ? -1 : (a.Audit_ID < b.Audit_ID ? 1 : -1)); });
  var names = {}; all_('USERS').forEach(function (u) { names[u.User_ID] = u.Full_Name_AR; });
  return { total: rows.length, page: page, from: from, rows: rows.slice(page * 300, page * 300 + 300).map(function (a) { a.userName = names[a.User_ID] || a.User_ID; return a; }) };
}

/* ---------------- v0.42.0 (CHG-87): the search box at the top ---------------- */

/**
 * One box for candidates, requests, vacancies and employees. Each kind goes through the same check as its own
 * screen (no new rights): candidates only where you may open the application, requests from your boxes, vacancies
 * you may see, employees for the HR roles. Never a mobile, e-mail or salary in the results. 5 per kind.
 */
function searchAll_(ctx, p) {
  var raw = str_(p && p.q).trim(), q = norm_(latinDigits_(raw)), N = 5, out = { cands: [], reqs: [], vacs: [], emps: [] };
  if (q.replace(/\s/g, '').length < 3) return out;
  var personal = !(ctx.readOnly && golive_());     // CHG-82: a consultant after go-live sees no personal data
  function has(h) { return norm_(latinDigits_(h.join(' '))).indexOf(q) >= 0; }
  if (personal && hasAnyRole_(ctx, candWorkRoles_())) {
    candSearch_(ctx, { q: raw }).forEach(function (x) {
      if (out.cands.length >= N) return;
      var a = x.apps.filter(function (y) { return y.canOpen; })[0];
      if (a) out.cands.push({ id: a.Application_ID, name: x.Full_Name, Person_ID: x.Person_ID, job: a.jobTitle, Stage: a.Stage });
    });
  }
  var reqs = isRecRole_(ctx) ? requestsList_(ctx, { box: 'all' }) : requestsList_(ctx, { box: 'mine' }).concat(requestsList_(ctx, { box: 'team' }));
  var seen = {};
  reqs.forEach(function (r) {
    if (out.reqs.length >= N || seen[r.Request_ID] || !has([r.Request_ID, r.jobTitle, r.unitName, r.requesterName])) return;
    seen[r.Request_ID] = 1;
    out.reqs.push({ id: r.Request_ID, job: r.jobTitle, unit: r.unitName, Status: r.Status });
  });
  vacanciesList_(ctx, { view: 'all' }).rows.forEach(function (v) {
    if (out.vacs.length >= N || !has([v.Vacancy_ID, v.jobTitle, v.unitName, v.locationName])) return;
    out.vacs.push({ id: v.Vacancy_ID, job: v.jobTitle, unit: v.unitName, location: v.locationName, Status: v.Status, statusName: v.statusName });
  });
  if (personal && hasAnyRole_(ctx, empRoles_())) {
    out.emps = empList_(ctx, { q: raw, status: 'all', limit: N }).rows.map(function (e) {
      return { id: e.Employee_ID, name: e.Full_Name, title: e.title, unit: e.unitName, Status: e.Status };
    });
  }
  return out;
}
