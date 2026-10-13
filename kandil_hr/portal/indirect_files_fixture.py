"""CLI-only synthetic legacy attachment graphs for ordinary HTTP sessions."""
from pathlib import Path

import frappe

from kandil_hr.portal import fixture, history_files_fixture as base
from kandil_hr.portal.route_preview_fixture import load
from kandil_hr.recruitment.browser_fixture import guard
from kandil_hr.recruitment.concurrency_fixture import persist
from kandil_hr.recruitment.test_commands import acting_as


def prepare(run_id):
    guard(run_id)
    base.prepare(run_id)
    data = load(run_id)
    owner = data['users']['requester']['email']
    entries = {}

    def make(key, kind=None, target=None, url=None, content=None):
        name = 'synthetic-indirect-' + run_id + '-' + key
        value = content or 'Synthetic indirect attachment ' + run_id + ' ' + key
        doc = frappe.get_doc(dict(doctype='File', name=name, file_name=name+'.txt',
            file_url=url or '/private/files/'+name+'.txt', is_private=1, is_folder=0,
            attached_to_doctype=kind, attached_to_name=target))
        # Model retained legacy records, including invalid graph links. These
        # inserts are only reachable through the opted-in synthetic CLI guard.
        with acting_as(owner):
            doc.db_insert()
        if kind is None:
            frappe.db.set_value('File', doc.name, 'attached_to_doctype', None)
        if frappe.db.get_value('File', doc.name, 'owner') != owner:
            raise RuntimeError('Synthetic attachment ownership mismatch')
        if not url:
            Path(frappe.get_site_path('private', 'files', doc.file_name)).write_text(value)
        entries[key] = dict(name=doc.name, url=doc.file_url, file_name=doc.file_name,
            content=value, attached_to_doctype=kind, attached_to_name=target)
        return doc.name

    parent = data['history_file']['file']
    for depth in range(1, 5):
        parent = make('chain'+str(depth), 'File', parent)
    make('too_deep', 'File', parent)
    request = frappe.get_doc('Kandil Hiring Request', data['history_file']['request'])
    make('child', 'Kandil Request Line', request.lines[0].name)
    make('child_chain', 'File', entries['child']['name'])
    make('alias', url=data['history_file']['file_url'], content=data['history_file']['content'])
    make('ordinary')
    make('orphan', 'File', 'missing-synthetic-file-'+run_id)
    make('cycle1', 'File', 'synthetic-indirect-'+run_id+'-cycle2')
    make('cycle2', 'File', entries['cycle1']['name'])
    data['indirect_files'] = entries
    persist(fixture.path_for(run_id), data)
    frappe.db.commit()
    return dict(run_id=run_id, prepared=True, files=len(entries), credentials='private-file-only')


def restrict(run_id):
    guard(run_id)
    return base.restrict(run_id)


def revoke(run_id):
    data = load(run_id)
    for name in frappe.get_all('Kandil Access Grant', filters=dict(company=data['company'],
            user=data['users']['requester']['email'], revoked=0), pluck='name'):
        grant = frappe.get_doc('Kandil Access Grant', name)
        grant.revoked = 1
        grant.save(ignore_permissions=True)
    frappe.db.commit()
    return dict(run_id=run_id, requester_hr_access_revoked=True)


def inspect(run_id):
    data = load(run_id)
    original = base.inspect(run_id)
    unchanged = original['snapshot_unchanged'] and original['file_unchanged']
    owner = data['users']['requester']['email']
    owner_verified = frappe.db.get_value('File', data['history_file']['file'], 'owner') == owner
    for entry in data['indirect_files'].values():
        doc = frappe.get_doc('File', entry['name'])
        unchanged = unchanged and doc.file_url == entry['url'] and doc.file_name == entry['file_name']
        unchanged = unchanged and (doc.attached_to_doctype or None) == entry['attached_to_doctype']
        unchanged = unchanged and (doc.attached_to_name or None) == entry['attached_to_name']
        unchanged = unchanged and doc.is_private == 1
        unchanged = unchanged and Path(frappe.get_site_path('private', 'files',
            entry['url'].rsplit('/', 1)[-1])).read_text() == entry['content']
        owner_verified = owner_verified and doc.owner == owner
    return dict(run_id=run_id, unchanged=bool(unchanged), owner_verified=bool(owner_verified))


def cleanup(run_id):
    guard(run_id)
    return base.cleanup(run_id)
