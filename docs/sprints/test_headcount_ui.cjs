/* Isolated native-form callback contract checks, not browser/Frappe runtime proof.
 * node docs/sprints/test_headcount_ui.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../kandil_hr/kandil_hr/doctype/kandil_hiring_request/kandil_hiring_request.js'), 'utf8');
function setup({status='Pending', requester='requester@example.test', amends=null, allowed=true, outcome='denied'}={}) {
  const state = {buttons:{}, messages:[], calls:[], reloads:0, routes:0, dialogs:[], html:[], hidden:0};
  let handler;
  const translate = (value, args=[]) => value.replace(/\{(\d+)\}/g, (_, index) => String(args[index]));
  const doc = {name:'TEST-REQUEST', status, requested_by:requester, amends, lines:[{name:'LINE-A',capacity:'CAP-A',proposed_qty:2,reserved_qty:2}]};
  const frm = {doc, is_new:()=>false, is_dirty:()=>false, set_df_property(){}, disable_save(){}, enable_save(){}, set_intro(){}, dashboard:{add_comment(){}}, add_custom_button(label, fn){state.buttons[label]=fn;}, reload_doc(){state.reloads++;}};
  function Dialog(options) {
    Object.assign(this,options); this.values={reason:'Synthetic revision reason',exception_reason:''};
    options.fields.filter(field=>field.fieldname.startsWith('q')).forEach(field=>this.values[field.fieldname]=field.default);
    this.fields_dict={review:{$wrapper:{html:value=>state.html.push(value)}}};
    this.get_value=key=>this.values[key]; this.get_values=()=>this.values;
    this.get_primary_btn=()=>({prop(){}}); this.show=()=>{}; this.hide=()=>state.hidden++;
    state.dialogs.push(this);
  }
  const frappe = {
    session:{user:'requester@example.test'}, utils:{escape_html:value=>String(value).replace(/</g,'&lt;')},
    ui:{form:{on(_name, config){handler=config;}},Dialog},
    msgprint:value=>state.messages.push(value), confirm:(_message,yes)=>yes(),
    set_route(){state.routes++;},
    call(options) {
      state.calls.push(options);
      if (options.method.endsWith('request_actions')) options.callback({message:{extended:true,status,expected_version:'2026-10-12 10:00:00',submit:status==='Draft',headcount_preview:false,revise_pending_quantities:allowed}});
      else options.callback?.({message:outcome==='denied'?{outcome:'denied',code:'HC_BLOCKED',message:'Synthetic <denial>',event:'TEST-EVENT'}:{name:doc.name}});
      options.always?.();
    }
  };
  vm.runInNewContext(source,{frappe,__:translate,crypto:{randomUUID:()=> 'synthetic-command'},window:{location:{assign(){}}}});
  handler.refresh(frm);
  return {state,frm};
}
{
  const {state}=setup({status:'Draft'}); state.buttons['Submit for Approval']();
  assert.equal(state.reloads,0); assert.equal(state.routes,0);
  assert.equal(state.messages.at(-1).indicator,'red');
  assert.equal(state.messages.at(-1).message,'Synthetic &lt;denial>');
}
{
  const {state}=setup(); state.buttons['Revise pending quantities']();
  const dialog=state.dialogs[0]; dialog.values.q0=3; dialog.primary_action();
  const call=state.calls.at(-1);
  assert.equal(call.method,'kandil_hr.recruitment.pending_revision.revise_pending_quantities');
  assert.equal(call.args.quantities['LINE-A'],3); assert.equal(call.args.expected_version,'2026-10-12 10:00:00');
  assert.equal(state.reloads,0); assert.equal(state.routes,0); assert.equal(state.hidden,0);
  assert.equal(dialog.values.q0,3); assert.equal(state.messages.at(-1).indicator,'red');
  assert.ok(state.html.at(-1).includes('<td>3</td><td>2</td><td>1</td>'));
}
for (const config of [{requester:'someone-else@example.test'},{amends:'PARENT'},{allowed:false},{status:'Approved'}]) {
  assert.equal(setup(config).state.buttons['Revise pending quantities'],undefined);
}
{
  const {state}=setup(); state.buttons['Revise pending quantities']();
  const dialog=state.dialogs[0]; dialog.values.q0=0; const before=state.calls.length; dialog.primary_action();
  assert.equal(state.calls.length,before); assert.equal(state.hidden,0);
}
{
  const {state}=setup({outcome:'success'}); state.buttons['Revise pending quantities']();
  const dialog=state.dialogs[0]; dialog.values.q0=3; dialog.primary_action();
  assert.equal(state.reloads,1); assert.equal(state.hidden,1);
}
console.log('PASS: submit denial, revision denial/form retention/delta, four visibility denials, invalid quantity and success callbacks. Mocked callback contract only; runtime AR/EN/browser proof remains pending.');
