import {registerHooks,createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import path from 'node:path';
const pinned=createRequire(path.join(process.env.PROJECT_ROOT,'.toolchain/printing-js/package.json'));
const resolved=new Map(['fflate','@xmldom/xmldom'].map(name=>[name,pathToFileURL(pinned.resolve(name)).href]));
registerHooks({resolve(specifier,context,next){return next(resolved.get(specifier)??specifier,context);}});
await import('./independent-authority.mjs');
