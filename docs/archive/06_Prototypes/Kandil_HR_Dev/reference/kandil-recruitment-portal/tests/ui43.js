// v0.42.0 UI (CHG-87): the section colour follows the screen; the inbox home with its filter chips; the search box (Ctrl K)
// opens a candidate; the stage board moves a candidate by dragging (the same dialog, the data really changes); the
// candidate file's tabs; the offer's guided steps (the salary, the benefits, the review, the sending).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { ctx, mails, fresh, vm } = require('./mocks');
const pub = (a, p) => { fresh(); return ctx.apiPublic(a, p); };
const api = (a, t, p) => { fresh(); const r = ctx.api(a, t, p); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
function login(email) {
  fresh(); ctx.all_('LOGIN_CODES').forEach(c => ctx.update_('LOGIN_CODES', c.Code_ID, { Created_At: '2000-01-01T00:00:00' }, 'x'));
  mails.length = 0; pub('auth.requestCode', { email });
  const code = /<b[^>]*>(\d{6})<\/b>/.exec(mails[0].htmlBody)[1];
  return pub('auth.verifyCode', { email, code }).data.token;
}
const T = '\t';
ctx.__keepNet = true;
ctx.setupSystem();
vm.runInContext("OWNER_EMAIL='owner@test.com'; OWNER_NAME_AR='محمد عمارة';", ctx);
fresh(); ctx.bootstrapOwner();
const tO = login('owner@test.com');
api('import.commit', tO, { reason: 'x', text: [
  ['قنديل مصر', '', '', '', '', '', 'الرئيس التنفيذي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', '', '', '', '', 'مدير القطاع المالي', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'مدير الحسابات', 'العبور', '', 'Y', '', ''],
  ['قنديل مصر', 'القطاع المالي', 'الحسابات', '', '', '', 'محاسب تكاليف', 'العبور', '', '', '', '4']].map(r => r.join(T)).join('\n') });
fresh(); const P = {}; ctx.all_('POSITIONS').forEach(p => { P[ctx.get_('JOBS', p.Job_Code).Job_Title_AR] = p; });
const user = (email, name, roles) => { const u = api('users.save', tO, { Email: email, Full_Name_AR: name }).User_ID; api('users.setRoles', tO, { User_ID: u, roles: roles.map(r => ({ Role_Code: r })), reason: 'x' }); return u; };
const rec = user('rec@t.com', 'سارة', ['RECRUITER']), rm = user('rm@t.com', 'مدير التوظيف', ['RECRUITMENT_MANAGER']);
const tR = login('rec@t.com'), tM = login('rm@t.com');
const JOB = P['محاسب تكاليف'].Job_Code, today = ctx.today_();
fresh(); ctx.update_('JOBS', JOB, { Grade_Code: '7', Collar: 'W' }, 'x');
api('pay.structures', tO, { rows: [{ grade: '7', min: '5800', mid: '8000', max: '12000' }], reason: 'هيكل 2026' });
const rq = api('req.submit', tO, { Recruitment_Type: 'VACANT', Employment_Type: 'FULL_TIME', Work_Model: 'ON_SITE', Shift_Pattern: 'FIXED', Reason_Category: 'WORKLOAD',
  Justification: 'محتاجين محاسب تكاليف للمصنع', Requested_Priority: 'NORMAL', Required_By_Date: '2099-01-01', lines: [{ Position_ID: P['محاسب تكاليف'].Position_ID, Requested_HC: 2 }] });
fresh(); const V = ctx.find_('VACANCIES', { Request_ID: rq.Request_ID })[0];
api('vac.assign', tM, { Vacancy_ID: V.Vacancy_ID, Lead_Recruiter_ID: rec }); api('vac.update', tM, { Vacancy_ID: V.Vacancy_ID, action: 'OPEN' });
const A = api('cand.create', tR, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'كريم عادل منصور', Mobile: '01011112222', Gender: 'M', Source: 'WALK_IN', consent: 'Y' }).application.Application_ID;
const B = api('cand.create', tR, { Vacancy_ID: V.Vacancy_ID, Full_Name: 'ياسمين فؤاد', Mobile: '01011113333', Gender: 'F', Source: 'WALK_IN', consent: 'Y' }).application.Application_ID;
// B: selected, ready for an offer
api('cand.move', tR, { Application_ID: B, to: 'SHORTLISTED' });
const iv = api('int.create', tR, { Application_ID: B, Round_ID: 'R1', Date: today, Time: '09:00', Mode: 'PHONE', panel: [{ User_ID: rec, Role: 'LEAD' }] }).interview;
api('int.action', tR, { Interview_ID: iv.Interview_ID, action: 'START' });
api('sel.save', tR, { Application_ID: B, Decision: 'SELECTED', Reason: 'أفضل مرشح', Override_Reason: 'التقييم اتعمل شفهي', confirmOver: 'Y' });
// something waiting in the recruiter's inbox: a follow-up due (contact) and a fresh applicant
api('cand.next', tR, { Application_ID: A, Next_Action: 'مكالمة متابعة', Next_Action_Date: ctx.addDaysYmd_(today, -1), Next_Action_Owner: rec });
fresh(); ctx.update_('APPLICATIONS', A, { Stage_At: ctx.addDaysYmd_(today, -5) + 'T09:00:00' }, 'x');     // 5 days in «جديد»

const OUT = process.env.SHOTS || '.';
const QR = fs.readFileSync(path.join(__dirname, '..', 'src', 'QrLib.html'), 'utf8');
const shim = `<script>window.google={script:{get run(){var s={},f={};var o={withSuccessHandler:function(fn){s.fn=fn;return o;},withFailureHandler:function(fn){f.fn=fn;return o;},apiPublic:function(){window.__srv('apiPublic',Array.from(arguments)).then(s.fn,f.fn);},api:function(){window.__srv('api',Array.from(arguments)).then(s.fn,f.fn);}};return o;}}};</script>`;
const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8').replace("<?!= include_('QrLib') ?>", QR).replace('<script>', shim + '<script>');
(async () => {
  const errors = []; const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await ctxB.exposeFunction('__srv', (f, a) => { fresh(); return JSON.parse(JSON.stringify(ctx[f].apply(null, a))); });
  const openTok = async tok => { await page.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tok) + ' || loadToken();')); await page.waitForSelector('.shell'); };
  const shot = n => page.screenshot({ path: OUT + '/v0420-' + n + '.png', fullPage: true });
  const sec = () => page.evaluate(() => document.body.getAttribute('data-sec'));
  const scColor = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--sc').trim().toUpperCase());
  // ---- the inbox home
  await openTok(tR); await page.waitForSelector('.todo');
  if (await sec() !== 'home') errors.push('home section colour: ' + await sec());
  const rows = await page.$$eval('.todo .todo-row', r => r.map(x => x.dataset.cat));
  if (!rows.includes('talk')) errors.push('a «contact» item in the inbox: ' + rows.join(','));
  if (!(await page.$('[data-ic="talk"]'))) errors.push('the «تواصل» filter chip');
  else {
    await page.click('[data-ic="talk"]');
    const shown = await page.$$eval('.todo .todo-row', r => r.filter(x => !x.classList.contains('hidden')).map(x => x.dataset.cat));
    if (!shown.length || shown.some(c => c !== 'talk')) errors.push('the chip filters the inbox: ' + shown.join(','));
    await page.click('[data-ic="all"]');
  }
  if (!/عاجل/.test(await page.textContent('.todo'))) errors.push('the late follow-up is marked urgent');
  await page.waitForFunction(() => /محاسب تكاليف/.test((document.getElementById('homeVac') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => errors.push('«your vacancies» side card'));
  await shot('1-inbox');
  // ---- the search box: Ctrl K, type, open the candidate
  await page.keyboard.press('Control+k');
  if (!(await page.evaluate(() => document.activeElement && document.activeElement.id === 'gsQ'))) errors.push('Ctrl K focuses the search');
  await page.keyboard.type('كريم عادل');
  await page.waitForSelector('#gsR [data-gs="app"]', { timeout: 8000 }).catch(() => errors.push('the candidate in the search results'));
  if (await page.$('#gsR') && /01011112222/.test(await page.textContent('#gsR'))) errors.push('no mobile in the results');
  await shot('2-search');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#aBack', { timeout: 8000 }).catch(() => errors.push('Enter opens the first result'));
  if (await page.evaluate(() => S.view + ':' + S.arg) !== 'app:' + A) errors.push('opened the right candidate: ' + await page.evaluate(() => S.view + ':' + S.arg));
  if (await sec() !== 'cand' || await scColor() !== '#6E2A6B') errors.push('the candidates section colour: ' + await sec() + ' ' + await scColor());
  // ---- the candidate file's tabs
  if (!(await page.$('.ctabs [data-ct="all"].on'))) errors.push('«الكل» first');
  await page.click('.ctabs [data-ct="log"]');
  if (!(await page.isVisible('#acAdd')) || await page.isVisible('#aEdit')) errors.push('the log tab shows the log only');
  if (!(await page.isVisible('.nextcard'))) errors.push('the next step stays on the side');
  await shot('3-candidate-tabs');
  await page.click('.ctabs [data-ct="data"]');
  if (!(await page.isVisible('#aEdit')) || await page.isVisible('#acAdd')) errors.push('the data tab');
  // ---- the stage board: drag NEW → CONTACTED
  await page.evaluate(id => go('pipe', id), V.Vacancy_ID); await page.waitForSelector('.board');
  if (await sec() !== 'rec') errors.push('the recruitment section colour on the pipeline: ' + await sec());
  const cols = await page.$$eval('.bcol', c => c.map(x => x.dataset.col));
  if (cols.join(',') !== 'NEW,CONTACTED,SCREENING,SHORTLISTED,INTERVIEW,OFFER,ACCEPTED') errors.push('board columns: ' + cols.join(','));
  if (!(await page.$('.bcol[data-col="NEW"] [data-drag="' + A + '"]'))) errors.push('Karim in «جديد»');
  const aDays = await page.textContent('.bcol [data-drag="' + A + '"] .kdays').catch(() => '');
  if (!/5 يوم/.test(aDays) || !(await page.$('.bcol [data-drag="' + A + '"] .kdays.late'))) errors.push('5 days in the stage, marked (over 3 days): ' + aDays);
  if (!(await page.$('.bcol[data-col="OFFER"] [data-drag="' + B + '"]:not([draggable])'))) errors.push('the selected candidate in «عرض وظيفي», not draggable');
  await shot('4-board');
  await page.dragAndDrop('.bcol [data-drag="' + A + '"]', '.bcol[data-col="CONTACTED"]');
  await page.waitForSelector('#mActions', { timeout: 8000 }).catch(() => errors.push('dropping opens the move dialog'));
  if (await page.$('#mActions')) {
    await page.click('#mActions button:first-child');
    await page.waitForSelector('.bcol[data-col="CONTACTED"] [data-drag="' + A + '"]', { timeout: 8000 }).catch(() => errors.push('the board redrawn with Karim in «تم التواصل»'));
  }
  fresh(); if (ctx.get_('APPLICATIONS', A).Stage !== 'CONTACTED') errors.push('the drag really moved the candidate: ' + ctx.get_('APPLICATIONS', A).Stage);
  // the offer column refuses a drop (offers go through the offer form)
  const refused = await page.evaluate(id => boardDropOk(S.pipe.rows.filter(x => x.Application_ID === id)[0], 'OFFER'), A);
  if (refused) errors.push('no dropping into «عرض وظيفي»');
  await page.click('[data-pv="list"]'); if (!(await page.$('#pList .ccards'))) errors.push('the cards view still there');
  await page.click('[data-pv="board"]');
  // ---- the offer's guided steps
  await page.evaluate(id => go('app', id), B); await page.waitForSelector('#ofNew'); await page.click('#ofNew'); await page.waitForSelector('#ofRail');
  if (await page.isVisible('#ofD') || await page.isVisible('#ofSend')) errors.push('step 1 shows the salary only, no send yet');
  await page.click('#ofNext');
  if (!/المبلغ المتفق عليه/.test(await page.textContent('#mMsg'))) errors.push('no next step before the amount');
  await page.fill('#ofA', '9000'); await page.waitForFunction(() => /الصافي/.test(document.getElementById('ofCalc').textContent), null, { timeout: 8000 });
  await page.click('#ofNext'); if (!(await page.isVisible('#ofO'))) errors.push('step 2: the benefits');
  await page.click('#ofNext'); await page.fill('#ofD', '2099-02-01');
  // v0.50.0 (CHG-107): the working hours and weekly rest on the review step, starting from the settings
  if ((await page.inputValue('#ofWH').catch(() => '')) !== '8' || (await page.inputValue('#ofWR').catch(() => '')) !== 'FRI') errors.push('hours and rest start at 8 / Friday');
  await page.fill('#ofWH', '9'); await page.selectOption('#ofWR', 'SAT');
  await page.click('#ofNext');
  await page.waitForFunction(() => /9,000/.test(document.getElementById('ofSum').textContent) && /2099-02-01/.test(document.getElementById('ofSum').textContent), null, { timeout: 8000 }).catch(() => errors.push('step 4: the summary'));
  await shot('5-offer-wizard');
  await page.click('#ofSend');
  await page.waitForFunction(() => !document.getElementById('ofRail'), null, { timeout: 8000 }).catch(() => errors.push('sent from the last step'));
  fresh(); const O = ctx.findOne_('OFFERS', { Application_ID: B });
  if (O && (O.Work_Hours !== '9' || O.Weekly_Rest !== 'SAT')) errors.push('hours and rest saved from the editor: ' + O.Work_Hours + ' ' + O.Weekly_Rest);
  if (!O || O.Joining_Date !== '2099-02-01' || ['PENDING_APPROVAL', 'APPROVED'].indexOf(O.Status) < 0) errors.push('the offer saved and sent: ' + JSON.stringify(O && { s: O.Status, d: O.Joining_Date }));
  // ---- the «new» menu
  await page.click('#btnNew'); await page.waitForSelector('#newMenu');
  if (!(await page.$('#newMenu [data-nw="candnew"]'))) errors.push('«new candidate» for a recruiter');
  if (await page.$('#newMenu [data-nw="newreq"]')) errors.push('no «new request» for someone who cannot request');
  await page.click('#newMenu [data-nw="candnew"]'); await page.waitForSelector('#cnV', { timeout: 8000 }).catch(() => errors.push('«new candidate» opens the form'));
  // ---- phone: no overflow with the search box and the board
  const ph = await ctxB.newPage(); await ph.setViewportSize({ width: 390, height: 844 }); ph.on('pageerror', e => errors.push(e.message));
  await ph.setContent(idx.replace('S.token = loadToken();', 'S.token = ' + JSON.stringify(tR) + ' || loadToken();')); await ph.waitForSelector('.shell');
  for (const [v, a] of [['home', null], ['pipe', V.Vacancy_ID], ['app', A]]) {
    await ph.evaluate(x => go(x[0], x[1]), [v, a]); await ph.waitForTimeout(700);
    const w = await ph.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errors.push('phone overflow on ' + v + ': ' + w);
  }
  await ph.screenshot({ path: OUT + '/v0420-6-phone.png', fullPage: true });
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui43 OK');
})().catch(e => { console.log(e); process.exit(1); });
