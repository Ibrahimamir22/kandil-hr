"""Exact P2 acceptance boundary cases, called inside the rollback-only native suite."""

import json
import uuid
from unittest.mock import patch

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization import api
from kandil_hr.organization.integration_tests import user
from kandil_hr.organization.snapshots import render


def run_cases(ctx):
	company, department, branch, designation = (
		ctx[k] for k in ("company", "department", "branch", "designation")
	)
	hr, outsider, prefix = (ctx[k] for k in ("hr", "outsider", "prefix"))
	cases = []

	def insert(dt, **values):
		return frappe.get_doc({"doctype": dt, **values}).insert()

	def denied(action):
		point = "acceptance" + frappe.generate_hash(length=8)
		frappe.db.savepoint(point)
		try:
			action()
		except frappe.ValidationError, frappe.PermissionError:
			frappe.db.rollback(save_point=point)
		else:
			raise AssertionError("Expected rejection at an organization acceptance boundary")

	def record(case, assertions):
		cases.append({"case_id": case, "status": "PASS", "assertions": assertions})

	def approve(operations, at=None):
		with user(hr):
			doc = insert(
				"Kandil Structure Change",
				company=company,
				effective_on=at or today(),
				reason="Synthetic exact acceptance case",
				changes_json=json.dumps(operations),
			)
			preview = api.preview_structure(doc.name)
			doc.reload()
			api.submit_structure(doc.name, preview["preview_hash"], uuid.uuid4().hex, str(doc.modified))
		for _ in range(8):
			doc.reload()
			if doc.status == "Approved":
				return doc
			step = next(s for s in doc.approval_steps if s.decision == "Pending")
			with user(step.principal):
				api.decide_structure(
					doc.name,
					preview["preview_hash"],
					"Approved",
					step.step_key,
					uuid.uuid4().hex,
					str(doc.modified),
				)
		raise AssertionError("Approval chain did not complete")

	# One request contains an omitted structural input and an explicit three-seat input.
	created = approve(
		[
			{
				"action": "Create",
				"draft_key": "default",
				"title": "Default single seat",
				"department": department,
				"branch": branch,
				"designation": designation,
				"authority": "Department Approval",
			},
			{
				"action": "Create",
				"draft_key": "triple",
				"title": "Three approved seats",
				"department": department,
				"branch": branch,
				"designation": designation,
				"structural": 3,
				"authority": "Department Approval",
			},
			{
				"action": "Create",
				"draft_key": "close",
				"title": "Historical closing position",
				"department": department,
				"branch": branch,
				"designation": designation,
				"authority": "Department Approval",
			},
		]
	)
	names = json.loads(created.created_positions_json)
	default, triple, closing = (names[k] for k in ("default", "triple", "close"))
	assert frappe.db.get_value("Kandil Position", default, "structural") == 1
	assert frappe.db.get_value("Kandil Position", triple, "structural") == 3
	assert frappe.db.get_value("Kandil Capacity", {"position": default}, "structural") == 1
	assert frappe.db.get_value("Kandil Capacity", {"position": triple}, "structural") == 3
	record(
		"AT-HC-001-01",
		[
			"Approved Create with structural input omitted produces Position and capacity=1",
			"Explicit approved structural=3 persists as Position and capacity=3",
		],
	)

	employees = []
	with user("Administrator"):
		for i in range(2):
			employees.append(
				insert(
					"Employee",
					first_name=prefix + "-EXACT-" + str(i),
					gender="Male",
					date_of_birth="1990-01-01",
					date_of_joining=add_days(today(), -30),
					company=company,
					department=department,
					branch=branch,
					designation=designation,
					status="Active",
				).name
			)
	with user(hr):
		assignments = [
			insert(
				"Kandil Position Assignment",
				company=company,
				department=department,
				branch=branch,
				position=triple,
				employee=e,
				allocation="Primary",
				valid_from=today(),
			)
			for e in employees
		]

		def occupied(position, at):
			return next(
				row for row in api.reconcile_occupancy(company, at)["rows"] if row["position"] == position
			)["occupied"]

		assert occupied(triple, today()) == 2
		assignments[0].valid_until = add_days(today(), 1)
		assignments[0].save()
		assert occupied(triple, today()) == 2
		assert occupied(triple, add_days(today(), 1)) == 2
		assert occupied(triple, add_days(today(), 2)) == 1
		assert frappe.db.count("Kandil Position Assignment", {"position": triple}) == 2
		record(
			"AT-HC-002-01",
			[
				"Dated assignment-derived occupied=2 for two active primary episodes",
				"Valid Until is inclusive: count stays2 through end date and becomes1 next day",
				"Both episodes remain stored; ledger discrepancy remains explicit and is not overwritten",
			],
		)
		before = [(a.name, a.position, str(a.valid_from), str(a.valid_until)) for a in assignments]
		p = frappe.get_doc("Kandil Position", triple)
		p.title = "Changed title without moving occupancy"
		p.save()
	with user("Administrator"):
		new_designation = insert("Designation", designation_name=prefix + "-CHANGED").name
		e = frappe.get_doc("Employee", employees[0])
		e.designation = new_designation
		e.save()
	with user(hr):
		for a in assignments:
			a.reload()
		assert before == [(a.name, a.position, str(a.valid_from), str(a.valid_until)) for a in assignments]
		assert occupied(triple, today()) == 2 and occupied(default, today()) == 0
		record(
			"AT-ORG-001-02",
			[
				"Position title and Employee Designation changed through native saves",
				"Stable assignment IDs, Position references and dated episodes unchanged",
				"Occupied stays2 in original Position and0 in sibling Position",
			],
		)
		assert frappe.db.get_value("Kandil Position", triple, "designation") == frappe.db.get_value(
			"Kandil Position", default, "designation"
		)
		position_count = frappe.db.count("Kandil Position", {"company": company, "designation": designation})
		assert position_count > 3
		cap = frappe.get_doc("Kandil Capacity", {"position": default})
		cap.structural = position_count
		denied(cap.save)
		assert frappe.db.get_value("Kandil Capacity", {"position": default}, "structural") == 1
		assert frappe.db.get_value("Kandil Capacity", {"position": triple}, "structural") == 3
		record(
			"AT-HC-001-02",
			[
				"Several positions share one Designation while capacities remain individually1 and3",
				"Attempt to replace one approved capacity with same-Designation position count rejected",
				"Rejected write leaves both position-linked ledgers unchanged",
			],
		)

	# R1 and R2 retain independent relationship rows, even after further live edits.
	with user(hr):
		r1 = render(created.snapshot)
		r1_row = next(r for r in r1["rows"] if r["position"] == default)
		assert r1_row["parent_position"] == ""
	r2_doc = approve(
		[
			{
				"action": "Reparent",
				"position": default,
				"parent_position": triple,
				"authority": "Department Approval",
			}
		],
		add_days(today(), 1),
	)
	with user(hr):
		r2 = render(r2_doc.snapshot, "ar")
		assert next(r for r in r2["rows"] if r["position"] == default)["parent_position"] == triple
		assert render(created.snapshot) == r1
		assert r1["html"] != r2["html"] and '<html lang="ar" dir="rtl">' in r2["html"]
		assert r1_row["title"] == "Default single seat"
		denied(lambda: frappe.get_doc("Kandil Structure Snapshot", created.snapshot).save())
	with user(outsider):
		denied(lambda: render(created.snapshot))
	record(
		"AT-ORG-002-01",
		[
			"Approved R1 renders original root relationship",
			"Approved dated R2 renders new parent independently in Arabic RTL",
			"R1 remains byte-identical after R2 and live title edits",
			"Snapshot mutation and unscoped read denied",
		],
	)

	with user(hr):
		historical = insert(
			"Kandil Position Assignment",
			company=company,
			department=department,
			branch=branch,
			position=closing,
			employee=employees[0],
			allocation="Primary",
			valid_from=add_days(today(), -10),
			valid_until=add_days(today(), -5),
		)
		# Record the genuine past occupancy before evaluating today's closure.
		from kandil_hr.organization.occupancy import refresh_locked

		cap = frappe.get_doc("Kandil Capacity", {"position": closing}, for_update=True)
		with patch("kandil_hr.organization.occupancy.today_cairo", return_value=add_days(today(), -6)):
			refresh_locked(cap)
		assert cap.occupied == 1 and cap.occupancy_basis == "Dated Assignments"
	close = approve([{"action": "Close", "position": closing}])
	with user(hr):
		p = frappe.get_doc("Kandil Position", closing)
		assert close.status == "Approved" and p.status == "Closed" and str(p.closed_on) == today()
		assert frappe.db.get_value("Kandil Capacity", cap.name, "occupied") == 0
		assert frappe.db.exists("Kandil Position Assignment", historical.name)
		assert occupied(closing, add_days(today(), -6)) == 1 and occupied(closing, today()) == 0
		denied(
			lambda: insert(
				"Kandil Position Assignment",
				company=company,
				department=department,
				branch=branch,
				position=closing,
				employee=employees[1],
				allocation="Acting",
				valid_from=today(),
			)
		)
	with user("Administrator"):
		from frappe.client import delete as api_delete

		denied(lambda: api_delete("Kandil Position", closing))
		denied(lambda: api_delete("Kandil Position Assignment", historical.name))
		assert frappe.db.exists("Kandil Position", closing) and frappe.db.exists(
			"Kandil Position Assignment", historical.name
		)
	record(
		"AT-ORG-002-02",
		[
			"Independent HR/CEO approved closure preserves past occupancy and episode",
			"New allocation on closure date rejected",
			"Native API delete of closed referenced Position and its historical assignment rejected even as Administrator",
		],
	)

	with user("Administrator"):
		from frappe.client import save as api_save

		jd = frappe.get_doc("Kandil JD Revision", ctx["jd"].name)
		original = jd.purpose
		payload = jd.as_dict()
		payload["purpose"] = "Forbidden API change"
		denied(lambda: api_save(payload))
		denied(lambda: api_delete("Kandil JD Revision", jd.name))
		jd.reload()
		assert jd.status == "Approved" and jd.purpose == original
	record(
		"AT-ORG-003-01",
		[
			"Existing fixture creates Draft JD and independently approves it",
			"frappe.client.save cannot edit approved top-level JD",
			"frappe.client.delete cannot delete approved JD; original approved content remains",
		],
	)

	with user("Administrator"):
		other_company = frappe.db.get_value(
			"Company", {"name": ["!=", company], "company_name": ["like", "%TEST%"]}, "name"
		)
		assert other_company, "Second synthetic TEST company required"
		other_department = insert(
			"Department", company=other_company, department_name=prefix + "-FOREIGN"
		).name
		with api.transition():
			foreign = insert(
				"Kandil Position",
				company=other_company,
				department=other_department,
				designation=designation,
				title="Foreign company position",
				position_code=prefix + "-FOREIGN",
			)
	with user(hr):
		bad = insert(
			"Kandil Structure Change",
			company=company,
			effective_on=add_days(today(), 2),
			reason="Cross company attack",
			changes_json=json.dumps(
				[
					{
						"action": "Reparent",
						"position": default,
						"parent_position": foreign.name,
						"authority": "Department Approval",
					}
				]
			),
		)
		denied(lambda: api.preview_structure(bad.name))
		cycle = insert(
			"Kandil Structure Change",
			company=company,
			effective_on=add_days(today(), 2),
			reason="Descendant cycle attack",
			changes_json=json.dumps(
				[
					{
						"action": "Reparent",
						"position": triple,
						"parent_position": default,
						"authority": "Department Approval",
					}
				]
			),
		)
		denied(lambda: api.preview_structure(cycle.name))
		with api.transition():
			denied(
				lambda: insert(
					"Kandil Position Hierarchy",
					company=company,
					department=department,
					branch=branch,
					position=closing,
					parent_position=foreign.name,
					authority="Department Approval",
					valid_from=add_days(today(), 3),
				)
			)
	record(
		"AT-ORG-007-02",
		[
			"Reparent ancestor under its dated descendant rejected as cycle",
			"Cross-company parent rejected at request preview",
			"Cross-company parent also rejected by native hierarchy invariant",
		],
	)
	return cases
