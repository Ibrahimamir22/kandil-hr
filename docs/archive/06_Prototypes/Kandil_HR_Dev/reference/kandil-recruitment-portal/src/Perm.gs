/**
 * Perm.gs — authorization = role + organizational scope. Always resolved on the server.
 * Line-manager authority is not a role: it comes from holding a unit's head position
 * (or an active delegation from that position).
 */

function isEffective_(from, to, day) {
  day = day || today_();
  return (str_(from) === '' || from <= day) && (str_(to) === '' || to >= day);
}

function activeRoles_(userId) {
  return where_('USER_ROLES', function (r) {
    return r.User_ID === userId && isEffective_(r.Effective_From, r.Effective_To);
  });
}

function roleCodes_(ctx) {
  if (!ctx._roles) ctx._roles = activeRoles_(ctx.user.User_ID).map(function (r) { return r.Role_Code; });
  return ctx._roles;
}

function hasAnyRole_(ctx, roles) {
  var mine = roleCodes_(ctx);
  return roles.some(function (r) { return mine.indexOf(r) >= 0; });
}

function requireRole_(ctx, roles) {
  if (!hasAnyRole_(ctx, roles)) throw userError_('مالكش صلاحية على العملية دي.');
}

/** Children map of active org units. */
function unitChildren_() {
  var map = {};
  all_('ORG_UNITS').forEach(function (u) {
    if (u.Status !== 'Active') return;
    var p = u.Parent_Org_Unit_ID || '';
    (map[p] = map[p] || []).push(u.Org_Unit_ID);
  });
  return map;
}

function descendants_(unitId, childrenMap) {
  childrenMap = childrenMap || unitChildren_();
  var out = [], stack = [unitId], seen = {};
  while (stack.length) {
    var id = stack.pop();
    if (seen[id]) continue;                 // a broken tree (loop) must never hang the portal
    seen[id] = 1;
    out.push(id);
    (childrenMap[id] || []).forEach(function (c) { stack.push(c); });
  }
  return out;
}

/** Units the user heads directly or through an active delegation (top units only). */
function headedUnits_(user) {
  var positions = [];
  if (user.Position_ID) positions.push(user.Position_ID);
  where_('DELEGATIONS', function (d) {
    return d.To_User_ID === user.User_ID && d.Status === 'Active' && isEffective_(d.Effective_From, d.Effective_To) && dlgScopeHas_(d, 'TEAM');
  }).forEach(function (d) { positions.push(d.From_Position_ID); });
  if (!positions.length) return [];
  return where_('ORG_UNITS', function (u) {
    return u.Status === 'Active' && positions.indexOf(u.Head_Position_ID) >= 0;
  }).map(function (u) { return u.Org_Unit_ID; });
}

/** All unit IDs in the user's management scope (headed units + everything below). */
function managedScope_(user) {
  var cm = unitChildren_();
  var set = {};
  headedUnits_(user).forEach(function (u) { descendants_(u, cm).forEach(function (d) { set[d] = 1; }); });
  return Object.keys(set);
}

/** Scope granted through USER_ROLES rows with Scope_Type = ORG_UNIT. ALL returns null (= everything). */
function roleScope_(ctx) {
  var rows = activeRoles_(ctx.user.User_ID);
  if (rows.some(function (r) { return r.Scope_Type === 'ALL' || r.Scope_Type === ''; })) return null;
  var cm = unitChildren_(), set = {};
  rows.forEach(function (r) {
    if (r.Include_Children === 'Y') descendants_(r.Scope_Org_Unit_ID, cm).forEach(function (d) { set[d] = 1; });
    else set[r.Scope_Org_Unit_ID] = 1;
  });
  return Object.keys(set);
}
