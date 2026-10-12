/**
 * Kandil Egypt — Recruitment Portal
 * Phase 1: Foundation
 * Config.gs — app constants and the table schema (single source for sheet headers).
 *
 * RULE: new columns are appended at the END of a table's `cols` list only.
 * ensureSchema_() appends missing headers at the far right and never reorders.
 */

var APP = {
  NAME: 'Kandil Recruitment — Private Demo',
  VERSION: '0.50.0',
  TZ: 'Africa/Cairo'
};

/** Script property keys holding spreadsheet IDs. */
var SS_PROP = {
  CORE: 'SS_CORE',
  ORG: 'SS_ORG',
  SEC: 'SS_SEC',
  AUDIT: 'SS_AUDIT',
  REC: 'SS_REC',
  CAND: 'SS_CAND',
  EMP: 'SS_EMP'
};

var SS_TITLES = {
  CORE: 'IBRA-DEMO-REC-CORE',
  ORG: 'IBRA-DEMO-REC-ORG',
  SEC: 'IBRA-DEMO-REC-SECURITY',
  AUDIT: 'IBRA-DEMO-REC-AUDIT',
  REC: 'IBRA-DEMO-REC-RECRUITMENT',
  CAND: 'IBRA-DEMO-REC-CANDIDATES',
  EMP: 'IBRA-DEMO-REC-EMPLOYEES'
};

/** Standard trailing columns added to every table unless `noStd` is set. */
var STD_COLS = ['Created_At', 'Created_By', 'Updated_At', 'Updated_By'];

/**
 * Table schema. `key` = primary key column. `ss` = spreadsheet group.
 */
var SCHEMA = {
  CONFIG: { ss: 'CORE', key: 'Config_Key',
    cols: ['Config_Key', 'Config_Value', 'Value_Type', 'Description'] },
  ID_SEQUENCES: { ss: 'CORE', key: 'Entity',
    cols: ['Entity', 'Prefix', 'Year_Scoped', 'Year', 'Last_Number', 'Pad_Length'] },
  ROLES: { ss: 'CORE', key: 'Role_Code',
    cols: ['Role_Code', 'Role_Name_AR', 'Role_Name_EN', 'Description', 'Status'] },
  USERS: { ss: 'CORE', key: 'User_ID',
    cols: ['User_ID', 'Email', 'Full_Name_AR', 'Full_Name_EN', 'Employee_ID', 'Position_ID',
           'Mobile', 'Status', 'Last_Login_At', 'Lang', 'Access_Expires_At', 'Nda_Accepted_At', 'Prefs_JSON', 'Is_Demo',
           'Policy_Version', 'Policy_Accepted_At'] },
  USER_ROLES: { ss: 'CORE', key: 'User_Role_ID',
    cols: ['User_Role_ID', 'User_ID', 'Role_Code', 'Scope_Type', 'Scope_Org_Unit_ID',
           'Include_Children', 'Effective_From', 'Effective_To', 'Granted_By'] },
  REASON_MASTER: { ss: 'CORE', key: 'Reason_ID',
    cols: ['Reason_ID', 'Process', 'Code', 'Label_AR', 'Label_EN', 'Requires_Note', 'Sort_Order', 'Status'] },

  ORG_VERSIONS: { ss: 'ORG', key: 'Org_Version_ID',
    cols: ['Org_Version_ID', 'Effective_Date', 'Approval_Date', 'Approved_By', 'Change_Request_ID',
           'Description', 'Status'] },
  ORG_UNITS: { ss: 'ORG', key: 'Org_Unit_ID',
    cols: ['Org_Unit_ID', 'Org_Version_ID', 'Unit_Type', 'Unit_Code', 'Name_AR', 'Name_EN',
           'Parent_Org_Unit_ID', 'Head_Position_ID', 'Status', 'Effective_From', 'Effective_To', 'Legal_Entity_ID'] },
  LOCATIONS: { ss: 'ORG', key: 'Location_ID',
    cols: ['Location_ID', 'Name_AR', 'Name_EN', 'Location_Type', 'Company_Org_Unit_ID', 'Governorate', 'Status', 'Address', 'Transport_Zone', 'HR_Site_User_ID', 'Insurance_Office'] },
  GRADES: { ss: 'ORG', key: 'Grade_Code',
    cols: ['Grade_Code', 'Grade_Name', 'Level_Order', 'Status'] },
  JOBS: { ss: 'ORG', key: 'Job_Code',
    cols: ['Job_Code', 'Job_Title_AR', 'Job_Title_EN', 'Job_Family', 'Job_Level', 'Grade_Code',
           'Current_JD_Version', 'Status', 'Effective_From', 'Effective_To', 'Collar', 'Job_Nature'] },
  JOB_VERSIONS: { ss: 'ORG', key: 'Job_Version_ID',
    cols: ['Job_Version_ID', 'Job_Code', 'Version', 'Snapshot_JSON', 'Change_Reason'] },
  /* v0.45.0 (CHG-96): manager review rounds for draft JDs — one row per (job draft, reviewer) */
  JD_REVIEW_ROUNDS: { ss: 'ORG', key: 'Round_ID',
    cols: ['Round_ID', 'Scope', 'Due_Date', 'Status', 'Jobs', 'Reviewers', 'Closed_At', 'Closed_By'] },
  JD_REVIEWS: { ss: 'ORG', key: 'Review_ID',
    cols: ['Review_ID', 'Round_ID', 'Job_Code', 'JD_ID', 'JD_Version', 'Reviewer_User_ID', 'Status', 'Comment', 'Responded_At', 'Mailed_At', 'Reminded_At'] },
  JOB_DESCRIPTIONS: { ss: 'ORG', key: 'JD_ID',
    cols: ['JD_ID', 'Job_Code', 'Version', 'Purpose', 'Responsibilities', 'Authority', 'KPIs',
           'Qualifications', 'Experience', 'Technical_Skills', 'Behavioral_Competencies',
           'Working_Conditions', 'Physical_Requirements', 'Reporting_Relationship', 'Status',
           'Effective_From', 'Approved_By', 'Approved_At',
           'Career_Level', 'Dimensions', 'Relations_Internal', 'Relations_External', 'Variants', 'Practical_Test', 'Trade',
           'Competencies_JSON', 'Confirm_Notes', 'Change_Reason', 'Submitted_By', 'Effective_To', 'Resp_Reason', 'Certifications'] },
  COMPETENCIES: { ss: 'ORG', key: 'Comp_Code',
    cols: ['Comp_Code', 'Group_Code', 'Name_AR', 'Name_EN', 'Definition', 'Methods', 'Level_1', 'Level_2', 'Level_3', 'Level_4',
           'Req_JL1', 'Req_JL2', 'Req_JL3', 'Req_JL4', 'Req_JL5', 'Req_JL6', 'Req_JL7', 'Status'] },
  COMP_QUESTIONS: { ss: 'ORG', key: 'Question_ID',
    cols: ['Question_ID', 'Comp_Code', 'Seq', 'Question', 'Strong', 'Weak', 'From_Level', 'Status'] },
  COMP_TESTS: { ss: 'ORG', key: 'Comp_Code',
    cols: ['Comp_Code', 'Test_Name', 'Method', 'Duration', 'Pass_Criteria', 'Owner', 'Status'] },
  POSITIONS: { ss: 'ORG', key: 'Position_ID',
    cols: ['Position_ID', 'Org_Version_ID', 'Job_Code', 'Position_Title', 'Org_Unit_ID',
           'Reports_To_Position_ID', 'Location_ID', 'Is_Head_Of_Unit', 'Structural_HC', 'HC_Basis',
           'Occupied_HC', 'Occupied_Updated_At', 'Occupied_Updated_By', 'Status',
           'Effective_From', 'Effective_To'] },
  ORG_UNIT_HISTORY: { ss: 'ORG', key: 'History_ID',
    cols: ['History_ID', 'Org_Unit_ID', 'Field', 'Old_Value', 'New_Value', 'Reason'] },
  POSITION_HISTORY: { ss: 'ORG', key: 'History_ID',
    cols: ['History_ID', 'Position_ID', 'Field', 'Old_Value', 'New_Value', 'Reason'] },
  DELEGATIONS: { ss: 'ORG', key: 'Delegation_ID',
    cols: ['Delegation_ID', 'From_Position_ID', 'To_User_ID', 'Process_Scope', 'Effective_From',
           'Effective_To', 'Reason', 'Status'] },
  AUTHORITY_RULES: { ss: 'ORG', key: 'Rule_ID',
    cols: ['Rule_ID', 'Process', 'Rule_Type', 'Scope_Type', 'Scope_Value', 'Authority',
           'Effective_From', 'Effective_To', 'Active', 'Notes'] },

  LOGIN_CODES: { ss: 'SEC', key: 'Code_ID',
    cols: ['Code_ID', 'Email', 'Code_Hash', 'Expires_At', 'Attempts', 'Used_At'] },
  SESSIONS: { ss: 'SEC', key: 'Session_ID',
    cols: ['Session_ID', 'User_ID', 'Token_Hash', 'Expires_At', 'Last_Seen_At', 'Revoked_At',
           'Revoked_By', 'User_Agent', 'Remember'] },
  /* v0.15.0: authenticator app sign-in. Secrets are encrypted; never shown after set-up. */
  USER_DEVICES: { ss: 'SEC', key: 'Device_ID',                                      // v0.49.0 (CHG-104): devices a user signed in from
    cols: ['Device_ID', 'User_ID', 'Device_Hash', 'Label', 'First_At', 'Last_At'] },
  USER_MFA: { ss: 'SEC', key: 'User_ID',
    cols: ['User_ID', 'Secret_Enc', 'Pending_Enc', 'Pending_At', 'Enabled_At', 'Last_Step', 'Fails', 'Locked_Until',
           'Recovery_JSON', 'Recovery_Left', 'Email_Logins', 'Reset_At', 'Reset_By'] },
  /* v0.17.0: onboarding programs */
  ONB_TEMPLATES: { ss: 'EMP', key: 'Template_ID',
    cols: ['Template_ID', 'Name_AR', 'Job_Type', 'Status', 'Notes'] },
  ONB_TEMPLATE_ITEMS: { ss: 'EMP', key: 'Item_ID',
    cols: ['Item_ID', 'Template_ID', 'Phase', 'Day_Offset', 'Owner_Role', 'Title_AR', 'Details', 'Needs_Ack', 'Sort_Order', 'Status', 'Kind'] },
  ONBOARDINGS: { ss: 'EMP', key: 'Onboarding_ID',
    cols: ['Onboarding_ID', 'Joining_ID', 'Employee_ID', 'Person_ID', 'Full_Name', 'Position_ID', 'Org_Unit_ID', 'Location_ID', 'Template_ID', 'Job_Type',
           'Start_Date', 'Status', 'HR_Site_User_ID', 'Recruiter_User_ID', 'Supervisor_User_ID', 'Manager_User_ID', 'Buddy_Name', 'Buddy_User_ID',
           'Buddy_Employee_ID', 'Completed_At', 'Completed_By', 'Ack_At', 'Ack_Channel', 'Ack_Note', 'Cancel_Reason',
           'Gift_Item', 'Gift_At', 'Gift_By', 'Gift_Signed', 'Gift_Note', 'IT_User_ID', 'Admin_User_ID', 'Safety_User_ID'] },
  /* v0.41.0 (CHG-85): custody and personal protective equipment handed to an employee */
  ONB_CUSTODY: { ss: 'EMP', key: 'Custody_ID',
    cols: ['Custody_ID', 'Employee_ID', 'Onboarding_ID', 'Full_Name', 'Kind', 'Item', 'Serial', 'Qty', 'Issued_On', 'Issued_By', 'Signed', 'Status',
           'Returned_On', 'Returned_By', 'Return_Note'] },
  /* v0.19.0: internal transfers */
  TRANSFER_REQUESTS: { ss: 'EMP', key: 'Transfer_ID',
    cols: ['Transfer_ID', 'Employee_ID', 'Full_Name', 'From_Position_ID', 'From_Location_ID', 'To_Position_ID', 'To_Location_ID', 'Vacancy_ID',
           'Effective_Date', 'Reason', 'New_Schedule', 'Pay_Change', 'Pay_Items_JSON', 'Pay_Note', 'Pay_Flags_JSON', 'Requester_User_ID', 'Steps_JSON',
           'Current_Step', 'Status', 'Done_At', 'Done_By', 'Reject_Reason', 'Payroll_Notified_At', 'Transfer_Type', 'End_Date', 'Handover_JSON',
           'Temp_Ended_At', 'Temp_Reminded_At'] },
  /* v0.18.0: social insurance per new hire, New Hire Voice surveys */
  INSURANCE_CASES: { ss: 'EMP', key: 'Case_ID',
    cols: ['Case_ID', 'Joining_ID', 'Employee_ID', 'Person_ID', 'Full_Name', 'Location_ID', 'Office', 'Rule', 'Joined_Date', 'Start_Date', 'Due_Date',
           'Status', 'Submitted_At', 'Submit_Ref', 'Registered_At', 'Insurance_No', 'Note', 'Updated_Note', 'Reminded_At',
           'Start_Request', 'Start_Request_Reason', 'Start_Request_By'] },
  NHV_SURVEYS: { ss: 'EMP', key: 'Survey_ID',
    cols: ['Survey_ID', 'Joining_ID', 'Employee_ID', 'Person_ID', 'Full_Name', 'Round_Day', 'Due_Date', 'Status', 'Token_Hash', 'Token_Until',
           'Sent_At', 'Sent_Via', 'Answered_At', 'Answers_JSON', 'Comment', 'Min_Score', 'Avg_Score', 'Lang', 'Reviewed_By', 'Reviewed_At', 'Review_Note'] },
  ONB_TASKS: { ss: 'EMP', key: 'Task_ID',
    cols: ['Task_ID', 'Onboarding_ID', 'Item_ID', 'Phase', 'Day_Offset', 'Title', 'Details', 'Owner_Role', 'Owner_User_ID', 'Due_Date', 'Needs_Ack',
           'Status', 'Done_By', 'Done_At', 'Note', 'Ack', 'Reminded_At', 'Kind'] },
  /* v0.44.0 (CHG-91): attendance enrolment on ZKBioTime — only that it was done, never biometric data */
  ATT_ENROLL: { ss: 'EMP', key: 'Enroll_ID',
    cols: ['Enroll_ID', 'Employee_ID', 'Onboarding_ID', 'Person_ID', 'Full_Name', 'Face', 'Finger', 'Punch_Type', 'Bio_Code', 'Note', 'Status',
           'Recorded_By', 'Recorded_At', 'Stop_Due_At', 'Stopped_By', 'Stopped_At'] },
  /* v0.25.0: probation and medical insurance */
  PROBATIONS: { ss: 'EMP', key: 'Probation_ID',
    cols: ['Probation_ID', 'Joining_ID', 'Employee_ID', 'Person_ID', 'Full_Name', 'Position_ID', 'Org_Unit_ID', 'Location_ID', 'Start_Date', 'End_Date', 'Decision_Due',
           'Manager_User_ID', 'Skip_User_ID', 'HR_Site_User_ID', 'Status', 'Goals_JSON', 'Goals_Set_At', 'Goals_Set_By', 'Goals_Ack_At', 'Goals_Ack_Channel',
           'Token_Hash', 'Token_Until', 'PIP_JSON', 'Recommendation', 'Rec_Reason', 'Rec_By', 'Rec_At', 'Decision', 'Decision_Note', 'Decision_By', 'Decision_At',
           'Meeting_At', 'Letter_At', 'Close_Note', 'Reminders_JSON', 'Is_Demo'] },
  PROB_REVIEWS: { ss: 'EMP', key: 'Review_ID',
    cols: ['Review_ID', 'Probation_ID', 'Kind', 'Due_Date', 'Status', 'Scores_JSON', 'Goals_JSON', 'Overall', 'Weighted', 'Strengths', 'Improve', 'Note',
           'Done_By', 'Done_At', 'Reminded_At', 'Esc_Level'] },
  PROB_NOTES: { ss: 'EMP', key: 'Note_ID',
    cols: ['Note_ID', 'Probation_ID', 'Kind', 'Event_Date', 'Text', 'Impact', 'Status', 'Reply', 'Reply_At', 'Void_Reason', 'Voided_By', 'Voided_At'] },
  MEDICAL_CASES: { ss: 'EMP', key: 'Case_ID',
    cols: ['Case_ID', 'Probation_ID', 'Employee_ID', 'Full_Name', 'Location_ID', 'Owner_User_ID', 'Opened_On', 'Due_Date', 'Status', 'Provider', 'Card_No',
           'Added_On', 'Dependents', 'Note', 'Reminded_At'] },
  /* v0.33.0: profile photos (thumbnails) of candidates (P:<Person_ID>) and users (U:<User_ID>) */
  PHOTOS: { ss: 'CAND', key: 'Photo_ID', cols: ['Photo_ID', 'Data'] },
  /* v0.31.0: AI CV readings — one row per call (tokens, estimated cost, the suggestions) */
  CV_AI_RUNS: { ss: 'CAND', key: 'Run_ID',
    cols: ['Run_ID', 'Person_ID', 'Application_ID', 'Vacancy_ID', 'CV_File_ID', 'Model', 'Status', 'Input_Tokens', 'Output_Tokens', 'Cost_USD',
           'Result_JSON', 'Error'] },
  /* v0.15.0: notes sent from any screen */
  /* v0.36.0: CEO approvals (CHG-75) — decisions the CEO takes from his trusted phone, and two-person requests (CHG-77) */
  CEO_APPROVALS: { ss: 'CORE', key: 'CA_ID',
    cols: ['CA_ID', 'Kind', 'Ref_ID', 'Title', 'Summary', 'Payload_JSON', 'Requested_By', 'Status', 'Decided_By', 'Decided_At', 'Decided_Via',
           'Device_ID', 'Comment'] },
  CEO_DEVICES: { ss: 'SEC', key: 'Device_ID',
    cols: ['Device_ID', 'User_ID', 'Token_Hash', 'Pin_Hash', 'Label', 'Expires_At', 'Revoked_At', 'Revoked_By', 'Last_Used_At', 'Fails',
           'Locked_Until', 'Reminded_Days'] },
  DUAL_REQUESTS: { ss: 'CORE', key: 'Dual_ID',
    cols: ['Dual_ID', 'Kind', 'Ref_ID', 'Title', 'Payload_JSON', 'Reason', 'Requested_By', 'Status', 'Decided_By', 'Decided_At', 'Comment',
           'Executed_At', 'Result'] },
  INCIDENTS: { ss: 'CORE', key: 'Incident_ID',
    cols: ['Incident_ID', 'Detected_At', 'Reported_By', 'Description', 'Data_Affected', 'People_Count', 'Status', 'Decision',
           'Decision_Reason', 'Decided_By', 'Decided_At', 'Regulator_Notified_At', 'Actions', 'Closed_At', 'Reminded'] },
  FEEDBACK: { ss: 'CORE', key: 'Feedback_ID',
    cols: ['Feedback_ID', 'User_ID', 'Screen', 'Screen_Title', 'Text', 'Status', 'Reply', 'Replied_By', 'Replied_At'] },

  /* ---------- Phase 2: requests, approvals, vacancies ---------- */
  RECRUITMENT_REQUESTS: { ss: 'REC', key: 'Request_ID',
    cols: ['Request_ID', 'Version', 'Status', 'Requester_User_ID', 'Requester_Position_ID', 'Org_Unit_ID', 'Job_Code',
           'Recruitment_Type', 'Required_By_Date', 'Employment_Type', 'Work_Model', 'Shift_Pattern', 'Reason_Category',
           'Justification', 'Requested_Priority', 'Priority_Reason', 'HR_Classification', 'Education', 'Specialization',
           'Experience_Years', 'Experience_Context', 'Duties', 'Working_Conditions', 'Notes', 'HC_Exception',
           'Exception_Justification', 'Submitted_At', 'Decided_At', 'HR_Notes', 'Reviewed_By', 'Reviewed_At', 'JD_Version',
           'HR_Internal_Notes', 'Parent_Request_ID', 'Closed_At'] },
  REQUEST_LINES: { ss: 'REC', key: 'Line_ID',
    cols: ['Line_ID', 'Request_ID', 'Position_ID', 'Location_ID', 'Requested_HC', 'Approved_HC', 'Structural_HC_At_Submit',
           'Occupied_HC_At_Submit', 'Open_HC_At_Submit', 'Available_HC_At_Submit', 'Vacancy_ID', 'Status', 'Topup_Vacancy_ID'] },
  REQUEST_REPLACEMENTS: { ss: 'REC', key: 'Replacement_ID',
    cols: ['Replacement_ID', 'Request_ID', 'Employee_Name', 'Employee_ID', 'Position_Title', 'Last_Working_Date', 'Reason', 'Status'] },
  REQUEST_SKILLS: { ss: 'REC', key: 'Skill_ID',
    cols: ['Skill_ID', 'Request_ID', 'Skill', 'Proficiency', 'Importance', 'Status'] },
  REQUEST_VERSIONS: { ss: 'REC', key: 'Version_ID',
    cols: ['Version_ID', 'Request_ID', 'Version', 'Snapshot_JSON', 'Reason'] },
  APPROVAL_INSTANCES: { ss: 'REC', key: 'Approval_ID',
    cols: ['Approval_ID', 'Entity_Type', 'Entity_ID', 'Entity_Version', 'Sequence', 'Step_Type', 'Authority',
           'Label', 'Status', 'Activated_At', 'Decision_By', 'Decision_At', 'Comment', 'Skip_Reason', 'Snapshot_JSON',
           'Reminder_Count', 'Last_Reminder_At', 'Escalated_At', 'Expiry_Warned_At'] },
  EVENTS: { ss: 'REC', key: 'Event_ID',
    cols: ['Event_ID', 'Entity_Type', 'Entity_ID', 'Event', 'Actor_ID', 'Comment', 'Data_JSON'] },
  NOTIFICATIONS: { ss: 'REC', key: 'Notification_ID',
    cols: ['Notification_ID', 'User_ID', 'Title', 'Body', 'Link_Type', 'Link_ID', 'Read_At'] },
  VACANCIES: { ss: 'REC', key: 'Vacancy_ID',
    cols: ['Vacancy_ID', 'Request_ID', 'Line_ID', 'Position_ID', 'Job_Code', 'Org_Unit_ID', 'Location_ID', 'Required_HC',
           'Joined_HC', 'Status', 'Recruitment_Start_Date', 'Required_By_Date', 'HR_Classification', 'Pin_Until',
           'Pin_Reason', 'Lead_Recruiter_ID', 'Closed_At', 'Close_Reason',
           'Apply_Code', 'Apply_Enabled', 'Public_Summary', 'Questions_JSON', 'Plan_JSON', 'Frozen_From', 'Frozen_Reason', 'Frozen_By', 'Frozen_At'] },
  VACANCY_RECRUITERS: { ss: 'REC', key: 'VR_ID',
    cols: ['VR_ID', 'Vacancy_ID', 'User_ID', 'Role', 'Active', 'Assigned_By', 'Ended_At', 'Reason'] },
  VACANCY_FILLS: { ss: 'REC', key: 'Fill_ID',
    cols: ['Fill_ID', 'Vacancy_ID', 'Method', 'Employee_Name', 'Employee_ID', 'Source_Position_ID', 'Effective_Date',
           'Notes', 'Status', 'Voided_By', 'Voided_At', 'Void_Reason'] },
  PRIORITY_HISTORY: { ss: 'REC', key: 'Priority_History_ID',
    cols: ['Priority_History_ID', 'Entity_Type', 'Entity_ID', 'Field', 'Old_Value', 'New_Value', 'Reason'] },
  POSITION_CHANGE_REQUESTS: { ss: 'REC', key: 'PCR_ID',
    cols: ['PCR_ID', 'Version', 'Status', 'Requester_User_ID', 'Org_Unit_ID', 'Proposed_Title', 'Job_Code', 'Reports_To_Position_ID',
           'Location_ID', 'Number_Of_Positions', 'Justification', 'Qualifications', 'Responsibilities', 'HR_Recommendation',
           'Proposed_Grade', 'Created_Position_ID', 'Submitted_At', 'Decided_At', 'HR_Notes'] },

  /* ---------- Phase 3: candidates (personal data kept in its own spreadsheet) ---------- */
  MESSAGE_TEMPLATES: { ss: 'CORE', key: 'Template_ID',
    cols: ['Template_ID', 'Code', 'Language', 'Purpose', 'Title', 'Subject', 'Body', 'Sort_Order', 'Status'] },
  PERSONS: { ss: 'CAND', key: 'Person_ID',
    cols: ['Person_ID', 'Full_Name', 'Mobile', 'Mobile_Norm', 'Email', 'National_ID', 'Birth_Date', 'Gender', 'Governorate',
           'City', 'Education', 'Specialization', 'Graduation_Year', 'Experience_Years', 'Current_Employer', 'Current_Title',
           'Current_Salary', 'Expected_Salary', 'Notice_Period', 'CV_File_ID', 'CV_File_Name', 'CV_Updated_At',
           'Consent_Version', 'Consent_At', 'Language', 'Is_Employee', 'Employee_ID', 'Employee_Position_ID',
           'Status', 'Merged_Into', 'Dup_Status', 'Dup_Candidates', 'Notes', 'Former_Employee_ID', 'Former_Check',
           'Pool_Consent', 'Pool_Consent_At', 'Pool_Consent_Until', 'Purged_At', 'Purge_Reason',
           'Expected_Salary_Max', 'Has_Relative', 'Relative_Name', 'Relative_Relation', 'Relative_Match', 'Accommodation', 'Disability',
           'Minor', 'Guardian_Name', 'Guardian_Mobile', 'Photo_Consent', 'Ai_Opt_Out', 'Consent_Link_Hash', 'Consent_Link_Until',
           'Self_Link_Hash', 'Self_Link_Until', 'Preferred_Channel', 'Residence_Address'] },
  APPLICATIONS: { ss: 'CAND', key: 'Application_ID',
    cols: ['Application_ID', 'Person_ID', 'Vacancy_ID', 'Channel', 'Source', 'Sub_Source', 'Referrer_Name', 'Referrer_Employee_ID',
           'Applied_At', 'Stage', 'Stage_At', 'Stage_Before_Hold', 'Hold_Reason', 'Close_Code', 'Close_Note',
           'Reject_Msg_Status', 'Reject_Msg_At', 'Next_Action', 'Next_Action_Date', 'Next_Action_Owner',
           'Is_Internal', 'Manager_Notified_At', 'Manager_User_ID', 'Consent_Version', 'Answers_JSON', 'Ad_ID',
           'Owner_User_ID', 'Original_Source', 'Agency_ID', 'Agency_Terms_JSON', 'Ownership_Until', 'Source_Locked_At',
           'Knockout_Flag', 'Knockout_Detail', 'Knockout_Review', 'Knockout_Reviewed_By', 'Knockout_Reviewed_At',
           'Import_Batch_ID', 'Origin_Application_ID'] },
  ACTIVITIES: { ss: 'CAND', key: 'Activity_ID',
    cols: ['Activity_ID', 'Application_ID', 'Person_ID', 'Type', 'Outcome', 'Note', 'Template_Code', 'Stage_From', 'Stage_To',
           'Status', 'Voided_By', 'Voided_At', 'Void_Reason'] },

  /* ---------- Phase 3B-2: referrals and agencies ---------- */
  REFERRALS: { ss: 'CAND', key: 'Referral_ID',
    cols: ['Referral_ID', 'Application_ID', 'Person_ID', 'Vacancy_ID', 'Employee_ID', 'Employee_Name', 'Relationship', 'Kind',
           'Bonus_Status', 'Bonus_Note', 'Bonus_By', 'Bonus_At', 'Locked_At', 'Status', 'Void_Reason'] },
  AGENCIES: { ss: 'CORE', key: 'Agency_ID',
    cols: ['Agency_ID', 'Name_AR', 'Name_EN', 'Contact_Name', 'Phone', 'Email', 'Fee_Type', 'Fee_Value', 'Guarantee_Days',
           'Replacement_Terms', 'Ownership_Days', 'Contract_URL', 'Notes', 'Status'] },

  /* ---------- Phase 3B-3: screening questions, talent pool, bulk import, rehire restrictions ---------- */
  SCREEN_QUESTIONS: { ss: 'CORE', key: 'Question_ID',
    cols: ['Question_ID', 'Text_AR', 'Text_EN', 'Answer_Type', 'Options_JSON', 'Family', 'Sort_Order', 'Status'] },
  TALENT_POOL: { ss: 'CAND', key: 'Pool_ID',
    cols: ['Pool_ID', 'Person_ID', 'Category', 'Tags', 'Note', 'From_Application_ID', 'Reason', 'Status', 'Removed_Reason'] },
  IMPORT_BATCHES: { ss: 'CAND', key: 'Batch_ID',
    cols: ['Batch_ID', 'Vacancy_ID', 'Source', 'Sub_Source', 'Agency_ID', 'File_Name', 'Rows_Total', 'Rows_New', 'Rows_Linked',
           'Rows_Skipped', 'Rows_Error', 'Notes'] },
  HIRING_RESTRICTIONS: { ss: 'EMP', key: 'Restriction_ID',
    cols: ['Restriction_ID', 'Employee_ID', 'Person_ID', 'Full_Name', 'National_ID', 'Mobile_Norm', 'Reason_Code', 'Evidence',
           'Review_Date', 'Permanent', 'Status', 'Lifted_Reason', 'Lifted_By', 'Lifted_At', 'Appeal_At', 'Appeal_Note', 'Appeal_By',
           'Appeal_Decision', 'Appeal_Decided_By', 'Appeal_Decided_At', 'Appeal_Decision_Note', 'Review_Reminded_At'] },

  /* ---------- Phase 4A: interviews, panels, evaluations, HR question bank ---------- */
  INTERVIEWS: { ss: 'CAND', key: 'Interview_ID',
    cols: ['Interview_ID', 'Application_ID', 'Person_ID', 'Vacancy_ID', 'Round_ID', 'Round_Name', 'Round_Type', 'Kind', 'Mode', 'Date', 'Time',
           'Duration_Min', 'Location_ID', 'Place', 'Meeting_Link', 'Status', 'Organizer_ID', 'Lead_User_ID', 'Manager_Confirmed_By',
           'Manager_Confirmed_At', 'Invited_At', 'Candidate_Confirmed_At', 'Checked_In_At', 'Started_At', 'Completed_At', 'Evaluated_At',
           'Is_Adhoc', 'Adhoc_Reason', 'Exception_Code', 'Exception_Note', 'Rescheduled_From', 'Rescheduled_To', 'Notes', 'Reminded_At',
           'Safety_Required', 'Safety_JSON', 'Reconfirm_Required', 'Reconfirmed_At', 'Reminded_2H_At', 'Cand_Reminded_At', 'Cand_Reminded_2H_At'] },
  INTERVIEW_PANEL: { ss: 'CAND', key: 'Panel_ID',
    cols: ['Panel_ID', 'Interview_ID', 'User_ID', 'Role', 'Status', 'Confirmed_At', 'Declined_At', 'Decline_Note', 'Opened_At',
           'Removed_Reason', 'Eval_Reminded_At', 'Eval_Escalated_At'] },
  EVALUATIONS: { ss: 'CAND', key: 'Evaluation_ID',
    cols: ['Evaluation_ID', 'Interview_ID', 'Application_ID', 'Evaluator_ID', 'Panel_Role', 'Version', 'Status', 'Data_JSON', 'Recommendation',
           'Strengths', 'Concerns', 'Summary', 'Started_At', 'Submitted_At', 'Late', 'Revision_Reason'] },
  /* ---------- Phase 5A: selection, references, pay, offers ---------- */
  SELECTIONS: { ss: 'CAND', key: 'Selection_ID',
    cols: ['Selection_ID', 'Application_ID', 'Vacancy_ID', 'Decision', 'Reason', 'Conditions', 'Snapshot_JSON', 'Override_Reason',
           'Decided_By', 'Decided_At', 'Status'] },
  REFERENCE_CHECKS: { ss: 'CAND', key: 'Reference_ID',
    cols: ['Reference_ID', 'Application_ID', 'Person_ID', 'Referee_Name', 'Referee_Company', 'Referee_Title', 'Referee_Mobile',
           'Relationship', 'Consent', 'Result', 'Notes', 'Checked_By', 'Checked_At', 'Status'] },
  PAY_COMPONENTS: { ss: 'CORE', key: 'Component_Code',
    cols: ['Component_Code', 'Name_AR', 'Name_EN', 'Kind', 'Show_On_Offer', 'Sort_Order', 'Status'] },
  SALARY_STRUCTURES: { ss: 'ORG', key: 'Structure_ID',
    cols: ['Structure_ID', 'Grade_Code', 'Version', 'Min_Amount', 'Mid_Amount', 'Max_Amount', 'Effective_From', 'Status', 'Notes'] },
  ALLOWANCE_GRADES: { ss: 'ORG', key: 'Row_ID',
    cols: ['Row_ID', 'Grade_Code', 'Version', 'Collar', 'Transport_Inshas', 'Transport_Other_Add', 'Meal', 'Phone', 'Representation',
           'Cost_Of_Living', 'Job_Nature_Eligible', 'Effective_From', 'Status', 'Notes'] },
  JOB_NATURE_RATES: { ss: 'ORG', key: 'Rate_ID',
    cols: ['Rate_ID', 'Unit_Group', 'Group_Name', 'Department', 'Amount', 'Year', 'Status'] },
  TEMP_TRANSPORT: { ss: 'ORG', key: 'Temp_ID',
    cols: ['Temp_ID', 'Location_ID', 'Amount', 'From_Date', 'To_Date', 'Reason', 'Status'] },
  OFFER_AUTHORITY: { ss: 'CORE', key: 'Authority_ID',
    cols: ['Authority_ID', 'Role_Code', 'Limit_Point', 'Limit_Pct', 'Sort_Order', 'Status'] },
  OFFERS: { ss: 'CAND', key: 'Offer_ID',
    cols: ['Offer_ID', 'Offer_No', 'Version', 'Application_ID', 'Vacancy_ID', 'Person_ID', 'Status', 'Grade_Code', 'Structure_ID', 'Range_JSON',
           'Components_JSON', 'Basic', 'Fixed_Package', 'Variable_Note', 'Current_Salary', 'Expected_Salary', 'Initial_Proposed',
           'Approved_Package', 'Final_Accepted', 'Required_Role', 'Required_Sort', 'Justification', 'Joining_Date', 'Valid_Until', 'Terms',
           'Submitted_At', 'Approver_ID', 'Approved_At', 'Approval_Note', 'Returned_Note', 'Presented_At', 'Presented_Via', 'Responded_At',
           'Response_Note', 'Decline_Reason', 'Decline_Note', 'Evidence_JSON', 'Extended_Note', 'HC_Override', 'Superseded_By', 'Reminded_At',
           'Contract_Basis', 'Agreed_Amount', 'Location_ID', 'Job_Nature_Rate_ID', 'Contrib_Wage', 'Comprehensive_Wage', 'Emp_Insurance',
           'Income_Tax', 'Net_Salary', 'Company_Martyr', 'Incentive_Amount', 'Incentive_Terms', 'Calc_JSON', 'No_Insurance',
           'No_Ins_Basis', 'No_Ins_Form_File', 'Net_Reviewed_By', 'Net_Reviewed_At', 'Net_Review_Note', 'Presented_Mobile', 'Work_Hours', 'Weekly_Rest'] },
  /* ---------- Phase 5B: joining & hiring documents ---------- */
  DOC_TYPES: { ss: 'CORE', key: 'Doc_Code',
    cols: ['Doc_Code', 'Name_AR', 'Name_EN', 'Keep', 'Copies', 'Digital', 'Scope', 'Scope_Value', 'Insured_Only', 'Deferrable',
           'Max_Defer_Days', 'Has_Expiry', 'Sort_Order', 'Status', 'Sensitive'] },
  JOININGS: { ss: 'CAND', key: 'Joining_ID',
    cols: ['Joining_ID', 'Application_ID', 'Vacancy_ID', 'Person_ID', 'Offer_ID', 'Status', 'Planned_Date', 'Date_Confirmed_At', 'Changes_JSON',
           'No_Insurance', 'Joined_Date', 'Employee_ID', 'Fill_ID', 'DNJ_Reason', 'DNJ_Note', 'Token_Hash', 'Token_Until', 'Receipt_ID',
           'Receipt_At', 'Closed_By', 'Closed_At', 'Docs_Consent_At', 'Docs_Consent_Version', 'Docs_Consent_Channel', 'Contract_File_ID', 'Contract_At',
           'Contract_By', 'Contract_Months'] },
  CANDIDATE_DOCS: { ss: 'CAND', key: 'Doc_ID',
    cols: ['Doc_ID', 'Joining_ID', 'Application_ID', 'Doc_Code', 'Name', 'Keep', 'Copies', 'Digital', 'Required', 'Status', 'Files_JSON',
           'Uploaded_By', 'Uploaded_At', 'Reviewed_By', 'Reviewed_At', 'Review_Note', 'Physical', 'Physical_At', 'Physical_By', 'Expiry_Date',
           'Deferred', 'Due_Date', 'Defer_By', 'Defer_Reason', 'Waive_By', 'Waive_Reason', 'Review_Started_At', 'Issue_Note', 'Expired_At',
           'Renew_Notice_At', 'Defer_Reminded_At', 'Defer_Escalated_At'] },
  PAYROLL_NOTICES: { ss: 'CAND', key: 'Notice_ID',
    cols: ['Notice_ID', 'Joining_ID', 'Application_ID', 'Kind', 'Cutoff_Date', 'Docs', 'Sent_At', 'Sent_By', 'Note'] },
  DOC_RECEIPTS: { ss: 'CAND', key: 'Receipt_ID',
    cols: ['Receipt_ID', 'Joining_ID', 'Application_ID', 'Person_ID', 'Items_JSON', 'File_ID'] },
  /* ---------- v0.14.1: personal-data protection ---------- */
  CONSENTS: { ss: 'CAND', key: 'Consent_ID',
    cols: ['Consent_ID', 'Person_ID', 'Application_ID', 'Kind', 'Granted', 'Version', 'Channel', 'Until', 'Note'] },
  LEGAL_ENTITIES: { ss: 'CORE', key: 'Entity_ID',
    cols: ['Entity_ID', 'Name_AR', 'Name_EN', 'Commercial_Reg', 'Tax_ID', 'Address', 'Status', 'Signatory_Name', 'Signatory_Title'] },
  DATA_REQUESTS: { ss: 'CAND', key: 'Request_ID',
    cols: ['Request_ID', 'Person_ID', 'Kind', 'Channel', 'Received_On', 'Due_Date', 'Details', 'Status', 'Outcome', 'Closed_By', 'Closed_At',
           'Identity_Method', 'Identity_Checked_By', 'Identity_Checked_At'] },
  ROUND_TEMPLATES: { ss: 'CORE', key: 'Template_ID',
    cols: ['Template_ID', 'Scope_Type', 'Scope_Value', 'Rounds_JSON', 'Notes', 'Status'] },
  INTERVIEW_QUESTIONS: { ss: 'CORE', key: 'Question_ID',
    cols: ['Question_ID', 'Round_Type', 'Family', 'Kind', 'Text_AR', 'Text_EN', 'Sort_Order', 'Status'] },

  /* ---------- Phase 3B: sources, subscriptions, advertisements ---------- */
  RECRUITMENT_SOURCES: { ss: 'CORE', key: 'Source_Code',
    cols: ['Source_Code', 'Name_AR', 'Name_EN', 'Kind', 'Has_Link', 'Uses_Credits', 'Sort_Order', 'Status'] },
  SOURCE_SUBSCRIPTIONS: { ss: 'REC', key: 'Subscription_ID',
    cols: ['Subscription_ID', 'Source_Code', 'Package', 'Start_Date', 'End_Date', 'Ad_Credits', 'CV_Credits', 'Cost',
           'Owner_User_ID', 'Notice_Days', 'Contract_URL', 'Notes', 'Status', 'Alert_Sent_At'] },
  SOURCE_USAGE: { ss: 'REC', key: 'Usage_ID',
    cols: ['Usage_ID', 'Subscription_ID', 'Kind', 'Units', 'Ref_ID', 'Note', 'Status', 'Voided_By', 'Voided_At', 'Void_Reason'] },
  ADVERTISEMENTS: { ss: 'REC', key: 'Ad_ID',
    cols: ['Ad_ID', 'Vacancy_ID', 'Source_Code', 'Campaign', 'Language', 'Title', 'Body', 'Version', 'Status',
           'Published_At', 'Closes_On', 'Post_URL', 'Cost', 'Subscription_ID', 'Usage_ID', 'Copied_From', 'Posted_By', 'Status_Note'] },

  /* ---------- Employees (personal data, HR only) ---------- */
  EMPLOYEES: { ss: 'EMP', key: 'Employee_ID',
    cols: ['Employee_ID', 'Full_Name', 'Position_ID', 'Location_ID', 'Hire_Date', 'Employment_Kind', 'Job_Type', 'Status',
           'Exit_Date', 'Exit_Reason', 'Exit_Note', 'Source', 'Notes', 'Is_Demo', 'Disability', 'Temp_Position_ID', 'Temp_Location_ID', 'Temp_Until',
           'Temp_Transfer_ID'] },
  EMPLOYEE_HISTORY: { ss: 'EMP', key: 'History_ID',
    cols: ['History_ID', 'Employee_ID', 'Event', 'From_Position_ID', 'To_Position_ID', 'From_Location_ID', 'To_Location_ID',
           'Event_Date', 'Reason_Code', 'Note', 'Ref'] },

  AUDIT_LOG: { ss: 'AUDIT', key: 'Audit_ID', noStd: true,
    cols: ['Audit_ID', 'Timestamp', 'User_ID', 'On_Behalf_Of', 'Entity_Type', 'Entity_ID', 'Action',
           'Field', 'Old_Value', 'New_Value', 'Reason', 'Session_ID', 'Content_Hash', 'Chain_Hash', 'Redacted'] }
};

/** Full header list for a table (schema cols + standard cols). */
function tableHeaders_(table) {
  var def = SCHEMA[table];
  if (!def) throw new Error('Unknown table: ' + table);
  return def.noStd ? def.cols.slice() : def.cols.concat(STD_COLS);
}

/** Roles that manage HR administration screens. */
var ROLE = {
  OWNER: 'SYS_OWNER',
  HR_SECTOR: 'HR_SECTOR_MANAGER',
  HR_MANAGER: 'HR_MANAGER',
  HR_STAFF: 'HR_STAFF',
  REC_MANAGER: 'RECRUITMENT_MANAGER',
  REC_SUPERVISOR: 'RECRUITMENT_SUPERVISOR',
  RECRUITER: 'RECRUITER',
  CEO: 'CEO',
  BOARD: 'BOARD',
  VIEWER: 'VIEWER',
  CONSULTANT: 'CONSULTANT'
};

var HR_ADMIN_ROLES = [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER];
var HR_ALL_ROLES = [ROLE.OWNER, ROLE.HR_SECTOR, ROLE.HR_MANAGER, ROLE.HR_STAFF];

/** Unit type order, top to bottom. */
var UNIT_TYPES = ['COMPANY', 'SECTOR', 'DEPARTMENT', 'SECTION', 'SUB_UNIT'];
