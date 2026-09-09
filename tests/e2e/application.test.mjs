import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';
import {setup} from '../server/helpers.mjs';
import {createBackend} from '../../src/server/app.mjs';
import {createHost} from '../../src/host/server.mjs';
import {MIME} from '../../src/host/manifest.mjs';
import {syntheticChromiumTLSOptions} from './synthetic-tls.mjs';
import {readStoredZip} from '../../src/storage/zip.mjs';
import {readSTL,inspectMesh} from '../oracles/mesh-oracle.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN;
if(!run||!process.env.ARCH_WASM_MODULE||!process.env.APP_TEST_TLS)throw Error('Run environment, module and test TLS required');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),work=path.join(run,'work/app-e2e-'+stamp),evidence=path.join(run,'evidence/app-e2e-'+stamp);
await mkdir(work,{recursive:true});await mkdir(evidence,{recursive:true});
const webroot=path.join(work,'webroot'),module=await realpath(process.env.ARCH_WASM_MODULE);
await build({configFile:false,root,cacheDir:path.join(run,'cache/vite-app-e2e'),logLevel:'warn',worker:{format:'es'},
  build:{target:'es2022',outDir:webroot,emptyOutDir:false,sourcemap:false,minify:false,
    rollupOptions:{input:path.join(root,'tests/e2e/application-entry.mjs'),output:{entryFileNames:'assets/application.mjs'}}}});
await mkdir(path.join(webroot,'runtime'),{recursive:true});
for(const extension of ['mjs','wasm'])await writeFile(path.join(webroot,'runtime/arch-kernel.'+extension),await readFile(module.replace(/\.mjs$/,'.'+extension)));
const styles=(await readdir(path.join(webroot,'assets'))).filter(n=>n.endsWith('.css'));
await writeFile(path.join(webroot,'index.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Application integration test</title>'+styles.map(n=>'<link rel="stylesheet" href="/assets/'+n+'">').join('')+'<body><div id="app"></div><script type="module" src="/assets/application.mjs"></script></body></html>');
const source='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#0099cc" fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/><path fill="#ee7733" d="M10 0H20V10H10Z"/></svg>';
async function manifest(){const assets=[];
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else{const b=await readFile(p),file=path.relative(webroot,p).replaceAll('\\','/');assets.push({url:'/'+file,file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),mime:MIME[path.extname(p)],cache:'revalidate'});}}}
  await walk(webroot);const p=path.join(work,'public-manifest.json');await writeFile(p,JSON.stringify({schemaVersion:1,buildId:'app-e2e-'+stamp,assets,navigations:{'/':'/index.html'}}));return p;
}
async function unusedPort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
for(const [engine,type]of Object.entries({chromium,firefox,webkit}))test(`APP initial SVG flow: actual ${engine} UI, HTTPS host, backend, storage, native Worker and STL`,{timeout:180000},async t=>{
  const f=await setup(t),port=await unusedPort(),origin='https://127.0.0.1:'+port;
  await f.app.close();f.app=createBackend({...f.config,origin});const backend=await f.app.listen(0);
  await writeFile(path.join(webroot,'test-config.json'),JSON.stringify({deviceId:f.a.deviceId,engineIdentity:{id:'arch-kernel',version:createHash('sha256').update(await readFile(module.replace(/\.mjs$/,'.wasm'))).digest('hex')}}));
  const host=createHost({schemaVersion:1,origin,bindAddress:'127.0.0.1',port,backendPort:backend.port,webroot,manifestPath:await manifest(),tlsKeyPath:path.join(process.env.APP_TEST_TLS,'synthetic-key.pem'),tlsCertPath:path.join(process.env.APP_TEST_TLS,'synthetic-cert.pem'),hstsSeconds:0});
  const hostRequests=[];
  host.server.on('request',(request,response)=>{
    const details={path:request.url,origin:request.headers.origin,site:request.headers['sec-fetch-site'],mode:request.headers['sec-fetch-mode'],destination:request.headers['sec-fetch-dest']};
    response.once('finish',()=>{if(/\/assets\/worker-/.test(request.url)||response.statusCode>=400)hostRequests.push({...details,status:response.statusCode,mime:response.getHeader('content-type'),csp:response.getHeader('content-security-policy')});});
  });
  await host.listen();
  const profile=path.join(run,'cache/app-e2e-'+stamp,engine);
  const context=await type.launchPersistentContext(profile,{headless:true,ignoreHTTPSErrors:true,downloadsPath:path.join(work,'downloads',engine),viewport:{width:1440,height:960},...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{}),...(engine==='chromium'?syntheticChromiumTLSOptions(path.join(process.env.APP_TEST_TLS,'synthetic-cert.pem')):{})});
  const issues=[],phases=[],blockedRequests=[],network=[],cdpEvents=[];let result,page;
  context.on('requestfailed',request=>network.push({event:'failed',url:request.url(),type:request.resourceType(),failure:request.failure()}));
  context.on('response',response=>{if(response.status()>=400||/\/assets\/worker-/.test(response.url()))network.push({event:'response',url:response.url(),status:response.status(),headers:response.headers()});});
  const phase=async label=>{phases.push(label);await writeFile(path.join(evidence,engine+'-phases.json'),JSON.stringify(phases));};
  try{
    await context.addInitScript(()=>{
      globalThis.appCspViolations=[];
      globalThis.appStyleInsertions=[];
      globalThis.appWorkerErrors=[];
      const OriginalWorker=globalThis.Worker;
      globalThis.Worker=class extends OriginalWorker{
        constructor(url,options){super(url,options);this.addEventListener('error',event=>appWorkerErrors.push({url:String(url),message:event.message,filename:event.filename,line:event.lineno,column:event.colno}));}
      };
      new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes)
          if(node.nodeName==='STYLE')globalThis.appStyleInsertions.push(node.textContent);
      }).observe(document,{childList:true,subtree:true});
      document.addEventListener('securitypolicyviolation',event=>globalThis.appCspViolations.push({
        directive:event.effectiveDirective,blockedURI:event.blockedURI,sourceFile:event.sourceFile,
        lineNumber:event.lineNumber,columnNumber:event.columnNumber,sample:event.sample,
        disposition:event.disposition
      }));
    });
    await context.route('**/*',r=>{
      const url=r.request().url(),parsed=new URL(url);
      // WebKit routes owned blob: image requests through Playwright as well.
      // Allow the application's own blobs; keep every external origin blocked.
      if(parsed.origin===origin&&['https:','blob:'].includes(parsed.protocol))return r.continue();
      blockedRequests.push(url);return r.abort();
    });
    await context.addCookies([...f.a.cookies].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})));
    page=context.pages()[0];page.on('pageerror',e=>issues.push(e.message));
    if(engine==='chromium'&&process.env.APP_TEST_CDP==='1'){
      const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Audits.enable');
      cdp.on('Network.loadingFailed',event=>cdpEvents.push({kind:'loadingFailed',...event}));
      cdp.on('Audits.issueAdded',event=>cdpEvents.push({kind:'issue',...event}));
    }
    page.on('console',m=>{if(m.type()==='error')issues.push(m.text());});
    await phase('load');await page.goto(origin);await page.waitForFunction(()=>globalThis.applicationTest,undefined,{timeout:60000});
    assert.deepEqual(await page.evaluate(()=>applicationTest.initialized),{ok:true});
    assert.equal(await page.evaluate(()=>applicationTest.controller.getSnapshot().session.status),'signed-in');
    // No project yet: the start screen carries the one create card.
    await page.locator('[data-create-project]').first().getByRole('button',{name:'Tạo dự án',exact:true}).click();
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().project.id);
    await phase('import-via-ui');
    await page.getByRole('tab',{name:/Ảnh nguồn/}).first().click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#w3a-source-import').click()]);
    await chooser.setFiles({name:'analytical-hole-seam.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().project.source?.kind==='svg'&&!applicationTest.controller.getSnapshot().job,undefined,{timeout:45000});
    await phase('resize');
    assert.equal((await page.evaluate(()=>applicationTest.controller.dispatch({type:'parameter.set',id:'size',value:'40'}))).ok,true);
    await page.getByRole('banner').getByRole('button',{name:'Dựng 3D',exact:true}).click();
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().project.step===2&&!applicationTest.controller.getSnapshot().job,undefined,{timeout:45000});
    assert.equal(await page.evaluate(()=>applicationTest.controller.getSnapshot().project.stats.widthMm),40);
    const revision=await page.evaluate(()=>applicationTest.controller.getSnapshot().project.revision);
    await page.locator('[data-step-chip="1"]').click();
    assert.equal(await page.evaluate(()=>applicationTest.controller.getSnapshot().project.revision),revision);
    await phase('undo-save-open');
    assert.equal((await page.evaluate(()=>applicationTest.controller.dispatch({type:'history.undo'}))).ok,true);
    assert.equal((await page.evaluate(()=>applicationTest.controller.dispatch({type:'project.save'}))).ok,true);
    const id=await page.evaluate(()=>applicationTest.controller.getSnapshot().project.id);
    assert.equal((await page.evaluate(id=>applicationTest.controller.dispatch({type:'project.open',id}),id)).ok,true);
    await page.getByRole('banner').getByRole('button',{name:'Dựng 3D',exact:true}).click();
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().project.step===2&&!applicationTest.controller.getSnapshot().job,undefined,{timeout:45000});
    await phase('export');
    const exported=await page.evaluate(async()=>{const c=applicationTest.controller,s=c.getSnapshot();const format=s.exports.find(e=>e.id==='stl-parts-zip');if(!format?.enabled)throw Error(JSON.stringify(s.diagnostics));const r=await c.exportFile(format.id);if(!r.ok)throw Error(JSON.stringify(r));const out=applicationTest.deliveries.at(-1);return {stats:c.getSnapshot().project.stats,name:out.filename,bytes:Array.from(out.bytes),revision:c.getSnapshot().project.revision};});
    const archive=new Uint8Array(exported.bytes),files=readStoredZip(archive),description=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
    assert.equal(description.parts.length,2);assert.equal(description.units,'mm');
    const oracle=description.parts.map(p=>{const geometry=readSTL(Buffer.from(files.get(p.file)));return inspectMesh(geometry);});
    const scale=exported.stats.widthMm/20,height=exported.stats.heightMm;
    assert.ok(Math.abs(oracle[0].volume-84*scale*scale*height)<.001);
    assert.ok(Math.abs(oracle[1].volume-100*scale*scale*height)<.001);
    await writeFile(path.join(evidence,engine+'-'+exported.name),archive);
    await phase('convert-and-edit-via-ui');
    await page.locator('[data-step-chip="1"]').click();
    await page.getByRole('button',{name:'Chuyển nguồn sang ảnh raster để sửa',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Áp dụng thay đổi',exact:true}).click();
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().project.sourceCanvas?.editable&&!applicationTest.controller.getSnapshot().job,undefined,{timeout:45000});
    await page.getByRole('radio',{name:/^Xóa/}).click();
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().editor.tool==='erase');
    await page.getByRole('combobox',{name:'Chế độ chung của Xóa, Đường cắt và Khung cắt'}).selectOption('hole');
    await page.waitForFunction(()=>applicationTest.controller.getSnapshot().editor.cutMode==='hole');
    const beforeEdit=await page.evaluate(()=>{
      const c=applicationTest.controller,r=c.doc.state.content.app.source.raster;
      const original=c.editSource;
      applicationTest.gestures=[];
      c.editSource=function(g){applicationTest.gestures.push(structuredClone(g));return original.call(this,g).then(result=>{applicationTest.editResult=result;return result;});};
      return {hash:r.rgba,rawHash:c.doc.state.content.app.source.raw.hash,sourceRevision:c.doc.state.content.app.source.revision,history:c.doc.history.cursor};
    });
    const canvas=page.getByRole('img',{name:/^Ảnh nguồn/});
    const point=await canvas.evaluate(element=>{
      const box=element.getBoundingClientRect(),scale=Number(element.dataset.canvasScale);
      return {x:box.x+Number(element.dataset.canvasOffsetX)+52*scale,y:box.y+Number(element.dataset.canvasOffsetY)+52*scale,scale};
    });
    await page.mouse.move(point.x,point.y);await page.mouse.down();
    await page.mouse.move(point.x+8*point.scale,point.y,{steps:4});await page.mouse.up();
    await page.waitForFunction(()=>applicationTest.editResult!==undefined,undefined,{timeout:45000});
    assert.equal(await page.evaluate(()=>applicationTest.editResult.ok),true,JSON.stringify(await page.evaluate(()=>({result:applicationTest.editResult,workerErrors:appWorkerErrors}))));
    await page.waitForFunction(before=>applicationTest.controller.doc.state.content.app.source.revision>before&&!applicationTest.controller.getSnapshot().job,beforeEdit.sourceRevision,{timeout:45000});
    const edited=await page.evaluate(()=>{const c=applicationTest.controller,r=c.doc.state.content.app.source.raster;return {hash:r.rgba,rawHash:c.doc.state.content.app.source.raw.hash,history:c.doc.history.cursor,gestures:applicationTest.gestures};});
    assert.notEqual(edited.hash,beforeEdit.hash);assert.equal(edited.rawHash,beforeEdit.rawHash);
    assert.equal(edited.history,beforeEdit.history+1);assert.equal(edited.gestures.length,1);assert.equal(edited.gestures[0].tool,'erase');
    assert.ok(Math.abs(edited.gestures[0].points[0].x-52)<1);
    await page.getByRole('button',{name:/^Hoàn tác \(/}).first().click();
    await page.waitForFunction(hash=>applicationTest.controller.doc.state.content.app.source.raster.rgba===hash,beforeEdit.hash);
    assert.equal((await page.evaluate(()=>applicationTest.controller.dispatch({type:'project.save'}))).ok,true);
    assert.equal((await page.evaluate(id=>applicationTest.controller.dispatch({type:'project.open',id}),id)).ok,true);
    assert.equal(await page.evaluate(()=>applicationTest.controller.doc.state.content.app.source.raster.rgba),beforeEdit.hash);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'desktop host must contain the UI; sidebar scrolls independently');
    assert.deepEqual(issues,[]);
    assert.deepEqual(await page.evaluate(()=>appCspViolations),[]);
    const productIssues=[...issues];
    await phase('capture');
    await page.screenshot({path:path.join(evidence,engine+'-actual-ui.png'),fullPage:true});
    const capture=await page.evaluate(()=>({violations:appCspViolations,insertions:appStyleInsertions}));
    // Playwright 1.63's WebKit screenshot synchronizes animations by injecting
    // the literal STYLE `body {}`. Production CSP correctly blocks that tool
    // mutation. Verify its exact footprint separately from application errors.
    if(issues.length){
      assert.equal(engine,'webkit');
      assert.deepEqual(issues,["Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy."]);
      assert.deepEqual(capture.insertions,['body {}']);
      assert.equal(capture.violations.length,1);
      assert.equal(capture.violations[0].directive,'style-src-elem');
      assert.equal(capture.violations[0].blockedURI,'inline');
    }
    result={status:'pass',scope:'initial SVG extrusion and confirmed raster editing integration; no full product/G3 claim',engine,version:context.browser().version(),stats:exported.stats,oracle,edit:{before:beforeEdit,after:edited,undoReopenHash:beforeEdit.hash},issues:productIssues,network,hostRequests,cdpEvents,capture:{...capture,issues:[...issues]}};
  }catch(error){
    result={status:'fail',error:error.stack,issues,phases,blockedRequests,network,hostRequests,cdpEvents,workerErrors:page?await page.evaluate(()=>appWorkerErrors).catch(()=>[]):[]};
    if(page){await page.screenshot({path:path.join(evidence,engine+'-failure.png'),fullPage:true}).catch(()=>{});
      result.sourceProbe=await page.evaluate(async()=>{
        const c=applicationTest.controller,p=c.getSnapshot().project.sourceCanvas;
        if(!p)return {canvas:null};
        const report={canvas:p};
        report.image=await new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve({error:'decode'});image.src=p.currentUrl;setTimeout(()=>resolve({error:'timeout'}),3000);});
        return report;
      }).catch(()=>null);
      await writeFile(path.join(evidence,engine+'-failure-ui.txt'),await page.locator('body').innerText().catch(()=>''));}
    throw error;
  }finally{
    if(page)await writeFile(path.join(evidence,engine+'-csp.json'),JSON.stringify(await page.evaluate(()=>globalThis.appCspViolations??[]).catch(()=>[]),null,2));
    await writeFile(path.join(evidence,engine+'-result.json'),JSON.stringify(result??{status:'fail',issues,phases},null,2));await context.close();await host.close();}
});
