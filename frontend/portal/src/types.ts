export interface Bootstrap{user:{id:string;full_name:string};csrf_token:string;can_create:boolean;synthetic_test?:boolean}
export interface RequestCard{name:string;title:string;status:string;revision:number;modified:string;requested_by:string;department:string;quantity:number;required_by?:string}
export interface Line{name?:string;capacity:string;branch?:string;requested_qty:number;proposed_qty?:number;reserved_qty?:number;approved_qty?:number;joined_qty?:number;job_opening?:string}
export interface RequestDoc extends RequestCard{company:string;requested_position:string;lines:Line[];need_reason?:string;exception_reason?:string;qualifications?:string;skills_required?:string;experience_required?:string;working_conditions?:string;employment_type?:string;replacement_employee?:string;replacement_restricted?:boolean;requested_priority?:string;amends?:string;approval_steps?:{step_key:string;authority:string;principal:string;decision:string}[]}
export interface Actions{edit?:boolean;expected_version:string;step_id?:string;submit?:boolean;decide?:boolean;review?:boolean;revise?:boolean;revise_pending_quantities?:boolean;cancel?:boolean;headcount_preview?:boolean;next_authority?:string}
export interface Timeline{events:{name:string;action:string;actor:string;principal?:string;creation:string;note?:string}[];has_more?:boolean;next_start?:number;timezone?:string}
export interface Detail{request:RequestDoc;actions:Actions;timeline:Timeline|Timeline['events']}
export interface Vacancy{name:string;request:string;title:string;branch:string;quantity:number;joined:number;state:string;lead?:string;lead_name?:string;expected_version:string;can_assign:boolean;members?:string[]}
export interface Overview{requests:RequestCard[];approvals:RequestCard[];vacancies:Vacancy[];counts:Record<string,number>;count_scope?:string;start?:number;next_start?:number;has_more?:boolean}
export interface Choices{truncated?:boolean;positions:{id:string;label:string;company:string;department:string;designation:string}[];capacities:{id:string;position:string;company:string;department:string;branch:string;designation:string;available:number}[]}
export type Tr=(ar:string,en:string)=>string;
