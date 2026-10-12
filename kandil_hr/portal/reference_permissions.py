"""Select-only shared reference masters for structural authors on opted-in sites.

Branch and Designation are global reference catalogs. This does not grant read,
write, create, employee access or company-wide structural management. The portal
additionally requires a whole-company grant before exposing its catalog adapter.
"""
import frappe


def install():
    from kandil_hr.recruitment.models import enabled
    from frappe.permissions import add_permission, update_permission_property
    if not enabled():return dict(enabled=False)
    for doctype in ('Branch','Designation'):
        for role in ('Kandil Recruiter','Kandil Approver','Kandil Sector Approver'):
            add_permission(doctype,role,ptype='select')
            update_permission_property(doctype,role,0,'select',1)
            # Custom DocPerm defaults read=1 even when add_permission uses select.
            # These application-owned reference rules deliberately remain select-only.
            update_permission_property(doctype,role,0,'read',0)
        frappe.clear_cache(doctype=doctype)
    return dict(enabled=True,permission='select',shared_masters=['Branch','Designation'])
