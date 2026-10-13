"""Read-only approval dates; no calendar configuration or recipient identities."""
import frappe
from kandil_hr.foundation.notification_access import no_store
from kandil_hr.portal.api import authenticated, read_request
from kandil_hr.recruitment.sla import deadline_projection


@frappe.whitelist(methods=["GET"])
def get(name):
    no_store()
    authenticated()
    return deadline_projection(read_request(name))
