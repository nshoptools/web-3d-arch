import { createPublicKey, verify, createHash } from 'node:crypto';
import { token, sha, fail, str, parse, canonical, equal } from './core.mjs';
import { endpoint, boundedRequest } from './network.mjs';
export class Oidc {
  constructor(config,{testOnly=false,clock=Date.now}={}) {
    this.config=config;this.testOnly=testOnly;this.clock=clock;this.flows=new Map();
    if(!config)return;
    for(const k of ['issuer','authorizationEndpoint','tokenEndpoint','jwksUri']) endpoint(config[k],{testOnly});
    fail(typeof config.clientId==='string' && config.clientId.length>0,500,'OIDC_CONFIG_INVALID');
    fail(['none','client_secret_post','client_secret_basic'].includes(config.authMethod),500,'OIDC_AUTH_METHOD_UNSUPPORTED');
    if(config.authMethod!=='none')fail(typeof config.clientSecret==='string'&&config.clientSecret.length>0,500,'OIDC_SECRET_REQUIRED');
  }
  start({redirectUri,deviceId,inviteToken=null,session=null,reauth=false}) {
    fail(this.config,503,'OIDC_NOT_CONFIGURED');
    for(const [k,v]of this.flows)if(v.expires<=this.clock())this.flows.delete(k);
    fail(this.flows.size<1000,429,'AUTH_CAPACITY');
    if(reauth)fail(session,401,'AUTH_REQUIRED');
    const state=token(), browser=token(), nonce=token(), verifier=token();
    const f={stateHash:sha(state),browserHash:sha(browser),nonce,verifier,deviceId,inviteHash:inviteToken?sha(inviteToken):null,session,reauth,created:this.clock(),expires:this.clock()+600_000,processing:false,cancelled:false,redirectUri};
    this.flows.set(f.stateHash,f);
    const u=new URL(this.config.authorizationEndpoint);
    for(const [k,v]of Object.entries({client_id:this.config.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(reauth?{max_age:'0',prompt:'login'}:{})}))u.searchParams.set(k,v);
    return {authorizationUrl:u.href,browser};
  }
  cancel(browser,sessionId) { for(const f of this.flows.values())if((browser&&f.browserHash===sha(browser))||(sessionId&&f.session?.public_id===sessionId))f.cancelled=true; }
  async callback(state,browser,code) {
    const f=this.flows.get(sha(str(state,200)));
    fail(f&&!f.cancelled&&!f.processing&&f.expires>this.clock()&&browser&&equal(f.browserHash,sha(browser)),400,'OIDC_STATE_INVALID');
    f.processing=true;
    try {
      const cfg=this.config;
      const form=new URLSearchParams({grant_type:'authorization_code',code:str(code,4096),redirect_uri:f.redirectUri,client_id:cfg.clientId,code_verifier:f.verifier});
      const headers={'content-type':'application/x-www-form-urlencoded'};
      if(cfg.authMethod==='client_secret_post')form.set('client_secret',cfg.clientSecret);
      if(cfg.authMethod==='client_secret_basic')headers.authorization='Basic '+Buffer.from(encodeURIComponent(cfg.clientId)+':'+encodeURIComponent(cfg.clientSecret)).toString('base64');
      const r=await boundedRequest(cfg.tokenEndpoint,{method:'POST',headers,body:form.toString(),testOnly:this.testOnly});
      const tokens=parse(r.bytes.toString('utf8'));
      const identity=await this.verifyToken(tokens.id_token,f);
      fail(!f.cancelled&&f.expires>this.clock(),400,'OIDC_STATE_INVALID');
      return {identity,flow:f};
    } finally {this.flows.delete(f.stateHash);}
  }
  async verifyToken(jwt,f) {
    str(jwt,32768);
    const parts=jwt.split('.');fail(parts.length===3&&parts.every(p=>/^[a-zA-Z0-9_-]+$/.test(p)),401,'OIDC_TOKEN_INVALID');
    const [h,p]=parts.slice(0,2).map(x=>parse(Buffer.from(x,'base64url').toString('utf8')));
    fail(h.alg==='RS256'&&typeof h.kid==='string'&&!h.crit&&!h.jku&&!h.x5u,401,'OIDC_TOKEN_INVALID');
    const r=await boundedRequest(this.config.jwksUri,{testOnly:this.testOnly});
    const jwks=parse(r.bytes.toString('utf8'));
    fail(Array.isArray(jwks.keys)&&jwks.keys.length<=50,401,'OIDC_TOKEN_INVALID');
    const matches=jwks.keys.filter(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256')&&(!k.key_ops||k.key_ops.includes('verify'))&&!k.d);
    fail(matches.length===1,401,'OIDC_TOKEN_INVALID');
    const key=createPublicKey({key:matches[0],format:'jwk'});
    fail(key.asymmetricKeyDetails.modulusLength>=2048&&verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')),401,'OIDC_TOKEN_INVALID');
    const now=Math.floor(this.clock()/1000),aud=Array.isArray(p.aud)?p.aud:[p.aud];
    fail(p.iss===this.config.issuer&&aud.includes(this.config.clientId)&&(aud.length===1||p.azp===this.config.clientId)&&(!p.azp||p.azp===this.config.clientId),401,'OIDC_TOKEN_INVALID');
    fail(Number.isSafeInteger(p.exp)&&p.exp>now&&Number.isSafeInteger(p.iat)&&p.iat<=now+60&&p.iat>=now-600&&(!p.nbf||p.nbf<=now),401,'OIDC_TOKEN_INVALID');
    fail(typeof p.sub==='string'&&p.sub.length>0&&p.sub.length<=255&&equal(p.nonce,f.nonce),401,'OIDC_TOKEN_INVALID');
    if(f.reauth)fail(Number.isSafeInteger(p.auth_time)&&p.auth_time>=Math.floor(f.created/1000)-60&&p.auth_time<=now+60,401,'REAUTH_REQUIRED');
    return {issuer:p.iss,subject:p.sub};
  }
}

