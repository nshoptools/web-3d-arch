import{readFile,writeFile,mkdir}from'node:fs/promises';import path from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{createTextSourceAdapter}from'../../src/input/text-source.mjs';import*as hb from'../../src/input/harfbuzz-engine.mjs';import{createFontSourceWithHarfBuzz}from'../../src/input/font-source-core.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=process.env.PROJECT_REVIEW_RUN,repo=process.env.PROJECT_ROOT;if(!run||!repo||!process.env.ARCH_KERNEL_MODULE)throw Error('Own run, repo, ARCH_KERNEL_MODULE required');
const out=path.join(run,'evidence/text-regeneration');await mkdir(out,{recursive:true});
const bytes=new Uint8Array(await readFile(path.join(repo,'src/assets/fonts/ttf/Inter.ttf'))),catalog=JSON.parse(await readFile(path.join(repo,'src/assets/fonts/fonts-cat.json'),'utf8')),font=catalog.find(f=>f.id==='inter');
const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(bytes),'29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031');assert.equal(font.sha256,hash(bytes));
const M=await(await import(pathToFileURL(process.env.ARCH_KERNEL_MODULE))).default({print:()=>{},printErr:()=>{}});hb.initializeHarfBuzz(M);
const adapter=createTextSourceAdapter({readBytes:async ref=>{assert.equal(ref.sha256,font.sha256);return bytes.slice();},createFontSource:(b,e)=>createFontSourceWithHarfBuzz(b,e,hb),collections:[]}),records=[];
for(const[name,text,wght,bend]of [['combined-vietnamese','E\u0302\u0301\nĐO',620,12],['oo-multiline','O\nO',620,12],['nfd-accent','E\u0302\u0301',620,0],['nfd-regular-multiline','E\u0302\u0301\nĐO',400,0]]){
 const command={version:'arch-text-source/1',id:name,kind:'text',expected:{sourceId:name,revision:1},text,font,size:{value:12,unit:'mm'},variations:{wght,opsz:14},language:'vi',script:'Latn',direction:'ltr',lineSpacing:1.4,letterSpacingMm:.35,align:'left',bendDegrees:bend,placement:{xMm:0,yMm:0,rotationDegrees:0},color:[0,0,0,255]};
 const result=await adapter.prepare(command,{isCurrent:()=>true,yieldControl:async()=>{}});assert.equal(result.kind,'paths');assert.ok(result.svg);
 if(name==='combined-vietnamese')assert.equal(hash(result.svg),'4af5a0bf6159dbfed4a6cc16ac4a33e5b83979edb39a01d18d58dcdf5275940d','exact retained repro from same-root HB');
 await writeFile(path.join(out,name+'.svg'),result.svg);await writeFile(path.join(out,name+'.geometry.json'),JSON.stringify(result.geometry,null,2));
 records.push({name,text,wght,bend,fontSha256:font.sha256,svgSha256:hash(result.svg),svgExport:result.svgExport,sourceBounds:result.geometry.bounds});
}
await writeFile(path.join(out,'result.json'),JSON.stringify({status:'pass',moduleSha256:hash(await readFile(process.env.ARCH_KERNEL_MODULE)),records},null,2));console.log(JSON.stringify(records));

