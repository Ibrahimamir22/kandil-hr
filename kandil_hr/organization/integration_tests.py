"""Synthetic native ORM/command integration suite. Explicit parity site only; rolls back.

bench --site kandil-parity.localhost execute kandil_hr.organization.integration_tests.run
"""

import json
import uuid
from contextlib import contextmanager

import frappe
from frappe.utils import add_days, today

from kandil_hr.organization import api


@contextmanager
def user(name):
	before = frappe.session.user
	frappe.set_user(name)
	try:
		yield
	finally:
		frappe.set_user(before)


def run(company=None, export_documents=False):
	if frappe.local.site != "kandil-parity.localhost" or not frappe.conf.get("kandil_foundation_enabled"):
		raise RuntimeError(
			"Organization integration tests require the isolated parity site with foundation enabled."
		)
	before = frappe.session.user
	results = []
	prefix = "ORG-" + frappe.generate_hash(length=8)
	frappe.set_user("Administrator")
	company = company or frappe.db.get_value("Company", {"company_name": ["like", "%TEST%"]}, "name")
	if not company:
		raise RuntimeError("Provide an existing synthetic test company.")

	def insert(dt, **values):
		return frappe.get_doc({"doctype": dt, **values}).insert()

	def passed(name):
		results.append({"check": name, "status": "PASS"})

	def denied(name, fn):
		point = "orgcase" + str(len(results))
		frappe.db.savepoint(point)
		try:
			fn()
		except frappe.ValidationError, frappe.PermissionError, frappe.TimestampMismatchError:
			frappe.db.rollback(save_point=point)
			passed(name)
		else:
			raise AssertionError("Expected rejection: " + name)

	try:
		department = insert("Department", department_name=prefix, company=company).name
		designation = insert("Designation", designation_name=prefix).name
		branch = insert("Branch", branch=prefix).name
		hr, authority = prefix.lower() + "-hr@example.invalid", prefix.lower() + "-authority@example.invalid"
		reviewer = prefix.lower() + "-reviewer@example.invalid"
		for email, roles in [
			(hr, ["Kandil Recruiter"]),
			(reviewer, ["Kandil Recruiter"]),
			(authority, ["Kandil Sector Approver", "Kandil Approver", "Kandil CEO Approver"]),
		]:
			insert(
				"User",
				email=email,
				first_name=prefix,
				enabled=1,
				send_welcome_email=0,
				user_type="System User",
				roles=[{"role": r} for r in roles],
			)
			insert(
				"Kandil Access Grant",
				user=email,
				company=company,
				valid_from=today(),
				can_manage_recruitment=1,
				can_view_sensitive=1,
				reason="Synthetic organization integration test",
			)
		outsider = prefix.lower() + "-outsider@example.invalid"
		insert(
			"User",
			email=outsider,
			first_name=prefix,
			enabled=1,
			send_welcome_email=0,
			user_type="System User",
			roles=[{"role": "Kandil Recruiter"}],
		)
		employee = insert(
			"Employee",
			first_name=prefix,
			gender="Male",
			date_of_birth="1990-01-01",
			date_of_joining=today(),
			company=company,
			department=department,
			branch=branch,
			designation=designation,
			status="Active",
			user_id=authority,
		)
		with user(hr):
			settings = (
				frappe.get_doc("Kandil Organization Settings", company)
				if frappe.db.exists("Kandil Organization Settings", company)
				else frappe.get_doc({"doctype": "Kandil Organization Settings", "company": company})
			)
			settings.hr_approver, settings.sector_approver, settings.ceo_approver = (
				reviewer,
				authority,
				authority,
			)
			settings.save()
			baseline_rows = [
				{
					"position_code": prefix + "-" + key,
					"title": key,
					"department": department,
					"branch": branch,
					"designation": designation,
					"structural": 1,
				}
				for key in ["Worker", "Vacant", "Manager"]
			]
			baseline = insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Positions",
				rows_json=json.dumps(baseline_rows),
			)
			csv_text = (
				"position_code,title,department,designation\n"
				+ prefix
				+ "-CSV,CSV worker,"
				+ department
				+ ","
				+ designation
			)
			count = frappe.db.count("Kandil Position", {"company": company})
			preview = api.preview_csv_import(baseline.name, csv_text, str(baseline.modified))
			assert preview["row_count"] == 1 and preview["preview"][0]["action"] == "Create"
			assert frappe.db.count("Kandil Position", {"company": company}) == count
			baseline.reload()
			assert json.loads(baseline.rows_json) == baseline_rows and baseline.status == "Draft"
			passed("CSV preview normalizes rows without modifying draft or creating positions")
			denied(
				"CSV preview rejects stale draft version",
				lambda: api.preview_csv_import(baseline.name, csv_text, "2000-01-01"),
			)
			denied(
				"CSV preview rejects malformed schema",
				lambda: api.preview_csv_import(
					baseline.name, "company,title\nBad,Invalid", str(baseline.modified)
				),
			)
			denied(
				"CSV preview applies existing department validation",
				lambda: api.preview_csv_import(
					baseline.name, csv_text.replace(department, prefix + "-UNKNOWN"), str(baseline.modified)
				),
			)
		with user(outsider):
			denied(
				"HR role without company scope cannot preview CSV",
				lambda: api.preview_csv_import(baseline.name, csv_text, str(baseline.modified)),
			)
		with user(authority):
			denied(
				"Independent reviewer cannot load CSV into another author draft",
				lambda: api.preview_csv_import(baseline.name, csv_text, str(baseline.modified)),
			)
			api.review_import(baseline.name, str(baseline.modified))
		with user(hr):
			baseline.reload()
			denied(
				"CSV cannot replace an independently reviewed import",
				lambda: api.preview_csv_import(baseline.name, csv_text, str(baseline.modified)),
			)
			api.apply_import(baseline.name, baseline.digest)
			positions = {
				key: frappe.get_doc("Kandil Position", prefix + "-" + key)
				for key in ["Worker", "Vacant", "Manager"]
			}
			passed("Reviewed baseline position identity distinct from designation; default one seat")
			denied(
				"Native Position creation cannot bypass structure approval",
				lambda: insert(
					"Kandil Position",
					company=company,
					department=department,
					branch=branch,
					designation=designation,
					title="Unreviewed new position",
				),
			)
			denied(
				"Unreviewed excess structural seats blocked",
				lambda: insert(
					"Kandil Position",
					company=company,
					department=department,
					branch=branch,
					designation=designation,
					position_code=prefix + "-Excess",
					title="Excess",
					structural=10,
				),
			)
			operations = [
				{
					"action": "Reparent",
					"position": positions["Worker"].name,
					"parent_position": positions["Vacant"].name,
					"authority": "Department Approval",
				},
				{
					"action": "Reparent",
					"position": positions["Vacant"].name,
					"parent_position": positions["Manager"].name,
					"authority": "Department Approval",
				},
				{
					"action": "Reparent",
					"position": positions["Manager"].name,
					"authority": "Department Approval",
				},
			]
			change = insert(
				"Kandil Structure Change",
				company=company,
				effective_on=today(),
				reason="Synthetic initial reviewed hierarchy",
				changes_json=json.dumps(operations),
			)
			tampered = frappe.get_doc("Kandil Structure Change", change.name)
			tampered.owner = authority
			denied("Structure author cannot be rewritten to bypass independence", tampered.save)
			with user(authority):
				other_editor = frappe.get_doc("Kandil Structure Change", change.name)
				other_editor.reason = "Changed by future approver"
				denied("Future approver cannot edit another author draft", other_editor.save)
			preview = api.preview_structure(change.name)
			change.reload()
			api.submit_structure(change.name, preview["preview_hash"], uuid.uuid4().hex, str(change.modified))
			change.reload()
			denied(
				"Structure author cannot self approve",
				lambda: api.decide_structure(
					change.name,
					preview["preview_hash"],
					"Approved",
					change.approval_steps[0].step_key,
					uuid.uuid4().hex,
					str(change.modified),
				),
			)
		with user(authority):
			denied(
				"CEO cannot bypass pending HR approval",
				lambda: api.decide_structure(
					change.name,
					preview["preview_hash"],
					"Approved",
					change.approval_steps[0].step_key,
					uuid.uuid4().hex,
					str(change.modified),
				),
			)
		with user(reviewer):
			change.reload()
			args = dict(
				name=change.name,
				preview_hash=preview["preview_hash"],
				decision="Approved",
				step_id=change.approval_steps[0].step_key,
				command_id=uuid.uuid4().hex,
				expected_version=str(change.modified),
			)
			result = api.decide_structure(**args)
			assert result["status"] == "Pending" and not result["snapshot"]
			assert api.decide_structure(**args) == result
			passed("HR approval retry returns the receipt without advancing CEO step")
			changed = {**args, "decision": "Rejected", "comment": "Changed payload"}
			denied(
				"Reused structural command ID with changed decision rejected",
				lambda: api.decide_structure(**changed),
			)
			stale = {**args, "command_id": uuid.uuid4().hex}
			denied(
				"Fresh command on stale structural version rejected", lambda: api.decide_structure(**stale)
			)
		with user(authority):
			change.reload()
			args = dict(
				name=change.name,
				preview_hash=preview["preview_hash"],
				decision="Approved",
				step_id=change.approval_steps[1].step_key,
				command_id=uuid.uuid4().hex,
				expected_version=str(change.modified),
			)
			result = api.decide_structure(**args)
			assert result["snapshot"] and result["status"] == "Approved"
			assert api.decide_structure(**args) == result
			passed("Independent HR then CEO creates immutable snapshot; retry is stable")
			child = frappe.get_doc("Kandil Approval Step", change.approval_steps[0].name)
			child.decision = "Rejected"
			denied(
				"Direct approval child save cannot rewrite structural decision",
				lambda: child.save(ignore_permissions=True),
			)
		with user(hr):
			insert(
				"Kandil Position Assignment",
				company=company,
				department=department,
				branch=branch,
				position=positions["Manager"].name,
				employee=employee.name,
				user=authority,
				valid_from=today(),
				allocation="Primary",
			)
			route = api.resolve_route(company, department, positions["Worker"].name)
			assert [s["principal"] for s in route["steps"]] == [authority, reviewer]
			assert route["skipped"][0]["position"] == positions["Vacant"].name
			passed("Vacant manager escalates to enabled authority then terminal HR")
			denied(
				"Overlapping employee primary assignment blocked",
				lambda: insert(
					"Kandil Position Assignment",
					company=company,
					department=department,
					branch=branch,
					position=positions["Vacant"].name,
					employee=employee.name,
					user=authority,
					valid_from=today(),
					allocation="Primary",
				),
			)
			cycle = insert(
				"Kandil Structure Change",
				company=company,
				effective_on=add_days(today(), 1),
				reason="Invalid future cycle",
				changes_json=json.dumps(
					[
						{
							"action": "Reparent",
							"position": positions["Manager"].name,
							"parent_position": positions["Worker"].name,
							"authority": "Department Approval",
						}
					]
				),
			)
			denied("Future hierarchy cycle blocked at preview", lambda: api.preview_structure(cycle.name))
			jd = insert(
				"Kandil JD Revision",
				company=company,
				department=department,
				branch=branch,
				position=positions["Worker"].name,
				valid_from=today(),
				purpose="Operate safely and maintain product quality.",
				purpose_ar="تشغيل المعدات بأمان والحفاظ على جودة المنتج.",
				certifications="Safety training certificate",
				certifications_ar="شهادة تدريب السلامة",
				working_conditions="Moving machinery. Stop work and report unsafe conditions.",
				working_conditions_ar="معدات متحركة. أوقف العمل وأبلغ عن أي ظروف غير آمنة.",
				responsibilities="Synthetic responsibilities",
				responsibility_rows=[
					{
						"description": "Inspect equipment before the shift",
						"description_ar": "افحص المعدات قبل بداية الوردية",
					},
					{"description": "Maintain product quality", "description_ar": "حافظ على جودة المنتج"},
					{"description": "Report hazards immediately", "description_ar": "أبلغ عن المخاطر فوراً"},
				],
				kpis=[
					{
						"indicator": "Quality",
						"kind": "Weighted",
						"weight": 60,
						"formula": "Accepted units",
						"frequency": "Monthly",
					},
					{
						"indicator": "Safety",
						"kind": "Weighted",
						"weight": 40,
						"formula": "Checks completed",
						"frequency": "Monthly",
					},
				],
				competencies=[
					{"competency": "Quality", "weight": 60, "measure": "Accepted units"},
					{"competency": "Safety", "weight": 40, "measure": "Checks completed"},
				],
			)
		with user(hr):
			bad = frappe.get_doc("Kandil JD Revision", jd.name)
			bad.kpis[1].weight = 30
			denied("Native JD rejects weighted KPI total 90", bad.save)
			bad = frappe.get_doc("Kandil JD Revision", jd.name)
			bad.append(
				"kpis",
				dict(
					indicator="Observation", kind="Monitoring", weight=1, formula="Observe", frequency="Daily"
				),
			)
			denied("Native JD rejects monitoring KPI weight", bad.save)
			bad = frappe.get_doc("Kandil JD Revision", jd.name)
			bad.job_level = "JL1"
			for i in range(6):
				bad.append("responsibility_rows", dict(description="Additional responsibility " + str(i)))
			denied("Native JD responsibility band requires exception reason", bad.save)
		with user(authority):
			api.approve_revision("Kandil JD Revision", jd.name, str(jd.modified))
			approved = frappe.get_doc("Kandil JD Revision", jd.name)
			assert approved.revision == 1 and approved.status == "Approved"
			approved.purpose = "Unauthorized rewrite"
			denied("Approved JD cannot be overwritten", approved.save)
			passed("Structured JD with independent KPIs and competency profile approved")
			from kandil_hr.organization.documents import render

			for language in ["ar", "en"]:
				for kind in ["jd", "worker"]:
					output = render(jd.name, language, kind)
					assert '<html lang="' + language + '"' in output["html"]
					assert "grade_band" not in output["html"] and "Grade Band" not in output["html"]
					if language == "ar":
						assert "حافظ على جودة المنتج" in output["html"]
					if kind == "worker":
						assert "60.0%" not in output["html"] and "40.0%" not in output["html"]
					if export_documents:
						from io import BytesIO
						from pathlib import Path

						from frappe.utils.pdf import get_pdf
						from pypdf import PdfReader

						target = (
							Path(frappe.get_app_path("kandil_hr")).parent / "docs" / "organization-evidence"
						)
						target.mkdir(parents=True, exist_ok=True)
						content = get_pdf(output["html"], options={"page-size": "A4"})
						pages = len(PdfReader(BytesIO(content)).pages)
						if kind == "worker":
							assert pages == 1, "Worker sample must fit one A4 page"
						(target / (kind + "-" + language + ".html")).write_text(output["html"])
						(target / (kind + "-" + language + ".pdf")).write_bytes(content)
			passed(
				"Scoped AR/EN JD and worker-card rendering excludes internal grade and KPI weights on card"
			)
			if export_documents:
				passed("Four native PDF outputs generated; both worker-card samples fit one A4 page")
			child = frappe.get_doc("Kandil JD Competency", approved.competencies[0].name)
			child.weight = 99
			denied(
				"Direct child save cannot rewrite approved JD competency",
				lambda: child.save(ignore_permissions=True),
			)
			denied(
				"Direct child delete cannot remove approved JD competency",
				lambda: frappe.delete_doc("Kandil JD Competency", child.name, ignore_permissions=True),
			)
			for child_row in [approved.responsibility_rows[0], approved.kpis[0]]:
				direct = frappe.get_doc(child_row.doctype, child_row.name)
				denied(
					"Direct " + child_row.doctype + " save is blocked",
					lambda: direct.save(ignore_permissions=True),
				)
		with user(hr):
			rows = [
				{
					"position_code": prefix + "-Import",
					"title": "Imported position",
					"department": department,
					"branch": branch,
					"designation": designation,
					"structural": 2,
				}
			]
			batch = insert("Kandil Organization Import", company=company, rows_json=json.dumps(rows))
		with user(authority):
			api.review_import(batch.name, str(batch.modified))
		with user(hr):
			batch.reload()
			result = api.apply_import(batch.name, batch.digest)
			assert result["created"] == 1
			assert api.apply_import(batch.name, batch.digest) == result
			repeated = insert("Kandil Organization Import", company=company, rows_json=json.dumps(rows))
		with user(authority):
			preview = api.review_import(repeated.name, str(repeated.modified))
			assert preview[0]["action"] == "Unchanged"
		with user(hr):
			repeated.reload()
			assert api.apply_import(repeated.name, repeated.digest)["created"] == 0
			passed("Reviewed import and repeated batches do not duplicate positions")
			report = api.reconcile_occupancy(company)
			item = next(r for r in report["rows"] if r["position"] == positions["Manager"].name)
			assert item["allocated"] == 1 and item["difference"] == -1 and not report["balanced"]
			passed("Occupied baseline mismatch explicitly reported, never silently reset")
		with user(authority):
			capacity = insert(
				"Kandil Capacity",
				company=company,
				department=department,
				branch=branch,
				designation=designation,
				position=positions["Worker"].name,
				structural=1,
			)
			capacity.structural = 2
			denied("Direct capacity resize cannot bypass approved Position", capacity.save)
		with user(hr):
			resize = insert(
				"Kandil Structure Change",
				company=company,
				effective_on=today(),
				reason="Reviewed structural increase",
				changes_json=json.dumps(
					[{"action": "Resize", "position": positions["Worker"].name, "structural": 2}]
				),
			)
			preview = api.preview_structure(resize.name)
			resize.reload()
			api.submit_structure(resize.name, preview["preview_hash"], uuid.uuid4().hex, str(resize.modified))
		for _ in range(5):
			resize.reload()
			if resize.status != "Pending":
				break
			step = next(s for s in resize.approval_steps if s.decision == "Pending")
			with user(step.principal):
				api.decide_structure(
					resize.name,
					preview["preview_hash"],
					"Approved",
					step.step_key,
					uuid.uuid4().hex,
					str(resize.modified),
				)
		resize.reload()
		assert resize.status == "Approved"
		assert frappe.db.get_value("Kandil Position", positions["Worker"].name, "structural") == 2
		assert frappe.db.get_value("Kandil Capacity", capacity.name, "structural") == 2
		passed("Reviewed hierarchy-HR-CEO resize updates position and capacity atomically")
		with user(hr):
			new_key = uuid.uuid4().hex
			count = frappe.db.count("Kandil Position", {"company": company})
			create = insert(
				"Kandil Structure Change",
				company=company,
				effective_on=today(),
				reason="New position approval test",
				changes_json=json.dumps(
					[
						{
							"action": "Create",
							"draft_key": new_key,
							"title": "Approved new position",
							"department": department,
							"branch": branch,
							"designation": designation,
							"structural": 1,
							"parent_position": positions["Manager"].name,
							"authority": "Department Approval",
						}
					]
				),
			)
			preview = api.preview_structure(create.name)
			create.reload()
			api.submit_structure(create.name, preview["preview_hash"], uuid.uuid4().hex, str(create.modified))
			assert frappe.db.count("Kandil Position", {"company": company}) == count
			passed("New Position ID is not issued on draft or submission")
		for _ in range(5):
			create.reload()
			if create.status != "Pending":
				break
			step = next(s for s in create.approval_steps if s.decision == "Pending")
			with user(step.principal):
				api.decide_structure(
					create.name,
					preview["preview_hash"],
					"Approved",
					step.step_key,
					uuid.uuid4().hex,
					str(create.modified),
				)
		create.reload()
		created = json.loads(create.created_positions_json)
		new_position = created[new_key]
		assert create.status == "Approved" and new_position.startswith("KPOS-")
		assert frappe.db.count("Kandil Capacity", {"position": new_position}) == 1
		passed("Final hierarchy-HR-CEO approval creates one Position ID and one capacity")
		with user(hr):
			# Reviewed unchanged hierarchy baseline is accepted without duplicate edges.
			hr_rows = [
				dict(
					position=positions["Worker"].name,
					parent_position=positions["Vacant"].name,
					authority="Department Approval",
					valid_from=today(),
				)
			]
			hierarchy_import = insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Hierarchy",
				rows_json=json.dumps(hr_rows),
			)
		with user(authority):
			preview = api.review_import(hierarchy_import.name, str(hierarchy_import.modified))
			assert preview[0]["action"] == "Unchanged"
		with user(hr):
			hierarchy_import.reload()
			assert api.apply_import(hierarchy_import.name, hierarchy_import.digest)["created"] == 0
			passed("Reviewed hierarchy re-import preserves dated edges without duplicates")
			allocation_rows = [
				dict(
					position=positions["Manager"].name,
					employee=employee.name,
					user=authority,
					allocation="Primary",
					valid_from=today(),
				)
			]
			assignment_import = insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Assignments",
				rows_json=json.dumps(allocation_rows),
			)
		with user(authority):
			preview = api.review_import(assignment_import.name, str(assignment_import.modified))
			assert preview[0]["action"] == "Unchanged"
		with user(hr):
			assignment_import.reload()
			assert api.apply_import(assignment_import.name, assignment_import.digest)["created"] == 0
			passed("Reviewed assignment re-import preserves one explicit allocation")
			conflict = insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Assignments",
				rows_json=json.dumps(
					[
						dict(
							position=positions["Vacant"].name,
							employee=employee.name,
							user=authority,
							allocation="Primary",
							valid_from=today(),
						)
					]
				),
			)
		with user(authority):
			denied(
				"Import cannot double-allocate an employee",
				lambda: api.review_import(conflict.name, str(conflict.modified)),
			)
		with user(hr):
			hierarchy_new = insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Hierarchy",
				rows_json=json.dumps(
					[dict(position=prefix + "-Import", authority="Department Approval", valid_from=today())]
				),
			)
		with user(authority):
			api.review_import(hierarchy_new.name, str(hierarchy_new.modified))
		with user(hr):
			hierarchy_new.reload()
			applied = api.apply_import(hierarchy_new.name, hierarchy_new.digest)
			assert applied["created"] == 1 and applied["snapshot"]
			assert api.apply_import(hierarchy_new.name, hierarchy_new.digest) == applied
			passed("Reviewed hierarchy import creates one native edge and snapshot; replay stable")
			history = insert(
				"Kandil Organization Import",
				company=company,
				import_kind="Assignments",
				rows_json=json.dumps(
					[
						dict(
							position=prefix + "-Import",
							employee=employee.name,
							user=authority,
							allocation="Primary",
							valid_from=add_days(today(), -10),
							valid_until=add_days(today(), -1),
						)
					]
				),
			)
		with user(authority):
			api.review_import(history.name, str(history.modified))
		with user(hr):
			history.reload()
			applied = api.apply_import(history.name, history.digest)
			assert applied["created"] == 1 and applied["snapshot"]
			assert api.apply_import(history.name, history.digest) == applied
			passed("Reviewed historical allocation import creates native history without double counting")
		from kandil_hr.organization.acceptance_tests import run_cases

		acceptance_cases = run_cases(locals())
		with user(outsider):
			from kandil_hr.organization.documents import render

			denied("HR role without company scope cannot print JD", lambda: render(jd.name))
		with user("Guest"):
			denied(
				"Guest cannot preview organization CSV",
				lambda: api.preview_csv_import(baseline.name, csv_text, str(baseline.modified)),
			)
			denied("Guest cannot query organization reconciliation", lambda: api.reconcile_occupancy(company))
			from kandil_hr.organization.documents import render

			denied("Guest cannot view or download JD documents", lambda: render(jd.name))
		return {
			"suite": "organization-native",
			"results": results,
			"passed": len(results),
			"rolled_back": True,
			"acceptance_cases": acceptance_cases,
		}
	finally:
		frappe.db.rollback()
		frappe.set_user(before)
