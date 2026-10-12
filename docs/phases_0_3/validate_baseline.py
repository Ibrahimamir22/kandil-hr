#!/usr/bin/env python3
"""Read-only baseline/translation checks; no Frappe import or database access.

python3 docs/phases_0_3/validate_baseline.py [--reference /path/to/reference]
Missing translations are reported, not silently considered functional failures.
Use --strict-translations to require complete coverage of statically extracted keys.
"""
import argparse
import ast
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def placeholders(value):
    return sorted(re.findall(r"\{[^{}]*\}|%\([^)]+\)[a-z]|%[sdif]", value))


def extract_strings():
    keys = set()
    raw_messages = []
    for path in (ROOT / 'kandil_hr').rglob('*.json'):
        data = json.loads(path.read_text())
        if not isinstance(data, dict):
            continue
        if data.get('doctype') == 'DocType':
            keys.add(data['name'])
        for field in data.get('fields', []):
            if field.get('label'):
                keys.add(field['label'])
            if field.get('description'):
                keys.add(field['description'])
            if field.get('fieldtype') == 'Select':
                keys.update(filter(None, field.get('options', '').split('\n')))
    for path in (ROOT / 'kandil_hr').rglob('*.py'):
        if path.name.startswith('test_') or path.stem.endswith(('_tests', '_fixture')) or 'tests' in path.parts:
            continue  # Synthetic failure messages are not shipped interface strings.
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, ast.Constant) and key.value in {'label', 'description'} and isinstance(value, ast.Constant) and isinstance(value.value, str):
                        keys.add(value.value)
            if not isinstance(node, ast.Call) or not node.args:
                continue
            name = node.func.id if isinstance(node.func, ast.Name) else node.func.attr if isinstance(node.func, ast.Attribute) else ''
            value = node.args[0]
            if name == 'field' and len(node.args) > 1 and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str):
                keys.add(node.args[1].value)
            if name in {'_', 'throw', 'deny', 'fail', 'ValueError', 'CSVImportError'} and isinstance(value, ast.Constant) and isinstance(value.value, str):
                keys.add(value.value)
                if name in {'throw', 'deny'}:
                    raw_messages.append({'file': str(path.relative_to(ROOT)), 'line': node.lineno, 'call': name})
    for extension in ('*.js', '*.html'):
        for path in (ROOT / 'kandil_hr').rglob(extension):
            keys.update(re.findall(r'''(?:__|_)\(\s*["']([^"']+)["']''', path.read_text()))
    return keys, raw_messages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--strict-translations', action='store_true')
    args = parser.parse_args()
    baseline = json.loads((Path(__file__).parent / 'requirements-baseline.json').read_text())
    requirements = baseline['requirements']
    ids = [r['id'] for r in requirements]
    assert len(ids) == 98 and len(set(ids)) == 98, 'Expected all 98 unique baseline IDs'
    selected = [r for r in requirements if r['in_batch']]
    assert len(selected) == 40
    assert all(r['phase'] in {'P0', 'P1', 'P2', 'P3'} for r in selected)
    cases = [case for r in selected for case in r['acceptance_cases']]
    assert len(cases) == 80 and len({c['id'] for c in cases}) == 80
    contract = [{'id': r['id'], 'phase': r['phase'], 'in_batch': r['in_batch'], 'cases': [{'id': c['id'], 'expected': c['expected']} for c in r['acceptance_cases']]} for r in requirements]
    contract_hash = hashlib.sha256(json.dumps(contract, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert contract_hash == 'c2b7765f0f4bb647378a39a952f9c2ad1353046648cd27572fe5efb3a0dea2c0', 'Baseline IDs, phases, case IDs and exact expected outcomes must remain unchanged'
    assert all(c['status'] in {'not_run', 'passed', 'partial', 'failed', 'blocked'} for c in cases), 'Unsupported acceptance status'
    for case in cases:
        if case['status'] == 'passed':
            assert case.get('commit') and case.get('checked_at') and case.get('evidence'), case['id'] + ': passed requires commit, checked_at and evidence'

    assert all(r['target'] and r['delivery_owner'] and r['acceptance_cases'] for r in requirements)
    if args.reference:
        for filename, expected in baseline['reference']['source_files'].items():
            assert hashlib.sha256((args.reference / filename).read_bytes()).hexdigest() == expected, filename + ' changed from pinned baseline'
    rows = list(csv.reader((ROOT / 'kandil_hr/translations/ar.csv').open()))
    assert all(len(row) == 2 and all(row) for row in rows), 'Translation rows must have two nonempty cells'
    assert len(rows) == len({row[0] for row in rows}), 'Duplicate translation source'
    assert all(placeholders(row[0]) == placeholders(row[1]) for row in rows), 'Translation placeholder mismatch'
    catalogue = dict(rows)
    keys, raw_messages = extract_strings()
    missing = sorted(keys - catalogue.keys())
    result = {'baseline': 'PASS', 'requirements': len(ids), 'batch_requirements': len(selected), 'batch_cases': len(cases), 'source_hashes_checked': bool(args.reference), 'translation_csv': 'PASS', 'translation_rows': len(rows), 'extracted_keys': len(keys), 'missing_translation_keys': missing, 'raw_throw_or_deny_calls_to_review': raw_messages, 'limits': 'Static extraction cannot prove runtime localization, RTL, PDF layout or dynamic/interpolated messages. A translated key still needs a runtime translation call; deny() may translate centrally.'}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.strict_translations and missing:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
