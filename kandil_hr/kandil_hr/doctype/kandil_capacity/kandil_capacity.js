frappe.ui.form.on("Kandil Capacity", {
	refresh(frm) {
		const current = frm.doc.__onload?.current_occupancy;
		if (!current) return;
		frm.set_df_property("occupied", "label", __("Recorded Occupied"));
		frm.set_df_property("available", "label", __("Recorded Available"));
		frm.dashboard.add_comment(
			__("Current dated occupancy: {0}. Current availability: {1}. Recorded occupied: {2}. Evaluation date: {3}. Basis: {4}. Recorded as of: {5}.",
				[current.occupied, current.available, current.capacity_occupied, current.as_of, __(current.basis), frm.doc.occupancy_as_of || __("Not recorded")]),
			current.difference ? "orange" : "blue",
			true
		);
		if (current.unresolved) frm.dashboard.add_comment(__("Unmatched imported baseline requires review. Availability is conservative; assignment-only availability is {0}.", [current.assignment_available]), "orange", true);
		if (frappe.user.has_role("Kandil Sector Approver")) {
			frm.add_custom_button(__("Review Occupancy"), async () => {
				const response = await frappe.call("kandil_hr.organization.occupancy.preview", {name: frm.doc.name});
				const reviewed = response.message;
				frappe.prompt({fieldname: "reason", label: __("Reconciliation Reason"), fieldtype: "Small Text", reqd: 1}, (v) => {
					frappe.confirm(__("Replace recorded occupied {0} with dated assignment occupancy {1}?", [reviewed.capacity_occupied, reviewed.occupied]), async () => {
						await frappe.call("kandil_hr.organization.occupancy.reconcile_baseline", {name: frm.doc.name, expected_version: reviewed.expected_version, expected_occupied: reviewed.occupied, expected_baseline: reviewed.capacity_occupied, reason: v.reason});
						frm.reload_doc();
					});
				}, __("Review Occupancy"));
			});
		}
	}
});
