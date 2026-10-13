"""Explicit basic person profile schema; sensitive data and consent are separate."""
import json

import frappe
from frappe import _
from frappe.utils import validate_email_address

TEXT = ('full_name','email_id','phone_number','governorate','city','education','specialization',
        'current_employer','current_title','language')
NUMERIC = {'graduation_year': (1900, 2200), 'experience_years': (0, 80), 'notice_days': (0, 365)}
KEYS = (*TEXT, *NUMERIC)


def normalize(value):
    if isinstance(value,str):
        if len(value)>8000: frappe.throw(_('Candidate profile is too large.'))
        value=frappe.parse_json(value)
    if not isinstance(value,dict) or set(value)-set(KEYS):
        frappe.throw(_('The candidate profile contains unsupported fields.'))
    result={}
    for key in TEXT:
        item=value.get(key,'')
        if not isinstance(item,str) or len(item.strip())>140:
            frappe.throw(_('Candidate profile text must contain at most 140 characters.'))
        result[key]=item.strip()
    for key,(low,high) in NUMERIC.items():
        item=value.get(key)
        if item in (None,''):
            result[key]=None
        elif type(item) is not int or not low<=item<=high:
            frappe.throw(_('Enter a valid whole-number profile value, or leave it unknown.'))
        else: result[key]=item
    if result['email_id']: validate_email_address(result['email_id'],True)
    if result['language'] not in ('','ar','en'): frappe.throw(_('Choose Arabic or English.'))
    return result


def dump(value):
    return json.dumps(normalize(value),ensure_ascii=False,sort_keys=True)
