import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN;
if(!root||!run)throw Error('Own run environment required');
if(fs.existsSync(path.join(run,'reports/FROZEN.json')))throw Error('Read-only frozen run; rerun tests in a fresh own run');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
const runner=JSON.parse(fs.readFileSync(path.join(run,'evidence/runner.json')));
assert.equal(runner.nodeExit,0);assert.equal(runner.typesExit,0);assert.equal(runner.browserExit,0);assert.equal(runner.browsersSelected,true);
const log=fs.readFileSync(path.join(run,'evidence/node-tests-runner.log'),'utf8');
for(const [kind,n] of [['tests',53],['pass',53],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('# '+kind+' '+n+'(?:\\r?\\n|$)'));
const {stlOracle,sectionOracle,zipOracle,near}=await import(pathToFileURL(path.join(run,'work/app-overlay/tests/integration/export-oracles.mjs')));
const source=path.join(run,'evidence/export-app'),browser=path.join(run,'evidence/export-app-browser'),proof=JSON.parse(fs.readFileSync(path.join(browser,'results.json')));
assert.equal(proof.passed,3);for(const r of proof.results){assert.equal(r.records.length,15);assert.ok(r.records.every(c=>c.verdict==='pass'));assert.deepEqual(r.rootStats,[0,0,0,0,0]);}
const node={union:stlOracle(fs.readFileSync(path.join(source,'union-overlap.stl'))),pattern:stlOracle(fs.readFileSync(path.join(source,'pattern-down.stl'))),reflection:stlOracle(fs.readFileSync(path.join(source,'reflected.stl'))),zip:zipOracle(fs.readFileSync(path.join(source,'grouped-shared-seams.zip'))),section:sectionOracle(fs.readFileSync(path.join(source,'blind-opening-sequence.svg')))};
near(node.union.volume,1500);near(node.pattern.volume,120);near(node.reflection.volume,120);near(node.zip.groups[0].volume,2000);near(node.zip.groups[1].volume,1000);near(node.section.samples[0].area*25.4**2,184,1e-4);near(node.section.samples[1].area*25.4**2,200,1e-4);
const parity=[];
const {unzlibSync}=createRequire(path.join(run,'work/app-overlay/src/printing/package.json'))('fflate');
function pngPixels(file){const b=fs.readFileSync(file),v=new DataView(b.buffer,b.byteOffset,b.length),width=v.getUint32(16),height=v.getUint32(20);assert.equal(b[24],8);assert.equal(b[25],6);assert.equal(b[28],0);
 const chunks=[];let at=8;while(at<b.length){const n=v.getUint32(at),tag=b.subarray(at+4,at+8).toString('ascii');if(tag==='IDAT')chunks.push(b.subarray(at+8,at+8+n));at+=n+12;}
 const raw=unzlibSync(Buffer.concat(chunks)),rgba=new Uint8Array(width*height*4);assert.equal(raw.length,height*(1+width*4));
 for(let y=0;y<height;y++){assert.equal(raw[y*(1+width*4)],0);rgba.set(raw.subarray(y*(1+width*4)+1,(y+1)*(1+width*4)),y*width*4);}return {width,height,rgbaSha256:hash(rgba),fileSha256:hash(b)};
}
const pngNode=pngPixels(path.join(source,'viewport.png')),pngParity=[];
for(const engine of proof.results.map(r=>r.engine)){
 for(const [key,file] of [['union','union.stl'],['pattern','pattern-down.stl'],['reflection','reflection.stl']]){
  const b=stlOracle(fs.readFileSync(path.join(browser,engine+'-'+file)));near(b.volume,node[key].volume);assert.deepEqual(b.bbox,node[key].bbox);parity.push({engine,shape:key,volumeDelta:Math.abs(b.volume-node[key].volume),bboxDelta:0});}
 const z=zipOracle(fs.readFileSync(path.join(browser,engine+'-materials.zip')));assert.equal(z.groups.length,2);z.groups.forEach((g,i)=>near(g.volume,node.zip.groups[i].volume));
 const section=sectionOracle(fs.readFileSync(path.join(browser,engine+'-sections.svg')));near(section.samples[0].area,184);near(section.samples[1].area,200);
 const png=pngPixels(path.join(browser,engine+'-viewport.png'));assert.equal(png.rgbaSha256,pngNode.rgbaSha256);assert.equal(png.width,pngNode.width);assert.equal(png.height,pngNode.height);pngParity.push({engine,...png});
}
const moduleInfo=JSON.parse(fs.readFileSync(path.join(run,'inputs/test-module.json')));
for(const f of moduleInfo.files)assert.equal(fileHash(path.join(run,'work/module',path.basename(f.path))),f.sha256);
const preimages=JSON.parse(fs.readFileSync(path.join(run,'inputs/app-preimages.json')));
for(const f of preimages.filter(f=>!f.readOnlyReference))assert.equal(fileHash(path.join(run,'work/app-overlay',f.path)),f.sha256,f.path);
const report={schema:'arch-export-app-checks/1',date:new Date().toISOString(),scope:'implementation verification only',node:{tests:53,pass:53,failed:0,skipped:0,seededReproducers:24,seed:'0xAE012069'},types:'pass',browser:proof.results.map(r=>({engine:r.engine,version:r.version,checks:15,passed:15})),module:moduleInfo,parity,png:{node:pngNode,browser:pngParity,policy:'compare decoded RGBA; CompressionStream byte identity across engines is not required'},
 numeric:{unionVolumeMm3:node.union.volume,groupVolumesMm3:node.zip.groups.map(g=>g.volume),patternDownBoundsMm:node.pattern.bbox,reflectionBoundsMm:node.reflection.bbox,blindBoreSectionAreaMm2:[184,200],sectionRings:[2,1]},
 evidenceBoundary:{actual:['same-Module WASM final helper','same-Module lib3mf project services','portable PNG encoder','existing prepared-font geometryToSvg','file numeric/readback checks'],testDoubles:['common operation/client transport in adapter tests','committed synthetic paint provider','synthetic viewport frames','trusted final-evidence getter fixture'],notClaimed:['parent RPC by this test harness','full application source/view bindings','slicer roundtrip','physical fit','configured independent review']}};
fs.writeFileSync(path.join(run,'reports/checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({node:53,types:'pass',browsers:report.browser,volume:report.numeric.unionVolumeMm3,paritySamples:parity.length}));
