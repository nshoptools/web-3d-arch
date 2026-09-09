
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {runtime} from './runtime.mjs';import {ProductUI} from './ui-driver.mjs';import {recordCase,suiteExit,redactText} from './records.mjs';
import {svg,vietnameseNFD} from './fixtures.mjs';import {inspectRescue,inspectSTL,verifyReceipt} from './readback.mjs';import {inspectMesh} from './mesh-oracle.mjs';import {sha256} from './artifact.mjs';
const input=JSON.parse(await readFile(process.argv[2])),engine=process.argv[3],label=process.argv[4];
const env=await runtime(input,engine,label),page=env.page,ui=new ProductUI(page),results=[];
const caseFilter=process.argv[5]?new RegExp(process.argv[5]):null;
async function check(id,requirements,expected,fn){
 if(caseFilter&&!caseFilter.test(id))return;
 const start=Date.now();let actual,verdict='pass';
 try{actual=await fn();}catch(e){verdict='fail';actual={error:redactText(e.stack,env.f.secrets)};}
 await writeFile(join(env.dir,id+'-result.json'),JSON.stringify({verdict,expected,actual,durationMs:Date.now()-start},null,2));
 await env.capture(id).catch(e=>console.error(e.message));
 const record=await recordCase(env.dir,{id,engine,requirements,scope:'unmodified actual release UI/HTTP/SQLite/Workers/WASM; focused follow-up with public revision acknowledgement',steps:[id],expected,actual,verdict,artifact:{preparedSHA256:input.preparedSHA256,manifestSHA256:input.releaseSHA256},evidence:[id+'-result.json',id+'-ui.txt']});
 results.push(record);console.log(JSON.stringify({id,verdict,actual}));await writeFile(join(env.dir,'progress.json'),JSON.stringify(results,null,2));return record;
}
async function rescue(name){const path=join(env.dir,name+'.arch-project.zip');await ui.rescue(path);return inspectRescue(await readFile(path));}
async function dismiss(){if(await page.getByRole('dialog').count()){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden',timeout:45000});}}
try{
 // Navigation's DOM event is separate from app ready. Same 10s deadline as r2.
 await page.goto(env.origin,{waitUntil:'domcontentloaded',timeout:10000});await ui.ready();
 if(engine==='firefox')for(const [i,product]of ['keychain','clicky','strap','lego','charm'].entries()){
  await check('DEFAULT-0'+(i+1),['MOD-01','GEO-01'],'actual unmodified default '+product+' builds and normal STL gate available',async()=>{
   await ui.create(product,'focused-firefox-'+product);await ui.importFile({name:product+'.svg',mimeType:'image/svg+xml',buffer:svg});if(await page.getByRole('dialog').count())await ui.approve();
   const model=await ui.build(),formats=await ui.exports();assert.equal(formats.find(f=>f.id==='stl-union').enabled,'true');return {model,formats};
  });await dismiss();
 }
 await check('SVG-ROUNDTRIP',['GEO-02','DAT-01','EDT-01','EXP-02'],'change size+thickness, actual viewport; two acknowledged keyboard undos; save/reopen original bytes; real STL download, manifold/winding and receipt hash',async()=>{
  const name='focused-'+engine+'-svg';await ui.create('keychain',name);await ui.importFile({name:'roundtrip.svg',mimeType:'image/svg+xml',buffer:svg});if(await page.getByRole('dialog').count())await ui.approve();
  const before=await rescue('svg-before');const original=await ui.build();await ui.parameter('size','40');const after=await rescue('svg-after');
  assert.ok(after.state.revision>before.state.revision);assert.notDeepEqual(after.state.parameters,before.state.parameters);
  const stale=await ui.exports();assert.equal(stale.find(f=>f.id==='stl-union').enabled,'false');assert.equal(stale.find(f=>f.id==='png-viewport').enabled,'true');
  await ui.parameter('baseH','3.2');const thicker=await rescue('svg-thicker');assert.ok(thicker.state.revision>after.state.revision);const modifiedModel=await ui.build();
  await ui.undo();const firstUndo=await rescue('svg-undo-thickness');assert.deepEqual(firstUndo.state.parameters,after.state.parameters);
  await ui.undo();const undone=await rescue('svg-undo');assert.ok(undone.state.revision>after.state.revision);assert.deepEqual(undone.state.parameters,before.state.parameters);
  await ui.saveOpen(name);const reopened=await rescue('svg-reopen');assert.equal(reopened.state.content.app.source.raw.hash,sha256(svg));assert.equal(reopened.state.revision,undone.state.revision);
  const model=await ui.build(),out=join(env.dir,'svg-product.stl');await ui.download('stl-union',out);
  const b=await readFile(out),stl=inspectSTL(b),mesh=inspectMesh(stl.mesh),receipt=join(env.dir,'svg-product-receipt.json');
  await ui.receipt('stl-union',receipt);const r=verifyReceipt(await readFile(receipt),b,{projectId:reopened.metadata.projectId,revision:reopened.state.revision,formatId:'stl-union'});
  return {original,modifiedModel,model,mesh,bounds:stl.bounds,artifactSHA256:stl.sha256,triangles:stl.triangleCount,receiptSHA256:sha256(await readFile(receipt)),artifactReceipt:r.artifact,projectId:reopened.metadata.projectId,revision:reopened.state.revision,rawSHA256:sha256(svg),staleFormats:stale.map(({id,enabled,reasonCode})=>({id,enabled,reasonCode})),scope:'independent combinatorial STL oracle, no self-intersection/physical-fit/global-tolerance proof'};
 });
 await dismiss();
 await check('NFD-AS-SOURCE-UI',['SRC-04'],'Dùng chữ làm hình produces an adopted source using current exact NFD text and selected original font',async()=>{
  await ui.create('keychain','focused-'+engine+'-nfd');await ui.tab('Ảnh nguồn');await ui.openGroup('Chữ');
  await page.locator('#text-panel-font-q').fill('Be Vietnam Pro');await page.locator('#text-panel-font').selectOption('bevietnampro');
  await page.waitForFunction(()=>document.querySelector('[data-role="text-preview"] .chip')?.textContent==='bevietnampro',undefined,{timeout:45000});
  const field=page.locator('#text-panel-value');await field.fill(vietnameseNFD);await field.blur();
  await page.waitForFunction(value=>document.querySelector('[data-role="text-preview"] strong')?.textContent===value,vietnameseNFD,{timeout:45000});
  const prior=await ui.revision();await ui.tab('Ảnh nguồn');await page.locator('#text-panel-assource').click();await ui.waitRevision(prior);
  const r=await rescue('text-toggle');assert.equal(r.state.content.app.text.text,vietnameseNFD);assert.equal(r.state.content.app.text.asSource,true);
  assert.ok(r.state.content.app.source,'TEXT_AS_SOURCE_NOT_ADOPTED: flag true after committed revision, source missing');
  return {source:r.state.content.app.source};
 });
 await dismiss();
 await check('NFD-FILE',['SRC-04','VEC-01'],'actual .txt import route with original selected font and unchanged NFD; confirmed conversion and real build',async()=>{
  const bytes=Buffer.from(vietnameseNFD);await ui.importFile({name:'vietnamese-nfd.txt',mimeType:'text/plain',buffer:bytes});if(await page.getByRole('dialog').count())await ui.approve();
  const r=await rescue('text-file');assert.equal(r.state.content.app.source?.kind,'text');assert.equal(r.state.content.app.source.raw.hash,sha256(bytes));
  assert.ok([...r.files.values()].some(b=>b.equals(bytes)),'original exact NFD bytes retained');
  await ui.tab('Ảnh nguồn');await page.getByRole('button',{name:'Chuyển nguồn sang ảnh raster để sửa',exact:true}).click();await ui.approve();
  const converted=await rescue('text-converted');assert.equal(converted.state.content.app.source.raw.hash,sha256(bytes));const model=await ui.build();
  return {model,source:r.state.content.app.source,converted:converted.state.content.app.source,assets:r.manifest.assets,textCodepoints:Array.from(vietnameseNFD,c=>c.codePointAt(0).toString(16))};
 });
 await dismiss();
 await check('COLOR-LIBRARY',['SRC-02','GEO-01'],'explicit original Noto COLRv1 asset adoption, conversion consent, original hash retention and actual build',async()=>{
  await ui.create('keychain','focused-'+engine+'-color');const prior=await ui.revision();await ui.tab('Ảnh nguồn');await ui.openGroup('Emoji');
  const group=page.getByRole('group',{name:'Bộ nguồn emoji',exact:true});await group.getByRole('button',{name:/Noto.*(?:COLR|màu)/}).first().click();
  await page.getByRole('searchbox',{name:'Tìm emoji',exact:true}).fill('1F600');
  const item=page.getByRole('listbox',{name:'Lưới emoji',exact:true}).getByRole('option').first();await item.waitFor();const selection=await item.getAttribute('aria-label');await item.click();
  await ui.waitRevision(prior);const r=await rescue('color-source');assert.equal(r.state.content.app.source?.kind,'emoji');
  await ui.tab('Ảnh nguồn');await page.getByRole('button',{name:'Chuyển nguồn sang ảnh raster để sửa',exact:true}).click();await ui.approve();
  const converted=await rescue('color-converted');assert.equal(converted.state.content.app.source.raw.hash,r.state.content.app.source.raw.hash);
  const model=await ui.build();return {selection,model,source:r.state.content.app.source,converted:converted.state.content.app.source,assets:r.manifest.assets};
 });
}catch(e){console.error(redactText(e.stack,env.f.secrets));await env.capture('FATAL').catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(env.dir,'focused.json'),JSON.stringify({artifact:env.artifact,results},null,2));await env.close();process.exitCode=process.exitCode||suiteExit(results);}


