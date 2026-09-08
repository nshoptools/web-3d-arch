import { fail, exact, canonical, integer, id, str, sha, parse } from './core.mjs';
const keys=['units','language','fontSize','designDefaults','printerProfiles','printerProfileSources','calibrationProfiles','presets','uploadedFontReferences','favorites','recent','savedPrompts','aiSelection','shortcuts','panelPreferences'];
const denied=/^(?:secret|api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|password|session(?:id)?|csrf|owner(?:id)?|userId|role|authVersion|handle|directoryHandle|mirrorPath|deviceId|drawerState)$/i;
function safeData(v,depth=0) {
  fail(depth<=24,400,'SETTINGS_DEPTH');
  if(v && typeof v==='object') for(const [k,x] of Object.entries(v)){fail(!denied.test(k),400,'SETTING_SCOPE_FORBIDDEN');safeData(x,depth+1);}
}
export function validateSettings(value) {
  exact(value,keys,[]); safeData(value); canonical(value);
  if(value.units!==undefined) fail(['mm','in'].includes(value.units),400,'INVALID_UNITS');
  if(value.language!==undefined) str(value.language,30);
  if(value.fontSize!==undefined) integer(value.fontSize,48,10);
  for(const [k,limit] of [['printerProfiles',50],['printerProfileSources',50],['calibrationProfiles',50],['presets',20],['uploadedFontReferences',8],['favorites',4096],['recent',27],['savedPrompts',30]]) {
    if(value[k]!==undefined) fail(Array.isArray(value[k]) && value[k].length<=limit,400,'SETTINGS_LIMIT',{field:k,limit});
  }
  if(value.printerProfileSources){
    let total=0;const seen=new Set();
    for(const p of value.printerProfileSources){
      exact(p,['profileHash','sha256','filename','byteLength','encoding','data']);
      fail(/^[a-f0-9]{64}$/.test(p.profileHash)&&/^[a-f0-9]{64}$/.test(p.sha256)&&!seen.has(p.profileHash),400,'PROFILE_ORIGINAL_INVALID');seen.add(p.profileHash);
      str(p.filename,240);fail(p.filename.isWellFormed()&&!/[\\/\x00-\x1f\x7f]/.test(p.filename),400,'PROFILE_ORIGINAL_INVALID');integer(p.byteLength,1024*1024,1);total+=p.byteLength;
      fail(p.encoding==='base64'&&typeof p.data==='string'&&p.data.length===4*Math.ceil(p.byteLength/3)&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.data),400,'PROFILE_ORIGINAL_INVALID');
      const bytes=Buffer.from(p.data,'base64');fail(bytes.length===p.byteLength&&bytes.toString('base64')===p.data&&sha(bytes)===p.sha256,400,'PROFILE_ORIGINAL_INVALID');
      // Integrity only: this does not prove vendor provenance, slicer support or fit.
      // Legacy/unknown profiles without originals remain inspectable/deletable.
      let record;
      try {record=parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {fail(false,400,'PROFILE_ORIGINAL_INVALID');}
      exact(record,['payload','sha256']);
      fail(record.payload&&typeof record.payload==='object'&&!Array.isArray(record.payload)&&record.sha256===p.profileHash&&sha(canonical(record.payload))===p.profileHash,400,'PROFILE_ORIGINAL_INVALID');
      const referenced=(value.printerProfiles??[]).filter(v=>v?.sha256===p.profileHash);
      fail(referenced.length>0&&referenced.every(v=>canonical(v)===canonical(record)),400,'PROFILE_ORIGINAL_INVALID');
    }
    fail(total<=2*1024*1024,400,'PROFILE_ORIGINAL_BUDGET');
  }
  if(value.aiSelection!==undefined) {
    exact(value.aiSelection,['providerId','modelId','modelVersion','quality','size'],['providerId','modelId','modelVersion']);
    for(const v of Object.values(value.aiSelection)) str(v,100);
  }
  if(value.calibrationProfiles) for(const p of value.calibrationProfiles) {
    fail(p && ['printerIdentity','nozzle','material','slicer','profileHash'].every(k=>Object.hasOwn(p,k)),400,'CALIBRATION_IDENTITY_REQUIRED');
  }
  return value;
}
// Domain caller supplies snapshots/preset values. Never mutates any argument or applies a profile implicitly.
export function resolveSettings({product={},user={},preset={},project=null,policy}) {
  const out={};
  const apply=(values,scope,source)=>{for(const [k,value] of Object.entries(values)) out[k]={value:structuredClone(value),scope,source};};
  apply(product,'user','product-default'); apply(user,'user','user-default');
  if(project!==null) { for(const k of Object.keys(out)) delete out[k]; apply(project,'project','project-snapshot'); }
  else apply(preset,'project','selected-preset');
  const selection=out.aiSelection?.value;
  return {values:out,policyVersion:policy.version,blocked:selection && !policy.allowedProviders.includes(selection.providerId)?[{code:'policy-blocked',setting:'aiSelection',value:selection,policyVersion:policy.version,action:'choose-allowed-provider'}]:[]};
}
export class Settings {
  constructor(s,policy,clock) {this.s=s;this.policy=policy;this.clock=clock;}
  read(user) {
    const r=this.s.get('SELECT * FROM settings WHERE user_id=?',user);
    const values=r?JSON.parse(r.json):{};
    return {schemaVersion:1,revision:r?.revision??0,values,scopes:Object.fromEntries(Object.keys(values).map(k=>[k,{scope:'user',source:'user-default'}])),provenance:r?JSON.parse(r.provenance):null,
      ...{blocked:resolveSettings({user:values,policy:this.policy.read()}).blocked}};
  }
  write(user,body,revision,source='edit') {
    exact(body,['schemaVersion','values','resolveConflictId'],['schemaVersion','values']);
    fail(body.schemaVersion===1,400,'SCHEMA_UNSUPPORTED');validateSettings(body.values);
    const json=canonical(body.values), size=Buffer.byteLength(json);
    const limit=this.policy.read().quotas.settingsBytes;
    fail(size<=limit,413,'QUOTA_EXCEEDED',{dimension:'settings-bytes',used:size,limit});
    const result=this.s.tx(()=>{
      const old=this.read(user);
      let conflict=null;
      if(body.resolveConflictId) {
        conflict=this.s.get('SELECT * FROM conflicts WHERE id=? AND user_id=?',body.resolveConflictId,user);fail(conflict,404,'NOT_FOUND');
      }
      if(old.revision!==revision) {
        const current=canonical(old.values), conflictId=id();
        this.policy.storage(user,size+Buffer.byteLength(current),1); this.policy.sync(user,size);
        this.s.run('INSERT INTO conflicts VALUES(?,?,?,?,?,?)',conflictId,user,revision,current,json,this.clock());
        return {conflict:{id:conflictId,revision:old.revision,current:old.values,incoming:body.values}};
      }
      this.policy.storage(user,size-Buffer.byteLength(canonical(old.values)),old.revision===0?1:0); this.policy.sync(user,size);
      this.s.run('INSERT INTO settings VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,json=excluded.json,provenance=excluded.provenance',user,revision+1,json,canonical({source,at:this.clock(),baseRevision:revision,resolvedConflictId:conflict?.id??null}));
      if(conflict) this.s.run('DELETE FROM conflicts WHERE id=? AND user_id=?',conflict.id,user);
      return {value:this.read(user)};
    });
    if(result.conflict) throw Object.assign(new Error('SETTINGS_CONFLICT'),{status:409,code:'SETTINGS_CONFLICT',details:result.conflict});
    return result.value;
  }
  conflicts(user) { return this.s.all('SELECT * FROM conflicts WHERE user_id=? ORDER BY created,id LIMIT 100',user).map(r=>({id:r.id,baseRevision:r.base_revision,current:JSON.parse(r.current_json),incoming:JSON.parse(r.incoming_json),created:r.created})); }
}

