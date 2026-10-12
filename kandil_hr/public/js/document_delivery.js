/* Local-only composed mail capture. Server validates every recipient and revision. */
frappe.ui.form.on('Kandil JD Revision', {
  refresh(frm) {
    if (frm.is_new() || frm.doc.status !== 'Approved') return;
    frm.add_custom_button(__('Capture document delivery locally'), async () => {
      if (frm.is_dirty()) return frappe.msgprint(__('Reload the saved revision before capturing.'));
      const name = frm.doc.name;
      const version = frm.doc.modified;
      const response = await frappe.call({method:'kandil_hr.organization.document_delivery.recipients', type:'GET', args:{name}});
      if (frm.doc.name !== name || frm.doc.modified !== version) return;
      const eligible = response.message || [];
      const command_id = crypto.randomUUID();
      const dialog = new frappe.ui.Dialog({
        title: __('Capture document delivery locally'),
        fields: [
          {fieldtype:'HTML',options:frappe.utils.escape_html(__('Creates a private HTML and PDF mail capture. No email is sent. Select at most ten eligible portal users.'))},
          {fieldname:'recipients',fieldtype:'MultiSelectList',label:__('Portal recipients'),reqd:1,get_data(txt) {
            const query = (txt || '').toLowerCase();
            return eligible.filter(row => (row.user + ' ' + row.label).toLowerCase().includes(query)).map(row=>({value:row.user,description:row.label}));
          }},
          {fieldname:'language',fieldtype:'Select',label:__('Language'),options:['ar','en'],default:frappe.boot.lang === 'ar' ? 'ar' : 'en',reqd:1},
          {fieldname:'kind',fieldtype:'Select',label:__('Document Kind'),options:[{value:'jd',label:__('Job Description')},{value:'worker',label:__('Worker Card')}],default:'jd',reqd:1},
          {fieldname:'note',fieldtype:'Small Text',label:__('Note'),description:__('At most 500 characters.')}
        ],
        primary_action_label:__('Capture locally'),
        async primary_action(values) {
          if (frm.doc.name !== name || frm.doc.modified !== version || frm.is_dirty()) return frappe.msgprint(__('Reload the saved revision before capturing.'));
          const result = await frappe.call({method:'kandil_hr.organization.document_delivery.capture',args:{name,expected_version:version,command_id,...values},freeze:true});
          dialog.hide();
          frappe.msgprint(__('Captured locally. No email has been sent.'));
          if (result.message?.captures?.length === 1) frappe.set_route('Form','Kandil Document Delivery',result.message.captures[0]);
          else frappe.set_route('List','Kandil Document Delivery',{jd_revision:name});
        }
      });
      dialog.show();
    }, __('Documents'));
    frm.add_custom_button(__('Captured document deliveries'),()=>frappe.set_route('List','Kandil Document Delivery',{jd_revision:frm.doc.name}),__('Documents'));
  }
});
frappe.ui.form.on('Kandil Document Delivery', {
  refresh(frm) {
    frm.disable_save();
    if (frm.is_new()) return;
    frm.add_custom_button(__('Download captured mail'),()=>{
      window.open('/api/method/kandil_hr.organization.document_delivery.download?name='+encodeURIComponent(frm.doc.name),'_blank','noopener');
    });
  }
});
