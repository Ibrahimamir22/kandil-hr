/**
 * Grades.gs — the 15 job grades (Korn Ferry "Job Level", 1 lowest … 15 highest) and the
 * one-time load of each job's grade from the structure sheet the owner sent (4 Oct 2026).
 * A job's grade is changed afterwards only from the jobs screen (HR Sector Manager).
 */

/** Job_Code -> Job Level from «Structure KE 02.06.2025 — Korn Ferry» (job titles reconciled in 0.2.x). */
var JOB_LEVELS_050_ = {
  'ACC-001':15, 'ACC-002':13, 'ACC-003':13, 'ACC-004':13, 'ACC-005':8, 'ACC-006':10, 'ACC-007':7, 'ACC-008':10, 'ACC-009':7, 'ACC-010':6,
  'ACC-011':10, 'ACC-012':10, 'ACC-013':10, 'ACC-014':5, 'ACC-015':10, 'ACC-016':10, 'ACC-017':7, 'ACC-018':7, 'ADM-001':9, 'ADM-002':5,
  'ADM-003':2, 'ADM-004':2, 'ADM-005':1, 'ADM-006':5, 'ADM-007':1, 'DSN-001':12, 'DSN-002':8, 'DSN-003':5, 'DSN-004':6, 'DSN-005':5,
  'DSN-006':8, 'DSN-007':7, 'DSN-008':8, 'HRM-001':15, 'HRM-002':12, 'HRM-003':9, 'HRM-004':10, 'HRM-005':7, 'HRM-006':6, 'HRM-007':7,
  'HRM-008':7, 'HRM-009':12, 'HRM-010':10, 'HRM-011':9, 'HRM-012':6, 'HRM-013':6, 'IAU-001':13, 'IAU-002':8, 'INS-001':12, 'INS-002':8,
  'INS-003':5, 'INS-004':8, 'INS-005':7, 'INS-006':4, 'INS-007':7, 'INS-008':5, 'INS-009':8, 'ITS-001':13, 'ITS-002':9, 'ITS-003':7,
  'ITS-004':9, 'ITS-005':7, 'ITS-006':9, 'LGL-001':12, 'LGL-002':8, 'LOG-001':6, 'LOG-002':5, 'MKT-001':13, 'MKT-002':8, 'MKT-003':7,
  'MKT-004':5, 'MKT-005':10, 'MKT-006':7, 'MKT-007':7, 'MKT-008':7, 'MKT-009':9, 'MNT-001':8, 'MNT-002':5, 'MNT-003':5, 'MNT-004':5,
  'OSH-001':13, 'OSH-002':6, 'OSH-003':5, 'PLN-001':7, 'PRD-001':15, 'PRD-002':12, 'PRD-003':8, 'PRD-004':2, 'PRD-005':3, 'PRD-006':5,
  'PRD-007':5, 'PRD-008':5, 'PRD-009':5, 'PRD-010':5, 'PRD-011':3, 'PRD-012':3, 'PRD-013':5, 'PRD-014':5, 'PRD-015':5, 'PRD-016':5,
  'PRD-017':4, 'PRD-018':5, 'PRD-019':5, 'PRD-020':8, 'PRD-021':5, 'PRD-022':8, 'PRD-023':4, 'PRD-024':5, 'PRD-025':5, 'PRD-026':8,
  'PRD-027':5, 'PRD-028':5, 'PRD-029':8, 'PRD-030':5, 'PRD-031':5, 'PRD-032':8, 'PRD-033':3, 'PRD-034':4, 'PRD-035':4, 'PRD-036':5,
  'PRD-037':3, 'PRD-038':8, 'PRD-039':5, 'PRD-040':9, 'PRD-041':7, 'PRD-042':5, 'PRD-043':7, 'PRD-044':7, 'PRD-045':15, 'PRD-046':9,
  'PRD-047':7, 'PRD-048':5, 'PRD-049':5, 'PRD-050':2, 'PRD-051':5, 'PRD-052':5, 'PRD-053':4, 'PRD-054':7, 'PRD-055':5, 'PRD-056':5,
  'PRD-057':2, 'PRD-058':7, 'PRD-059':7, 'PRD-060':9, 'PRD-061':6, 'PRD-062':4, 'PRD-063':5, 'PRD-064':6, 'PRD-065':2, 'PRD-066':9,
  'PRD-067':4, 'PRD-068':5, 'PRD-069':15, 'PRD-070':11, 'PRD-071':8, 'PRD-072':5, 'PRD-073':8, 'PRD-074':5, 'PRD-075':5, 'PRD-076':8,
  'PRD-077':4, 'PRD-078':8, 'PRD-079':5, 'PRD-080':8, 'PRD-081':5, 'PRD-082':5, 'PRD-083':5, 'PRD-084':5, 'PRD-085':5, 'PRD-086':3,
  'PRD-087':8, 'PRD-088':3, 'PRD-089':8, 'PRD-090':5, 'PRD-091':3, 'PRD-092':4, 'PRD-093':5, 'PUR-001':12, 'PUR-002':7, 'PUR-003':10,
  'PUR-004':6, 'QLT-001':8, 'QLT-002':5, 'QLT-003':13, 'QLT-004':9, 'QLT-006':10, 'QLT-007':6, 'RDV-001':14, 'RDV-002':12, 'RDV-003':12,
  'SCH-001':15, 'SLS-001':15, 'SLS-002':9, 'SLS-003':14, 'SLS-004':14, 'SLS-005':14, 'SLS-006':7, 'SLS-007':11, 'SLS-008':9, 'SLS-009':7,
  'SLS-010':5, 'SLS-011':12, 'SLS-012':7, 'SLS-013':12, 'SLS-014':7, 'SLS-015':7, 'SLS-016':12, 'SLS-017':8, 'WHS-001':12, 'WHS-002':6,
  'WHS-003':5, 'WHS-004':1, 'WHS-005':10, 'WHS-006':5, 'WHS-007':10, 'WHS-008':5
};

function seedGrades_() {
  var rows = [];
  for (var g = 1; g <= 15; g++) rows.push({ Grade_Code: String(g), Grade_Name: 'Job Level ' + g, Level_Order: String(g), Status: 'Active' });
  seedRows_('GRADES', rows);
  invalidate_('GRADES');
}

/** Fill empty job grades from the Korn Ferry levels. Never overwrites a grade someone already set. */
function grades050_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('GRADES_050') === 'done') return;
  seedGrades_();
  withLock_(function () {
    Object.keys(JOB_LEVELS_050_).forEach(function (code) {
      var j = get_('JOBS', code);
      if (!j || str_(j.Grade_Code)) return;
      update_('JOBS', code, { Grade_Code: String(JOB_LEVELS_050_[code]) }, 'SYSTEM');
    });
  });
  props.setProperty('GRADES_050', 'done');
}
