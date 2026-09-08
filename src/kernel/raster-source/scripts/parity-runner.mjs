import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const run=path.resolve(process.env.PROJECT_REVIEW_RUN||'');
const repo=path.resolve(process.env.PROJECT_ROOT||'');
if(!run.startsWith(repo+path.sep)||!run.endsWith('20260908-raster-wave2')) throw Error('Wrong isolated run');
const here=path.dirname(fileURLToPath(import.meta.url));
const wasmDir=path.join(run,'work/rust-target/wasm32-unknown-emscripten/release/examples');
const nativeLog=fs.readFileSync(path.join(run,'evidence/native-parity.log'),'utf8');
const match=/^RASTER_PARITY_V2:([0-9a-f]+)$/m.exec(nativeLog.replace(/\r/g,''));
if(!match) throw Error('Native report missing');
const expected=Buffer.from(match[1],'hex');
function parse(bytes) {
    if(bytes.toString('ascii',0,4)!=='RSP2') throw Error('Bad report magic');
    const count=bytes.readUInt32LE(4);let cursor=8;const cases=[];
    for(let i=0;i<count;i++){
        const n=bytes.readUInt32LE(cursor);cursor+=4;
        const name=bytes.toString('utf8',cursor,cursor+n);cursor+=n;
        const digest=bytes.subarray(cursor,cursor+32).toString('hex');cursor+=32;
        cases.push({name,digest});
    }
    if(cursor!==bytes.length) throw Error('Bad report length');
    return cases;
}
const results={kind:'implementation parity harness; not independent review',cases:parse(expected),engines:[]};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
results.nativeReportSha256=sha(expected);
results.moduleSha256=sha(fs.readFileSync(path.join(wasmDir,'parity_harness.js')));
results.wasmSha256=sha(fs.readFileSync(path.join(wasmDir,'parity_harness.wasm')));
const factory=require(path.join(wasmDir,'parity_harness.js'));
const m=await factory({noInitialRun:true,print:()=>{},printErr:()=>{}});
const ptr=m._raster_parity_run();const size=m._raster_parity_len();
const nodeBytes=Buffer.from(m.HEAPU8.slice(ptr,ptr+size));
results.engines.push({name:'node',version:process.version,pass:nodeBytes.equals(expected),sha256:sha(nodeBytes),cases:parse(nodeBytes)});
const {chromium,firefox,webkit}=require(path.join(repo,'.toolchain/app-runtime/node_modules/playwright'));
const files=new Map([
    ['/','<!doctype html><meta charset="utf-8"><title>Isolated raster parity harness</title>'],
    ['/worker.js',fs.readFileSync(path.join(here,'parity-worker.js'))],
    ['/parity_harness.js',fs.readFileSync(path.join(wasmDir,'parity_harness.js'))],
    ['/parity_harness.wasm',fs.readFileSync(path.join(wasmDir,'parity_harness.wasm'))],
]);
const server=http.createServer((req,res)=>{
    const content=files.get(req.url);
    res.writeHead(content?200:404,{'Content-Type':req.url.endsWith('.wasm')?'application/wasm':req.url.endsWith('.js')?'text/javascript':'text/html',
        'Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
    res.end(content||'not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try {
    for(const [name,engine] of Object.entries({chromium,firefox,webkit})) {
        let browser;
        try {
            browser=await engine.launch({headless:true,downloadsPath:path.join(run,'temp/downloads-'+name)});
            const page=await browser.newPage();
            await page.goto(base);
            const values=await page.evaluate(()=>new Promise((resolve,reject)=>{
                const worker=new Worker('/worker.js');
                const timer=setTimeout(()=>{worker.terminate();reject(Error('Worker deadline 30s'));},30000);
                worker.onmessage=({data})=>{
                    clearTimeout(timer);worker.terminate();
                    if(data.error) reject(Error(data.error));else resolve(Array.from(new Uint8Array(data.bytes)));
                };
                worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
                worker.postMessage({moduleUrl:'/parity_harness.js'});
            }));
            const bytes=Buffer.from(values);
            results.engines.push({name,version:browser.version(),worker:true,pass:bytes.equals(expected),sha256:sha(bytes),cases:parse(bytes)});
            console.log(name+': '+(bytes.equals(expected)?'PASS':'FAIL')+' '+sha(bytes));
        } catch(error) {
            results.engines.push({name,pass:false,error:String(error.stack||error)});
            console.log(name+': FAIL '+error.message);
        } finally {await browser?.close();}
    }
} finally {await new Promise(resolve=>server.close(resolve));}
results.pass=results.engines.length===4&&results.engines.every(e=>e.pass);
results.completedUtc=new Date().toISOString();
fs.writeFileSync(path.join(run,'evidence/parity-results.json'),JSON.stringify(results,null,2)+'\n');
fs.writeFileSync(path.join(run,'evidence/native-parity.bin'),expected);
console.log('Node and 3 browser Worker engines: '+(results.pass?'PASS':'FAIL'));
process.exitCode=results.pass?0:1;

