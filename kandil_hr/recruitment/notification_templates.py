"""Fixed bilingual historical-event payloads, independent of actor locale.

Only reviewed labels and reference identifiers enter messages. Private reasons,
notes, candidate details and arbitrary action strings stay in authorized records.
Changing templates never rewrites stored outbox/receipt history.
"""

REQUEST_ACTIONS = {
    'Submitted': ('Submitted for approval', 'تم إرسال الطلب للاعتماد'),
    'Approve': ('Approval recorded', 'تم تسجيل اعتماد للطلب'),
    'Return': ('Returned for revision', 'تمت إعادة الطلب للمراجعة'),
    'Reject': ('Rejected', 'تم رفض الطلب'),
    'Revised': ('Revised request draft', 'تمت مراجعة مسودة الطلب'),
    'HR review': ('HR review recorded', 'تمت مراجعة الطلب بواسطة الموارد البشرية'),
    'HR correction': ('HR correction recorded', 'تم تصحيح بيانات الطلب بواسطة الموارد البشرية'),
    'Routed to CEO': ('Routed to CEO', 'تم توجيه الطلب إلى الرئيس التنفيذي'),
    'Cancelled': ('Cancelled', 'تم إلغاء الطلب'),
    'Pending quantities revised': ('Pending quantities revised; approvals restarted', 'تم تعديل الأعداد وإعادة مسار الاعتماد'),
    'Amendment applied': ('Amendment applied', 'تم تطبيق التعديل المعتمد على الطلب'),
    'Recruiter team changed': ('Recruitment team updated', 'تم تحديث فريق التوظيف'),
    'Vacancy Open': ('Vacancy opened', 'تم فتح الشاغر للتوظيف'),
    'Vacancy Hold': ('Vacancy placed on hold', 'تم إيقاف الشاغر مؤقتًا'),
    'Vacancy Resume': ('Vacancy resumed', 'تم استئناف العمل على الشاغر'),
    'Vacancy Freeze': ('Vacancy frozen', 'تم تجميد الشاغر'),
    'Vacancy Unfreeze': ('Vacancy unfrozen', 'تم إلغاء تجميد الشاغر'),
    'Vacancy Close': ('Vacancy closed', 'تم إغلاق الشاغر'),
    'Vacancy Cancel': ('Vacancy cancelled', 'تم إلغاء الشاغر'),
    'Vacancy priority changed': ('Vacancy priority updated', 'تم تحديث أولوية الشاغر'),
    'Joined': ('Joining recorded', 'تم تسجيل مباشرة العمل'),
    'No Show': ('Non-attendance for joining recorded', 'تم تسجيل عدم الحضور للمباشرة'),
    'Withdrawn': ('Withdrawal before joining recorded', 'تم تسجيل الانسحاب قبل المباشرة'),
    'Joining voided': ('Joining record voided', 'تم إلغاء تسجيل المباشرة'),
}


def request_update(name, action, *, completed=False):
    if completed:
        return ('Recruitment request completed / اكتمل طلب التوظيف',
            f'{name}: All request vacancies are filled, closed or cancelled. '
            '/ تم شغل جميع شواغر الطلب أو إغلاقها أو إلغاؤها.')
    en, ar = REQUEST_ACTIONS.get(action, ('Request updated', 'تم تحديث الطلب'))
    return 'Recruitment request updated / تم تحديث طلب التوظيف', f'{name}: {en}. / {ar}.'


def vacant_heads(name, skipped):
    # Keep position references useful to HR without dumping principal identities
    # or arbitrary diagnostic data. Full frozen details remain on the request.
    reasons = {
        'Vacant or no enabled linked user': ('Vacant position or no enabled linked account', 'منصب شاغر أو لا يوجد حساب مرتبط مفعّل'),
        'Personal interest: requester, creator, beneficiary or own position': ('Personal-interest exclusion', 'استبعاد لتعارض المصالح'),
    }
    lines = [f'Request {name}: approval positions were skipped. / الطلب {name}: تم تجاوز مناصب اعتماد.']
    for row in skipped:
        en, ar = reasons.get(row.get('reason'), ('Review the recorded route', 'راجع مسار الاعتماد المسجل'))
        position = row.get('position') or '—'
        lines.append(f'Position / المنصب: {position} — {en}. / {ar}.')
    lines.append('Open the request to review the remaining approval route. / افتح الطلب لمراجعة مسار الاعتماد المتبقي.')
    return 'Vacant approval position / تجاوز منصب اعتماد', '\n'.join(lines)


def vacancy_assignment(name):
    return ('Vacancy assigned / تم إسناد شاغر إليك',
        f'Vacancy {name}: your recruitment team assignment was updated. '
        f'/ الشاغر {name}: تم تحديث إسنادك في فريق التوظيف.')


def application_assignment():
    return ('Application assignment updated / تم تحديث إسناد طلب ترشح',
        'Open the scoped application queue to review your assigned work. '
        '/ افتح قائمة طلبات الترشح ضمن صلاحياتك لمراجعة المهام المسندة إليك.')


def vacancy_batch_assignment():
    return ('Recruitment assignments updated / تم تحديث إسنادات التوظيف',
        'Your vacancy team assignments were updated. Open Vacancies to review your current permitted work. '
        '/ تم تحديث إسناداتك في فرق التوظيف. افتح الشواغر لمراجعة العمل المتاح ضمن صلاحياتك الحالية.')
