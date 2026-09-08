import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runtime} from './runtime.mjs';
import {ProductUI} from './ui-driver.mjs';
const input=JSON.parse(await readFile(process.argv[2]??new URL('./baseline.json',import.meta.url)));
const engine=process.argv[3]??'chromium',label=process.argv[4]??'pilot-r1';
const env=await runtime(input,engine,label),ui=new ProductUI(env.page);let phase='load',result;
try{
 await env.page.goto(env.origin);await ui.ready();await env.capture('boot');
 phase='create';await ui.create('keychain','acceptance-'+engine+'-keychain');await env.capture('created');
 phase='source';await ui.importFile({name:'product-source.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#0099cc" fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/><path fill="#ee7733" d="M10 0H20V10H10Z"/></svg>')});
 if(await env.page.getByRole('dialog').count())await ui.approve();await env.capture('source');
 phase='build';const model=await ui.build();await env.capture('model');const formats=await ui.exports();await env.capture('export');
 result={phase,status:'pass',scope:'pilot actual product boot/source/build only; acceptance campaign incomplete',model,formats};
}catch(e){result={phase,status:'fail',error:e.stack};await env.capture('failure').catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(env.dir,'result.json'),JSON.stringify(result,null,2));await env.close();console.log(JSON.stringify(result));}
