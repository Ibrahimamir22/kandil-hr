"""Ordinary HTTP session/CSRF acceptance on a fresh synthetic portal cohort.

Usage: python3 docs/portal/test_http.py RUN_ID. Never emits credentials or tokens.
"""
import concurrent.futures
import datetime
import hashlib
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
SITE = APP.parent.parent / "sites/kandil-parity.localhost"
BASE = "http://localhost:8102"
PORTAL = "kandil_hr.portal.api."
DOMAIN = "kandil_hr.recruitment."


class Actor:
    def __init__(self, account=None):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if account:
            code, _ = self.call("login", dict(usr=account["email"], pwd=account["password"]))
            assert code == 200, "Ordinary login failed"
            self.csrf = self.get(PORTAL + "bootstrap")["csrf_token"]

    def call(self, method, payload=None, verb="POST", csrf=True):
        url = BASE + "/api/method/" + method
        headers = {"Content-Type": "application/json"}
        if csrf and self.csrf:
            headers["X-Frappe-CSRF-Token"] = self.csrf
        if verb == "GET":
            url += "?" + urllib.parse.urlencode(payload or {})
            data = None
        else:
            data = json.dumps(payload or {}).encode()
        try:
            with self.opener.open(urllib.request.Request(url, data=data, headers=headers, method=verb), timeout=40) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            try:
                body = json.load(error)
            except Exception:
                body = {}
            return error.code, body

    def get(self, method, **values):
        status, body = self.call(method, values, "GET")
        assert status == 200, f"GET {method} failed ({status})"
        return body["message"]

    def post(self, method, **values):
        status, body = self.call(method, values)
        assert status == 200, f"POST {method} failed ({status}, {body.get('exc_type')})"
        return body["message"]


def main(run_id):
    data = json.loads((SITE / "private" / f"kandil-portal-{run_id}.json").read_text())
    assert data["company"] == "Kandil PORTAL TEST " + run_id
    checks = []
    def check(name, condition):
        assert condition, name
        checks.append(dict(name=name, status="PASS"))
    actors = {key: Actor(account) for key, account in data["users"].items()}
    requester, manager, hr, outsider = (actors[key] for key in ("requester", "manager", "hr", "outsider"))
    anon = Actor()
    check("Guest cannot read portal data", anon.call(PORTAL + "overview", verb="GET")[0] in (401, 403))
    check("Outsider selectors and requests are empty", not outsider.get(PORTAL + "choices")["positions"] and not outsider.get(PORTAL + "overview")["requests"])
    choices = requester.get(PORTAL + "choices")
    check("Scoped locations returned", {x["id"] for x in choices["capacities"]} == set(data["capacities"]))
    payload = dict(company=data["company"], department=data["department"], title="HTTP · طلب فني تشغيل",
        requested_position=data["positions"][0], requested_priority="Normal", need_reason="Expansion",
        qualifications="Synthetic connected portal checks", lines=[dict(capacity=cap, requested_qty=2) for cap in data["capacities"][:2]])
    save = dict(payload=payload, command_id=uuid.uuid4().hex)
    check("Missing CSRF denied", requester.call(PORTAL + "save_draft", save, csrf=False)[0] == 400)
    check("Protected status injection denied", requester.call(PORTAL + "save_draft", dict(save, payload=payload | {"status":"Approved"}))[0] in (403, 417))
    # Independent sessions, identical command: one draft effect even if submitted twice.
    second = Actor(data["users"]["requester"])
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda actor: actor.post(PORTAL + "save_draft", **save), (requester, second)))
    doc = results[0]
    check("Concurrent duplicate draft creates one record", results[0] == results[1])
    check("Changed same-command payload rejected", requester.call(PORTAL + "save_draft", dict(save, payload=payload | {"title":"changed"}))[0] == 417)
    check("Outsider cannot read known request ID", outsider.call(PORTAL + "detail", {"name":doc["name"]}, "GET")[0] == 403)
    check("Outsider cannot create in another scope", outsider.call(PORTAL + "save_draft", dict(save, command_id=uuid.uuid4().hex))[0] == 403)
    newer = requester.post(PORTAL + "save_draft", payload=payload | {"title":"HTTP · طلب فني تشغيل محدث"}, name=doc["name"], expected_version=doc["modified"], command_id=uuid.uuid4().hex)
    check("Stale draft write denied", requester.call(PORTAL + "save_draft", dict(payload=payload, name=doc["name"], expected_version=doc["modified"], command_id=uuid.uuid4().hex))[0] == 417)
    doc = newer
    submit = dict(name=doc["name"], expected_version=doc["modified"], command_id=uuid.uuid4().hex)
    first = requester.post(DOMAIN + "api.submit_request", **submit)
    check("Submit reserves both locations", first["status"] == "Pending" and [x["reserved_qty"] for x in first["lines"]] == [2,2])
    check("Submit replay exact same result", requester.post(DOMAIN + "api.submit_request", **submit) == first)
    active = manager.get(PORTAL + "detail", name=doc["name"])["actions"]
    command = dict(name=doc["name"], decision="Approve", step_id=active["step_id"], expected_version=active["expected_version"], command_id=uuid.uuid4().hex, comment="HTTP synthetic review")
    check("Requester cannot self-approve", requester.call(DOMAIN + "api.decide", command)[0] == 403)
    check("HR cannot skip manager approval", hr.call(DOMAIN + "api.decide", command)[0] == 403)
    approved = manager.post(DOMAIN + "api.decide", **command)
    check("Manager approval preserves HR step", approved["status"] == "Pending")
    check("Approval replay does not advance twice", manager.post(DOMAIN + "api.decide", **command) == approved)
    active = hr.get(PORTAL + "detail", name=doc["name"])["actions"]
    approved = hr.post(DOMAIN + "api.decide", name=doc["name"], decision="Approve", step_id=active["step_id"], expected_version=active["expected_version"], command_id=uuid.uuid4().hex, comment="HTTP final HR review")
    check("Final approval creates one vacancy per location", approved["status"] == "Approved" and len({x["job_opening"] for x in approved["lines"]}) == 2 and all(x["reserved_qty"] == 0 and x["approved_qty"] == 2 for x in approved["lines"]))
    vacancy = next(v for v in hr.get(PORTAL + "overview")["vacancies"] if v["request"] == doc["name"])
    eligible = hr.get(PORTAL + "recruiters", opening_name=vacancy["name"])
    check("Recruiter selector excludes out-of-scope and non-recruiters", {x["id"] for x in eligible} == {data["users"][k]["email"] for k in ("hr","recruiter")})
    assignment = dict(name=doc["name"], opening_name=vacancy["name"], lead=data["users"]["recruiter"]["email"], members=[], reason="Assign synthetic recruiter", command_id=uuid.uuid4().hex, expected_version=vacancy["expected_version"])
    check("Requester cannot assign recruiter", requester.call(DOMAIN + "vacancies.assign_team", assignment)[0] == 403)
    assigned = hr.post(DOMAIN + "vacancies.assign_team", **assignment)
    check("Assignment replay exact same result", hr.post(DOMAIN + "vacancies.assign_team", **assignment) == assigned)
    check("Recruiter assignment persisted", any(v["name"] == vacancy["name"] and v["lead"] == assignment["lead"] for v in hr.get(PORTAL + "overview")["vacancies"]))
    # Independent return -> revision -> resubmission journey.
    returned = requester.post(PORTAL + "save_draft", payload=payload | {"title":"HTTP · طلب للمراجعة"}, command_id=uuid.uuid4().hex)
    requester.post(DOMAIN + "api.submit_request", name=returned["name"], expected_version=returned["modified"], command_id=uuid.uuid4().hex)
    a = manager.get(PORTAL + "detail", name=returned["name"])["actions"]
    values = dict(name=returned["name"], decision="Return", step_id=a["step_id"], expected_version=a["expected_version"], command_id=uuid.uuid4().hex, comment="")
    check("Return requires a reason", manager.call(DOMAIN + "api.decide", values)[0] == 417)
    r = manager.post(DOMAIN + "api.decide", **(values | {"comment":"Clarify qualifications", "command_id":uuid.uuid4().hex}))
    check("Return releases reservations", r["status"] == "Returned" and all(x["reserved_qty"] == 0 for x in r["lines"]))
    r = requester.post(DOMAIN + "api.revise", name=r["name"], expected_version=r["modified"], command_id=uuid.uuid4().hex, reason="Clarified qualifications")
    r = requester.post(PORTAL + "save_draft", name=r["name"], expected_version=r["modified"], command_id=uuid.uuid4().hex, payload=payload | {"title":"HTTP · طلب معدل", "qualifications":"Updated after return"})
    r = requester.post(DOMAIN + "api.submit_request", name=r["name"], expected_version=r["modified"], command_id=uuid.uuid4().hex)
    check("Revision increments and restarts independent approvals", r["revision"] == 2 and r["status"] == "Pending" and all(x["decision"] == "Pending" for x in r["approval_steps"]))
    denied = requester.post(PORTAL + "save_draft", payload=payload | {"title":"HTTP · سعة غير كافية", "lines":[dict(capacity=data["capacities"][2], requested_qty=2)]}, command_id=uuid.uuid4().hex)
    short = dict(name=denied["name"], expected_version=denied["modified"], command_id=uuid.uuid4().hex)
    denial = requester.post(DOMAIN + "api.submit_request", **short)
    check("Headcount shortage is explicit business denial", denial.get("outcome") == "denied")
    check("Denial replay is stable", requester.post(DOMAIN + "api.submit_request", **short) == denial)
    unchanged = requester.get(PORTAL + "detail", name=denied["name"])["request"]
    check("Denied submit retains draft and quantity without reservation", unchanged["status"] == "Draft" and unchanged["modified"] == denied["modified"] and unchanged["lines"][0]["requested_qty"] == 2 and unchanged["lines"][0]["reserved_qty"] == 0)
    for index, cap in enumerate(data["capacities"]):
        live = requester.get("frappe.client.get", doctype="Kandil Capacity", name=cap)
        expected = (2,2,26) if index < 2 else (0,0,1)
        check(f"Committed headcount reconciles location {index+1}", (live["reserved"],live["open_slots"],live["available"]) == expected)
    requester.call("logout")
    check("Logged-out session loses portal access", requester.call(PORTAL + "overview", verb="GET")[0] in (401,403))
    result = dict(status="PASS", run_id=run_id, checked_at=datetime.datetime.now(datetime.UTC).isoformat(), checks=checks,
        requests=dict(approved=doc["name"], revised=r["name"], denied=denied["name"]),
        source_hashes={str(p.relative_to(APP)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((APP / "kandil_hr").rglob("*.py"))},
        limits=["Synthetic HTTP acceptance; no production or 1000-concurrent-user claim."])
    output = APP / "docs/portal/evidence" / f"http-{run_id}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(dict(status="PASS", checks=len(checks), output=str(output))))


if __name__ == "__main__":
    main(sys.argv[1])
