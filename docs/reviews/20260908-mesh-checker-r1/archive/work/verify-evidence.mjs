import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const room=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),file=path.join(room,'reports/evidence-manifest.json'),bytes=fs.readFileSync(file),manifest=JSON.parse(bytes),hash=b=>createHash('sha256').update(b).digest('hex');
const failures=[];for(const p of [...manifest.artifacts,manifest.sourceManifest,...manifest.sourceFiles.map(p=>({...p,path:manifest.sourceBase+'/'+p.path}))]){
 const real=fs.realpathSync(path.join(room,p.path));if(!real.startsWith(room+path.sep))throw Error('PATH_ESCAPE');const b=fs.readFileSync(real);if(b.length!==p.bytes||hash(b)!==p.sha256)failures.push(p.path);
}
const seal=JSON.parse(fs.readFileSync(path.join(room,'evidence/initial-seal.json')));for(const p of seal.files)if(hash(fs.readFileSync(path.join(room,p.path)))!==p.sha256)failures.push(p.path);
console.log(JSON.stringify({sourceFiles:manifest.sourceFiles.length,artifactFiles:manifest.artifacts.length,failures,initialSealVerified:failures.length===0,evidenceManifestSha256:hash(bytes)},null,2));process.exitCode=failures.length?1:0;
