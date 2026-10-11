frappe.ui.form.on('Job Offer', {
  refresh(frm) {
    if (!frm.meta.fields.some(f => f.fieldname === 'custom_kandil_outcome') || frm.is_new()) return;
    const name = frm.doc.name;
    const generation = (frm.kandil_action_generation || 0) + 1;
    frm.kandil_action_generation = generation;
    frappe.call({
      method: 'kandil_hr.pilot.navigation.offer_actions', type: 'GET', args: { name },
      callback: ({ message: actions }) => {
        if (!actions || frm.doc.name !== name || frm.kandil_action_generation !== generation || !actions.managed) return;
        frm.remove_custom_button(__('Create Employee'));
        frm.add_custom_button(__('HR workspace'), () => window.location.assign('/kandil-pilot'));
        frm.set_intro(actions.outcome === 'Pending' ? __('Accepted offers do not create employees. Confirm actual joining using Record Joining Outcome.') : __('Joining outcome: {0}', [frappe.utils.escape_html(__(actions.outcome))]), 'blue');
        if (!actions.record_outcome) return;
        frm.add_custom_button(__('Record Joining Outcome'), () => {
          frappe.prompt([
            { fieldname: 'outcome', fieldtype: 'Select', label: __('Outcome'), options: 'Joined\nNo Show\nWithdrawn', reqd: 1 },
            { fieldname: 'joining_date', fieldtype: 'Date', label: __('Actual Joining Date'), default: frappe.datetime.get_today(), depends_on: 'eval:doc.outcome=="Joined"', mandatory_depends_on: 'eval:doc.outcome=="Joined"' },
            { fieldname: 'date_of_birth', fieldtype: 'Date', label: __('Date of Birth'), depends_on: 'eval:doc.outcome=="Joined"', mandatory_depends_on: 'eval:doc.outcome=="Joined"' },
            { fieldname: 'gender', fieldtype: 'Link', options: 'Gender', label: __('Gender'), depends_on: 'eval:doc.outcome=="Joined"', mandatory_depends_on: 'eval:doc.outcome=="Joined"' },
            { fieldname: 'reason', fieldtype: 'Small Text', label: __('Reason'), mandatory_depends_on: 'eval:doc.outcome!="Joined"' }
          ], args => frappe.call({
            method: 'kandil_hr.pilot.api.record_outcome', args: { offer_name: name, ...args }, freeze: true,
            callback: r => { frappe.msgprint(__('Recorded: {0}', [frappe.utils.escape_html(__(r.message.outcome))])); frm.reload_doc(); }
          }));
        });
      }
    });
  }
});
