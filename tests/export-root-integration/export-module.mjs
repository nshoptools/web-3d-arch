import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function loadExportModule(){
 const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('own run environment required');
 const pin=JSON.parse(await fs.readFile(path.join(run,'inputs/production-pair.json'),'utf8')),dir=path.join(run,pin.moduleDirectory??'work/module');
 const buffers={};for(const name of ['arch-kernel.mjs','arch-kernel.wasm']){
  const b=await fs.readFile(path.join(dir,name));if(b.length!==pin.pins[name].bytes||createHash('sha256').update(b).digest('hex')!==pin.pins[name].sha256)throw Error('Production runtime pin changed');buffers[name]=new Uint8Array(b);
 }
 let consumed=false;const create=(await import(pathToFileURL(path.join(dir,'arch-kernel.mjs')))).default;
 const M=await create({get wasmBinary(){consumed=true;return buffers['arch-kernel.wasm'];},print(){},printErr(){}});
 if(!consumed||typeof M._arch_final_test_fixture!=='undefined'||M._arch_abi_version()!==2||M._arch_final_float_version()!==1)throw Error('Production owned-byte Module contract');
 return M;
}
