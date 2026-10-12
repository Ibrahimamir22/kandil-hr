
frappe.ui.form.on('Kandil Position Assignment', {
  async position(frm) {
    if (!frm.doc.position || !frm.is_new()) return;
    const r = await frappe.db.get_value('Kandil Position', frm.doc.position, ['company','department','branch']);
    if (r.message) await frm.set_value(r.message);
  }
});
