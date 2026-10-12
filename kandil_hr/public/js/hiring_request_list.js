frappe.listview_settings['Kandil Hiring Request'] = {
  add_fields: ['status', 'needs_exception'],
  get_indicator(doc) {
    const colors = { Draft: 'gray', Pending: 'orange', Approved: 'green', Rejected: 'red', Cancelled: 'gray', Filled: 'blue' };
    return [__(doc.status), colors[doc.status] || 'gray', 'status,=,' + doc.status];
  },
  onload(listview) {
    listview.page.add_inner_button(__('My Requests'), async () => {
      await listview.filter_area.remove('requested_by');
      await listview.filter_area.add([['Kandil Hiring Request', 'requested_by', '=', frappe.session.user]]);
    });
    listview.page.add_inner_button(__('Requests in My Scope'), () => listview.filter_area.remove('requested_by'));
    listview.page.add_inner_button(__('HR workspace'), () => window.location.assign('/kandil-pilot'));
  }
};
