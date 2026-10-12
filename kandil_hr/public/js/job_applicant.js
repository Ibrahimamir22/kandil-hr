frappe.ui.form.on('Job Applicant', {
  refresh(frm) {
    const generation=(frm.__kandil_owner_generation||0)+1; frm.__kandil_owner_generation=generation;
    const docname=frm.doc.name;
    const current=()=>frm.doc.name===docname && frm.__kandil_owner_generation===generation;
    if (frm.is_new() || !frm.doc.job_title) return;
    frappe.call({type:'GET', method:'kandil_hr.recruitment.ownership.actions', args:{name:frm.doc.name}, callback(r) {
      if (!current()) return;
      const a=r.message;
      if (!a?.enabled) return;
      frm.add_custom_button(__('HR unassigned applications'), () => {
        frappe.call({type:'GET',method:'kandil_hr.recruitment.ownership.application_queue',args:{unassigned:1},callback(result) {
          const rows=result.message||[];
          const dialog=new frappe.ui.Dialog({title:__('HR unassigned applications'),fields:[{fieldname:'items',fieldtype:'HTML'}]});
          dialog.fields_dict.items.$wrapper.html(rows.length ? rows.map(row => `<p><a href="/desk/job-applicant/${encodeURIComponent(row.name)}">${frappe.utils.escape_html(row.applicant_name)}</a> — ${frappe.utils.escape_html(row.assignment_warning||'')}</p>`).join('') : frappe.utils.escape_html(__('No unassigned applications in your scope.')));
          dialog.show();
        }});
      }, __('Application actions'));
      if (!a.can_manage) return;
      const send=(method,values)=>{if(!current()) {frappe.msgprint(__('Reload this application before taking an action.'));return;} return frappe.call({method:'kandil_hr.recruitment.ownership.'+method,args:{name:docname,expected_version:a.expected_version,application_version:a.application_version,command_id:crypto.randomUUID(),...values},freeze:true,callback(){if(current())frm.reload_doc();}});};
      frm.add_custom_button(__('Assign application owner'),()=>frappe.prompt([
        {fieldname:'owner',fieldtype:'Link',options:'User',label:__('Responsible Recruiter'),reqd:1},
        {fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}
      ],values=>send('assign_application',values),__('Assign application owner')),__('Application actions'));
      frm.add_custom_button(__('Set next action'),()=>frappe.prompt([
        {fieldname:'task',fieldtype:'Small Text',label:__('Recruitment Next Action'),default:frm.doc.custom_kandil_next_action},
        {fieldname:'due',fieldtype:'Date',label:__('Next Action Due'),default:frm.doc.custom_kandil_next_action_due},
        {fieldname:'owner',fieldtype:'Link',options:'User',label:__('Next Action Owner'),default:frm.doc.custom_kandil_next_action_owner},
        {fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}
      ],values=>send('set_next_action',{task:'',due:'',owner:'',...values}),__('Set next action')),__('Application actions'));
    }});
  }
});
