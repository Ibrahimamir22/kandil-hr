// Structure editing scenario
const { ctx, mails, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } };
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const T = '\t';
must(api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع التصنيع', '', '', '', '', 'مدير التصنيع', 'العبور', '', 'Y', '', ''],
].map(r => r.join(T)).join('\n') }), 'import');
fresh();
const U = n => ctx.all_('ORG_UNITS').find(u => u.Name_AR === n);
const P = t => ctx.all_('POSITIONS').find(p => ctx.get_('JOBS', p.Job_Code).Job_Title_AR === t);
must(api('users.save', tO, { Email: 'hr@t.com', Full_Name_AR: 'HR' }), 'hr user');
fresh(); const hrId = ctx.all_('USERS').find(u => u.Email === 'hr@t.com').User_ID;
must(api('users.setRoles', tO, { User_ID: hrId, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'hr role');
const tH = login('hr@t.com');

let r = api('org.unitSave', tH, { Parent_Org_Unit_ID: U('الحسابات').Org_Unit_ID, Unit_Type: 'SECTION', Name_AR: 'الخزينة', reason: 'قرار' });
ok(!r.ok, 'HR manager cannot edit structure');
r = must(api('me', tO), 'me'); ok(r.can.orgEdit, 'owner can edit');
r = api('org.unitSave', tO, { Parent_Org_Unit_ID: U('الحسابات').Org_Unit_ID, Unit_Type: 'SECTOR', Name_AR: 'غلط', reason: 'قرار' });
ok(!r.ok && /أقل/.test(r.error), 'child type must be lower');
r = api('org.unitSave', tO, { Parent_Org_Unit_ID: U('الحسابات').Org_Unit_ID, Unit_Type: 'SECTION', Name_AR: 'الخزينة' });
ok(!r.ok, 'reason required');
const treas = must(api('org.unitSave', tO, { Parent_Org_Unit_ID: U('الحسابات').Org_Unit_ID, Unit_Type: 'SECTION', Name_AR: 'الخزينة', reason: 'قرار الإدارة' }), 'add section');
r = api('org.unitSave', tO, { Parent_Org_Unit_ID: U('الحسابات').Org_Unit_ID, Unit_Type: 'SECTION', Name_AR: 'الخزينة', reason: 'قرار' });
ok(!r.ok && /نفس الاسم/.test(r.error), 'duplicate name blocked');
must(api('org.unitSave', tO, { Org_Unit_ID: treas.Org_Unit_ID, Name_AR: 'الخزينة والبنوك', reason: 'تغيير المسمى' }), 'rename');
// positions
const loc = ctx.all_('LOCATIONS')[0].Location_ID;
const head = must(api('org.positionCreate', tO, { Org_Unit_ID: treas.Org_Unit_ID, New_Job_Title: 'رئيس الخزينة', Job_Family: 'ACC', Location_ID: loc, reason: 'وظيفة جديدة' }), 'add head position');
ok(head.Job_Code === 'ACC-001', 'job code from family: ' + head.Job_Code);
r = api('org.positionCreate', tO, { Org_Unit_ID: treas.Org_Unit_ID, New_Job_Title: 'كاشير', reason: 'وظيفة جديدة' });
ok(!r.ok && /العائلة/.test(r.error), 'family required for new title');
ok(head.Reports_To_Position_ID === P('مدير الحسابات').Position_ID, 'new position reports to nearest head above');
const cashier = must(api('org.positionCreate', tO, { Org_Unit_ID: treas.Org_Unit_ID, New_Job_Title: 'أمين خزينة', Job_Family: 'ACC', Structural_HC: '3', reason: 'وظيفة جديدة' }), 'add cashier');
ok(cashier.Job_Code === 'ACC-002', 'second code in family');
ok(cashier.Structural_HC === '3' && cashier.Reports_To_Position_ID === P('مدير الحسابات').Position_ID, 'cashier hc 3');
r = api('org.unitSetHead', tO, { Org_Unit_ID: treas.Org_Unit_ID, Head_Position_ID: P('محاسب').Position_ID, reason: 'x y z' });
ok(!r.ok && /نفس الوحدة/.test(r.error), 'head must be in the unit');
r = must(api('org.unitSetHead', tO, { Org_Unit_ID: treas.Org_Unit_ID, Head_Position_ID: head.Position_ID, reason: 'تعيين رئيس' }), 'set head');
ok(r.repointed === 1, 'cashier repointed to new head');
fresh();
ok(ctx.get_('POSITIONS', cashier.Position_ID).Reports_To_Position_ID === head.Position_ID && ctx.get_('POSITIONS', head.Position_ID).Is_Head_Of_Unit === 'Y', 'reporting lines updated');
// unit codes: sector needs a code; children get one automatically
r = api('org.unitSave', tO, { Parent_Org_Unit_ID: U('قنديل مصر').Org_Unit_ID, Unit_Type: 'SECTOR', Name_AR: 'قطاع جديد', reason: 'تجربة' });
ok(!r.ok && /كود القطاع/.test(r.error), 'sector code required');
const ns = must(api('org.unitSave', tO, { Parent_Org_Unit_ID: U('قنديل مصر').Org_Unit_ID, Unit_Type: 'SECTOR', Name_AR: 'قطاع جديد', Unit_Code: 'NEW', reason: 'تجربة' }), 'sector with code');
const d1 = must(api('org.unitSave', tO, { Parent_Org_Unit_ID: ns.Org_Unit_ID, Unit_Type: 'DEPARTMENT', Name_AR: 'إدارة 1', reason: 'تجربة' }), 'dept auto code');
const d2 = must(api('org.unitSave', tO, { Parent_Org_Unit_ID: ns.Org_Unit_ID, Unit_Type: 'DEPARTMENT', Name_AR: 'إدارة 2', reason: 'تجربة' }), 'dept auto code 2');
const s1 = must(api('org.unitSave', tO, { Parent_Org_Unit_ID: d2.Org_Unit_ID, Unit_Type: 'SECTION', Name_AR: 'قسم', reason: 'تجربة' }), 'section auto code');
ok(d1.Unit_Code === 'NEW-01' && d2.Unit_Code === 'NEW-02' && s1.Unit_Code === 'NEW-02-01', 'auto unit codes ' + [d1.Unit_Code, d2.Unit_Code, s1.Unit_Code]);
r = api('org.unitSave', tO, { Parent_Org_Unit_ID: U('قنديل مصر').Org_Unit_ID, Unit_Type: 'SECTOR', Name_AR: 'قطاع تاني', Unit_Code: 'NEW', reason: 'تجربة' });
ok(!r.ok && /مستخدم/.test(r.error), 'duplicate unit code blocked');
// move unit
r = api('org.unitMove', tO, { Org_Unit_ID: U('الحسابات').Org_Unit_ID, Parent_Org_Unit_ID: treas.Org_Unit_ID, reason: 'x y z' });
ok(!r.ok, 'cannot move under own child');
must(api('org.unitMove', tO, { Org_Unit_ID: treas.Org_Unit_ID, Parent_Org_Unit_ID: U('قطاع التصنيع').Org_Unit_ID, reason: 'إعادة تنظيم' }), 'move section to other sector');
fresh();
ok(ctx.get_('POSITIONS', head.Position_ID).Reports_To_Position_ID === P('مدير التصنيع').Position_ID, 'moved head reports to new sector head');
// chain follows new structure: request from cashier position by owner → line chain starts at treasury head → manufacturing sector
// close guards
r = api('org.unitClose', tO, { Org_Unit_ID: treas.Org_Unit_ID, reason: 'x y z' });
ok(!r.ok && /وظيفة شغالة/.test(r.error), 'cannot close unit with positions');
r = api('positions.update', tO, { Position_ID: head.Position_ID, Status: 'Closed', reason: 'x y z' });
ok(!r.ok && /مدير الوحدة/.test(r.error), 'cannot close head position');
// open work blocks moving a position
must(api('users.save', tO, { Email: 'mgr@t.com', Full_Name_AR: 'مدير', Position_ID: head.Position_ID }), 'link manager');
const tM = login('mgr@t.com');
must(api('req.save', tM, { Recruitment_Type: 'VACANT', lines: [{ Position_ID: cashier.Position_ID, Requested_HC: 1 }] }), 'draft on cashier');
r = api('org.positionMove', tO, { Position_ID: cashier.Position_ID, Org_Unit_ID: U('الحسابات').Org_Unit_ID, reason: 'x y z' });
ok(!r.ok && /شغل مفتوح/.test(r.error), 'open request blocks move');
fresh(); const d = ctx.all_('RECRUITMENT_REQUESTS')[0].Request_ID;
must(api('req.cancel', tM, { Request_ID: d }), 'cancel draft');
must(api('org.positionMove', tO, { Position_ID: cashier.Position_ID, Org_Unit_ID: U('الحسابات').Org_Unit_ID, reason: 'نقل' }), 'move position');
fresh(); ok(ctx.get_('POSITIONS', cashier.Position_ID).Reports_To_Position_ID === P('مدير الحسابات').Position_ID, 'moved position reports to new unit head');
// clear head, close unit
must(api('org.unitSetHead', tO, { Org_Unit_ID: treas.Org_Unit_ID, Head_Position_ID: '', reason: 'إلغاء' }), 'clear head');
must(api('positions.update', tO, { Position_ID: head.Position_ID, Status: 'Closed', reason: 'إلغاء' }), 'close position');
must(api('org.unitClose', tO, { Org_Unit_ID: treas.Org_Unit_ID, reason: 'إلغاء القسم' }), 'close unit');
r = must(api('org.tree', tO), 'tree'); ok(!r.some(u => u.id === treas.Org_Unit_ID), 'closed unit hidden from tree');
r = must(api('org.unitHistory', tH, { Org_Unit_ID: treas.Org_Unit_ID }), 'history');
ok(r.length === 6, 'unit history rows ' + r.length);
r = must(api('lookups', tO), 'lookups'); ok(r.families && r.families.PRD, 'families in lookups');
fresh(); ok(ctx.all_('AUDIT_LOG').some(a => a.Entity_Type === 'ORG_UNIT' && a.Action === 'CLOSE'), 'audited');
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
