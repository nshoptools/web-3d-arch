import { resolve, extname, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { need, exact, inside, plainPath, readPlain, digest } from '../../src/host/core.mjs';
import { MIME, assetPath, loadManifest } from '../../src/host/manifest.mjs';
// Explicit input list, never recursive discovery/globbing.
try {
  const [rootPath,allowlistPath,outputPath]=process.argv.slice(2);
  const root=plainPath(rootPath),run=plainPath(process.env.PROJECT_REVIEW_RUN),output=resolve(outputPath);
  need(inside(run,output) && !inside(root,output),'OUTPUT_OUTSIDE_RUN');
  plainPath(dirname(output));
  const list=JSON.parse(readPlain(plainPath(allowlistPath),2_000_000).toString('utf8'));
  exact(list,['buildId','assets','navigations']);
  need(Array.isArray(list.assets),'ALLOWLIST_INVALID');
  const assets=list.assets.map(a=>{
    exact(a,['url','file','cache']);assetPath(a.url);assetPath('/'+a.file);
    const file=resolve(root,a.file);need(inside(root,file),'BUILD_ESCAPE');
    const bytes=readPlain(file,64*1024*1024),mime=MIME[extname(a.file)];
    need(mime,'MIME_REJECTED');
    return {...a,sha256:digest(bytes),bytes:bytes.length,mime};
  });
  const document={schemaVersion:1,buildId:list.buildId,assets,navigations:list.navigations};
  writeFileSync(output,JSON.stringify(document,null,2)+'\n',{flag:'wx',mode:0o600});
  loadManifest({webroot:root,manifestPath:output,maxAssetBytes:64*1024*1024,maxPublicBytes:512*1024*1024,immutableMaxAge:31536000});
  console.log(JSON.stringify({status:'manifest-verified',assets:assets.length,buildId:list.buildId}));
}catch { console.error(JSON.stringify({error:'MANIFEST_BUILD_FAILED'}));process.exitCode=1; }
