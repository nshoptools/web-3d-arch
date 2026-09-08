import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readSnapshot,readSTL,inspectMesh,inspectScene,partMesh,bbox,close,intersections,inside,unionAt,transform,sectionSegments,radialExtrema} from './oracles/mechanical-oracle.mjs';

const target=process.argv[2]??'native',filter=process.argv[3];
assert.ok(['native','wasm'].includes(target));
const room=process.env.PROJECT_REVIEW_RUN;
assert.ok(room&&process.env.PROJECT_ROOT&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'run environment required');
const candidate=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(!path.relative(process.env.PROJECT_ROOT,candidate).startsWith('..'),'package inside project required');
const output=path.join(room,'evidence',`fixtures-${target}`);fs.mkdirSync(output,{recursive:true});
const binary=process.env.ARCH_MECHANICS_FIXTURE??(target==='native'?path.join(room,'work/build-mechanics-native/Release/mechanics_fixture.exe'):path.join(room,'work/build-mechanics-wasm/mechanics_fixture.js'));
assert.ok(fs.existsSync(binary),'build target first');
const hash=b=>createHash('sha256').update(b).digest('hex');
const records=[],artifacts=[];
let ordinal=0;
function run(name,options={}){
  const stem=path.join(output,`${String(++ordinal).padStart(3,'0')}-${name}`);
  const args=['--out',stem];
  for(const [k,v] of Object.entries(options)){
    if(k==='set')for(const [id,value] of Object.entries(v))args.push('--set',`${id}=${value}`);
    else args.push(`--${k}`,String(v));
  }
  const cmd=target==='native'?binary:process.execPath,actualArgs=target==='native'?args:[binary,...args];
  const result=spawnSync(cmd,actualArgs,{encoding:'utf8',timeout:90000,windowsHide:true,env:process.env});
  fs.writeFileSync(stem+'.log',(result.stdout??'')+(result.stderr??''));
  fs.writeFileSync(stem+'.reproducer.json',JSON.stringify({target,command:cmd,args:actualArgs,options,seed:options.seed??null},null,2)+'\n');
  assert.equal(result.status,0,`${name} executable: ${result.error??result.stderr?.slice(-1600)}`);
  const bytes=fs.readFileSync(stem+'.bin'),metadata=JSON.parse(fs.readFileSync(stem+'.json'));
  const scene=readSnapshot(bytes);
  artifacts.push({name,options,path:path.relative(room,stem+'.bin'),sha256:hash(bytes),metadataSha256:hash(fs.readFileSync(stem+'.json')),verdict:metadata.verdict});
  assert.equal(metadata.inputUnchanged,true);assert.equal(metadata.priorSnapshotPreserved,true);
  assert.equal(metadata.fitQualification,0);
  assert.equal(metadata.mechanicsAbi,2);
  assert.deepEqual(metadata.inputStrides,{slab:72,attachment:48,bevelOverride:40});
  assert.equal(metadata.layout.parameter,40);assert.equal(metadata.layout.part,40);assert.equal(metadata.layout.partInfo,160);
  assert.equal(metadata.layout.feature,176);assert.equal(metadata.layout.curve,48);assert.equal(metadata.layout.interval,56);
  assert.equal(metadata.layout.pointer,target==='native'?8:4);
  if(metadata.verdict!==0){assert.equal(scene.vertices.length,0);assert.equal(scene.parts.length,0);assert.equal(metadata.exportBlocked,1);}
  return {scene,metadata,bytes,stem};
}
function ok(x){assert.equal(x.metadata.verdict,0,JSON.stringify(x.metadata.diagnostics));assert.ok(x.scene.parts.length);return inspectScene(x.scene);}
function reject(x,verdict,message){assert.equal(x.metadata.verdict,verdict);assert.ok(x.metadata.diagnostics.some(d=>d.message.includes(message)),JSON.stringify(x.metadata.diagnostics));}
function meshes(x,group){return x.scene.parts.flatMap((p,i)=>x.metadata.parts[i].group===group?[partMesh(x.scene,p)]:[]);}
function groupBounds(x,g){const vertices=meshes(x,g).flatMap(m=>m.vertices);return bbox({vertices});}
function totalVolume(x,g=0){return x.scene.parts.reduce((sum,p,i)=>sum+(x.metadata.parts[i].group===g?inspectMesh(partMesh(x.scene,p)).volume:0),0);}
function field(x,id){return x.metadata.parameters.find(p=>p.id===id);}
function interval(x,id){return x.metadata.intervals.find(p=>p.field===id);}
function radial(x,g,z,cx,cy,range){return radialExtrema(meshes(x,g).flatMap(m=>sectionSegments(m,z)),cx,cy,range);}
function test(id,requirements,fn){
  if(filter&&!id.includes(filter))return;
  const start=Date.now(),begin=artifacts.length;
  try{fn();records.push({id,requirements,verdict:'pass',elapsedMs:Date.now()-start,artifacts:artifacts.slice(begin).map(a=>a.path)});console.log(`PASS ${id}`);}
  catch(error){records.push({id,requirements,verdict:'fail',elapsedMs:Date.now()-start,error:String(error.stack),artifacts:artifacts.slice(begin).map(a=>a.path)});console.log(`FAIL ${id}: ${error.message}`);}
}

test('body-hole-islands', ['GEO-01','GEO-02','AT-020.1','AT-020.3'],()=>{
  const base=run('body',{width:20,height:10,set:{ringOn:0},stl:1});ok(base);close(totalVolume(base),480);assert.deepEqual(groupBounds(base,0).size,[20,10,2.4]);
  const hole=run('hole',{width:20,height:10,variant:'hole',set:{ringOn:0},stl:1});const metrics=ok(hole);close(totalVolume(hole),441.6);assert.equal(metrics[0].euler,0);assert.equal(unionAt(hole.scene,hole.metadata,[0,0,1]),false);
  const islands=run('islands',{width:20,height:10,variant:'islands',set:{ringOn:0}});ok(islands);close(totalVolume(islands),489.6);assert.equal(unionAt(islands.scene,islands.metadata,[13,0,1]),true);
  for(const x of [base,hole])for(let i=0;i<x.scene.parts.length;i++)close(inspectMesh(readSTL(fs.readFileSync(x.stem+`.p${i}.stl`))).volume,totalVolume(x),3e-5,'float STL volume');
});

test('keychain-eyelet-openings', ['MOD-03','GEO-03'],()=>{
  const x=run('eyelet',{width:40,height:30,stl:1});ok(x);
  const bb=groupBounds(x,0);close(bb.min[0],-20);close(bb.max[0],20);close(bb.max[1],21.5,1e-6);close(bb.size[2],2.4);
  assert.equal(unionAt(x.scene,x.metadata,[0,17.5,1.1]),false);assert.equal(unionAt(x.scene,x.metadata,[3,17.5,1.1]),true);
  const bore=radial(x,0,1.13,0,17.5,[1.99,2.01]);assert.ok(bore.min>=2-1e-7);assert.ok(bore.max<=2.001);
  assert.equal(field(x,'ringH').mode,3);close(interval(x,'ringH').z1,2.4);
  reject(run('eyelet-no-contact',{set:{ringOverlap:0}}),1,'EYELET_POSITIVE');
  reject(run('eyelet-zero-explicit',{set:{ringH:0}}),1,'RING_ZERO');
  reject(run('eyelet-text-host',{set:{ringTren:1}}),1,'TEXT_ATTACHMENT_REQUIRED');
});

test('five-products-three-sizes', ['MOD-01','GEO-03'],()=>{
  for(const size of [26,40,64])for(let product=0;product<5;product++){
    const set=product===1?{skirtH:7}:{};
    const x=run(`product-${product}-${size}`,{product,width:size,height:size,set});ok(x);
    const bb=groupBounds(x,0);close(bb.min[0],-size/2,0.001);close(bb.max[0],size/2,0.001);
    assert.equal(field(x,'size').value,size);
    if(product===1)assert.ok(x.metadata.features.some(f=>f.id==='mech:cap:skirt'));
    if(product===4)assert.ok(x.metadata.features.some(f=>f.id==='mech:charm:socket'));
  }
});

test('strap-horizontal-vertical-slot-and-rotation',['GEO-03'],()=>{
  const circle=run('strap',{product:2,width:40,height:30});ok(circle);close(groupBounds(circle,0).size[2],10);
  assert.equal(unionAt(circle.scene,circle.metadata,[0,0,5]),false);
  assert.equal(unionAt(circle.scene,circle.metadata,[0,0,2.8]),true);
  assert.equal(unionAt(circle.scene,circle.metadata,[-19.9,2.35,5]),false,'entry chamfer opens toward the exterior');
  assert.equal(unionAt(circle.scene,circle.metadata,[0,2.35,5]),true,'constant inner bore retains material beyond 2 mm');
  for(const dir of [0,1]){
    const x=run(`slot-${dir}`,{product:2,set:{strapSlot:4,strapSlotDir:dir,strapCham:0}});ok(x);
    const yes=dir===0?[0,3,5]:[0,0,8],no=dir===0?[0,4.2,5]:[0,0,9.2];
    assert.equal(unionAt(x.scene,x.metadata,yes),false);assert.equal(unionAt(x.scene,x.metadata,no),true);
  }
  const angled=run('strap-angle',{product:2,set:{strapAngle:45,strapCham:0}});ok(angled);
  assert.equal(unionAt(angled.scene,angled.metadata,[5,5,5]),false);assert.equal(unionAt(angled.scene,angled.metadata,[5,0,5]),true);
  const rotated=run('strap-rotate',{product:2,set:{strapAngle:90,strapCham:0,rotObj:90}});ok(rotated);close(groupBounds(rotated,0).size[0],30,1e-6);close(groupBounds(rotated,0).size[1],40,1e-6);
  reject(run('strap-floor',{product:2,set:{strapZ:2}}),1,'POSITIVE_FLOOR');
  ok(run('strap-chamfer-oblique',{product:2,set:{strapAngle:45}}));
});

test('lego-grid-mask-depth-hollow-and-tabs',['GEO-01','GEO-03'],()=>{
  for(const [pattern,count,diam] of [[0,15,4.9],[1,7,5.5],[2,3,5.5]]){
    const x=run(`lego-${pattern}`,{product:3,width:40,height:30,set:{legoRanhOn:0,legoThua:pattern}});ok(x);
    assert.equal(x.metadata.features.filter(f=>/^mech:lego:bore:-?\d+:-?\d+$/.test(f.id)).length,count);
    close(totalVolume(x),6720-count*Math.PI*(diam/2)**2*1.8,.5,'analytic cylindrical hole volume');
    assert.equal(unionAt(x.scene,x.metadata,[0,0,.1]),false);assert.equal(unionAt(x.scene,x.metadata,[0,0,1.81]),true);
    const bore=radial(x,0,.9,0,0,[diam/2-.01,diam/2+.01]);assert.ok(bore.min>=diam/2-1e-7);assert.ok(bore.max<=diam/2+.001);
  }
  const hollow=run('lego-hollow',{product:3,set:{legoRanhOn:0,legoRong:1,legoXeOn:1,legoTaiOn:1}});ok(hollow);
  assert.equal(unionAt(hollow.scene,hollow.metadata,[4,4,.5]),false);assert.equal(unionAt(hollow.scene,hollow.metadata,[4,4,2]),true);
  assert.equal(unionAt(hollow.scene,hollow.metadata,[2.9,0,.5]),false,'cross flexure slot');assert.ok(groupBounds(hollow,0).size[0]>40);
  const sourceHole=run('lego-source-hole',{product:3,variant:'hole',set:{legoRanhOn:0}});ok(sourceHole);assert.equal(unionAt(sourceHole.scene,sourceHole.metadata,[0,0,4]),false);
  ok(run('lego-groove-default',{product:3}));
  reject(run('lego-roof-proposal',{product:3,set:{legoRanhOn:0,baseH:1.8}}),3,'PROPOSAL_ACCEPTANCE');
});

test('mx-tray-dimensions-nominal-and-tip',['GEO-03','GEO-02'],()=>{
  const x=run('mx-tray',{product:1,width:40,height:30,set:{skirtH:7},override:1,stl:1});ok(x);
  for(const [id,val] of [['socketD',5.5],['pinD',1.7],['collarH',1.85]]){assert.equal(field(x,id).value,val);close(interval(x,id).z1-interval(x,id).z0,val);}
  assert.equal(unionAt(x.scene,x.metadata,[0,0,.1]),false,'socket tip open');
  assert.equal(unionAt(x.scene,x.metadata,[0,0,5.51]),true,'socket closed roof');
  assert.equal(unionAt(x.scene,x.metadata,[2.4,0,.1]),true,'post wall');
  assert.equal(unionAt(x.scene,x.metadata,[10,10,2]),false,'hollow skirt interior');
  assert.equal(unionAt(x.scene,x.metadata,[19.4,0,2]),true,'skirt wall');
  const stems=x.metadata.parts.map((p,i)=>({p,i})).filter(({p})=>p.role===4);
  assert.ok(stems.length);for(const {p,i} of stems){assert.equal(p.slot,7);assert.equal(p.origin,1);assert.equal(x.scene.parts[i].color,0xaa11bbff);assert.equal(p.provenanceId,'9007199254740997');}
  const tray=(point)=>unionAt(x.scene,x.metadata,point,1,true);
  assert.equal(tray([0,0,1.49]),true);assert.equal(tray([0,0,1.51]),false);
  assert.equal(tray([6,0,2.5]),true);assert.equal(tray([6,0,4]),false);
  assert.equal(tray([7.4,0,4]),true);assert.equal(tray([7.4,0,9]),false);
  close(interval(x,'hSocketD').z0,3.2);close(interval(x,'hSocketD').z1,8.35);close(interval(x,'hRecess').z1,10.35);
  const cap=x.scene.parts.flatMap((p,i)=>x.metadata.parts[i].group===0?[transform(partMesh(x.scene,p),x.metadata.parts[i].previewTransform)]:[]);
  const trayMeshes=x.scene.parts.flatMap((p,i)=>x.metadata.parts[i].group===1?[transform(partMesh(x.scene,p),x.metadata.parts[i].previewTransform)]:[]);
  for(const t of [0,1.05,2.1,3.15,4.2])for(const y of [-14.3,-10.1,-6.3,.17,6.3,10.1,14.3])for(const z of [1.7,3.7,5.7,8.7,10.7,12.7,15.7]){
    const a=cap.flatMap(m=>{const hs=intersections(m,0,y,z+t);return hs.flatMap((h,i)=>i%2===0&&i+1<hs.length?[[h,hs[i+1]]]:[]);});
    const b=trayMeshes.flatMap(m=>{const hs=intersections(m,0,y,z);return hs.flatMap((h,i)=>i%2===0&&i+1<hs.length?[[h,hs[i+1]]]:[]);});
    for(const aa of a)for(const bb of b)assert.ok(Math.min(aa[1],bb[1])-Math.max(aa[0],bb[0])<1e-7,'independent assembly cross-section collision');
  }
  reject(run('mx-invalid-wall',{product:1,set:{crossL:6,crossW:2,postD1:4}}),1,'MX_SOCKET_BREAKS');
  reject(run('mx-invalid-roof',{product:1,set:{socketD:7}}),1,'POSITIVE_ROOF');
  const ring=run('tray-eyelet',{product:1,width:40,height:30,set:{skirtH:7,hRingOn:1}});ok(ring);
  close(groupBounds(ring,1).max[1],23.75,1e-6);close(interval(ring,'hRingH').z1,6);
  assert.equal(unionAt(ring.scene,ring.metadata,[0,19.75,1.13],1,true),false,'tray eyelet opening');
  assert.equal(unionAt(ring.scene,ring.metadata,[3,19.75,1.13],1,true),true,'tray eyelet annulus');
});

test('clearance-positive-sign-and-zero',['GEO-03','AT-021.1'],()=>{
  for(const clr of [0,.05,.2]){
    const x=run(`mx-clearance-${clr}`,{product:1,set:{housing:0,clr}});ok(x);
    const hs=meshes(x,0).flatMap(m=>intersections(m,0,.17,1.13)).sort((a,b)=>a-b);
    assert.ok(hs.some(a=>Math.abs(a-(2.05+clr))<1e-6));
    assert.ok(hs.some(a=>Math.abs(a+(2.05+clr))<1e-6));
  }
  for(const clr of [0,.2,.6]){
    const x=run(`charm-clearance-${clr}`,{product:4,width:25,height:25,set:{charmClr:clr}});ok(x);
    const q=radial(x,0,.87,0,0,[2.9,3.5]);assert.ok(q.min>=3+clr/2-1e-7);assert.ok(q.max<=3+clr/2+.001);
  }
  for(const gap of [.05,.25,.6]){
    const x=run(`tray-gap-${gap}`,{product:1,width:40,height:30,set:{skirtH:7,gap,hRingOn:0}});ok(x);
    const tray=x.scene.parts.flatMap((p,i)=>x.metadata.parts[i].group===1?[transform(partMesh(x.scene,p),x.metadata.parts[i].previewTransform)]:[]);
    const hs=tray.flatMap(m=>intersections(m,0,12.3,12));
    for(const sign of [-1,1])assert.ok(hs.some(a=>Math.abs(a-sign*(20+gap))<1e-6),'positive one-sided tray gap');
  }
  reject(run('negative-clearance',{product:1,set:{clr:-.02}}),1,'PARAMETER_DOMAIN');
  for(const [product,id,value] of [[1,'gap',-.05],[1,'gap',0],[3,'legoHoDu',-.01],[4,'charmClr',-.01]]){
    reject(run(`invalid-clearance-${id}-${value}`,{product,set:{[id]:value}}),1,'PARAMETER_DOMAIN');
  }
});

test('charm-integral-separate-fit-and-flange',['GEO-03'],()=>{
  const x=run('charm',{product:4,width:25,height:25});ok(x);
  close(groupBounds(x,0).size[2],3);assert.equal(unionAt(x.scene,x.metadata,[0,0,1]),false);assert.equal(unionAt(x.scene,x.metadata,[0,0,2.1]),true);
  close(groupBounds(x,1).size[2],6.6);close(groupBounds(x,1).size[0],14.5,.001);
  const pin=radial(x,1,5.31,24.75,0,[2.9,3.1]);assert.ok(pin.max<=3+1e-7);assert.ok(pin.min>=2.999);
  const flange=radial(x,1,.1373,24.75,0,[6.5,6.7]);
  assert.ok(flange.max<=7.25-.8+.1373+1e-7);assert.ok(flange.min>=7.25-.8+.1373-.001,'actual flange chamfer');
  const integral=run('charm-integral',{product:4,width:25,height:25,set:{charmGan:1}});ok(integral);close(groupBounds(integral,0).size[2],7.6);assert.equal(integral.metadata.parts.some(p=>p.group===1),false);
  assert.equal(unionAt(integral.scene,integral.metadata,[0,0,4.5]),true);
  reject(run('charm-no-roof',{product:4,set:{baseH:2}}),1,'POSITIVE_WALL_AND_ROOF');
  reject(run('charm-offset',{product:4,set:{charmOffX:60}}),1,'NOT_SUPPORTED_BY_SOURCE');
});

test('schedule-explicit-interval-and-no-snap',['GEO-02','AT-021.2','AT-021.4'],()=>{
  for(const [h0,h,expected] of [[.16,.2,2.36],[.2,.16,1.96],[.2,.2,2.4],[.25,.2,2.45],[.25,.25,3]]){
    const layers=run(`schedule-${h0}-${h}`,{h0,h,layers:'baseH,12,0,0',set:{ringOn:0}});ok(layers);close(groupBounds(layers,0).size[2],expected);
    close(interval(layers,'baseH').z1,expected);close(layers.metadata.layerBoundaries[1],h0);
    const nominal=run(`nominal-${h0}-${h}`,{product:1,h0,h,set:{skirtH:7}});ok(nominal);
    for(const [id,mm] of [['socketD',5.5],['pinD',1.7],['collarH',1.85]])close(interval(nominal,id).z1-interval(nominal,id).z0,mm);
  }
  const nominal=run('nominal-body',{h0:.16,h:.2,set:{ringOn:0}});ok(nominal);close(interval(nominal,'baseH').floor,-.04);close(interval(nominal,'baseH').ceil,.16);
  // 8 layers from tray pin-pocket bottom, z(8)=1.6; next 8 layers=1.6.
  const feature=run('feature-datum',{product:1,h0:.2,h:.2,set:{hFloor:1.6},layers:'pinD,8,8,5'});ok(feature);close(interval(feature,'pinD').z0,1.6);close(interval(feature,'pinD').z1,3.2);
  reject(run('datum-orphan',{product:1,layers:'pinD,8,8,5'}),1,'REFERENCE_LAYER_DOES_NOT_MEET');
  reject(run('datum-wrong-face',{product:1,set:{hFloor:1.6},layers:'pinD,8,8,3'}),1,'DATUM_MISMATCH');
});

test('assembly-is-preview-only-and-proposals-immutable',['MOD-02','MOD-03','GEO-02','ABI-01'],()=>{
  for(const [product,id] of [[1,'assemble'],[4,'charmRap']]){
    const a=run(`assembly-off-${product}`,{product,set:product===1?{skirtH:7}:{}}),b=run(`assembly-on-${product}`,{product,set:product===1?{skirtH:7,[id]:1}:{[id]:1}});ok(a);ok(b);
    assert.equal(hash(a.bytes),hash(b.bytes));assert.equal(a.metadata.exportBlocked,0);assert.equal(b.metadata.exportBlocked,1);
  }
  const proposal=run('small-tray',{product:1,width:18,height:18,set:{skirtH:7}});reject(proposal,3,'PROPOSAL_ACCEPTANCE');assert.equal(field(proposal,'size').value,18);assert.ok(proposal.metadata.proposals[0].after>=23.1);
  const accepted=run('accepted-size',{product:1,width:26,height:26,set:{skirtH:7}});ok(accepted);
  reject(run('invalid-no-auto',{product:1,width:18,height:18,set:{autoSize:0}}),1,'DOES_NOT_CLEAR');
});

test('source-color-seams-styles-and-binding',['GEO-01','MOD-02','AT-020.2'],()=>{
  for(const product of [0,1,2,3,4]){
    const set=product===3?{legoRanhOn:0}:{};
    const x=run(`colors-${product}`,{product,width:40,height:30,variant:'colors',set});ok(x);
    for(const color of [0xff2244ff,0x2266ffff])assert.ok(x.scene.parts.some(p=>p.color===color));
  }
  for(const style of [0,1,2,3]){
    const x=run(`prepared-style-${style}`,{width:20,height:10,variant:'prepared',set:{ringOn:0,artMode:style}});ok(x);close(totalVolume(x),480);
    const colors=x.scene.parts.filter(p=>p.color!==0x30353bff);assert.equal(colors.length,2);
    for(const p of colors)close(inspectMesh(partMesh(x.scene,p)).volume,100,1e-6);
    const left=partMesh(x.scene,colors[0]),right=partMesh(x.scene,colors[1]);close(bbox(left).max[0],0,1e-12);close(bbox(right).min[0],0,1e-12);
    close(bbox(left).size[1],10);close(bbox(right).size[1],10);
  }
  const roles=run('prepared-role-overrides',{variant:'prepared',set:{ringOn:0},bodyoverride:1,artoverride:1,rimslab:1});ok(roles);
  for(const [role,color,slot,provenance] of [[0,0x11aa77ff,5,'9007199254740998'],[1,0xff2244ff,2,'1020'],[2,0xddcc00ff,6,'9002']]){
    const index=roles.metadata.parts.findIndex(p=>p.role===role);assert.ok(index>=0);
    assert.equal(roles.scene.parts[index].color,color);assert.equal(roles.metadata.parts[index].slot,slot);
    assert.equal(roles.metadata.parts[index].provenanceId,provenance);
  }
  reject(run('stale-source',{stale:1}),1,'STALE_SOURCE_RECIPE');reject(run('missing-source-binding',{missing:1}),1,'MISSING_SOURCE_RECIPE');
  reject(run('unprepared-flat',{set:{artMode:2}}),2,'PREPARED_SLABS_REQUIRED');
  ok(run('source-fillet',{set:{topBevel:1}}));
  const separated=run('disjoint-z-same-xy',{width:20,height:10,variant:'z-separated',set:{ringOn:0}});ok(separated);
  close(totalVolume(separated),880);assert.equal(separated.scene.parts.length,3);
  assert.equal(unionAt(separated.scene,separated.metadata,[.17,.29,3.9]),false,'same XY does not imply 3D contact');
  reject(run('overlap-z',{variant:'z-overlap',set:{ringOn:0}}),1,'MATERIAL_INTERIOR_OVERLAP');
  reject(run('point-touch',{variant:'point-touch',set:{ringOn:0}}),1,'PLANAR_POINT_CONTACT');
  reject(run('below-grid',{variant:'short-edge',set:{ringOn:0}}),1,'BELOW_BOOLEAN_RESOLUTION');
});

test('mating-tolerance-signed-deviation-three-levels',['GEO-02','GEO-03','AT-021.1'],()=>{
  for(const tol of [.001,.0005,.0001])for(const diameter of [4,6,10]){
    const x=run(`precision-${diameter}-${tol}`,{product:4,width:40,height:40,tol,set:{charmChotD:diameter}});ok(x);
    const radius=diameter/2,shift=32.25;
    const pin=radial(x,1,5.31,shift,0,[radius-.01,radius+.01]);assert.ok(pin.max<=radius+1e-7);assert.ok(pin.min>=radius-tol);
    const hole=radial(x,0,.93,0,0,[radius+.09,radius+.11]);assert.ok(hole.min>=radius+.1-1e-7);assert.ok(hole.max<=radius+.1+tol);
    assert.ok(x.metadata.curves.every(c=>c.segments>18&&c.max-c.min<c.tolerance));
  }
});

test('v1-groove-default-analytic-and-source',['MOD-03','GEO-03','AT-020.3'],()=>{
  const x=run('v1-groove',{product:3,width:40,height:30,stl:1});ok(x);
  const f=x.metadata.features.find(f=>f.id==='mech:lego:perimeter-groove');close(f.dimensions[1],2.8);
  assert.equal(field(x,'legoRanhZ').mode,4);assert.equal(field(x,'legoRanhZ').value,0);
  const expected=6720-15*Math.PI*2.45**2*1.8-(70*Math.PI*.8**2-16*.8**3/3);
  close(totalVolume(x),expected,1,'analytic bore plus semicircular perimeter volume');
  for(const dz of [-.71,-.4,0,.37,.69]){
    const hs=meshes(x,0).flatMap(m=>intersections(m,0,.173,2.8+dz));
    const expected=20-Math.sqrt(.8**2-dz**2);close(Math.max(...hs),expected,.0011,'groove circular cross-section');
  }
  // Semantics2: at W40, the literal bottom groove leaves .75 < .8 wall.
  const narrow=run('v1-groove-literal-zero-wall-loss',{product:3,set:{legoRanhZ:0}});reject(narrow,1,'FINAL_CAVITY_WALL_MISSING');assert.equal(field(narrow,'legoRanhZ').value,0);assert.equal(field(narrow,'legoRanhZ').mode,0);
  const literal=run('v1-groove-literal-zero',{product:3,width:40.11,set:{legoRanhZ:0}});ok(literal);assert.equal(field(literal,'legoRanhZ').mode,0);
  close(literal.metadata.features.find(f=>f.id==='mech:lego:perimeter-groove').dimensions[1],0);
  for(const variant of ['hole','islands','colors']){const a=run(`v1-groove-${variant}`,{product:3,variant});ok(a);if(variant==='hole')assert.equal(unionAt(a.scene,a.metadata,[0,0,4]),false);}
  reject(run('v1-groove-roof',{product:3,set:{legoRanhR:3}}),1,'POSITIVE_ROOF');
});

test('v1-top-bevel-round-chamfer-steps-material',['MOD-02','MOD-03','GEO-01','GEO-02'],()=>{
  for(const shape of [0,1]){
    const x=run(`v1-bevel-${shape}`,{width:20,height:10,set:{ringOn:0,topBevel:1,topBevelShape:shape},stl:1});ok(x);
    const R=.6,T=2.4;
    for(const dz of [.13,.31,.51]){
      const d=shape===1?dz:R-Math.sqrt(R*R-dz*dz),z=T-R+dz;
      const hs=meshes(x,0).flatMap(m=>intersections(m,0,.173,z));close(Math.max(...hs),10-d,.004,'bevel section');
    }
    const removed=shape===1?30*R*R-4*R**3/3:60*R*R*(1-Math.PI/4)-4*R**3*(5/3-Math.PI/2);
    close(totalVolume(x),480-removed,.3,'independent analytic bevel volume');
  }
  const joined=run('v1-bevel-material-joined',{width:20,height:10,variant:'prepared',set:{ringOn:0,topBevel:1,topBevelR:1.2,bevelGop:1}});ok(joined);
  const colors=joined.scene.parts.filter(p=>p.color===0xff2244ff||p.color===0x2266ffff);assert.equal(colors.length,2);
  for(const z of [1.41,1.8,2.31]){
    const left=intersections(partMesh(joined.scene,colors[0]),0,.17,z),right=intersections(partMesh(joined.scene,colors[1]),0,.17,z);
    close(Math.max(...left),0,1e-12);close(Math.min(...right),0,1e-12);
  }
  const separate=run('v1-bevel-material-separate',{width:20,height:10,variant:'prepared',set:{ringOn:0,topBevel:1,topBevelShape:1,bevelGop:0}});ok(separate);
  assert.equal(unionAt(separate.scene,separate.metadata,[0,.17,2.3]),false,'explicit per-region bevel valley');
  for(const h of [.16,.2,.25]){
    const x=run(`v1-bevel-steps-${h}`,{width:20,height:10,h0:.2,h,set:{ringOn:0,topBevel:1,topBevelShape:2,topBevelSeg:3}});ok(x);
    const steps=x.metadata.features.filter(f=>f.id.startsWith('source:bevel:step:'));assert.equal(steps.length,3);
    steps.forEach((s,i)=>{const [lo,hi,d,index]=s.dimensions;close(lo,index===0?0:.2+(index-1)*h);close(d,.2*(i+1));
      const hs=meshes(x,0).flatMap(m=>intersections(m,0,.173,(lo+hi)/2));close(Math.max(...hs),10-d,1e-6);});
    close(groupBounds(x,0).max[2],2.4);
  }
  const hole=run('v1-bevel-hole',{width:20,height:10,variant:'hole',set:{ringOn:0,topBevel:1}});ok(hole);assert.equal(unionAt(hole.scene,hole.metadata,[0,0,1]),false);
  reject(run('v1-bevel-floor',{set:{ringOn:0,topBevel:1,topBevelR:3}}),1,'POSITIVE_FLOOR');
  const override=run('v1-block-bevel-override',{variant:'prepared',blockbevel:1,set:{ringOn:0,topBevel:1,bevelGop:1}});ok(override);
  assert.equal(unionAt(override.scene,override.metadata,[-19.99,.17,2.3]),true,'disabled user override retained');
  assert.equal(unionAt(override.scene,override.metadata,[19.9,.17,2.3]),false,'enabled block has its own radius');
  assert.equal(override.metadata.features.find(f=>f.id==='source:bevel:top:103').provenanceId,'8002');
  reject(run('v1-block-bevel-orphan',{variant:'prepared',blockbevel:2}),1,'OVERRIDE_ORPHAN');
});

test('v1-text-host-and-independent-text-bevel',['SRC-04','MOD-02','MOD-03','GEO-01'],()=>{
  const x=run('v1-text-eyelet',{variant:'text',set:{ringTren:1}});ok(x);
  const f=x.metadata.features.find(f=>f.id==='mech:keyring');assert.equal(f.sourceId,'7001');close(f.dimensions[0],33);close(f.dimensions[1],6.5);
  assert.equal(unionAt(x.scene,x.metadata,[33,6.5,.5]),false);assert.equal(unionAt(x.scene,x.metadata,[36,6.5,.5]),true);
  assert.equal(unionAt(x.scene,x.metadata,[33,0,1.5]),false,'text counter preserved');assert.equal(unionAt(x.scene,x.metadata,[39.5,2,1.5]),true,'detached dot preserved');
  for(const shape of [0,1,2]){
    const x=run(`v1-text-bevel-${shape}`,{variant:'text',set:{ringOn:0,topBevel:0,bevelChu:1,topBevelR:.3,topBevelShape:shape,topBevelSeg:2}});ok(x);
    const base=x.scene.parts.find((p,i)=>x.metadata.parts[i].role===0);close(inspectMesh(partMesh(x.scene,base)).volume,2880,1e-6,'main body remains independent');
    assert.equal(unionAt(x.scene,x.metadata,[33,0,1.5]),false);assert.equal(unionAt(x.scene,x.metadata,[39.5,2,1.5]),true);
    assert.ok(x.scene.parts.some(p=>p.color===0xeecc22ff));assert.ok(x.scene.parts.some(p=>p.color===0x3344aaff));
    const glyph=x.scene.parts.find((p,i)=>x.metadata.parts[i].role===7);
    const hs=intersections(partMesh(x.scene,glyph),0,.17,2.15);assert.ok(Math.max(...hs)<38-.04,'text top edge actually beveled');
  }
  reject(run('v1-text-orphan-attachment',{variant:'text',badattachment:1,set:{ringTren:1}}),1,'TEXT_ATTACHMENT_REQUIRED');
  const combined=run('v1-text-eyelet-and-bevel',{variant:'text',set:{ringTren:1,bevelChu:1,topBevelR:.3}});ok(combined);
  assert.equal(unionAt(combined.scene,combined.metadata,[33,6.5,.5]),false);assert.equal(unionAt(combined.scene,combined.metadata,[36,6.5,.5]),true);
  assert.equal(combined.metadata.features.find(f=>f.id==='mech:keyring').sourceId,'7001');
});

test('v1-strap-capsule-oblique-and-corner-mouths',['MOD-03','GEO-03','AT-021.1'],()=>{
  for(const angle of [0,30,45,90,120])for(const dir of [0,1]){
    const x=run(`v1-strap-${angle}-${dir}`,{product:2,width:40,height:40,set:{strapAngle:angle,strapSlot:2,strapSlotDir:dir}});ok(x);
    const a=angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),nx=-dy,ny=dx,u=.173;
    const end=Math.min(Math.abs(dx)<1e-10?Infinity:(Math.sign(dx)*20-u*nx)/dx,Math.abs(dy)<1e-10?Infinity:(Math.sign(dy)*20-u*ny)/dy);
    const s=end-.3,Z=5+2.3+(dir===1?1:0);
    for(const [delta,filled] of [[-.01,false],[.01,true]])assert.equal(unionAt(x.scene,x.metadata,[s*dx+u*nx,s*dy+u*ny,Z+delta]),filled,'axial chamfer depth/profile sign');
  }
  const x=run('v1-strap-capsule-end',{product:2,set:{strapSlot:6}});ok(x);
  const hs=meshes(x,0).flatMap(m=>intersections(m,1,5.03,-19.7));
  const positive=hs.filter(v=>v>0&&v<8);close(Math.min(...positive),3+Math.sqrt(2.3**2-.03**2),.0011,'capsule extension retained during chamfer');
  reject(run('v1-strap-capsule-floor',{product:2,set:{strapSlot:8,strapSlotDir:1}}),1,'POSITIVE_FLOOR');
});

test('v1-concave-corners-and-tolerance-budgets',['GEO-01','GEO-02','GEO-03'],()=>{
  for(const tol of [.001,.0005,.0001]){
    const groove=run(`v1-concave-groove-${tol}`,{product:3,variant:'concave',tol});ok(groove);
    // Avoid the sphere's exact equatorial vertex plane: sectionSegments uses
    // strict edge-plane crossings so coplanar boundary edges are not duplicated.
    const grooveR=Math.sqrt(.8**2-.0317**2),gr=radial(groove,0,2.8317,0,0,[.79,.81]);
    assert.ok(gr.min>=grooveR-2e-8);assert.ok(gr.max<=grooveR+tol);
    assert.equal(unionAt(groove.scene,groove.metadata,[.1,.1,4]),false,'concave source notch preserved');
    const bevel=run(`v1-concave-bevel-${tol}`,{variant:'concave',exporttol:tol,set:{ringOn:0,topBevel:1}});ok(bevel);
    const d=.6-Math.sqrt(.6**2-.3173**2),br=radial(bevel,0,2.1173,0,0,[d-.01,d+.01]);
    assert.ok(br.min>=d-tol);assert.ok(br.max<=d+tol,'concave rolling sector radius');
    const strap=run(`v1-capsule-tolerance-${tol}`,{product:2,tol,set:{strapSlot:6}});ok(strap);
    const hs=meshes(strap,0).flatMap(m=>intersections(m,1,5.03,-19.7)).filter(v=>v>0&&v<8);
    close(Math.min(...hs),3+Math.sqrt(2.3**2-.03**2),tol+2e-8,'capsule mouth actual tolerance');
  }
});

test('v1-combinations-cancellation-and-seeded-surfaces',['MOD-03','GEO-02','GEO-03','ABI-01'],()=>{
  for(const shape of [0,1,2]){
    const x=run(`v1-cap-tray-bevel-${shape}`,{product:1,variant:'colors',set:{topBevel:1,topBevelShape:shape,bevelGop:1,topBevelR:.4,topBevelSeg:2,skirtH:7}});ok(x);
    for(const [id,mm] of [['socketD',5.5],['pinD',1.7],['collarH',1.85]])close(interval(x,id).z1-interval(x,id).z0,mm);
    const cap=x.scene.parts.flatMap((p,i)=>x.metadata.parts[i].group===0?[transform(partMesh(x.scene,p),x.metadata.parts[i].previewTransform)]:[]);
    const tray=x.scene.parts.flatMap((p,i)=>x.metadata.parts[i].group===1?[transform(partMesh(x.scene,p),x.metadata.parts[i].previewTransform)]:[]);
    const intervals=(ms,y,z)=>ms.flatMap(m=>{const hits=intersections(m,0,y,z);return hits.flatMap((h,i)=>i%2===0&&i+1<hits.length?[[h,hits[i+1]]]:[]);});
    for(const t of [0,1.05,2.1,3.15,4.2])for(const y of [-14.3,-10.1,-6.3,.17,6.3,10.1,14.3])for(const z of [1.7,3.7,5.7,8.7,10.7,12.7,15.7]){
      for(const a of intervals(cap,y,z+t))for(const b of intervals(tray,y,z))assert.ok(Math.min(a[1],b[1])-Math.max(a[0],b[0])<1e-7,'independent beveled assembly collision probe');
    }
  }
  reject(run('v1-cancel-before',{cancel:'before'}),5,'CANCELLED');
  ok(run('v1-cancel-stale',{cancel:'stale'}));
  reject(run('v1-control-generation',{cancel:'generation'}),1,'CONTROL_GENERATION');
  let state=0x6d656332;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
  for(let i=0;i<12;i++){
    const product=[0,2,3,4][i%4],width=+(32+rnd()*25).toFixed(4),height=+(28+rnd()*22).toFixed(4),shape=i%3;
    const set={topBevel:1,topBevelShape:shape,topBevelR:.3,topBevelSeg:2,bevelGop:1};
    if(product===2){set.strapAngle=Math.floor(rnd()*180);set.strapSlot=2;set.strapSlotDir=i%2;}
    const x=run(`v1-surface-fuzz-${i}`,{product,width,height,set,seed:'0x6d656332'});ok(x);assert.ok(totalVolume(x)>0);
  }
});

test('seeded-corners-and-fuzz-regressions',['MOD-03','GEO-02','GEO-03'],()=>{
  let state=0x6d656368;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
  for(let i=0;i<24;i++){
    const product=i%5,width=+(28+rnd()*30).toFixed(4),height=+(28+rnd()*20).toFixed(4);
    const set=product===0?{ringAngle:Math.floor(rnd()*360),ringOverlap:1.3}:product===1?{skirtH:7,clr:+(rnd()*.15).toFixed(4)}:product===2?{strapAngle:Math.floor(rnd()*180),strapCham:0}:product===3?{legoRanhOn:0,legoThua:i%3}:{charmClr:+(rnd()*.6).toFixed(4)};
    const x=run(`fuzz-${i}`,{product,width,height,set,seed:'0x6d656368'});ok(x);
    assert.ok(totalVolume(x)>0);assert.ok(groupBounds(x,0).size.every(v=>v>0));
  }
  for(const [key,value] of [['baseH','nan'],['baseH','inf'],['size',161],['layerH',.31]])reject(run(`bad-${key}-${value}`,{set:{[key]:value}}),1,key==='baseH'?'NONFINITE':'PARAMETER_DOMAIN');
  reject(run('badmaterial',{badmaterial:1}),1,'MATERIAL_DOMAIN');
  reject(run('extreme-tolerance',{tol:.0000001}),1,'MATING_TOLERANCE');
});

const summary={schemaVersion:1,target,at:new Date().toISOString(),implementation:'arch-mechanics/0.3.0',oracle:'mechanical-oracle/1 + indexed-oracle frozen main copy',fullFeatureAcceptance:false,configuredReview:false,fit:'unqualified',records,artifacts,
  counts:{pass:records.filter(r=>r.verdict==='pass').length,fail:records.filter(r=>r.verdict==='fail').length},
  limitations:['Physical AT-022.1/.2 unverified','No slicer or printer actions','General source self-intersection and whole-pipeline signed error remain parent dependencies','Prepared source slabs are fixtures at an integration boundary, not proof of artwork-style implementation','Single-thread WASM cancellation during a call requires parent shared-memory observer or Worker watchdog']};
fs.writeFileSync(path.join(room,'reports',`mechanics-${target}${filter?'-'+filter:''}-tests.json`),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary.counts));process.exitCode=summary.counts.fail?1:0;
