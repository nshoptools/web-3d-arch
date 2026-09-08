
import {runtime} from './runtime.mjs';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
const input=JSON.parse(await readFile(process.argv[2])),env=await runtime(input,'firefox',process.argv[4]),results=[];
async function probe(page,name){
 const result={name,initialURL:page.url(),closed:page.isClosed(),start:Date.now()};
 try{const r=await page.goto(env.origin+'/api/v1/health',{waitUntil:'domcontentloaded',timeout:10000});result.status=r.status();result.body=(await page.locator('body').innerText()).slice(0,1000);}catch(e){result.error=e.message;}
 result.elapsedMs=Date.now()-result.start;result.afterURL=page.url();results.push(result);console.log(JSON.stringify(result));
 await writeFile(join(env.dir,'navigation.json'),JSON.stringify({results,network:env.net},null,2));
}
try{
 const http=await env.f.a.request('GET','/api/v1/health');results.push({name:'actual-host-scoped-CA-node',status:http.status,body:http.json});
 await probe(env.page,'initial-persistent-tab');
 const fresh=await env.context.newPage();await probe(fresh,'explicit-new-tab');
 await fresh.close();
}finally{await env.close();}
if(!results.some(x=>x.name==='explicit-new-tab'&&x.status===200))process.exitCode=1;
