frappe.ui.form.on('Kandil Delegation', {
  refresh(frm) {
    if(frm.is_new() || frm.doc.revoked) return;
    if(!frm.doc.approval_status)frm.set_intro(__('This legacy delegation is inactive. Create a reviewed new version before using it.'),'orange');
    const name=frm.doc.name, version=frm.doc.modified;
    const send=(method,values)=>{
      if(frm.doc.name!==name || frm.doc.modified!==version) {frappe.msgprint(__('Reload this delegation before taking an action.'));return;}
      frappe.call({method:'kandil_hr.foundation.delegation.'+method,args:{name,expected_version:version,command_id:crypto.randomUUID(),...values},freeze:true,callback(r){if(method==='revise')frappe.set_route('Form','Kandil Delegation',r.message.name);else if(frm.doc.name===name)frm.reload_doc();}});
    };
    if(frm.doc.approval_status==='Pending CEO' && frm.doc.from_user===frappe.session.user) {
      ['Approve','Reject'].forEach(decision=>frm.add_custom_button(__(decision),()=>frappe.prompt([{fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}],values=>send('decide',{decision,...values}),__(decision)),__('Delegation actions')));
    }
    if(frappe.user_roles.includes('Kandil Sector Approver'))frm.add_custom_button(__('New delegation version'),()=>frappe.prompt([
      {fieldname:'process_scope',fieldtype:'Select',options:'APPROVALS\nTEAM\nALL',label:__('Delegated Process'),reqd:1,default:frm.doc.process_scope},
      {fieldname:'from_date',fieldtype:'Date',label:__('From Date'),reqd:1,default:frm.doc.from_date},
      {fieldname:'to_date',fieldtype:'Date',label:__('To Date'),reqd:1,default:frm.doc.to_date},
      {fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}
    ],values=>send('revise',values),__('New delegation version')),__('Delegation actions'));
  }
});
