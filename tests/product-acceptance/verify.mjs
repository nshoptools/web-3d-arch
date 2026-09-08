import {readFile} from 'node:fs/promises';
import {sealCheck} from './artifact.mjs';
const input=JSON.parse(await readFile(process.argv[2]??new URL('./baseline.json',import.meta.url)));
const result=await sealCheck(input,{repositoryRoot:process.env.PROJECT_ROOT,runDirectory:process.env.PROJECT_REVIEW_RUN});
console.log(JSON.stringify(result));