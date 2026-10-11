frappe.ui.form.on('Kandil Hiring Request', {
  refresh(frm) {
    const locked = frm.doc.status !== 'Draft';
    ['company', 'department', 'title', 'exception_reason', 'lines'].forEach(field => frm.set_df_property(field, 'read_only', locked ? 1 : 0));
    if (locked) frm.disable_save(); else frm.enable_save();
    frm.add_custom_button(__('HR workspace'), () => window.location.assign('/kandil-pilot'));
    if (frm.is_new()) return;
    const name = frm.doc.name;
    const generation = (frm.kandil_action_generation || 0) + 1;
    frm.kandil_action_generation = generation;
    const call = (method, args) => frappe.call({
      method: 'kandil_hr.pilot.api.' + method,
      args: { name, ...args }, freeze: true,
      callback: () => frm.reload_doc()
    });
    frappe.call({
      method: 'kandil_hr.pilot.navigation.request_actions', type: 'GET', args: { name },
      callback: ({ message: actions }) => {
        if (!actions || frm.doc.name !== name || frm.kandil_action_generation !== generation) return;
        if (actions.next_authority) {
          frm.set_intro(__('Next approval: {0}', [frappe.utils.escape_html(__(actions.next_authority))]), 'blue');
        } else {
          frm.set_intro(__('Recruitment status: {0}', [frappe.utils.escape_html(__(actions.status))]), actions.status === 'Approved' || actions.status === 'Filled' ? 'green' : 'blue');
        }
        if (actions.submit) frm.add_custom_button(__('Submit for Approval'), () => {
          if (frm.is_dirty()) return frappe.msgprint(__('Save your changes first.'));
          frappe.confirm(__('Reserve the requested headcount and start approvals?'), () => call('submit_request', {}));
        });
        if (actions.decide) {
          frm.add_custom_button(__('Approve'), () => frappe.prompt([{ fieldname: 'comment', fieldtype: 'Small Text', label: __('Comment') }], v => call('decide', { decision: 'Approve', comment: v.comment || '' })));
          frm.add_custom_button(__('Reject'), () => frappe.prompt([{ fieldname: 'comment', fieldtype: 'Small Text', label: __('Reason'), reqd: 1 }], v => call('decide', { decision: 'Reject', comment: v.comment })));
        }
        if (actions.cancel) frm.add_custom_button(__('Cancel Recruitment'), () => frappe.prompt([{ fieldname: 'reason', fieldtype: 'Small Text', label: __('Reason'), reqd: 1 }], v => call('cancel_request', v)));
      }
    });
  }
});
