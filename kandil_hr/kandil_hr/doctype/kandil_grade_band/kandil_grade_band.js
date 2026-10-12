frappe.ui.form.on('Kandil Grade Band', {
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
