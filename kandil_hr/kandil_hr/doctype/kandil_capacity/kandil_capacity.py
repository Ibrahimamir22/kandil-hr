import frappe

from kandil_hr.pilot.models import KandilCapacity as BaseCapacity


class KandilCapacity(BaseCapacity):
	def onload(self):
		if frappe.conf.get("kandil_parity_enabled") and not self.is_new():
			from kandil_hr.organization.occupancy import preview

			self.set_onload("current_occupancy", preview(self.name))
