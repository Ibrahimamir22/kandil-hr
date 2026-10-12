frappe.ui.form.on('Kandil Structure Snapshot', {
  refresh(frm) {
    if (frm.is_new()) return;
    for (const [language, label] of [['en', __('View Structure (English)')], ['ar', __('View Structure (Arabic)')]]) {
      frm.add_custom_button(label, () => window.open(
        '/api/method/kandil_hr.organization.snapshots.view?name=' + encodeURIComponent(frm.doc.name) + '&language=' + language,
        '_blank', 'noopener'
      ));
    }
  }
});
