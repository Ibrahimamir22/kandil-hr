import {api,ApiError} from './api';
export const recoveryApi='kandil_hr.candidates.recovery.';
export type CandidateOperation='intake'|'correction'|'migration';
export type CandidateAttempt={id:string;payload:Record<string,unknown>;recovery?:string};
export type RecoveryRow={name:string;operation:CandidateOperation;status:'Pending'|'Completed'|'Acknowledged'|'Cancelled';created:string};
export function validCandidateResult(operation:CandidateOperation,value:unknown,args?:Record<string,unknown>):value is Record<string,unknown>{
 if(!value||typeof value!=='object')return false;const r=value as Record<string,unknown>;
 const required=operation==='correction'?['application','person','person_version','revision']:['application','person','application_version','person_version'];
 if(required.some(k=>typeof r[k]!=='string'||!r[k]))return false;
 if(args?.application&&r.application!==args.application)return false;
 if(args?.person&&r.person!==args.person)return false;
 if(operation==='migration'){const c=r.reconciliation as Record<string,unknown>|undefined;return !!c&&c.preserved===true&&typeof c.before_hash==='string'&&/^[0-9a-f]{64}$/.test(c.before_hash)&&c.before_hash===c.after_hash}
 return true;
}
export async function candidateCommand<T>(operation:CandidateOperation,attempt:CandidateAttempt,active:()=>boolean):Promise<T>{
 if(!attempt.recovery){const prepared=await api<RecoveryRow>(recoveryApi+'prepare',{operation,arguments:{...attempt.payload,command_id:attempt.id}},'POST');if(!prepared?.name||prepared.operation!==operation||!['Pending','Completed'].includes(prepared.status))throw new ApiError('NETWORK_UNCERTAIN',0);attempt.recovery=prepared.name}
 // Leaving a form before preparation finishes must not start an unseen action.
 // The server inbox retains the prepared command for explicit review instead.
 if(!active())throw new ApiError('NETWORK_UNCERTAIN',0);
 let response:{name:string;status:string;result:unknown};
 try{response=await api(recoveryApi+'execute',{name:attempt.recovery},'POST')}
 catch(e){
  if(e instanceof ApiError&&e.status>=400&&e.status<500&&![401,403].includes(e.status)){
   // Only a confirmed, unexecuted command can be discarded. If this cleanup is
   // uncertain, keep its original reference; never generate a replacement ID.
   try{const closed=await api<{cancelled:boolean}>(recoveryApi+'cancel',{name:attempt.recovery},'POST');if(!closed?.cancelled)throw new Error('unconfirmed')}
   catch{throw new ApiError('NETWORK_UNCERTAIN',0)}
  }
  throw e;
 }
 if(response?.name!==attempt.recovery||response.status!=='Completed'||!validCandidateResult(operation,response.result,attempt.payload))throw new ApiError('NETWORK_UNCERTAIN',0);
 if(active()){
  // A failed acknowledgement leaves the completed result in the inbox. It does
  // not turn a known successful business action back into an uncertain write.
  try{await api(recoveryApi+'acknowledge',{name:attempt.recovery},'POST')}catch{/* Recoverable through the inbox. */}
 }
 return response.result as T;
}
