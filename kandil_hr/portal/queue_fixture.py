"""Isolated candidate queue browser scenarios; existing lease/cleanup owns cohort."""
import uuid
import frappe
from frappe.utils import add_days

from kandil_hr.portal import candidate_fixture
from kandil_hr.foundation.clock import today_cairo
from kandil_hr.recruitment import ownership
from kandil_hr.candidates import intake
from kandil_hr.recruitment.test_commands import acting_as
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.portal.fixture import path_for


def prepare(run_id):
    candidate_fixture.prepare(run_id)
    candidate_fixture.enable(run_id)
    frappe.conf.kandil_candidate_identity_enabled = 1
    data=candidate_fixture.load(run_id)
    request=data['candidate']['request'];opening=data['candidate']['opening']
    names=frappe.get_all('Job Applicant',filters={'job_title':opening,'custom_kandil_identity_origin':'Reviewed intake'},
        fields=['name','applicant_name'],order_by='applicant_name asc')
    if len(names)!=21: raise RuntimeError('Expected fresh candidate intake cohort')
    at=today_cairo().isoformat()
    with acting_as(data['users']['hr']['email']):
        for index,days,owner in ((0,-2,'recruiter'),(1,0,'recruiter'),(2,5,'recruiter'),(3,0,'hr'),(4,0,'recruiter'),(5,-1,'recruiter'),(6,0,'recruiter')):
            ownership.set_next_action(names[index].name,'Queue call '+str(index)+' / متابعة',str(add_days(at,days)),
                data['users'][owner]['email'],'Synthetic queue setup',uuid.uuid4().hex,
                str(frappe.get_doc('Kandil Hiring Request',request).modified),str(frappe.get_doc('Job Applicant',names[index].name).modified))
        for index,status in ((4,'Rejected'),(5,'Hold'),(6,'Accepted')):
            doc=frappe.get_doc('Job Applicant',names[index].name);doc.status=status;doc.save()
    with acting_as(data['users']['recruiter']['email']):
        for index in range(3):
            intake.create_application(request,opening,dict(applicant_name=f'Extra queue candidate {index}',
                email_id=f'queue-{run_id}-{index}@example.invalid',phone_number='01012345678',source_channel='Referral',source_detail='Synthetic queue paging'),
                uuid.uuid4().hex,str(frappe.get_doc('Kandil Hiring Request',request).modified))
    data['queue']=dict(as_of=at,overdue=names[0].name,today=names[1].name,upcoming=names[2].name,
        other_owner=names[3].name,rejected=names[4].name,hold=names[5].name,accepted=names[6].name)
    persist(path_for(run_id),data);frappe.db.commit()
    return dict(prepared=True,applications=25,scheduled=7,lease=True)
