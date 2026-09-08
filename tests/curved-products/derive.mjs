// Test-only APRQ derivatives, not a project mutation or application head proof.
// The original source snapshot, IDs and provenance buffers remain unchanged.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {FIELD_MAP} from '../../src/kernel/mechanics/src/catalog-map.mjs';
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),input=path.join(run,'inputs/corpus-production'),out=path.join(run,'inputs/corpus-variants');fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),cases=[];
for(const family of ['text','emoji'])for(const product of ['strap','lego'])for(const [size,h,tol]of [[40,.16,.001],[50,.20,.0005],[60,.25,.00025]]){
 const parent=`${family}-${product}-chim`,id=parent+'-size'+size,q=fs.readFileSync(path.join(input,parent+'.aprq')),arch=fs.readFileSync(path.join(input,parent+'.arch')),d=new DataView(q.buffer,q.byteOffset,q.length);
 const before=sha(q),up=256+40*d.getUint32(16,true)+24*d.getUint32(20,true)+112*d.getUint32(24,true)+120*d.getUint32(28,true);
 const set=(field,value)=>{const fid=FIELD_MAP.find(f=>f.id===field||f.name===field||f.field===field)?.abiId;if(!fid)throw Error('Unknown field '+field);
  let found=false;for(const [start,count]of [[256,d.getUint32(16,true)],[up,d.getUint32(32,true)]])for(let i=0;i<count;i++){const at=start+40*i;if(d.getUint32(at,true)===fid){d.setUint32(at+8,1,true);d.setFloat64(at+24,value,true);found=true;}}if(!found)throw Error('Absent field '+field);
 };
 set('size',size);set('layerH',h);d.setBigInt64(176,270000n,true);d.setBigInt64(184,BigInt(Math.round(h*1e6)),true);d.setFloat64(208,tol,true);d.setFloat64(216,.004,true);
 fs.writeFileSync(path.join(out,id+'.aprq'),q);fs.writeFileSync(path.join(out,id+'.arch'),arch);
 const record={id,parent,kind:'explicit synthetic request derivative of captured production canonical source; no application project/head qualification',changes:{size,firstLayerMm:.27,regularLayerMm:h,matingToleranceMm:tol,exportToleranceMm:.004},sourceHash:sha(arch),parentRequestHash:before,requestHash:sha(q)};
 fs.writeFileSync(path.join(out,id+'.repro.json'),JSON.stringify(record,null,2)+'\n');cases.push(record);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,cases},null,2)+'\n');console.log('Derived '+cases.length+' explicit requests');
