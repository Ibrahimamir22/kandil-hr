/** Editor helpers for Ibrahim's isolated review deployment. No production data. */
function reviewOwner_() {
  requireEditor_();
  if (normEmail_(Session.getEffectiveUser().getEmail()) !== normEmail_(OWNER_EMAIL)) {
    throw new Error('Use the designated review owner account.');
  }
}
function setupPrivateReview() {
  reviewOwner_();
  setupSystem();
  bootstrapOwner();
  Logger.log('Private review initialized. Next run seedPrivateReviewStructure.');
}
function seedPrivateReviewStructure() {
  reviewOwner_();
  if (all_('POSITIONS').length) { Logger.log('Structure already exists; left unchanged.'); return; }
  var owner = findUserByEmail_(OWNER_EMAIL), ctx = demoCtx_(owner.User_ID);
  var rows = [
    ['قنديل مصر','', '', '', '', '', 'الرئيس التنفيذي','العبور','', 'Y','', ''],
    ['قنديل مصر','القطاع المالي','', '', '', '', 'مدير القطاع المالي','العبور','', 'Y','', ''],
    ['قنديل مصر','القطاع المالي','الحسابات','', '', '', 'مدير الحسابات','العبور','', 'Y','', ''],
    ['قنديل مصر','القطاع المالي','الحسابات','', '', '', 'محاسب تكاليف','العبور','', '', '', '4'],
    ['قنديل مصر','القطاع المالي','الحسابات','', '', '', 'محاسب عام','العبور','', '', '', '3'],
    ['قنديل مصر','القطاع المالي','الخزينة','', '', '', 'مدير الخزينة','العبور','', 'Y','', ''],
    ['قنديل مصر','القطاع المالي','الخزينة','', '', '', 'أمين خزينة','العبور','', '', '', '2'],
    ['قنديل مصر','قطاع المصانع','', '', '', '', 'مدير قطاع المصانع','العبور','', 'Y','', ''],
    ['قنديل مصر','قطاع المصانع','الإنتاج','', '', '', 'مدير الإنتاج','العبور','', 'Y','', ''],
    ['قنديل مصر','قطاع المصانع','الإنتاج','', '', '', 'فني تشغيل','العبور','', '', '', '6'],
    ['قنديل مصر','قطاع المصانع','الجودة','', '', '', 'مدير الجودة','العبور','', 'Y','', ''],
    ['قنديل مصر','قطاع المصانع','الجودة','', '', '', 'مراقب جودة','العبور','', '', '', '3']
  ];
  importStructure_(ctx, {reason:'Synthetic structure for the private review only', text:rows.map(function(r){return r.join('\t');}).join('\n')}, true);
  all_('POSITIONS').forEach(function(p) {
    var j = get_('JOBS',p.Job_Code), g = j.Job_Title_AR === 'فني تشغيل' ? '5' : '7';
    if (['محاسب تكاليف','محاسب عام','أمين خزينة','مراقب جودة','فني تشغيل'].indexOf(j.Job_Title_AR) >= 0) update_('JOBS',j.Job_Code,{Grade_Code:g},owner.User_ID);
  });
  flushAudit_();
  Logger.log('Synthetic structure created. Run seedPrivateReviewNextStage repeatedly to populate seven demo stages.');
}
function seedPrivateReviewNextStage() {
  reviewOwner_();
  var owner = findUserByEmail_(OWNER_EMAIL), ctx = demoCtx_(owner.User_ID);
  var done = JSON.parse(PropertiesService.getScriptProperties().getProperty('DEMO_STAGES') || '{}');
  var stage = DEMO_STAGES_.filter(function(s){return !done[s[0]];})[0];
  if (!stage) { Logger.log('All seven demo stages are complete.'); return; }
  var result = demoSeed_(ctx,{stage:stage[0]});
  flushAudit_();
  Logger.log(JSON.stringify(result));
}
