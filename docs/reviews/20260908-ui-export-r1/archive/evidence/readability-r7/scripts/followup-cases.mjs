import assert from 'node:assert/strict';import path from 'node:path';import {write} from './support.mjs';
export async function followupCases(page,record,out,engine){
const row=id=>page.locator('[data-export-field="'+id+'"] input'),read=()=>page.evaluate(()=>window.review.read());const commands=async()=>(await read()).calls.filter(c=>c.method==='dispatch'||c.method==='exportFile');
const publish=(revision,values={})=>page.evaluate(({revision,values})=>window.review.publish(revision,values),{revision,values}),settle=(id,result,rejected=false)=>page.evaluate(({id,result,rejected})=>window.review.settle(id,result,rejected),{id,result,rejected});
const fail=(code,message)=>({ok:false,diagnostic:{code,message,severity:'error'}});
async function check(id,name,fn){await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>window.review.reset());try{const observed=await fn();await record({id,name,pass:true,observed})}catch(e){const observed=await read();const png=path.join(out,engine+'-'+id+'.png');await page.screenshot({path:png});write(path.join(out,engine+'-'+id+'-state.json'),observed);await record({id,name,pass:false,error:String(e.stack),observed,evidence:png})}}
await check('F01','same-value numeric Enter retains stale base after refusal while blur resets it',async()=>{
await row('errorMm').fill('0.009');await publish(4);await row('errorMm').fill('0.004');await row('errorMm').press('Enter');const sent=(await commands()).at(-1);await settle(sent.id,fail('STALE_REVISION','STALE_AT_REVISION_0'));await row('errorMm').fill('0.006');await row('errorMm').press('Enter');const next=(await commands()).at(-1);write(path.join(out,engine+'-F01-exact.json'),{sameValue:sent,newDraft:next});assert.equal(next.input.projectRevision,4)
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
}

