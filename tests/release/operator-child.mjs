// Test-only foreground console-signal bridge. Never included in a release package.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
const [operator,...args]=process.argv.slice(2);
const {operate}=await import(pathToFileURL(operator).href);
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{if(line==='stop'){lines.close();process.stdin.unref();process.emit('SIGTERM');}});
await operate(...args);
