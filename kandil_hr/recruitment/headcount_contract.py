"""Typed shortage rejection; command transport owns rollback and durable audit."""

import frappe

MESSAGES = {
	"HEADCOUNT_BLOCKED": "Headcount blocking is enabled. Adjust capacity or requested quantity.",
	"HEADCOUNT_REASON_REQUIRED": "Headcount exception justification must contain at least 10 characters.",
}


class HeadcountDenied(frappe.ValidationError):
	def __init__(self, code, evaluation=None):
		self.code = code
		self.message = MESSAGES[code]
		self.evaluation = evaluation
		super().__init__(self.message)


def enforce_shortage(*, excess, mode, reason, evaluation=None):
	if not excess:
		return
	if mode == "Block":
		raise HeadcountDenied("HEADCOUNT_BLOCKED", evaluation)
	if len((reason or "").strip()) < 10:
		raise HeadcountDenied("HEADCOUNT_REASON_REQUIRED", evaluation)
