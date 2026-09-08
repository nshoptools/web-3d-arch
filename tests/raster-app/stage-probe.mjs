// Child process used by portability.test.mjs; one actual Module, Node-only.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {stageEnvironment} from './environment.mjs';
import {typecheck} from './typecheck.mjs';
const env=stageEnvironment();
const types=typecheck(env);
const {exercise}=await import(pathToFileURL(path.join(env.stage,'tests/raster-app/suite.mjs')));
const factory=(await import(pathToFileURL(path.join(env.stage,'runtime/arch-kernel.mjs')))).default;
const module=await factory({print(){},printErr(){}});
const result=await exercise(module,{readFixture:async name=>new Uint8Array(fs.readFileSync(path.join(env.stage,'tests/raster-app/fixtures',name)))});
if(!result.pass)throw Error('Relocated Node suite failed');
fs.writeFileSync(path.join(env.evidence,'portability.json'),JSON.stringify({version:1,kind:'implementation portability check',cwd:process.cwd(),moduleInstances:1,types,...result},null,2)+'\n');
console.log('Relocated current-main Node: '+result.checks+' groups PASS');
