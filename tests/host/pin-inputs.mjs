import { readFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { fixture, run } from './helpers.mjs';
const repo=process.env.PROJECT_ROOT,modules=resolve(repo,'.toolchain/app-runtime/node_modules');
const playwright=await import(pathToFileURL(join(modules,'playwright/index.mjs')).href);
const records=[];
async function pin(path,root=repo){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(path)){hash.update(chunk);bytes+=chunk.length;}
  return {path:relative(root,path).replaceAll('\\','/'),sha256:hash.digest('hex'),bytes};
}
for(const path of [
  process.execPath,join(modules,'playwright/package.json'),join(modules,'playwright/index.mjs'),
  join(modules,'playwright-core/package.json'),join(modules,'playwright-core/browsers.json'),
  resolve(repo,'.toolchain/app-runtime/package-lock.json'),
  ...['chromium','firefox','webkit'].map(n=>playwright[n].executablePath())
])records.push(await pin(path));
const node=records.shift();node.path=process.execPath;
writeFileSync(join(run,'reports/toolchain-pins.json'),JSON.stringify({
  nodeVersion:process.versions.node,node,playwrightVersion:'1.63.0',files:records,
  qualification:'entrypoints, installed package lock and main executables pinned; not every dependent DLL',
  versions:JSON.parse(readFileSync(join(modules,'playwright-core/browsers.json'))).browsers.filter(b=>['chromium','firefox','webkit'].includes(b.name))
},null,2)+'\n');
const f=fixture('frozen-input');
const folder=resolve(run,'work/host/tests/host/fixtures');mkdirSync(folder,{recursive:true});
writeFileSync(join(folder,'host-v1.json'),JSON.stringify({
  fixtureVersion:1,source:'tests/host/helpers.mjs',rights:'Synthetic HTML/JS/CSS/WASM authored for this task; font OFL-1.1 unchanged',
  assets:f.manifest.assets,navigations:f.manifest.navigations,
  oracle:{mainCOI:true,workerCOI:true,sharedBytes:16,wasmResult:42,fontStatus:'loaded',apiCached:false,logoutStatus:401},
  fontSource:'https://raw.githubusercontent.com/google/fonts/5e35378e6bda803962ee6fd257e444a7d459660d/ofl/patrickhand/PatrickHand-Regular.ttf',
  fontLicense:'inputs/font/OFL.txt'
},null,2)+'\n');
console.log(JSON.stringify({status:'inputs-pinned',publicAssets:f.manifest.assets.length,toolchainFiles:records.length+1}));
