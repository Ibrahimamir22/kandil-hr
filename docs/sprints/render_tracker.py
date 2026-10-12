#!/usr/bin/env python3
"""Validate local sprint data and generate a standalone dashboard. No application/site mutation."""
import json
import argparse
from pathlib import Path
from collections import Counter
HERE=Path(__file__).resolve().parent
ROOT=next((p for p in HERE.parents if (p/'05_Deliverables').is_dir()), None)
parser=argparse.ArgumentParser()
parser.add_argument('--output', type=Path, help='Output folder; defaults to Kandil deliverables or a local generated folder')
args=parser.parse_args()
OUT=args.output or (ROOT/'05_Deliverables/Kandil_HR_Sprint_Tracker_2026-10-12' if ROOT else HERE/'_generated')
d=json.loads((HERE/'tracker.json').read_text())
cases=json.loads((HERE/'acceptance-results.json').read_text());d['acceptance']=cases
ids={t['id'] for t in d['tasks']};assert len(ids)==len(d['tasks'])
for t in d['tasks']:
 assert set(t['depends'])<=ids
 assert t['status'] in {'verified','draft','planned','needs_decision','in_progress','failed','blocked'}
 if t['status']=='verified':assert t['evidence']
visiting=set();visited=set();byid={t['id']:t for t in d['tasks']}
def visit(i):
 assert i not in visiting, 'Dependency cycle: '+i
 if i in visited:return
 visiting.add(i)
 for dep in byid[i]['depends']:visit(dep)
 visiting.remove(i);visited.add(i)
for i in ids:visit(i)
baseline=json.loads((HERE.parent/'phases_0_3/requirements-baseline.json').read_text())
selected=[r for r in baseline['requirements'] if r['in_batch']]
assert len(cases)==80 and len({c['id'] for c in cases})==80
assert {c['id'] for c in cases}=={c['id'] for r in selected for c in r['acceptance_cases']}
assert {r['id'] for r in selected}=={r for t in d['tasks'] for r in t['requirement_ids']}
for c in cases:
 assert c['status'] in {'not_run','passed','partial','failed','blocked'}
 if c['status']=='passed':assert c['evidence'] and c['commit'] and c['checked_at']
dump=json.dumps(d,ensure_ascii=False)
html=(HERE/'dashboard.html').read_text().replace('/*__DATA__*/',dump.replace('</','<\\/'))
(OUT/'dist').mkdir(parents=True,exist_ok=True)
(OUT/'dist/index.html').write_text(html)
(OUT/'tracker.json').write_text(json.dumps(d,ensure_ascii=False,indent=2))
(OUT/'SPRINT_PLAN.md').write_text((HERE/'SPRINT_PLAN.md').read_text())
print(json.dumps({'tasks':len(ids),'task_states':dict(Counter(t['status'] for t in d['tasks'])),'requirements':len(selected),'cases':len(cases),'passed_cases':sum(c['status']=='passed' for c in cases),'dependency_graph':'acyclic','output':str(OUT/'dist/index.html')},indent=2))
