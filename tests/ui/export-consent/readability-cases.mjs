import path from 'node:path';import assert from 'node:assert/strict';import {write} from './support.mjs';
export async function readabilityCases(page,record,out,engine){
for(const [width,fontSize]of [[1280,14],[1280,28],[320,28]]){
const id='V02-'+width+'-'+fontSize;await page.setViewportSize({width,height:900});await page.evaluate(()=>window.review.reset());await page.evaluate(size=>window.review.update({settings:[{key:'fontSize',label:'Text size',value:String(size)}]}),fontSize);await page.evaluate(()=>window.review.section('export'));
const label=page.locator('[data-export-field="orientation"] label');await label.scrollIntoViewIfNeeded();
const metrics=await label.evaluate(e=>{const range=document.createRange();range.setStart(e.firstChild,0);range.setEnd(e.firstChild,5);const r=e.getBoundingClientRect();const control=e.parentElement.querySelector('select');return {label:e.innerText,labelWidth:r.width,labelHeight:r.height,labelFont:getComputedStyle(e).fontSize,firstWord:'Hướng',firstWordRects:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),controlWidth:control.getBoundingClientRect().width,controlFont:getComputedStyle(control).fontSize,panelWidth:document.querySelector('.panel').getBoundingClientRect().width}});
const screenshot=path.join(out,engine+'-'+id+'.png');await page.screenshot({path:screenshot});write(path.join(out,engine+'-'+id+'-metrics.json'),metrics);
try{assert.equal(metrics.firstWordRects.length,1,'Ordinary five-letter label word is split into individual lines');await record({id,name:'Direction label remains readable at '+width+'px / '+fontSize+'px app text',pass:true,observed:metrics,evidence:screenshot})}catch(e){await record({id,name:'Direction label remains readable at '+width+'px / '+fontSize+'px app text',pass:false,error:String(e.stack),observed:metrics,evidence:screenshot})}
}
}

