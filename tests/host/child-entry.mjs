import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { inside, plainPath, need } from '../../src/host/core.mjs';
// Test-only process control around the actual unmodified CLI entry point.
const run=plainPath(process.env.PROJECT_REVIEW_RUN),cli=plainPath(process.env.HOST_TEST_CLI);
const root=plainPath(process.env.PROJECT_ROOT);
need([resolve(root,'src/host/cli.mjs'),resolve(root,'src/server/cli.mjs')].includes(cli),'TEST_CLI_NOT_ALLOWLISTED');
const action=process.env.HOST_TEST_ACTION;
process.argv=[process.execPath,cli,action];
let timer;
if(action==='serve') {
  need(inside(run,process.env.HOST_TEST_STOP_FILE),'TEST_STOP_OUTSIDE_RUN');
  timer=setInterval(()=>{
    if(existsSync(process.env.HOST_TEST_STOP_FILE)){clearInterval(timer);process.emit('SIGTERM');}
    if(process.exitCode)clearInterval(timer);
  },25);
}
try{await import(pathToFileURL(cli).href);}finally{if(process.exitCode)clearInterval(timer);}
