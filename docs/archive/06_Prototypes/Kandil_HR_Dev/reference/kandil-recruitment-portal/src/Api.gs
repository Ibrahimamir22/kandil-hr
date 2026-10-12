/**
 * Api.gs — web app entry and the single server API used by the UI.
 * Every call: api(action, token, payload). Role checks happen here and inside services.
 */

function doGet(e) {
  var prm = (e && e.parameter) || {};
  if (prm.apply) {
    // public apply page — no login. Values are sanitized before they reach the page.
    var t = HtmlService.createTemplateFromFile('Apply');
    t.code = String(prm.apply).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    t.src = String(prm.src || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
    t.lang = prm.lang === 'en' ? 'en' : 'ar';
    t.ad = String(prm.ad || '').replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    return t.evaluate()
      .setTitle('التقديم على وظيفة — قنديل مصر | Kandil Egypt Careers')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (prm.docs) {
    // new hire's private page to upload hiring documents — no login, the token is the key
    var d = HtmlService.createTemplateFromFile('Docs');
    d.token = String(prm.docs).replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
    return d.evaluate()
      .setTitle('مسوغات التعيين — قنديل مصر | Kandil Egypt')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (prm.prob) {
    // employee's private probation page: goals, the performance log, self-assessment — no login, the token is the key
    var pb = HtmlService.createTemplateFromFile('ProbPage');
    pb.token = String(prm.prob).replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
    return pb.evaluate()
      .setTitle('فترة الاختبار — قنديل مصر | Kandil Egypt')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (prm.me) {
    // v0.39.0: the candidate's own page — his data, interviews, offer — no login, the token is the key (7 days)
    var me = HtmlService.createTemplateFromFile('SelfPage');
    me.token = String(prm.me).replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
    return me.evaluate()
      .setTitle('صفحتي — التوظيف في قنديل مصر | Kandil Egypt')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (prm.consent) {
    // v0.38.0: a candidate's own consent to the privacy notice — no login, the token is the key (works once)
    var cs = HtmlService.createTemplateFromFile('ConsentPage');
    cs.token = String(prm.consent).replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
    return cs.evaluate()
      .setTitle('موافقة على إشعار الخصوصية — قنديل مصر | Kandil Egypt')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (prm.ceo) {
    // v0.36.0: the CEO's approvals page — opened from the WhatsApp link; works only on his trusted phone with his PIN
    return HtmlService.createTemplateFromFile('CeoPage').evaluate()
      .setTitle('موافقات الرئيس التنفيذي — قنديل مصر')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (prm.voice) {
    // new hire's private New Hire Voice survey — no login, the token is the key
    var vz = HtmlService.createTemplateFromFile('Voice');
    vz.token = String(prm.voice).replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
    return vz.evaluate()
      .setTitle('رأيك يهمنا — قنديل مصر | Kandil Egypt')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('بوابة التوظيف — قنديل مصر')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Action registry. roles: null = any signed-in user.
 * Built lazily: Apps Script loads files in project order, so top-level code must not
 * reference constants from other files (e.g. ROLE in Config.gs).
 */
var ACTIONS_ = null;
function actions_() {
  if (ACTIONS_) return ACTIONS_;
  ACTIONS_ = {
  'me':                 { roles: null,           fn: function (c)    { return meProfile_(c); } },
  'boot':               { roles: null,           fn: function (c)    { return { me: meProfile_(c), lookups: lookups_(c), opt: reqOptions_() }; } },   // page start: one round trip
  'auth.logout':        { roles: null,           fn: function (c)    { return authLogout_(c); } },
  'me.setLang':         { roles: null,           fn: function (c, p) { return meSetLang_(c, p); } },
  'lookups':            { roles: null,           fn: function (c)    { return lookups_(c); } },

  'users.list':         { roles: HR_ADMIN_ROLES, fn: function (c)    { return usersList_(c); } },
  'users.save':         { roles: HR_ADMIN_ROLES, fn: function (c, p) { return usersSave_(c, p); } },
  'users.setRoles':     { roles: HR_ADMIN_ROLES, fn: function (c, p) { return usersSetRoles_(c, p); } },

  'org.tree':           { roles: null,           fn: function (c)    { return orgTree_(c); } },
  'positions.search':   { roles: null,           fn: function (c, p) { return positionsSearch_(c, p); } },
  'positions.update':   { roles: HR_ADMIN_ROLES, fn: function (c, p) { return positionUpdate_(c, p); } },
  'positions.history':  { roles: HR_ALL_ROLES,   fn: function (c, p) { return positionHistory_(c, p); } },
  'jobs.list':          { roles: null,           fn: function (c)    { return jobsList_(c); } },
  'jobs.update':        { roles: HR_ADMIN_ROLES, fn: function (c, p) { return jobUpdate_(c, p); } },
  'locations.save':     { roles: HR_ADMIN_ROLES, fn: function (c, p) { return locationSave_(c, p); } },

  'import.preview':     { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return importStructure_(c, p, false); } },
  'import.commit':      { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return importStructure_(c, p, true); } },

  'config.list':        { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c)    { return all_('CONFIG'); } },
  'config.update':      { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return configUpdate_(c, p); } },

  'audit.search':       { roles: HR_ADMIN_ROLES, fn: function (c, p) { return auditSearch_(c, p); } },

  'org.unitSave':       { roles: orgEditRoles_(), fn: function (c, p) { return orgUnitSave_(c, p); } },
  'org.unitMove':       { roles: orgEditRoles_(), fn: function (c, p) { return orgUnitMove_(c, p); } },
  'org.unitSetHead':    { roles: orgEditRoles_(), fn: function (c, p) { return orgUnitSetHead_(c, p); } },
  'org.unitClose':      { roles: orgEditRoles_(), fn: function (c, p) { return orgUnitClose_(c, p); } },
  'org.unitHistory':    { roles: HR_ALL_ROLES,   fn: function (c, p) { return orgUnitHistory_(c, p); } },
  'org.positionCreate': { roles: orgEditRoles_(), fn: function (c, p) { return orgPositionCreate_(c, p); } },
  'rules.list':         { roles: HR_ALL_ROLES,   fn: function (c)    { return rulesList_(c); } },
  'rules.save':         { roles: orgEditRoles_(), fn: function (c, p) { return ruleSave_(c, p); } },
  'rules.stop':         { roles: orgEditRoles_(), fn: function (c, p) { return ruleStop_(c, p); } },
  'dlg.list':           { roles: HR_ALL_ROLES,   fn: function (c)    { return delegationsList_(c); } },
  'dlg.save':           { roles: HR_ADMIN_ROLES, fn: function (c, p) { return delegationSave_(c, p); } },
  'dlg.stop':           { roles: HR_ADMIN_ROLES, fn: function (c, p) { return delegationStop_(c, p); } },
  'lists.get':          { roles: HR_ALL_ROLES,   fn: function (c)    { return listsGet_(c); } },
  'lists.save':         { roles: HR_ADMIN_ROLES, fn: function (c, p) { return listItemSave_(c, p); } },
  'jobs.history':       { roles: HR_ALL_ROLES,   fn: function (c, p) { return jobHistory_(c, p); } },
  'daily.status':       { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c) { return dailyStatus_(); } },
  'org.positionMove':   { roles: orgEditRoles_(), fn: function (c, p) { return orgPositionMove_(c, p); } },

  /* Phase 2 */
  'todo':               { roles: null,           fn: function (c)    { return myTodo_(c); } },
  'policy.accept':      { roles: null,           fn: function (c)    { return policyAccept_(c); } },
  'ping':               { roles: null,           fn: function ()     { return { ok: true }; } },   // v0.37.0: «still here» — keeps the server's idle lock in step with the page
  'req.options':        { roles: null,           fn: function (c)    { return reqOptions_(); } },
  'req.positions':      { roles: null,           fn: function (c, p) { return reqScopePositions_(c, p); } },
  'req.save':           { roles: null,           fn: function (c, p) { return requestSave_(c, p); } },
  'req.submit':         { roles: null,           fn: function (c, p) { return requestSubmit_(c, p); } },
  'req.action':         { roles: null,           fn: function (c, p) { return requestAction_(c, p); } },
  'req.cancel':         { roles: null,           fn: function (c, p) { return requestCancel_(c, p); } },
  'req.change':         { roles: null,           fn: function (c, p) { return requestChange_(c, p); } },
  'req.get':            { roles: null,           fn: function (c, p) { return requestGet_(c, p); } },
  'req.list':           { roles: null,           fn: function (c, p) { return requestsList_(c, p); } },
  'req.printed':        { roles: null,           fn: function (c, p) { return requestPrinted_(c, p); } },
  'req.hrNote':         { roles: hrTeamRoles_(), fn: function (c, p) { return requestHrNote_(c, p); } },

  'vac.list':           { roles: null,           fn: function (c, p) { return vacanciesList_(c, p); } },
  'vac.get':            { roles: null,           fn: function (c, p) { return vacancyGet_(c, p); } },
  'vac.update':         { roles: vacManagerRoles_(), fn: function (c, p) { return vacancyUpdate_(c, p); } },
  'vac.assign':         { roles: vacManagerRoles_(), fn: function (c, p) { return vacancyAssign_(c, p); } },
  'vac.assignMany':     { roles: vacManagerRoles_(), fn: function (c, p) { return vacancyAssignMany_(c, p); } },
  'vac.priority':       { roles: HR_ADMIN_ROLES, fn: function (c, p) { return vacancyPriority_(c, p); } },
  'vac.fill':           { roles: vacManagerRoles_(), fn: function (c, p) { return vacancyFill_(c, p); } },
  'vac.fillVoid':       { roles: HR_ADMIN_ROLES, fn: function (c, p) { return vacancyFillVoid_(c, p); } },
  'vac.recruiters':     { roles: vacManagerRoles_(), fn: function (c)  { return recruitersList_(c); } },

  'pcr.save':           { roles: null,           fn: function (c, p) { return pcrSave_(c, p); } },
  'pcr.submit':         { roles: null,           fn: function (c, p) { return pcrSubmit_(c, p); } },
  'pcr.action':         { roles: null,           fn: function (c, p) { return pcrAction_(c, p); } },
  'pcr.cancel':         { roles: null,           fn: function (c, p) { return pcrCancel_(c, p); } },
  'pcr.get':            { roles: null,           fn: function (c, p) { return pcrGet_(c, p); } },
  'pcr.list':           { roles: null,           fn: function (c, p) { return pcrList_(c, p); } },

  /* Phase 3A: candidates */
  'cand.options':       { roles: null,           fn: function (c)    { return candOptions_(c); } },
  'cand.tasks':         { roles: candWorkRoles_(), fn: function (c)  { return candTasks_(c); } },
  'cand.search':        { roles: candWorkRoles_(), fn: function (c, p) { return candSearch_(c, p); } },
  'search.all':         { roles: null,           fn: function (c, p) { return searchAll_(c, p); } },     // v0.42.0 (CHG-87)
  'cand.create':        { roles: candWorkRoles_(), fn: function (c, p) { return candCreate_(c, p); } },
  'cand.pipeline':      { roles: null,           fn: function (c, p) { return pipeline_(c, p); } },
  'cand.app':           { roles: null,           fn: function (c, p) { return appGet_(c, p); } },
  'offer.noInsForm':    { roles: null,           fn: function (c, p) { return offerNoInsForm_(c, p); } },
  'offer.noInsUpload':  { roles: null,           fn: function (c, p) { return offerNoInsUpload_(c, p); } },
  'cand.selfLink':      { roles: null,           fn: function (c, p) { return selfLink_(c, p); } },
  'cand.consentLink':   { roles: null,           fn: function (c, p) { return consentLink_(c, p); } },
  'cand.move':          { roles: candWorkRoles_(), fn: function (c, p) { return appMove_(c, p); } },
  'cand.activity':      { roles: candWorkRoles_(), fn: function (c, p) { return actAdd_(c, p); } },
  'cand.activityVoid':  { roles: candWorkRoles_(), fn: function (c, p) { return actVoid_(c, p); } },
  'cand.next':          { roles: candWorkRoles_(), fn: function (c, p) { return appNext_(c, p); } },
  'cand.rejectMsg':     { roles: candWorkRoles_(), fn: function (c, p) { return rejectMsgDone_(c, p); } },
  'cand.person':        { roles: candWorkRoles_(), fn: function (c, p) { return personUpdate_(c, p); } },
  'photo.get':          { roles: null,           fn: function (c, p) { return photoGet_(c, p); } },
  'photo.set':          { roles: null,           fn: function (c, p) { return photoSet_(c, p); } },
  'cand.cv':            { roles: null,           fn: function (c, p) { return personCv_(c, p); } },
  'cand.dup':           { roles: candWorkRoles_(), fn: function (c, p) { return dupResolve_(c, p); } },
  'cand.applySettings': { roles: candWorkRoles_(), fn: function (c, p) { return vacancyApplySettings_(c, p); } },
  /* Phase 3B: sources, subscriptions, ads */
  'src.list':           { roles: candWorkRoles_(), fn: function (c)  { return sourcingList_(c); } },
  'src.save':           { roles: sourcingAdminRoles_(), fn: function (c, p) { return sourceSave_(c, p); } },
  'sub.save':           { roles: sourcingAdminRoles_(), fn: function (c, p) { return subscriptionSave_(c, p); } },
  'usage.add':          { roles: candWorkRoles_(), fn: function (c, p) { return usageAdd_(c, p); } },
  'usage.void':         { roles: sourcingAdminRoles_(), fn: function (c, p) { return usageVoid_(c, p); } },
  'ad.list':            { roles: candWorkRoles_(), fn: function (c, p) { return adList_(c, p); } },
  'ad.create':          { roles: candWorkRoles_(), fn: function (c, p) { return adCreate_(c, p); } },
  'ad.save':            { roles: candWorkRoles_(), fn: function (c, p) { return adSave_(c, p); } },
  'ad.status':          { roles: candWorkRoles_(), fn: function (c, p) { return adStatus_(c, p); } },
  'ad.copy':            { roles: candWorkRoles_(), fn: function (c, p) { return adCopy_(c, p); } },
  /* Phase 3B-2: referrals, agencies, application owner */
  'cand.owner':         { roles: candWorkRoles_(), fn: function (c, p) { return appOwnerSet_(c, p); } },
  'cand.source':        { roles: candWorkRoles_(), fn: function (c, p) { return appSourceSet_(c, p); } },
  'cand.referral':      { roles: candWorkRoles_(), fn: function (c, p) { return referralSet_(c, p); } },
  'cand.empSearch':     { roles: candWorkRoles_(), fn: function (c, p) { return empSearchLite_(c, p); } },
  'ref.list':           { roles: candWorkRoles_(), fn: function (c, p) { return referralsList_(c, p); } },
  'ref.bonus':          { roles: HR_ADMIN_ROLES, fn: function (c, p) { return referralBonus_(c, p); } },
  'agency.save':        { roles: sourcingAdminRoles_(), fn: function (c, p) { return agencySave_(c, p); } },
  /* Phase 3B-3: screening questions, talent pool, import, transfer, former employees, metrics */
  'sq.list':            { roles: candWorkRoles_(), fn: function (c)  { return questionsList_(c); } },
  'sq.save':            { roles: questionEditRoles_(), fn: function (c, p) { return questionSave_(c, p); } },
  'vac.questions':      { roles: candWorkRoles_(), fn: function (c, p) { return vacancyQuestionsSet_(c, p); } },
  'cand.answers':       { roles: candWorkRoles_(), fn: function (c, p) { return appAnswers_(c, p); } },
  'cand.knockout':      { roles: candWorkRoles_(), fn: function (c, p) { return knockoutReview_(c, p); } },
  'cand.transfer':      { roles: candWorkRoles_(), fn: function (c, p) { return appTransfer_(c, p); } },
  'cand.import':        { roles: candWorkRoles_(), fn: function (c, p) { return candImport_(c, p); } },
  'pool.suggest':       { roles: candWorkRoles_(), fn: function (c, p) { return poolSuggestFor_(c, p); } },
  'pool.add':           { roles: candWorkRoles_(), fn: function (c, p) { return poolAdd_(c, p); } },
  'pool.remove':        { roles: candWorkRoles_(), fn: function (c, p) { return poolRemove_(c, p); } },
  'pool.list':          { roles: candWorkRoles_(), fn: function (c, p) { return poolList_(c, p); } },
  'pool.toVacancy':     { roles: candWorkRoles_(), fn: function (c, p) { return poolToVacancy_(c, p); } },
  'src.metrics':        { roles: candWorkRoles_(), fn: function (c, p) { return sourceMetrics_(c, p); } },
  'former.confirm':     { roles: rehireRoles_(),  fn: function (c, p) { return formerConfirm_(c, p); } },
  'restrict.list':      { roles: restrictionRoles_().concat([ROLE.CEO]), fn: function (c, p) { return restrictionsList_(c, p); } },
  'restrict.add':       { roles: restrictionRoles_(), fn: function (c, p) { return restrictionAdd_(c, p); } },
  'restrict.lift':      { roles: restrictionRoles_(), fn: function (c, p) { return restrictionLift_(c, p); } },
  'restrict.appeal':    { roles: restrictionRoles_(), fn: function (c, p) { return restrictionAppeal_(c, p); } },
  'restrict.decide':    { roles: restrictionRoles_().concat([ROLE.CEO]), fn: function (c, p) { return restrictionDecide_(c, p); } },
  'restrict.renew':     { roles: restrictionRoles_(), fn: function (c, p) { return restrictionRenew_(c, p); } },
  /* Phase 4A: interviews */
  'int.plan':           { roles: null,           fn: function (c, p) { return vacPlan_(c, p); } },
  'int.people':         { roles: candWorkRoles_(), fn: function (c, p) { return intPeople_(c, p); } },
  'int.create':         { roles: candWorkRoles_(), fn: function (c, p) { delete p._from; return intCreate_(c, p); } },
  'int.get':            { roles: null,           fn: function (c, p) { return intGet_(c, p); } },
  'int.action':         { roles: null,           fn: function (c, p) { return intAction_(c, p); } },
  'int.reschedule':     { roles: candWorkRoles_(), fn: function (c, p) { return intReschedule_(c, p); } },
  'int.panel':          { roles: candWorkRoles_(), fn: function (c, p) { return intPanelSet_(c, p); } },
  'int.waive':          { roles: intManageRoles_(), fn: function (c, p) { return intWaive_(c, p); } },
  'int.list':           { roles: null,           fn: function (c, p) { return intList_(c, p); } },
  'int.compare':        { roles: null,           fn: function (c, p) { return intCompare_(c, p); } },
  'eval.save':          { roles: null,           fn: function (c, p) { return evalSave_(c, p); } },
  'eval.revise':        { roles: null,           fn: function (c, p) { return evalRevise_(c, p); } },
  'int.file':           { roles: null,           fn: function (c, p) { return intFile_(c, p); } },
  'int.analytics':      { roles: intManageRoles_(), fn: function (c, p) { return intAnalytics_(c, p); } },
  'rt.list':            { roles: candWorkRoles_(), fn: function (c)  { return roundTemplatesList_(c); } },
  'rt.save':            { roles: intManageRoles_(), fn: function (c, p) { return templateRoundsSave_(c, p); } },

  'sel.save':           { roles: null,              fn: function (c, p) { return selectionSave_(c, p); } },
  'ref.save':           { roles: candWorkRoles_(),  fn: function (c, p) { return referenceSave_(c, p); } },
  'offer.setup':        { roles: candWorkRoles_(),  fn: function (c, p) { return offerSetup_(c, p); } },
  'offer.save':         { roles: candWorkRoles_(),  fn: function (c, p) { return offerSave_(c, p); } },
  'offer.action':       { roles: null,              fn: function (c, p) { return offerAction_(c, p); } },
  'offer.list':         { roles: null,              fn: function (c, p) { return offersList_(c, p); } },
  'offer.letter':       { roles: candWorkRoles_(),  fn: function (c, p) { return offerLetterGet_(c, p); } },
  'offer.file':         { roles: candWorkRoles_(),  fn: function (c, p) { return offerFile_(c, p); } },
  'pay.admin':          { roles: payViewRoles_(),   fn: function (c)    { return payAdmin_(c); } },
  'pay.structures':     { roles: payEditRoles_(),   fn: function (c, p) { return structuresSave_(c, p); } },
  'pay.component':      { roles: payEditRoles_(),   fn: function (c, p) { return componentSave_(c, p); } },
  'pay.authority':      { roles: payEditRoles_(),   fn: function (c, p) { return authoritySave_(c, p); } },
  'pay.allowances':     { roles: payEditRoles_(),   fn: function (c, p) { return allowancesSave_(c, p); } },
  'pay.rate':           { roles: payEditRoles_(),   fn: function (c, p) { return rateSave_(c, p); } },
  'pay.temp':           { roles: payEditRoles_(),   fn: function (c, p) { return tempTransportSave_(c, p); } },
  'pay.zones':          { roles: payEditRoles_(),   fn: function (c, p) { return zonesSave_(c, p); } },
  'pay.rules':          { roles: payEditRoles_(),   fn: function (c, p) { return payRulesSave_(c, p); } },
  'pay.jobs':           { roles: payEditRoles_(),   fn: function (c, p) { return jobPaySave_(c, p); } },
  'pay.preview':        { roles: payViewRoles_(),   fn: function (c, p) { return payPreview_(c, p); } },
  'offer.preview':      { roles: candWorkRoles_(),  fn: function (c, p) { return offerPreview_(c, p); } },
  'offer.incentive':    { roles: candWorkRoles_(),  fn: function (c, p) { return offerIncentiveGet_(c, p); } },
  'join.action':        { roles: candWorkRoles_(),  fn: function (c, p) { return joiningAction_(c, p); } },
  'join.list':          { roles: candWorkRoles_(),  fn: function (c, p) { return joiningsList_(c, p); } },
  'join.contract':      { roles: candWorkRoles_(),  fn: function (c, p) { return joiningContractForm_(c, p); } },
  'join.contractData':  { roles: candWorkRoles_(),  fn: function (c, p) { return joiningContractData_(c, p); } },
  'join.payDetails':    { roles: payViewRoles_(),   fn: function (c, p) { return joiningPayDetails_(c, p); } },
  'join.contractUpload':{ roles: candWorkRoles_(),  fn: function (c, p) { return joiningContractUpload_(c, p); } },
  'doc.action':         { roles: candWorkRoles_(),  fn: function (c, p) { return docAction_(c, p); } },
  'doc.add':            { roles: candWorkRoles_(),  fn: function (c, p) { return docAdd_(c, p); } },
  'doc.file':           { roles: candWorkRoles_(),  fn: function (c, p) { return docFile_(c, p); } },
  'doc.receipt':        { roles: candWorkRoles_(),  fn: function (c, p) { return receiptIssue_(c, p); } },
  'doctype.list':       { roles: candWorkRoles_(),  fn: function (c)    { return { rows: all_('DOC_TYPES').sort(function (a, b) { return num_(a.Sort_Order, 0) - num_(b.Sort_Order, 0); }), canEdit: hasAnyRole_(c, docTypeEditRoles_()) }; } },
  'pool.consent':       { roles: candWorkRoles_(),  fn: function (c, p) { return poolConsentSave_(c, p); } },
  'privacy.admin':      { roles: privacyRoles_(),   fn: function (c)    { return privacyAdmin_(c); } },
  'privacy.save':       { roles: privacyRoles_(),   fn: function (c, p) { return privacySave_(c, p); } },
  'privacy.entity':     { roles: privacyRoles_(),   fn: function (c, p) { return entitySave_(c, p); } },
  'privacy.due':        { roles: privacyRoles_(),   fn: function (c)    { return { rows: retentionDue_(), enabled: !!cfg_('RETENTION_ENABLED', false) }; } },
  'privacy.purge':      { roles: privacyRoles_(),   fn: function (c, p) { return privacyPurge_(c, p); } },
  'privacy.find':       { roles: privacyRoles_(),   fn: function (c, p) { return privacyFind_(c, p); } },
  'privacy.export':     { roles: privacyRoles_(),   fn: function (c, p) { return privacyExport_(c, p); } },
  'dsr.list':           { roles: privacyRoles_(),   fn: function (c, p) { return dsrList_(c, p); } },
  'dsr.save':           { roles: privacyRoles_(),   fn: function (c, p) { return dsrSave_(c, p); } },
  'dsr.close':          { roles: privacyRoles_(),   fn: function (c, p) { return dsrClose_(c, p); } },
  'doctype.save':       { roles: docTypeEditRoles_(), fn: function (c, p) { return docTypeSave_(c, p); } },
  'iq.list':            { roles: null,           fn: function (c)    { return iqList_(c); } },
  'iq.save':            { roles: iqEditRoles_(), fn: function (c, p) { return iqSave_(c, p); } },
  'tpl.list':           { roles: candWorkRoles_(), fn: function (c)  { return templatesList_(c); } },
  'tpl.save':           { roles: templateEditRoles_(), fn: function (c, p) { return templateSave_(c, p); } },

  /* Employees */
  'emp.options':        { roles: empRoles_(),    fn: function (c)    { return empOptions_(c); } },
  'emp.list':           { roles: empRoles_(),    fn: function (c, p) { return empList_(c, p); } },
  'emp.get':            { roles: empRoles_(),    fn: function (c, p) { return empGet_(c, p); } },
  'emp.save':           { roles: empAdminRoles_(), fn: function (c, p) { return empSave_(c, p); } },
  'emp.transfer':       { roles: empAdminRoles_(), fn: function (c, p) { return empTransfer_(c, p); } },
  'emp.exit':           { roles: empAdminRoles_(), fn: function (c, p) { return empExit_(c, p); } },
  'emp.exitCancel':     { roles: empAdminRoles_(), fn: function (c, p) { return empExitCancel_(c, p); } },
  'emp.makeUser':       { roles: empAdminRoles_(), fn: function (c, p) { return empMakeUser_(c, p); } },
  'emp.import':         { roles: empAdminRoles_(), fn: function (c, p) { return empImport_(c, p); } },
  'emp.replacement':    { roles: null,           fn: function (c, p) { return empReplacement_(c, p); } },

  /* Job descriptions & competency library */
  'jd.list':            { roles: HR_ALL_ROLES,   fn: function (c, p) { return jdList_(c, p); } },
  'jd.get':             { roles: null,           fn: function (c, p) { return jdGet_(c, p); } },
  'jd.send':            { roles: null,           fn: function (c, p) { return jdSend_(c, p); } },
  'jd.recipients':      { roles: null,           fn: function (c)    { return jdRecipients_(c); } },
  'jd.kit':             { roles: null,           fn: function (c, p) { return jdInterviewKit_(c, p); } },
  'jd.save':            { roles: jdEditRoles_(), fn: function (c, p) { return jdSave_(c, p); } },
  'jd.approve':         { roles: jdApproveRoles_(), fn: function (c, p) { return jdApprove_(c, p); } },
  'jd.discard':         { roles: jdEditRoles_(), fn: function (c, p) { return jdDiscard_(c, p); } },
  'jd.import':          { roles: jdApproveRoles_(), fn: function (c, p) { return jdImport_(c, p); } },
  'jdr.start':          { roles: HR_ADMIN_ROLES, fn: function (c, p) { return jdrStart_(c, p); } },     // v0.45.0 (CHG-96)
  'jdr.status':         { roles: HR_ALL_ROLES,   fn: function (c, p) { return jdrStatus_(c, p); } },
  'jdr.close':          { roles: HR_ADMIN_ROLES, fn: function (c, p) { return jdrClose_(c, p); } },
  'jdr.mine':           { roles: null,           fn: function (c)    { return jdrMine_(c); } },
  'jdr.get':            { roles: null,           fn: function (c, p) { return jdrGet_(c, p); } },
  'jdr.answer':         { roles: null,           fn: function (c, p) { return jdrAnswer_(c, p); } },
  'presence.list':      { roles: presenceRoles_(), fn: function (c) { return presenceList_(c); } },     // v0.45.1 (CHG-98)
  'comp.list':          { roles: null,           fn: function (c)    { return compList_(c); } },

  'notif.list':         { roles: null,           fn: function (c)    { return notificationsList_(c); } },
  'notif.read':         { roles: null,           fn: function (c, p) { return notificationsRead_(c, p); } },
  'mfa.start':          { roles: null,           fn: function (c)    { return mfaStart_(c); } },
  'mfa.confirm':        { roles: null,           fn: function (c, p) { return mfaConfirm_(c, p); } },
  'mfa.codes':          { roles: null,           fn: function (c, p) { return mfaCodes_(c, p); } },
  'mfa.reset':          { roles: mfaResetRoles_(), fn: function (c, p) { return mfaReset_(c, p); } },
  'nda.accept':         { roles: null,           fn: function (c)    { return ndaAccept_(c); } },
  'onb.list':           { roles: null,           fn: function (c, p) { return onbList_(c, p); } },
  'onb.get':            { roles: null,           fn: function (c, p) { return onbDetail_(c, p); } },
  'onb.task':           { roles: null,           fn: function (c, p) { return onbTask_(c, p); } },
  'onb.taskAdd':        { roles: null,           fn: function (c, p) { return onbTaskAdd_(c, p); } },
  'onb.owners':         { roles: null,           fn: function (c, p) { return onbOwners_(c, p); } },
  'onb.complete':       { roles: null,           fn: function (c, p) { return onbComplete_(c, p); } },
  'onb.cancel':         { roles: onbAdminRoles_(), fn: function (c, p) { return onbCancel_(c, p); } },
  'onb.custody':        { roles: null,           fn: function (c, p) { return custodyAction_(c, p); } },
  'att.save':           { roles: null,           fn: function (c, p) { return attSave_(c, p); } },     // v0.44.0 (CHG-91)
  'att.stop':           { roles: null,           fn: function (c, p) { return attStop_(c, p); } },
  'onb.arrivals':       { roles: null,           fn: function (c)    { return onbArrivals_(c); } },
  'onb.start':          { roles: onbAdminRoles_(), fn: function (c, p) { return onbStart_(c, p); } },
  'onb.templates':      { roles: onbAdminRoles_(), fn: function (c)    { return onbTemplates_(c); } },
  'onb.itemSave':       { roles: onbTemplateRoles_(), fn: function (c, p) { return onbItemSave_(c, p); } },
  'onb.templateSave':   { roles: onbTemplateRoles_(), fn: function (c, p) { return onbTemplateSave_(c, p); } },
  'gift.save':          { roles: null,           fn: function (c, p) { return giftSave_(c, p); } },
  'ins.list':           { roles: insRoles_(),    fn: function (c, p) { return insList_(c, p); } },
  'ins.action':         { roles: insRoles_(),    fn: function (c, p) { return insAction_(c, p); } },
  'nhv.list':           { roles: nhvRoles_(),    fn: function (c, p) { return nhvList_(c, p); } },
  'nhv.get':            { roles: nhvRoles_(),    fn: function (c, p) { return nhvGet_(c, p); } },
  'nhv.action':         { roles: nhvRoles_(),    fn: function (c, p) { return nhvAction_(c, p); } },
  'trf.options':        { roles: null,           fn: function (c, p) { return trfOptions_(c, p); } },
  'trf.targets':        { roles: null,           fn: function (c, p) { return trfTargets_(c, p); } },
  'trf.preview':        { roles: null,           fn: function (c, p) { return trfPreview_(c, p); } },
  'trf.submit':         { roles: null,           fn: function (c, p) { return trfSubmit_(c, p); } },
  'trf.action':         { roles: null,           fn: function (c, p) { return trfAction_(c, p); } },
  'trf.get':            { roles: null,           fn: function (c, p) { return trfGet_(c, p); } },
  'trf.list':           { roles: null,           fn: function (c, p) { return trfList_(c, p); } },
  'org.chart':          { roles: null,           fn: function (c)    { return orgChart_(c); } },
  'report.run':         { roles: reportRoles_(), fn: function (c, p) { return reportRun_(c, p); } },
  'process.map':        { roles: null,           fn: function (c)    { return processMap_(c); } },
  'me.pref':            { roles: null,           fn: function (c, p) { return mePref_(c, p); } },
  'feedback.add':       { roles: null,           fn: function (c, p) { return feedbackAdd_(c, p); } },
  'feedback.list':      { roles: null,           fn: function (c, p) { return feedbackList_(c, p); } },
  'demo.status':        { roles: [ROLE.OWNER],    fn: function (c, p) { return demoStatus_(c, p); } },
  'demo.seed':          { roles: [ROLE.OWNER],    fn: function (c, p) { return demoSeed_(c, p); } },
  'demo.as':            { roles: [ROLE.OWNER],    fn: function (c, p) { return demoAs_(c, p); } },
  'demo.wipe':          { roles: [ROLE.OWNER],    fn: function (c, p) { return demoWipe_(c, p); } },
  'kpi.run':            { roles: null,           fn: function (c, p) { return kpiRun_(c, p); } },
  'kpi.settings':       { roles: null,           fn: function (c, p) { return kpiSettings_(c, p); } },
  'ins.run':            { roles: null,           fn: function (c, p) { return insightsRun_(c, p); } },
  'golive.get':         { roles: null,           fn: function (c)    { return goliveGet_(c); } },
  // v0.36.0: CEO approvals (CHG-75) and two-person requests (CHG-77)
  'ceo.inbox':          { roles: [ROLE.CEO],      fn: function (c)    { return ceoInbox_(c); } },
  'ceo.decide':         { roles: [ROLE.CEO],      fn: function (c, p) { return ceoDecide_(c, p); } },
  'ceo.deviceCreate':   { roles: [ROLE.CEO],      fn: function (c, p) { return ceoDeviceCreate_(c, p); } },
  'ceo.devices':        { roles: [ROLE.CEO, ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c) { return ceoDevices_(c); } },
  'ceo.deviceRevoke':   { roles: [ROLE.CEO, ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return ceoDeviceRevoke_(c, p); } },
  'ceo.share':          { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c) { return ceoShare_(c); } },
  'ceo.queue':          { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c) { return ceoQueueList_(c); } },
  'ceo.report':         { roles: [ROLE.CEO, ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return ceoMonthlyReport_(c, p); } },
  'access.review':      { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c) { return accessReview_(c); } },
  'access.reviewDone':  { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return accessReviewDone_(c, p); } },
  'dual.request':       { roles: null,           fn: function (c, p) { return dualRequest_(c, p); } },
  'dual.list':          { roles: null,           fn: function (c)    { return dualList_(c); } },
  'golive.start':       { roles: [ROLE.OWNER],    fn: function (c, p) { return goliveStart_(c, p); } },
  'ops.restoreTest':    { roles: [ROLE.OWNER],    fn: function (c, p) { return restoreTestRecord_(c, p); } },
  'inc.list':           { roles: null,           fn: function (c)    { return incidentList_(c); } },
  'inc.report':         { roles: null,           fn: function (c, p) { return incidentReport_(c, p); } },
  'inc.update':         { roles: null,           fn: function (c, p) { return incidentUpdate_(c, p); } },
  'dual.decide':        { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return dualDecide_(c, p); } },
  'cvai.status':        { roles: null,           fn: function (c)    { return cvaiStatus_(c); } },
  'cvai.setKey':        { roles: null,           fn: function (c, p) { return cvaiSetKey_(c, p); } },
  'cvai.test':          { roles: null,           fn: function (c)    { return cvaiTest_(c); } },
  'cvai.read':          { roles: candWorkRoles_(), fn: function (c, p) { return cvaiRead_(c, p); } },
  'cvai.improve':       { roles: candWorkRoles_(), fn: function (c, p) { return cvaiImprove_(c, p); } },
  'golive.tick':        { roles: null,           fn: function (c, p) { return goliveTick_(c, p); } },
  'prob.list':          { roles: null,           fn: function (c, p) { return probList_(c, p); } },
  'prob.get':           { roles: null,           fn: function (c, p) { return probDetail_(c, p); } },
  'prob.action':        { roles: null,           fn: function (c, p) { return probAction_(c, p); } },
  'prob.start':         { roles: probAdminRoles_(), fn: function (c, p) { return probStart_(c, p); } },
  'med.list':           { roles: medRoles_(),    fn: function (c, p) { return medList_(c, p); } },
  'med.action':         { roles: medRoles_(),    fn: function (c, p) { return medAction_(c, p); } },
  'feedback.save':      { roles: [ROLE.OWNER, ROLE.HR_SECTOR], fn: function (c, p) { return feedbackSave_(c, p); } }
  };
  return ACTIONS_;
}

/** Public (no session) actions. */
function apiPublic(action, payload) {
  payload = payload || {};
  try {
    ensureUpgraded_();
    var data;
    if (action === 'auth.requestCode') data = authRequestCode_(payload.email);
    else if (action === 'auth.verifyCode') data = authVerifyCode_(payload.email, payload.code, payload.userAgent, payload.remember, payload.device);
    else if (action === 'auth.totp') data = authTotp_(payload.email, payload.code, payload.userAgent, payload.remember, payload.device);
    else if (action === 'apply.info') data = applyInfo_(payload);
    else if (action === 'apply.submit') data = applySubmit_(payload);
    else if (action === 'docs.info') data = docsInfo_(payload);
    else if (action === 'docs.upload') data = docsUpload_(payload);
    else if (action === 'docs.consent') data = docsConsent_(payload);
    else if (action === 'voice.info') data = voiceInfo_(payload);
    else if (action === 'voice.submit') data = voiceSubmit_(payload);
    else if (action === 'prob.info') data = probInfo_(payload);
    else if (action === 'prob.submit') data = probSubmit_(payload);
    else if (action === 'i18n') data = i18nDict_(payload);
    else if (action === 'self.info') data = selfInfo_(payload);                   // v0.39.0: the candidate's own page
    else if (action === 'self.consent') data = selfConsent_(payload);
    else if (action === 'self.save') data = selfSave_(payload);
    else if (action === 'self.interview') data = selfInterview_(payload);
    else if (action === 'self.offer') data = selfOffer_(payload);
    else if (action === 'consent.info') data = consentInfo_(payload);            // v0.38.0: the candidate's consent link
    else if (action === 'consent.accept') data = consentAccept_(payload);
    else if (action === 'ceoPage.unlock') data = ceoUnlock_(payload);          // v0.36.0: the CEO's phone (device key + PIN)
    else if (action === 'ceoPage.inbox') data = ceoPageInbox_(payload);
    else if (action === 'ceoPage.decide') data = ceoPageDecide_(payload);
    else if (action === 'ceoPage.report') data = ceoPageReport_(payload);
    else throw userError_('عملية غير معروفة.');
    flushAudit_();
    return { ok: true, data: data };
  } catch (e) {
    return fail_(e, action);
  }
}

/** Authenticated actions. */
function api(action, token, payload, view) {
  try {
    var def = actions_()[action];
    if (!def) throw userError_('عملية غير معروفة.');
    tcBegin_(action);                                  // v0.32.0: the action's tables come from the cache in one call
    ensureUpgraded_();
    var ctx = sessionFromToken_(token);
    presenceMark_(ctx, view);                         // v0.45.1 (CHG-98): the screen's name only, cache, 10 minutes
    securityCheck_(ctx, action, payload || {});      // consultant = view only; authenticator / confidentiality gates
    if (def.roles) requireRole_(ctx, def.roles);
    empDailyRefresh_();
    sourcingDailyCheck_();
    try { dailyFallback_(); } catch (eDaily) { console.warn('daily fallback: ' + eDaily); }
    var data = def.fn(ctx, payload || {});
    flushAudit_();
    try { tcHintSave_(); } catch (eHint) {}
    return { ok: true, data: data };
  } catch (e) {
    return fail_(e, action);
  }
}

function fail_(e, action) {
  try { flushAudit_(); } catch (ignore) {}
  if (e && e.userFacing) return { ok: false, error: e.message, auth: !!e.auth, data: e.data || null };
  var ref = Utilities.getUuid().slice(0, 8);
  console.error('[' + ref + '] ' + action + ': ' + (e && e.stack ? e.stack : e));
  return { ok: false, error: 'حصل خطأ غير متوقع. رقم المرجع: ' + ref, data: (e && e.data) || null };
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
