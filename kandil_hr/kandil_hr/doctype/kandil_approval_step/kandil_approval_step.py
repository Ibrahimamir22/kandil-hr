import frappe
from frappe import _
from frappe.model.document import Document


class KandilApprovalStep(Document):
	def validate(self):
		from kandil_hr.recruitment.models import enabled

		if enabled():
			frappe.throw(_("Edit child rows through their parent workflow."), frappe.PermissionError)

	def on_trash(self):
		from kandil_hr.recruitment.models import enabled

		if enabled():
			frappe.throw(_("Edit child rows through their parent workflow."), frappe.PermissionError)
