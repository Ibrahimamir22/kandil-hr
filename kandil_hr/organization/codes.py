"""Reviewed, company-scoped external identities for native organization masters."""

import hashlib
import json

import frappe
from frappe import _

from kandil_hr.foundation.mutation_access import assert_current_scope
from kandil_hr.organization.current import rows
from kandil_hr.organization.models import HistoryDocument, fail, guard, internal

TARGETS = {"Unit": "Department", "Job": "Designation", "Position": "Kandil Position"}


def identity(company, entity_type, code):
	return hashlib.sha256(json.dumps([company, entity_type, code], ensure_ascii=False).encode()).hexdigest()


def checked_code(code):
	if (
		not isinstance(code, str)
		or not code
		or len(code) > 140
		or code != code.strip()
		or any(ord(c) < 32 for c in code)
	):
		fail("External code must be literal text of 1 to 140 characters without surrounding whitespace.")
	return code


def lookup(company, kind, code):
	return next(
		iter(rows("Kandil Organization Code", filters={"name": identity(company, kind, code)}, fields=["*"])),
		None,
	)


class KandilOrganizationCode(HistoryDocument):
	def autoname(self):
		self.name = identity(self.company, self.entity_type, checked_code(self.external_code))

	def validate(self):
		guard(self)
		if not self.is_new() or not internal():
			fail("Organization codes are immutable and created only by reviewed imports.")
		if self.entity_type not in TARGETS or self.target_doctype != TARGETS[self.entity_type]:
			fail("Organization code target type does not match its entity type.")
		checked_code(self.external_code)
		target = frappe.get_doc(self.target_doctype, self.target_name, for_update=True)
		if self.entity_type in ("Unit", "Position") and target.company != self.company:
			fail("Organization code target must belong to the same company.")
		if rows(
			self.doctype,
			filters={
				"company": self.company,
				"entity_type": self.entity_type,
				"target_name": self.target_name,
			},
			fields=["name"],
		):
			fail("This organization target already has a different external code in this company.")


def register(company, kind, code, target, title, batch, job_family=None):
	prior = lookup(company, kind, code)
	if prior:
		if prior.target_name != target:
			fail("External code is already mapped to a different organization target.")
		return prior.name
	return (
		frappe.get_doc(
			dict(
				doctype="Kandil Organization Code",
				company=company,
				entity_type=kind,
				external_code=code,
				target_doctype=TARGETS[kind],
				target_name=target,
				title=title,
				job_family=job_family,
				import_batch=batch,
			)
		)
		.insert(ignore_permissions=True)
		.name
	)


def master_preview(doc):
	from kandil_hr.organization.api import import_rows

	kind = "Unit" if doc.import_kind == "Units" else "Job"
	target_dt = TARGETS[kind]
	allowed = {"external_code", "title", "target"} | (
		{"parent_department", "is_group"} if kind == "Unit" else {"job_family"}
	)
	output, seen, targets = [], set(), set()
	for source in import_rows(doc):
		if set(source) - allowed or not isinstance(source.get("title"), str) or not source["title"].strip():
			fail("Organization master imports require a title and supported fields only.")
		code = checked_code(source.get("external_code"))
		if code in seen:
			fail("Duplicate external code in import batch.")
		seen.add(code)
		mapping = lookup(doc.company, kind, code)
		target = source.get("target") or (mapping.target_name if mapping else None)
		if mapping and source.get("target") and source["target"] != mapping.target_name:
			fail("External code is already mapped to a different organization target.")
		if kind == "Unit":
			group = source.get("is_group", 0)
			if type(group) is not int or group not in (0, 1):
				fail("Unit is_group must be 0 or 1.")
			parent = source.get("parent_department")
			if parent:
				p = frappe.get_doc("Department", parent, for_update=True)
				if p.company != doc.company or not p.is_group:
					fail("Imported parent department must be a group in the same company.")
			data = dict(department_name=source["title"], company=doc.company, is_group=group)
			if parent:
				data["parent_department"] = parent
			from erpnext.setup.doctype.department.department import get_abbreviated_name

			predicted = get_abbreviated_name(source["title"], doc.company)
		else:
			data = dict(designation_name=source["title"])
			predicted = source["title"]
		if not target and frappe.db.exists(target_dt, predicted):
			fail(
				"An organization master with this title already exists. Select its explicit target before review."
			)
		if target:
			existing = frappe.get_doc(target_dt, target, for_update=True)
			if any(existing.get(k) != v for k, v in data.items()):
				fail(
					"Imported organization target differs from the reviewed title or company. Reconcile the source first."
				)
			other = rows(
				"Kandil Organization Code",
				filters={"company": doc.company, "entity_type": kind, "target_name": target},
				fields=["external_code"],
			)
			if any(r.external_code != code for r in other):
				fail("This organization target already has a different external code in this company.")
		if mapping and (
			mapping.title != source["title"] or (mapping.job_family or "") != (source.get("job_family") or "")
		):
			fail(
				"Existing external-code metadata differs. Reconcile the source without replacing its identity."
			)
		resolved = target or predicted
		if resolved in targets:
			fail("Import rows cannot map different external codes to the same target.")
		targets.add(resolved)
		output.append(
			dict(
				code=code,
				action="Unchanged" if mapping else ("Map" if target else "Create"),
				doctype=target_dt,
				data=data,
				target=resolved,
				entity_type=kind,
				source=source,
			)
		)
	return output


def apply_master(doc, preview):
	# Explicit authorization precedes narrowly scoped native master creation.
	assert_current_scope(
		doc.company, required_roles=("Kandil Recruiter", "Kandil Sector Approver", "Kandil Approver")
	)
	for row in preview:
		if row["action"] == "Create":
			target = frappe.get_doc({"doctype": row["doctype"], **row["data"]}).insert(
				ignore_permissions=True
			)
			if target.name != row["target"]:
				fail("Native organization naming changed after preview. Review the import again.")
		register(
			doc.company,
			row["entity_type"],
			row["code"],
			row["target"],
			row["source"]["title"],
			doc.name,
			row["source"].get("job_family"),
		)


def protect_target(doc, method=None, *args, **kwargs):
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	# Native rename does not hold the original target row. Serialize it before
	# the current registry read; never acquire Company after this target lock.
	rows(doc.doctype, filters={"name": doc.name}, fields=["name"])
	if rows(
		"Kandil Organization Code",
		filters={"target_doctype": doc.doctype, "target_name": doc.name},
		fields=["name"],
	):
		frappe.throw(
			_("This organization target has a preserved external code and cannot be deleted or renamed.")
		)


def position_preview(company, data):
	code = checked_code(data.get("external_id") or data["position_code"])
	mapping = lookup(company, "Position", code)
	if mapping and mapping.target_name != data["position_code"]:
		fail("External code is already mapped to a different organization target.")
	mapped = rows(
		"Kandil Organization Code",
		filters={"company": company, "entity_type": "Position", "target_name": data["position_code"]},
		fields=["external_code"],
	)
	if any(row.external_code != code for row in mapped):
		fail("This organization target already has a different external code in this company.")
	if data.get("external_id") and rows(
		"Kandil Position",
		filters={"company": company, "external_id": code, "name": ["!=", data["position_code"]]},
		fields=["name"],
	):
		fail("External code is already used by another position in this company.")


def position_identity(doc, old):
	if not frappe.conf.get("kandil_parity_enabled"):
		return
	if old and old.external_id and doc.external_id != old.external_id:
		fail("Imported position external identity cannot be replaced.")
	position_preview(doc.company, doc.as_dict())


def protect_target_scope(doc, method=None):
	if not frappe.conf.get("kandil_parity_enabled") or doc.is_new():
		return
	for mapping in rows(
		"Kandil Organization Code",
		filters={"target_doctype": doc.doctype, "target_name": doc.name},
		fields=["company"],
	):
		if mapping.company != doc.company:
			fail("A mapped organization unit cannot move to another company.")
