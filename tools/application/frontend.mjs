import {resolve,extname} from 'node:path';
import {assetPath,MIME} from '../../src/host/manifest.mjs';
import {parse,readPlain,need,pin,hash,canonical,walk,rel,LIMITS,portable} from './core.mjs';
/** Audit bytes already emitted by Vite. Never rewrite chunks, imports, URLs or HTML. */
export function inspectFrontend(root,graph,engine,licenseIds){
 const manifest=parse(readPlain(resolve(root,'.vite/manifest.json'),4*1024*1024)),entry=manifest['index.html'];
 need(entry?.isEntry===true&&typeof entry.file==='string','VITE_ENTRY_REQUIRED');
 const files=walk(root,{maxFiles:LIMITS.frontendFiles,descend:n=>n!=='.vite'}),assets=[],byName=new Map();let total=0;
 const chunks=new Map(graph.bundles.filter(r=>r.type==='chunk').map(r=>[r.fileName,r]));
 for(const path of files){const name=rel(root,path);portable(name);assetPath('/'+name);const p=pin(path);total+=p.bytes;need(total<=LIMITS.frontendBytes,'FRONTEND_BYTES_LIMIT');need(p.bytes>0&&MIME[extname(name)],'FRONTEND_MIME');
  const text=['.js','.mjs','.css','.html'].includes(extname(name))?readPlain(path,LIMITS.fileBytes).toString('utf8'):'';
  need(!/(?:sourceMappingURL|sourceURL)\s*=/.test(text)&&!name.endsWith('.map'),'SOURCEMAP_REJECTED');
  need(!/(?:^|[/._-])(?:tests?|fixtures?|node_modules|user\.keys|credentials?|secrets?)(?:[/._-]|$)/i.test(name),'PRIVATE_FRONTEND_FILE');
  if(['.js','.mjs'].includes(extname(name))&&name!==engine.moduleName)need(chunks.has(name),'UNBUNDLED_SCRIPT_ASSET');
  if(extname(name)==='.css')need(!/url\(\s*['"]?(?:data:|https?:|\/\/)/i.test(text),'INLINE_OR_REMOTE_ASSET');
  const a={...p,file:name,url:'/'+name,cache:name===engine.moduleName||name===engine.wasmName?'immutable':'revalidate',licenseIds};assets.push(a);byName.set(name,a);
 }
 need(byName.has(entry.file)&&byName.has('index.html'),'FRONTEND_ENTRY_MISSING');
 const references=new Map();
 function add(from,to){portable(from);portable(to);need(byName.has(from)&&byName.has(to),'FRONTEND_REFERENCE');const r={from:'/'+from,to:'/'+to};references.set(canonical(r),r);}
 for(const r of graph.bundles){if(!byName.has(r.fileName))continue;for(const target of [...r.imports??[],...r.dynamicImports??[],...r.css??[],...r.assets??[]])add(r.fileName,target);}
 for(const item of Object.values(manifest)){need(byName.has(item.file),'VITE_MANIFEST_REFERENCE');for(const key of [...item.imports??[],...item.dynamicImports??[]]){need(manifest[key],'VITE_MANIFEST_REFERENCE');add(item.file,manifest[key].file);}for(const file of [...item.css??[],...item.assets??[]])add(item.file,file);}
 const html=readPlain(resolve(root,'index.html'),1048576).toString('utf8');
 need(html.includes('/'+entry.file)&&!/<script[^>]*src=["']\/src\//i.test(html),'COMPILED_HTML_REQUIRED');
 for(const m of html.matchAll(/\b(?:src|href)=["'](\/[^"']+)["']/g))add('index.html',m[1].slice(1));
 add(engine.moduleName,engine.wasmName);
 // Dynamic engine and fixed descriptor fetch are declared by the actual product bootstrap.
 references.set('bindings',{from:'/'+entry.file,to:'/release-bindings.json'});
 const workerEntries=graph.bundles.filter(r=>r.type==='chunk'&&r.isEntry&&r.facadeModuleId&&/\/(?:engine-worker|worker|png-worker|mesh-qualification-worker)\.mjs$/.test(r.facadeModuleId.replaceAll('\\','/')));
 need(new Set(workerEntries.map(r=>r.fileName)).size>=4,'PRODUCTION_WORKERS_REQUIRED');
 for(const r of workerEntries)add(entry.file,r.fileName);
 references.set('engine',{from:'/'+workerEntries.find(r=>r.facadeModuleId.replaceAll('\\','/').endsWith('/core/engine-worker.mjs')).fileName,to:'/'+engine.moduleName});
 const sorted=xs=>xs.sort((a,b)=>canonical(a)<canonical(b)?-1:1);
 return {frontend:{entry:'/'+entry.file,document:'/index.html',assets:assets.sort((a,b)=>a.url<b.url?-1:1),navigations:{'/':'/index.html'},references:sorted([...references.values()])},
  receipt:{version:'arch-application-frontend/1',manifestSHA256:hash(readPlain(resolve(root,'.vite/manifest.json'),4*1024*1024)),files:assets.length,totalBytes:total,workerEntries:workerEntries.map(r=>({file:r.fileName,source:r.facadeModuleId})),chunksUnmodified:true,sourceMaps:false,inlineAssets:false}};
}
