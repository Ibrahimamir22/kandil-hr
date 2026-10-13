"""Current-profile and historical-application search under native record scope."""
import frappe
from pypika.terms import CustomFunction, Criterion

from kandil_hr.candidates import identity
from kandil_hr.portal.vacancies import permitted_names

JSONExtract=CustomFunction('JSON_EXTRACT',['document','path'])
JSONUnquote=CustomFunction('JSON_UNQUOTE',['value'])
JSONValid=CustomFunction('JSON_VALID',['value'])
If=CustomFunction('IF',['condition','yes','no'])
Lower=CustomFunction('LOWER',['value'])
Trim=CustomFunction('TRIM',['value'])
Coalesce=CustomFunction('COALESCE',['value','fallback'])
Replace=CustomFunction('REGEXP_REPLACE',['value','pattern','replacement'])


def field(person,key):
    if key not in ('full_name','email_id','phone_number'):
        raise ValueError('Unsupported profile search field')
    return JSONUnquote(JSONExtract(If(JSONValid(person.profile_json),person.profile_json,'{}'),'$.'+key))


def phone(value):
    return Replace(Coalesce(value,''),'[^0-9+]','')


def application_query():
    a=frappe.qb.DocType('Job Applicant');o=frappe.qb.DocType('Job Opening');r=frappe.qb.DocType('Kandil Hiring Request')
    q=(frappe.qb.from_(a).join(o).on(a.job_title==o.name).join(r).on(o.custom_kandil_request==r.name)
       .where(a.name.isin(permitted_names('Job Applicant')) & o.name.isin(permitted_names('Job Opening'))
              & r.name.isin(permitted_names('Kandil Hiring Request'))))
    return q,a,o,r


def person_matches(*,literal=None,email='',mobile='',name='',company=None):
    p=frappe.qb.DocType(identity.DT)
    q=frappe.qb.from_(p).select(p.name).where(p.name.isin(permitted_names(identity.DT)))
    if company:q=q.where(p.company==company)
    tests=[]
    if literal:
        tests=[field(p,k).like(literal) for k in ('full_name','email_id','phone_number')]
    else:
        if email:tests.append(Lower(Trim(field(p,'email_id')))==email)
        if mobile:tests.append(phone(field(p,'phone_number'))==mobile)
        if name:tests.append(Lower(Trim(field(p,'full_name')))==name)
    return q.where(Criterion.any(tests)) if tests else q.where(p.name=='')


def labels(names):
    names=sorted(set(names)-{None,''})
    if not names:return {}
    p=frappe.qb.DocType(identity.DT)
    rows=(frappe.qb.from_(p).select(p.name,field(p,'full_name').as_('full_name'))
          .where(p.name.isin(names)&p.name.isin(permitted_names(identity.DT))).run(as_dict=True))
    return {r.name:r.full_name for r in rows}


def duplicate_rows(company,email,mobile,name,after):
    q,a,o,r=application_query()
    tests=[]
    if email:tests.append(Lower(Trim(a.email_id))==email)
    if mobile:tests.append(phone(a.phone_number)==mobile)
    if name:tests.append(Lower(Trim(a.applicant_name))==name)
    tests.append(a.custom_kandil_person.isin(person_matches(email=email,mobile=mobile,name=name,company=company)))
    rows=(q.select(a.name.as_('application'),a.applicant_name,a.custom_kandil_person.as_('person'))
          .where((r.company==company)&(a.name>after)&Criterion.any(tests)).orderby(a.name).limit(21).run(as_dict=True))
    current=labels([row.person for row in rows[:20]])
    for row in rows[:20]:row['person_name']=current.get(row.person)
    return rows
