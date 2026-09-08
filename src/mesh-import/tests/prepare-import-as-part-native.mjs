import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {source,productFixture,inputFixture,selectionFor,tilted,squareTube} from './root-fixtures.mjs';
import {makeRequest} from '../../../tests/product-runtime/fixtures.mjs';
import {apartProduct} from './import-as-part-fixtures.mjs';
import {decodeSTL} from '../src/stl.mjs';
import {meshOperationForParameters} from '../src/operation.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),root=path.join(run,'inputs/import-as-part-native-'+(process.env.PROOF_TAG??'r2'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const product of ['keychain','clicky','strap','lego','charm']){
 const out=path.join(root,product);fs.mkdirSync(out,{recursive:true});
 const p=apartProduct(product,{sourceHash:sha(source),headHash:sha('apart:'+product)});
 fs.writeFileSync(path.join(out,'product.svg'),source);fs.writeFileSync(path.join(out,'product.aprq'),p.packed);
 const cases=[];
 for(const [name,unit,unitCode,scale,mesh]of [['stl-mm','millimeter',1,1,undefined],['stl-cm-hole','centimeter',2,1000,squareTube()]]){
  const input=inputFixture('stl','binary',mesh),parsed=decodeSTL(input.bytes),transform=tilted(100,20,40),selection={...selectionFor(transform),unit};
  const positions=new Uint8Array(parsed.positions.length*8),d=new DataView(positions.buffer);parsed.positions.forEach((v,i)=>d.setFloat64(i*8,v,true));
  fs.writeFileSync(path.join(out,name+'.stl'),input.bytes);fs.writeFileSync(path.join(out,name+'.f64'),positions);
  cases.push({name,unitCode,analyticVolume:scale*(mesh?12:6),expectedBlocked:false,source:name+'.stl',positions:name+'.f64',conversionError:parsed.conversionError,
   transform,selection,command:{featureId:'7001',...meshOperationForParameters('them'),targets:[],transform,queryToleranceCeilingMm:.002,
    limits:{vertices:1000000,triangles:400000,parts:128,operations:2000000},separateImportedAssemblyGroup:2}});
 }
 fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify({context:{userId:'test-author',projectId:'test-project'},cases},null,2));
}
console.log(root);
