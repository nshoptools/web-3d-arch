import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),borrow=path.join(run,'work/root-borrow'),module=path.join(run,'work/production-module'),rows=[];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const visit=(rel,seen=new Set())=>{rel=rel.replaceAll('\\','/');if(seen.has(rel))return;seen.add(rel);const full=path.resolve(root,rel);if(!full.startsWith(root+path.sep))throw Error('borrow outside root');const bytes=fs.readFileSync(full),dest=path.join(borrow,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);rows.push({path:rel,sha256:sha(bytes),bytes:bytes.length});
 if(/\.[cm]?js$/.test(rel)){const s=bytes.toString();for(const m of s.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)){if(!m[1].startsWith('.'))continue;const dep=path.resolve(path.dirname(full),m[1]);if(fs.existsSync(dep)&&fs.statSync(dep).isFile())visit(path.relative(root,dep),seen);}}
};
visit('tests/product-app/harness.mjs');visit('src/integration/product-source-contexts.mjs');visit('src/core/engine-client.mjs');
fs.mkdirSync(module,{recursive:true});
for(const[name,want]of [['arch-kernel.mjs','950225880c23476f9a6523111ac5a33aebb24f1d89bfa1d8f60bff1b1cc1c375'],['arch-kernel.wasm','211b392f097eb55c8b52898e7b6123cb4b4b4539bfc68a5223d2f9e4c4d0e4cd']]){
 const source=path.join(root,'tmp/reviews/codex/runs/20260908-implementation-wave1/work/module',name),bytes=fs.readFileSync(source);if(sha(bytes)!==want)throw Error('production pair changed '+name);fs.writeFileSync(path.join(module,name),bytes);rows.push({path:source,sha256:want,bytes:bytes.length});
}
fs.writeFileSync(path.join(borrow,'package.json'),'{"type":"module"}\n');fs.writeFileSync(path.join(run,'inputs/production-runtime-pins.json'),JSON.stringify({version:1,capturedAt:new Date().toISOString(),qualification:'parent reports functional verification active; no independent R4 claim',rows},null,2)+'\n');console.log({borrow,module,files:rows.length});
