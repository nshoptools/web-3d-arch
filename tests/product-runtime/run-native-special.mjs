
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {run,nativePath} from './environment.mjs';
import {source,regions,materials,makeRequest} from './fixtures.mjs';
import {packProductRequest,readProductSemantics,readProductHead} from '../../src/core/product-operations.mjs';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
const dir=path.join(run,'evidence/native-product-special');fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHash=hash(source),results=[];
function probe(name,sourceFile,packed,expected='complete'){
 const base=path.join(dir,name);fs.writeFileSync(base+'.request',packed);
 const p=spawnSync(nativePath,[sourceFile,base+'.request',base],{encoding:'utf8',timeout:120000});
 fs.writeFileSync(base+'.log',(p.stdout??'')+(p.stderr??''));assert.equal(p.status,0,p.stderr);
 const result=JSON.parse(fs.readFileSync(base+'.json'));assert.equal(result.stage,expected,JSON.stringify(result));assert.equal(result.ownedBefore,result.ownedAfter);
 const sem=fs.existsSync(base+'.buf1')?readProductSemantics(new Uint8Array(fs.readFileSync(base+'.buf1'))):null;
 if(expected==='complete'){const mesh=readSnapshot(fs.readFileSync(base+'.arch'));mesh.parts.forEach(p=>inspectMesh({vertices:mesh.vertices,faces:mesh.faces.slice(p.faceStart,p.faceStart+p.faceCount)}));assert.equal(sem.mechanicsSemantics,3);}
 results.push({name,result,parts:sem?.parts.length});return sem;
}
const svg=path.join(dir,'source.svg');fs.writeFileSync(svg,source);
const skirt=makeRequest('clicky','noi',{sourceHash,headHash:hash('skirt'),changes:[{id:'housing',value:false},{id:'skirtH',value:{heightMode:'layers',layers:40,datum:{kind:'feature',featureId:'mech:cap:skirt.bottom'},referenceLayer:0}}]});
const sm=probe('skirt',svg,skirt.packed);assert.deepEqual(sm.intervals.filter(i=>i.fieldId===81).map(i=>[i.datum,i.z0,i.z1]),[[11,0,8]]);
const old=skirt.packed.slice(),od=new DataView(old.buffer);for(let i=0;i<od.getUint32(16,true);i++)if(od.getUint32(256+i*40,true)===81)od.setUint32(256+i*40+12,1,true);
assert.equal(probe('old-skirt-datum-blocked',svg,old,'build').parts.length,0);
const ua=probe('unaligned',svg,makeRequest('clicky','noi',{sourceHash,headHash:hash('unaligned'),changes:[{id:'housing',value:false},{id:'postH',value:{heightMode:'mm',mm:7.01}}]}).packed);
const plate=ua.intervals.find(i=>i.fieldId===ua.parameters.find(p=>p.field==='plateT').fieldId);assert.equal(plate.conversionAvailable,false);assert.equal(plate.nearestDelta,null);
const txt='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path id="text-A" fill="#ffffff" fill-rule="evenodd" d="M2 2H6V6H2Z M3 3H5V5H3Z"/></svg>';
const textfile=path.join(dir,'prepared-text.svg');fs.writeFileSync(textfile,txt);const contexts=path.join(dir,'sources.contexts.json');fs.writeFileSync(contexts,JSON.stringify([svg,textfile]));
const request=makeRequest('keychain','noi',{sourceHash,headHash:hash('text'),changes:[{id:'bandCore',value:true},{id:'layerBand',value:true},{id:'bandCap',value:{heightMode:'mm',mm:.4}}]});
const n=new DataView(request.packed.buffer).getUint32(40,true),provenance=JSON.parse(new TextDecoder().decode(request.packed.slice(-n)));
const r={contextSlot:1,sourceIndex:0,semanticId:9007199254741201n,provenanceId:5001n,textGroup:9007199254741501n,material:{role:7,rgba:0xffffffff,slot:4,origin:1,provenanceId:5002n}};
provenance.regionSources.push({contextSlot:1,sourceIndex:0,sourceKey:'text-A',semanticId:r.semanticId.toString()});
const height={fieldId:0,mode:2,origin:1,datum:133,referenceLayer:22,layerCount:4,value:0,provenanceId:5101n};
const texts=[{semanticId:r.textGroup,provenanceId:1501n,placement:0,baseOn:true,basePad:.5,baseRound:.3,height,baseHeight:{...height,datum:134,referenceLayer:20,layerCount:2,provenanceId:5102n}}];
const packed=packProductRequest({domainRecord:request.record,headHash:hash('text'),sourceHash,sourceId:9007199254741099n,provenanceId:2000n,regions:[...regions,r],texts,materials,provenance,upstreamBindings:request.record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
const m=probe('prepared-text',contexts,packed);for(const tag of [132,133,134])assert.ok(m.sourceIntervals.some(i=>i.datum===tag));assert.ok(m.parts.some(p=>p.role===7)&&m.parts.some(p=>p.role===8));
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({passed:results.length,cases:results.map(x=>x.name)}));
