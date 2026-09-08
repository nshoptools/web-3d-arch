// Offline test setup. Read existing pinned tools; copy only explicit dependencies/module into caller's room.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(process.env.PROJECT_ROOT||''),run=path.resolve(process.env.PROJECT_REVIEW_RUN||'');
const need=(v,c)=>{if(!v)throw Error(c);},hash=b=>createHash('sha256').update(b).digest('hex');
const inside=(a,b)=>b===a||b.startsWith(a+path.sep);
function plain(p){p=path.resolve(p);for(let x=p;;x=path.dirname(x)){if(fs.existsSync(x))need(!fs.lstatSync(x).isSymbolicLink(),'LINK');if(path.dirname(x)===x)break;}return p;}
function own(p){p=plain(p);need(inside(run,p)&&['inputs','work','evidence','reports','cache','temp'].includes(path.relative(run,p).split(path.sep)[0]),'OUTPUT_SCOPE');return p;}
function put(p,b){own(p);fs.mkdirSync(path.dirname(p),{recursive:true});if(fs.existsSync(p)){need(hash(fs.readFileSync(p))===hash(b),'EXISTING_INPUT_CHANGED');return;}fs.writeFileSync(p,b,{flag:'wx'});}
need(process.versions.node==='24.19.0'&&inside(root,run)&&root!==run,'PROJECT_ENV_NODE_REQUIRED');
const [source,moduleSha256,wasmSha256]=process.argv.slice(2),m=plain(source),w=m.replace(/\.mjs$/,'.wasm');
need(inside(root,m)&&m.endsWith('.mjs')&&/^[a-f0-9]{64}$/.test(moduleSha256)&&/^[a-f0-9]{64}$/.test(wasmSha256),'MODULE_ARGUMENTS');
const mb=fs.readFileSync(m),wb=fs.readFileSync(plain(w));need(mb.length<=4*1024*1024&&wb.length<=64*1024*1024&&hash(mb)===moduleSha256&&hash(wb)===wasmSha256,'MODULE_HASH');
put(path.join(run,'work/module/arch-kernel.mjs'),mb);put(path.join(run,'work/module/arch-kernel.wasm'),wb);
const pinFile=path.join(run,'inputs/runtime-test-module.json'),pins={moduleSha256,wasmSha256};
if(fs.existsSync(pinFile))need(JSON.stringify(JSON.parse(fs.readFileSync(pinFile)))===JSON.stringify(pins),'MODULE_PIN_CHANGE');else put(pinFile,Buffer.from(JSON.stringify(pins)));
const records=[];
for(const [name,version]of [['fflate','0.8.3'],['@xmldom/xmldom','0.9.12']]){
 const from=plain(path.join(root,'.toolchain/printing-js/node_modules',name)),dest=own(path.join(run,'work/node_modules',name));
 const pkg=JSON.parse(fs.readFileSync(path.join(from,'package.json')));need(pkg.version===version,'DEPENDENCY_VERSION');
 function walk(p,rel=''){for(const e of fs.readdirSync(p,{withFileTypes:true})){const child=plain(path.join(p,e.name)),r=rel?rel+'/'+e.name:e.name;need(!e.isSymbolicLink(),'LINK');
  if(e.isDirectory())walk(child,r);else{const b=fs.readFileSync(child);put(path.join(dest,r),b);records.push({package:name,file:r,bytes:b.length,sha256:hash(b)});}
 }}walk(from);
}
for(const [name,version]of [['playwright','1.63.0'],['rolldown','1.2.7'],['typescript','7.0.2']]){
 const p=plain(path.join(root,'.toolchain/app-runtime/node_modules',name,'package.json')),b=fs.readFileSync(p);need(JSON.parse(b).version===version,'TOOL_VERSION');records.push({package:name,file:'package.json',bytes:b.length,sha256:hash(b)});
}
put(path.join(run,'inputs/printing-test-tool-pins.json'),Buffer.from(JSON.stringify({version:'arch-printing-test-tools/1',records},null,2)+'\n'));
console.log(JSON.stringify({status:'prepared',copiedDependencies:32,module:pins,node:process.versions.node}));
