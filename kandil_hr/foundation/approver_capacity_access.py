"""Read-only capacity references for scoped CEO and Board request review."""
import frappe


def execute():
    from kandil_hr.recruitment.models import enabled
    from frappe.permissions import add_permission, update_permission_property
    if not enabled():
        return
    for role in ('Kandil CEO Approver', 'Kandil Board Approver'):
        add_permission('Kandil Capacity', role)
        for permission in ('read', 'select'):
            update_permission_property('Kandil Capacity', role, 0, permission, 1)
        # Custom DocPerm defaults export=1; explicitly keep these rules read-only.
        for permission in ('write', 'create', 'delete', 'submit', 'cancel', 'amend',
                           'export', 'import', 'report', 'print', 'share', 'email'):
            update_permission_property('Kandil Capacity', role, 0, permission, 0)
    # Scope hooks and native User Permissions still constrain each record.
    # No write/create/delete/export rights or Access Grants are added.
    frappe.clear_cache(doctype='Kandil Capacity')
