"""Complete reconciliation, legal-entity authority and native unit acceptance probes."""

import json
import uuid

import frappe
from frappe.utils import now_datetime, today

from kandil_hr.organization import api, occupancy
from kandil_hr.organization.current import rows
from kandil_hr.organization.integration_tests import user


def run_cases(ctx):
	company, department, designation, hr, authority, prefix = (
		ctx[k] for k in ("company", "department", "designation", "hr", "authority", "prefix")
	)
	cases = []

	def insert(dt, **values):
		return frappe.get_doc(dict(doctype=dt, **values)).insert()

	def denied(fn):
		point = "matching" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			fn()
		except frappe.ValidationError, frappe.PermissionError:
			frappe.db.rollback(save_point=point)
		else:
			raise AssertionError("Expected permission or validation denial")

	def batch(payload):
		with user(hr):
			return insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Assignments",
				rows_json=json.dumps(payload),
			)

	# Every mismatch is returned before independent review; no source row disappears.
	valid_position = ctx["positions"]["Vacant"].name
	payload = [
		dict(position=valid_position, employee="missing-first", valid_from=today()),
		dict(position="missing-second", employee=ctx["employee"].name, valid_from=today()),
		dict(position="missing-third", employee="missing-fourth", valid_from=today()),
	]
	doc = batch(payload)
	before = frappe.db.count("Kandil Position Assignment")
	with user(hr):
		report = api.preview_assignment_reconciliation(doc.name)
		assert report["row_count"] == 3 and report["unmatched_count"] == 4
		assert [r["row"] for r in report["issues"]] == [1, 2, 3]
		assert report["issues"][2]["unmatched"] == ["employee", "position"]
	with user(authority):
		denied(lambda: api.review_import(doc.name, str(doc.modified)))
	assert frappe.db.count("Kandil Position Assignment") == before
	with user("Administrator"):
		emp = insert(
			"Employee",
			first_name=prefix + " Reconciled",
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			company=company,
			department=department,
			status="Active",
		)
	accepted = batch([dict(position=valid_position, employee=emp.name, valid_from=today())])
	with user(authority):
		api.review_import(accepted.name, str(accepted.modified))
	with user(hr):
		accepted.reload()
		result = api.apply_import(accepted.name, accepted.digest)
		assert result["created"] == 1
		assert api.apply_import(accepted.name, accepted.digest) == result
	repeat = batch([dict(position=valid_position, employee=emp.name, valid_from=today())])
	with user(authority):
		api.review_import(repeat.name, str(repeat.modified))
	with user(hr):
		repeat.reload()
		assert api.apply_import(repeat.name, repeat.digest)["created"] == 0
	assert len(rows("Kandil Position Assignment", filters={"employee": emp.name}, fields=["name"])) == 1
	cases.append(
		dict(
			case_id="AT-HC-002-02",
			status="PASS",
			assertions="All four unmatched references across three rows reported; review denied atomically; accepted replay and separate identical reviewed import retain one allocation. Payroll-file adapter is separate.",
		)
	)

	# Native Frappe client save is exactly the REST method; UI has a separate browser gate.
	from frappe.client import save

	with user(authority):
		unit = insert(
			"Department",
			company=company,
			department_name=prefix + " Native Unit",
			custom_kandil_change_reason="Synthetic authorized creation",
		)
		unit.department_name = prefix + " Updated Unit"
		unit.custom_kandil_change_reason = "Synthetic authorized update"
		save(unit.as_dict())
		from kandil_hr.organization.units import validate as validate_unit

		unit.reload()
		original_cost_center = unit.get("payroll_cost_center")
		unit.payroll_cost_center = "Unauthorized payroll configuration"
		point = "unit_finance_" + uuid.uuid4().hex
		frappe.db.savepoint(point)
		try:
			validate_unit(unit)
		except frappe.PermissionError as exc:
			assert "payroll cost center" in str(exc)
		else:
			raise AssertionError("Unit maintenance altered payroll configuration")
		finally:
			frappe.db.rollback(save_point=point)
		assert frappe.db.get_value("Department", unit.name, "payroll_cost_center") == original_cost_center
		listed = frappe.get_list("Department", filters={"name": unit.name}, pluck="name")
		assert listed == [unit.name]
	with user("Administrator"):
		requester = prefix.lower() + "-branchrequester@example.invalid"
		insert(
			"User",
			email=requester,
			first_name=prefix,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[dict(role="Kandil Requester")],
		)
		insert(
			"Kandil Access Grant",
			user=requester,
			company=company,
			department=unit.name,
			branch=ctx["branch"],
			valid_from=today(),
			can_manage_recruitment=1,
			reason="Synthetic branch scoped unit read",
		)
	with user(requester):
		own = frappe.get_doc("Department", unit.name)
		own.check_permission("read")
		assert frappe.get_list("Department", filters={"company": company}, pluck="name") == [unit.name]
		denied(lambda: save(own.as_dict()))

	with user(authority):
		unit.reload()
		unit.department_name = prefix + " Missing Reason"
		unit.custom_kandil_change_reason = ""
		denied(lambda: save(unit.as_dict()))
	events = frappe.get_all(
		"Kandil Security Event",
		filters={"reference": unit.name, "action": "Organization unit maintained"},
		fields=["actor", "changed_fields"],
	)
	assert len(events) == 2 and all(e.actor == authority for e in events)
	assert all(json.loads(e.changed_fields)["reason"] for e in events)
	cases.append(
		dict(
			case_id="AT-ORG-007-01",
			status="NATIVE_PASS_BROWSER_PENDING",
			assertions="Scoped Sector authority creates and updates via native client save; ordinary Requester with branch manage grant denied; own-unit branch read/list allowed; reason mandatory and immutable audit generated; native list works.",
		)
	)

	# Identical job/position titles in two legal entities resolve distinct actual IDs.
	companies = frappe.get_all("Company", filters={"company_name": ["like", "%TEST%"]}, pluck="name")
	other = next(c for c in companies if c != company)
	principals, routes = [], []
	with user("Administrator"):
		for index, co in enumerate((company, other)):
			dept = insert("Department", company=co, department_name=prefix + " Authority " + str(index)).name
			principal = prefix.lower() + f"-chief{index}@example.invalid"
			terminal = prefix.lower() + f"-terminal{index}@example.invalid"
			for email, role in ((principal, "Kandil CEO Approver"), (terminal, "Kandil Recruiter")):
				insert(
					"User",
					email=email,
					first_name=prefix,
					enabled=1,
					send_welcome_email=0,
					user_type="System User",
					roles=[dict(role=role)],
				)
			settings = (
				frappe.get_doc("Kandil Organization Settings", co)
				if frappe.db.exists("Kandil Organization Settings", co)
				else frappe.new_doc("Kandil Organization Settings")
			)
			settings.company = co
			settings.hr_approver = terminal
			settings.ceo_approver = principal
			settings.save()
			chief_employee = insert(
				"Employee",
				first_name=prefix + " Chief",
				company=co,
				department=dept,
				status="Active",
				gender="Male",
				date_of_birth="1990-01-01",
				date_of_joining=today(),
				user_id=principal,
			)
			with api.transition():
				top = insert(
					"Kandil Position",
					company=co,
					department=dept,
					designation=designation,
					title="Identical Chief Title",
					structural=1,
				)
				child = insert(
					"Kandil Position",
					company=co,
					department=dept,
					designation=designation,
					title="Identical Worker Title",
					structural=1,
				)
				for pos, parent, level in (
					(top, None, "CEO Approval"),
					(child, top.name, "Department Approval"),
				):
					insert(
						"Kandil Position Hierarchy",
						company=co,
						department=dept,
						position=pos.name,
						parent_position=parent,
						authority=level,
						valid_from=today(),
					)
				insert(
					"Kandil Position Assignment",
					company=co,
					department=dept,
					position=top.name,
					employee=chief_employee.name,
					user=principal,
					valid_from=today(),
					allocation="Primary",
				)
			insert(
				"Kandil Access Grant",
				user=terminal,
				company=co,
				valid_from=today(),
				can_manage_recruitment=1,
				reason="Synthetic exact entity authority scope",
			)
			with user(terminal):
				route = api.resolve_route(co, dept, child.name)
				assert route["steps"][0]["principal"] == principal and route["ceo_approver"] == principal
				assert route["steps"][-1]["principal"] == terminal
			principals.append(principal)
			routes.append((co, dept, child.name, terminal, route))
		assert principals[0] != principals[1]
		with user(routes[0][3]):
			denied(lambda: api.resolve_route(*routes[1][:3]))
	cases.append(
		dict(
			case_id="AT-ORG-009-01",
			status="PASS",
			assertions="Two legal entities with identical chief/worker titles resolve distinct CEO assignments and terminal HR by exact company/position IDs; cross-company caller denied.",
		)
	)

	# The original assignment stays auditable, but cannot consume seats or authority.
	with user("Administrator"):
		assignment = frappe.get_doc("Kandil Position Assignment", {"employee": emp.name})
		with user(hr):
			assignment.is_voided = 1
			assignment.void_reason = "Synthetic corrected joining"
			assignment.voided_by = hr
			assignment.voided_on = now_datetime()
			denied(lambda: assignment.save())
			assignment.reload()
			with api.transition():
				assignment.is_voided = 1
				assignment.void_reason = "Synthetic corrected joining"
				assignment.voided_by = hr
				assignment.voided_on = now_datetime()
				assignment.save()
			assert (
				rows("Kandil Position Assignment", filters={"name": assignment.name}, fields=["name"]) == []
			)
			assert rows(
				"Kandil Position Assignment",
				include_voided=True,
				filters={"name": assignment.name},
				fields=["name"],
			)
			assert api.authority_for(valid_position, today()) is None
			cap = frappe._dict(
				position=valid_position,
				structural=1,
				occupied=1,
				reserved=0,
				open_slots=0,
				occupancy_basis="Dated Assignments",
			)
			assert occupancy.values(cap)["occupied"] == 0
			denied(lambda: assignment.save())
			emp.reload()
			from kandil_hr.pilot.api import transition as pilot_transition

			with pilot_transition():
				emp.custom_kandil_joining_voided = 1
				emp.status = "Inactive"
				emp.save(ignore_permissions=True)
			denied(
				lambda: insert(
					"Kandil Position Assignment",
					company=company,
					department=department,
					branch=ctx["branch"],
					position=valid_position,
					employee=emp.name,
					valid_from=today(),
					allocation="Primary",
				)
			)

	cases.append(
		dict(
			case_id="ASSIGNMENT-VOID",
			status="PASS",
			assertions="Direct mutation denied; authorized internal transition preserves row; current reads, authority and occupancy exclude voided rows; history immutable.",
		)
	)
	return cases
