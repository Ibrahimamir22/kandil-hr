import sys,json
sys.argv=['helpers','SKIP']
import test_hr_functional as t
try:
 print(t.users['employee_a'].create('Kandil Hiring Request',dict(company=t.F['company'],department=t.F['department'],title='DEBUG test',lines=[dict(capacity=json.loads((t.OUT/'pilot-state.json').read_text())['a'],requested_qty=1)])))
except t.APIError as e:print(json.dumps(e.data,indent=2))
