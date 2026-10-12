frappe.listview_settings['Kandil Position'] = {
  onload(listview) {
    if (!frappe.user.has_role('Kandil Recruiter') && frappe.session.user !== 'Administrator') return;
    listview.page.add_inner_button(__('Download Position Register'), () => {
      const dialog = new frappe.ui.Dialog({
        title: __('Download Position Register'),
        fields: [
          {fieldname: 'notice', fieldtype: 'HTML', options: `<p>${__('Download the positions you can access. Choose optional export filters below; this does not use the list filters.')}</p>`},
          {fieldname: 'company', fieldtype: 'Link', options: 'Company', label: __('Company')},
          {fieldname: 'department', fieldtype: 'Link', options: 'Department', label: __('Department'), get_query: () => ({filters: dialog.get_value('company') ? {company: dialog.get_value('company')} : {}})},
          {fieldname: 'branch', fieldtype: 'Link', options: 'Branch', label: __('Branch')},
        ],
        primary_action_label: __('Download CSV'),
        async primary_action(values) {
          const button = dialog.get_primary_btn();
          button.prop('disabled', true);
          try {
            const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
            const response = await fetch(`/api/method/kandil_hr.foundation.position_register.export_positions?${params}`, {credentials: 'same-origin'});
            if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) {
              throw new Error(__('The register could not be downloaded. Check your access and narrow the filters to at most 5000 positions.'));
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = 'kandil-position-register.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            dialog.hide();
          } catch (error) {
            frappe.msgprint({title: __('Download failed'), message: frappe.utils.escape_html(error.message)});
          } finally {
            button.prop('disabled', false);
          }
        },
      });
      dialog.show();
    });
  },
};
