import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
import {createFontSource} from '../../src/input/font-source.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const modulePath=process.env.ARCH_WASM_MODULE,run=process.env.PROJECT_REVIEW_RUN;
if(!modulePath||!run)throw new Error('Project environment and ARCH_WASM_MODULE required.');
const output=path.join(run,'evidence','harfbuzz-browser');await mkdir(output,{recursive:true});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fontsURL=new URL('../../src/assets/fonts/fonts-cat.json',import.meta.url),colorURL=new URL('../../src/assets/emoji/color/fonts-cat.json',import.meta.url);
const fonts=JSON.parse(await readFile(fontsURL,'utf8')),colors=JSON.parse(await readFile(colorURL,'utf8'));
const cases=[{entry:fonts.find(e=>e.id==='inter'),base:fontsURL,text:'Tiếng Việt Đặng Ắ ễ',variations:{wght:600}},{entry:colors.find(e=>e.id==='noto-colrv1'),base:colorURL,text:'👩🏽‍💻',color:true}];
for(const fixture of cases){
  fixture.bytes=await readFile(new URL(fixture.entry.path,fixture.base));
  const source=await createFontSource(fixture.bytes,fixture.entry),shape=source.shapeRun(fixture.text,{variations:fixture.variations??{}});
  fixture.expected={shapeHash:hash(shape),paintHash:hash(fixture.color?source.colorPaint(shape.glyphs[0].glyphId):null)};
}
let selected=cases[0];
const routes=new Map([
  ['/tests/kernel/harfbuzz-worker.mjs',path.join(root,'tests/kernel/harfbuzz-worker.mjs')],
  ['/src/input/harfbuzz-engine.mjs',path.join(root,'src/input/harfbuzz-engine.mjs')],
  ['/src/input/font-source-core.mjs',path.join(root,'src/input/font-source-core.mjs')],
  ['/engine/arch-kernel.mjs',modulePath],['/engine/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm')],
]);
const server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="vi"><title>HarfBuzz Worker test</title><body>HarfBuzz Worker test</body></html>');return;}
  if(url.pathname==='/fixture/font'){res.setHeader('Content-Type','font/ttf');res.end(selected.bytes);return;}
  if(!routes.has(url.pathname)){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':'text/javascript; charset=utf-8');res.end(await readFile(routes.get(url.pathname)));}
  catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
for(const [name,type] of Object.entries({chromium,firefox,webkit}))test(`${name}: one Worker module shapes Vietnamese and paints COLRv1 after shared heap growth`,{timeout:90000},async()=>{
  const browser=await type.launch({headless:true});
  try{
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);const results=[];
    for(const fixture of cases){
      selected=fixture;
      const result=await page.evaluate(({entry,text,variations,color})=>new Promise((resolve,reject)=>{
        const worker=new Worker('/tests/kernel/harfbuzz-worker.mjs',{type:'module'});
        const timer=setTimeout(()=>{worker.terminate();reject(new Error('FONT_WORKER_TIMEOUT'));},20000);
        worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();resolve(data);};
        worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(new Error(event.message));};
        worker.postMessage({entry,text,variations,color});
      }),{entry:fixture.entry,text:fixture.text,variations:fixture.variations,color:fixture.color});
      assert.equal(result.ok,true,result.error);assert.equal(result.shared,true);
      assert.equal(result.shapeHash,fixture.expected.shapeHash);assert.equal(result.afterGrowthHash,result.shapeHash);assert.equal(result.paintHash,fixture.expected.paintHash);
      results.push({fontId:fixture.entry.id,text:fixture.text,...result});
    }
    await writeFile(path.join(output,`${name}.json`),JSON.stringify({engine:name,version:browser.version(),results,scope:'font-source and shared runtime parity, not font-to-3D manufacturing or UI'},null,2));
  }finally{await browser.close();}
});
