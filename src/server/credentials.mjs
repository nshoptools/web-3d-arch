import { id,fail,exact,str,canonical,Fault } from './core.mjs';
import { credentialContext } from './vault.mjs';
const visible=c=>({id:c.id,providerId:c.provider_id,endpointId:c.endpoint_id,label:c.label,masked:'••••',status:c.status,version:c.version,lastChecked:c.checked});
export class Credentials {
  constructor(s,vault,providers,policy,clock,accounts){Object.assign(this,{s,vault,providers,policy,clock,accounts});this.onChange=()=>{};}
  owned(user,credentialId) {const c=this.s.get('SELECT * FROM credentials WHERE id=? AND user_id=?',credentialId,user);fail(c,404,'NOT_FOUND');return c;}
  list(user){return this.s.all('SELECT * FROM credentials WHERE user_id=? ORDER BY id',user).map(visible);}
  permitted(c) {
    const p=this.providers.get(c.provider_id);fail(this.policy.read().allowedProviders.includes(c.provider_id),403,'POLICY_BLOCKED');
    fail(c.endpoint_id===p.metadata.endpointId,409,'ENDPOINT_VERSION_CHANGED');return p;
  }
  put(user,body,credentialId=null) {
    exact(body,credentialId?['key','label','version']:['key','label','providerId','endpointId']);
    str(body.key,8192,8);str(body.label,80);fail(!body.label.includes(body.key),400,'SECRET_IN_LABEL');
    let result;
    this.s.tx(()=>{
      let c=credentialId?this.owned(user,credentialId):{id:id(),user_id:user,provider_id:body.providerId,endpoint_id:body.endpointId,version:0};
      this.permitted(c);
      if(credentialId)fail(body.version===c.version,409,'CREDENTIAL_VERSION_CHANGED');
      else fail(this.s.get('SELECT count(*) n FROM credentials WHERE user_id=?',user).n<16,429,'CREDENTIAL_LIMIT');
      c={...c,version:c.version+1};
      const plaintext=Buffer.from(body.key);let encrypted;
      try{encrypted=this.vault.seal(credentialContext(c),plaintext);}finally{plaintext.fill(0);}
      const oldBytes=credentialId?Buffer.byteLength(c.sealed??'')+Buffer.byteLength(c.label):0;
      this.policy.storage(user,Buffer.byteLength(encrypted.sealed)+Buffer.byteLength(body.label)-oldBytes,credentialId?0:1);
      this.policy.sync(user,Buffer.byteLength(body.key)+Buffer.byteLength(body.label));
      this.s.run('INSERT INTO credentials VALUES(?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET label=excluded.label,status=excluded.status,version=excluded.version,key_version=excluded.key_version,sealed=excluded.sealed,checked=NULL',c.id,user,c.provider_id,c.endpoint_id,body.label,'unchecked',c.version,encrypted.keyVersion,encrypted.sealed);
      result=visible(this.owned(user,c.id));
    });
    this.onChange(user,result.id);return result;
  }
  disable(user,credentialId,{version,confirm},revoke=false) {
    let result;
    this.s.tx(()=>{
      const c=this.owned(user,credentialId);fail(c.version===version,409,'CREDENTIAL_VERSION_CHANGED');
      fail(confirm===(revoke?'revoke:':'disable:')+credentialId,400,'CONFIRMATION_REQUIRED');
      let encrypted=null, keyVersion=c.key_version;
      if(!revoke && c.sealed) {
        const plain=this.vault.open(credentialContext(c),c.key_version,c.sealed);
        try{const e=this.vault.seal(credentialContext({...c,version:c.version+1}),plain);encrypted=e.sealed;keyVersion=e.keyVersion;}finally{plain.fill(0);}
      }
      this.s.run('UPDATE credentials SET status=?,sealed=?,key_version=?,version=version+1,checked=NULL WHERE id=? AND user_id=?',revoke?'revoked':'disabled',encrypted,keyVersion,credentialId,user);
      // Explicit replacement is required to reactivate. Revoke removes ciphertext immediately.
      result=visible(this.owned(user,credentialId));
    });
    this.onChange(user,credentialId);return result;
  }
  async check(a,credentialId,version) {
    const c=this.owned(a.user.id,credentialId);fail(c.version===version,409,'CREDENTIAL_VERSION_CHANGED');
    fail(c.sealed&&['unchecked','active','invalid'].includes(c.status),409,'CREDENTIAL_INACTIVE');
    const provider=this.permitted(c);
    fail(provider.metadata.keyCheckCostMicros===0&&typeof provider.checkKey==='function',422,'FREE_KEY_CHECK_UNAVAILABLE');
    const secret=this.vault.open(credentialContext(c),c.key_version,c.sealed);
    let result;
    try {
      result=await Promise.race([provider.checkKey({secret,signal:AbortSignal.timeout(10_000)}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),10_000);t.unref();})]);
    } catch(e) {
      const allowed=['PROVIDER_PERMISSION','PROVIDER_QUOTA','PROVIDER_CREDIT','PROVIDER_RATE_LIMIT','PROVIDER_SERVER_ERROR','PROVIDER_RESPONSE_INVALID','PROVIDER_TIMEOUT_UNKNOWN','PROVIDER_DELIVERY_UNKNOWN','PROVIDER_CANCELLED'];
      throw new Fault(502,allowed.includes(e?.code)?e.code:'KEY_CHECK_UNAVAILABLE');
    } finally {secret.fill(0);}
    this.accounts.authenticate(a.raw,false);
    fail(this.owned(a.user.id,credentialId).version===version,409,'CREDENTIAL_VERSION_CHANGED');
    fail(result&&typeof result.valid==='boolean',502,'KEY_CHECK_UNAVAILABLE');
    this.s.run('UPDATE credentials SET status=?,checked=? WHERE id=? AND user_id=? AND version=?',result.valid?'active':'invalid',this.clock(),credentialId,a.user.id,version);
    return visible(this.owned(a.user.id,credentialId));
  }
}
