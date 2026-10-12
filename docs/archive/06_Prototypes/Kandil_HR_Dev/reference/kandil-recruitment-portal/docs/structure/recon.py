# Reconcile the Jobs sheet (Excel) with the Korn Ferry org charts (PPT) into units / positions / jobs.
import csv, re, json, collections

rows = list(csv.reader(open('jobs.csv')))

def nk(s):
    """normalized key for matching (not for display)"""
    s = (s or '').strip()
    s = re.sub('[ً-ْـ]', '', s)
    s = s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
    s = s.replace('الشيون', 'الشوون')
    s = re.sub(r'\s*-\s*', ' - ', s)
    s = re.sub(r'\s+', ' ', s)
    s = s.replace('cnc', 'CNC')
    return s.strip().replace(' ', '')

def clean(s):
    s = (s or '').strip()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'\s*-\s*', ' - ', s)
    return s.replace('cnc', 'CNC')

SECTOR_FIX = {'سلسله الامداد': 'سلسلة الإمداد', 'الجوده': 'الجودة', 'الشئون القانونية': 'الشؤون القانونية'}
SECTOR_CODE = {'المالي والإداري': 'FAD', 'الموارد البشرية': 'HRS', 'التجاري': 'COM', 'العمليات': 'OPS',
               'سلسلة الإمداد': 'SCM', 'تصميم وتطوير المنتج': 'RND', 'السلامة و الصحة المهنية': 'HSE',
               'الجودة': 'QUA', 'المراجعة الداخلية': 'IAD', 'الشؤون القانونية': 'LEG'}

P = []
for i, r in enumerate(rows):
    sector, dept, sub, title, mgr = [clean(x) for x in r[:5]]; code = r[5].strip()
    sector = SECTOR_FIX.get(sector, sector)
    P.append(dict(i=i, old=code, sector=sector, dept=dept, sub=sub, title=title, mgr=mgr, line=i + 2))

# ---------- 1. resolve each position's manager (by title, nearest scope first) ----------
def scope_order(p, q):
    if q is p: return 99
    if q['sector'] != p['sector']: return 9
    if q['dept'] == p['dept'] and q['sub'] == p['sub']: return 0
    if q['dept'] == p['dept']: return 1
    return 2

MGR_ALIASES = {  # manager titles written differently in the Excel
    nk('مدير تكنولوجيا المعلومات والإتصالات'): nk('مدير تكنولوجيا المعلومات'),
    nk('رئيس قسم التدريب والتوظيف'): nk('رئيس قسم التدريب و التطوير'),
    nk('رئيس قسم الاداره الاضاءه الفندقيه'): nk('رئيس قسم الإضاءة الفندقية'),
    nk('رئيس قسم الإجتياجات المحلية'): nk('رئيس قسم الإحتياجات المحلية'),
    nk('مدير انتاج العبور'): nk('مدير الإنتاج'),
    nk('مشرف رقابة الجودة'): nk('مشرف الجودة'),
    nk('رئيس قسم الاجور والمزايا'): nk('رئيس قسم الاجور والمزايا'),
    nk('مدير البحث  و التطوير'): nk('مدير البحث و التطوير'),
    nk('مدير الشئون القانونية'): nk('مدير الشؤون القانونية'),
    nk('رئيس الانتاج'): nk('رئيس الإنتاج'),
}
issues = []
def issue(kind, text, rec=''):
    issues.append(dict(kind=kind, text=text, rec=rec))

for p in P:
    m = nk(p['mgr'])
    if m in (nk('الرئيس التنفيذي'), nk('المدير التنفيذي')):
        p['mgr_ref'] = 'CEO'
        if m == nk('المدير التنفيذي'):
            issue('تعارض', f'"{p["title"]}" ({p["old"]}) مكتوب إنه يتبع "المدير التنفيذي"، والباقي بيتبعوا "الرئيس التنفيذي".',
                  'اعتبرته الرئيس التنفيذي.')
        continue
    m = MGR_ALIASES.get(m, m)
    cands = [q for q in P if q is not p and (nk(q['title']) == m or nk(q['title']).split('-')[0] == m)]
    if not cands:
        # partial: "مشرف تجهيز" when the manager is "مشرف تجهيز - الإضاءة الفندقية"
        cands = [q for q in P if q is not p and nk(q['title']).startswith(m + '-')]
    if not cands:
        p['mgr_ref'] = None
        issue('خطأ', f'"{p["title"]}" ({p["old"]}) بيتبع "{p["mgr"]}"، والوظيفة دي مش موجودة في الملف.', 'ربطته بمدير الوحدة.')
        continue
    best = min(scope_order(p, q) for q in cands)
    near = [q for q in cands if scope_order(p, q) == best]
    if len(near) > 1:
        # prefer the one whose title carries the same product-line suffix
        suf = p['title'].split(' - ')[1] if ' - ' in p['title'] else ''
        pick = [q for q in near if suf and suf in q['title']] or near
        near = pick[:1]
    p['mgr_ref'] = near[0]['i']

# explicit data errors spotted by reading the sheet
for p in P:
    if p['mgr_ref'] == p['i']:
        p['mgr_ref'] = None
        issue('خطأ', f'"{p["title"]}" ({p["old"]}) مكتوب إنه بيتبع نفسه.', 'ربطته بالمشرف المناسب.')
fix_cnc = [p for p in P if p['old'] == 'OPS-035'][0]
if fix_cnc['mgr_ref'] in (None, fix_cnc['i']) or P[fix_cnc['mgr_ref']]['title'] == fix_cnc['title']:
    sup = [q for q in P if q['old'] == 'OPS-034'][0]
    fix_cnc['mgr_ref'] = sup['i']
    issue('خطأ', '"فني CNC" (OPS-035) في مصنع العبور مكتوب إنه بيتبع "فني CNC".', 'ربطته بـ "مشرف CNC" (OPS-034) زي الهيكل في الباوربوينت.')

json.dump(P, open('stage1.json', 'w'), ensure_ascii=False, indent=0)
json.dump(issues, open('issues1.json', 'w'), ensure_ascii=False, indent=0)
print(len(P), 'positions;', len(issues), 'issues')
for x in issues: print(x)
unres = [p for p in P if p['mgr_ref'] is None]
print('unresolved', [(p['old'], p['title'], p['mgr']) for p in unres])

# ======================= stage 2: units =======================
issues = [x for x in issues if 'رئيس قطاع العمليات' not in x['text']]
# operations sector head is missing from the Excel but exists in the PPT (company chart)
ops_head = dict(i=len(P), old='', sector='العمليات', dept='', sub='', title='رئيس قطاع العمليات', mgr='الرئيس التنفيذي',
                line=0, mgr_ref='CEO', added=True)
P.append(ops_head)
for p in P:
    if p['old'] in ('OPS-001', 'OPS-064', 'OPS-114'): p['mgr_ref'] = ops_head['i']
issue('ناقص', '"رئيس قطاع العمليات" مش موجود في ملف الإكسيل، رغم إن مديرين المصانع الـ 3 بيتبعوه، وهو موجود في هيكل الباوربوينت.',
      'ضفته كوظيفة جديدة (من غير كود قديم) ومدير لقطاع العمليات.')

UNITS = {}   # key -> dict(key, name, type, parent, members:[pi], head:None)
TYPES = ['COMPANY', 'SECTOR', 'DEPARTMENT', 'SECTION', 'SUB_UNIT']
def unit(key, name, typ, parent):
    if key not in UNITS: UNITS[key] = dict(key=key, name=name, type=typ, parent=parent, members=[], head=None, order=len(UNITS))
    return UNITS[key]
unit('C', 'قنديل مصر', 'COMPANY', None)
sector_head = {p['sector']: p for p in P if p['mgr_ref'] == 'CEO'}
for p in P:
    s = unit('S|' + p['sector'], p['sector'], 'SECTOR', 'C')
    head_dept = sector_head[p['sector']]['dept']
    if not p['dept'] or p['dept'] == head_dept:
        u = s
    else:
        u = unit('D|' + p['sector'] + '|' + p['dept'], p['dept'], 'DEPARTMENT', s['key'])
        if p['sub'] and nk(p['sub']) != nk(p['dept']):
            u = unit('X|' + p['sector'] + '|' + p['dept'] + '|' + p['sub'], p['sub'], 'SECTION', u['key'])
    p['unit'] = u['key']; u['members'].append(p['i'])

LEADER = re.compile(r'^(مدير|رئيس|مشرف|منسق)')
def tops(u):
    mem = set(u['members'])
    return [i for i in u['members'] if P[i]['mgr_ref'] == 'CEO' or P[i]['mgr_ref'] not in mem]

def flatten_or_head(u):
    t = tops(u)
    leaders = [i for i in t if LEADER.search(P[i]['title'])]
    if len(leaders) == 1 and all(P[i]['mgr_ref'] == leaders[0] or P[i]['mgr_ref'] in u['members'] for i in u['members'] if i != leaders[0]):
        u['head'] = leaders[0]; return True
    return False

# sectors / departments / sections: set heads; flatten leaderless units into their parent
for k in sorted(UNITS, key=lambda k: -TYPES.index(UNITS[k]['type'])):
    u = UNITS[k]
    if u['type'] == 'COMPANY': continue
    if u['type'] == 'SECTOR':
        u['head'] = sector_head[u['name']]['i']; continue
    if not flatten_or_head(u):
        par = UNITS[u['parent']]
        names = '، '.join(P[i]['title'] for i in u['members'])
        issue('تبسيط', f'"{u["name"]}" ({ {"DEPARTMENT":"إدارة","SECTION":"قسم"}[u["type"]] }) مالهاش مدير/رئيس/مشرف في الملف — فيها: {names}.',
              f'ما عملتهاش وحدة؛ الوظايف دي اتحطت مباشرة في "{par["name"]}".')
        for i in u['members']: P[i]['unit'] = par['key']; par['members'].append(i)
        del UNITS[k]

# promote "رئيس قسم X" (not already a unit head) into a child unit with its whole sub-tree
def subtree(i):
    out = [i]
    for q in P:
        if q['mgr_ref'] == i: out += subtree(q['i'])
    return out
changed = True
while changed:
    changed = False
    for p in P:
        if not p['title'].startswith('رئيس قسم'): continue
        u = UNITS[p['unit']]
        if u['head'] == p['i'] or TYPES.index(u['type']) >= 4: continue
        name = re.sub(r'^رئيس قسم\s*', '', p['title']).strip()
        name = re.sub(r'\s*\(.*\)$', '', name)
        nu = unit(p['unit'] + '>' + name, name, TYPES[TYPES.index(u['type']) + 1], u['key'])
        moved = [i for i in subtree(p['i']) if P[i]['unit'] == u['key']]
        for i in moved:
            u['members'].remove(i); nu['members'].append(i); P[i]['unit'] = nu['key']
        nu['head'] = p['i']
        changed = True
        break

promoted = [u for u in UNITS.values() if '>' in u['key']]
issue('مستوى القسم', 'الملف ما فيهوش أقسام لكل وظيفة "رئيس قسم"، فعملت لكل واحدة قسم تحتها، واللي بيتبعوه اتنقلوا جواه (زي الباوربوينت): ' +
      '، '.join(f'{UNITS[u["parent"]]["name"]} ← {u["name"]}' for u in promoted),
      'راجع أسماء الأقسام دي.')

def path(u):
    out = []
    while u: out.append(u); u = UNITS.get(u['parent']) if u['parent'] else None
    return list(reversed(out))
for k in sorted(UNITS, key=lambda k: [x['order'] for x in path(UNITS[k])]):
    u = UNITS[k]
    print('  ' * TYPES.index(u['type']) + f"{u['name']} [{u['type']}] head={P[u['head']]['title'] if u['head'] is not None else '-'} n={len(u['members'])}")
json.dump(dict(P=P, UNITS=UNITS), open('stage2.json', 'w'), ensure_ascii=False)

# ======================= stage 3: spelling, jobs, codes, locations =======================
WORD_FIX = [('الاداري', 'الإداري'), ('الادارية', 'الإدارية'), ('الادارى', 'الإداري'), ('ادارى', 'إداري'), ('الامن', 'الأمن'), ('امن', 'أمن'),
            ('انشاص', 'إنشاص'), ('أنشاص', 'إنشاص'), ('الانتاج', 'الإنتاج'), ('الأنتاج', 'الإنتاج'), ('البشريه', 'البشرية'),
            ('منطقه', 'منطقة'), ('خدمه', 'خدمة'), ('مابعد', 'ما بعد'), ('النمطى', 'النمطي'), ('نمطى', 'نمطي'), ('محلى', 'محلي'),
            ('جغرافى', 'جغرافي'), ('حكومى', 'حكومي'), ('المحتوي', 'المحتوى'), ('محتوي', 'محتوى'), ('شئون', 'شؤون'), ('الشئون', 'الشؤون'),
            ('الاجور', 'الأجور'), ('اجور', 'أجور'), ('الموزيعين', 'الموزعين'), ('الإحتياجات', 'الاحتياجات'), ('إحتياجات', 'احتياجات'),
            ('الإتصالات', 'الاتصالات'), ('اخصائي', 'أخصائي'), ('امين', 'أمين'), ('انسانيه', 'إنسانية'), ('الاثاث', 'الأثاث'),
            ('ارجون', 'أرجون'), ('صنفره', 'صنفرة'), ('خراطه', 'خراطة'), ('روباسيه', 'روباسية'), ('تنايه', 'تناية'), ('بناطه', 'بنطة'),
            ('فرشه', 'فرشة'), ('فرشاه', 'فرشاة'), ('كرتنه', 'كرتنة'), ('فنى', 'فني'), ('باتينه', 'باتينة'), ('فريزه', 'فريزة'),
            ('ارضيه', 'أرضية'), ('الجوده', 'الجودة'), ('الصناعات و التصنيع', 'الصناعات والتصنيع'), ('التربيط و الفرشة', 'التربيط والفرشة'),
            ('إداريPVD', 'إداري PVD')]
def tidy(s):
    s = clean(s)
    for a, b in WORD_FIX: s = re.sub(r'(?<![؀-ۿ])' + re.escape(a) + r'(?![؀-ۿ])', b, s)
    s = re.sub(r'\s+و\s+', ' و', s)          # "المالي و الاداري" -> "المالي والإداري"
    return s.strip()
UNIT_RENAME = {'المنتج الخاص': 'مصنع المنتج الخاص', 'المحلي': 'الوكلاء والموزعين', 'النظم والبنية': 'النظم والبنية التحتية'}
for u in UNITS.values():
    n = tidy(u['name'])
    if u['type'] == 'DEPARTMENT' and n == 'المنتج الخاص' and 'العمليات' in u['key']: n = 'مصنع المنتج الخاص'
    elif n in UNIT_RENAME and n != 'المنتج الخاص': n = UNIT_RENAME[n]
    u['disp'] = n
for p in P: p['ptitle'] = tidy(p['title'])
issue('إملاء', 'وحّدت كتابة الأسماء: الهمزات (إداري، الأمن، إنشاص، الإنتاج، أخصائي)، والتاء المربوطة (البشرية، منطقة، خدمة، فرشة)، و"ى/ي" (نمطي، محلي)، و"شؤون"، ولزق الواو ("المالي والإداري").',
      'الأكواد القديمة محفوظة جنب كل وظيفة، فمفيش حاجة بتضيع. لو في اسم عايزه بشكل معين قولّي.')
issue('تسمية', 'قسم "المحلي" تحت المبيعات بقى اسمه "الوكلاء والموزعين" (اسم رئيس القسم). وإدارة "المنتج الخاص" في العمليات بقت "مصنع المنتج الخاص". و"النظم و البنية" بقت "النظم والبنية التحتية".',
      'لو عايز الأسماء الأصلية قولّي.')

# base job title = position title without the unit / product-line context after " - "
CTX = ['الصناعات والتصنيع', 'الأثاث المعدني', 'الإضاءة الفندقية', 'التربيط والفرشة', 'منتج خاص', 'منتج نمطي', 'صناعي', 'تجاري']
def base_title(t):
    if ' - ' in t:
        a, b = t.split(' - ', 1)
        if b.strip() in CTX: return a.strip()
        if b.strip() == 'معارض': return a.strip() + ' معارض'
    return t
def family(p):
    u = UNITS[p['unit']]; keys = [x['disp'] for x in path(u)]
    sec = p['sector']; t = p['ptitle']
    if sec == 'المالي والإداري':
        if 'تكنولوجيا المعلومات' in keys: return 'ITS'
        if 'الشؤون الإدارية' in keys: return 'ADM'
        return 'ACC'
    if sec == 'الموارد البشرية': return 'HRM'
    if sec == 'التجاري':
        if 'التسويق' in keys: return 'MKT'
        if 'التجهيز والتركيبات' in keys: return 'LOG' if ('نقل' in t or 'سائق' in t) else 'INS'
        return 'SLS'
    if sec == 'العمليات':
        for k, f in (('التصميم', 'DSN'), ('الصيانة', 'MNT'), ('الجودة', 'QLT')):
            if k in keys: return f
        if 'تخطيط' in t: return 'PLN'
        return 'PRD'
    if sec == 'سلسلة الإمداد':
        if 'المخازن' in keys: return 'WHS'
        if 'الاحتياجات' in keys: return 'PUR'
        return 'SCH'
    return {'تصميم وتطوير المنتج': 'RDV', 'السلامة والصحة المهنية': 'OSH', 'السلامة و الصحة المهنية': 'OSH', 'الجودة': 'QLT',
            'المراجعة الداخلية': 'IAU', 'الشؤون القانونية': 'LGL'}[sec]
FAMILY_AR = {'ACC': 'مالية ومحاسبة', 'ITS': 'تكنولوجيا المعلومات', 'ADM': 'شؤون إدارية وخدمات', 'HRM': 'موارد بشرية', 'SLS': 'مبيعات ومعارض',
             'MKT': 'تسويق', 'INS': 'تجهيز وتركيبات', 'LOG': 'نقل', 'PRD': 'إنتاج وتصنيع', 'DSN': 'تصميم وعينات', 'MNT': 'صيانة', 'QLT': 'جودة',
             'PLN': 'تخطيط', 'PUR': 'احتياجات ومشتريات', 'WHS': 'مخازن', 'SCH': 'قيادة سلسلة الإمداد', 'RDV': 'بحث وتطوير',
             'OSH': 'سلامة وصحة مهنية', 'IAU': 'مراجعة داخلية', 'LGL': 'شؤون قانونية'}
FAM_ORDER = list(FAMILY_AR)
jobs = {}   # (fam, nk(base)) -> job
for p in sorted(P, key=lambda p: (FAM_ORDER.index(family(p)), p['i'])):
    f = family(p); b = base_title(p['ptitle'])
    k = (f, nk(b))
    if k not in jobs:
        n = sum(1 for j in jobs.values() if j['fam'] == f) + 1
        jobs[k] = dict(code=f'{f}-{n:03d}', fam=f, title=b, olds=[], n=0)
    j = jobs[k]; p['job'] = j['code']; p['jtitle'] = j['title']; p['fam'] = f
    if p['old']: j['olds'].append(p['old'])
    j['n'] += 1

# unit codes
codes = {}
for k in sorted(UNITS, key=lambda k: [x['order'] for x in path(UNITS[k])]):
    u = UNITS[k]
    if u['type'] == 'COMPANY': u['code'] = 'KE'; continue
    if u['type'] == 'SECTOR': u['code'] = SECTOR_CODE[u['name']]; continue
    par = UNITS[u['parent']]
    codes[par['key']] = codes.get(par['key'], 0) + 1
    u['code'] = f"{par['code']}-{codes[par['key']]:02d}"

# locations (Phase-1 defaults; to be confirmed)
def location(p):
    keys = [x['disp'] for x in path(UNITS[p['unit']])]
    s = ' '.join(keys)
    if 'إنشاص' in s: return 'إنشاص'
    if 'المنتج الخاص' in s and p['sector'] in ('العمليات', 'المالي والإداري'): return 'مصنع المنتج الخاص'
    if 'المعارض' in keys and p['sector'] == 'التجاري': return 'الفروع'
    return 'العبور'

# disambiguate position titles that repeat inside the same unit
by_unit = collections.defaultdict(list)
for p in P: by_unit[p['unit']].append(p)
for u, ps in by_unit.items():
    cnt = collections.Counter(nk(p['ptitle']) for p in ps)
    for p in ps:
        if cnt[nk(p['ptitle'])] > 1:
            m = P[p['mgr_ref']] if isinstance(p['mgr_ref'], int) else None
            tail = re.sub(r'^(مشرف|رئيس قسم|إداري)\s*', '', tidy(m['title'])) if m else ''
            p['ptitle'] = p['ptitle'] + ' - ' + tail
            issue('تكرار', f'"{tidy(p["title"])}" ({p["old"]}) متكررة في نفس الوحدة تحت مشرفين مختلفين.', f'سميتها "{p["ptitle"]}" عشان تتفرق.')
fix = [p for p in P if p['old'] == 'OPS-090'][0]
issue('تعارض', '"لحام - منتج خاص" (OPS-090) مكتوب تحت "مشرف منتج نمطي"، وفي نفس الوقت في "لحام" (OPS-095) تحت "مشرف منتج خاص".',
      'اعتبرت OPS-090 لحام المنتج النمطي وسميته "لحام - منتج نمطي" — صحّحني لو غلط.')
fix['ptitle'] = 'لحام - منتج نمطي'

for p in P: p['loc'] = location(p)
json.dump(dict(P=P, UNITS=UNITS, jobs=list(jobs.values()), issues=issues), open('stage3.json', 'w'), ensure_ascii=False)
print('jobs', len(jobs), 'positions', len(P), 'units', len(UNITS), 'issues', len(issues))
print(collections.Counter(j['fam'] for j in jobs.values()))
print(collections.Counter(p['loc'] for p in P))

# ======================= stage 4: CEO, import rows =======================
FAMILY_AR['EXE'] = 'الإدارة العليا'
ceo = dict(i=len(P), old='', sector='', dept='', sub='', title='الرئيس التنفيذي', ptitle='الرئيس التنفيذي', mgr='', line=0,
           mgr_ref=None, added=True, unit='C', job='EXE-001', jtitle='الرئيس التنفيذي', fam='EXE', loc='العبور')
P.append(ceo); UNITS['C']['members'].append(ceo['i']); UNITS['C']['head'] = ceo['i']
jobs[('EXE', nk('الرئيس التنفيذي'))] = dict(code='EXE-001', fam='EXE', title='الرئيس التنفيذي', olds=[], n=1)
for p in P:
    if p['mgr_ref'] == 'CEO': p['mgr_ref'] = ceo['i']
issue('ناقص', 'وظيفة "الرئيس التنفيذي" نفسها مش في الملف.', 'ضفتها كمدير للشركة عشان رؤساء القطاعات يتبعوها. (رئيس ونائب رئيس مجلس الإدارة ما دخلتهمش.)')

def upath(u):
    names = [x['disp'] for x in path(u)]
    return (names + [''] * 5)[:5]
ROWS = []
order = sorted(P, key=lambda p: ([x['order'] for x in path(UNITS[p['unit']])], 0 if UNITS[p['unit']]['head'] == p['i'] else 1, p['i']))
for p in order:
    u = UNITS[p['unit']]
    m = P[p['mgr_ref']] if isinstance(p['mgr_ref'], int) else None
    ROWS.append(dict(p=p, cols=upath(u) + [p['job'], p['jtitle'], p['loc'], m['ptitle'] if m else '',
                                         'Y' if u['head'] == p['i'] else '', '', '1', p['ptitle'], u['code'], p['fam']]))
json.dump(dict(P=P, UNITS=UNITS, jobs=list(jobs.values()), issues=issues, FAMILY_AR=FAMILY_AR,
               rows=[r['cols'] + [r['p']['old'], r['p'].get('added', False), r['p']['i']] for r in ROWS]), open('final.json', 'w'), ensure_ascii=False)
with open('import.tsv', 'w') as f:
    for r in ROWS: f.write('\t'.join(r['cols']) + '\n')
print('rows', len(ROWS))
