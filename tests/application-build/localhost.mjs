import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createNetServer} from 'node:net';
import {randomBytes,generateKeyPairSync,createHash,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {request as httpsRequest} from 'node:https';
import {directory} from './helpers.mjs';
/** Synthetic one-use code/PKCE IdP, confined to loopback; never in a public entry or package. */
async function identity(){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),codes=new Map();let origin;
 const jwk={...publicKey.export({format:'jwk'}),kid:'synthetic',alg:'RS256',use:'sig'};
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/jwks'){res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[jwk]}));return;}
  if(req.url!=='/token'||req.method!=='POST'){res.statusCode=404;res.end();return;}
  const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;assert.ok(bytes<=16384);chunks.push(c);}
  const p=new URLSearchParams(Buffer.concat(chunks).toString()),c=codes.get(p.get('code'));codes.delete(p.get('code'));assert.ok(c);
  assert.equal(createHash('sha256').update(p.get('code_verifier')).digest('base64url'),c.challenge);assert.equal(p.get('redirect_uri'),c.redirectUri);
  const now=Math.floor(Date.now()/1000),h=Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic'})).toString('base64url'),
   b=Buffer.from(JSON.stringify({iss:origin,sub:'synthetic-owner',aud:'synthetic-client',iat:now,exp:now+300,auth_time:now,nonce:c.nonce})).toString('base64url');
  const sig=sign('RSA-SHA256',Buffer.from(h+'.'+b),privateKey).toString('base64url');res.setHeader('content-type','application/json');res.end(JSON.stringify({id_token:h+'.'+b+'.'+sig}));
 }catch{res.statusCode=400;res.end('{}');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 return {origin,config:{issuer:origin,authorizationEndpoint:origin+'/authorize',tokenEndpoint:origin+'/token',jwksUri:origin+'/jwks',clientId:'synthetic-client',authMethod:'none'},
  issue(authURL){const u=new URL(authURL);assert.equal(u.origin,origin);assert.equal(u.searchParams.get('code_challenge_method'),'S256');const code=randomBytes(24).toString('base64url');codes.set(code,{nonce:u.searchParams.get('nonce'),challenge:u.searchParams.get('code_challenge'),redirectUri:u.searchParams.get('redirect_uri')});return '/api/v1/auth/callback?state='+u.searchParams.get('state')+'&code='+code;},
  async close(){server.closeIdleConnections();await new Promise(r=>server.close(r));}};
}
async function port(){const s=createNetServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
export async function artifactHost(t,artifact){
 const tls=process.env.APPLICATION_BUILD_TLS;assert.ok(tls);
 const root=directory('https'),idp=await identity(),p=await port(),origin='https://localhost:'+p;
 const {createBackend}=await import(pathToFileURL(resolve(artifact,'src/server/app.mjs')).href),{createHost}=await import(pathToFileURL(resolve(artifact,'src/host/server.mjs')).href);
 const policy={schemaVersion:1,allowedProviders:[],quotas:{settingsBytes:262144,storageBytes:20_000_000,storageObjects:2000,syncBytesPerDay:20_000_000,protectedRequestsPerMinute:2000,protectedConcurrency:50,authRequestsPerMinute:1000,authConcurrency:50},ai:{requestsPerDay:1000,bytesPerDay:20_000_000,concurrency:1,money:[]}};
 const app=createBackend({databasePath:resolve(root,'synthetic.sqlite'),origin,testOnly:true,oidc:idp.config,providers:[],
  vaultKeys:new Map([['synthetic',randomBytes(32)]]),activeVaultKey:'synthetic',csrfKey:randomBytes(32),leaseKey:generateKeyPairSync('ed25519').privateKey,
  bootstrap:{issuer:idp.origin,subject:'synthetic-owner',policy},runtime:{maintenance:{enabled:true}}});
 t.after(async()=>{await app.close();await idp.close();});await app.listen(0);
 const host=createHost({schemaVersion:1,origin,bindAddress:'127.0.0.1',port:p,backendPort:app.server.address().port,
  webroot:resolve(artifact,'public'),manifestPath:resolve(artifact,'public-manifest.json'),
  tlsKeyPath:resolve(tls,'synthetic-key.pem'),tlsCertPath:resolve(tls,'synthetic-cert.pem'),serviceWorker:true});
 t.after(()=>host.close());await host.listen();
 const ca=readFileSync(resolve(tls,'synthetic-cert.pem'));
 return {root,idp,app,host,origin,async get(path,headers={}){return await new Promise((yes,no)=>{
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:p,path,method:'GET',ca,agent:false,headers:{host:'localhost:'+p,...headers}},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',no);res.on('end',()=>yes({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));
  });req.setTimeout(20000,()=>req.destroy(Error('HTTP_DEADLINE')));req.on('error',no);req.end();});}};
}
