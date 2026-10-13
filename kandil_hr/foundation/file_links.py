"""Bounded File/child link resolution shared by strict reads and SQL listing.

Native File permissions remain additional constraints. Query guards run before
pagination and never enumerate allowed HR documents into Python lists.
"""
import frappe

MAX_DEPTH = 4
UNRESOLVED = ('__unresolved_attachment__', '')


def child_binding(kind, row):
    if not row or not row.parenttype or not row.parent or not row.parentfield:
        return False
    if not frappe.db.exists('DocType',row.parenttype):
        return False
    field=frappe.get_meta(row.parenttype).get_field(row.parentfield)
    return bool(field and field.fieldtype in ('Table','Table MultiSelect') and field.options==kind)


def resolve(kind, name, depth=0, user=None):
    from kandil_hr.foundation.security import protected_attachment
    seen=set()
    for _ in range(depth,MAX_DEPTH+1):
        if not kind and not name:return None
        if not kind or not name or (kind,name) in seen:return UNRESOLVED
        seen.add((kind,name))
        if not frappe.db.exists('DocType',kind):return UNRESOLVED
        if kind=='File':
            if user and not file_reference(name,user):return UNRESOLVED
            row=frappe.db.get_value('File',name,['attached_to_doctype','attached_to_name'],as_dict=True)
            if not row:return UNRESOLVED
            kind,name=row.attached_to_doctype,row.attached_to_name
            continue
        meta=frappe.get_meta(kind)
        if meta.istable:
            row=frappe.db.get_value(kind,name,['parenttype','parent','parentfield'],as_dict=True)
            if not child_binding(kind,row):return UNRESOLVED
            kind,name=row.parenttype,row.parent
            continue
        if kind in ('Report','Prepared Report'):
            from kandil_hr.foundation.reports import sensitive_report
            report=frappe.db.get_value(kind,name,'report_name') if kind=='Prepared Report' else name
            if not frappe.db.exists(kind,name):return UNRESOLVED
            return (kind,name) if sensitive_report(report,include_builder=True) else None
        if protected_attachment(kind):
            return (kind,name) if frappe.db.exists(kind,name) else UNRESOLVED
        return None
    return UNRESOLVED


def file_reference(name, user):
    from kandil_hr.recruitment.history_access import user_permissions
    return bool(frappe.db.sql(f"SELECT name FROM `tabFile` WHERE name=%s AND ({user_permissions('File',user)})",(name,)))


def table(kind):
    # Identifiers come from current DocType metadata, not client values.
    return '`tab'+kind.replace('`','``')+'`'


def edges(child_types,user):
    """Only tables present in attachment chains are scanned; new types fail closed.

    Metadata is looked up again on each permission query. No persisted or shared
    allow-list can outlive a child reparent or newly introduced attachment type.
    """
    from kandil_hr.recruitment.history_access import user_permissions
    parts=[f"SELECT 'File' AS kind,name,attached_to_doctype AS parenttype,attached_to_name AS parent FROM `tabFile` WHERE ({user_permissions('File',user)})"]
    active=set(frappe.db.sql("SELECT DISTINCT attached_to_doctype FROM `tabFile` WHERE attached_to_doctype IS NOT NULL",pluck=True)) & child_types
    done=set()
    for _ in range(MAX_DEPTH+1):
        pending=active-done
        if not pending:break
        for kind in sorted(pending):
            done.add(kind)
            parent_types=frappe.db.sql(f'SELECT DISTINCT parenttype FROM {table(kind)} WHERE parenttype IS NOT NULL',pluck=True)
            active.update(set(parent_types)&child_types)
            bindings=[]
            for parent in parent_types:
                if not frappe.db.exists('DocType',parent):continue
                fields=[f.fieldname for f in frappe.get_meta(parent).get_table_fields() if f.options==kind]
                for field in fields:
                    bindings.append(f'(parenttype={frappe.db.escape(parent)} AND parentfield={frappe.db.escape(field)})')
            if bindings:
                parts.append(f"SELECT {frappe.db.escape(kind)} AS kind,name,parenttype,parent FROM {table(kind)} WHERE "+' OR '.join(bindings))
    return ' UNION ALL '.join(parts)


def condition(user):
    from kandil_hr.foundation.security import direct_file_query
    from kandil_hr.recruitment.history_access import user_permissions
    metadata=frappe.get_all('DocType',fields=['name','istable','is_virtual'])
    children={d.name for d in metadata if d.istable and not d.is_virtual}
    terminal={d.name for d in metadata if not d.istable and d.name!='File'}
    known=','.join(frappe.db.escape(k) for k in sorted(terminal))
    kind='kandil_file_walk.kind';name='kandil_file_walk.target'
    roots=direct_file_query(user,kind,name)
    # Missing nodes, cycles and unresolved depth limits have no allowed terminal.
    # A URL shared with an inaccessible alias is inaccessible through every alias.
    return f"""`tabFile`.name IN (
      WITH RECURSIVE kandil_file_edges AS ({edges(children,user)}),
      kandil_file_walk AS (
        SELECT name AS origin,attached_to_doctype AS kind,attached_to_name AS target,0 AS depth FROM `tabFile` WHERE ({user_permissions('File',user)})
        UNION ALL
        SELECT w.origin,e.parenttype,e.parent,w.depth+1 FROM kandil_file_walk w
          INNER JOIN kandil_file_edges e ON e.kind=w.kind AND e.name=w.target WHERE w.depth<{MAX_DEPTH}
      ), kandil_file_allowed AS (
        SELECT DISTINCT origin FROM kandil_file_walk WHERE
          ((COALESCE({kind},'')='' AND COALESCE({name},'')='') OR {kind} IN ({known})) AND ({roots or '1=1'})
      )
      SELECT f.name FROM `tabFile` f INNER JOIN kandil_file_allowed a ON a.origin=f.name
      WHERE COALESCE(f.file_url,'')='' OR NOT EXISTS (
        SELECT 1 FROM `tabFile` same_content LEFT JOIN kandil_file_allowed permitted ON permitted.origin=same_content.name
        WHERE same_content.file_url=f.file_url AND permitted.origin IS NULL)
    )"""
