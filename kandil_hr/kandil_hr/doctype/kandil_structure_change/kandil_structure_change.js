frappe.ui.form.on('Kandil Structure Change', {
  refresh(frm) {
    const operations = JSON.parse(frm.doc.changes_json || '[]');
    const escape = frappe.utils.escape_html;
    const rows = operations.map((op, index) => `<tr><td>${index + 1}</td><td>${escape(__(op.action))}</td><td>${escape(op.position || op.title || '')}</td><td>${escape(op.parent_position || '')}</td><td>${escape(op.action === 'Resize' ? String(op.structural) : __(op.authority || ''))}</td></tr>`).join('');
    frm.fields_dict.operations_preview.$wrapper.html(`<table class="table table-bordered"><thead><tr><th>#</th><th>${__('Action')}</th><th>${__('Position')}</th><th>${__('Parent Position')}</th><th>${__('Details')}</th></tr></thead><tbody>${rows}</tbody></table>`);
    const created=JSON.parse(frm.doc.created_positions_json||'{}');
    Object.values(created).forEach(name=>frm.fields_dict.operations_preview.$wrapper.append(`<p><a href="/desk/kandil-position/${encodeURIComponent(name)}">${escape(name)}</a></p>`));
    if (['Draft','Returned'].includes(frm.doc.status) && (frm.is_new() || frm.doc.owner===frappe.session.user)) {
      frm.add_custom_button(__('Add Structure Change'), () => {
        const dialog = new frappe.ui.Dialog({title:__('Add Structure Change'), fields:[
          {fieldname:'action',label:__('Action'),fieldtype:'Select',options:['Create','Reparent','Resize','Close'],reqd:1},
          {fieldname:'position',label:__('Position'),fieldtype:'Link',options:'Kandil Position',depends_on:'eval:doc.action!=="Create"',get_query:()=>({filters:{company:frm.doc.company,status:'Active'}})},
          {fieldname:'parent_position',label:__('Parent Position'),fieldtype:'Link',options:'Kandil Position',depends_on:'eval:doc.action=="Reparent"||doc.action=="Create"',get_query:()=>({filters:{company:frm.doc.company,status:'Active'}})},
          {fieldname:'authority',label:__('Approval Authority'),fieldtype:'Select',options:['Department Approval','Sector Approval','HR Approval','CEO Approval','Board Approval'],depends_on:'eval:doc.action=="Reparent"||doc.action=="Create"'},
          {fieldname:'title',label:__('Title'),fieldtype:'Data',depends_on:'eval:doc.action=="Create"'},
          {fieldname:'title_ar',label:__('Arabic Title'),fieldtype:'Data',depends_on:'eval:doc.action=="Create"'},
          {fieldname:'department',label:__('Department'),fieldtype:'Link',options:'Department',depends_on:'eval:doc.action=="Create"',get_query:()=>({filters:{company:frm.doc.company}})},
          {fieldname:'branch',label:__('Branch'),fieldtype:'Link',options:'Branch',depends_on:'eval:doc.action=="Create"'},
          {fieldname:'designation',label:__('Designation'),fieldtype:'Link',options:'Designation',depends_on:'eval:doc.action=="Create"'},
          {fieldname:'structural',label:__('Structural Seats'),fieldtype:'Int',default:1,depends_on:'eval:doc.action=="Resize"||doc.action=="Create"'}
        ],primary_action_label:__('Add'),primary_action: async values => {
          if(['Reparent','Create'].includes(values.action)&&!values.authority) return frappe.msgprint(__('Select an approval authority.'));
          if(values.action!=='Create'&&!values.position) return frappe.msgprint(__('Select a position.'));
          if(values.action==='Create'&&(!values.title||!values.department||!values.designation)) return frappe.msgprint(__('Enter title, department and designation.'));
          const op={action:values.action};
          if(values.action!=='Create')op.position=values.position;
          else Object.assign(op,{draft_key:crypto.randomUUID(),title:values.title,title_ar:values.title_ar||'',department:values.department,branch:values.branch||null,designation:values.designation});
          if(['Reparent','Create'].includes(values.action)){op.parent_position=values.parent_position||null;op.authority=values.authority;}
          if(['Resize','Create'].includes(values.action))op.structural=values.structural;
          operations.push(op);
          await frm.set_value('changes_json',JSON.stringify(operations));
          dialog.hide();frm.trigger('refresh');
        }});dialog.show();
      });
      if (operations.length) frm.add_custom_button(__('Remove Last Change'), async () => {operations.pop();await frm.set_value('changes_json',JSON.stringify(operations));frm.trigger('refresh');});
      if (!frm.is_new()) {
        frm.add_custom_button(__('Preview Changes'), async () => {
          if (frm.is_dirty()) await frm.save();
          const r=await frappe.call({method:'kandil_hr.organization.api.preview_structure',args:{name:frm.doc.name}});
          await frm.reload_doc();
          frappe.msgprint({title:__('Structure Preview'),message:__('Preview saved. Review the proposed changes before submission.')});
        });
        if(frm.doc.preview_hash && frm.doc.owner===frappe.session.user) frm.add_custom_button(__('Submit for Approval'), async () => {
          await frappe.call({method:'kandil_hr.organization.api.submit_structure',args:{name:frm.doc.name,preview_hash:frm.doc.preview_hash,command_id:crypto.randomUUID(),expected_version:frm.doc.modified}});
          await frm.reload_doc();
        });
      }
    }
    const history=JSON.parse(frm.doc.route_snapshot||'{}').history||[];
    history.forEach(round=>{
      const decisions=round.steps.filter(step=>step.decision!=='Pending').map(step=>`<li>${escape(__(step.authority))}: ${escape(__(step.decision))} — ${escape(step.comment||'')} (${escape(step.actor||'')})</li>`).join('');
      frm.fields_dict.operations_preview.$wrapper.append(`<details><summary>${__('Previous Review')} ${escape(String(round.round))}</summary><ul>${decisions}</ul></details>`);
    });
    const step=(frm.doc.approval_steps||[]).find(row=>row.decision==='Pending');
    if(frm.doc.status==='Pending'&&step&&step.principal===frappe.session.user) {
      ['Approved','Rejected','Returned'].forEach(decision=>frm.add_custom_button(__(decision==='Approved'?'Approve Structure':decision==='Returned'?'Return Structure':'Reject Structure'),()=>{
        frappe.prompt([{fieldname:'comment',label:__('Comment'),fieldtype:'Small Text',reqd:decision!=='Approved'}],async values=>{
          await frappe.call({method:'kandil_hr.organization.api.decide_structure',args:{name:frm.doc.name,preview_hash:frm.doc.preview_hash,decision,comment:values.comment||'',step_id:step.step_key,command_id:crypto.randomUUID(),expected_version:frm.doc.modified}});
          await frm.reload_doc();
        },__('Structure Decision'),__('Submit'));
      }));
    }
  }
});
