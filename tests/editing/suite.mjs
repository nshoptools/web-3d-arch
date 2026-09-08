import {createEditor, VERSION, LIMITS, encodeUndo, decodeUndo, deviceToImage, imageToDevice, gapFromDesign, snap45} from '../../src/editing/index.mjs';
import {fixtures, bitmap, palette} from './fixtures.mjs';

export function assert(condition, message = 'Assertion failed') { if (!condition) throw Error(message); }
export function equal(a, b, message = 'Expected equality') {
  assert(JSON.stringify(a) === JSON.stringify(b), message + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
}
export function bytes(a, b, message = 'Pixel mismatch') {
  assert(a.length === b.length, message + ' length');
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw Error(message + ' byte ' + i + ': ' + a[i] + ' != ' + b[i]);
}
export async function rejects(fn, code) {
  try { await fn(); } catch (error) { equal(error.code, code, 'Error code'); return; }
  throw Error('Expected rejection: ' + code);
}
export const source = Object.freeze({id:'fixture/source',hash:'a'.repeat(64),adapterId:'trusted-rgba-fixture',adapterVersion:'1'});
export const noWait = {yieldControl: () => Promise.resolve()};
export const make = (image = bitmap(['RRR','R.R','RRR'])) => createEditor({source,image});
export const command = (editor, options, id = 'gesture/one') => ({version:VERSION,id,expected:editor.token(),...options});
function diff(a, b) {
  const hits = [];
  for (let i = 0; i < a.width * a.height; i++) if ([0,1,2,3].some(k => a.data[i*4+k] !== b.data[i*4+k])) hits.push(i);
  if (!hits.length) return {count:0,bounds:null};
  const xs = hits.map(i => i % a.width), ys = hits.map(i => Math.floor(i/a.width));
  return {count:hits.length,bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs)+1,height:Math.max(...ys)-Math.min(...ys)+1}};
}
const checks = [];
const add = (name, run) => checks.push({name,run});
for (const fixture of fixtures) add(fixture.name, async () => {
  const input = bitmap(fixture.before), original = input.data.slice(), expected = bitmap(fixture.after), editor = await make(input);
  const beforeToken = editor.token(), result = await editor.apply(command(editor, fixture.command), noWait), change = diff(input,expected);
  bytes(result.image.data,expected.data); equal(result.changedBounds,change.bounds); equal(result.changedPixels,change.count);
  bytes(input.data,original,'Input was mutated'); bytes(editor.original().image.data,original,'Immutable raster was mutated');
  equal(editor.original().source,source);
  if (!change.count) { equal(result.status,'unchanged'); equal(result.undo,null); equal(editor.token(),beforeToken); return {hash:result.token.hash}; }
  equal(result.status,'committed'); equal(result.token.revision,1); assert(result.token.hash !== beforeToken.hash);
  equal(result.undo.command.tool,fixture.command.tool); equal(result.undo.base,beforeToken);
  const encoded = encodeUndo(result.undo), payload = decodeUndo(encoded);
  bytes(encodeUndo(payload),encoded,'Payload canonical round-trip');
  const undone = await editor.replay(payload,'undo',editor.token(),noWait);
  bytes(undone.image.data,original,'Whole gesture undo'); equal(undone.token.hash,beforeToken.hash); equal(undone.token.revision,2);
  const redone = await editor.replay(decodeUndo(encoded),'redo',editor.token(),noWait);
  bytes(redone.image.data,expected.data,'Whole gesture redo'); equal(redone.token.hash,result.token.hash); equal(redone.token.revision,3);
  bytes(editor.original().image.data,original);
  return {hash:result.token.hash};
});

add('source over straight alpha with ties to even', async () => {
  const image = {width:1,height:1,data:new Uint8Array([0,1,191,128]),colorSpace:'srgb',alphaMode:'straight'};
  const e=await make(image), r=await e.apply(command(e,{tool:'line',points:[{x:.5,y:.5}],color:[191,192,0,128]}),noWait);
  bytes(r.image.data,new Uint8Array([128,128,64,192]));
});
add('source over partial alpha has analytic integer result',async()=>{
  const e=await make(bitmap(['B'])),r=await e.apply(command(e,{tool:'line',points:[{x:.5,y:.5}],color:[255,0,0,128]}),noWait);
  bytes(r.image.data,new Uint8Array([128,0,127,255]));
});
add('hole opacity attenuates alpha and preserves RGB while occupied',async()=>{
  const e=await make({width:1,height:1,data:new Uint8Array([12,34,56,128]),colorSpace:'srgb',alphaMode:'straight'});
  const r=await e.apply(command(e,{tool:'erase',points:[{x:.5,y:.5}],opacity:128}),noWait);
  bytes(r.image.data,new Uint8Array([12,34,56,64]));
});
add('merge preserves partial alpha',async()=>{
  const e=await make(bitmap(['r'])),r=await e.apply(command(e,{tool:'erase',points:[{x:.5,y:.5}],mode:'merge',color:palette.G}),noWait);
  bytes(r.image.data,new Uint8Array([0,255,0,128]));
});
add('transparent hidden RGB preserved in original and zero-alpha source-over no-op',async()=>{
  const image={width:2,height:1,data:new Uint8Array([14,27,31,0,99,88,77,0]),colorSpace:'srgb',alphaMode:'straight'},e=await make(image);
  const r=await e.apply(command(e,{tool:'line',points:[{x:.5,y:.5},{x:1.5,y:.5}],color:[123,22,44,0]}),noWait);
  bytes(r.image.data,image.data);equal(r.status,'unchanged');
  const filled=await e.apply(command(e,{tool:'paint',seeds:[{x:0,y:0}],color:palette.G}),noWait);
  bytes(filled.image.data,bitmap(['GG']).data);bytes(e.original().image.data,image.data);
});
add('paint tolerance is seed-relative not transitive color drift',async()=>{
  const image={width:3,height:1,data:new Uint8Array([10,0,0,255,12,0,0,255,14,0,0,255]),colorSpace:'srgb',alphaMode:'straight'};
  const e=await make(image),r=await e.apply(command(e,{tool:'paint',seeds:[{x:0,y:0}],color:palette.G,tolerance:2}),noWait);
  bytes(r.image.data,new Uint8Array([0,255,0,255,0,255,0,255,14,0,0,255]));
});
add('every tool opacity zero has no payload and no revision',async()=>{
  for(const tool of ['paint','line','curve','erase','cut','crop','heal']){
    const f=fixtures.find(x=>x.command.tool===tool),e=await make(bitmap(f.before)),before=e.token();
    const r=await e.apply(command(e,{...f.command,opacity:0}),noWait);equal(r.undo,null);equal(e.token(),before);
  }
});
add('curved arch interpolates knots and agrees with independent dense polynomial oracle',async()=>{
  const e=await make(bitmap(Array(9).fill('.........'))),points=[{x:.5,y:8.5},{x:4.5,y:.5},{x:8.5,y:8.5}];
  const r=await e.apply(command(e,{tool:'curve',points,color:palette.R,width:1}),noWait);
  for(const p of points)equal(r.image.data[(Math.floor(p.y)*9+Math.floor(p.x))*4+3],255);
  equal(r.image.data[(6*9+4)*4+3],0,'Arch does not fill interior');
  // Independently evaluate the uniform Catmull-Rom polynomial, not the implementation subdivision.
  const samples=[];
  for(let span=0;span<2;span++)for(let k=0;k<=8192;k++){
    const t=k/8192,p0=points[Math.max(0,span-1)],p1=points[span],p2=points[span+1],p3=points[Math.min(2,span+2)];
    const at=axis=>.5*((2*p1[axis])+(-p0[axis]+p2[axis])*t+(2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t*t+(-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t*t*t);
    samples.push({x:at('x'),y:at('y')});
  }
  let compared=0;
  for(let y=0;y<9;y++)for(let x=0;x<9;x++){
    let d=Infinity;for(const s of samples)d=Math.min(d,Math.hypot(s.x-x-.5,s.y-y-.5));
    if(Math.abs(d-.5)>.14){equal(r.image.data[(y*9+x)*4+3]>0,d<.5,'Curve oracle at '+x+','+y);compared++;}
  }
  assert(compared>=60);
});
add('variable pressure sweep is union of interpolated discs',async()=>{
  const e=await make(bitmap(Array(7).fill('.......'))),r=await e.apply(command(e,{tool:'line',points:[{x:1.5,y:3.5,pressure:0},{x:5.5,y:3.5,pressure:1}],width:2,color:palette.R}),noWait);
  equal(r.image.data[(3*7+1)*4+3],255);equal(r.image.data[(2*7+1)*4+3],0);
  equal(r.image.data[(2*7+5)*4+3],255);equal(r.image.data[(4*7+5)*4+3],255);
});
add('curve duplicated knots remain finite and reversal is invariant',async()=>{
  const p=[{x:.5,y:4.5},{x:2.5,y:.5},{x:2.5,y:.5},{x:4.5,y:4.5}],img=bitmap(Array(5).fill('.....'));
  const a=await make(img),b=await make(img);
  const ar=await a.apply(command(a,{tool:'curve',points:p,color:palette.r}),noWait);
  const br=await b.apply(command(b,{tool:'curve',points:[...p].reverse(),color:palette.r}),noWait);
  bytes(ar.image.data,br.image.data);
});
add('coordinate transform inverse covers DPR zoom pan rotation and reflection',async()=>{
  for(const m of [[2,0,0,2,31,-9],[0,3,-3,0,100,50],[-2,0,.5,4,0,1],[.25,.125,-.5,2,8,9]]){
    for(const p of [{x:.5,y:.5},{x:-10,y:120},{x:1280,y:720}]){
      const q=deviceToImage(imageToDevice(p,m),m);assert(Math.abs(q.x-p.x)<1e-9&&Math.abs(q.y-p.y)<1e-9);
    }
  }
  const first=await make(bitmap(['.....'])),second=await make(bitmap(['.....']));
  const m=[4,0,0,4,19,51],points=[{x:.5,y:.5},{x:4.5,y:.5}];
  bytes((await first.apply(command(first,{tool:'line',points,color:palette.R}),noWait)).image.data,
    (await second.apply(command(second,{tool:'line',points:points.map(p=>deviceToImage(imageToDevice(p,m),m)),color:palette.R}),noWait)).image.data);
});
add('design gap conversion is tied to image scale and rounds down',async()=>{
  equal(gapFromDesign(.35,.1),{maxGapPx:3,pixelSizeMm:.1,resolvedGapMm:.30000000000000004});
  await rejects(()=>gapFromDesign(.01,.1),'INVALID_INPUT');
  await rejects(()=>deviceToImage({x:1,y:2},[1,2,2,4,0,0]),'INVALID_INPUT');
  equal(snap45({x:0,y:0},{x:4,y:3}),{x:3.5,y:3.5});
});
add('prepare is provisional and mutations of public buffers do not affect commit',async()=>{
  const input=bitmap(['...']),e=await make(input),before=e.token(),original=e.original();
  original.image.data.fill(98);input.data.fill(99);
  const c=command(e,{tool:'line',points:[{x:.5,y:.5},{x:2.5,y:.5}],color:palette.R}),p=await e.prepare(c,noWait);
  equal(e.token(),before);bytes(e.snapshot().image.data,bitmap(['...']).data);
  p.image.data.fill(42);p.expected.revision=999;c.points[0].x=99;
  const result=e.commit(c.id,before);bytes(result.image.data,bitmap(['RRR']).data);
  result.image.data.fill(66);result.undo.after.fill(88);
  bytes(e.snapshot().image.data,bitmap(['RRR']).data);bytes(e.original().image.data,bitmap(['...']).data);
  await rejects(()=>e.commit(c.id,e.token()),'NO_TRANSACTION');
});
add('cancelled draft and mid-work cancel publish nothing',async()=>{
  const e=await make(bitmap(Array(64).fill('R'.repeat(64)))),before=e.token();
  const c=command(e,{tool:'paint',seeds:[{x:0,y:0}],color:palette.B});
  await e.prepare(c,noWait);assert(e.cancel(c.id));equal(e.token(),before);
  await rejects(()=>e.commit(c.id,before),'NO_TRANSACTION');
  await rejects(()=>e.apply(c,{...noWait,checkpointWork:128,onProgress:p=>{if(p.phase==='select-region')e.cancel(c.id);}}),'CANCELLED');
  equal(e.token(),before);bytes(e.snapshot().image.data,e.original().image.data);
});
add('AbortSignal before work, after prepare, and at final checkpoint is atomic',async()=>{
  const e=await make(),before=e.token(),c=command(e,{tool:'heal',seeds:[{x:1,y:1}]});
  const pre=new AbortController();pre.abort();await rejects(()=>e.apply(c,{signal:pre.signal}),'CANCELLED');
  const late=new AbortController();await e.prepare(c,{...noWait,signal:late.signal});late.abort();
  await rejects(()=>e.commit(c.id,before),'CANCELLED');e.cancel(c.id);
  const final=new AbortController();
  await rejects(()=>e.apply(c,{...noWait,signal:final.signal,onProgress:p=>{if(p.phase==='prepared')final.abort();}}),'CANCELLED');
  equal(e.token(),before);
});
add('stale source hash id original hash and revision rejected before work and at commit',async()=>{
  for(const field of ['sourceId','sourceHash','originalHash','hash','revision']){
    const e=await make(),before=e.token(),c=command(e,{tool:'heal',seeds:[{x:1,y:1}]});
    const stale={...before,[field]:field==='revision'?1:field==='sourceId'?'other/source':'b'.repeat(64)};
    await rejects(()=>e.apply({...c,expected:stale},noWait),'REVISION_CONFLICT');equal(e.token(),before);
    await e.prepare(c,noWait);await rejects(()=>e.commit(c.id,stale),'REVISION_CONFLICT');equal(e.token(),before);e.cancel(c.id);
  }
});
add('history replay invalidates an older prepared gesture even after content returns (ABA)',async()=>{
  const e=await make(),first=await e.apply(command(e,{tool:'heal',seeds:[{x:1,y:1}]}),noWait);
  const current=e.token(),c=command(e,{tool:'line',points:[{x:.5,y:.5}],color:palette.B},'gesture/two');
  await e.prepare(c,noWait);await e.replay(first.undo,'undo',e.token(),noWait);await e.replay(first.undo,'redo',e.token(),noWait);
  equal(e.token().hash,current.hash);await rejects(()=>e.commit(c.id,e.token()),'REVISION_CONFLICT');e.cancel(c.id);
});
add('one running and one prepared operation enforce bounded residency',async()=>{
  const e=await make(),c=command(e,{tool:'heal',seeds:[{x:1,y:1}]});
  let release;const gate=new Promise(r=>release=r);let once=true;
  const pending=e.prepare(c,{yieldControl:()=>{if(once){once=false;return gate;}return Promise.resolve();}});
  await rejects(()=>e.prepare({...c,id:'second'},noWait),'BUSY');release();await pending;
  await rejects(()=>e.prepare({...c,id:'second'},noWait),'BUSY');e.cancel(c.id);
});
add('corrupt payload rejected atomically for bytes hash bounds count and source',async()=>{
  for(const field of ['before','afterHash','changedPixels','source','bounds']){
    const e=await make(),r=await e.apply(command(e,{tool:'heal',seeds:[{x:1,y:1}]}),noWait),before=e.token(),p=decodeUndo(encodeUndo(r.undo));
    if(field==='before')p.before[0]^=1;
    if(field==='afterHash')p.afterHash='b'.repeat(64);
    if(field==='changedPixels')p.changedPixels=0;
    if(field==='source'){p.base={...p.base,sourceId:'other'};p.command.expected=p.base;}
    if(field==='bounds')p.changedBounds.x=99;
    let caught=false;try{await e.replay(p,'undo',before,noWait);}catch{caught=true;}assert(caught);equal(e.token(),before);bytes(e.snapshot().image.data,r.image.data);
  }
});
add('payload framing validates byte offset truncation trailing bytes and magic',async()=>{
  const e=await make(),r=await e.apply(command(e,{tool:'heal',seeds:[{x:1,y:1}]}),noWait),encoded=encodeUndo(r.undo);
  const backing=new Uint8Array(encoded.length+14);backing.set(encoded,7);bytes(encodeUndo(decodeUndo(backing.subarray(7,-7))),encoded);
  await rejects(()=>decodeUndo(encoded.subarray(0,-1)),'INVALID_INPUT');
  const trailing=new Uint8Array(encoded.length+1);trailing.set(encoded);await rejects(()=>decodeUndo(trailing),'INVALID_INPUT');
  const bad=encoded.slice();bad[0]=0;await rejects(()=>decodeUndo(bad),'VERSION_MISMATCH');
});
add('undo and redo cancellation preserve the committed image',async()=>{
  const e=await make(),r=await e.apply(command(e,{tool:'heal',seeds:[{x:1,y:1}]}),noWait),before=e.token();
  const ac=new AbortController();
  await rejects(()=>e.replay(r.undo,'undo',before,{...noWait,signal:ac.signal,onProgress:p=>{if(p.phase==='replay-ready')ac.abort();}}),'CANCELLED');
  equal(e.token(),before);bytes(e.snapshot().image.data,r.image.data);
});
add('invalid and resource-limited commands leave state unchanged',async()=>{
  const bad=[
    {tool:'line',points:[],color:palette.R},{tool:'line',points:[{x:NaN,y:1}],color:palette.R},
    {tool:'line',points:[{x:100001,y:1}],color:palette.R},{tool:'line',points:[{x:0,y:0,pressure:2}],color:palette.R},
    {tool:'line',points:[{x:0,y:0}],color:palette.R,width:61},{tool:'line',points:[{x:0,y:0}],color:[256,0,0]},
    {tool:'line',points:Array(LIMITS.maxPoints+1).fill({x:0,y:0}),color:palette.R},
    {tool:'crop',from:{x:0,y:0},to:{x:1,y:1},shape:'polygon'},
    {tool:'heal',method:'all-gaps',maxGapPx:61,pixelSizeMm:.1},
    {tool:'heal',method:'all-gaps',maxGapPx:1},
    {tool:'heal',method:'region',seeds:[{x:1,y:1}],width:1},
    {tool:'paint',seeds:[{x:0,y:0}],color:palette.R,unknown:1},
    {tool:'erase',points:[{x:0,y:0}],mode:'merge',color:[1,2,3,128]},
  ];
  const e=await make(),before=e.token();
  for(const options of bad){let caught=false;try{await e.apply(command(e,options),noWait);}catch{caught=true;}assert(caught,'Invalid input accepted');equal(e.token(),before);}
  await rejects(()=>e.apply(command(e,{tool:'paint',seeds:[{x:0,y:0}],color:palette.B}),{...noWait,maxWork:1}),'RESOURCE_LIMIT');
  equal(e.token(),before);
});
add('invalid RGBA buffers dimensions color conversion and source hashes rejected',async()=>{
  const good=bitmap(['R']);
  for(const image of [{...good,width:1281},{...good,width:0},{...good,data:new Uint8Array(3)},{...good,data:[1,2,3,4]},{...good,colorSpace:'display-p3'},{...good,alphaMode:'premultiplied'}])
    await rejects(()=>make(image),'INVALID_INPUT');
  if(typeof SharedArrayBuffer!=='undefined')await rejects(()=>make({...good,data:new Uint8Array(new SharedArrayBuffer(4))}),'INVALID_INPUT');
  await rejects(()=>createEditor({source:{...source,hash:'wrong'},image:good}),'INVALID_INPUT');
  const resizable=new ArrayBuffer(4,{maxByteLength:8});if(resizable.resizable)await rejects(()=>make({...good,data:new Uint8Array(resizable)}),'INVALID_INPUT');
});
add('RGBA subarray ownership and detached input rejected',async()=>{
  const backing=new Uint8Array([7,255,0,0,255,8]),view=backing.subarray(1,5);
  const e=await make({width:1,height:1,data:view,colorSpace:'srgb',alphaMode:'straight'});bytes(e.original().image.data,palette.R);
  const data=new Uint8Array(4);structuredClone(data,{transfer:[data.buffer]});
  await rejects(()=>make({width:1,height:1,data,colorSpace:'srgb',alphaMode:'straight'}),'INVALID_INPUT');
});
add('safe rejection of exterior heal and automatic merge without boundary',async()=>{
  const e=await make(bitmap(['R..'])),before=e.token();
  await rejects(()=>e.apply(command(e,{tool:'heal',seeds:[{x:1,y:0}]}),noWait),'EXTERIOR_REGION');equal(e.token(),before);
  const m=await make(bitmap(['R'])),mt=m.token();
  await rejects(()=>m.apply(command(m,{tool:'erase',points:[{x:.5,y:.5}],mode:'merge'}),noWait),'NO_BOUNDARY_COLOR');equal(m.token(),mt);
});
add('default work yields allow timer cancellation without blocking waits',async()=>{
  const e=await make(bitmap(Array(128).fill('R'.repeat(128)))),before=e.token(),ac=new AbortController();
  const pending=e.apply(command(e,{tool:'paint',seeds:[{x:0,y:0}],color:palette.B}),{signal:ac.signal,checkpointWork:256});
  setTimeout(()=>ac.abort(),0);await rejects(()=>pending,'CANCELLED');equal(e.token(),before);
});

add('maximum 1280-square raster commits with a measured payload size',async()=>{
  const image={width:1280,height:1280,data:new Uint8Array(1280*1280*4),colorSpace:'srgb',alphaMode:'straight'};
  const e=await make(image),c=command(e,{tool:'paint',seeds:[{x:0,y:0}],color:[1,2,3,255]});
  let maxWork=0,checkpoints=0;
  const p=await e.prepare(c,{...noWait,onProgress:s=>{assert(s.work>=maxWork);maxWork=s.work;checkpoints++;}});
  equal(p.changedPixels,1280*1280);equal(p.changedBounds,{x:0,y:0,width:1280,height:1280});assert(p.undoBytes>=image.data.length*2);
  const r=e.commit(c.id,c.expected);equal(encodeUndo(r.undo).byteLength,p.undoBytes);
  assert(r.image.data.every((v,i)=>v===[1,2,3,255][i%4]));assert(e.original().image.data.every(v=>v===0));
  assert(checkpoints>100);assert(maxWork<=LIMITS.maxWork);
});
add('crop outside image and boundary erase preserve origin',async()=>{
  const e=await make(bitmap(['RR','RR'])),r=await e.apply(command(e,{tool:'crop',from:{x:10,y:10},to:{x:11,y:11}}),noWait);
  bytes(r.image.data,bitmap(['..','..']).data);equal(r.image.width,2);equal(r.image.height,2);
  const b=await make(bitmap(['RR','RR'])),cut=await b.apply(command(b,{tool:'erase',points:[{x:0,y:.5}]}),noWait);
  bytes(cut.image.data,bitmap(['.R','RR']).data);
});
add('fractional design scale equality is stable at 0.3 divided by 0.1',async()=>{
  equal(gapFromDesign(.3,.1).maxGapPx,3);equal(gapFromDesign(.299999,.1).maxGapPx,2);
});
add('hash checkpoint cancellation and command copying during async work',async()=>{
  const e=await make(bitmap(['...'])),c=command(e,{tool:'line',points:[{x:.5,y:.5},{x:2.5,y:.5}],color:[255,0,0,255]}),before=e.token();
  const controller=new AbortController();
  await rejects(()=>e.prepare(c,{...noWait,signal:controller.signal,onProgress:s=>{if(s.phase==='hash')controller.abort();}}),'CANCELLED');
  equal(e.token(),before);
  const result=await e.apply(c,{...noWait,onProgress:s=>{if(s.phase==='start'){c.points[1].x=100;c.color[1]=99;}}});
  bytes(result.image.data,bitmap(['RRR']).data);
});


add('automatic boundary color cardinality limit rejects atomically',async()=>{
  const width=516,height=516,data=new Uint8Array(width*height*4);
  let serial=0;
  for(let y=1;y<height;y+=2)for(let x=1;x<width;x+=2){
    const o=(y*width+x)*4;data[o]=serial>>>16;data[o+1]=(serial>>>8)&255;data[o+2]=serial&255;data[o+3]=255;serial++;
  }
  assert(serial>LIMITS.maxBoundaryColors);
  const e=await make({width,height,data,colorSpace:'srgb',alphaMode:'straight'}),before=e.token();
  await rejects(()=>e.apply(command(e,{tool:'heal',seeds:[{x:0,y:0}],allowExterior:true}),noWait),'RESOURCE_LIMIT');
  equal(e.token(),before);bytes(e.snapshot().image.data,data);
});
add('curve subdivision segment ceiling rejects before raster publication',async()=>{
  const e=await make(bitmap(['.'])),before=e.token(),corners=[[-100000,-100000],[100000,-100000],[100000,100000],[-100000,100000]];
  const points=Array.from({length:128},(_,i)=>({x:corners[i%4][0],y:corners[i%4][1]}));
  await rejects(()=>e.apply(command(e,{tool:'curve',points,color:palette.R}),noWait),'RESOURCE_LIMIT');
  equal(e.token(),before);
});

export {checks};
export async function runSuite() {
  const records=[];
  for(const check of checks){const start=performance.now();try{const details=await check.run();records.push({name:check.name,verdict:'pass',details,ms:performance.now()-start});}catch(e){records.push({name:check.name,verdict:'fail',error:e.stack??String(e),ms:performance.now()-start});}}
  return records;
}
