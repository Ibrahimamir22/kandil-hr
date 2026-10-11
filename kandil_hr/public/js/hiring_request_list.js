frappe.listview_settings['Kandil Hiring Request'] = {
  add_fields: ['status', 'needs_exception'],
  get_indicator(doc) {
    const colors = { Draft: 'gray', Pending: 'orange', Approved: 'green', Rejected: 'red', Cancelled: 'gray', Filled: 'blue' };
    return [__(doc.status), colors[doc.status] || 'gray', 'status,=,' + doc.status];
  },
  onload(listview) {
    listview.page.add_inner_button(__('HR workspace'), () => window.location.assign('/kandil-pilot'));
  }
};
