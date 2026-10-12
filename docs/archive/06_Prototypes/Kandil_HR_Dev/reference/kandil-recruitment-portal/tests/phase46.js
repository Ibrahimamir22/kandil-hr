// v0.44.3: the upgrade after a deploy reads a sheet that just got new columns from the sheet, not from the shared cache
// taken before the upgrade. In production the v0.44.0 migration wrote the new ONB_TASKS «Kind» column against a cached
// copy with the old headers («unknown column Kind»), so the upgrade failed and re-ran on every request — sign-in included.
const { ctx, mails, props, fresh, vm } = require('./mocks');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const VER = vm.runInContext('APP.VERSION', ctx), OLD = vm.runInContext('ONB_BIO_OLD_', ctx), NEW = vm.runInContext('ONB_BIO_TITLE_', ctx);

// an open day-one task as v0.43 left it
fresh(); ctx.withLock_(() => ctx.insert_('ONB_TASKS', { Task_ID: 'T1', Onboarding_ID: 'O1', Title: OLD, Status: 'OPEN', Phase: 'DAY1' }, 'x'));
// the sheet as it was before v0.44.0: no «Kind» column (it is the last one)
function dropKind(table) {
  fresh(); const sh = ctx.sheet_(table), head = sh.data[0], k = head.indexOf('Kind');
  sh.data.forEach(r => { if (r) r.splice(k, 1); });
}
dropKind('ONB_TASKS'); dropKind('ONB_TEMPLATE_ITEMS');
// the portal in use before the deploy: the table is read and cached with its old headers
vm.runInContext("DIRTY_['ONB_TASKS'] = 1; DIRTY_['ONB_TEMPLATE_ITEMS'] = 1; tcRetire_();", ctx);
fresh(); ctx.all_('ONB_TASKS'); ctx.all_('ONB_TEMPLATE_ITEMS');
fresh(); ok(!('Kind' in ctx.all_('ONB_TASKS')[0]), 'the cached copy has the old headers (the production state)');
// the deploy of v0.44.0: the migration has not run, the signatures say the two sheets changed
delete props.MIG_0440; props.SCHEMA_APP_VERSION = '0.43.1';
const sig = JSON.parse(props.SCHEMA_SIG); sig.ONB_TASKS = 'old'; sig.ONB_TEMPLATE_ITEMS = 'old'; props.SCHEMA_SIG = JSON.stringify(sig);

// the first request after the deploy: a sign-in
mails.length = 0;
const r = pub('auth.requestCode', { email: 'owner@test.com' });
ok(r.ok, 'the first request after the deploy succeeds (the upgrade does not fail): ' + (r.error || ''));
ok(props.SCHEMA_APP_VERSION === VER && props.MIG_0440 === '1', 'the upgrade finished and the migration is recorded');
fresh(); const t = ctx.get_('ONB_TASKS', 'T1');
ok(t.Kind === 'BIO' && t.Title === NEW, 'the open task became the ZKBioTime enrolment task');
ok(ctx.sheet_('ONB_TASKS').data[0].indexOf('Kind') >= 0, 'the «Kind» column is on the sheet');
const r2 = pub('auth.requestCode', { email: 'owner@test.com' });
ok(r2.ok, 'the next request: no upgrade, no error');

console.log('\nPhase 46 (upgrade reads changed sheets fresh): ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
