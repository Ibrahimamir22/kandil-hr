frappe.ui.form.on('Kandil Mail Capture', {
  refresh(frm) {
    frm.disable_save();
    if (frm.is_new()) return;
    frm.add_custom_button(__('Download captured mail'), () => {
      window.open('/api/method/kandil_hr.foundation.mail_capture.download?name=' + encodeURIComponent(frm.doc.name), '_blank', 'noopener');
    });
  }
});
