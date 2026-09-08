import assert from 'node:assert/strict';import path from 'node:path';import {write} from './support.mjs';
export async function cases(page,record,out,engine){
const row=id=>page.locator('[data-export-field="'+id+'"] input'),read=()=>page.evaluate(()=>window.review.read());
const publish=(revision,values={})=>page.evaluate(({revision,values})=>window.review.publish(revision,values),{revision,values});
const update=patch=>page.evaluate(p=>window.review.update(p),patch),settle=(id,result,rejected=false)=>page.evaluate(({id,result,rejected})=>window.review.settle(id,result,rejected),{id,result,rejected});
const calls=async()=>(await read()).calls.filter(c=>c.method==='dispatch'||c.method==='exportFile'),last=async()=>{const v=await calls();assert.ok(v.length);return v.at(-1)};
const refusal=message=>({ok:false,diagnostic:{code:'REVIEW_REFUSAL',message,severity:'error'}});
const confirm=id=>({...refusal('Confirmation '+id),confirmation:{title:'Conversion '+id,changes:['Change geometry for '+id],retry:{type:'proposal.accept',id,confirmed:true}}});
async function check(id,name,fn){await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>window.review.reset());let observed={};try{observed=await fn()??{};await record({id,name,pass:true,observed})}catch(e){observed={...observed,...await read()};const png=path.join(out,engine+'-'+id+'.png');await page.screenshot({path:png});write(path.join(out,engine+'-'+id+'-state.json'),observed);await record({id,name,pass:false,error:String(e.stack),evidence:png,observed})}}
await check('L01','raw decimal and text drafts retain first-dirty revision and current rejection',async()=>{
await row('errorMm').fill('0,005000000');await publish(3);await row('errorMm').fill('0,006000000 tail');await row('errorMm').press('Enter');let c=await last();assert.equal(c.input.value,'0,006000000 tail');assert.equal(c.input.projectRevision,0);await settle(c.id,refusal('REJECT_EXACT_RAW'));assert.equal(await row('errorMm').inputValue(),'0,006000000 tail');assert.equal(await row('errorMm').getAttribute('aria-invalid'),'true');
await row('errorMm').press('Escape');await row('filename').fill('Đồ án / <không sửa>');await publish(4);await row('filename').press('Enter');c=await last();assert.equal(c.input.value,'Đồ án / <không sửa>');assert.equal(c.input.projectRevision,3);return {calls:await calls()}
});
await check('L02','late success preserves newer text and its starting revision',async()=>{
await row('filename').fill('Draft A');await row('filename').press('Enter');const a=await last();await publish(1,{filename:'Draft A'});await row('filename').fill('Draft AB');await settle(a.id,{ok:true});assert.equal(await row('filename').inputValue(),'Draft AB');await row('filename').press('Enter');assert.equal((await last()).input.projectRevision,0);return {calls:await calls()}
});
await check('L03','current success releases base and external publication updates clean field',async()=>{
await row('filename').fill('Saved');await row('filename').press('Enter');const a=await last();await publish(1,{filename:'Saved'});await settle(a.id,{ok:true});await publish(2,{filename:'External'});assert.equal(await row('filename').inputValue(),'External');await row('filename').fill('New');await row('filename').press('Enter');assert.equal((await last()).input.projectRevision,2);return {calls:await calls()}
});
await check('L04','new draft suppresses old shared confirmation',async()=>{
await row('filename').fill('Old');await row('filename').press('Enter');const a=await last();await row('filename').fill('New unsent');await settle(a.id,confirm('OLD_DRAFT'));assert.equal((await read()).state.dialogs.length,0);return {calls:await calls()}
});
await check('L05','Escape suppresses old shared confirmation',async()=>{
await row('errorMm').fill('0.009');await row('errorMm').press('Enter');const a=await last();await row('errorMm').press('Escape');assert.equal(await row('errorMm').inputValue(),'0.004');await settle(a.id,confirm('ESCAPED'));assert.equal((await read()).state.dialogs.length,0)
});
await check('L06','same-value numeric Enter cancels and releases the revision fence',async()=>{
await row('errorMm').fill('0.009');await publish(4);await row('errorMm').fill('0.004');await row('errorMm').press('Enter');assert.equal((await calls()).length,0);await row('errorMm').fill('0.006');await row('errorMm').press('Enter');assert.equal((await last()).input.projectRevision,4)
});
await check('L07','same-value text Enter and numeric blur cancel drafts',async()=>{
await row('filename').fill('Old');await publish(2);await row('filename').fill('Mô hình');await row('filename').press('Enter');assert.equal((await calls()).length,0);await row('errorMm').fill('0.009');await publish(4);await row('errorMm').fill('0.004');await row('errorMm').press('Tab');assert.equal((await calls()).length,0);await row('errorMm').fill('0.006');await row('errorMm').press('Enter');assert.equal((await last()).input.projectRevision,4);return {calls:await calls()}
});
await check('L08','concurrent fields keep independent refusals',async()=>{
await row('filename').fill('Name');await row('filename').press('Enter');const a=await last();await row('errorMm').fill('0.008');await row('errorMm').press('Enter');const b=await last();await settle(b.id,refusal('NUMBER_CURRENT'));const pending=(await calls()).filter(c=>c.input.field==='filename'&&c.pending);for(const c of pending)await settle(c.id,refusal('TEXT_CURRENT'));assert.equal(await row('filename').getAttribute('aria-invalid'),'true');assert.equal(await row('errorMm').getAttribute('aria-invalid'),'true');return {calls:await calls(),text:(await read()).html}
});
await check('L09','conditional field removal suppresses refused confirmation',async()=>{
await row('filename').fill('Private');await row('filename').press('Enter');const a=await last();const s=(await read()).snapshot;const options=s.exports.map(o=>({...o,configuration:{...o.configuration,fields:o.configuration.fields.filter(f=>f.id!=='filename')}}));await update({exports:options});await settle(a.id,confirm('UNMOUNTED'));const r=await read();assert.equal(r.state.dialogs.length,0);assert.ok(!JSON.stringify(r.state).includes('UNMOUNTED'));return {state:r.state}
});
for(const kind of ['project','account'])await check('L10-'+kind,'pending confirmation suppressed across '+kind+' ABA',async()=>{
await row('filename').fill('Before ABA');await row('filename').press('Enter');const a=await last();await page.evaluate(k=>window.review.aba(k),kind);await settle(a.id,confirm('FOREIGN_SECRET'));const r=await read();assert.equal(r.state.dialogs.length,0);assert.ok(!JSON.stringify(r.state).includes('FOREIGN_SECRET'));return {state:r.state,notifications:r.notifications}
});
for(const kind of ['project','account'])await check('L11-'+kind,'dirty draft does not migrate into a different '+kind,async()=>{
await row('filename').fill('PRIVATE_A_UNSENT');const s=(await read()).snapshot;await update({project:{id:kind==='project'?'P2':'P1',name:'Other context',revision:0},...(kind==='account'?{session:{...s.session,user:{...s.session.user,id:'B'}}}:{}),exports:s.exports.map(o=>({...o,configuration:{...o.configuration,fields:o.configuration.fields.map(f=>({...f,value:f.id==='filename'?'Published B':f.value}))}}))});
const shown=await row('filename').inputValue();await row('filename').press('Enter');const r=await read();write(path.join(out,engine+'-L11-'+kind+'-observed.json'),{shown,calls:r.calls,project:r.snapshot.project.id,account:r.snapshot.session.user.id});assert.equal(shown,'Published B');assert.equal(r.calls.filter(c=>c.method==='dispatch'||c.method==='exportFile').length,0);assert.ok(!JSON.stringify(r.calls).includes('PRIVATE_A_UNSENT'))
});
for(const kind of ['project','account'])await check('L12-'+kind,'already-open conversion consent retired across '+kind+' ABA',async()=>{
await page.locator('[data-export-option="stl-union"]').getByRole('button',{name:'Xuất để kiểm tra',exact:true}).click();const c=await last();await settle(c.id,confirm('OPEN_CONSENT'));assert.equal((await read()).state.dialogs.length,1);await page.evaluate(k=>window.review.aba(k),kind);const r=await read();assert.equal(r.state.dialogs.length,0)
});
await check('L13','inspection intent and conversion acceptance require explicit actions',async()=>{
assert.equal(await row('inspection').isChecked(),false);await page.locator('[data-export-option="stl-union"]').getByRole('button',{name:'Xuất để kiểm tra',exact:true}).click();const c=await last();assert.equal(c.method,'exportFile');assert.equal((await calls()).filter(c=>c.input?.field==='inspection').length,0);await settle(c.id,confirm('EXPLICIT'));assert.equal((await calls()).filter(c=>c.input?.type==='proposal.accept').length,0);
await page.getByRole('button',{name:'Áp dụng thay đổi',exact:true}).click();assert.deepEqual((await last()).input,{type:'proposal.accept',id:'EXPLICIT',confirmed:true});return {calls:await calls(),dialogs:(await read()).state.dialogs}
});
await check('L14','late older response cannot replace newer confirmation',async()=>{
await row('filename').fill('First');await row('filename').press('Enter');const a=await last();await row('filename').fill('Second');await row('filename').press('Enter');const b=await last();await settle(b.id,confirm('NEWEST'));await settle(a.id,confirm('OLDER'));assert.equal((await read()).state.dialogs.at(-1).spec.retry.id,'NEWEST')
});
for(const kind of ['project','account'])await check('L15-'+kind,'batched '+kind+' ABA discards unsent draft even with equal final IDs',async()=>{
await row('filename').fill('PRIVATE_ABA_DRAFT');await page.evaluate(k=>window.review.aba(k),kind);assert.equal(await row('filename').inputValue(),'Mô hình');await row('filename').press('Enter');assert.equal((await calls()).length,0);
});
for(const kind of ['project','account'])await check('L16-'+kind,'same-batch retired '+kind+' consent cannot dispatch before React repaint',async()=>{
await page.locator('[data-export-option="stl-union"]').getByRole('button',{name:'Xuất để kiểm tra',exact:true}).click();const c=await last();await settle(c.id,confirm('BEFORE_REPAINT'));await page.evaluate(k=>window.review.retireAndClick(k,'Áp dụng thay đổi'),kind);assert.equal((await calls()).filter(c=>c.input?.type==='proposal.accept').length,0);assert.equal((await read()).state.dialogs.length,0);
});

}


