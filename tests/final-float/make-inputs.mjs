import{readFile,writeFile,mkdir}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';import{makeRequest,source}from'../product-runtime/fixtures.mjs';
const out=path.join(process.env.PROJECT_REVIEW_RUN,'work/float-inputs');await mkdir(out,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex');
for(const[product,changes,name]of [['clicky',[],'clicky'],['clicky',[{id:'assemble',value:true}],'assembly']]){const r=makeRequest(product,'noi',{sourceHash:hash(source),headHash:hash('float-'+name),changes});await writeFile(path.join(out,name+'.aprq'),r.packed);await writeFile(path.join(out,name+'.json'),JSON.stringify({revision:String(r.project.revision),source}));}
await writeFile(path.join(out,'source.svg'),source);console.log(out);
