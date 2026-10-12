frappe.ui.form.on('Job Opening', {
  refresh(frm) {
    if (frm.is_new() || !frm.doc.custom_kandil_request) return;
    frappe.call({type:'GET',method:'kandil_hr.recruitment.vacancies.actions',args:{opening_name:frm.doc.name},quiet:true,callback(r){
      const a=r.message;if(!a?.enabled||!a.can_manage)return;
      const call=(method,values)=>frappe.call({method:'kandil_hr.recruitment.vacancies.'+method,args:{name:a.name,opening_name:frm.doc.name,expected_version:a.expected_version,command_id:crypto.randomUUID(),...values},freeze:true,callback(){frm.reload_doc();}});
      const state=a.state;
      const actions=state==='Approved'?['Open','Hold','Freeze','Close','Cancel']:state==='On Hold'?['Resume','Freeze','Close','Cancel']:state==='Frozen'?['Unfreeze','Close','Cancel']:['Open','Partially Filled'].includes(state)?['Hold','Freeze','Close','Cancel']:[];
      actions.forEach(action=>frm.add_custom_button(__(action),()=>frappe.prompt([{fieldname:'reason',label:__('Reason'),fieldtype:'Small Text',reqd:1}],v=>call('set_state',{action,...v}),__(action)),__('Vacancy actions')));
      if(!actions.length)return;
      if(a.can_assign)frm.add_custom_button(__('Assign recruiter team'),()=>frappe.prompt([
        {fieldname:'lead',label:__('Lead Recruiter'),fieldtype:'Link',options:'User',reqd:1,default:frm.doc.custom_kandil_lead},
        {fieldname:'members',label:__('Recruiter Team'),fieldtype:'Table',fields:[{fieldname:'user',label:__('User'),fieldtype:'Link',options:'User',in_list_view:1,reqd:1}],data:frm.doc.custom_kandil_team||[]},
        {fieldname:'reason',label:__('Reason'),fieldtype:'Small Text',reqd:1}
      ],v=>call('assign_team',{lead:v.lead,members:(v.members||[]).map(x=>x.user),reason:v.reason}),__('Assign recruiter team')),__('Vacancy actions'));
      frm.add_custom_button(__('Set priority pin'),()=>frappe.prompt([
        {fieldname:'pin_until',label:__('Priority Pin Until'),fieldtype:'Date',default:frm.doc.custom_kandil_pin_until},
        {fieldname:'reason',label:__('Reason'),fieldtype:'Small Text',reqd:1}
      ],v=>call('pin',v),__('Set priority pin')),__('Vacancy actions'));
    }});
  }
});
