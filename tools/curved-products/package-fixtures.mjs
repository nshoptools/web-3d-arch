// Maintainer command: lossless capture packaging, never regenerates expected geometry.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),candidate=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!candidate.startsWith(run+path.sep))throw Error('Packaging requires an unfrozen own candidate');
const from=path.join(run,'inputs/corpus-production'),to=path.join(candidate,'tests/curved-products/fixtures');fs.mkdirSync(to,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),files=[];
for(const name of fs.readdirSync(from).filter(n=>/\.(aprq|arch)$/.test(n)).sort()){
 const raw=fs.readFileSync(path.join(from,name)),compressed=gzipSync(raw,{level:9});fs.writeFileSync(path.join(to,name+'.gz'),compressed);
 files.push({path:name+'.gz',output:name,bytes:raw.length,sha256:sha(raw),compressedBytes:compressed.length,compressedSha256:sha(compressed)});
}
for(const [label,p]of [['Inter-OFL.txt','src/assets/fonts/licenses/inter/OFL.txt'],['NotoEmoji-OFL.txt','src/assets/emoji/licenses/notoemoji/OFL.txt']])fs.copyFileSync(path.join(root,p),path.join(to,label));
fs.writeFileSync(path.join(to,'manifest.json'),JSON.stringify({version:1,scope:'40 recorded requests on actual committed Inter O and selected Noto monochrome grinning face outlines; original production ARCH1/APRQ bytes, compressed losslessly',module:{mjs:'950225880c23476f9a6523111ac5a33aebb24f1d89bfa1d8f60bff1b1cc1c375',wasm:'211b392f097eb55c8b52898e7b6123cb4b4b4539bfc68a5223d2f9e4c4d0e4cd'},provenance:'PSB-03 source-node-final recorded states, independently recaptured with matching production core; IDs, parameter origins, binding hashes and source provenance are retained in APRQ',geometryExpectation:'All 40 normal requests must publish and pass independent dimensions/topology/source preservation oracles. No physical fit qualification.',files},null,2)+'\n');
console.log({files:files.length,rawBytes:files.reduce((s,f)=>s+f.bytes,0),compressedBytes:files.reduce((s,f)=>s+f.compressedBytes,0)});
