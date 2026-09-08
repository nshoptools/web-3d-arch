import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { Store } from './database.mjs';
import { Vault,SessionCrypto } from './vault.mjs';
import { Policy,validatePolicy } from './policy.mjs';
import { Settings } from './settings.mjs';
import { Oidc } from './oidc.mjs';
import { Accounts,bootstrap } from './accounts.mjs';
import { Providers } from './providers.mjs';
import { Credentials } from './credentials.mjs';
import {ImageAssets,REFERENCE_LIMITS} from './image-assets.mjs';
import { AI } from './ai.mjs';
import {recoveryCosts} from './recovery.mjs';
import {RuntimeOperations} from './runtime-operations.mjs';
import {validateRuntime} from './runtime-config.mjs';
import {maintenanceHold} from './maintenance.mjs';
import { fail,Fault,exact,str,integer,uuid,canonical,parse,id,sha,equal,cookieValue,publicUser } from './core.mjs';
export const SID='__Host-arch_sid', FLOW='__Host-arch_oidc';
const cookie=(name,value,maxAge)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge;
function headers(res) {
  for(const [k,v]of Object.entries({'Cache-Control':'no-store, private','Pragma':'no-cache','Vary':'Cookie, Origin',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000'}))res.setHeader(k,v);
}
async function body(req,maxBytes) {
  fail(!req.headers['content-encoding']||req.headers['content-encoding']==='identity',415,'CONTENT_ENCODING_UNSUPPORTED');
  fail(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''),415,'JSON_CONTENT_TYPE_REQUIRED');
  if(req.headers['content-length'])fail(/^\d+$/.test(req.headers['content-length'])&&Number(req.headers['content-length'])<=maxBytes,413,'BODY_TOO_LARGE',{limit:maxBytes});
  const chunks=[];let n=0;
  for await(const chunk of req){n+=chunk.length;fail(n<=maxBytes,413,'BODY_TOO_LARGE',{limit:maxBytes});chunks.push(chunk);}
  const text=Buffer.concat(chunks).toString('utf8');
  fail(!text.includes('\uFFFD'),400,'INVALID_UTF8');
  return parse(text||'{}');
}
function revision(req) {const r=/^"r(\d+)"$/.exec(req.headers['if-match']??'');fail(r,428,'IF_MATCH_REQUIRED');return integer(Number(r[1]));}
export function createBackend(config) {
  const clock=config.clock??Date.now,testOnly=config.testOnly===true;
  const runtime=validateRuntime(config.runtime??{maintenance:{enabled:false}});
  fail(Number(process.versions.node.split('.')[0])===24&&Number(process.versions.node.split('.')[1])>=19,500,'NODE_24_19_REQUIRED');
  if(!testOnly)fail(typeof config.origin==='string'&&new URL(config.origin).protocol==='https:',500,'HTTPS_ORIGIN_REQUIRED');
  if(config.origin)fail(new URL(config.origin).origin===config.origin,500,'ORIGIN_INVALID');
  const s=new Store(config.databasePath);
  try {
  const vault=new Vault(config.vaultKeys,config.activeVaultKey);
  const crypto=new SessionCrypto(config.csrfKey,config.leaseKey);
  if(config.bootstrap)bootstrap(s,{...config.bootstrap,policy:validatePolicy(config.bootstrap.policy),now:clock()});
  const policy=new Policy(s,clock);policy.read();
  const accounts=new Accounts(s,crypto,clock),settings=new Settings(s,policy,clock),providers=new Providers(config.providers??[],{testOnly});
  const credentials=new Credentials(s,vault,providers,policy,clock,accounts),oidc=new Oidc(config.oidc,{testOnly,clock});
  const images=new ImageAssets(s,policy,accounts,clock);
  const ai=new AI(s,credentials,providers,policy,accounts,clock,{deliveryTimeoutMs:config.deliveryTimeoutMs??120_000,images});
  accounts.onRevoke=(u,session)=>{oidc.cancel(null,session);ai.revoke(u,session);};
  credentials.onChange=(u,c)=>ai.revoke(u,null,c);
  const logger=config.logger??(()=>{}),ctx={origin:config.origin};
  const operations=new RuntimeOperations(s,{runtime,clock,isLive:j=>ai.inflight.has(j)||ai.settlingJobs.has(j),logger});
  let stopping=false,closeRequest=null,closedPromise=null,listenPromise=null;
  const handlers=new Set(),lifecycle=new AbortController();
  const safeLog=x=>{try{logger(x);}catch{}};

  const server=createServer({maxHeaderSize:16_384,requestTimeout:30_000,headersTimeout:10_000,keepAliveTimeout:5000},async(req,res)=>{
    let handlerDone;const handler=new Promise(r=>{handlerDone=r;});handlers.add(handler);
    headers(res);
    const requestId=id();res.setHeader('X-Request-Id',requestId);
    let route='unmatched',release=()=>{},a=null;
    res.once('finish',()=>release());res.once('close',()=>release());
    const reply=(status,value,etag)=>{
      res.statusCode=status;if(etag!==undefined)res.setHeader('ETag','"r'+etag+'"');
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(canonical(value));
    };
    const signed=(payload)=>createHmac('sha256',config.csrfKey).update('download-v1:').update(payload).digest('base64url');
    try {
      fail(!stopping,503,'SERVER_STOPPING');
      fail(req.url?.length<=8192&&req.url.startsWith('/')&&!req.url.startsWith('//'),400,'INVALID_URL');
      const u=new URL(req.url,ctx.origin),path=u.pathname,m=req.method;
      fail(req.headers.host===new URL(ctx.origin).host,403,'HOST_REJECTED');
      const callback=m==='GET'&&path==='/api/v1/auth/callback';
      if(!callback) {
        fail(!req.headers.origin||req.headers.origin===ctx.origin,403,'ORIGIN_REJECTED');
        fail(!['cross-site','same-site'].includes(req.headers['sec-fetch-site']),403,'ORIGIN_REJECTED');
        if(!['GET','HEAD'].includes(m))fail(req.headers.origin===ctx.origin,403,'ORIGIN_REQUIRED');
      }
      if(m==='GET'&&path==='/api/v1/health'){
        route='health';const state=operations.status(),reason=maintenanceHold(s)??(ai.accountingFailure?'AI_ACCOUNTING_WRITE_FAILED':state.code);
        return reply(reason?503:200,{apiVersion:1,status:reason?'degraded':'ok',identityConfigured:!!config.oidc,
          operations:{state:reason?'degraded':state.state,reason},capabilities:{cloudProjects:false,cloudUploads:false,offlineLease:true,aiProviders:providers.list().map(p=>p.id),webhooks:false}});
      }
      if(path.startsWith('/api/v1/auth/')) {
        release=policy.admit('auth-global',true);
        if(m==='POST'&&path==='/api/v1/auth/start'){
          route='auth.start';
          const b=await body(req,8192);exact(b,['deviceId','inviteToken','reauth'],['deviceId']);uuid(b.deviceId);
          if(b.inviteToken)str(b.inviteToken,100);
          const raw=cookieValue(req,SID);
          if(raw){try{a=accounts.authenticate(raw,false);}catch(e){if(e.code!=='SESSION_INVALID'&&e.code!=='AUTH_REQUIRED')throw e;res.setHeader('Set-Cookie',cookie(SID,'',0));}if(a)fail(equal(req.headers['x-csrf-token'],crypto.csrf(raw)),403,'CSRF_REJECTED');}
          const started=oidc.start({redirectUri:ctx.origin+'/api/v1/auth/callback',deviceId:b.deviceId,inviteToken:b.inviteToken,session:a?.session,reauth:b.reauth===true});
          oidc.cancel(cookieValue(req,FLOW),null);
          res.setHeader('Set-Cookie',cookie(FLOW,started.browser,600));return reply(200,{authorizationUrl:started.authorizationUrl});
        }
        if(callback) {
          route='auth.callback';const {identity,flow}=await oidc.callback(u.searchParams.get('state'),cookieValue(req,FLOW),u.searchParams.get('code'));
          const result=accounts.login(identity,flow);
          if(flow.session)ai.revoke(flow.session.user_id,flow.session.public_id);
          res.setHeader('Set-Cookie',[cookie(SID,result.raw,43200),cookie(FLOW,'',0)]);
          res.statusCode=303;res.setHeader('Location','/');res.end();return;
        }
        throw new Fault(404,'NOT_FOUND');
      }
      a=accounts.authenticate(cookieValue(req,SID));
      release=policy.admit(a.user.id);
      res.setHeader('X-User-Id',a.user.id);res.setHeader('X-Session-Id',a.session.public_id);
      if(!['GET','HEAD'].includes(m))fail(equal(req.headers['x-csrf-token'],crypto.csrf(a.raw)),403,'CSRF_REJECTED');
      const imageUpload=m==='POST'&&path==='/api/v1/ai/references';
      if(imageUpload){const httpRelease=release,imageRelease=images.admitUpload();release=()=>{httpRelease();imageRelease();};}
      const b=!['GET','HEAD'].includes(m)?await body(req,imageUpload?10_680_000:Math.min(32_500_000,policy.read().quotas.settingsBytes+131_072)):null;
      // Membership/session may change while an upload is arriving.
      a=accounts.authenticate(a.raw,false);
      let match;
      if(m==='GET'&&path==='/api/v1/me'){route='me';return reply(200,{user:publicUser(a.user),sessionId:a.session.public_id,csrfToken:crypto.csrf(a.raw),deviceId:a.session.device_id,absoluteExpiresAt:a.session.created+43_200_000,idleExpiresAt:a.session.last_seen+3_600_000,serverTime:clock()});}
      if(m==='POST'&&path==='/api/v1/logout'){route='logout';exact(b,[]);oidc.cancel(cookieValue(req,FLOW),a.session.public_id);accounts.logout(a);res.setHeader('Set-Cookie',[cookie(SID,'',0),cookie(FLOW,'',0)]);return reply(200,{loggedOut:true,localDataAction:'retain-until-user-device-flow',oldSessionId:a.session.public_id});}
      if(m==='POST'&&path==='/api/v1/offline/lease'){route='offline.lease';exact(b,['deviceId']);fail(b.deviceId===a.session.device_id,403,'DEVICE_MISMATCH');return reply(200,{lease:crypto.lease(a.user,a.session,clock()),publicKey:crypto.publicKey,serverTime:clock()});}
      if(m==='GET'&&path==='/api/v1/policy'){route='policy.read';return reply(200,policy.read(),policy.read().version);}
      if(m==='PUT'&&path==='/api/v1/owner/policy'){route='policy.replace';accounts.owner(a);const v=policy.replace(b,revision(req),a.user.id);return reply(200,v,v.version);}
      if(m==='GET'&&path==='/api/v1/owner/users'){route='users.list';accounts.owner(a);return reply(200,{users:s.all('SELECT * FROM users ORDER BY created,id').map(x=>({...publicUser(x),issuer:x.issuer,subject:x.subject}))});}
      if(m==='GET'&&path==='/api/v1/owner/invites'){route='invite.list';accounts.owner(a);return reply(200,{invites:s.all('SELECT id,user_id,expires,consumed,revoked FROM invites ORDER BY expires DESC,id LIMIT 500')});}
      if(m==='POST'&&path==='/api/v1/owner/invites'){route='invite.create';if(config.oidc)fail(b.issuer===config.oidc.issuer,400,'ISSUER_NOT_CONFIGURED');return reply(201,accounts.invite(a,b));}
      if(m==='POST'&&(match=/^\/api\/v1\/owner\/invites\/([^/]+)\/(revoke|resend)$/.exec(path))){route='invite.mutate';exact(b,['confirm']);return reply(200,accounts.invitation(a,uuid(match[1]),match[2],b.confirm));}
      if(m==='GET'&&(match=/^\/api\/v1\/owner\/users\/([^/]+)\/deletion-impact$/.exec(path))){route='user.deletion-impact';return reply(200,accounts.impact(a,uuid(match[1])));}
      if(m==='POST'&&(match=/^\/api\/v1\/owner\/users\/([^/]+)$/.exec(path))){route='user.mutate';return reply(200,accounts.mutate(a,uuid(match[1]),b));}
      if(m==='GET'&&path==='/api/v1/owner/audit'){route='audit.list';accounts.owner(a);return reply(200,{events:s.all('SELECT * FROM audit ORDER BY at DESC,id LIMIT 500')});}
      if(m==='GET'&&path==='/api/v1/owner/deletion-tasks'){route='deletion-tasks.list';accounts.owner(a);return reply(200,{tasks:s.all('SELECT * FROM deletion_tasks ORDER BY requested')});}
      if(m==='GET'&&path==='/api/v1/owner/infrastructure'){route='infrastructure.list';accounts.owner(a);return reply(200,{users:s.all('SELECT id FROM users').map(x=>({userId:x.id,...policy.usage(x.id),aiRequests:s.get('SELECT count(*) n FROM jobs WHERE user_id=? AND submitted IS NOT NULL',x.id).n+s.get('SELECT count(*) n FROM recovery_obligations WHERE user_id=?',x.id).n})),policyVersion:policy.read().version});}
      if(m==='GET'&&path==='/api/v1/me/usage'){route='usage.read';return reply(200,{...policy.usage(a.user.id),quotas:policy.read().quotas,sync:s.all("SELECT dimension,period,used FROM counters WHERE user_id=? AND dimension='sync-bytes' ORDER BY period DESC",a.user.id)});}
      if(m==='GET'&&path==='/api/v1/settings'){route='settings.read';const v=settings.read(a.user.id);return reply(200,v,v.revision);}
      if(m==='PUT'&&path==='/api/v1/settings'){route='settings.write';const v=settings.write(a.user.id,b,revision(req));return reply(200,v,v.revision);}
      if(m==='GET'&&path==='/api/v1/settings/export'){route='settings.export';const v=settings.read(a.user.id);return reply(200,{schemaVersion:1,values:v.values});}
      if(m==='POST'&&path==='/api/v1/settings/import'){
        route='settings.import';exact(b,['mode','document','confirm']);fail(['merge','replace'].includes(b.mode)&&b.confirm==='import:'+b.mode,400,'CONFIRMATION_REQUIRED');
        exact(b.document,['schemaVersion','values']);fail(b.document.schemaVersion===1,400,'SCHEMA_UNSUPPORTED');
        const old=settings.read(a.user.id),values=b.mode==='merge'?{...old.values,...b.document.values}:b.document.values;
        const v=settings.write(a.user.id,{schemaVersion:1,values},revision(req),'import-'+b.mode);return reply(200,v,v.revision);
      }
      if(m==='POST'&&path==='/api/v1/settings/reset'){route='settings.reset';exact(b,['confirm']);fail(b.confirm==='reset-settings',400,'CONFIRMATION_REQUIRED');const v=settings.write(a.user.id,{schemaVersion:1,values:{}},revision(req),'reset');return reply(200,v,v.revision);}
      if(m==='GET'&&path==='/api/v1/settings/conflicts'){route='settings.conflicts';return reply(200,{conflicts:settings.conflicts(a.user.id)});}
      if(m==='DELETE'&&(match=/^\/api\/v1\/settings\/conflicts\/([^/]+)$/.exec(path))){route='settings.conflict.discard';exact(b,['confirm']);const cid=uuid(match[1]);fail(s.get('SELECT id FROM conflicts WHERE id=? AND user_id=?',cid,a.user.id),404,'NOT_FOUND');fail(b.confirm==='discard:'+cid,400,'CONFIRMATION_REQUIRED');s.run('DELETE FROM conflicts WHERE id=? AND user_id=?',cid,a.user.id);return reply(200,{discarded:true});}
      if(m==='GET'&&path==='/api/v1/ai/reference-limits'){route='reference.limits';return reply(200,{version:'arch-ai-reference/1',limits:REFERENCE_LIMITS});}
      if(m==='GET'&&path==='/api/v1/ai/providers'){route='providers.list';return reply(200,{providers:providers.list().map(p=>({...p,allowed:policy.read().allowedProviders.includes(p.id)}))});}
      if(path==='/api/v1/ai/budget'){route='budget';if(m==='GET'){const v=ai.budget(a.user.id);return reply(200,v,v.revision);}if(m==='PUT'){const v=ai.setBudget(a.user.id,b,revision(req));return reply(200,v,v.revision);}}
      if(path==='/api/v1/ai/credentials'){route='credentials';if(m==='GET')return reply(200,{credentials:credentials.list(a.user.id)});if(m==='POST')return reply(201,credentials.put(a.user.id,b));}
      if((match=/^\/api\/v1\/ai\/credentials\/([^/]+)(?:\/(check|disable))?$/.exec(path))){
        route='credential.mutate';const cid=uuid(match[1]);
        if(m==='PUT'&&!match[2])return reply(200,credentials.put(a.user.id,b,cid));
        if(m==='DELETE'&&!match[2]){exact(b,['version','confirm']);return reply(200,credentials.disable(a.user.id,cid,b,true));}
        if(m==='POST'&&match[2]==='check'){exact(b,['version']);return reply(200,await credentials.check(a,cid,b.version));}
        if(m==='POST'&&match[2]==='disable'){exact(b,['version','confirm']);return reply(200,credentials.disable(a.user.id,cid,b));}
      }
      if(path==='/api/v1/ai/references'&&m==='POST'){
        route='reference.upload';const control=new AbortController();
        const abort=()=>{if(!res.writableFinished)control.abort();};res.once('close',abort);
        try{const value=await images.upload(a,b,{signal:control.signal});return reply(value.reused?200:201,value);}
        finally{res.removeListener('close',abort);}
      }
      if((match=/^\/api\/v1\/ai\/references\/([^/]+)(?:\/(download|thumbnail))?$/.exec(path))){
        route='reference.'+(match[2]??'read');const rid=uuid(match[1]),r=images.owned(a.user.id,rid);
        if(m==='DELETE'&&!match[2])return reply(200,images.remove(a.user.id,rid,b));
        if(m==='GET'){
          images.available(r);
          if(!match[2])return reply(200,{reference:images.descriptor(r)});
          const thumb=match[2]==='thumbnail',bytes=Buffer.from(thumb?r.thumbnail:r.bytes);
          fail(sha(bytes)===(thumb?r.thumbnail_hash:r.hash),409,'IMAGE_HASH_MISMATCH');
          res.setHeader('Content-Type',thumb?'image/png':r.media_type);res.setHeader('Content-Length',bytes.length);
          res.setHeader('Content-Disposition','attachment; filename="reference-'+rid+(thumb?'-thumbnail.png':'')+'"');res.statusCode=200;res.end(bytes);return;
        }
      }
      if(m==='POST'&&path==='/api/v1/ai/jobs'){route='job.prepare';const v=ai.create(a,b,req.headers['idempotency-key']);return reply(v.reused?200:201,v);}
      if(m==='GET'&&path==='/api/v1/ai/recovery-costs'){
        route='costs.recovery';
        const options={provider:u.searchParams.has('providerId')?str(u.searchParams.get('providerId'),100):null,
          from:u.searchParams.has('from')?integer(Number(u.searchParams.get('from')),8_640_000_000_000_000):null,
          until:u.searchParams.has('to')?integer(Number(u.searchParams.get('to')),8_640_000_000_000_000):null,
          cursor:u.searchParams.get('after'),limit:u.searchParams.has('limit')?integer(Number(u.searchParams.get('limit')),100,1):50};
        return reply(200,{...recoveryCosts(s,a.user.id,options),scope:'requests-through-this-app-only'});
      }
      if(m==='GET'&&(path==='/api/v1/ai/jobs'||path==='/api/v1/ai/costs')){
        route=path.endsWith('costs')?'costs.list':'jobs.list';
        const conditions=['user_id=?'],values=[a.user.id];
        for(const [key,column]of [['providerId','provider_id'],['jobId','id'],['state','state']])if(u.searchParams.has(key)){conditions.push(column+'=?');values.push(str(u.searchParams.get(key),100));}
        for(const [key,op]of [['from','>='],['to','<']])if(u.searchParams.has(key)){conditions.push('created'+op+'?');values.push(integer(Number(u.searchParams.get(key)),8_640_000_000_000_000));}
        const limit=u.searchParams.has('limit')?integer(Number(u.searchParams.get('limit')),100,1):50;
        const after=u.searchParams.get('after');if(after){const cursor=ai.owned(a.user.id,uuid(after));conditions.push('(created<? OR (created=? AND id<?))');values.push(cursor.created,cursor.created,cursor.id);}
        const rows=s.all('SELECT * FROM jobs WHERE '+conditions.join(' AND ')+' ORDER BY created DESC,id DESC LIMIT ?',...values,limit+1),more=rows.length>limit;
        if(more)rows.pop();
        return reply(200,{jobs:rows.map(j=>ai.view(j)),nextCursor:more?rows.at(-1).id:null,
          unresolved:s.all("SELECT id,currency,cap,recovery_bound,day,month,closed_reason FROM jobs WHERE user_id=? AND state='unknown' AND accounting='pending' ORDER BY created",a.user.id).map(j=>({jobId:j.id,currency:j.currency,unit:'micro',reservedMicros:j.recovery_bound??j.cap,day:j.day,month:j.month,closedReason:j.closed_reason})),recovery:{path:'/api/v1/ai/recovery-costs',count:s.get('SELECT count(*) n FROM recovery_obligations WHERE user_id=?',a.user.id).n},scope:'requests-through-this-app-only'});
      }
      if((match=/^\/api\/v1\/ai\/jobs\/([^/]+)(?:\/(submit|cancel|close-unknown|events|input))?$/.exec(path))){
        route='job.'+(match[2]??'read');const jid=uuid(match[1]),j=ai.owned(a.user.id,jid);
        if(m==='GET'&&!match[2])return reply(200,{job:ai.view(j)});
        if(m==='POST'&&match[2]==='submit')return reply(202,{job:ai.submit(a,jid,b)});
        if(m==='POST'&&match[2]==='cancel'){exact(b,[]);return reply(200,{job:ai.cancel(a.user.id,jid)});}
        if(m==='POST'&&match[2]==='close-unknown')return reply(200,{job:ai.closeUnknown(a.user.id,jid,b)});
        if(m==='GET'&&match[2]==='events')return reply(200,{events:s.all('SELECT seq,state,at FROM job_events WHERE job_id=? ORDER BY seq',jid)});
        if(m==='GET'&&match[2]==='input')return reply(200,{input:j.payload?JSON.parse(j.payload):null});
      }
      if((match=/^\/api\/v1\/ai\/artifacts\/([^/]+)(?:\/(download|download-ticket|thumbnail))?$/.exec(path))){
        route='artifact.'+(match[2]??'read');const aid=uuid(match[1]);images.artifact(a.user.id,aid);
        if(m==='DELETE'&&!match[2]){exact(b,['confirm']);fail(b.confirm==='delete:'+aid,400,'CONFIRMATION_REQUIRED');s.run('DELETE FROM artifacts WHERE id=? AND user_id=?',aid,a.user.id);return reply(200,{deleted:true,id:aid});}
        const checked=await images.checkedArtifact(a,aid);a=accounts.authenticate(a.raw,false);const artifact=images.artifact(a.user.id,aid);
        if(m==='POST'&&match[2]==='download-ticket'){
          exact(b,[]);const claims={artifactId:aid,userId:a.user.id,sessionId:a.session.public_id,authVersion:a.user.auth_version,expiresAt:clock()+300_000};
          const payload=Buffer.from(canonical(claims)).toString('base64url');
          return reply(200,{url:'/api/v1/ai/artifacts/'+aid+'/download?ticket='+payload+'.'+signed(payload),expiresAt:claims.expiresAt});
        }
        if(m==='GET'&&match[2]==='download'){
          if(u.searchParams.has('ticket')){
            const t=u.searchParams.get('ticket').split('.');fail(t.length===2&&equal(signed(t[0]),t[1]),403,'DOWNLOAD_TICKET_INVALID');
            const p=parse(Buffer.from(t[0],'base64url').toString('utf8'));
            fail(p.artifactId===aid&&p.userId===a.user.id&&p.sessionId===a.session.public_id&&p.authVersion===a.user.auth_version&&p.expiresAt>clock()&&p.expiresAt<=clock()+300_000,403,'DOWNLOAD_TICKET_INVALID');
          }
          res.setHeader('Content-Type',artifact.media_type);res.setHeader('Content-Disposition','attachment; filename="image-'+aid+'"');res.setHeader('Content-Length',artifact.bytes.length);res.statusCode=200;res.end(Buffer.from(artifact.bytes));return;
        }
        if(m==='GET'&&match[2]==='thumbnail'){const bytes=Buffer.from(checked.image.thumbnail);res.setHeader('Content-Type','image/png');res.setHeader('Content-Length',bytes.length);res.statusCode=200;res.end(bytes);return;}
        if(m==='GET'&&!match[2])return reply(200,checked.metadata);
      }
      if(path.startsWith('/api/v1/cloud/'))throw new Fault(503,'CLOUD_PROJECTS_DISABLED');
      throw new Fault(404,'NOT_FOUND');
    } catch(e) {
      const safe=e instanceof Fault||e?.code==='SETTINGS_CONFLICT'||e?.code==='VAULT_UNAVAILABLE';
      const status=safe?e.status:500,code=safe?e.code:'INTERNAL_ERROR';
      if(!res.headersSent)reply(status,{error:{code,...(safe&&e.details?{details:e.details}:{}),requestId}});
      else res.destroy();
      req.resume();
    } finally {
      if(res.writableFinished||res.destroyed)release();
      // Do not add URL, query, headers, bodies, provider exceptions, labels, prompt or images.
      try{logger({requestId,route,method:req.method,status:res.statusCode,at:clock()});}catch{}
      handlers.delete(handler);handlerDone();
    }
  });
  server.maxRequestsPerSocket=1000;
  server.on('clientError',(_error,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  const api={server,store:s,accounts,policy,settings,credentials,providers,ai,oidc,images,operations,
    get origin(){return ctx.origin;},
    get whenClosed(){return closedPromise;},
    listen(port=0){
      fail(!stopping&&!listenPromise,409,'SERVER_LIFECYCLE_INVALID');
      listenPromise=(async()=>{
        await ai.recover({rows:runtime.maintenance.batchRows,bytes:runtime.maintenance.batchBytes,signal:lifecycle.signal});
        fail(!stopping,503,'SERVER_STOPPING');
        await new Promise((resolve,reject)=>{
          const onError=e=>{server.removeListener('listening',onListen);reject(e);};
          const onListen=()=>{server.removeListener('error',onError);resolve();};
          server.once('error',onError);server.once('listening',onListen);server.listen(port,'127.0.0.1');
        });
        if(!ctx.origin)ctx.origin='http://127.0.0.1:'+server.address().port;
        operations.start();return server.address();
      })();
      return listenPromise;
    },
    close(){
      if(closeRequest)return closeRequest;
      stopping=true;lifecycle.abort();
      // Stop cadence immediately, including runOnce calls paused at a yield.
      const stopped=operations.stop();
      let accountingError=null;try{ai.stop();}catch{accountingError=new Fault(503,'SHUTDOWN_ACCOUNTING_FAILED');}
      closedPromise=(async()=>{
        await stopped;
        if(listenPromise)await listenPromise.catch(()=>{});
        server.closeIdleConnections();
        const serverClosed=new Promise(resolve=>{if(!server.listening)return resolve();server.close(resolve);});
        // No new settlement or handler is admitted once stopping=true.
        const results=await Promise.allSettled([...handlers,ai.drain()]);
        if(results.some(x=>x.status==='rejected'))accountingError??=new Fault(503,'SHUTDOWN_SETTLEMENT_FAILED');
        await serverClosed;
        ai.finishStop();s.close();
        if(accountingError)throw accountingError;
        safeLog({category:'lifecycle',status:'closed'});return {status:'closed'};
      })();
      void closedPromise.catch(()=>{});
      let timer;
      const deadline=new Promise((_resolve,reject)=>{timer=setTimeout(()=>{
        server.closeAllConnections();
        safeLog({category:'lifecycle',status:'drain-deadline',code:'SHUTDOWN_DRAIN_TIMEOUT'});
        reject(new Fault(503,'SHUTDOWN_DRAIN_TIMEOUT'));
      },runtime.shutdownGraceMs);});
      closeRequest=Promise.race([closedPromise,deadline]).finally(()=>clearTimeout(timer));
      return closeRequest;
    }
  };
  return api;
  }catch(e){try{s.close();}catch{}throw e;}
}
