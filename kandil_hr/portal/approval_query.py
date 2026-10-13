"""SQL projection of current approval authority, before count/pagination.

Fixed r/s aliases only. All user/date values are escaped. This is a read model,
not a mutation grant; recruitment commands revalidate current locked authority.
Parity tests cover direct/delegated/Board decisions and current/frozen interests.
"""
import frappe
from frappe.database.query import RawCriterion
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.foundation.delegation import delegation_sql
from kandil_hr.recruitment.api import ROLES


def policy(field):
    if field not in ('board_vice_approver','exception_approver'):
        raise ValueError('Unsupported frozen policy field')
    return f"JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(r.route_snapshot),r.route_snapshot,'{{}}'),'$.policy.{field}'))"


def enabled_role(actor, role):
    return f"""(EXISTS (SELECT 1 FROM `tabUser` au WHERE au.name={actor} AND au.enabled=1)
    AND EXISTS (SELECT 1 FROM `tabHas Role` ar WHERE ar.parent={actor} AND ar.parenttype='User' AND ar.role={role}))"""


def management_scope(actor):
    # Mirrors assert_current_request_scope: valid selected position and every
    # capacity's company/department/branch, with current management grants.
    day=frappe.db.escape(str(today_cairo()))
    base=f"""g.user={actor} AND g.company=r.company AND g.revoked=0
      AND g.valid_from<={day} AND (g.valid_until IS NULL OR g.valid_until>={day})
      AND (COALESCE(g.department,'')='' OR g.department=r.department) AND g.can_manage_recruitment=1"""
    return f"""({actor}='Administrator' OR (
      (COALESCE(r.requested_position,'')='' OR EXISTS (SELECT 1 FROM `tabKandil Position` ap
       WHERE ap.name=r.requested_position AND ap.company=r.company AND ap.department=r.department
       AND EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}
         AND (COALESCE(g.branch,'')='' OR g.branch=ap.branch))))
      AND (EXISTS (SELECT 1 FROM `tabKandil Request Line` al WHERE al.parent=r.name AND al.parenttype='Kandil Hiring Request' AND al.parentfield='lines')
        OR EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base} AND COALESCE(g.branch,'')=''))
      AND NOT EXISTS (SELECT 1 FROM `tabKandil Request Line` al LEFT JOIN `tabKandil Capacity` ac ON ac.name=al.capacity
        WHERE al.parent=r.name AND al.parenttype='Kandil Hiring Request' AND al.parentfield='lines'
        AND (ac.name IS NULL OR ac.company<>r.company OR ac.department<>r.department OR COALESCE(ac.branch,'')=''
          OR NOT EXISTS (SELECT 1 FROM `tabKandil Access Grant` g WHERE {base}
            AND (COALESCE(g.branch,'')='' OR g.branch=ac.branch))))))"""


def independent(actor):
    day=frappe.db.escape(str(today_cairo()))
    frozen="IF(JSON_VALID(r.route_snapshot),r.route_snapshot,'{}')"
    return f"""(COALESCE({actor},'')<>'' AND {actor}<>r.requested_by AND {actor}<>r.owner
      AND {actor}<>COALESCE(r.beneficiary_user,'')
      AND NOT COALESCE(JSON_CONTAINS({frozen},JSON_QUOTE({actor}),'$.interest_snapshot.users'),0)
      AND NOT EXISTS (SELECT 1 FROM `tabKandil Position Assignment` ia
        LEFT JOIN `tabEmployee` ie ON ie.name=ia.employee AND ie.company=r.company
        WHERE ia.company=r.company AND COALESCE(ia.is_voided,0)=0
          AND ia.valid_from<={day} AND (ia.valid_until IS NULL OR ia.valid_until>={day})
          AND (ia.user={actor} OR ie.user_id={actor})
          AND (ia.position=r.requested_position OR EXISTS (SELECT 1 FROM `tabKandil Request Line` il
            JOIN `tabKandil Capacity` ic ON ic.name=il.capacity AND ic.company=r.company
            WHERE il.parent=r.name AND il.parenttype='Kandil Hiring Request' AND il.parentfield='lines' AND ic.position=ia.position))))"""


def condition():
    user=frappe.db.escape(frappe.session.user);day=frappe.db.escape(str(today_cairo()))
    role="CASE s.authority "+' '.join(f"WHEN {frappe.db.escape(k)} THEN {frappe.db.escape(v)}" for k,v in ROLES.items())+" ELSE '' END"
    delegated=f"""EXISTS (SELECT 1 FROM `tabKandil Delegation` d WHERE d.from_user=s.principal
      AND d.to_user={user} AND d.company=r.company AND d.department=r.department AND d.revoked=0
      AND d.from_date<={day} AND d.to_date>={day} AND {delegation_sql()})"""
    ordinary=f"""(s.authority<>'Board Approval' AND {enabled_role('s.principal',role)}
      AND {management_scope('s.principal')} AND {independent('s.principal')}
      AND (s.principal={user} OR ({enabled_role(user,frappe.db.escape('Kandil Approver'))} AND {delegated})))"""
    vice=policy('board_vice_approver');sector=policy('exception_approver')
    def member(actor):
        return f"({enabled_role(actor,frappe.db.escape('Kandil Board Approver'))} AND {management_scope(actor)} AND {independent(actor)})"
    board=f"""(s.authority='Board Approval' AND (
      (({user}=s.principal OR {user}={vice}) AND {member(user)})
      OR ({user}={sector} AND {enabled_role(user,frappe.db.escape('Kandil Sector Approver'))}
          AND ({member('s.principal')} OR {member(vice)}))))"""
    return RawCriterion(f"""r.status='Pending' AND s.decision='Pending'
      AND NOT EXISTS (SELECT 1 FROM `tabKandil Approval Step` earlier WHERE earlier.parent=r.name
        AND earlier.parenttype='Kandil Hiring Request' AND earlier.parentfield='approval_steps'
        AND earlier.decision='Pending' AND earlier.idx<s.idx)
      AND {management_scope(user)} AND {independent(user)} AND ({ordinary} OR {board})""")
