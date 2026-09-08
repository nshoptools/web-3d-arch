import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {runtime} from './runtime.mjs';import {ProductUI} from './ui-driver.mjs';const svg=await readFile(new URL('./hai-mau-co-lo.svg',import.meta.url));
import {inspectRescue,inspectSTL,verifyReceipt} from './readback.mjs';import {inspectMesh} from './mesh-oracle.mjs';
import {sha256} from './artifact.mjs';import {redactText,suiteExit,recordCase} from './records.mjs';
const input=JSON.parse(await readFile(process.argv[2])),label=process.argv[3],env=await runtime(input,'chromium',label,{headless:false}),{page}=env,ui=new ProductUI(page),results=[];
let receiptDoc=null,productReady=false,model=null;
const save=(name,v)=>writeFile(join(env.dir,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
async function check(id,expected,fn){
 const started=Date.now();let verdict='pass',actual;
 try{actual=await fn();}catch(e){verdict='fail';actual={error:redactText(e.stack,env.f.secrets)};}
 await save(id+'-result.json',{verdict,expected,actual,durationMs:Date.now()-started});
 await env.capture(id).catch(()=>{});if(verdict==='fail')await env.captureDiagnostics(id).catch(()=>{});
 const result=await recordCase(env.dir,{id,engine:'chromium',requirements:['WEB-01','ACC-03','EXP-02','STO-01'],scope:'Final compiled product; exactly three targeted UI/HTTP/SQLite/Worker/WASM smoke flows. Local signed test identity.',steps:[id],expected,actual,verdict,artifact:{preparedSHA256:input.preparedSHA256,manifestSHA256:input.releaseSHA256},evidence:[id+'-result.json',id+'-ui.txt']});
 results.push(result);console.log(JSON.stringify({id,verdict,actual}));await writeFile(join(env.dir,'progress.json'),JSON.stringify(results,null,2));
 if(await page.getByRole('dialog').count()){await page.keyboard.press('Escape').catch(()=>{});await page.getByRole('dialog').waitFor({state:'hidden',timeout:10000}).catch(()=>{});}
}
async function downloadSTL(path){
 await ui.tab('Xuất');const card=page.locator('[data-export-option="stl-union"]');
 assert.equal(await card.getAttribute('data-export-enabled'),'true',await card.innerText());
 const beforeRevision=await page.locator('[data-visible-model-revision]').getAttribute('data-visible-model-revision');
 const events=[];let deliver;const next=new Promise(r=>deliver=r),listener=d=>{events.push(d);deliver(d);};page.on('download',listener);
 let conditioning={status:'not-proposed'};
 const deadline=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('DOWNLOAD_TIMEOUT')),ms))]).finally(()=>clearTimeout(timer));};
 try{
  await card.getByRole('button',{name:/^Xuất(?: để kiểm tra)?$/,exact:false}).click();
  const first=await Promise.race([next.then(download=>({download})),page.locator('[data-proposal-id]').waitFor({timeout:45000}).then(()=>({proposal:true}),error=>({error}))]);
  let download=first.download;
  if(first.proposal){
   assert.equal(events.length,0,'no output before explicit approval');
   assert.equal(await page.locator('[data-visible-model-revision]').getAttribute('data-visible-model-revision'),beforeRevision,'proposal preserves visible committed model');
   const id=await page.locator('[data-proposal-id]').getAttribute('data-proposal-id'),description=await page.getByRole('dialog').innerText();
   assert.match(description,/float|STL|làm tròn|điều kiện|dịch chuyển/i,'actual serialization proposal');
   await env.capture('STL-EXPLICIT-CONSENT');
   conditioning={status:'explicitly-approved',id,description,noDownloadBeforeApproval:true};
   await ui.approve();download=await deadline(next,45000);
  } else if(first.error)throw first.error;
  assert.ok(download);assert.equal(await download.failure(),null);await download.saveAs(path);await ui.idle();
  assert.equal(events.length,1,'single artifact download for one export action');return {filename:download.suggestedFilename(),conditioning};
 }finally{page.off('download',listener);}
}
try{
 await page.goto(env.origin,{waitUntil:'domcontentloaded',timeout:10000});await ui.ready();
 assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
 await check('SETTINGS-JSON','No project required: UI JSON import and download roundtrip equals actual current-account HTTPS/SQLite settings, no credentials exported',async()=>{
  assert.equal(await page.getByRole('textbox',{name:'Tên dự án',exact:true}).count(),0);
  await page.getByRole('button',{name:/^Menu tài khoản của/}).click();await page.getByRole('menuitem',{name:'Cài đặt cá nhân',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Cài đặt cá nhân',exact:true});await dialog.waitFor();
  const group=dialog.getByRole('button',{name:/Dữ liệu cài đặt/});if(await group.getAttribute('aria-expanded')==='false')await group.click();
  const document={schemaVersion:1,values:{language:'vi'}},bytes=Buffer.from(JSON.stringify(document));
  await writeFile(join(env.dir,'settings-input.json'),bytes,{flag:'wx'});
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),dialog.getByRole('button',{name:'Gộp JSON vào cài đặt hiện có',exact:true}).click()]);
  await chooser.setFiles({name:'final-settings.json',mimeType:'application/json',buffer:bytes});
  await page.waitForFunction(()=>document.body.innerText.includes('Đã gửi bản gộp cài đặt.'),undefined,{timeout:45000});
  const actual=await env.f.a.ok('GET','/api/v1/settings');assert.deepEqual(actual.values,document.values);
  const button=dialog.getByRole('button',{name:'Xuất JSON cài đặt',exact:true});assert.equal(await button.isEnabled(),true,await dialog.innerText());
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:45000}),button.click()]);assert.equal(await download.failure(),null);
  const path=join(env.dir,'settings.json');await download.saveAs(path);const exportedBytes=await readFile(path),exported=JSON.parse(exportedBytes);
  assert.deepEqual(exported,{schemaVersion:1,values:actual.values});
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  return {settingsRevision:actual.revision,values:exported.values,byteLength:exportedBytes.length,sha256:sha256(exportedBytes),noProject:true,transport:'actual HTTPS/SQLite; synthetic signed identity only'};
 });
 await check('ORDINARY-PRODUCT-STL','Actual ordinary keychain + SVG goes through compiled Worker/WASM and visible Three model to STL, independent mesh readback and current-revision receipt; explicit consent if proposed',async()=>{
  await ui.create('keychain','final-keychain-smoke');await ui.importFile({name:'final-original.svg',mimeType:'image/svg+xml',buffer:svg});
  if(await page.locator('[data-proposal-id]').count()){await env.capture('SOURCE-CONSENT');await ui.approve();}
  model=await ui.build();productReady=true;const revision=await ui.revision();assert.equal(model.visibleRevision,revision);
  await env.capture('ACTUAL-MODEL');
  const path=join(env.dir,'keychain.stl'),delivery=await downloadSTL(path),bytes=await readFile(path),parsed=inspectSTL(bytes),mesh=inspectMesh(parsed.mesh);
  const receiptPath=join(env.dir,'keychain-receipt.json');await ui.receipt('stl-union',receiptPath);
  const receiptBytes=await readFile(receiptPath),pre=JSON.parse(receiptBytes);assert.match(pre.projectId,/^[0-9a-f-]{36}$/);
  receiptDoc=verifyReceipt(receiptBytes,bytes,{projectId:pre.projectId,revision,formatId:'stl-union'});assert.equal(receiptDoc.artifact.inspection,false);
  if(delivery.conditioning.status==='explicitly-approved')assert.equal(receiptDoc.exporter?.conditioning?.status,'explicitly-confirmed');
  return {model,projectId:receiptDoc.projectId,revision,sha256:parsed.sha256,byteLength:bytes.length,triangles:parsed.triangleCount,bounds:parsed.bounds,mesh,receiptSHA256:sha256(receiptBytes),conditioning:delivery.conditioning,projectIdentityBinding:'cross-checked against independent downloaded rescue in RESCUE-ZIP',qualificationLimit:'No added physical-fit, global-error or self-intersection proof from this independent reader'};
 });
 await check('RESCUE-ZIP','Actual UI download has coherent selected manifest, complete CRC/size/SHA inventory, original SVG bytes and current project/revision; matches STL receipt when emitted',async()=>{
  assert.ok(productReady,'ordinary product must have committed its model');const revision=await ui.revision(),path=join(env.dir,'final-rescue.arch-project.zip');
  await ui.rescue(path);const bytes=await readFile(path),rescue=inspectRescue(bytes);assert.equal(rescue.state.revision,revision);
  assert.equal(rescue.state.content.app.source.raw.hash,sha256(svg));assert.ok(rescue.files.has('assets/'+sha256(svg)+'.bin'));assert.deepEqual(rescue.files.get('assets/'+sha256(svg)+'.bin'),svg);
  if(receiptDoc){assert.equal(rescue.metadata.projectId,receiptDoc.projectId);assert.equal(rescue.state.revision,receiptDoc.artifact.projectRevision);}
  return {projectId:rescue.metadata.projectId,revision,selectedManifestHash:rescue.metadata.selectedManifestHash,entries:rescue.files.size,sha256:sha256(bytes),byteLength:bytes.length,originalSHA256:sha256(svg),receiptCrossBound:!!receiptDoc,complete:true,issues:[]};
 });
}catch(e){console.error(redactText(e.stack,env.f.secrets));process.exitCode=1;}
finally{await save('summary.json',{scope:'Only three selected final smoke flows',artifact:env.artifact,results});await env.close();process.exitCode=process.exitCode||suiteExit(results);}
