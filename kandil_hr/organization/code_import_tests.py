"""Exact external identity import, reconciliation, native search/export boundaries."""

import json
import uuid

import frappe

from kandil_hr.organization import api, codes
from kandil_hr.organization.integration_tests import user


def run_cases(ctx):
	company, hr, authority, prefix, outsider = (
		ctx[k] for k in ("company", "hr", "authority", "prefix", "outsider")
	)

	def batch(kind, payload):
		with user(hr):
			return frappe.get_doc(
				dict(
					doctype="Kandil Organization Import",
					company=company,
					import_kind=kind,
					baseline_reference="Synthetic external-code acceptance",
					rows_json=json.dumps(payload),
				)
			).insert()

	def reviewed(kind, payload):
		doc = batch(kind, payload)
		with user(authority):
			api.review_import(doc.name, str(doc.modified))
		with user(hr):
			doc.reload()
			result = api.apply_import(doc.name, doc.digest)
			assert api.apply_import(doc.name, doc.digest) == result
		return result

	def denied(fn):
		point = "code" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			fn()
		except frappe.ValidationError, frappe.PermissionError:
			frappe.db.rollback(save_point=point)
		else:
			raise AssertionError("Expected external-code identity rejection")

	unit = dict(external_code="K-001", title=prefix + " Imported Unit", is_group=1)
	job = dict(external_code="K-001", title=prefix + " Imported Job", job_family="Synthetic Family")
	u = reviewed("Units", [unit])
	j = reviewed("Jobs", [job])
	assert u["created"] == j["created"] == 1
	position = dict(
		position_code=prefix + "-K001",
		external_id="K-001",
		title="Synthetic imported position",
		department=u["targets"][0],
		designation=j["targets"][0],
		structural=1,
	)
	p = reviewed("Positions", [position])
	assert p["created"] == 1
	for kind, payload in [("Units", unit), ("Jobs", job), ("Positions", position)]:
		repeat = reviewed(kind, [payload])
		assert repeat["created"] == 0 and repeat["unchanged"] == 1
	with user(hr):
		found = frappe.get_list(
			"Kandil Organization Code",
			filters={"company": company, "external_code": "K-001"},
			fields=["name", "entity_type", "external_code", "target_name"],
		)
		assert len(found) == 3 and {r.entity_type for r in found} == {"Unit", "Job", "Position"}
		from frappe.core.doctype.data_export.exporter import DataExporter

		export = DataExporter(
			doctype="Kandil Organization Code",
			with_data=True,
			all_doctypes=False,
			select_columns={
				"Kandil Organization Code": ["company", "entity_type", "external_code", "target_name"]
			},
			filters={"company": company, "external_code": "K-001"},
			export_without_column_meta=True,
		)
		export.build_response()
		csv = export.writer.getvalue()
		assert csv.count("K-001") == 3 and all(r.target_name in csv for r in found)
		frappe.local.response.pop("filecontent", None)
		frappe.local.response.pop("filename", None)
		frappe.local.response.pop("type", None)
		frappe.local.response.pop("result", None)
		frappe.local.response.pop("doctype", None)
	with user(outsider):
		assert not frappe.get_list("Kandil Organization Code", filters={"company": company})
		denied(lambda: frappe.get_doc("Kandil Organization Code", found[0].name).check_permission("read"))
	# Same code targeting another known unit cannot rewrite its identity.
	doc = batch("Units", [{**unit, "target": ctx["department"]}])
	with user(authority):
		denied(lambda: api.review_import(doc.name, str(doc.modified)))
	doc = batch("Positions", [{**position, "position_code": prefix + "-Conflicting"}])
	with user(authority):
		denied(lambda: api.review_import(doc.name, str(doc.modified)))
	# A new job code cannot silently reuse a globally matching title.
	doc = batch("Jobs", [{**job, "external_code": "K-002"}])
	with user(authority):
		denied(lambda: api.review_import(doc.name, str(doc.modified)))
	# Explicit mapping of an unmapped existing native job is supported and reviewed.
	with user("Administrator"):
		existing = frappe.get_doc(
			dict(doctype="Designation", designation_name=prefix + " Explicit Job")
		).insert()
	mapped = reviewed(
		"Jobs", [dict(external_code="K-003", title=existing.designation_name, target=existing.name)]
	)
	assert mapped["created"] == 0 and mapped["mapped"] == 1
	with user(hr):
		code = frappe.get_doc("Kandil Organization Code", found[0].name)
		code.external_code = "replacement"
		denied(lambda: code.save(ignore_permissions=True))
		denied(lambda: frappe.delete_doc(code.doctype, code.name, ignore_permissions=True))
		position_doc = frappe.get_doc("Kandil Position", position["position_code"])
		position_doc.external_id = "replacement"
		denied(position_doc.save)
	with user("Administrator"):
		mapped_unit = frappe.get_doc("Department", u["targets"][0])
		mapped_unit.company = frappe.db.get_value(
			"Company", {"name": ["!=", company], "company_name": ["like", "%TEST%"]}, "name"
		)
		assert mapped_unit.company
		denied(mapped_unit.save)
		denied(lambda: frappe.delete_doc("Designation", existing.name))
		denied(lambda: frappe.rename_doc("Designation", existing.name, prefix + " Renamed"))
	# Cross-company native unit target is rejected even with an explicit identifier.
	other = frappe.db.get_value("Department", {"company": ["not in", [company, ""]]}, "name")
	if other:
		x = frappe.get_doc("Department", other)
		doc = batch(
			"Units",
			[dict(external_code="K-FOREIGN", title=x.department_name, target=x.name, is_group=x.is_group)],
		)
		with user(authority):
			denied(lambda: api.review_import(doc.name, str(doc.modified)))
	else:
		raise AssertionError("Synthetic cross-company Department fixture required")
	assert codes.lookup(company, "Unit", "K-001").target_name == u["targets"][0]
	return [
		dict(
			case_id="AT-ORG-008-01",
			status="PASS",
			assertions=[
				"K-001 imported twice independently for Unit, Job and Position; second reviewed batch no-ops without duplicate native targets",
				"Explicit existing job mapping requires independent review and no title-only reuse",
			],
		),
		dict(
			case_id="AT-ORG-008-02",
			status="PASS",
			assertions=[
				"External target/code conflicts rejected; source codes and targets immutable",
				"Native scoped list search and CSV export preserve original K-001 codes and target IDs",
				"Unscoped read, target rename/delete and cross-company unit mapping rejected",
			],
		),
	]
