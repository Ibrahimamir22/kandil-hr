frappe.ui.form.on('Kandil JD Revision', {
  refresh(frm) {
    if (!frm.is_new() && frm.doc.status === 'Draft' && frm.doc.owner !== frappe.session.user && frappe.user.has_role('Kandil Sector Approver')) {
      frm.add_custom_button(__('Approve Revision'), () => frappe.confirm(__('Approve this version? Approved versions are immutable.'), async () => {
        if(frm.is_dirty()) return frappe.msgprint(__('Reload the saved revision before approving.'));
        await frappe.call({method:'kandil_hr.organization.api.approve_revision',args:{doctype:frm.doctype,name:frm.doc.name,expected_version:frm.doc.modified}});
        await frm.reload_doc();
      }));
    }
  }
});

frappe.ui.form.on('Kandil JD Revision', {
  async position(frm) {
    if (!frm.doc.position || !frm.is_new()) return;
    const r = await frappe.db.get_value('Kandil Position', frm.doc.position, ['company','department','branch']);
    if (r.message) await frm.set_value(r.message);
  }
});

frappe.ui.form.on('Kandil JD Revision', {
  refresh(frm) {
    if(frm.is_new()) return;
    for(const language of ['ar','en']) {
      for(const kind of ['jd','worker']) {
        const title=(kind==='jd'?__('Job Description'):__('Worker Card'))+' ('+language.toUpperCase()+')';
        for(const [action,method] of [[__('View / Print'),'view'],[__('Download PDF'),'download_pdf']]) {
          frm.add_custom_button(title+' - '+action,()=>{
            const args=new URLSearchParams({name:frm.doc.name,language,kind});
            window.open('/api/method/kandil_hr.organization.documents.'+method+'?'+args,'_blank','noopener');
          },__('Documents'));
        }
      }
    }
  }
});
