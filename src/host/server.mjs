import { createServer } from 'node:https';
import { X509Certificate, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { validateConfig } from './config.mjs';
import { loadManifest, SW_PATH } from './manifest.mjs';
import { serviceWorker } from './service-worker.mjs';
import { need, readPlain, target, isApi, HostFault } from './core.mjs';
import { secureHeaders, privateHeaders, safeError } from './headers.mjs';
import { readRequest, forward } from './proxy.mjs';

export function createHost(input, {logger=()=>{}} = {}) {
  need(process.versions.node === '24.19.0','NODE_24_19_REQUIRED');
  let config=validateConfig(input);
  const build=loadManifest(config);
  const key=readPlain(config.tlsKeyPath,32768),cert=readPlain(config.tlsCertPath,262144);
  const x509=new X509Certificate(cert),publicName=new URL(config.origin).hostname.replace(/^\[|\]$/g,'');
  const a=createPublicKey(createPrivateKey(key)).export({format:'der',type:'spki'}),b=x509.publicKey.export({format:'der',type:'spki'});
  need(a.length===b.length && timingSafeEqual(a,b),'TLS_KEY_MISMATCH');
  need(Date.parse(x509.validFrom)<=Date.now() && Date.parse(x509.validTo)>Date.now(),'TLS_CERT_TIME_INVALID');
  need(isIP(publicName)?x509.checkIP(publicName):x509.checkHost(publicName),'TLS_CERT_NAME_INVALID');
  const sw=config.serviceWorker?serviceWorker(build):null;
  let active=0,stopping=false,closed;
  const sockets=new Set();
  const server=createServer({key,cert,minVersion:'TLSv1.2',maxHeaderSize:16384,
    headersTimeout:Math.min(10_000,config.requestDeadlineMs),requestTimeout:config.requestDeadlineMs,keepAliveTimeout:5000,
    handshakeTimeout:10_000,connectionsCheckingInterval:1000},async(req,res)=>{
    secureHeaders(res,config);privateHeaders(res);
    let route='rejected',admitted=false;
    const release=()=>{
      if(admitted){active--;admitted=false;}
    };
    res.once('finish',()=>{release();try{logger({route,method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)?req.method:'OTHER',status:res.statusCode});}catch{}});
    res.once('close',release);
    try {
      need(!stopping,'HOST_STOPPING',503);
      const counts={};
      for(let i=0;i<req.rawHeaders.length;i+=2){const k=req.rawHeaders[i].toLowerCase();counts[k]=(counts[k]||0)+1;}
      need(['host','origin','cookie','x-csrf-token','idempotency-key','if-match','content-type','authorization'].every(k=>(counts[k]||0)<=1),'DUPLICATE_HEADER',400);
      need(req.headers.host===new URL(config.origin).host,'HOST_REJECTED',403);
      need(!req.headers.expect,'EXPECTATION_REJECTED',417);
      need(!req.headers.upgrade && !req.headers.trailer,'PROTOCOL_UNSUPPORTED',400);
      need(!String(req.headers.connection||'').split(',').some(x=>['host','cookie','origin','authorization','x-csrf-token','idempotency-key','if-match'].includes(x.trim().toLowerCase())),'HOP_HEADER_REJECTED',400);
      const {path,query}=target(req.url);
      need(active<config.maxConcurrent,'HOST_CAPACITY',503);active++;admitted=true;
      if(isApi(path)){
        route='api';
        need(path==='/api/v1' || path.startsWith('/api/v1/'),'NOT_FOUND',404);
        need(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method),'METHOD_NOT_ALLOWED',405);
        need(!req.headers['service-worker'],'SERVICE_WORKER_REJECTED',403);
        const body=await readRequest(req,config);
        need(!['GET','HEAD'].includes(req.method) || body.length===0,'GET_BODY_REJECTED',400);
        await forward(req,res,config,body);return;
      }
      route='static';
      need(['GET','HEAD'].includes(req.method),'METHOD_NOT_ALLOWED',405);
      need(!req.headers['transfer-encoding'] && (!req.headers['content-length'] || req.headers['content-length']==='0'),'GET_BODY_REJECTED',400);
      need(!req.headers.range,'RANGE_UNSUPPORTED',416);
      need(!req.headers.origin || req.headers.origin===config.origin,'ORIGIN_REJECTED',403);
      const isSw=path===SW_PATH && sw!==null;
      need(!req.headers['service-worker'] || isSw,'SERVICE_WORKER_REJECTED',403);
      const entry=isSw?{bytes:sw,mime:'text/javascript; charset=utf-8',html:false,cache:'no-cache'}:build.entries.get(path);
      need(entry,'NOT_FOUND',404);
      need(!query || entry.html,'QUERY_REJECTED',400);
      if(req.headers['sec-fetch-site']==='cross-site' || req.headers['sec-fetch-site']==='same-site') {
        need(entry.html && req.headers['sec-fetch-mode']==='navigate','ORIGIN_REJECTED',403);
      }
      secureHeaders(res,{...config,publicAsset:true});
      res.setHeader('Content-Type',entry.mime);res.setHeader('Content-Length',entry.bytes.length);
      if(!isSw && !query && !req.headers.authorization){
        res.removeHeader('Pragma');res.removeHeader('Expires');res.removeHeader('Vary');
        res.setHeader('Cache-Control',entry.cache);res.setHeader('X-Arch-Build',build.buildId);res.setHeader('X-Arch-Public','1');
        res.setHeader('ETag','"sha256-'+entry.hash+'"');
        if(req.headers['if-none-match']==='"sha256-'+entry.hash+'"'){
          res.removeHeader('Content-Length');res.statusCode=304;res.end();return;
        }
      }else privateHeaders(res);
      if(isSw)res.setHeader('Service-Worker-Allowed','/');
      res.statusCode=200;res.end(req.method==='HEAD'?undefined:entry.bytes);
    } catch(e) {
      secureHeaders(res,config);
      safeError(res,e instanceof HostFault?e.status:500,e instanceof HostFault?e.code:'HOST_INTERNAL_ERROR');
      req.resume();
    }
  });
  server.maxConnections=config.maxConnections;server.maxRequestsPerSocket=1000;server.maxHeadersCount=100;
  server.setTimeout(Math.max(config.requestDeadlineMs,config.upstreamDeadlineMs)+5000,socket=>socket.destroy());
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  const protocolReject=(_req,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n');
  server.on('connect',protocolReject);server.on('upgrade',protocolReject);
  server.on('checkContinue',(req,res)=>{secureHeaders(res,config);safeError(res,417,'EXPECTATION_REJECTED');res.shouldKeepAlive=false;req.resume();});
  server.on('checkExpectation',(req,res)=>{secureHeaders(res,config);safeError(res,417,'EXPECTATION_REJECTED');res.shouldKeepAlive=false;req.resume();});
  server.on('clientError',(_error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n');});
  return {
    server,
    get origin(){return config.origin;},
    info(){return {buildId:build.buildId,manifestHash:build.manifestHash,assetCount:build.assetCount,publicBytes:build.publicBytes,serviceWorker:config.serviceWorker};},
    async listen(){
      await new Promise((resolve,reject)=>{
        const error=e=>reject(e);server.once('error',error);
        server.listen(config.port,config.bindAddress,()=>{server.removeListener('error',error);resolve();});
      });
      if(config.port===0){
        const origin=new URL(config.origin);origin.port=String(server.address().port);
        config=Object.freeze({...config,origin:origin.origin});
      }
      return server.address();
    },
    close(){
      if(closed)return closed;
      stopping=true;server.closeIdleConnections();
      closed=new Promise(resolve=>{
        const timer=setTimeout(()=>{for(const s of sockets)s.destroy();},5000);
        server.close(()=>{clearTimeout(timer);resolve();});
      });
      return closed;
    }
  };
}
