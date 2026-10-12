frappe.ui.form.on('Kandil Hiring Request', {
  refresh(frm) {
    const locked = frm.doc.status !== 'Draft';
    ['company', 'department', 'beneficiary_user', 'title', 'exception_reason', 'lines', 'requested_position', 'need_reason', 'replacement_employee', 'employment_type', 'required_by', 'qualifications', 'skills_required', 'experience_required', 'working_conditions', 'requested_priority'].forEach(field => frm.set_df_property(field, 'read_only', locked ? 1 : 0));
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
        if (extended) frm.add_custom_button(__('Decision Timeline'), () => {
          const dialog = new frappe.ui.Dialog({title: __('Decision Timeline'), size: 'extra-large', fields: [{fieldname:'events',fieldtype:'HTML'}]});
          const escape = value => frappe.utils.escape_html(String(value ?? ''));
          let entries = [];
          const load = start => frappe.call({
            method: 'kandil_hr.recruitment.review_views.timeline', type: 'GET', args: {name, start},
            callback: ({message: data}) => {
              if (!data || data.name !== name) return;
              entries = entries.concat(data.events);
              const headings = ['Action', 'Actor', 'Principal', 'Time', 'Note'].map(label => '<th>'+escape(__(label))+'</th>').join('');
              const rows = entries.map(row => '<tr>'+[__(row.action), row.actor, row.principal || __('Not recorded'), row.creation, row.note].map(value => '<td style="white-space:pre-wrap">'+escape(value)+'</td>').join('')+'</tr>').join('');
              dialog.fields_dict.events.$wrapper.html('<p>'+escape(__('Event times use {0}.', [data.timezone]))+'</p><p>'+escape(__('Missing historical principals are not inferred from the current route.'))+'</p><div class="table-responsive"><table class="table table-bordered"><thead><tr>'+headings+'</tr></thead><tbody>'+rows+'</tbody></table></div>');
              if (data.has_more) dialog.set_primary_action(__('Load More'), () => load(data.next_start));
              else dialog.hide_primary_action();
            }
          });
          dialog.show(); load(0);
        });
        if (extended && actions.headcount_preview) frappe.call({
          method: 'kandil_hr.recruitment.preview.headcount', type: 'GET', args: {name},
          callback: ({message: guidance}) => {
            if (!guidance || frm.doc.name !== name || frm.kandil_action_generation !== generation) return;
            const escape = frappe.utils.escape_html;
            const rows = guidance.rows.map(row => '<li>' + escape(__('{0}: Requested {1}; additional demand {2}; available excluding own reservation {3}; shortage {4}.', [row.branch || row.position, row.requested, row.incremental_demand, row.available, row.shortage])) + '</li>').join('');
            const submitted = guidance.submitted_mode ? ' ' + __('Submitted policy: {0}.', [__(guidance.submitted_mode)]) : '';
            const note = __('Saved values only. Preview does not reserve headcount; submission checks current capacity.');
            frm.dashboard.add_comment('<strong>' + escape(__('Headcount guidance')) + '</strong><p>' + escape(__('Current policy: {0}.', [__(guidance.current_mode)]) + submitted) + '</p><ul>' + rows + '</ul><p>' + escape(note) + '</p>', 'blue', true);
          }
        });
        if (extended && !actions.headcount_preview) frm.dashboard.add_comment(frappe.utils.escape_html(__('Live headcount guidance is unavailable for your role.')), 'blue', true);
        if (actions.correct_approved) frm.add_custom_button(__('Correct Approved Request'), () => {
          const specs = [
            ['employment_type','Employment Type','Link','Employment Type'], ['required_by','Required By','Date'],
            ['qualifications','Qualifications','Small Text'], ['skills_required','Skills Required','Small Text'],
            ['experience_required','Experience Required','Small Text'], ['working_conditions','Working Conditions','Small Text'],
            ['need_reason','Need Reason','Select','New Position\nReplacement\nTemporary Cover\nExpansion'], ['hr_priority','HR Priority','Select','Normal\nImportant\nCritical']
          ];
          const fields = [{fieldname:'guidance',fieldtype:'HTML',options:'<p>'+frappe.utils.escape_html(__('Reductions cannot be below actual joiners. Increases require approval. Relocation moves only unfilled seats; resolve candidates first.'))+'</p>'}];
          specs.forEach(([key,label,fieldtype,options]) => fields.push({fieldname:key,label:__(label),fieldtype,options,default:frm.doc[key] || ''}));
          frm.doc.lines.forEach((row,i) => {
            fields.push({fieldname:'q'+i,label:__('Approved quantity — {0}; joined {1}',[row.capacity,row.joined_qty]),fieldtype:'Int',default:row.approved_qty});
            if (row.approved_qty > row.joined_qty + row.closed_qty) fields.push({fieldname:'to'+i,label:__('Move unfilled seats from {0} to', [row.capacity]),fieldtype:'Link',options:'Kandil Capacity',get_query:()=>({filters:{company:frm.doc.company,department:frm.doc.department,name:['not in',frm.doc.lines.map(x=>x.capacity)]}})});
          });
          fields.push({fieldname:'reason',label:__('Reason'),fieldtype:'Small Text',reqd:1});
          frappe.prompt(fields, values => {
            const changes={},quantities={},relocations={};
            specs.forEach(([key])=>{if(String(values[key]||'')!==String(frm.doc[key]||''))changes[key]=values[key]||null});
            frm.doc.lines.forEach((row,i)=>{if(values['q'+i]!==row.approved_qty)quantities[row.name]=values['q'+i];if(values['to'+i])relocations[row.name]=values['to'+i]});
            frappe.call({method:'kandil_hr.recruitment.corrections.correct_approved',args:{name,command_id:crypto.randomUUID(),expected_version:version,reason:values.reason,fields:changes,quantities,relocations},freeze:true,callback:()=>frm.reload_doc()});
          }, __('Correct Approved Request'), __('Apply Correction'));
        });
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
        if (extended && actions.board_record) frm.add_custom_button(__('Record External Board Decision'), () => {
          frappe.prompt([
            {fieldname:'decision', fieldtype:'Select', label:__('Decision'), options:['Approve','Reject','Return'], reqd:1},
            {fieldname:'board_member', fieldtype:'Select', label:__('Deciding Board Member'), options:actions.board_members, reqd:1},
            {fieldname:'on_behalf_method', fieldtype:'Select', label:__('External Board Decision Method'), options:['MEETING','WHATSAPP','PHONE','EMAIL','PAPER','OTHER'], reqd:1},
            {fieldname:'on_behalf_note', fieldtype:'Small Text', label:__('Who decided and when'), reqd:1},
            {fieldname:'board_evidence', fieldtype:'Select', options:[{value:'',label:''}, ...(actions.board_files || []).map(file=>({value:file.name,label:frappe.utils.escape_html(file.label + ' — ' + file.name)}))], label:__('Private Board Evidence'), reqd:1},
            {fieldname:'comment', fieldtype:'Small Text', label:__('Reason'), reqd:1}
          ], values => call('decide', {step_id:step, ...values}), __('Record External Board Decision'), __('Record Decision'));
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
