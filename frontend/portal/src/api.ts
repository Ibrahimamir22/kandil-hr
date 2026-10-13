export class ApiError extends Error { constructor(message:string, public status:number, public denied=false, public code=''){super(message)} }
let csrf=(window as Window & {kandilPortalCsrf?:string}).kandilPortalCsrf || '';
export const setCsrf=(value:string)=>{csrf=value};
const plain=(value:string)=>new DOMParser().parseFromString(value,'text/html').body.textContent||'';
export async function api<T>(method:string, args:Record<string,unknown>={}, verb:'GET'|'POST'='GET'):Promise<T>{
  let response:Response;
  const url='/api/method/'+method;
  // Transport locale is not part of a command payload or its retry signature.
  // A message already shown retains the language used when that action ran.
  const lang=document.documentElement.lang;
  const transport={...args,_lang:lang==='en'?'en':'ar'};
  try {response=await fetch(verb==='GET'?url+'?'+new URLSearchParams(Object.entries(transport).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])):url,{method:verb,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(verb==='POST'?{'Content-Type':'application/json','X-Frappe-CSRF-Token':csrf}:{})},...(verb==='POST'?{body:JSON.stringify(transport)}:{})});}
  catch {throw new ApiError('NETWORK_UNCERTAIN',0)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){let message='REQUEST_FAILED';try{const messages=JSON.parse(data._server_messages||'[]');if(messages.length)message=plain(JSON.parse(messages.at(-1)).message)}catch{/* Use safe generic error, never raw traceback. */}throw new ApiError(message,response.status,false,typeof data.exc_type==='string'?data.exc_type:'')}
  const result=data.message as T;
  if(result && typeof result==='object' && 'outcome' in result && result.outcome==='denied')throw new ApiError(plain(String((result as {message?:string}).message||'REQUEST_DENIED')),200,true);
  return result;
}
export const portal=<T>(method:string,args:Record<string,unknown>={},verb:'GET'|'POST'='GET')=>api<T>('kandil_hr.portal.api.'+method,args,verb);
