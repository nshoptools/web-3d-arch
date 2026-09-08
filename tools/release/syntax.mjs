// Isolated parse-only process. Never links/evaluates a supplied application module.
import {SourceTextModule} from 'node:vm';
let input='';for await(const b of process.stdin){input+=b;if(input.length>96*1024*1024)process.exit(2);}
try{
 const docs=JSON.parse(input),out=[];
 for(const d of docs){const m=new SourceTextModule(d.text,{identifier:d.url});out.push({url:d.url,imports:m.dependencySpecifiers});}
 process.stdout.write(JSON.stringify(out));
}catch{process.stderr.write('COMPILED_MODULE_INVALID');process.exitCode=1;}
