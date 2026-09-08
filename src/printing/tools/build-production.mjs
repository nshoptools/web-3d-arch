import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const run=process.env.PROJECT_REVIEW_RUN,repo=process.env.PROJECT_ROOT;
if(!run||!repo)throw new Error('Dot-source development env first');
const {build}=await import(pathToFileURL(join(repo,'.toolchain/app-runtime/node_modules/vite/dist/node/index.js')));
const source=fileURLToPath(new URL('../',import.meta.url));
await build({configFile:false,root:source,cacheDir:join(run,'cache/vite-production'),
 build:{outDir:join(run,'work/unified-production'),emptyOutDir:false,minify:false,
 lib:{entry:join(source,'src/index.mjs'),formats:['es'],fileName:()=> 'printing.mjs'}}});
