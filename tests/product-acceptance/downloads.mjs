
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {runtime} from './runtime.mjs';import {ProductUI} from './ui-driver.mjs';import {svg} from './fixtures.mjs';import {inspectRescue,inspectSTL,verifyReceipt} from './readback.mjs';import {inspectMesh} from './mesh-oracle.mjs';import {sha256} from './artifact.mjs';import {recordCase,suiteExit,redactText} from './records.mjs';
const input=JSON.parse(await readFile(process.argv[2])),engine=process.argv[3],label=process.argv[4],env=await runtime(input,engine,label),{page}=env,ui=new ProductUI(page),results=[];let projectId,revision,name='download-'+engine;
async function check(id,expected,fn){let verdict='pass',actual;const start=Date.now();try{actual=await fn();}catch(e){verdict='fail';actual={error:redactText(e.stack,env.f.secrets)};}
 await writeFile(join(env.dir,id+'-result.json'),JSON.stringify({verdict,expected,actual,durationMs:Date.now()-start},null,2));await env.capture(id).catch(()=>{});
 if(verdict==='fail')await env.captureDiagnostics(id).catch(()=>{});
 results.push(await recordCase(env.dir,{id,engine,requirements:['DAT-01','EDT-01','GEO-02','EXP-02'],scope:'actual compiled UI cold reopen and real download; warm-reopen rescue obstruction remains separate',steps:[id],expected,actual,verdict,artifact:{preparedSHA256:input.preparedSHA256,manifestSHA256:input.releaseSHA256},evidence:[id+'-result.json',id+'-ui.txt']}));
 console.log(JSON.stringify({id,verdict,actual}));await writeFile(join(env.dir,'progress.json'),JSON.stringify(results,null,2));}
async function rescue(name){const path=join(env.dir,name+'.arch-project.zip');await ui.rescue(path);return inspectRescue(await readFile(path));}
async function stl(name){const path=join(env.dir,name+'.stl');await ui.download('stl-union',path);const bytes=await readFile(path),parsed=inspectSTL(bytes),mesh=inspectMesh(parsed.mesh),receipt=join(env.dir,name+'-receipt.json');await ui.receipt('stl-union',receipt);const doc=verifyReceipt(await readFile(receipt),bytes,{projectId,revision,formatId:'stl-union'});return {sha256:parsed.sha256,byteLength:bytes.length,triangles:parsed.triangleCount,bounds:parsed.bounds,mesh,receipt:doc.artifact,receiptSHA256:sha256(await readFile(receipt))};}
try{
 await page.goto(env.origin,{waitUntil:'domcontentloaded',timeout:10000});await ui.ready();
 await check('DIRECT-ACTUAL-STL','real SVG product emits a read-back manifold STL and bound receipt before unrelated later save/open assertions',async()=>{
  await ui.create('keychain',name);await ui.importFile({name:'owned-original.svg',mimeType:'image/svg+xml',buffer:svg});if(await page.getByRole('dialog').count())await ui.approve();const before=await rescue('before');projectId=before.metadata.projectId;revision=before.state.revision;const model=await ui.build();return {model,projectId,revision,...await stl('direct')};
 });
 await check('COLD-OPEN-ROUNDTRIP','size+thickness -> actual build -> two keyboard undos -> save -> page reload -> UI open stored project -> original bytes and actual STL receipt',async()=>{
  const before=await rescue('before-edit');await ui.parameter('size','40');await ui.parameter('baseH','3.2');const modified=await ui.build();await ui.undo();await ui.undo();const undone=await rescue('undo');assert.deepEqual(undone.state.parameters,before.state.parameters);assert.ok(undone.state.revision>before.state.revision);
  revision=undone.state.revision;await ui.tab('Thư viện');await page.getByRole('button',{name:/^Lưu dự án/}).first().click();await page.waitForFunction(()=>document.body.innerText.includes('Đã ghi nhận commit lưu dự án.'),undefined,{timeout:45000});await env.capture('SAVED-BEFORE-RELOAD');
  await page.reload({waitUntil:'domcontentloaded',timeout:10000});await ui.ready();await ui.tab('Thư viện');
  assert.equal(await page.getByRole('textbox',{name:'Tên dự án',exact:true}).count(),0,'new controller starts without in-memory project');
  const row=page.locator('li.card').filter({has:page.locator('strong').filter({hasText:new RegExp('^'+name+'$')})});await row.getByRole('button',{name:'Mở',exact:true}).click();
  await page.getByRole('textbox',{name:'Tên dự án',exact:true}).waitFor({timeout:45000});assert.equal(await page.getByRole('textbox',{name:'Tên dự án',exact:true}).inputValue(),name);
  assert.equal(await ui.revision(),revision);const reopened=await rescue('cold-reopened');assert.equal(reopened.metadata.projectId,projectId);assert.equal(reopened.state.content.app.source.raw.hash,sha256(svg));assert.deepEqual(reopened.state.parameters,before.state.parameters);
  const model=await ui.build();return {modified,model,projectId,revision,rawSHA256:sha256(svg),...await stl('cold-reopen')};
 });
}catch(e){console.error(redactText(e.stack,env.f.secrets));process.exitCode=1;}
finally{await writeFile(join(env.dir,'downloads.json'),JSON.stringify({artifact:env.artifact,results},null,2));await env.close();process.exitCode=process.exitCode||suiteExit(results);}
