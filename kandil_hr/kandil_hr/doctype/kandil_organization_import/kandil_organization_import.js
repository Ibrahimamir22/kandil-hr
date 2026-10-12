frappe.ui.form.on('Kandil Organization Import', {
  import_kind(frm) {
    if(frm.doc.status==='Draft') {frm.set_value('rows_json','[]');frm.trigger('refresh');}
  },
  refresh(frm) {
    const kind=frm.doc.import_kind||'Positions';
    const link=(fieldname,label,options,required=true)=>({fieldname,label:__(label),fieldtype:'Link',options,in_list_view:1,reqd:required});
    const data=(fieldname,label,required=false)=>({fieldname,label:__(label),fieldtype:'Data',in_list_view:1,reqd:required});
    let fields;
    if(kind==='Positions') fields=[
      data('position_code','Position Code',true),data('title','Title',true),data('title_ar','Arabic Title'),
      {...link('department','Department','Department'),get_query:()=>({filters:{company:frm.doc.company}})},link('branch','Branch','Branch',false),link('designation','Designation','Designation'),
      {fieldname:'structural',label:__('Structural Seats'),fieldtype:'Int',in_list_view:1,reqd:1,default:1},data('external_id','External ID'),data('job_family','Job Family')
    ];
    else if(['Units','Jobs'].includes(kind)) {
      fields=[data('external_code','External Code',true),data('title','Title',true),link('target','Existing Target',kind==='Units'?'Department':'Designation',false)];
      if(kind==='Units') fields.push({...link('parent_department','Parent Department','Department',false),get_query:()=>({filters:{company:frm.doc.company,is_group:1}})},{fieldname:'is_group',label:__('Is Group'),fieldtype:'Check',in_list_view:1,default:0});
      else fields.push(data('job_family','Job Family'));
    }
    else {
      fields=[{...link('position','Position','Kandil Position'),get_query:()=>({filters:{company:frm.doc.company}})}];
      if(kind==='Hierarchy') fields.push(
        {...link('parent_position','Parent Position','Kandil Position',false),get_query:()=>({filters:{company:frm.doc.company}})},
        {fieldname:'authority',label:__('Approval Authority'),fieldtype:'Select',options:'Department Approval\nSector Approval\nHR Approval\nCEO Approval\nBoard Approval',in_list_view:1,reqd:1}
      );
      else fields.push(link('employee','Employee','Employee'),link('user','User','User',false),{fieldname:'allocation',label:__('Allocation'),fieldtype:'Select',options:'Primary\nActing',default:'Primary',in_list_view:1,reqd:1},data('remarks','Remarks'));
      fields.push({fieldname:'valid_from',label:__('Valid From'),fieldtype:'Date',in_list_view:1,reqd:1},{fieldname:'valid_until',label:__('Valid Until'),fieldtype:'Date',in_list_view:1});
    }
    const rows=JSON.parse(frm.doc.rows_json||'[]'),preview=JSON.parse(frm.doc.preview_json||'[]'),escape=frappe.utils.escape_html;
    const columns=fields.slice(0,7);
    const body=rows.map((row,i)=>`<tr>${columns.map(f=>`<td>${escape(String(row[f.fieldname]??''))}</td>`).join('')}<td>${escape(__(preview[i]?.action||'Draft'))}</td></tr>`).join('');
    frm.fields_dict.rows_preview.$wrapper.html(`<table class="table table-bordered"><thead><tr>${columns.map(f=>`<th>${escape(f.label)}</th>`).join('')}<th>${__('Status')}</th></tr></thead><tbody>${body}</tbody></table>`);
    if(frm.doc.status==='Draft'&&(frm.is_new()||frm.doc.owner===frappe.session.user)) frm.add_custom_button(__('Edit Import Rows'),()=>{
      const dialog=new frappe.ui.Dialog({title:__('Organization Baseline Import'),size:'extra-large',fields:[{fieldname:'rows',label:__('Rows'),fieldtype:'Table',data:rows,fields}],primary_action_label:__('Apply Rows'),primary_action:async values=>{
        const keys=fields.map(f=>f.fieldname);
        const clean=(values.rows||[]).map(row=>Object.fromEntries(keys.filter(k=>row[k]!==undefined&&row[k]!==null&&row[k]!=='').map(k=>[k,row[k]])));
        await frm.set_value('rows_json',JSON.stringify(clean));dialog.hide();frm.trigger('refresh');
      }});dialog.show();
    });
    if(frm.doc.status==='Applied'&&['Units','Jobs','Positions'].includes(kind)) frm.add_custom_button(__('View Imported Codes'),()=>frappe.set_route('List','Kandil Organization Code',{import_batch:frm.doc.name}));
    if(frm.is_new()) return;
    if(frm.doc.status==='Draft'&&frm.doc.owner===frappe.session.user) frm.add_custom_button(__('Load CSV'),()=>{
      if(frm.is_dirty()) return frappe.msgprint(__('Save the import draft before loading CSV.'));
      const headers=fields.map(f=>f.fieldname).join(',');
      const dialog=new frappe.ui.Dialog({title:__('Validate CSV Import'),size:'extra-large',fields:[
        {fieldname:'csv_file',fieldtype:'HTML'},
        {fieldname:'csv_text',label:__('CSV Content'),fieldtype:'Code',options:'Plain Text',reqd:1,description:__('UTF-8 CSV, at most 1 MiB and 1000 rows. Column headers:')+' '+headers},
        {fieldname:'validation_preview',fieldtype:'HTML'}
      ],primary_action_label:__('Validate CSV'),primary_action:validateCSV});
      const chooser=$('<input type="file" accept=".csv,text/csv">').attr('aria-label',__('Choose CSV File'));
      chooser.on('change',async event=>{
        const file=event.target.files[0];if(!file)return;
        if(file.size>1024*1024)return frappe.msgprint(__('CSV content exceeds the 1 MiB limit.'));
        try {await dialog.set_value('csv_text',new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));dialog.set_primary_action(__('Validate CSV'),validateCSV);dialog.fields_dict.validation_preview.$wrapper.empty();}
        catch(error){frappe.msgprint(__('CSV content must be valid UTF-8 text.'));}
      });
      dialog.fields_dict.csv_file.$wrapper.append(chooser);
      async function validateCSV(){
        const source=dialog.get_value('csv_text');
        if(!source)return;
        const response=await frappe.call({method:'kandil_hr.organization.api.preview_csv_import',args:{name:frm.doc.name,csv_text:source,expected_version:frm.doc.modified}});
        const result=response.message;
        const columns=fields.map(f=>f.fieldname);
        const table='<table class="table table-bordered"><thead><tr>'+fields.map(f=>'<th>'+escape(f.label)+'</th>').join('')+'<th>'+__('Status')+'</th></tr></thead><tbody>'+result.rows.slice(0,50).map((row,i)=>'<tr>'+columns.map(k=>'<td>'+escape(String(row[k]??''))+'</td>').join('')+'<td>'+escape(__(result.preview[i].action))+'</td></tr>').join('')+'</tbody></table>';
        dialog.fields_dict.validation_preview.$wrapper.html('<p>'+__('Validated {0} rows. Preview shows up to 50 rows; loading replaces the draft rows only.',[result.row_count])+'</p><div style="overflow:auto">'+table+'</div>');
        dialog.set_primary_action(__('Load Rows into Draft'),async()=>{
          if(dialog.get_value('csv_text')!==source){dialog.set_primary_action(__('Validate CSV'),validateCSV);return frappe.msgprint(__('CSV content changed. Validate it again before loading.'));}
          if(frm.is_dirty()||frm.doc.modified!==result.expected_version)return frappe.msgprint(__('The draft changed. Reload and validate the CSV again.'));
          await frm.set_value('rows_json',JSON.stringify(result.rows));dialog.hide();frm.trigger('refresh');
          frappe.show_alert({message:__('Rows loaded into the draft. Save it, then request independent review.'),indicator:'green'});
        });
      }
      dialog.show();
    });
    if(frm.doc.status==='Draft'&&frm.doc.owner!==frappe.session.user&&frappe.user.has_role('Kandil Sector Approver')) {
      frm.add_custom_button(__('Review Import'),async()=>{
        if(frm.is_dirty()) return frappe.msgprint(__('Reload the saved import before reviewing.'));
        await frappe.call({method:'kandil_hr.organization.api.review_import',args:{name:frm.doc.name,expected_version:frm.doc.modified}});
        await frm.reload_doc();
      });
    }
    if(frm.doc.status==='Reviewed') frm.add_custom_button(__('Apply Reviewed Import'),()=>frappe.confirm(__('Apply the reviewed baseline rows? Existing matching records will be preserved.'),async()=>{
      await frappe.call({method:'kandil_hr.organization.api.apply_import',args:{name:frm.doc.name,reviewed_digest:frm.doc.digest}});
      await frm.reload_doc();
    }));
  }
});
