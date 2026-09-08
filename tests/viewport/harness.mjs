import {ThreeViewport} from '../../src/viewport/three-viewport.mjs';
import {EngineClient} from '../../src/core/engine-client.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {checkPNG} from './png-checks.mjs';
const source='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#0099cc" fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/><path fill="#ee7733" d="M10 0H20V10H10Z"/></svg>';
const pause=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function expect(ok,message){if(!ok)throw new Error(message);}
export async function runViewportChecks(){
  const host=document.getElementById('viewport');const diagnostics=[],selected=[];
  const client=new EngineClient({moduleURL:'/arch-kernel.mjs',workerURL:'/engine-worker.mjs'});
  const first=await client.build({kind:'svg',source,thicknessMm:2},{generation:1});
  const bytes=new Uint8Array(first.bytes()),model=readArchSnapshot(bytes);
  const blocks=model.parts.map((_,i)=>({id:'block-'+i,label:'Màu '+i}));
  let viewport;
  try{
    viewport=new ThreeViewport(host,{onSelection:id=>selected.push(id),onDiagnostic:d=>diagnostics.push(d)});
    const stats=viewport.setModel({lease:first,revision:1,blocks});await pause();
    expect(stats.parts===2&&Math.abs(stats.boundsMm.size[0]-20)<1e-5,'actual SVG dimensions');
    viewport.action('top');await pause();
    // Three ray tests use a transformed design-space point, never a fixture UI box.
    const project=point=>{const p=viewport.model.children[0].position.clone().set(...point);viewport.model.localToWorld(p);p.project(viewport.camera);const r=viewport.renderer.domElement.getBoundingClientRect();return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];};
    const solid=project([1,5,2]),hole=project([5,5,2]);
    expect(viewport.pick(...solid)==='block-0','real GPU geometry picking on colored part');
    expect(viewport.pick(...hole)===null,'SVG hole is not capped by renderer');
    viewport.setSelection('block-1');expect(viewport.model.children[1].material.emissive.getHex()!==0,'selection highlight');
    viewport.action('front');viewport.action('perspective');viewport.action('toggle-grid');viewport.action('toggle-measure');
    viewport.action('explode');expect(viewport.model.children[1].position.z>0,'exploded display');
    viewport.action('explode');expect(viewport.model.children.every(c=>c.position.z===0),'reversible exploded view');
    let missingPrinter=false;try{viewport.action('center');}catch(e){missingPrinter=e.code==='PRINTER_REQUIRED';}expect(missingPrinter,'no invented printer');
    viewport.setPrinter({bedPolygonMm:[[0,0],[100,0],[100,80],[0,80]],maxZMm:100});
    const proposal=viewport.action('center');expect(Math.abs(proposal.translationMm[0]-40)<1e-5&&Math.abs(proposal.translationMm[1]-35)<1e-5&&proposal.requiresCommit,'explicit placement proposal');
    await pause();const steadyObjects=viewport.renderer.info.memory.geometries;
    const saved=viewport.model;const bad=new Uint8Array(bytes);new DataView(bad.buffer).setUint32(4,99,true);
    let rejected=false;try{viewport.setModel({lease:{generation:1,bytes:()=>bad},revision:2,blocks});}catch{rejected=true;}
    expect(rejected&&viewport.model===saved&&viewport.revision===1,'invalid replacement preserves existing view');
    for(let revision=2;revision<=17;revision++)viewport.setModel({lease:first,revision,blocks});
    await pause();expect(viewport.renderer.info.memory.geometries===steadyObjects,`GPU geometry resource count bounded across replacement (${steadyObjects} -> ${viewport.renderer.info.memory.geometries})`);
    viewport.setVisible(false);expect(getComputedStyle(viewport.renderer.domElement).display==='none','step1 hides WebGL');
    viewport.setVisible(true);host.style.width='320px';host.style.height='320px';viewport.resize();await pause();
    expect(Math.abs(viewport.camera.aspect-1)<1e-5,'resize camera matches viewport');
    const png=await checkPNG(viewport,pause);
    expect(first.bytes().every((v,i)=>v===bytes[i]),'view never edits manufacturing snapshot');
    // Drop the lease while keeping the view: GPU upload arrays own their data.
    first.release();viewport.action('top');await pause();
    const afterLeaseRelease=viewport.renderer.info.render.triangles;expect(afterLeaseRelease>0,'renderer remains valid after primary lease release');
    const dimensions={width:viewport.renderer.domElement.width,height:viewport.renderer.domElement.height};
    const graphics={renderer:viewport.renderer.getContext().getParameter(viewport.renderer.getContext().RENDERER),calls:viewport.renderer.info.render.calls,triangles:afterLeaseRelease};
    if(globalThis.captureViewport)await globalThis.captureViewport();
    // Repeated mount/dispose simulates StrictMode and route remounts.
    viewport.dispose();expect(host.querySelectorAll('canvas').length===0,'first teardown removes canvas');
    for(let i=0;i<3;i++){const mounted=new ThreeViewport(host);mounted.dispose();expect(host.childElementCount===0,'remount teardown removes owned DOM');}
    expect(diagnostics.length===0,'no context loss during accepted operations');
    return {stats,selected,dimensions,graphics,checks:18,png,diagnostics,manufacturingBytesUnchanged:true,scope:'real SVG Worker mesh and Three viewport; not full application UX or printer qualification'};
  }finally{viewport?.dispose();first.release();client.dispose();}
}
