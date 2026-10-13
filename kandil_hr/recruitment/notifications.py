"""Minimal requester notices inside the already-authorized domain transaction.

An HR-created amendment has its own owner/access rules. Notify the original
requester against the original record without exposing the child's ID, reason,
notes, approver identities or content, and without changing its baseline version.
"""
import frappe

from kandil_hr.foundation.outbox import enqueue


AMENDMENT_ACTIONS = {
    "Amendment created": ("Amendment proposed", "تم اقتراح تعديل"),
    "Submitted": ("Amendment submitted for approval", "تم إرسال التعديل للاعتماد"),
    "Approve": ("Amendment approval recorded", "تم تسجيل اعتماد للتعديل"),
    "Return": ("Amendment returned for revision", "تمت إعادة التعديل للمراجعة"),
    "Reject": ("Amendment rejected", "تم رفض التعديل"),
    "Revised": ("Amendment draft revised", "تمت مراجعة مسودة التعديل"),
    "HR review": ("Amendment reviewed by HR", "تمت مراجعة التعديل بواسطة الموارد البشرية"),
    "Routed to CEO": ("Amendment routed to CEO", "تم توجيه التعديل إلى الرئيس التنفيذي"),
    "Cancelled": ("Amendment cancelled", "تم إلغاء التعديل"),
}


def amendment_update(doc, action):
    if not doc.amends:
        return None
    parent = frappe.get_doc("Kandil Hiring Request", doc.amends, for_update=True)
    if parent.company != doc.company or parent.department != doc.department:
        raise ValueError("Amendment notification scope differs from original request")
    # The child's normal save notification already reaches this same person.
    # Creation does not call save(), so always issue the creation notice.
    if action != "Amendment created" and parent.requested_by == doc.requested_by:
        return None
    en, ar = AMENDMENT_ACTIONS.get(action, ("Amendment updated", "تم تحديث التعديل"))
    return enqueue(
        f"{parent.name}:amendment:{doc.name}:{doc.modified}:{action}:{parent.requested_by}",
        parent.requested_by, f"{en} / {ar}",
        f"{parent.name}: {en}. / {ar}.", parent.doctype, parent.name,
    )


def skipped_route(doc):
    return enqueue(
        f"{doc.name}:{doc.revision}:skipped-route:{doc.requested_by}", doc.requested_by,
        "Approval route updated / تم تحديث مسار الاعتماد",
        f"{doc.name}: Unavailable approval positions were skipped; the remaining route is recorded on your request. "
        "/ تم تجاوز مناصب اعتماد غير متاحة؛ المسار المتبقي مسجل في طلبك.",
        doc.doctype, doc.name,
    )
