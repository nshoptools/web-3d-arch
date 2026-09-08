import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {runtime} from './runtime.mjs';import {ProductUI} from './ui-driver.mjs';import {recordCase,suiteExit,redactText} from './records.mjs';
import {svg,png,vietnameseNFD,syntheticProfile} from './fixtures.mjs';import {inspectRescue,inspectSTL,verifyReceipt} from './readback.mjs';import {inspectMesh} from './mesh-oracle.mjs';import {sha256} from './artifact.mjs';
const input=JSON.parse(await readFile(process.argv[2]??new URL('./baseline.json',import.meta.url))),engine=process.argv[3],label=process.argv[4];
assert.ok(['chromium','firefox','webkit'].includes(engine)&&/^[a-z0-9-]+$/.test(label));
const env=await runtime(input,engine,label),page=env.page,ui=new ProductUI(page),results=[];
async function check(id,requirements,scope,expected,fn){
 const start=Date.now();let actual,verdict='pass';
 try{actual=await fn();if(actual?.verdict){verdict=actual.verdict;delete actual.verdict;}}
 catch(e){verdict='fail';actual={error:redactText(e.stack,env.f.secrets)};}
 await writeFile(join(env.dir,id+'-result.json'),JSON.stringify({verdict,scope,expected,actual,durationMs:Date.now()-start},null,2));
 const capture=await env.capture(id).catch(e=>({captureError:e.message}));
 const record=await recordCase(env.dir,{id,engine,requirements,scope,steps:[id],expected,actual:{...actual,capture},verdict,
  artifact:{preparedSHA256:input.preparedSHA256,manifestSHA256:input.releaseSHA256},evidence:[id+'-result.json',id+'-ui.txt']});
 results.push(record);console.log(JSON.stringify({id,verdict,actual}));await writeFile(join(env.dir,'campaign-progress.json'),JSON.stringify(results,null,2));return record;
}
async function rescue(name){const path=join(env.dir,name+'.arch-project.zip');await ui.rescue(path);const r=inspectRescue(await readFile(path));return {...r,path};}
async function settingsDialog(){await page.getByRole('button',{name:/^Menu tài khoản của/}).click();await page.getByRole('menuitem',{name:'Cài đặt cá nhân',exact:true}).click();await page.getByRole('dialog',{name:'Cài đặt cá nhân',exact:true}).waitFor();}
try{
 await page.goto(env.origin);await ui.ready();
 await check('BOOT',['WEB-01','ACC-01'],'actual compiled UI + real backend signed synthetic identity','authenticated UI, COI, production entry and four potential Worker routes',async()=>{
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true);assert.equal(await page.locator('[data-create-project]').count()>0,true);
  return {crossOriginIsolated:true,ui:await page.title(),workersAtBoot:env.workers};
 });
 await check('SETTINGS-NOPROJECT',['ACC-03','DAT-03'],'actual UI JSON import/export and backend SQLite; synthetic normalized profile input','settings roundtrip in current account without project; account B sees no A profile',async()=>{
  await settingsDialog();const dialog=page.getByRole('dialog',{name:'Cài đặt cá nhân',exact:true}),fixture=syntheticProfile();
  await dialog.getByRole('button',{name:/Dữ liệu cài đặt/}).click();
  const doc={schemaVersion:1,values:{language:'vi',printerProfiles:[fixture.record],printerProfileSources:[fixture.source]}};
  await writeFile(join(env.dir,'profile-input.json'),fixture.raw);
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),dialog.getByRole('button',{name:'Gộp JSON vào cài đặt hiện có',exact:true}).click()]);
  await chooser.setFiles({name:'acceptance-settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(()=>document.body.innerText.includes('Đã gửi bản gộp cài đặt.'),undefined,{timeout:45000});
  const got=await env.f.a.ok('GET','/api/v1/settings');assert.deepEqual(got.values.printerProfiles,[fixture.record]);assert.deepEqual(got.values.printerProfileSources,[fixture.source]);
  assert.equal((await env.f.b.ok('GET','/api/v1/settings')).values.printerProfiles,undefined);
  const exportButton=dialog.getByRole('button',{name:'Xuất JSON cài đặt',exact:true});
  if(!(await exportButton.isEnabled())){
   const reason=await dialog.innerText();await env.capture('SETTINGS-EXPORT-BLOCKED');
   await dialog.getByRole('checkbox',{name:'Tôi hiểu tác động của đặt lại',exact:true}).check();await dialog.getByRole('button',{name:'Về mặc định gốc',exact:true}).click();
   await page.waitForFunction(()=>document.body.innerText.includes('Đã gửi lệnh đặt lại cài đặt cá nhân.'),undefined,{timeout:45000});
   const deleted=await env.f.a.ok('GET','/api/v1/settings');assert.deepEqual(deleted.values,{});
   await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
   throw Object.assign(Error('SETTINGS_EXPORT_NOT_REGISTERED: UI import and account-isolated real SQLite read succeeded; export disabled. '+reason),{code:'SETTINGS_EXPORT_NOT_REGISTERED'});
  }
  const [download]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);
  const path=join(env.dir,'settings-roundtrip.json');await download.saveAs(path);const exported=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(exported.values.printerProfiles,[fixture.record]);
  await dialog.getByRole('checkbox',{name:'Tôi hiểu tác động của đặt lại',exact:true}).check();await dialog.getByRole('button',{name:'Về mặc định gốc',exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('Đã gửi lệnh đặt lại cài đặt cá nhân.'),undefined,{timeout:45000});
  const deleted=await env.f.a.ok('GET','/api/v1/settings');assert.deepEqual(deleted.values,{});
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  return {revisionBefore:got.revision,revisionAfter:deleted.revision,profileHash:fixture.record.sha256,originalSHA256:fixture.source.sha256,exportSHA256:sha256(await readFile(path)),dedicatedProfileUI:'absent; JSON path is not a substitute for its feature acceptance'};
 });
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 for(const [index,product]of ['keychain','clicky','strap','lego','charm'].entries()){
  await check('PROD-0'+(index+1),['MOD-01','GEO-01','ARC-01'],'actual default '+product+' native product; original two-color SVG fixture; no parameter/recipe substitution','default builds, visible lease and normal STL gate available',async()=>{
   await ui.create(product,'acceptance-'+engine+'-'+product);await ui.importFile({name:'product-'+product+'.svg',mimeType:'image/svg+xml',buffer:svg});
   if(await page.getByRole('dialog').count())await ui.approve();
   const model=await ui.build(),formats=await ui.exports(),stl=formats.find(x=>x.id==='stl-union');assert.equal(stl?.enabled,'true',stl?.text);
   return {product,model,formats,sourceSHA256:sha256(svg)};
  });
  if(product==='clicky'&&await page.locator('[data-proposal-id]').count())await check('PROD-02-CONSENT',['MOD-01','GEO-01'],'actual keycap after explicit proposed adjustment; not original-default pass','accept displayed exact proposal and build the resulting revision',async()=>{
   const proposal=await page.getByRole('dialog').innerText();await ui.approve();
   const model=await page.locator('[data-step-chip="2"]').getAttribute('aria-current')==='step'?{visibleRevision:Number(await page.locator('[data-visible-model-revision]').getAttribute('data-visible-model-revision')),readouts:await page.locator('#w3a-stage-readouts').innerText()}:await ui.build();
   const formats=await ui.exports();assert.equal(formats.find(f=>f.id==='stl-union')?.enabled,'true');return {proposal,model,formats};
  });
  if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 }
 await check('FLOW-SVG',['GEO-02','DAT-01','EDT-01','EXP-02'],'actual UI parameter/undo/storage/open/build/download; independent byte/STL/receipt reading','size40, retained prior model on edit, undo returns default size, save/open raw source stable, real STL/receipt join',async()=>{
  await ui.create('keychain','acceptance-'+engine+'-svg-roundtrip');await ui.importFile({name:'roundtrip.svg',mimeType:'image/svg+xml',buffer:svg});if(await page.getByRole('dialog').count())await ui.approve();
  const before=await rescue('svg-before'),oldSize=before.state;
  await ui.parameter('size','40');const after=await rescue('svg-after');
  assert.ok(after.state.revision>before.state.revision);assert.notDeepEqual(after.state.parameters,before.state.parameters);
  await page.locator('[data-step-chip="1"]').click();await page.keyboard.press('Control+z');await ui.idle();
  const undone=await rescue('svg-undo');assert.ok(undone.state.revision>after.state.revision);assert.deepEqual(undone.state.parameters,before.state.parameters);
  await ui.saveOpen('acceptance-'+engine+'-svg-roundtrip');const reopened=await rescue('svg-reopen');
  assert.equal(reopened.state.content.app.source.raw.hash,sha256(svg));assert.equal(reopened.state.revision,undone.state.revision);
  const model=await ui.build(),out=join(env.dir,'svg-product.stl');await ui.download('stl-union',out);
  const b=await readFile(out),stl=inspectSTL(b),mesh=inspectMesh(stl.mesh);
  const receipt=join(env.dir,'svg-product-receipt.json');await ui.receipt('stl-union',receipt);verifyReceipt(await readFile(receipt),b,{projectId:reopened.metadata.projectId,revision:reopened.state.revision,formatId:'stl-union'});
  return {model,mesh,bounds:stl.bounds,artifactSHA256:stl.sha256,projectId:reopened.metadata.projectId,revision:reopened.state.revision,rawSHA256:sha256(svg),receiptSHA256:sha256(await readFile(receipt)),geometryScope:'independent combinatorial STL check; no physical fit/pipeline tolerance proof'};
 });
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('FLOW-RASTER',['SRC-01','EDT-01'],'original synthetic PNG bytes through actual decoder/source/segmentation/confirmation Worker','confirmed source retained; real product build or preserved actionable failure',async()=>{
  await ui.create('keychain','acceptance-'+engine+'-png');const raw=png();await writeFile(join(env.dir,'input-raster.png'),raw);
  await ui.importFile({name:'input-raster.png',mimeType:'image/png',buffer:raw});if(await page.getByRole('dialog').count())await ui.approve();
  const r=await rescue('raster-source');assert.equal(r.state.content.app.source.raw.hash,sha256(raw));const model=await ui.build();
  return {model,rawSHA256:sha256(raw),sourceKind:r.state.content.app.source.kind};
 });
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('FLOW-NFD',['SRC-04','VEC-01'],'actual original Be Vietnam Pro font, NFD string and production text pipeline','exact NFD source text/original font and real product build',async()=>{
  await ui.create('keychain','acceptance-'+engine+'-nfd');await ui.tab('Ảnh nguồn');
  await page.locator('#text-panel-font-q').fill('Be Vietnam Pro');await page.locator('#text-panel-font').selectOption('bevietnampro');
  const text=page.locator('#text-panel-value');await text.fill(vietnameseNFD);await text.blur();
  await page.waitForFunction(value=>document.querySelector('[data-role="text-preview"] strong')?.textContent===value,vietnameseNFD,{timeout:45000});
  await page.locator('#text-panel-assource').click();
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')||document.querySelector('.toast--error')||document.querySelector('img[src^="blob:"]'),undefined,{timeout:45000});await ui.idle();if(await page.getByRole('dialog').count())await ui.approve();
  const r=await rescue('nfd-source');assert.equal(r.state.content.app.text.text,vietnameseNFD);assert.equal(r.state.content.app.text.fontId,'bevietnampro');assert.ok(r.state.content.app.source);
  const model=await ui.build();return {model,textCodepoints:Array.from(vietnameseNFD,c=>c.codePointAt(0).toString(16)),assets:r.manifest.assets.map(a=>({hash:a.hash,byteLength:a.byteLength,kind:a.kind}))};
 });
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('FLOW-COLOR',['SRC-02','GEO-01'],'actual colored source library item and original assets','explicit Noto color collection choice, original colored asset adoption and real build',async()=>{
  await ui.create('keychain','acceptance-'+engine+'-color');await ui.tab('Ảnh nguồn');
  const collections=await page.getByRole('group',{name:'Bộ nguồn emoji',exact:true}).innerText();
  const colorButton=page.getByRole('group',{name:'Bộ nguồn emoji',exact:true}).getByRole('button',{name:/Noto.*(?:COLR|màu)/}).first();
  assert.equal(await colorButton.count(),1,'explicit color source selector');await colorButton.click();
  await page.getByRole('searchbox',{name:'Tìm emoji',exact:true}).fill('1F600');
  const grid=page.getByRole('listbox',{name:'Lưới emoji',exact:true});await grid.getByRole('option').first().waitFor();const label=await grid.getByRole('option').first().getAttribute('aria-label');
  await grid.getByRole('option').first().click();await ui.idle();if(await page.getByRole('dialog').count())await ui.approve();
  const r=await rescue('color-source');assert.equal(r.state.content.app.source?.kind,'emoji');
  await page.getByRole('button',{name:'Chuyển nguồn sang ảnh raster để sửa',exact:true}).click();await ui.approve();
  const converted=await rescue('color-converted');assert.equal(converted.state.content.app.source.raw.hash,r.state.content.app.source.raw.hash);
  const model=await ui.build();return {collections,selected:label,model,source:r.state.content.app.source,converted:converted.state.content.app.source};
 });
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 for(const width of [1280,320])await check('UX-'+width,['UI-01','UI-03','UI-05','UI-06'],'actual compiled UI DOM/layout and keyboard at '+width+' CSS px','no horizontal document overflow; CtrlK/Escape restores focus; six sections accessible',async()=>{
  await page.setViewportSize({width,height:900});await page.getByRole('banner').getByRole('button',{name:/Tìm nhanh/}).focus();await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,focus:document.activeElement?.textContent}));
  assert.ok(layout.scrollWidth<=width+1,'document horizontal overflow');assert.equal(await page.getByRole('tab').count()>=6,true);return layout;
 });
}catch(e){console.error(redactText(e.stack,env.f.secrets));process.exitCode=1;}
finally{
 await writeFile(join(env.dir,'campaign.json'),JSON.stringify({artifact:env.artifact,results,readiness:results.length&&results.every(r=>r.verdict==='pass')?'selected-cases-only':'not-ready',open:['dedicated profile UI','OIDC HTTPS navigation','cancel/stale/account ABA interactions until executed','known22 curved native cases','pending root source/import fixes','physical fit and global pipeline tolerance']},null,2));
 await env.close();process.exitCode=process.exitCode||suiteExit(results);
}


