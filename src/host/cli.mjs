import { resolve, dirname } from 'node:path';
import { mkdirSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inside, plainPath, readPlain, need, HostFault } from './core.mjs';
import { createHost } from './server.mjs';
export async function main() {
  let fd, lock, host;
  const unlock=()=>{
    if(fd===undefined)return;
    closeSync(fd);fd=undefined;unlinkSync(lock);
  };
  try {
    need(process.argv[2]==='serve','COMMAND_REQUIRED');
    const run=plainPath(process.env.PROJECT_REVIEW_RUN);
    const configPath=plainPath(process.env.HOST_CONFIG_FILE);
    need(inside(run,configPath),'CONFIG_OUTSIDE_RUNTIME');
    const config=JSON.parse(readPlain(configPath,65536).toString('utf8'));
    // Public builds may be separate read-only releases. Private config/TLS stays in the locked run.
    for(const key of ['tlsKeyPath','tlsCertPath'])need(inside(run,plainPath(config[key])),'TLS_OUTSIDE_RUNTIME');
    need(config.port>0,'EXPLICIT_PRODUCTION_PORT_REQUIRED');
    const runtime=resolve(process.env.HOST_RUNTIME_DIR||'');
    need(process.env.HOST_RUNTIME_DIR && inside(run,runtime) && runtime!==run,'RUNTIME_OUTSIDE_RUN');
    plainPath(dirname(runtime));mkdirSync(runtime,{recursive:true});
    plainPath(runtime);
    lock=resolve(runtime,'host.lock');fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));
    host=createHost(config,{logger:record=>console.log(JSON.stringify(record))});
    await host.listen();
    console.log(JSON.stringify({status:'https-listening',pid:process.pid,...host.info()}));
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;try{await host.close();}finally{unlock();}};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }catch(e){
    if(host)await host.close().catch(()=>{});
    unlock();
    console.error(JSON.stringify({error:e instanceof HostFault?e.code:'HOST_STARTUP_FAILED'}));process.exitCode=1;
  }
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)await main();
