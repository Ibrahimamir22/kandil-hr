import {api,ApiError} from './api';
import type {Tr} from './types';
export const recoveryExpired=(e:unknown)=>e instanceof ApiError&&e.code==='CandidateRecoveryExpired';
export const expiryMessage=(t:Tr)=>t('انتهت مهلة استكمال الطلب المحفوظ. راجع سجل طلبات الترشح قبل إنشاء طلب جديد؛ قد تكون العملية نُفذت بالفعل.','The saved request has expired. Review application records before starting a new request; the action may already have completed.');
export const recoveryAccessChanged=(e:unknown)=>e instanceof ApiError&&e.code==='CandidateRecoveryAccessChanged';
export const recoveryAccessMessage=(t:Tr)=>t('تغيّرت الجلسة أو الصلاحيات. سجّل الدخول عند الحاجة واستكمل الطلب الأصلي من «إجراءات غير مكتملة»؛ لا تبدأ طلبًا بديلًا.','Your session or access changed. Sign in if needed and recover the original request from Unfinished actions; do not start a replacement.');
export async function recoveryRequest<T>(method:string,args:Record<string,unknown>={},verb:'GET'|'POST'='GET'):Promise<T>{
 try{return await api<T>(method,args,verb)}catch(e){
  if(e instanceof ApiError&&[401,403].includes(e.status)){
   // A denial now does not prove that an earlier lost reply never committed.
   // Probe authentication separately: a scoped denial must not log out a valid user.
   let signedOut=false;
   try{const user=await api<string>('frappe.auth.get_logged_user');signedOut=!user||user==='Guest'}catch(probe){signedOut=probe instanceof ApiError&&[401,403].includes(probe.status)}
   if(signedOut)window.dispatchEvent(new Event('kandil:candidate-reauthenticate'));
   throw new ApiError('RECOVERY_ACCESS_CHANGED',0,false,'CandidateRecoveryAccessChanged');
  }
  throw e;
 }
}
export const recoveryApi='kandil_hr.candidates.recovery.';
export type CandidateOperation='intake'|'correction'|'migration'|'owner'|'followup'|'activity'|'activity_void';
export type CandidateAttempt={id:string;payload:Record<string,unknown>;recovery?:string};
export type RecoveryRow={name:string;operation:CandidateOperation;status:'Pending'|'Completed'|'Acknowledged'|'Cancelled'|'Expired';created:string;expires_at:string};
export function validCandidateResult(operation:CandidateOperation,value:unknown,args?:Record<string,unknown>):value is Record<string,unknown>{
 if(!value||typeof value!=='object')return false;const r=value as Record<string,unknown>;
 if(operation==='activity'||operation==='activity_void'){if(r.application!==args?.application||typeof r.application_version!=='string'||!r.application_version||typeof r.activity!=='string'||!r.activity)return false;if(operation==='activity'){
  if(r.kind!==args?.kind||r.voided!==false)return false;
  if(args?.move_to_contacted||args?.next_action){if(typeof r.moved!=='boolean'||r.followup_applied!==!!args?.next_action)return false;if(r.moved&&(!args?.move_to_contacted||typeof r.stage_activity!=='string'||!r.stage_activity))return false;if(!r.moved&&r.stage_activity!==null)return false}
  return true;
 }return r.activity===args?.activity&&r.voided===true&&typeof r.void_activity==='string'&&!!r.void_activity}
 if(operation==='owner'||operation==='followup'){if(typeof r.application!=='string'||!r.application||typeof r.application_version!=='string'||!r.application_version||r.application!==args?.application)return false;return operation==='owner'?r.owner===args?.owner:r.next_action_owner===(String(args?.task||'').trim()?args?.owner:null)}
 const required=operation==='correction'?['application','person','person_version','revision']:['application','person','application_version','person_version'];
 if(required.some(k=>typeof r[k]!=='string'||!r[k]))return false;
 if(args?.application&&r.application!==args.application)return false;
 if(args?.person&&r.person!==args.person)return false;
 if(operation==='migration'){const c=r.reconciliation as Record<string,unknown>|undefined;return !!c&&c.preserved===true&&typeof c.before_hash==='string'&&/^[0-9a-f]{64}$/.test(c.before_hash)&&c.before_hash===c.after_hash}
 return true;
}
export async function candidateCommand<T>(operation:CandidateOperation,attempt:CandidateAttempt,active:()=>boolean):Promise<T>{
 if(!attempt.recovery){const prepared=await recoveryRequest<RecoveryRow>(recoveryApi+'prepare',{operation,arguments:{...attempt.payload,command_id:attempt.id}},'POST');if(prepared?.status==='Expired')throw new ApiError('RECOVERY_EXPIRED',0,false,'CandidateRecoveryExpired');if(!prepared?.name||prepared.operation!==operation||!['Pending','Completed'].includes(prepared.status))throw new ApiError('NETWORK_UNCERTAIN',0);attempt.recovery=prepared.name}
 // Leaving a form before preparation finishes must not start an unseen action.
 // The server inbox retains the prepared command for explicit review instead.
 if(!active())throw new ApiError('NETWORK_UNCERTAIN',0);
 let response:{name:string;status:string;result:unknown};
 try{response=await recoveryRequest(recoveryApi+'execute',{name:attempt.recovery},'POST')}
 catch(e){
  // An expired response does not establish whether a prior execution committed.
  // Freeze this attempt; require record review, never mint a replacement ID.
  if(recoveryExpired(e))throw new ApiError('RECOVERY_EXPIRED',0,false,'CandidateRecoveryExpired');
  if(e instanceof ApiError&&e.status>=400&&e.status<500&&![401,403].includes(e.status)){
   // Only a confirmed, unexecuted command can be discarded. If this cleanup is
   // uncertain, keep its original reference; never generate a replacement ID.
   try{const closed=await recoveryRequest<{cancelled:boolean}>(recoveryApi+'cancel',{name:attempt.recovery},'POST');if(!closed?.cancelled)throw new Error('unconfirmed')}
   catch{throw new ApiError('NETWORK_UNCERTAIN',0)}
  }
  throw e;
 }
 if(response?.name!==attempt.recovery||response.status!=='Completed'||!validCandidateResult(operation,response.result,attempt.payload))throw new ApiError('NETWORK_UNCERTAIN',0);
 if(active()){
  // A failed acknowledgement leaves the completed result in the inbox. It does
  // not turn a known successful business action back into an uncertain write.
  try{await recoveryRequest(recoveryApi+'acknowledge',{name:attempt.recovery},'POST')}catch{/* Recoverable through the inbox. */}
 }
 return response.result as T;
}
