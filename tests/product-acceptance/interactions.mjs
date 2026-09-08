
import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {runtime} from './runtime.mjs';import {ProductUI} from './ui-driver.mjs';import {recordCase,suiteExit,redactText} from './records.mjs';import {svg,png,syntheticProfile} from './fixtures.mjs';import {inspectRescue} from './readback.mjs';import {sha256} from './artifact.mjs';
const input=JSON.parse(await readFile(process.argv[2])),engine=process.argv[3],label=process.argv[4],env=await runtime(input,engine,label),{page,f}=env,ui=new ProductUI(page),results=[];
async function check(id,requirements,expected,fn){
 const start=Date.now();let actual,verdict='pass';
 try{actual=await fn();if(actual?.verdict){verdict=actual.verdict;delete actual.verdict;}}catch(e){verdict='fail';actual={error:redactText(e.stack,f.secrets)};}
 await writeFile(join(env.dir,id+'-result.json'),JSON.stringify({verdict,expected,actual,durationMs:Date.now()-start},null,2));await env.capture(id).catch(()=>{});
 const r=await recordCase(env.dir,{id,engine,requirements,scope:'actual release UI + actual backend/SQLite + compiled Workers; only identity/provider are explicit local synthetic fixtures',steps:[id],expected,actual,verdict,artifact:{preparedSHA256:input.preparedSHA256,manifestSHA256:input.releaseSHA256},evidence:[id+'-result.json',id+'-ui.txt']});results.push(r);console.log(JSON.stringify({id,verdict,actual}));await writeFile(join(env.dir,'progress.json'),JSON.stringify(results,null,2));return r;
}
async function rescue(name){const path=join(env.dir,name+'.arch-project.zip');await ui.rescue(path);return inspectRescue(await readFile(path));}
async function menu(name){await page.getByRole('button',{name:/^Menu tài khoản của/}).click();await page.getByRole('menuitem',{name,exact:true}).click();}
async function dismiss(){if(await page.getByRole('dialog').count()){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden',timeout:45000});}}
const name='private-A-'+engine;let sourceBefore,providerJob;
try{
 // Fixture budget is written through real authenticated HTTP/SQLite before UI bootstrap.
 // Currency/quality/size belong to declared TestProvider; no external adapter or paid call.
 await f.a.budget();f.provider.mode='success';
 await page.goto(env.origin,{waitUntil:'domcontentloaded',timeout:10000});await ui.ready();
 await check('PRIVATE-MODEL',['GEO-01','ACC-04'],'real private model provides a committed baseline for failure/cancellation/account tests',async()=>{
  await ui.create('keychain',name);await ui.importFile({name:'private-source.svg',mimeType:'image/svg+xml',buffer:svg});if(await page.getByRole('dialog').count())await ui.approve();const model=await ui.build();sourceBefore=await rescue('private-before');return {model,projectId:sourceBefore.metadata.projectId,revision:sourceBefore.state.revision};
 });
 await check('PROPOSAL-DISCARD',['EDT-01','DAT-01'],'reject actual prepared PNG proposal without advancing head or replacing visible committed model',async()=>{
  assert.ok(sourceBefore);const revision=await ui.revision();await ui.importFile({name:'discard-raster.png',mimeType:'image/png',buffer:png()});
  const dialog=page.getByRole('dialog');await dialog.waitFor({timeout:45000});const proposal=await dialog.innerText();await env.capture('PENDING-RASTER');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden',timeout:45000});await ui.idle();
  assert.equal(await ui.revision(),revision);const after=await rescue('after-discard');assert.equal(after.metadata.selectedManifestHash,sourceBefore.metadata.selectedManifestHash);assert.equal(after.state.content.app.source.raw.hash,sha256(svg));
  assert.equal(Number(await page.locator('[data-visible-model-revision]').getAttribute('data-visible-model-revision')),revision);return {proposal,head:after.metadata.selectedManifestHash,revision,scope:'real prepared-operation discard; not a physical crash or running kernel cancellation proof'};
 });
 await dismiss();
 await check('INVALID-SOURCE-ATOMIC',['SRC-01','DAT-01'],'malformed actual SVG rejected; old head/source/visible revision retained',async()=>{
  const before=await rescue('invalid-before');await ui.importFile({name:'malformed.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg><path d="')});await page.locator('.toast--error').filter({hasText:'SVG_InvalidXml'}).waitFor({timeout:45000});await ui.idle();
  const after=await rescue('invalid-after');assert.equal(after.metadata.selectedManifestHash,before.metadata.selectedManifestHash);assert.equal(after.state.content.app.source.raw.hash,before.state.content.app.source.raw.hash);
  const body=await page.locator('body').innerText();assert.match(body,/SVG_InvalidXml/);return {head:after.metadata.selectedManifestHash,revision:after.state.revision,diagnostics:(body.match(/\b[A-Z][A-Z0-9_]{4,}\b/g)??[]).filter((v,i,a)=>a.indexOf(v)===i)};
 });
 await check('BYOK-QUOTE-CONSENT',['AI-01','AI-02','AI-03'],'real UI stores/checks own credential; explicit model choices; quote has no submit; explicit consent invokes exactly one local synthetic provider and own ledger',async()=>{
  const secret=randomBytes(32).toString('base64url');f.secrets.push(secret);await menu('Kết nối AI');const dialog=page.getByRole('dialog',{name:'Kết nối AI của bạn',exact:true});await dialog.waitFor();
  await dialog.getByLabel('API key',{exact:true}).fill(secret);await dialog.getByRole('checkbox',{name:/Tôi hiểu bước kiểm tra khóa/}).check();await dialog.getByRole('button',{name:'Lưu và kiểm tra khóa',exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('Đã lưu và kiểm tra thông tin kết nối.'),undefined,{timeout:45000});
  assert.equal(await dialog.getByLabel('API key',{exact:true}).inputValue(),'');assert.equal(f.provider.checks,1);assert.equal(f.provider.calls.length,0);
  const credentials=await f.a.ok('GET','/api/v1/ai/credentials');assert.equal(credentials.credentials.length,1);assert.equal((await f.b.ok('GET','/api/v1/ai/credentials')).credentials.length,0);
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();await ui.tab('Ảnh nguồn');const group=page.getByRole('button',{name:'Tạo ảnh bằng AI',exact:true});if(await group.getAttribute('aria-expanded')==='false')await group.click();
  await page.getByRole('button',{name:'Mở trang tạo ảnh',exact:true}).click();const ai=page.getByRole('dialog',{name:'Tạo ảnh bằng AI',exact:true});
  assert.equal(await ai.getByRole('button',{name:'Lấy báo giá',exact:true}).isEnabled(),false);
  await ai.getByRole('combobox',{name:'Mức chất lượng',exact:true}).selectOption('test');await ai.getByRole('combobox',{name:'Kích thước ảnh',exact:true}).selectOption('1x1');await ai.getByRole('textbox',{name:'Mô tả (prompt)',exact:true}).fill('Synthetic local acceptance only');
  await ai.getByRole('button',{name:'Lấy báo giá',exact:true}).click();await page.locator('[data-ai-quote="live"]').waitFor({timeout:45000});const quote=await page.locator('[data-ai-quote="live"]').innerText();assert.equal(f.provider.calls.length,0);
  assert.equal(await ai.getByRole('button',{name:'Gửi lượt đã đồng ý',exact:true}).isEnabled(),false);await ai.getByRole('checkbox',{name:/Tôi đồng ý gửi lượt này với trần/}).check();await ai.getByRole('button',{name:'Gửi lượt đã đồng ý',exact:true}).click();
  for(let i=0;i<100&&f.provider.calls.length===0;i++)await new Promise(r=>setTimeout(r,50));assert.equal(f.provider.calls.length,1);providerJob=f.provider.calls[0].jobId;assert.equal(f.provider.calls[0].secretHash,sha256(Buffer.from(secret)));
  const job=await f.a.poll({id:providerJob},'succeeded');assert.equal(job.accounting.actualMicros,40);
  const b=await f.b.request('GET','/api/v1/ai/jobs/'+providerJob);assert.equal(b.status,404);
  await writeFile(join(env.dir,'ai-job.json'),JSON.stringify(job,null,2));await ai.getByRole('button',{name:'Đóng',exact:true}).click();
  return {quote,credentialId:credentials.credentials[0].id,jobId:providerJob,providerInvocations:f.provider.calls.length,localSyntheticCostMicros:40,currency:'USD',scope:'billing isolation against explicitly local TestProvider, not external provider billing qualification'};
 });
 await dismiss();
 await check('ACCOUNT-RESET',['ACC-01','ACC-03','ACC-04','AI-02'],'UI logout closes private Workers and revokes source URL; separate signed synthetic account B sees no A projects/credentials/jobs/settings',async()=>{
  await ui.tab('Ảnh nguồn');const blobs=await page.locator('img').evaluateAll(es=>es.map(e=>e.src).filter(x=>x.startsWith('blob:')));assert.ok(blobs.length,'actual private source preview URL');const active=env.workers.filter(w=>!w.closedAt);assert.ok(active.length,'actual private Workers exist');
  const profile=syntheticProfile(),settings=await f.a.ok('GET','/api/v1/settings');await f.a.ok('PUT','/api/v1/settings',{schemaVersion:1,values:{printerProfiles:[profile.record],printerProfileSources:[profile.source]}},{'If-Match':'"r'+settings.revision+'"'});
  await menu('Đăng xuất');const dialog=page.getByRole('dialog',{name:'Đăng xuất',exact:true});await dialog.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  await page.getByRole('button',{name:/^Menu tài khoản của/}).waitFor({state:'hidden',timeout:45000});
  for(let i=0;i<100&&active.some(w=>!w.closedAt);i++)await new Promise(r=>setTimeout(r,50));assert.ok(active.every(w=>w.closedAt),'all observed private workers terminated before new account');
  const read=await page.evaluate(async urls=>Promise.all(urls.map(async u=>{try{const r=await fetch(u);return {ok:r.ok};}catch{return {ok:false};}})),blobs);assert.ok(read.every(x=>!x.ok),'private preview URLs revoked before account switch');
  assert.equal((await page.locator('body').innerText()).includes(name),false,'private project label cleared');
  f.b.deviceId=f.a.deviceId;await f.b.login('member-b');await env.context.clearCookies();await env.context.addCookies([...f.b.cookies].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'})));
  await page.reload({waitUntil:'domcontentloaded',timeout:10000});await ui.ready();await ui.tab('Thư viện');
  assert.equal((await page.locator('body').innerText()).includes(name),false);assert.equal(await page.locator('li.card').filter({hasText:name}).count(),0);
  const bSettings=await f.b.ok('GET','/api/v1/settings'),bCredentials=await f.b.ok('GET','/api/v1/ai/credentials'),bJobs=await f.b.ok('GET','/api/v1/ai/jobs');assert.deepEqual(bSettings.values,{});assert.equal(bCredentials.credentials.length,0);assert.equal(bJobs.jobs.length,0);
  return {oldWorkerCount:active.length,closedWorkers:active.length,revokedURLs:blobs.length,Auser:f.a.user.id,Buser:f.b.user.id,bSettingsRevision:bSettings.revision,bCredentials:0,bJobs:0,scope:'logout through real UI; B signed OIDC bootstrapped by synthetic HTTP fixture, not IdP browser redirect qualification'};
 });
 for(const width of [1280,320])await check('UX-'+width,['UI-01','UI-03','UI-05','UI-06'],'six sections, no horizontal overflow, keyboard quick menu and focus restoration at '+width,async()=>{
  await page.setViewportSize({width,height:900});const button=page.getByRole('banner').getByRole('button',{name:/Tìm nhanh/});await button.focus();await page.keyboard.press('Control+k');const d=page.getByRole('dialog');await d.waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,focus:document.activeElement?.textContent}));assert.ok(layout.scrollWidth<=width+1);assert.ok(await button.evaluate(e=>e===document.activeElement));assert.equal(await page.getByRole('tab').count()>=6,true);return layout;
 });
}catch(e){console.error(redactText(e.stack,f.secrets));await env.capture('FATAL').catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(env.dir,'interactions.json'),JSON.stringify({artifact:env.artifact,results},null,2));await env.close();process.exitCode=process.exitCode||suiteExit(results);}


