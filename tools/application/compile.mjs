// Private Vite child process. No evaluated user config, dotenv, install, dev server or I/O plugin.
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {parse,readPlain,need,pin,hash,put,jsonBytes,inside,rel,LIMITS,safeCode,inputRoot,outputPath,exact} from './core.mjs';
const [specPath]=process.argv.slice(2);
try{
 const spec=parse(readPlain(specPath,1024*1024));exact(spec,['version','source','appToolchainRoot','printingToolchainRoot','frontend','cache','result']);need(spec.version==='arch-application-build/1','COMPILER_SPEC_VERSION');
 const root=inputRoot(spec.source),app=resolve(inputRoot(spec.appToolchainRoot),'node_modules'),printing=resolve(inputRoot(spec.printingToolchainRoot),'node_modules');for(const k of ['frontend','cache','result'])outputPath(spec[k]);
 const versions={vite:'8.2.2',react:'19.2.8','react-dom':'19.2.8',three:'0.185.1',fflate:'0.8.3','@xmldom/xmldom':'0.9.12'};
 const resolvedRoots={};for(const [name,expected]of Object.entries(versions)){const dir=resolve(name==='fflate'||name.startsWith('@xmldom/')?printing:app,name);const pkg=parse(readPlain(resolve(dir,'package.json'),1048576));need(pkg.version===expected,'TOOLCHAIN_VERSION');resolvedRoots[name]=dir;}
 const lock=parse(readPlain(resolve(spec.appToolchainRoot,'package-lock.json'),4*1024*1024)),printLock=parse(readPlain(resolve(spec.printingToolchainRoot,'package-lock.json'),1048576));
 for(const [name,expected]of Object.entries(versions))need((name==='fflate'||name.startsWith('@xmldom/')?printLock:lock).packages['node_modules/'+name]?.version===expected,'TOOLCHAIN_LOCK_VERSION');
 const loaded=new Map(),bundles=[],warnings=[];
 const sourceID=id=>id.split('?')[0];
 function guard(id){const file=sourceID(id);if(!isAbsolute(file)||!existsSync(file))return;
  need(inside(root,file)||inside(app,file)||inside(printing,file),'BUNDLE_PATH_ESCAPE');
  if(inside(root,file)){const r=rel(root,file);need(!/^src\/(?:server|host|assets)\//.test(r)&&!/(?:^|\/)(?:tests?|fixtures?|node_modules)(?:\/|$)/i.test(r),'PRIVATE_BUNDLE_INPUT');need(!r.startsWith('tools/')||['tools/release/source-transport.mjs','tools/release/vendor/source-library.mjs'].includes(r),'PRIVATE_TOOL_BUNDLE');}
  const p=pin(file);loaded.set(file,p);
 }
 const aliases=[
  {find:/^three\/addons\//,replacement:resolvedRoots.three.replaceAll('\\','/')+'/examples/jsm/'},
  ...['react-dom','react','scheduler'].map(name=>({find:new RegExp('^'+name+'(?=/|$)'),replacement:resolve(app,name).replaceAll('\\','/')})),
  {find:/^three$/,replacement:resolve(resolvedRoots.three,'build/three.module.js').replaceAll('\\','/')},
  {find:/^fflate$/,replacement:resolve(resolvedRoots.fflate,'esm/browser.js').replaceAll('\\','/')},
  {find:/^@xmldom\/xmldom$/,replacement:resolve(resolvedRoots['@xmldom/xmldom'],'lib/index.js').replaceAll('\\','/')}
 ];
 const audit=()=>({name:'arch-application-input-audit',enforce:'pre',
  resolveId(id){need(!id.startsWith('node:')&&!/^(?:https?:|data:|file:)/.test(id),'BUNDLE_EXTERNAL_INPUT');if(!id.startsWith('\u0000')&&!id.startsWith('.')&&!id.startsWith('/')&&!isAbsolute(id)&&!id.startsWith('vite/'))need(false,'BUNDLE_UNDECLARED_PACKAGE');},
  load(id){guard(id);},
  transform(_code,id){guard(id);},
  generateBundle(_options,bundle){for(const [fileName,item]of Object.entries(bundle)){const row={fileName,type:item.type};if(item.type==='chunk'){row.isEntry=item.isEntry;row.facadeModuleId=item.facadeModuleId;row.imports=item.imports;row.dynamicImports=item.dynamicImports;row.modules=Object.keys(item.modules);row.css=[...(item.viteMetadata?.importedCss??[])];row.assets=[...(item.viteMetadata?.importedAssets??[])];}else row.originalFileNames=item.originalFileNames??[];bundles.push(row);}}
 });
 const {build}=await import(pathToFileURL(resolve(app,'vite/dist/node/index.js')).href);
 await build({root,base:'/',configFile:false,envDir:false,envPrefix:'ARCH_NO_PUBLIC_ENV_',publicDir:false,cacheDir:spec.cache,
  mode:'production',appType:'spa',resolve:{alias:aliases},plugins:[audit()],clearScreen:false,logLevel:'warn',
  customLogger:{hasWarned:false,info(){},warn(m){warnings.push(String(m).slice(0,8192));},warnOnce(m){warnings.push(String(m).slice(0,8192));},error(m){warnings.push(String(m).slice(0,8192));},clearScreen(){},hasErrorLogged(){return false;}},
  build:{target:'es2022',outDir:spec.frontend,emptyOutDir:false,assetsInlineLimit:0,sourcemap:false,manifest:true,license:false,
   minify:true,cssCodeSplit:true,modulePreload:{polyfill:false},reportCompressedSize:false,copyPublicDir:false,
   rolldownOptions:{input:resolve(root,'index.html'),output:{format:'es',sourcemap:false}}},
  worker:{format:'es',plugins:()=>[audit()],rolldownOptions:{output:{format:'es',sourcemap:false}}}
 });
 put(spec.result,jsonBytes({version:'arch-application-compiler/1',versions,loaded:[...loaded.values()].sort((a,b)=>a.file<b.file?-1:1),bundles,warnings,
  options:{configFile:false,envDir:false,publicDir:false,sourcemap:false,assetsInlineLimit:0,workerFormat:'es',target:'es2022'}}));
 console.log(JSON.stringify({status:'compiled',modules:loaded.size,bundleRecords:bundles.length,warnings:warnings.length}));
}catch(e){console.error(JSON.stringify({status:'failed',code:safeCode(e),diagnostic:String(e.message??e).slice(0,12000)}));process.exitCode=1;}
