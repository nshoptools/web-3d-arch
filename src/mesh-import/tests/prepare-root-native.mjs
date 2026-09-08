import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {source,productFixture,inputFixture,affine,selectionFor,commandFor,extendedCases} from './root-fixtures.mjs';
import {decodeSTL} from '../src/stl.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),out=path.join(run,'inputs/root-native-fixtures-'+(process.env.PROOF_TAG??'r2'));fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),headHash=sha('root-product-fixture'),sourceHash=sha(source);
const p=productFixture({sourceHash,headHash});fs.writeFileSync(path.join(out,'product.svg'),source);fs.writeFileSync(path.join(out,'product.aprq'),p.packed);
const cases=[];
for(const [name,encoding,operation,transform,customInput]of[
 ['internal-rotated-difference','ascii','difference',affine(31,3,-2,1)],
 ['side-union','binary','union',affine(35,19,-2,1)],
 ['internal-intersection-blocked-datum','ascii','intersection',affine(17,3,-2,1)],
 ...extendedCases().filter(c=>c.input.format==='stl').map(c=>[c.name,'ascii',c.operation,c.transform,c.input]),
]){
 const input=customInput??inputFixture('stl',encoding),parsed=decodeSTL(input.bytes),positions=name+'.f64';
 fs.writeFileSync(path.join(out,name+'.stl'),input.bytes);
 const b=new Uint8Array(parsed.positions.length*8),d=new DataView(b.buffer);parsed.positions.forEach((v,i)=>d.setFloat64(8*i,v,true));fs.writeFileSync(path.join(out,positions),b);
 cases.push({name,expectedBlocked:name==='internal-intersection-blocked-datum',source:name+'.stl',positions,conversionError:parsed.conversionError,transform,selection:selectionFor(transform),command:commandFor({bindings:[],materials:[],targets:[]},transform,operation),decoder:parsed.decoder});
}
fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify({context:{userId:'test-author',projectId:'test-project'},cases},null,2));console.log(out);
