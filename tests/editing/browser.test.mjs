// Reusable, loopback-only harness. Launches exactly one pinned engine at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, realpath, lstat} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixtures, bitmap} from './fixtures.mjs';
const candidate = fileURLToPath(new URL('../../',import.meta.url));
const root = process.env.PROJECT_ROOT, run = process.env.PROJECT_REVIEW_RUN;
if (!root || !run || !path.relative(root,run) || path.relative(root,run).startsWith('..') || path.isAbsolute(path.relative(root,run))) throw Error('Source project-env with a confined RunId first');
const output = path.join(run,'evidence','editing-browser');
const within = (child,parent) => child.toLowerCase().startsWith(parent.toLowerCase()+path.sep);
async function directory(p) {
  if (!within(path.resolve(p),path.resolve(run))) throw Error('Output escapes room');
  let ancestor=path.resolve(p),room=path.resolve(run);
  while(ancestor!==room){
    try {
      const stat=await lstat(ancestor);
      if(stat.isSymbolicLink()||!within(await realpath(ancestor),await realpath(run)))throw Error('Output ancestor escapes room');
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Output ancestor escaped');ancestor=parent;
  }
  await mkdir(p,{recursive:true});
  if (!within(await realpath(p),await realpath(run))) throw Error('Output symlink escape');
  return p;
}
await directory(output);
const pkgPath=path.join(root,'.toolchain','app-runtime','node_modules','playwright','package.json');
const playwrightPackage=JSON.parse(await readFile(pkgPath,'utf8'));
assert.equal(playwrightPackage.version,'1.63.0');
const engines=JSON.parse(await readFile(path.join(root,'.toolchain','app-runtime','node_modules','playwright-core','browsers.json'),'utf8'));
const pw=await import(pathToFileURL(path.join(path.dirname(pkgPath),'index.mjs')).href);
const routes=new Map();
for(const name of ['contract','raster','history','editor','index','worker'])routes.set('/src/editing/'+name+'.mjs',path.join(candidate,'src','editing',name+'.mjs'));
for(const name of ['fixtures','suite','fixture-worker','protocol-scenarios'])routes.set('/tests/editing/'+name+'.mjs',path.join(candidate,'tests','editing',name+'.mjs'));
for(const p of routes.values())assert.equal((await lstat(p)).isSymbolicLink(),false);
const served=[],blocked=[];
let origin;
const server=createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'||req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
    const u=new URL(req.url,origin);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'");
    if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Raster Worker verification</title><body>Dedicated Worker fixture harness</body></html>');return;}
    if(u.search||!routes.has(u.pathname)){res.writeHead(404);res.end('Not whitelisted');return;}
    served.push(u.pathname);res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(routes.get(u.pathname)));
  }catch{res.writeHead(500);res.end('Harness failure');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
origin='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
function oracleHash(image){
  const header=Buffer.alloc(24);header.write('ARCH-RGBA-v1');header.writeUInt32LE(image.width,16);header.writeUInt32LE(image.height,20);
  return createHash('sha256').update(header).update(image.data).digest('hex');
}
for(const name of ['chromium','firefox','webkit'])test(name+' pinned Dedicated Worker fixtures and transport',{timeout:90000},async()=>{
  const pin=engines.browsers.find(b=>b.name===name),type=pw[name],started=new Date().toISOString();
  assert.equal(pin.revision,{chromium:'1243',firefox:'1543',webkit:'2359'}[name]);
  const profile=await directory(path.join(run,'cache','browser',name,'profile'));
  const cache=await directory(path.join(run,'cache','browser',name,'disk'));
  const artifacts=await directory(path.join(run,'temp','browser',name,'artifacts'));
  const downloads=await directory(path.join(run,'temp','browser',name,'downloads'));
  const crashes=await directory(path.join(run,'temp','browser',name,'crashes'));
  const options={headless:true,artifactsDir:artifacts,downloadsPath:downloads,acceptDownloads:false,serviceWorkers:'block',
    viewport:{width:900,height:640}};
  if(name==='chromium')options.args=['--disk-cache-dir='+cache,'--crash-dumps-dir='+crashes,'--disable-breakpad'];
  if(name==='firefox')options.firefoxUserPrefs={'browser.cache.disk.parent_directory':cache,'browser.shell.checkDefaultBrowser':false,'toolkit.crashreporter.enabled':false};
  const context=await type.launchPersistentContext(profile,options);
  const page=await context.newPage();
  try{
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin&&(url.pathname==='/'||routes.has(url.pathname)))return route.continue();
      blocked.push(route.request().url());return route.abort();
    });
    await page.goto(origin);
    const corpus=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const worker=new Worker('/tests/editing/fixture-worker.mjs',{type:'module'}),began=performance.now();
      const timeout=setTimeout(()=>{worker.terminate();reject(Error('Fixture Worker timeout'));},60000);
      let started,frames=0,animate=true;
      function frame(){frames++;if(animate)requestAnimationFrame(frame);}requestAnimationFrame(frame);
      worker.onerror=e=>{clearTimeout(timeout);animate=false;worker.terminate();reject(Error(e.message));};
      worker.onmessage=({data})=>{
        if(data.type==='started')started=data;
        if(data.type==='complete'){clearTimeout(timeout);animate=false;worker.terminate();resolve({started,records:data.records,frames,ms:performance.now()-began});}
      };
      worker.postMessage('run');
    }));
    const failed=corpus.records.filter(r=>r.verdict!=='pass');
    const version=context.browser()?.version();
    const protocol=await page.evaluate(async()=>{const {runProtocol}=await import('/tests/editing/protocol-scenarios.mjs');return runProtocol();});
    const evidence={engine:name,browserVersion:version,playwright:playwrightPackage.version,revision:pin.revision,
      executable:type.executablePath(),started,finished:new Date().toISOString(),origin,profile,corpus,protocol,blocked:[...blocked]};
    await writeFile(path.join(output,name+'.json'),JSON.stringify(evidence,null,2));
    assert.deepEqual(failed,[]);assert.equal(corpus.started.worker,true);assert.equal(corpus.started.isolated,true);
    assert.ok(corpus.frames>=2,'Main thread continues frames during CPU work');
    for(const fixture of fixtures){
      const record=corpus.records.find(r=>r.name===fixture.name);
      assert.equal(record.details.hash,oracleHash(bitmap(fixture.after)),fixture.name+' independent SHA-256');
    }
    assert.equal(version,pin.browserVersion);
    assert.equal(protocol.passed,true);
  }finally{await context.close();}
});
