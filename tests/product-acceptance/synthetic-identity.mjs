// Test-only identity/provider fixture; product backend is the exact release runtime. No external provider request.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes,randomUUID,generateKeyPairSync,sign,createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import {pathToFileURL} from 'node:url';
const {createBackend,SID}=await import(pathToFileURL(process.env.ACCEPTANCE_RELEASE_ROOT+'/src/server/app.mjs').href);
export const uid=()=>randomUUID();
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
export function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
export const defaultPolicy=()=>({schemaVersion:1,allowedProviders:['test-provider'],quotas:{settingsBytes:262144,storageBytes:20_000_000,storageObjects:2000,syncBytesPerDay:20_000_000,protectedRequestsPerMinute:2000,protectedConcurrency:50,authRequestsPerMinute:1000,authConcurrency:50},ai:{requestsPerDay:1000,bytesPerDay:20_000_000,concurrency:1,money:[]}});
export const money=(cap=1000,currency='USD')=>({currency,perOperationMicros:cap,perDayMicros:cap,perMonthMicros:cap});
export class TestProvider {
  constructor() {
    this.metadata={id:'test-provider',version:'test-v1',endpointId:'test-endpoint',endpointUrl:'http://127.0.0.1:9/synthetic-no-network-provider',testOnly:true,
      models:[{id:'test-image',version:'test-model-v1',referenceImages:false,qualities:['test'],sizes:['1x1']}],keyCheckCostMicros:0,prices:{version:'test-price-v1',date:'2026-09-08',currency:'USD',testOnly:true}};
    this.calls=[];this.pending=new Map();this.cap=60;this.currency='USD';this.mode='pending';this.checks=0;this.checkGate=null;this.checkValid=true;
  }
  quote(){return {currency:this.currency,maxCostMicros:this.cap,maxOutputBytes:4096,priceVersion:'test-price-v1',priceDate:'2026-09-08',inputLimit:{graphemes:4000},outputLimit:{images:1,bytes:4096},unknowns:['actual-cost-until-provider-settlement']};}
  async checkKey(){this.checks++;if(this.checkGate)await this.checkGate.promise;return {valid:this.checkValid};}
  submit(context) {
    this.calls.push({jobId:context.jobId,operationId:context.operationId,secretHash:hash(context.secret)});
    if(this.mode==='throw')throw new Error('synthetic ambiguous transport with '+context.secret.toString('utf8'));
    context.running();
    const gate=deferred();this.pending.set(context.jobId,gate);
    if(this.mode==='success')gate.resolve(this.result());
    return gate.promise;
  }
  result({actual=40,state='succeeded',artifact=true,eventId=uid(),currency=this.currency,...rest}={}) {
    return {eventId,state,actualMicros:actual,currency,requestId:'provider-request-'+uid(),...(artifact&&state==='succeeded'?{artifact:{mediaType:'image/png',bytes:png}}:{}),...rest};
  }
  complete(jobId,result=this.result()){this.pending.get(jobId).resolve(result);return result;}
}
export async function idp(clock) {
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'test-signing-key',alg:'RS256',use:'sig'};
  const codes=new Map();let origin,block=null;
  const server=createServer(async(req,res)=>{
    try {
      if(req.url==='/jwks'){res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[jwk]}));return;}
      if(req.url==='/token'&&req.method==='POST'){
        const chunks=[];for await(const c of req)chunks.push(c);
        const p=new URLSearchParams(Buffer.concat(chunks).toString()),c=codes.get(p.get('code'));codes.delete(p.get('code'));
        assert.ok(c,'known one-use auth code');
        assert.equal(createHash('sha256').update(p.get('code_verifier')).digest('base64url'),c.challenge);
        assert.equal(p.get('redirect_uri'),c.redirectUri);
        if(block)await block.promise;
        const n=Math.floor(clock()/1000),claims={iss:origin,sub:c.subject,aud:'test-client',iat:n,exp:n+300,auth_time:n,nonce:c.nonce,...c.overrides};
        const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-signing-key'})).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url');
        let sig=sign('RSA-SHA256',Buffer.from(h+'.'+b),privateKey).toString('base64url');
        if(c.badSignature)sig=(sig[0]==='A'?'B':'A')+sig.slice(1);
        res.setHeader('content-type','application/json');res.end(JSON.stringify({id_token:h+'.'+b+'.'+sig}));return;
      }
      res.statusCode=404;res.end();
    }catch{res.statusCode=400;res.end('{}');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  return {origin,config:{issuer:origin,authorizationEndpoint:origin+'/authorize',tokenEndpoint:origin+'/token',jwksUri:origin+'/jwks',clientId:'test-client',authMethod:'none'},
    issue(subject,authorizationUrl,overrides={},badSignature=false){
      const u=new URL(authorizationUrl),code=randomBytes(24).toString('base64url');
      assert.equal(u.origin,origin);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('response_type'),'code');
      codes.set(code,{subject,nonce:u.searchParams.get('nonce'),challenge:u.searchParams.get('code_challenge'),redirectUri:u.searchParams.get('redirect_uri'),overrides,badSignature});
      return '/api/v1/auth/callback?state='+u.searchParams.get('state')+'&code='+code;
    },setBlock(g){block=g;},
    async close(){server.closeIdleConnections();await new Promise(r=>server.close(r));}
  };
}
export class Client {
  constructor(f){this.f=f;this.cookies=new Map();this.csrf=null;this.user=null;this.deviceId=uid();}
  async request(method,path,data,headers={}) {
    const h={...(!['GET','HEAD'].includes(method)?{'content-type':'application/json',Origin:this.f.app.origin}:{}),
      ...(this.csrf?{'x-csrf-token':this.csrf}:{}),Cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; '),...headers};
    for(const k of Object.keys(h))if(h[k]===null)delete h[k];
    const response=await (this.f.transportFetch??fetch)((this.f.transportOrigin??this.f.app.origin)+path,{method,headers:h,...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{}),redirect:'manual'});
    for(const value of response.headers.getSetCookie()){const kv=value.split(';')[0],i=kv.indexOf('=');this.cookies.set(kv.slice(0,i),kv.slice(i+1));}
    const raw=Buffer.from(await response.arrayBuffer());let json=null;
    if(response.headers.get('content-type')?.includes('application/json'))json=JSON.parse(raw.toString('utf8'));
    this.f.responses.push({status:response.status,json,headers:response.headers});
    return {status:response.status,json,headers:response.headers,raw};
  }
  async ok(method,path,data,headers={},expected=200) {
    const r=await this.request(method,path,data,headers);
    assert.equal(r.status,expected,'HTTP '+method+' '+path.split('?')[0]+' code='+(r.json?.error?.code??'none'));return r.json;
  }
  async login(subject,inviteToken,reauth=false) {
    const start=await this.ok('POST','/api/v1/auth/start',{deviceId:this.deviceId,...(inviteToken?{inviteToken}:{}),...(reauth?{reauth:true}:{})});
    await this.ok('GET',this.f.idp.issue(subject,start.authorizationUrl),undefined,{},303);
    const me=await this.ok('GET','/api/v1/me');this.csrf=me.csrfToken;this.user=me.user;this.sessionId=me.sessionId;return me;
  }
  async connect() {
    const secret=randomBytes(32).toString('base64url');this.f.secrets.push(secret);
    const c=await this.ok('POST','/api/v1/ai/credentials',{key:secret,label:'Personal AI',providerId:'test-provider',endpointId:'test-endpoint'},{},201);
    const checked=await this.ok('POST','/api/v1/ai/credentials/'+c.id+'/check',{version:c.version});
    return {...checked,secret};
  }
  async budget(limits=[money()]){const b=await this.ok('GET','/api/v1/ai/budget');return this.ok('PUT','/api/v1/ai/budget',{money:limits},{'If-Match':'"r'+b.revision+'"'});}
  input(credential,patch={}){return {operationId:uid(),credentialId:credential.id,modelId:'test-image',modelVersion:'test-model-v1',projectId:uid(),projectRevision:'local-r1',prompt:'Synthetic private prompt '+uid(),options:{quality:'test',size:'1x1'},...patch};}
  async prepare(credential,patch={}){const input=this.input(credential,patch),idem=uid();const r=await this.ok('POST','/api/v1/ai/jobs',input,{'Idempotency-Key':idem},201);return {job:r.job,input,idem};}
  async submit(job,extra={}){const r=await this.ok('POST','/api/v1/ai/jobs/'+job.id+'/submit',{quoteHash:job.quoteHash,consent:true,...extra},{},202);return r.job;}
  async poll(job,state) {
    for(let n=0;n<150;n++){const j=(await this.ok('GET','/api/v1/ai/jobs/'+job.id)).job;if(j.state===state)return j;await new Promise(r=>setTimeout(r,5));}
    assert.fail('Job did not reach '+state);
  }
}
export async function setup(t,options={}) {
  assert.ok(process.env.PROJECT_REVIEW_RUN,'dot-source project-env before tests');
  const root=mkdtempSync(join(process.env.PROJECT_REVIEW_RUN,'evidence','http-sqlite-'));
  let now=Date.UTC(2026,8,8,0,0,0);const clock=()=>options.realtime?Date.now():now;
  const f={root,clock,setTime:v=>{now=v;},advance:v=>{now+=v;},responses:[],logs:[],secrets:[],provider:new TestProvider()};
  f.idp=await idp(clock);
  const cfg={databasePath:join(root,'integration.sqlite'),testOnly:true,clock,oidc:f.idp.config,
    providers:[f.provider],vaultKeys:new Map([['test-v1',randomBytes(32)]]),activeVaultKey:'test-v1',csrfKey:randomBytes(32),leaseKey:generateKeyPairSync('ed25519').privateKey,
    runtime:options.runtime,deliveryTimeoutMs:options.deliveryTimeoutMs??60000,logger:x=>f.logs.push(x)};
  f.config=cfg;
  f.app=createBackend({...cfg,bootstrap:{issuer:f.idp.origin,subject:'owner-subject',policy:options.policy??defaultPolicy()}});
  await f.app.listen(0);
  f.restart=async()=>{await f.app.close();f.app=createBackend(cfg);await f.app.listen(0);};
  t.after(async()=>{try{await f.app.close();}finally{await f.idp.close();}});
  f.owner=new Client(f);await f.owner.login('owner-subject');
  f.member=async(subject)=>{const invite=await f.owner.ok('POST','/api/v1/owner/invites',{issuer:f.idp.origin,subject,confirm:'invite'},{},201);const client=new Client(f);await client.login(subject,invite.inviteToken);return client;};
  f.a=await f.member('member-a');f.b=await f.member('member-b');
  return f;
}

