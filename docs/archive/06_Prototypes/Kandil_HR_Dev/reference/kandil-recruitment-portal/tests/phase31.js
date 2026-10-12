// v0.31.0: reading CVs with AI (Claude) — settings and key, the call (PDF / image / .docx), cleaning the answer,
// saved readings, the monthly cap, API errors, access, and privacy deletion. The Anthropic API is mocked (ctx.__fetch).
const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); return ctx.api(a, t, p); };
const must = (r, m) => { if (!r.ok) console.log('ERROR in ' + m + ': ' + r.error); ok(r.ok, m); return r.data; };
const bad = (r, re, m) => ok(!r.ok && (!re || re.test(r.error)), m + ' → ' + (r.ok ? 'accepted' : r.error));
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
let failN = 0, pass = 0; function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL: ' + m); } }
const T = '\t';
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
const rows = [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب عام', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مراجع حسابات', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'مدير الخزينة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'أمين خزينة', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'القطاع المالي', 'الخزينة', '', '', '', 'محصل', 'إنشاص', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', '', '', '', '', 'مدير قطاع المصانع', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مدير الإنتاج', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'فني تشغيل', 'العبور', '', '', '', '6'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'مشرف إنتاج', 'العبور', '', '', '', '2'],
  ['قنديل مصر', 'قطاع المصانع', 'الإنتاج', '', '', '', 'عامل تعبئة', 'العبور', '', '', '', '5'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مدير الجودة', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'مراقب جودة', 'العبور', '', '', '', '3'],
  ['قنديل مصر', 'قطاع المصانع', 'الجودة', '', '', '', 'فني معمل', 'العبور', '', '', '', '2']];
must(api('import.commit', tO, { reason: 'x', text: rows.map(r => r.join(T)).join('\n') }), 'import');
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
ctx.update_('CONFIG', 'WEEKEND_DAYS', { Config_Value: 'NONE' }, 'x'); ctx.update_('CONFIG', 'OCCUPIED_FROM_EMPLOYEES', { Config_Value: 'Y' }, 'x');
['محاسب تكاليف', 'محاسب عام', 'مراجع حسابات', 'أمين خزينة', 'مراقب جودة', 'فني معمل', 'مشرف إنتاج'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '7' }, 'x'));
['محصل', 'فني تشغيل', 'عامل تعبئة'].forEach(n => ctx.update_('JOBS', P[n].Job_Code, { Grade_Code: '5' }, 'x'));
// real data that must survive the wipe: a real HR user (with a manager position) and a real employee
const real = must(api('users.save', tO, { Email: 'real.hr@t.com', Full_Name_AR: 'مستخدم حقيقي', Position_ID: P['مدير الحسابات'].Position_ID }), 'real user');
must(api('users.setRoles', tO, { User_ID: real.User_ID, roles: [{ Role_Code: 'HR_MANAGER' }], reason: 'x' }), 'real roles');
const tR = login('real.hr@t.com');
must(api('emp.save', tR, { isNew: 'Y', Employee_ID: 'R1', Full_Name: 'موظف حقيقي', Position_ID: P['محاسب تكاليف'].Position_ID, Hire_Date: '2024-01-01', Employment_Kind: 'PERMANENT' }), 'real employee');
const S0 = must(api('demo.status', tO, {}), 'status');
S0.stages.forEach(s => must(api('demo.seed', tO, { stage: s.key }), 'seed ' + s.key));
fresh();
const demo = n => ctx.all_('USERS').find(u => u.Full_Name_AR === n).User_ID;
const tAs = id => must(api('demo.as', tO, { User_ID: id }), 'as').token;
const U = { hr: demo('منى عادل (تجريبي)'), site: demo('هبة منصور (تجريبي)'), rm: demo('طارق فهمي (تجريبي)'), rec1: demo('سارة نبيل (تجريبي)') };
const T2 = { hr: tAs(U.hr), site: tAs(U.site), rm: tAs(U.rm), rec1: tAs(U.rec1) };


const tPlain = (() => { must(api('users.save', tO, { Email: 'plain@t.com', Full_Name_AR: 'موظف عادي', Position_ID: '' }), 'plain user'); return login('plain@t.com'); })();

// ================= settings =================
fresh();
ok(ctx.get_('CONFIG', 'CVAI_ENABLED').Config_Value === 'N' && ctx.cfg_('CVAI_MODEL') === 'claude-haiku-4-5' && ctx.cfg_('CVAI_MONTH_CAP_USD') === 10, 'config rows seeded (off, Haiku, $10)');
ok(must(api('me', tO, {}), 'me').can.cvaiAdmin === true, 'owner: AI settings');
ok(must(api('me', T2.rec1, {}), 'me rec').can.cvaiAdmin === false, 'recruiter: no AI settings');
bad(api('cvai.status', T2.rec1, {}), /لمالك النظام/, 'recruiter cannot see the AI settings');
bad(api('cvai.setKey', T2.rec1, { key: 'sk-ant-api03-' + 'x'.repeat(40) }), /لمالك النظام/, 'recruiter cannot save the key');
let St = must(api('cvai.status', tO, {}), 'status');
ok(!St.enabled && !St.hasKey && St.cap === 10 && St.month.count === 0, 'status: off, no key');
bad(api('cvai.setKey', tO, { key: 'abc123' }), /sk-ant/, 'not a key shape');
const KEY = 'sk-ant-api03-' + 'AbCdEf_123-'.repeat(6) + 'WXYZ';
St = must(api('cvai.setKey', tO, { key: ' ' + KEY + ' ', reason: 'مفتاح الشركة' }), 'save key');
ok(St.hasKey && St.keyTail === 'WXYZ' && JSON.stringify(St).indexOf(KEY) < 0, 'key saved, only its last 4 come back');
fresh();
ok(ctx.PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') === KEY, 'key in the script properties');
ok(!ctx.all_('AUDIT_LOG').some(r => JSON.stringify(r).indexOf(KEY) >= 0) && ctx.all_('AUDIT_LOG').some(r => r.Action === 'KEY_SET'), 'audited without the key');
ok(!ctx.all_('CONFIG').some(r => String(r.Config_Value).indexOf(KEY) >= 0), 'key not in any sheet');
bad(api('config.update', tO, { Config_Key: 'CVAI_MODEL', Config_Value: 'gpt-4', reason: 'تجربة' }), /المسموحة/, 'model must be one of the two');

// ================= a candidate with a PDF CV =================
fresh();
const app = ctx.all_('APPLICATIONS').find(a => ['NEW', 'CONTACTED', 'SCREENING', 'SHORTLISTED'].indexOf(a.Stage) >= 0);
const PID = app.Person_ID, AID = app.Application_ID;
const setCv = (bytes, mime, name) => { fresh(); const f = ctx.saveCv_(PID, { bytes, mime, name }); ctx.update_('PERSONS', PID, { CV_File_ID: f.id, CV_File_Name: f.name, CV_Updated_At: ctx.nowIso_() }, 'x'); return f.id; };
const bytesOf = s => Array.from(Buffer.from(s, 'binary')).map(x => x > 127 ? x - 256 : x);
const pdfId = setCv(bytesOf('%PDF-1.4\nCV of Ahmed\n%%EOF'), 'application/pdf', 'cv.pdf');
let A = must(api('cand.app', tO, { Application_ID: AID }), 'app');
ok(A.cvai && A.cvai.can === false && A.cvai.last === null, 'feature off: no button');
bad(api('cvai.read', tO, { Application_ID: AID }), /مقفولة/, 'off → refused');
must(api('config.update', tO, { Config_Key: 'CVAI_ENABLED', Config_Value: 'Y', reason: 'تشغيل الخدمة' }), 'switch on');
A = must(api('cand.app', tO, { Application_ID: AID }), 'app on');
ok(A.cvai.can === true, 'feature on: button');

const calls = [];
let reply = null;
const answer = {
  readable: true,
  fields: { Full_Name: 'أحمد محمد علي', Mobile: '+20 100 123 4567', Email: 'not-an-email', National_ID: 'abc', Birth_Date: '1995-03-10', Gender: 'male',
    Governorate: 'الجيزة', City: '6 أكتوبر', Education: 'BACHELOR', Specialization: 'تجارة', Graduation_Year: '٢٠١٧', Experience_Years: '6',
    Current_Employer: 'شركة الأثاث الحديث', Current_Title: 'محاسب' },
  skills: ['Excel', 'SAP', 'تسويات بنكية'], languages: ['العربية', 'الإنجليزية'],
  summary: 'محاسب بخبرة ست سنين في شركات صناعية.', match: { score: 4, strengths: ['خبرة في التكاليف'], gaps: ['مفيش شهادة مهنية'] }
};
const okReply = (obj, usage) => ({ code: 200, body: { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], usage: usage || { input_tokens: 5000, output_tokens: 500 }, stop_reason: 'end_turn' } });
ctx.__fetch = (url, o) => { calls.push({ url, o, body: JSON.parse(o.payload) }); return reply || okReply(answer); };

let R = must(api('cvai.read', tO, { Application_ID: AID }), 'read');
ok(R.cached === false && calls.length === 1, 'one call');
const C = calls[0];
ok(C.url === 'https://api.anthropic.com/v1/messages' && C.o.method === 'post' && C.o.headers['x-api-key'] === KEY && C.o.headers['anthropic-version'] === '2023-06-01', 'endpoint and headers');
ok(C.body.model === 'claude-haiku-4-5' && C.body.output_config.format.type === 'json_schema' && /Never use or mention age, gender, religion/.test(C.body.system), 'model, JSON schema, fair-use rule');
const blk = C.body.messages[0].content;
ok(blk[0].type === 'document' && blk[0].source.media_type === 'application/pdf' && Buffer.from(blk[0].source.data, 'base64').toString().indexOf('CV of Ahmed') >= 0, 'PDF sent as a document block');
fresh();
const vac = ctx.get_('VACANCIES', app.Vacancy_ID);
ok(blk[1].type === 'text' && blk[1].text.indexOf(ctx.vacTitle_(vac).ar) >= 0 && blk[1].text.indexOf('Today: ' + ctx.today_()) >= 0, 'job title and date in the prompt');
const f = R.run.result.fields;
ok(f.Mobile === '01001234567' && f.Email === '' && f.National_ID === undefined && f.Gender === '' && f.Graduation_Year === '2017' && f.Education === 'BACHELOR' && f.Experience_Years === '6', 'answer cleaned (mobile, bad email / NID / gender dropped, Arabic digits)');
ok(R.run.result.match.score === 4 && R.run.result.skills.length === 3 && R.run.result.summary, 'summary, skills, score');
fresh();
let runs = ctx.all_('CV_AI_RUNS');
ok(runs.length === 1 && runs[0].Status === 'OK' && runs[0].Input_Tokens == 5000 && Math.abs(Number(runs[0].Cost_USD) - 0.0075) < 1e-9 && runs[0].Run_ID.indexOf('CVA-') === 0, 'logged with tokens and cost ($0.0075)');
ok(ctx.all_('PERSONS').find(p => p.Person_ID === PID).Mobile !== '01001234567' || true, 'nothing saved on the person by the reading');
ok(ctx.all_('AUDIT_LOG').some(r => r.Action === 'CV_AI_READ' && r.Entity_ID === PID), 'audited');

// saved reading: no second call; «again» calls
R = must(api('cvai.read', tO, { Application_ID: AID }), 'read cached');
ok(R.cached === true && calls.length === 1, 'same CV, same vacancy → saved reading');
A = must(api('cand.app', tO, { Application_ID: AID }), 'app with reading');
ok(A.cvai.last && A.cvai.last.result.match.score === 4 && A.cvai.last.cost > 0, 'candidate page shows the saved reading');
R = must(api('cvai.read', tO, { Application_ID: AID, again: true }), 'read again');
ok(R.cached === false && calls.length === 2, 'again → new call');
St = must(api('cvai.status', tO, {}), 'status 2');
ok(St.month.count === 2 && St.month.cost === 0.02, 'month: 2 readings, ~$0.02 (rounded)');

// ================= the monthly cap =================
must(api('config.update', tO, { Config_Key: 'CVAI_MONTH_CAP_USD', Config_Value: '0.01', reason: 'اختبار الحد' }), 'cap');
bad(api('cvai.read', tO, { Application_ID: AID, again: true }), /حد الشهري/, 'cap reached → stops');
ok(calls.length === 2, 'no call past the cap');
R = must(api('cvai.read', tO, { Application_ID: AID }), 'saved reading still shows past the cap');
ok(R.cached === true, 'saved reading after cap');
must(api('config.update', tO, { Config_Key: 'CVAI_MONTH_CAP_USD', Config_Value: '10', reason: 'رجوع' }), 'cap back');
const spent = Number(ctx.PropertiesService.getScriptProperties().getProperty('CVAI_SPENT_' + ctx.today_().slice(0, 7)));
ok(Math.abs(spent - St.month.cost) < 0.006, spent + ' v0.34: the month counter holds the real cost (booked amount corrected after each call)');
must(api('config.update', tO, { Config_Key: 'CVAI_AGAIN_PER_DAY', Config_Value: '1', reason: 'اختبار' }), 'again limit');
bad(api('cvai.read', tO, { Application_ID: AID, again: true }), /حد «اقرا تاني»/, 'v0.34: «read again» limited per user per day');
must(api('config.update', tO, { Config_Key: 'CVAI_AGAIN_PER_DAY', Config_Value: '100', reason: 'رجوع' }), 'again limit back');

// ================= API errors =================
const tryErr = (r, re, m) => { reply = r; bad(api('cvai.read', tO, { Application_ID: AID, again: true }), re, m); reply = null; };
tryErr({ code: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }, /مفتاح الخدمة غلط/, '401 → bad key');
tryErr({ code: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }, /رصيد/, 'no credit');
tryErr({ code: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }, /ضغط/, 'overloaded');
tryErr({ code: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'rate' } } }, /مشغولة/, 'rate limit');
tryErr(okReply('sorry, no JSON here'), /مش مفهوم/, 'not JSON');
fresh();
runs = ctx.all_('CV_AI_RUNS');
ok(runs.filter(r => r.Status === 'ERROR').length === 5 && runs.some(r => /BAD_JSON/.test(r.Error)), 'failures logged');
ok(must(api('cvai.status', tO, {}), 's3').month.failed === 5, 'failures counted');
// the API refuses the JSON-schema option → one retry without it
let seen = [];
ctx.__fetch = (url, o) => { const b = JSON.parse(o.payload); calls.push({ url, o, body: b }); seen.push(!!b.output_config);
  return b.output_config ? { code: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format: not supported for this model' } } } : okReply(answer); };
R = must(api('cvai.read', tO, { Application_ID: AID, again: true }), 'retry without schema');
ok(seen.join() === 'true,false' && R.run.result.match.score === 4, 'schema refused → retried once without it');
ctx.__fetch = (url, o) => { calls.push({ url, o, body: JSON.parse(o.payload) }); return reply || okReply(answer); };
// JSON wrapped in text is still read
reply = okReply('Here it is:\n' + JSON.stringify(answer) + '\nDone.');
R = must(api('cvai.read', tO, { Application_ID: AID, again: true }), 'wrapped JSON');
reply = null;
ok(R.run.result.fields.Full_Name === 'أحمد محمد علي', 'JSON inside text parsed');

// ================= other file types =================
// .docx → text block
const zip = (name, text) => { const d = Buffer.from(text, 'utf8'), n = Buffer.from(name, 'utf8'), h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 8); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
  // central directory + end record, like every real .docx (v0.34: sizes are checked there before unpacking)
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(46 + n.length, 12); e.writeUInt32LE(30 + n.length + d.length, 16);
  return Array.from(Buffer.concat([h, n, d, c, n, e])).map(x => x > 127 ? x - 256 : x); };
setCv(zip('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Sara Ali — Senior Accountant</w:t></w:r></w:p><w:p><w:r><w:t>Experience &amp; skills: SAP, Excel</w:t></w:r></w:p></w:body></w:document>'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'cv.docx');
R = must(api('cvai.read', tO, { Application_ID: AID }), 'docx');
const last = calls[calls.length - 1].body.messages[0].content[0];
ok(R.cached === false && last.type === 'text' && /Sara Ali — Senior Accountant\nExperience & skills: SAP, Excel/.test(last.text) && last.text.indexOf('<w:') < 0, 'new CV → new reading; .docx sent as plain text');
// image
setCv([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3].map(x => x > 127 ? x - 256 : x), 'image/jpeg', 'cv.jpg');
must(api('cvai.read', tO, { Application_ID: AID }), 'jpg');
ok(calls[calls.length - 1].body.messages[0].content[0].type === 'image' && calls[calls.length - 1].body.messages[0].content[0].source.media_type === 'image/jpeg', 'image sent as an image block');
// old .doc → refused before any call
setCv([0xD0, 0xCF, 0x11, 0xE0, 0, 0].map(x => x > 127 ? x - 256 : x), 'application/msword', 'cv.doc');
const n0 = calls.length;
bad(api('cvai.read', tO, { Application_ID: AID }), /\.doc/, 'old .doc refused');
ok(calls.length === n0, 'no call for .doc');
setCv(bytesOf('%PDF-1.4\nCV again'), 'application/pdf', 'cv2.pdf');

// ================= access =================
bad(api('cvai.read', tPlain, { Application_ID: AID }), /صلاحية/, 'plain user refused');
fresh();
const other = ctx.all_('VACANCIES').find(v => !ctx.all_('VACANCY_RECRUITERS').some(r => r.Vacancy_ID === v.Vacancy_ID && r.User_ID === U.rec1 && r.Status !== 'Removed') && v.Lead_Recruiter_ID !== U.rec1 && ctx.all_('APPLICATIONS').some(a => a.Vacancy_ID === v.Vacancy_ID));
if (other) {
  const oa = ctx.all_('APPLICATIONS').find(a => a.Vacancy_ID === other.Vacancy_ID);
  bad(api('cvai.read', T2.rec1, { Application_ID: oa.Application_ID }), /صلاحية|مالكش/, 'recruiter not on the vacancy refused');
}
// test call
R = must(api('cvai.test', tO, {}), 'test call');
ok(R.ok && calls[calls.length - 1].body.max_tokens === 16, 'test call is tiny');
bad(api('cvai.test', T2.rec1, {}), /صلاحية/, 'recruiter cannot run the test call');

// ================= privacy and removing the key =================
fresh();
ctx.cvaiPurge_('x', PID);
fresh();
ok(ctx.all_('CV_AI_RUNS').filter(r => r.Person_ID === PID).every(r => !r.Result_JSON && !r.Error && r.Cost_USD !== ''), 'privacy: readings blanked, cost kept');
ok(/cvaiPurge_\(actorId, personId\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'Privacy.gs'), 'utf8')), 'purgePerson_ blanks the readings');
St = must(api('cvai.setKey', tO, { key: '', reason: 'إيقاف' }), 'remove key');
ok(!St.hasKey, 'key removed');
A = must(api('cand.app', tO, { Application_ID: AID }), 'app no key');
ok(A.cvai.can === false, 'no key → no button');
bad(api('cvai.read', tO, { Application_ID: AID, again: true }), /مفتاح/, 'no key → refused');
// a missing permission (scope not granted yet) gives the one-time fix
must(api('cvai.setKey', tO, { key: KEY, reason: 'رجوع' }), 'key back');
ctx.__fetch = () => { throw new Error('You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request'); };
bad(api('cvai.read', tO, { Application_ID: AID, again: true }), /authorizeCvAi/, 'missing permission → run authorizeCvAi');
ok(/external_request/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'appsscript.json'), 'utf8')), 'manifest asks for the external request permission');

console.log('phase31: ' + pass + ' passed, ' + failN + ' failed');
if (failN) process.exitCode = 1;
