import {registerHooks,createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import path from 'node:path';
const pinned=createRequire(path.join(process.env.PROJECT_ROOT,'.toolchain/printing-js/package.json'));
registerHooks({resolve(specifier,context,next){if(specifier==='fflate'||specifier==='@xmldom/xmldom')return next(pathToFileURL(pinned.resolve(specifier)).href,context);return next(specifier,context);}});
await import('./independent-authority.mjs');
