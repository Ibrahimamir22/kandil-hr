"""CLI-only approved bilingual JD for PDF/local-capture browser proof."""
import json
import frappe
from frappe.utils import today
from kandil_hr.portal import fixture as base, jd_fixture, job_descriptions
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id);jd_fixture.prepare(run_id);data=json.loads(base.path_for(run_id).read_text())
    payload=dict(valid_from=today(),job_level='JL4',purpose='Lead safe manufacturing and consistent quality. Synthetic review document only.',
        purpose_ar='قيادة التصنيع الآمن والحفاظ على جودة المنتج. مستند تجريبي للمراجعة فقط.',
        qualifications='Relevant technical qualification and documented safety training.',qualifications_ar='مؤهل فني مناسب وتدريب موثق على السلامة.',
        experience='Practical production and team coordination experience.',experience_ar='خبرة عملية في الإنتاج وتنسيق الفريق.',
        technical_skills='Inspection, traceable records and equipment checks.',technical_skills_ar='الفحص والسجلات القابلة للتتبع والتحقق من المعدات.',
        working_conditions='Factory floor. Follow approved protective equipment and stop unsafe work.',working_conditions_ar='داخل المصنع. الالتزام بمعدات الوقاية المعتمدة وإيقاف العمل غير الآمن.',
        certifications='Maintain the training records required for the assigned equipment.',certifications_ar='الحفاظ على سجلات التدريب المطلوبة للمعدات المخصصة.',
        responsibility_rows=[dict(area='Operations',description='Check production quality, record evidence and escalate deviations before the next operation. Coordinate the action with the responsible team and verify completion.',
            description_ar='مراجعة جودة الإنتاج وتسجيل الأدلة وتصعيد الانحرافات قبل العملية التالية. تنسيق الإجراء مع الفريق المسؤول والتحقق من اكتماله مع الالتزام بمتطلبات السلامة.') for i in range(10)],
        kpis=[dict(indicator=title,indicator_ar=ar,kind='Weighted',weight=20,formula='Verified successful cases / all reviewed cases × 100',formula_ar='الحالات الناجحة المعتمدة ÷ جميع الحالات المراجعة × 100',frequency='Monthly / شهريًا')
            for title,ar in [('Quality','الجودة'),('Safety','السلامة'),('Records','السجلات'),('Delivery','التسليم'),('Training','التدريب')]],
        authorities=[dict(decision='Stop unsafe work and report the hazard.',decision_ar='إيقاف العمل غير الآمن والإبلاغ عن الخطر.',authority_level='Stop')],
        competencies=[dict(competency='Quality inspection',competency_ar='فحص الجودة',measure='Observed task and evidence review',measure_ar='ملاحظة المهمة ومراجعة الأدلة',required_level='3',behavior='Record and investigate deviations.',behavior_ar='تسجيل الانحرافات والتحقيق فيها.')])
    with acting_as(data['users']['hr']['email']):saved=job_descriptions.save(data['positions'][0],payload,'document-fixture-'+run_id)
    with acting_as(data['users']['sector']['email']):approved=job_descriptions.approve(saved['name'],saved['modified'],'document-approve-'+run_id)
    data['jd']=approved['name'];data['version']=approved['modified'];persist(base.path_for(run_id),data);frappe.db.commit()
    return dict(run_id=run_id,prepared=True,credentials='private-file-only')


def inspect(run_id):
    guard(run_id);data=json.loads(base.path_for(run_id).read_text())
    return dict(captures=frappe.get_all('Kandil Document Delivery',filters={'jd_revision':data['jd']},
        fields=['name','recipient','sender','language','output_kind','status'],order_by='creation'))


def revoke_recipient(run_id):
    guard(run_id);data=json.loads(base.path_for(run_id).read_text());user=data['users']['recruiter']['email']
    for name in frappe.get_all('Kandil Access Grant',filters={'user':user,'company':data['company']},pluck='name'):
        doc=frappe.get_doc('Kandil Access Grant',name);doc.revoked=1;doc.save(ignore_permissions=True)
    frappe.db.commit();return dict(revoked=True)


def cleanup(run_id):return jd_fixture.cleanup(run_id)
