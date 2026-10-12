frappe.ui.form.on('Kandil Position', {
  async refresh(frm) {
    if(frm.is_new()) {
      const r=await frappe.call({method:'kandil_hr.organization.api.position_creation_policy'});
      if(r.message?.approval_required) {
        frm.disable_save();
        frm.set_intro(__('New positions are created after a structure request receives HR and CEO approval.'));
        frm.add_custom_button(__('Request New Position'),()=>{
          if(!frm.doc.company||!frm.doc.department||!frm.doc.designation||!frm.doc.title) return frappe.msgprint(__('Enter company, department, designation and title first.'));
          frappe.new_doc('Kandil Structure Change',{},doc=>{
            doc.company=frm.doc.company;doc.effective_on=frappe.datetime.get_today();doc.reason=__('New position');
            doc.changes_json=JSON.stringify([{action:'Create',draft_key:crypto.randomUUID(),title:frm.doc.title,title_ar:frm.doc.title_ar||'',company:undefined,department:frm.doc.department,branch:frm.doc.branch||null,designation:frm.doc.designation,structural:frm.doc.structural||1,authority:'Department Approval'}]);
          });
        });
      }
      return;
    }
    frm.add_custom_button(__('Reconcile Occupancy'),async()=>{
      const r=await frappe.call({method:'kandil_hr.organization.api.reconcile_occupancy',args:{company:frm.doc.company}});
      const rows=(r.message.rows||[]).filter(row=>row.position===frm.doc.name);
      frappe.msgprint({title:__('Occupancy Reconciliation'),message:$('<pre>').text(JSON.stringify(rows,null,2)).prop('outerHTML')});
    });
  }
});
