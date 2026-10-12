frappe.ui.form.on('Kandil Hiring Request', {
  refresh(frm) {
    const locked = frm.doc.status !== 'Draft';
    ['company', 'department', 'title', 'exception_reason', 'lines', 'requested_position', 'need_reason', 'replacement_employee', 'employment_type', 'required_by', 'qualifications', 'skills_required', 'experience_required', 'working_conditions', 'requested_priority'].forEach(field => frm.set_df_property(field, 'read_only', locked ? 1 : 0));
    if (locked) frm.disable_save(); else frm.enable_save();
    frm.add_custom_button(__('HR workspace'), () => window.location.assign('/kandil-pilot'));
    if (frm.is_new()) return;
    const name = frm.doc.name;
    const generation = (frm.kandil_action_generation || 0) + 1;
    frm.kandil_action_generation = generation;
    let extended = false, version = null, step = null;
    const call = (method, args) => frappe.call({
      method: (extended ? 'kandil_hr.recruitment.api.' : 'kandil_hr.pilot.api.') + method,
      args: { name, ...(extended ? { command_id: crypto.randomUUID(), expected_version: version } : {}), ...args }, freeze: true,
      callback: (r) => { if (method === 'amend' && r.message?.name) frappe.set_route('Form', 'Kandil Hiring Request', r.message.name); else frm.reload_doc(); }
    });
    frappe.call({
      method: 'kandil_hr.pilot.navigation.request_actions', type: 'GET', args: { name },
      callback: ({ message: actions }) => {
        if (!actions || frm.doc.name !== name || frm.kandil_action_generation !== generation) return;
        extended = actions.extended; version = actions.expected_version; step = actions.step_id;
        if (actions.confidential_notes) {
          frm.add_custom_button(__('Confidential HR Notes'), () => frappe.set_route('List', 'Kandil HR Note', {request: name}));
          frm.add_custom_button(__('Add Confidential HR Note'), () => frappe.new_doc('Kandil HR Note', {request: name}));
        }
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
          frm.add_custom_button(__('Approve'), () => frappe.prompt([{ fieldname: 'comment', fieldtype: 'Small Text', label: __('Comment') }], v => call('decide', { decision: 'Approve', ...(extended ? {step_id: step} : {}), comment: v.comment || '' })));
          frm.add_custom_button(__('Reject'), () => frappe.prompt([{ fieldname: 'comment', fieldtype: 'Small Text', label: __('Reason'), reqd: 1 }], v => call('decide', { decision: 'Reject', ...(extended ? {step_id: step} : {}), comment: v.comment })));
        }
        if (extended && actions.decide) frm.add_custom_button(__('Return for Revision'), () => frappe.prompt([{fieldname:'comment',fieldtype:'Small Text',label:__('Reason'),reqd:1}], v => call('decide',{decision:'Return',step_id:step,comment:v.comment})));
        if (extended && actions.revise) frm.add_custom_button(__('Create Revision'), () => frappe.prompt([{fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}], v => call('revise',v)));
        if (extended && actions.amend) frm.add_custom_button(__('Propose Amendment'), () => frappe.prompt([{fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}], v => call('amend',v)));
        if (extended && actions.review) {
          frm.add_custom_button(__('Review Quantities'), () => {
            const fields = frm.doc.lines.map((row,i) => ({fieldname:'q'+i,fieldtype:'Int',label:__('Quantity')+' — '+row.capacity,default:row.proposed_qty,reqd:1}));
            fields.push({fieldname:'priority',fieldtype:'Select',label:__('HR Priority'),options:['Normal','Important','Critical'],default:frm.doc.hr_priority||'Normal',reqd:1},{fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1});
            frappe.prompt(fields,v => call('review',{quantities:Object.fromEntries(frm.doc.lines.map((r,i)=>[r.name,v['q'+i]])),priority:v.priority,reason:v.reason}));
          });
          frm.add_custom_button(__('Send to CEO'), () => frappe.prompt([{fieldname:'reason',fieldtype:'Small Text',label:__('Reason'),reqd:1}],v=>call('send_to_ceo',v)));
        }
        if (actions.cancel) frm.add_custom_button(__('Cancel Recruitment'), () => frappe.prompt([{ fieldname: 'reason', fieldtype: 'Small Text', label: __('Reason'), reqd: 1 }], v => call('cancel_request', v)));
      }
    });
  }
});
