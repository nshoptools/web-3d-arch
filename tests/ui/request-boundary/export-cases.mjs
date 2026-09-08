import assert from 'node:assert/strict';
/** Actual Opus components/React handlers; a labelled deferred bridge controls
 * revision changes and responses, not production native or persistence proof. */
export async function exportCases(page,record){
 const row=id=>`[data-export-field="${id}"] input`,read=()=>page.evaluate(()=>window.boundary.read());
 const edit=(id,value)=>page.evaluate(({selector,value})=>window.boundary.input(selector,value),{selector:row(id),value});
 const key=(id,key)=>page.evaluate(({selector,key})=>window.boundary.key(selector,key),{selector:row(id),key});
 const publish=(revision,values)=>page.evaluate(({revision,values})=>window.boundary.exportFields(revision,values),{revision,values});
 const settle=(id,value)=>page.evaluate(({id,value})=>window.boundary.settle(id,value),{id,value});
 const calls=async()=>(await read()).calls.filter(c=>c.method==='dispatch'&&c.input.type==='export.configure');
 const last=async()=>{const list=await calls();assert.ok(list.length);return list.at(-1);};
 const refusal={ok:false,diagnostic:{code:'STALE_REVISION',message:'TEST stale draft; discard it to use the current revision',severity:'error'}};
 async function check(name,fn){try{
  await page.evaluate(()=>window.boundary.reset());await publish(0);await page.evaluate(()=>window.boundary.click('[data-testid="exports"]'));
  const number=page.locator(row('errorMm'));if(!await number.isVisible())await page.getByRole('button',{name:/Cài đặt của đường xuất này/}).click();
  await fn();record({name:'export UI: '+name,pass:true});
 }catch(error){record({name:'export UI: '+name,pass:false,error:String(error.stack)});}}
 await check('first dirty revision survives intervening publish and later keystrokes',async()=>{
  await edit('errorMm','0,005');assert.equal((await calls()).length,0);await publish(1);await edit('errorMm','0,006');await key('errorMm','Enter');
  const c=await last();assert.equal(c.input.projectRevision,0);assert.equal(c.input.value,'0,006');await settle(c.id,refusal);assert.equal(await page.locator(row('errorMm')).inputValue(),'0,006');
  await edit('errorMm','0,007');await key('errorMm','Enter');const retry=await last();assert.equal(retry.input.projectRevision,0);await settle(retry.id,refusal);
 });
 await check('Escape discards the numeric draft and next edit captures the new base',async()=>{
  await edit('errorMm','0.007');await publish(2);await key('errorMm','Escape');assert.equal(await page.locator(row('errorMm')).inputValue(),'0.004');assert.equal((await calls()).length,0);
  await edit('errorMm','0,006');await key('errorMm','Enter');const c=await last();assert.equal(c.input.projectRevision,2);await settle(c.id,{ok:true});
 });
 await check('a late success cannot release a newer text draft revision fence',async()=>{
  await edit('filename','Draft A');await key('filename','Enter');const a=await last();await publish(3);await edit('filename','Draft AB');await settle(a.id,{ok:true});
  assert.equal(await page.locator(row('filename')).inputValue(),'Draft AB');await key('filename','Enter');const b=await last();assert.equal(b.input.projectRevision,0);assert.equal(b.input.value,'Draft AB');await settle(b.id,refusal);
 });
 await check('successful current draft releases its fence for a subsequent edit',async()=>{
  await edit('filename','Tên đã lưu');await key('filename','Enter');const a=await last();await publish(1,{filename:'Tên đã lưu'});await settle(a.id,{ok:true});
  await edit('filename','Tên mới');await key('filename','Enter');const b=await last();assert.equal(b.input.projectRevision,1);assert.equal(b.input.value,'Tên mới');await settle(b.id,{ok:true});
 });
 await check('returning text to its published value is an explicit clean draft and no command',async()=>{
  await edit('filename','Draft');await publish(4);await edit('filename','Mô hình');await key('filename','Enter');assert.equal((await calls()).length,0);
  await edit('filename','New draft');await key('filename','Enter');const c=await last();assert.equal(c.input.projectRevision,4);await settle(c.id,{ok:true});
 });
 await check('click controls use their current revision without adopting another field draft',async()=>{
  await edit('filename','Old draft');await publish(5);await page.locator(row('inspection')).click();const c=await last();assert.equal(c.input.field,'inspection');assert.equal(c.input.value,true);assert.equal(c.input.projectRevision,5);
  assert.equal(await page.locator(row('inspection')).isChecked(),false);await publish(5,{inspection:true});await settle(c.id,{ok:true});assert.equal(await page.locator(row('inspection')).isChecked(),true);
  await key('filename','Enter');const text=await last();assert.equal(text.input.projectRevision,0);await settle(text.id,refusal);
 });
 await check('field unmount drops a late refused confirmation without publishing its contents',async()=>{
  await edit('filename','Private draft');await key('filename','Enter');const c=await last();await page.evaluate(()=>window.boundary.click('[data-testid="unmount"]'));
  await settle(c.id,{ok:false,diagnostic:{code:'TEST_PRIVATE',message:'PRIVATE_EXPORT_FIELD_REPLY',severity:'error'},confirmation:{title:'PRIVATE_EXPORT_FIELD_REPLY',changes:['PRIVATE_EXPORT_FIELD_REPLY'],retry:{type:'project.save'}}});
  assert.ok(!(await read()).html.includes('PRIVATE_EXPORT_FIELD_REPLY'));
 });
}
