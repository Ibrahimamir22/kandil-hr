frappe.ui.form.on("Kandil Notification Outbox", {
    refresh(frm) {
        if (frm.doc.status !== "Failed" || !frappe.user.has_role("System Manager")) return;
        frm.add_custom_button(__("Retry Local Notification"), () => {
            frappe.prompt({fieldname: "reason", fieldtype: "Small Text", label: __("Retry Reason"), reqd: 1}, (values) => {
                frappe.call({
                    method: "kandil_hr.foundation.outbox.retry_failed",
                    args: {name: frm.doc.name, reason: values.reason}, freeze: true,
                    callback: () => frm.reload_doc(),
                });
            }, __("Retry Local Notification"));
        });
    },
});
