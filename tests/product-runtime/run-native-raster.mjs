import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import{spawnSync}from'node:child_process';
import {products,artModes,makeRequest,regions,materials}from'./fixtures.mjs';import{packProductRequest,readProductSemantics}from'../../src/core/product-operations.mjs';
import {run,nativePath} from './environment.mjs';
const dir=path.join(run,'evidence/native-raster-product');fs.mkdirSync(dir,{recursive:true});
const rgba=new Uint8Array(64*48*4);for(let y=0;y<48;y++)for(let x=0;x<64;x++){if(x>=8&&x<14&&y>=9&&y<16)continue;rgba.set(x<32?[224,68,68,255]:[51,136,238,255],4*(y*64+x));}
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHash=hash(rgba),records=[];
for(const product of products)for(const art of artModes){
 const r=makeRequest(product,art,{sourceHash,headHash:hash('raster-'+product+'-'+art),changes:[
 {id:'k',value:2},{id:'res',value:'360'},{id:'smooth',value:0},{id:'minA',value:0},{id:'denoise',value:0},{id:'eps',value:0},{id:'tension',value:0}]});
 const n=new DataView(r.packed.buffer).getUint32(40,true),provenance=JSON.parse(new TextDecoder().decode(r.packed.slice(-n)));
 provenance.regionSources[0].sourceKey='raster-region:0';provenance.regionSources[1].sourceKey='raster-region:1';
 const packed=packProductRequest({domainRecord:r.record,headHash:hash('raster-'+product+'-'+art),sourceHash,sourceId:9007199254741099n,provenanceId:2000n,
 regions,materials,provenance,upstreamBindings:r.record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
 const name=product+'-'+art,base=path.join(dir,name);fs.writeFileSync(base+'.rgba',rgba);fs.writeFileSync(base+'.request',packed);
 const p=spawnSync(nativePath,[base+'.rgba',base+'.request',base],{timeout:120000,encoding:'utf8'});fs.writeFileSync(base+'.log',(p.stdout??'')+(p.stderr??''));
 let result;try{result=JSON.parse(fs.readFileSync(base+'.json'));}catch{result={error:p.stderr,exit:p.status};}
 if(p.status!==0)result={stage:'probe-failed',exit:p.status,error:p.stderr};records.push({name,result});console.log(name,JSON.stringify(result));
}
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(records,null,2)+'\n');
if(records.some(r=>r.result.stage!=='complete'))process.exitCode=1;
