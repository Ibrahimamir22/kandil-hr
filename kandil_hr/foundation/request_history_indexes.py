"""Request-scoped history lookup indexes; no source records are rewritten."""
import frappe


def execute():
    frappe.db.add_index('Kandil Command Audit',
                        ['target_doctype', 'target_name', 'company', 'occurred_at', 'name'],
                        'request_command_history')
    frappe.db.add_index('Kandil Request Revision',
                        ['request', 'company', 'creation', 'name'],
                        'request_saved_history')
