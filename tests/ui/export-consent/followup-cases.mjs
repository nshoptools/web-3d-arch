import assert from 'node:assert/strict';import path from 'node:path';import {write,openFolds} from './support.mjs';
export async function followupCases(page,record,out,engine){
const row=id=>page.locator('[data-export-field="'+id+'"] input'),read=()=>page.evaluate(()=>window.review.read());const commands=async()=>(await read()).calls.filter(c=>c.method==='dispatch'||c.method==='exportFile');
const publish=(revision,values={})=>page.evaluate(({revision,values})=>window.review.publish(revision,values),{revision,values}),settle=(id,result,rejected=false)=>page.evaluate(({id,result,rejected})=>window.review.settle(id,result,rejected),{id,result,rejected});
const fail=(code,message)=>({ok:false,diagnostic:{code,message,severity:'error'}});
async function check(id,name,fn){await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>window.review.reset());await openFolds(page);try{const observed=await fn();await record({id,name,pass:true,observed})}catch(e){const observed=await read();const png=path.join(out,engine+'-'+id+'.png');await page.screenshot({path:png});write(path.join(out,engine+'-'+id+'-state.json'),observed);await record({id,name,pass:false,error:String(e.stack),observed,evidence:png})}}
await check('F01','same-value numeric Enter sends no command and releases the old revision',async()=>{
await row('errorMm').fill('0.009');await publish(4);await row('errorMm').fill('0.004');await row('errorMm').press('Enter');assert.equal((await commands()).length,0);await row('errorMm').fill('0.006');await row('errorMm').press('Enter');const next=(await commands()).at(-1);assert.equal(next.input.projectRevision,4);assert.equal(next.input.value,'0.006');return {next}
});
await check('F02','late rejected command cannot alert the user about replaced text',async()=>{
await row('filename').fill('Previous request');await row('filename').press('Enter');const first=(await commands()).at(-1);await row('filename').fill('New local text');await settle(first.id,'OLD_BRIDGE_REJECTION_DETAIL',true);const r=await read();assert.equal(await row('filename').inputValue(),'New local text');assert.equal(await row('filename').getAttribute('aria-invalid'),null);write(path.join(out,engine+'-F02-exact.json'),{state:r.state,calls:r.calls});assert.ok(!r.state.alert&&!JSON.stringify(r.state.log).includes('OLD_BRIDGE_REJECTION_DETAIL'))
});
await check('F03','current rejected bridge call remains visible beside exact draft',async()=>{
await row('filename').fill('Current failed text');await row('filename').press('Enter');const first=(await commands()).at(-1);await settle(first.id,'CURRENT_BRIDGE_REJECTION_DETAIL',true);assert.equal(await row('filename').inputValue(),'Current failed text');assert.equal(await row('filename').getAttribute('aria-invalid'),'true');return {state:(await read()).state,calls:await commands()}
});
await check('F04','published numeric values update without losing focused draft or its caret',async()=>{
await row('errorMm').fill('0,0123');await row('errorMm').press('ArrowLeft');const before=await row('errorMm').evaluate(e=>({start:e.selectionStart,end:e.selectionEnd}));await publish(3,{errorMm:'0.5'});const after=await row('errorMm').evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,value:e.value,focused:e===document.activeElement}));assert.equal(after.value,'0,0123');assert.equal(after.focused,true);assert.equal(after.start,before.start);await row('errorMm').press('Escape');assert.equal(await row('errorMm').inputValue(),'0.5');return {before,after}
});
for(const field of ['filename','errorMm'])await check('F05-'+field,'confirmation remains pending consent and Enter-to-dialog blur sends only once: '+field,async()=>{
const raw=field==='filename'?'Exact confirmation draft':'0,007000';await row(field).fill(raw);await row(field).press('Enter');const first=(await commands()).at(-1);await settle(first.id,{...fail('CONFIRM_NEEDED','Consent is required'),confirmation:{title:'Field consent '+field,changes:['Convert explicitly'],retry:{type:'export.configure',id:'stl-union',field,value:raw,projectRevision:0}}});await page.getByRole('dialog',{name:'Field consent '+field}).waitFor({state:'visible'});assert.equal(await row(field).inputValue(),raw);assert.equal(await row(field).getAttribute('aria-invalid'),null,'consent is not an invalid value');assert.equal((await commands()).filter(c=>c.input.type==='export.configure'&&c.input.field===field).length,1,'focus transfer must not send duplicate');return {state:(await read()).state,calls:await commands()}
});
for(const field of ['filename','errorMm'])await check('F06-'+field,'Enter then blur before answer does not dispatch twice and a later edit still can: '+field,async()=>{
await row(field).fill(field==='filename'?'Submitted once':'0.009');await row(field).press('Enter');await row(field).press('Tab');assert.equal((await commands()).filter(c=>c.input.field===field).length,1);await row(field).fill(field==='filename'?'Different draft':'0.008');await row(field).press('Enter');assert.equal((await commands()).filter(c=>c.input.field===field).length,2);return {calls:await commands()}
});
await check('F07','a dropped field answer creates one metadata-only log event',async()=>{
await row('filename').fill('CONFIDENTIAL_OLD_RAW');await row('filename').press('Enter');const first=(await commands()).at(-1);await row('filename').fill('New local text');await settle(first.id,fail('PRIVATE_OLD_ERROR','CONFIDENTIAL_OLD_DIAGNOSTIC'));const r=await read(),dropped=r.state.log.filter(e=>['ANSWER_SUPERSEDED','ANSWER_FOR_OTHER_CONTEXT'].includes(e.code));assert.equal(dropped.length,1);assert.ok(!JSON.stringify(r.state).includes('CONFIDENTIAL_OLD'));return {log:r.state.log,calls:await commands()}
});

}

