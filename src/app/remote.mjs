import {assert,error,data,parseJSON,moneyMicros,moneyText,sameOrigin,sha256,uuid} from './common.mjs';
const iso=n=>new Date(n).toISOString();
export const userView=u=>({id:u.id,name:u.name??u.subject??u.id,email:u.email??'',role:u.role,...(u.issuer?{issuer:u.issuer}:{}),...(u.subject?{subject:u.subject}:{})});
export class RemoteServices {
 constructor(api,{notify=()=>{},context=()=>null,now=Date.now}={}){this.api=api;this.notify=notify;this.context=context;this.now=now;this.clear();}
 clear(){this.preparing=new Map();this.settings=null;this.settingsETag=null;this.policy=null;this.providers=[];this.credentials=[];this.budget={revision:0,money:[]};this.budgetETag=null;this.jobs=new Map();this.conflicts=[];this.registryLoaded=false;this.ledgerComplete=false;this.reservations=new Map();}
 async read(path){return (await this.api.request(path)).value;}
 async refresh(){
  const epoch=this.api.epoch;
  const responses=await Promise.all(['/settings','/policy','/ai/providers','/ai/credentials','/ai/budget'].map(p=>this.api.request('/api/v1'+p)));
  assert(epoch===this.api.epoch,'ACCESS_CHANGED');
  [this.settings,this.policy]=responses.slice(0,2).map(r=>r.value);this.settingsETag=responses[0].etag;
  this.providers=responses[2].value.providers;this.credentials=responses[3].value.credentials;
  this.budget=responses[4].value;this.budgetETag=responses[4].etag;this.registryLoaded=true;
  await this.queryJobs();this.notify();
 }
 settingsViews(){return Object.entries(this.settings?.values??{}).map(([key,value])=>({key,scope:'user',value,effectiveFrom:'user',policyBlocked:this.settings.blocked?.some(b=>b.setting===key)??false}));}
 async settingsWrite(values){
  assert(this.settings?.schemaVersion===1&&this.settingsETag,'SETTINGS_READ_REQUIRED');
  try{const r=await this.api.request('/api/v1/settings',{method:'PUT',etag:this.settingsETag,body:{schemaVersion:1,values:data(values)}});this.settings=r.value;this.settingsETag=r.etag;this.notify();}
  catch(e){if(e.code==='SETTINGS_CONFLICT'){this.conflicts.push(e.details);this.notify();}throw e;}
 }
 async settingsUpdate(values){return this.settingsWrite({...this.settings?.values,...data(values)});}
 async importSettings(mode,document,confirmed){
  assert(confirmed===true,'CONFIRMATION_REQUIRED');assert(['merge','replace'].includes(mode),'SETTINGS_MODE');
  assert(this.settingsETag,'SETTINGS_READ_REQUIRED');
  const r=await this.api.request('/api/v1/settings/import',{method:'POST',etag:this.settingsETag,body:{mode,confirm:'import:'+mode,document:typeof document==='string'?parseJSON(document):data(document)}});
  this.settings=r.value;this.settingsETag=r.etag;this.notify();
 }
 async resetSettings(confirmed){
  assert(confirmed===true,'CONFIRMATION_REQUIRED');
  const r=await this.api.request('/api/v1/settings/reset',{method:'POST',etag:this.settingsETag,body:{confirm:'reset-settings'}});
  this.settings=r.value;this.settingsETag=r.etag;this.notify();
 }
 async updatePolicy(version,document,confirmed){
  assert(confirmed===true&&Number.isSafeInteger(version),'CONFIRMATION_REQUIRED');
  const r=await this.api.request('/api/v1/owner/policy',{method:'PUT',etag:'"r'+version+'"',body:Object.fromEntries(Object.entries(data(document)).filter(([key])=>key!=='version'))});this.policy=r.value;this.notify();
 }
 async setBudget({currency,perOperation,perDay,perMonth}){
  assert(/^[A-Z]{3}$/.test(currency),'CURRENCY_INVALID');assert(this.budgetETag,'BUDGET_READ_REQUIRED');
  const limit={currency,perOperationMicros:moneyMicros(perOperation),perDayMicros:moneyMicros(perDay),perMonthMicros:moneyMicros(perMonth)};
  const money=[...this.budget.money.filter(m=>m.currency!==currency),limit];
  const r=await this.api.request('/api/v1/ai/budget',{method:'PUT',etag:this.budgetETag,body:{money}});this.budget=r.value;this.budgetETag=r.etag;this.notify();
 }
 credential(providerId,{active=false}={}){
  const list=this.credentials.filter(c=>c.providerId===providerId&&!['revoked'].includes(c.status)&&(active?c.status==='active':true));
  assert(list.length<=1,'AI_CREDENTIAL_SELECTION_REQUIRED');return list[0]??null;
 }
 registry(){
  return this.providers.map(p=>{
   const cs=this.credentials.filter(c=>c.providerId===p.id&&c.status!=='revoked'),c=cs.length===1?cs[0]:null;
   const currency=p.prices?.currency??'',budget=this.budget.money.find(b=>b.currency===currency);
   const reserved=[...this.reservations.values()].filter(j=>j.providerId===p.id).reduce((n,j)=>n+j.reservedMicros,0);
   const legal=p.models.every(m=>Array.isArray(m.qualities)&&m.qualities.length&&Array.isArray(m.sizes)&&m.sizes.length);
   const available=p.allowed===true&&c?.status==='active'&&legal&&!!budget&&['perOperationMicros','perDayMicros','perMonthMicros'].every(k=>budget[k]>0);
   return {id:p.id,label:p.displayName??p.id,connected:c?.status==='active',models:p.models.map(m=>({id:m.id,label:m.displayName??m.id,modelVersion:m.version,supportsReference:m.referenceImages===true,referenceOptions:m.referenceOptions??null,referenceLimits:m.referenceLimits??null,
    qualities:(m.qualities??[]).map(id=>({id,label:id})),sizes:(m.sizes??[]).map(id=>({id,label:id})),legalOptions:p.prices?.tiers?.map(t=>({size:t.size,quality:t.quality}))??null})),
    currency,spent:null,reserved:moneyText(reserved),budget:budget?moneyText(budget.perMonthMicros):null,available:!!available,
    reason:!p.allowed?'POLICY_BLOCKED':cs.length>1?'AI_CREDENTIAL_SELECTION_REQUIRED':!c||c.status!=='active'?'CONNECT_YOUR_AI':!legal?'MODEL_OPTIONS_UNDECLARED':!budget?'AI_BUDGET_REQUIRED':!this.ledgerComplete?'Sổ chi phí mới tải một phần; chưa rõ số đã chi.':undefined,
    credential:c?{label:c.label,masked:c.masked,status:c.status,lastChecked:c.lastChecked}:null};
  });
 }
 async connect(providerId,secret){
  const p=this.providers.find(p=>p.id===providerId);assert(p?.allowed,'PROVIDER_UNSUPPORTED');assert(typeof secret==='string'&&secret.length>0&&secret.length<=16384,'KEY_INVALID');
  const old=this.credential(providerId),label=old?.label??(p.displayName??p.id)+' personal';
  let c;
  try{c=(await this.api.request('/api/v1/ai/credentials'+(old?'/'+encodeURIComponent(old.id):''),{method:old?'PUT':'POST',body:old?{key:secret,label,version:old.version}:{providerId,endpointId:p.endpointId,label,key:secret}})).value;}
  finally{secret='';}
  this.credentials=this.credentials.filter(x=>x.id!==c.id).concat(c);this.notify();
  const checked=(await this.api.request('/api/v1/ai/credentials/'+encodeURIComponent(c.id)+'/check',{method:'POST',body:{version:c.version}})).value;
  this.credentials=this.credentials.filter(x=>x.id!==c.id).concat(checked);this.notify();assert(checked.status==='active','CONNECT_YOUR_AI');
 }
 async disconnect(providerId){
  const c=this.credential(providerId);assert(c,'CREDENTIAL_NOT_FOUND');
  const r=(await this.api.request('/api/v1/ai/credentials/'+encodeURIComponent(c.id),{method:'DELETE',body:{version:c.version,confirm:'revoke:'+c.id}})).value;
  this.credentials=this.credentials.filter(x=>x.id!==c.id).concat(r);this.notify();
 }
 keepJob(j){
  assert(j.ownerId===this.api.userId,'RESPONSE_USER_MISMATCH');
  const old=this.jobs.get(j.id);if(!old||j.sequence>=old.sequence){this.jobs.set(j.id,j);if(j.accounting.reservedMicros>0)this.reservations.set(j.id,{providerId:j.providerId,reservedMicros:j.accounting.reservedMicros});else this.reservations.delete(j.id);}
 }
 jobView(j){
  const ctx=this.context(),a=j.accounting;
  return {id:j.id,operationId:j.operationId,providerId:j.providerId,modelId:j.modelId,createdAt:iso(j.createdAt),state:j.state,currency:a.currency,
   estimated:a.estimatedMicros===null?null:moneyText(a.estimatedMicros),actual:a.actualMicros===null?null:moneyText(a.actualMicros),reserved:moneyText(a.reservedMicros),accountingBasis:a.basis,periodUtc:a.day??'',unresolved:a.unresolved,
   artifacts:j.artifacts.map(a=>({id:a.id,label:a.mediaType,canApply:!!ctx&&j.projectId===ctx.id&&j.projectRevision===String(ctx.revision),reason:'Áp dụng cần đúng bản sửa dự án gốc và xác nhận rõ ràng.'}))};
 }
 async queryJobs(filter={}){
  const q=new URLSearchParams();
  for(const [k,v]of Object.entries(filter)){
   assert(['from','to','providerId','jobId','after'].includes(k),'AI_FILTER');
   if(v===undefined)continue;
   if(k==='from'||k==='to'){const n=/^\d+$/.test(v)?Number(v):Date.parse(v);assert(Number.isSafeInteger(n)&&n>=0,'AI_FILTER_TIME');q.set(k,String(n));}
   else q.set(k,v);
  }
  const r=await this.read('/api/v1/ai/jobs'+(q.size?'?'+q:''));
  for(const j of r.jobs)this.keepJob(j);
  const unresolved=[];
  for(const x of r.unresolved){let j=this.jobs.get(x.jobId);if(!j||!j.accounting.unresolved)j=(await this.read('/api/v1/ai/jobs/'+encodeURIComponent(x.jobId))).job;this.keepJob(j);unresolved.push(this.jobView(j));}
  if(!Object.keys(filter).length){
   this.ledgerComplete=!r.nextCursor;const reservations=new Map();
   for(const j of this.jobs.values())if(j.accounting.unresolved&&j.accounting.reservedMicros>0)reservations.set(j.id,{providerId:j.providerId,reservedMicros:j.accounting.reservedMicros});
   for(const state of ['reserved','submitted','running','unknown']){let after=null,count=0;do{
    const page=await this.read('/api/v1/ai/jobs?state='+state+'&limit=100'+(after?'&after='+encodeURIComponent(after):''));
    count+=page.jobs.length;assert(count<=10000,'AI_LEDGER_BUDGET');for(const j of page.jobs){this.keepJob(j);if(j.accounting.reservedMicros>0)reservations.set(j.id,{providerId:j.providerId,reservedMicros:j.accounting.reservedMicros});}after=page.nextCursor;
   }while(after);}
   this.reservations=reservations;
  }
  this.notify();return {jobs:r.jobs.map(j=>this.jobView(j)),nextCursor:r.nextCursor,unresolved};
 }
 guard(token){const c=this.context();assert(this.api.epoch===token.epoch&&this.api.userId===token.userId,'ACCESS_CHANGED');assert(c&&c.id===token.id&&String(c.revision)===token.revision,'AI_PROJECT_STALE');}
 token(){const c=this.context();assert(c,'PROJECT_REQUIRED');return {id:c.id,revision:String(c.revision),epoch:this.api.epoch,userId:this.api.userId};}
 async stageReference(request,token,m){
  const f=request.reference;assert(m.referenceImages===true,'REFERENCE_IMAGE_UNSUPPORTED');
  assert(m.referenceOptions?.some(o=>o.size===request.size&&o.quality===request.quality),'REFERENCE_OPTIONS_UNSUPPORTED');
  assert(f instanceof Blob&&typeof f.name==='string'&&['image/png','image/jpeg'].includes(f.type)&&f.size>0&&f.size<=8_000_000,'REFERENCE_IMAGE_LIMIT');
  const bytes=new Uint8Array(await f.arrayBuffer());this.guard(token);assert(bytes.length===f.size,'REFERENCE_IMAGE_LIMIT');
  const hash=await sha256(bytes);this.guard(token);let base64='';
  // Bounded chunks avoid spreading a multi-megabyte array on the JS stack.
  for(let i=0;i<bytes.length;i+=24576)base64+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)));
  const r=await this.api.request('/api/v1/ai/references',{method:'POST',body:{uploadId:request.operationId,projectId:token.id,projectRevision:token.revision,mediaType:f.type,byteLength:bytes.length,sha256:hash,base64}});
  this.guard(token);assert(r.value.reference.sha256===hash&&r.value.reference.byteLength===bytes.length,'REFERENCE_HASH');
  return r.value.reference;
 }
 async prepare(request){
  const snapshot={...request},old=this.preparing.get(request.operationId);
  const signature=JSON.stringify([request.providerId,request.modelId,request.prompt,request.quality,request.size]);
  if(old){assert(old.signature===signature&&old.file===request.reference,'IDEMPOTENCY_CONFLICT');return old.promise;}
  const promise=this.prepareOnce(snapshot),entry={signature,file:request.reference,promise};this.preparing.set(request.operationId,entry);
  try{return await promise;}finally{if(this.preparing.get(request.operationId)===entry)this.preparing.delete(request.operationId);}
 }
 async prepareOnce(request){
  const token=this.token(),ctx={id:token.id,revision:token.revision};
  const p=this.providers.find(p=>p.id===request.providerId),m=p?.models.find(m=>m.id===request.modelId),c=this.credential(request.providerId,{active:true});
  assert(p?.allowed&&m&&c,'CONNECT_YOUR_AI');
  assert(m.qualities?.includes(request.quality)&&m.sizes?.includes(request.size),'AI_OPTIONS_REQUIRED');
  if(p.prices?.tiers)assert(p.prices.tiers.some(t=>t.quality===request.quality&&t.size===request.size),'AI_OPTIONS_COMBINATION');
  const body={operationId:request.operationId,credentialId:c.id,modelId:m.id,modelVersion:m.version,projectId:ctx.id,projectRevision:String(ctx.revision),prompt:request.prompt,options:{quality:request.quality,size:request.size}};
  if(request.reference)body.reference=await this.stageReference(request,token,m);
  this.guard(token);const {job}=await this.readPrepared(body,request.operationId);this.guard(token);this.keepJob(job);this.notify();
  return {jobId:job.id,quoteHash:job.quoteHash,providerLabel:p.displayName??p.id,credentialLabel:c.label+' '+c.masked,recipient:job.quote.recipient,dataToSend:job.quote.dataToSend,currency:job.quote.currency,maximumCost:moneyText(job.quote.maxCostMicros),expiresAt:job.quote.expiresAt,unknowns:job.quote.unknowns};
 }
 async readPrepared(body,key){return (await this.api.request('/api/v1/ai/jobs',{method:'POST',idempotencyKey:key,body})).value;}
 async submit({jobId,quoteHash,consent}){
  const j=this.jobs.get(jobId),ctx=this.context();assert(j&&j.quoteHash===quoteHash&&consent===true,'CONSENT_REQUIRED');
  assert(j.quote.expiresAt>this.now(),'QUOTE_EXPIRED');assert(ctx&&j.projectId===ctx.id&&j.projectRevision===String(ctx.revision),'AI_PROJECT_STALE');
  const r=await this.api.request('/api/v1/ai/jobs/'+encodeURIComponent(jobId)+'/submit',{method:'POST',body:{quoteHash,consent:true}});this.keepJob(r.value.job);this.notify();
 }
 async cancel(jobId){const r=await this.api.request('/api/v1/ai/jobs/'+encodeURIComponent(jobId)+'/cancel',{method:'POST',body:{}});this.keepJob(r.value.job);this.notify();}
 async closeUnknown(jobId,reason,confirmed){assert(confirmed===true&&typeof reason==='string'&&reason.trim().length>0,'CONFIRMATION_REQUIRED');const r=await this.api.request('/api/v1/ai/jobs/'+encodeURIComponent(jobId)+'/close-unknown',{method:'POST',body:{reason}});this.keepJob(r.value.job);this.notify();}
 async artifact(id,signal){
  const token=this.token();const meta=await this.read('/api/v1/ai/artifacts/'+encodeURIComponent(id)),j=(await this.read('/api/v1/ai/jobs/'+encodeURIComponent(meta.jobId))).job;this.guard(token);this.keepJob(j);
  const ctx=this.context();assert(ctx&&j.projectId===ctx.id&&j.projectRevision===String(ctx.revision),'AI_RESULT_STALE');
  const result=await this.api.request('/api/v1/ai/artifacts/'+encodeURIComponent(id)+'/download',{raw:true,maxBytes:12_000_000,signal});
  assert(result.bytes.length===meta.byteLength&&await sha256(result.bytes)===meta.sha256&&result.mediaType===meta.mediaType,'ARTIFACT_HASH');
  this.guard(token);return {name:'ai-'+id+(meta.mediaType==='image/png'?'.png':'.jpg'),mediaType:meta.mediaType,bytes:result.bytes};
 }
 async listUsers(){const r=await this.read('/api/v1/owner/users');return r.users.map(u=>({...userView(u),active:u.status==='active'}));}
 async invite({issuer,subject}){const r=await this.api.request('/api/v1/owner/invites',{method:'POST',body:{issuer,subject,confirm:'invite'}});return this.api.origin+'/#invite='+encodeURIComponent(r.value.inviteToken);}
 async updateUser(id,v){
  assert(v.confirmed===true,'CONFIRMATION_REQUIRED');
  const actions=[v.active!==undefined?(v.active?'restore':'suspend'):null,v.role?'role':null,v.delete?'delete':null,v.revokeSessions?'revoke-sessions':null].filter(Boolean);
  assert(actions.length===1,'ONE_ACCOUNT_ACTION_REQUIRED');const action=actions[0];
  if(action==='delete')await this.read('/api/v1/owner/users/'+encodeURIComponent(id)+'/deletion-impact');
  await this.api.request('/api/v1/owner/users/'+encodeURIComponent(id),{method:'POST',body:{action,confirm:action+':'+id,...(action==='role'?{role:v.role}:{})}});
 }
}
