
import {readFile,writeFile,access} from 'node:fs/promises';import {join} from 'node:path';import {runtime} from './runtime.mjs';
const input=JSON.parse(await readFile(process.argv[2])),engine=process.argv[3],label=process.argv[4],env=await runtime(input,engine,label,{headless:false});
const stop=join(env.dir,'STOP-PREVIEW'),info={version:'local-product-inspection/1',purpose:'HUMAN INSPECTION ONLY; local synthetic signed OIDC test account, not production authentication',origin:env.origin,userId:env.f.a.user.id,pid:process.pid,stopFile:stop,artifact:env.artifact,provider:'explicit local test adapter only; no external or paid calls',profile:env.profile};
try{
 await env.page.goto(env.origin,{waitUntil:'domcontentloaded',timeout:10000});await env.page.getByRole('button',{name:/^Menu tài khoản của/}).waitFor({timeout:60000});
 await writeFile(join(env.dir,'preview.json'),JSON.stringify(info,null,2));console.log(JSON.stringify(info));await env.capture('PREVIEW-READY');
 await new Promise(resolve=>{let done=false;const finish=()=>{if(!done){done=true;clearInterval(timer);resolve();}};const timer=setInterval(()=>access(stop).then(finish,()=>{}),1000);process.once('SIGINT',finish);process.once('SIGTERM',finish);env.page.on('close',finish);});
}finally{await env.close();}
