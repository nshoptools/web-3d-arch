import { fail, exact, integer, str, canonical, period, Fault } from './core.mjs';
export function moneyLimits(v) {
  fail(Array.isArray(v) && v.length<=10,400,'INVALID_MONEY_LIMITS');
  const seen=new Set();
  for(const x of v) {
    exact(x,['currency','perOperationMicros','perDayMicros','perMonthMicros']);
    fail(/^[A-Z]{3}$/.test(x.currency) && !seen.has(x.currency),400,'INVALID_CURRENCY'); seen.add(x.currency);
    for(const k of ['perOperationMicros','perDayMicros','perMonthMicros']) integer(x[k]);
  }
  return v;
}
export function validatePolicy(v) {
  exact(v,['schemaVersion','allowedProviders','quotas','ai']);
  fail(v.schemaVersion===1,400,'SCHEMA_UNSUPPORTED');
  fail(Array.isArray(v.allowedProviders) && v.allowedProviders.length<=20,400,'INVALID_PROVIDERS');
  for(const x of v.allowedProviders) str(x,80);
  exact(v.quotas,['settingsBytes','storageBytes','storageObjects','syncBytesPerDay','protectedRequestsPerMinute','protectedConcurrency','authRequestsPerMinute','authConcurrency']);
  for(const [k,x] of Object.entries(v.quotas)) integer(x, k.endsWith('Bytes')||k==='syncBytesPerDay'?1_000_000_000:1_000_000,1);
  fail(v.quotas.settingsBytes<=32_000_000 && v.quotas.protectedConcurrency<=100 && v.quotas.authConcurrency<=100,400,'QUOTA_OUT_OF_RANGE');
  exact(v.ai,['requestsPerDay','bytesPerDay','concurrency','money']);
  integer(v.ai.requestsPerDay,1_000_000); integer(v.ai.bytesPerDay,1_000_000_000);
  integer(v.ai.concurrency,10,1); moneyLimits(v.ai.money);
  return v;
}
export class Policy {
  constructor(store, clock) { this.s=store; this.clock=clock; this.active=new Map(); }
  read() {
    const r=this.s.get('SELECT * FROM policy WHERE id=1');
    fail(r,503,'POLICY_REQUIRED');
    return {version:r.version,...JSON.parse(r.json)};
  }
  replace(value, revision, actor) {
    validatePolicy(value);
    return this.s.tx(()=>{
      const old=this.read(); fail(revision===old.version,409,'REVISION_CONFLICT',{revision:old.version});
      this.s.run('UPDATE policy SET version=version+1,json=? WHERE id=1',canonical(value));
      this.s.audit(actor,null,'policy.replace',this.clock());
      return this.read();
    });
  }
  addCounter(user,dimension,p,amount,limit) {
    const used=this.s.get('SELECT used FROM counters WHERE user_id=? AND dimension=? AND period=?',user,dimension,p)?.used??0;
    fail(used+amount<=limit,429,'QUOTA_EXCEEDED',{dimension,period:p,used,requested:amount,limit});
    this.s.run('INSERT INTO counters VALUES(?,?,?,?) ON CONFLICT(user_id,dimension,period) DO UPDATE SET used=used+excluded.used',user,dimension,p,amount);
  }
  admit(key, auth=false) {
    const q=this.read().quotas, current=this.active.get(key)??0, max=auth?q.authConcurrency:q.protectedConcurrency;
    fail(current<max,429,'QUOTA_EXCEEDED',{dimension:auth?'auth-concurrency':'http-concurrency',used:current,limit:max});
    this.s.tx(()=>this.addCounter(key,auth?'auth-requests':'http-requests',String(Math.floor(this.clock()/60_000)),1,auth?q.authRequestsPerMinute:q.protectedRequestsPerMinute));
    this.active.set(key,current+1);
    let done=false; return ()=>{if(!done){done=true;const v=(this.active.get(key)??1)-1;if(v)this.active.set(key,v);else this.active.delete(key);}};
  }
  usage(user) {
    const scalar=(sql)=>this.s.get(sql,user)?.n??0;
    const settings=scalar('SELECT COALESCE(SUM(length(CAST(json AS BLOB))),0) n FROM settings WHERE user_id=?');
    const conflicts=scalar('SELECT COALESCE(SUM(length(CAST(current_json AS BLOB))+length(CAST(incoming_json AS BLOB))),0) n FROM conflicts WHERE user_id=?');
    const jobs=scalar('SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) n FROM jobs WHERE user_id=?');
    const images=scalar('SELECT COALESCE(SUM(COALESCE(length(bytes),0)+COALESCE(length(thumbnail),0)+512),0) n FROM image_references WHERE user_id=?');
    const thumbs=scalar('SELECT COALESCE(SUM(length(i.thumbnail)),0) n FROM artifact_images i JOIN artifacts a ON a.id=i.id WHERE a.user_id=?');
    const imageObjects=scalar('SELECT count(*) n FROM image_references WHERE user_id=?');
    const artifacts=scalar('SELECT COALESCE(SUM(length(bytes)),0) n FROM artifacts WHERE user_id=?');
    const credentials=scalar("SELECT COALESCE(SUM(COALESCE(length(CAST(sealed AS BLOB)),0)+length(CAST(label AS BLOB))),0) n FROM credentials WHERE user_id=?");
    const budgets=scalar('SELECT COALESCE(SUM(length(CAST(json AS BLOB))),0) n FROM budgets WHERE user_id=?');
    const stage=scalar("SELECT COALESCE(SUM(byte_cap),0) n FROM jobs WHERE user_id=? AND state IN ('reserved','submitted','running')");
    const objects=scalar('SELECT count(*) n FROM settings WHERE user_id=?')+scalar('SELECT count(*) n FROM conflicts WHERE user_id=?')+scalar('SELECT count(*) n FROM jobs WHERE user_id=?')+scalar('SELECT count(*) n FROM artifacts WHERE user_id=?');
    return {bytes:settings+conflicts+jobs+artifacts+credentials+budgets+images+thumbs,stagedBytes:stage,objects:objects+imageObjects+scalar('SELECT count(*) n FROM credentials WHERE user_id=?')+scalar('SELECT count(*) n FROM budgets WHERE user_id=?')+scalar("SELECT count(*) n FROM jobs WHERE user_id=? AND state IN ('reserved','submitted','running')")};
  }
  storage(user,delta,objects=0) {
    const q=this.read().quotas, u=this.usage(user);
    for(const [dimension,used,requested,limit] of [['storage-bytes',u.bytes+u.stagedBytes,delta,q.storageBytes],['storage-objects',u.objects,objects,q.storageObjects]])
      fail(used+requested<=limit,429,'QUOTA_EXCEEDED',{dimension,used,requested,limit});
  }
  sync(user,bytes) { this.addCounter(user,'sync-bytes',period(this.clock()).day,bytes,this.read().quotas.syncBytesPerDay); }
  cleanup() { this.s.run("DELETE FROM counters WHERE (dimension IN ('http-requests','auth-requests') AND CAST(period AS INTEGER)<?) OR (dimension='sync-bytes' AND period<?)",Math.floor(this.clock()/60_000)-2,period(this.clock()-90*86_400_000).day); }
}
export const providerAllowed=(policy,provider)=>policy.allowedProviders.includes(provider);
