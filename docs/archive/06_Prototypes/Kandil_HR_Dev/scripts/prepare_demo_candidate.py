import sys,json
sys.argv=['helpers','SKIP'];import test_hr_functional as t
s=json.loads((t.OUT/'pilot-demo.json').read_text());hr=t.users['manager']
d=hr.get('Kandil Hiring Request',s['request']);opening=d['lines'][0]['job_opening']
app=hr.create('Job Applicant',dict(applicant_name='مرشح للمراجعة مع فريق الموارد البشرية',phone_number='01055550001',job_title=opening))
interview=hr.create('Interview',dict(job_applicant=app['name'],interview_type=t.F['interview_type'],scheduled_on=t.F['today'],from_time='11:00:00',to_time='11:30:00',status='Pending',interview_details=[{'interviewer':t.C['manager']['email']}]))
feedback=hr.create('Interview Feedback',dict(interview=interview['name'],interviewer=t.C['manager']['email'],interview_type=t.F['interview_type'],job_applicant=app['name'],result='Cleared',feedback='Synthetic HR review example',skill_assessment=[{'skill':t.F['skill'],'rating':0.8}]))
feedback=hr.submit(feedback);assert feedback['docstatus']==1
before=hr.count('Employee',{'job_applicant':app['name']});assert before==0
offer=hr.create('Job Offer',dict(job_applicant=app['name'],offer_date=t.F['today'],designation='PILOT Assembly Operator',company=t.F['company'],status='Accepted'));offer=hr.submit(offer)
assert hr.count('Employee',{'job_applicant':app['name']})==0
s.update(applicant=app['name'],opening=opening,interview=interview['name'],feedback=feedback['name'],offer=offer['name'],review_status='Accepted offer ready for HR to record actual joining. No employee created for this demo candidate.',phone_only_interview_passed=True)
(t.OUT/'pilot-demo.json').write_text(json.dumps(s,indent=2,ensure_ascii=False));print(json.dumps(s,ensure_ascii=False,indent=2))
