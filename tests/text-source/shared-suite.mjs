import {VERSION,LIMITS,SourceError,createTextSourceAdapter,normalizeText,artifactHash,geometryToSvg} from '../../src/input/index.mjs';
import {hash,Work,transform} from '../../src/input/source-contract.mjs';
import {validatePaint} from '../../src/input/paint-contract.mjs';
import {pngDimensions} from '../../src/input/emoji-source.mjs';
export const assert=(condition,message='Assertion failed')=>{if(!condition)throw Error(message);};
export const equal=(a,b,message='Not equal')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message+'\nactual '+JSON.stringify(a).slice(0,300)+'\nexpected '+JSON.stringify(b).slice(0,300));};
export const near=(a,b,t=1e-9)=>assert(Math.abs(a-b)<=t,'Expected '+a+' ~= '+b);
export async function rejects(fn,code){try{await fn();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code+': '+e.message);return;}throw Error('Expected failure '+code);}
const expected={sourceId:'source-fixture',revision:3};
export const current=()=>({isCurrent:t=>t.sourceId===expected.sourceId&&t.revision===expected.revision,yieldControl:()=>Promise.resolve()});
export function textCommand(font,extra={}){return {version:VERSION,kind:'text',id:'text-job',expected,text:'Tiếng Việt',font,size:{value:10,unit:'mm'},...extra};}
export function emojiCommand(data,text='😀',kind='COLRv1',extra={}){
  const mono=kind==='outline';
  return {version:VERSION,kind:'emoji',id:'emoji-job',expected,collectionId:mono?'noto-emoji-monochrome':'noto-color-emoji',text,
    source:kind==='svg'?{kind,asset:data.svgAssets[text]}:{kind,font:mono?data.entries.mono:kind==='COLRv1'?data.entries.colr:data.entries.cbdt},
    size:{value:10,unit:'mm'},raster:undefined,...extra};
}
export async function runSharedSuite(data,{createFontSource,reference,renderer,onResult=()=>{},buildSvg}={}){
  const tests=[],results=[],test=(name,fn)=>tests.push({name,fn});
  const make=opts=>createTextSourceAdapter({readBytes:data.readBytes,createFontSource,collections:data.collections,...opts});
  const adapter=make(),inter=data.entries.inter;
  const fakeBytes=new Uint8Array([41,42,43]),fakeEntry={id:'analytic-outline',bytes:3,sha256:await hash(fakeBytes),unitsPerEm:1000,glyphCount:9,axes:{}};
  const square=[{type:'M',values:[0,0]},{type:'L',values:[100,0]},{type:'L',values:[100,100]},{type:'L',values:[0,100]},{type:'Z',values:[]}];
  const fakeShape=(text)=>{
    const glyphs=[...text].map((c,i)=>({glyphId:c===' '?2:1,cluster:i,flags:0,x:500*i+30,y:40,xOffset:30,yOffset:40,xAdvance:500,yAdvance:0,outline:c===' '?[]:structuredClone(square)}));
    return {id:fakeEntry.id,sha256:fakeEntry.sha256,unitsPerEm:1000,coordinates:'font-units-y-up',shaper:'analytic-fixture',originalText:text,text,normalization:'NFC',clusterUnit:'utf16-code-unit',language:'vi',direction:'ltr',variations:{},glyphs,advanceX:500*text.length,advanceY:0,geometryKind:'outline'};
  };
  const fake=opts=>createTextSourceAdapter({readBytes:async()=>fakeBytes,createFontSource:async()=>({shapeRun:fakeShape}),...opts});
  test('Vietnamese actual shaping/contours exactly match reference',async()=>{
    const r=await adapter.prepare(textCommand(inter),current()),shape=r.geometry.shapedRuns[0];
    const ref=await reference('inter','Tiếng Việt',{language:'vi',script:'Latn',direction:'ltr',variations:{opsz:14,wght:400}});
    const plain={...shape};delete plain.line;delete plain.run;equal(plain,ref);
    assert(r.geometry.paths.some(p=>p.commands.filter(c=>c.type==='M').length>1),'holes/accents preserved');
    assert(r.svg instanceof Uint8Array&&r.svg.length>100);
  });
  test('NFD original preserved and NFC shaping/cluster ranges mapped',async()=>{
    const original='Tie\u0302\u0301ng Vie\u0323\u0302t',r=await adapter.prepare(textCommand(inter,{text:original}),current());
    equal(r.geometry.text.originalText,original);equal(r.geometry.text.text,original.normalize('NFC'));
    assert(r.geometry.instances.some(i=>i.cluster.original.end-i.cluster.original.start>1));
    const ref=await reference('inter',original.normalize('NFC'),{language:'vi',script:'Latn',direction:'ltr',variations:{opsz:14,wght:400}});
    const shape={...r.geometry.shapedRuns[0]};delete shape.line;delete shape.run;equal(shape,ref);
  });
  for(const weight of [100,900])test('actual variation outline and shaping weight '+weight,async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'Việt',variations:{wght:weight,opsz:32}}),current());
    const ref=await reference('inter','Việt',{language:'vi',script:'Latn',direction:'ltr',variations:{opsz:32,wght:weight}});
    const shape={...r.geometry.shapedRuns[0]};delete shape.line;delete shape.run;equal(shape,ref);
    equal(r.geometry.paths[0].variations,{opsz:32,wght:weight});
  });
  test('real combining offsets applied once and marks remain disconnected',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'a\u0308\u0323'}),current()),s=r.geometry.shapedRuns[0],scale=10/inter.unitsPerEm;
    assert(s.glyphs.some(g=>g.xOffset!==0||g.yOffset!==0),'fixture must exercise offset');
    r.geometry.instances.forEach((i,n)=>{near(i.matrix[4],s.glyphs[n].x*scale);near(i.matrix[5],s.glyphs[n].y*scale);});
    equal(r.geometry.instances.length,s.glyphs.length);
  });
  test('analytic offset exactly once',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'ab'}),current());
    equal(r.geometry.instances.map(i=>i.matrix.slice(4)),[[.3,.4],[5.3,.4]]);
    equal(r.geometry.bounds,{minX:.3,minY:.4,maxX:6.3,maxY:1.4,width:6,height:.9999999999999999,kind:'conservative-control-hull'});
  });
  test('analytic multiline, CRLF, empty line and line spacing',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'ab\r\n\r\nc',lineSpacing:1.5}),current());
    equal(r.geometry.text.text,'ab\n\nc');equal(r.geometry.lineMetrics.map(l=>l.baselineY),[0,-15,-30]);
    near(r.geometry.instances[2].matrix[5],-29.6);equal(r.geometry.lineMetrics.map(l=>l.advanceMm),[10,0,5]);
  });
  test('pt to mm exact 72pt=25.4mm em',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'a',size:{value:72,unit:'pt'}}),current());
    near(r.geometry.options.emMm,25.4);near(r.geometry.paths[0].commands[1].values[0],2.54);
  });
  test('letter spacing only between clusters, never after last',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'abc',letterSpacingMm:2}),current());
    equal(r.geometry.lineMetrics[0].advanceMm,19);near(r.geometry.instances[2].matrix[4],14.3);
  });
  test('ligature tracking follows shaped clusters, no contour splitting',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'ffi ffi',letterSpacingMm:1}),current()),s=r.geometry.shapedRuns[0];
    const n=new Set(s.glyphs.map(g=>g.cluster)).size;
    near(r.geometry.lineMetrics[0].advanceMm,s.advanceX*10/inter.unitsPerEm+n-1);
  });
  test('center/right alignment uses line advance',async()=>{
    const c=await fake().prepare(textCommand(fakeEntry,{text:'ab',align:'center'}),current()),r=await fake().prepare(textCommand(fakeEntry,{text:'ab',align:'right'}),current());
    near(c.geometry.instances[0].matrix[4],-4.7);near(r.geometry.instances[0].matrix[4],-9.7);
  });
  test('analytic rigid-cluster circular bend and placement',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'ab',bendDegrees:90,placement:{xMm:2,yMm:3,rotationDegrees:90}}),current());
    const i=r.geometry.instances[0],k=Math.PI/20,a=k*2.5,c=Math.cos(a),s=Math.sin(a);
    const bx=Math.sin(a)/k,by=(1-Math.cos(a))/k,localX=.3-2.5,localY=.4;
    near(i.matrix[4],2-(by+s*localX+c*localY));near(i.matrix[5],3+bx+c*localX-s*localY);
    near(i.matrix[0],-s);near(i.matrix[1],c);near(i.matrix[0]**2+i.matrix[1]**2,1);
  });
  test('negative bend and 0 bend preserve finite transforms',async()=>{
    for(const bendDegrees of [-180,0,180]){
      const r=await fake().prepare(textCommand(fakeEntry,{text:'ab',bendDegrees}),current());
      assert(r.geometry.instances.every(i=>i.matrix.every(Number.isFinite)));
    }
  });
  test('explicit visual order and run spacing',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'ab',letterSpacingMm:2,layout:[{runs:[{start:0,end:1},{start:1,end:2}],visualOrder:[1,0]}]}),current());
    equal(r.geometry.instances.map(i=>i.cluster.start),[1,0]);near(r.geometry.instances[1].matrix[4],7.3);
  });
  test('run font override uses its own axis defaults',async()=>{
    const other={...fakeEntry,id:'second',axes:{wght:{min:1,default:2,max:3}},defaultVariation:{wght:2}};
    const a=fake(),r=await a.prepare(textCommand(fakeEntry,{text:'ab',layout:[{runs:[{start:0,end:1},{start:1,end:2,font:other}],visualOrder:[0,1]}]}),current());
    equal(r.geometry.instances.length,2);
  });
  test('blank/whitespace is explicit empty geometry, no placeholder',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:' \n'}),current());equal(r.geometry.bounds,null);equal(r.svg,null);
    equal(await hash(r.sourceAssets[0].bytes),inter.sha256);
  });
  test('source bytes unchanged and returned edits cannot poison cache',async()=>{
    const before=await hash(await data.readBytes(inter)),r=await adapter.prepare(textCommand(inter,{text:'O'}),current());
    r.sourceAssets[0].bytes.fill(0);r.geometry.paths[0].commands[0].values[0]=999;
    const next=await adapter.prepare(textCommand(inter,{text:'O'}),current());
    equal(await hash(next.sourceAssets[0].bytes),before);equal(await hash(await data.readBytes(inter)),before);
    assert(next.geometry.paths[0].commands[0].values[0]!==999);
  });
  test('safe generated SVG contains numeric paths and no user markup',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'<script>'}),current()),s=new TextDecoder().decode(r.svg);
    assert(!s.includes('<script>')&&!s.includes('foreignObject')&&!s.includes('href='));
  });
  test('artifact identity stable through structured-clone roundtrip',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'a'}),current()),copy=structuredClone(r),without={...copy};delete without.artifactHash;
    equal(await artifactHash(without),r.artifactHash);
  });
  for(const token of data.selected){
    test('selected monochrome catalog '+token,async()=>{
      const r=await adapter.prepare(emojiCommand(data,token,'outline'),current());
      equal(r.kind,'paths');equal(r.selection.originalText,token);equal(r.sourceAssets[0].record.sha256,data.entries.mono.sha256);
      assert(r.geometry.paths[0].commands.length>0);
    });
    test('selected original SVG '+token,async()=>{
      const r=await adapter.prepare(emojiCommand(data,token,'svg'),current());
      equal(r.kind,'svg');equal(await hash(r.originalSvg),data.svgAssets[token].sha256);equal(r.coordinateSpace.yAxis,'up');
      const v=r.svgContract.viewBox,m=r.sourceToMm;
      const top=transform(m,v[0],v[1]),bottom=transform(m,v[0],v[1]+v[3]);near(top[1],10);near(bottom[1],0);
    });
    test('selected full COLRv1 graph '+token,async()=>{
      const r=await adapter.prepare(emojiCommand(data,token),current());
      equal(r.kind,'color-source');assert(r.source.paint.operations.length>0);equal(r.preview.status,'renderer-gap');
      const ref=await reference('colr',token,{language:'und',script:'Zyyy',direction:'ltr',variations:{}},'paint');
      equal(r.source.paint,ref);
      equal(r.sourceAssets[0].record.sha256,data.entries.colr.sha256);
    });
  }
  const cbdtAdapter=make();
  for(const token of data.selected)test('selected original CBDT PNG '+token,async()=>{
    const r=await cbdtAdapter.prepare(emojiCommand(data,token,'CBDT/CBLC'),current()),b=r.source.bitmap;
    equal(await hash(b.bytes),b.pngSha256);equal(pngDimensions(b.bytes),{width:136,height:128});assert(r.localBounds.width>0&&r.localBounds.height>0);
    equal(b.bytes, (await reference('cbdt',token,{language:'und',script:'Zyyy',direction:'ltr',variations:{}},'bitmap')).bytes);
  });
  test('ZWJ, flags and variation aliases are exact tokens',async()=>{
    const r=await adapter.prepare(emojiCommand(data,'❤'),current());equal(r.selection.originalText,'❤');equal(r.selection.canonicalText,'❤️');
    await rejects(()=>adapter.prepare(emojiCommand(data,'❤\uFE0E'),current()),'UNKNOWN_EMOJI');
    await rejects(()=>adapter.prepare(emojiCommand(data,'😀😀'),current()),'UNKNOWN_EMOJI');
  });
  test('placement rotates paint coordinate mapping once',async()=>{
    const r=await adapter.prepare(emojiCommand(data,'😀','COLRv1',{placement:{xMm:20,yMm:30,rotationDegrees:90}}),current()),m=r.source.paintToSourceMm;
    near(m[0],0);near(m[1],10/1024);near(m[4],20);near(m[5],30);
  });
  test('Noto flag retains linear gradients and compositing groups',async()=>{
    const r=await adapter.prepare(emojiCommand(data,'🇻🇳'),current()),ops=r.source.paint.operations;
    assert(ops.some(o=>o.op==='linearGradient'));assert(ops.some(o=>o.op==='popGroup'&&o.mode===20));
    assert(ops.some(o=>o.op==='pushClipOutline'));assert(ops.some(o=>o.op==='pushTransform'));
  });
  for(const [name,patch,code] of [
    ['NaN em',{size:{value:NaN,unit:'mm'}},'INVALID_INPUT'],
    ['infinite placement',{placement:{xMm:Infinity}},'INVALID_INPUT'],
    ['axis outside actual range',{variations:{wght:901}},'INVALID_VARIATION'],
    ['unknown axis',{variations:{FAKE:1}},'INVALID_VARIATION'],
    ['oversized graphemes',{text:'a'.repeat(501)},'RESOURCE_LIMIT'],
    ['oversized codeunits',{text:'a'.repeat(16001)},'INVALID_INPUT'],
    ['too many lines',{text:'\n'.repeat(64)},'RESOURCE_LIMIT'],
    ['bad surrogate',{text:'\ud800'},'INVALID_TEXT'],
    ['tab policy',{text:'a\tb'},'ITEMIZATION_REQUIRED'],
    ['mixed script itemization',{text:'Latin العربية'},'ITEMIZATION_REQUIRED'],
    ['bidi controls',{text:'a\u202Eb'},'ITEMIZATION_REQUIRED'],
    ['unknown request key',{surprise:true},'INVALID_INPUT'],
    ['bad script tag',{script:'<Latn>'},'INVALID_INPUT'],
    ['empty bend advance',{text:'',bendDegrees:30},'INVALID_LAYOUT'],
    ['bad line partition',{text:'abc',layout:[{runs:[{start:1,end:3}],visualOrder:[0]}]},'INVALID_INPUT'],
    ['bad visual order',{text:'ab',layout:[{runs:[{start:0,end:1},{start:1,end:2}],visualOrder:[0,0]}]},'INVALID_INPUT'],
    ['split NFD grapheme',{text:'a\u0308\u0323',layout:[{runs:[{start:0,end:1},{start:1,end:2}],visualOrder:[0,1]}]},'INVALID_INPUT'],
  ])test('reject '+name,()=>rejects(()=>adapter.prepare(textCommand(inter,patch),current()),code));
  test('wrong font bytes/hash fail before font factory',async()=>{
    let called=false;const bad=make({readBytes:async()=>new Uint8Array(inter.bytes),createFontSource:async()=>{called=true;}});
    await rejects(()=>bad.prepare(textCommand(inter),current()),'HASH_MISMATCH');equal(called,false);
  });
  test('font size/resource rejected before injected byte reader',async()=>{
    let called=false;const bad=make({readBytes:async()=>{called=true;}});
    await rejects(()=>bad.prepare(textCommand({...inter,bytes:LIMITS.fontBytes+1}),current()),'INVALID_INPUT');equal(called,false);
  });
  test('missing glyph has explicit failure, never fallback',async()=>{
    await rejects(()=>adapter.prepare(textCommand(inter,{text:'\u{10FFFF}',script:'Zyyy'}),current()),'MISSING_GLYPH');
  });
  test('selected collection cannot silently switch monochrome/font/art',async()=>{
    await rejects(()=>adapter.prepare(emojiCommand(data,'😀','outline',{collectionId:'noto-color-emoji'}),current()),'COLLECTION_SOURCE_MISMATCH');
    await rejects(()=>adapter.prepare(emojiCommand(data,'😀','COLRv1',{source:{kind:'COLRv1',font:data.entries.cbdt}}),current()),'COLLECTION_SOURCE_MISMATCH');
    await rejects(()=>adapter.prepare(emojiCommand(data,'😀','svg',{source:{kind:'svg',asset:data.svgAssets['🇻🇳']}}),current()),'COLLECTION_SOURCE_MISMATCH');
  });
  test('source revision check is mandatory and stale start does no reads',async()=>{
    await rejects(()=>adapter.prepare(textCommand(inter),{}),'INVALID_INPUT');
    let read=false;const a=make({readBytes:async()=>{read=true;}});
    await rejects(()=>a.prepare(textCommand(inter),{isCurrent:()=>false}),'STALE_SOURCE');equal(read,false);
  });
  test('cancel during asynchronous source read publishes nothing',async()=>{
    let release,entered;const ready=new Promise(r=>entered=r);
    const a=make({readBytes:async ref=>{entered();await new Promise(r=>release=r);return data.readBytes(ref);}});
    const promise=a.prepare(textCommand(inter),current());await ready;equal(a.cancel('text-job'),true);release();
    await rejects(()=>promise,'CANCELLED');equal(a.stats().pending,null);equal(a.stats().active,null);
  });
  test('stale after yielding before publication is atomic',async()=>{
    let valid=true;const a=fake();
    await rejects(()=>a.prepare(textCommand(fakeEntry,{text:'a'}),{isCurrent:()=>valid,onProgress:p=>{if(p.phase==='prepared')valid=false;},yieldControl:()=>Promise.resolve()}),'STALE_SOURCE');
    equal(a.stats().pending,null);
  });
  test('AbortSignal early and late checkpoints',async()=>{
    const a=fake(),s=new AbortController();s.abort();
    await rejects(()=>a.prepare(textCommand(fakeEntry),{...current(),signal:s.signal}),'CANCELLED');
    const s2=new AbortController();
    await rejects(()=>a.prepare(textCommand(fakeEntry),{...current(),signal:s2.signal,onProgress:p=>{if(p.phase==='place-line')s2.abort();}}),'CANCELLED');
  });
  test('bounded work rejects before publication',async()=>{
    await rejects(()=>fake().prepare(textCommand(fakeEntry,{text:'abc'}),{...current(),maxWork:2}),'RESOURCE_LIMIT');
  });
  test('one active job enforced',async()=>{
    let release;const a=fake({readBytes:async()=>{await new Promise(r=>release=r);return fakeBytes;}});
    const first=a.prepare(textCommand(fakeEntry,{text:'a'}),current());
    while(!release)await new Promise(r=>setTimeout(r,0));
    await rejects(()=>a.prepare(textCommand(fakeEntry),current()),'BUSY');release();await first;
  });
  test('catalog upem mismatch detected by actual font reader',async()=>{
    await rejects(()=>make().prepare(textCommand({...inter,unitsPerEm:1000}),current()),'FONT_READER_ERROR');
  });
  test('paint validates all blend modes and refuses unmatched/unknown operations',async()=>{
    const base=[{op:'pushClipRectangle',rectangle:[0,0,100,100]},{op:'pushGroup'},{op:'solid',color:{red:255,green:0,blue:0,alpha:255}}];
    for(let mode=0;mode<28;mode++)assert(validatePaint({operations:[...base,{op:'popGroup',mode},{op:'popClip'}]},.01,new Work(expected)).width===1);
    await rejects(async()=>validatePaint({operations:[{op:'unknown'}]},1,new Work(expected)),'UNSUPPORTED_PAINT');
    await rejects(async()=>validatePaint({operations:[...base,{op:'popClip'}]},1,new Work(expected)),'INVALID_PAINT');
  });
  test('gradient ties/repeat/reflect and nonfinite validation',async()=>{
    const prefix={op:'pushClipRectangle',rectangle:[0,0,100,100]},stop={offset:.5,color:{red:1,green:2,blue:3,alpha:4},isForeground:false};
    for(let extend=0;extend<3;extend++)validatePaint({operations:[prefix,{op:'sweepGradient',center:[0,0],angles:[0,Math.PI*2],colorLine:{extend,colorStops:[stop,stop]}},{op:'popClip'}]},.01,new Work(expected));
    await rejects(async()=>validatePaint({operations:[prefix,{op:'radialGradient',circles:[0,0,0,1,1,NaN],colorLine:{extend:0,colorStops:[stop]}},{op:'popClip'}]},1,new Work(expected)),'INVALID_INPUT');
  });
  test('path and paint resource ceilings',async()=>{
    const a=fake({createFontSource:async()=>({shapeRun:t=>{const s=fakeShape(t);s.glyphs[0].outline=Array.from({length:LIMITS.pathCommands+1},()=>square[0]);return s;}})});
    await rejects(()=>a.prepare(textCommand(fakeEntry,{text:'a'}),current()),'RESOURCE_LIMIT');
    await rejects(async()=>validatePaint({operations:Array(LIMITS.paintOperations+1).fill({op:'popClip'})},1,new Work(expected)),'RESOURCE_LIMIT');
  });
    test('SVG viewport transform restores baseline source coordinates',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'ab',placement:{xMm:20,yMm:-7}}),current());
    const m=r.svgExport.parserViewportToSourceMm,b=r.geometry.bounds;
    equal(transform(m,0,0),[b.minX,b.maxY]);equal(transform(m,b.width,b.height),[b.maxX,b.minY]);
  });
  test('public SVG helper rejects markup-valued numbers/colors',async()=>{
    const r=await fake().prepare(textCommand(fakeEntry,{text:'a'}),current());
    const bad=structuredClone(r.geometry);bad.paths[0].commands[0].values[0]='" /><script>';
    await rejects(async()=>geometryToSvg(bad),'INVALID_INPUT');
    await rejects(async()=>geometryToSvg(r.geometry,['<svg>',0,0,255]),'INVALID_INPUT');
  });
  test('large repeated text retains shared curves when optional SVG reaches parser limit',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'S'.repeat(500)}),current());
    equal(r.geometry.instances.length,500);equal(r.geometry.paths.length,1);
    if(r.geometry.paths[0].commands.length*500>16384){equal(r.svg,null);equal(r.svgExport.status,'resource-limit');}
    assert(r.geometry.bounds.width>0);
  });
  test('nonserializable command and shared source bytes rejected',async()=>{
    await rejects(()=>fake().prepare(textCommand(fakeEntry,{layout:()=>{}}),current()),'INVALID_INPUT');
    if(typeof SharedArrayBuffer==='function'){
      const a=fake({readBytes:async()=>new Uint8Array(new SharedArrayBuffer(3))});
      await rejects(()=>a.prepare(textCommand(fakeEntry,{text:'a'}),current()),'RESOURCE_LIMIT');
    }
  });
  test('color component selection is available only in its declared collection',async()=>{
    const component=data.collections.find(c=>c.style==='color').components[0];
    const r=await adapter.prepare(emojiCommand(data,component.emoji),current());
    equal(r.selection.item.id,component.id);assert(r.source.paint.operations.length>0);
    await rejects(()=>adapter.prepare(emojiCommand(data,component.emoji,'outline'),current()),'UNKNOWN_EMOJI');
  });
    test('real RTL run matches explicitly selected reference direction',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'Việt',direction:'rtl'}),current()),s={...r.geometry.shapedRuns[0]};
    delete s.line;delete s.run;
    equal(s,await reference('inter','Việt',{language:'vi',script:'Latn',direction:'rtl',variations:{opsz:14,wght:400}}));
    r.geometry.instances.forEach((i,n)=>near(i.matrix[4],s.glyphs[n].x*10/inter.unitsPerEm));
  });
  test('bend rotates a real base/mark cluster together',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'a\u0308\u0323',bendDegrees:70}),current()),is=r.geometry.instances;
    assert(is.length>1);equal(new Set(is.map(i=>i.bendAnchorMm)).size,1);
    const dx=(is[1].shaping.x-is[0].shaping.x)*10/inter.unitsPerEm,dy=(is[1].shaping.y-is[0].shaping.y)*10/inter.unitsPerEm,a=is[0].bendAngle;
    near(is[1].matrix[4]-is[0].matrix[4],Math.cos(a)*dx-Math.sin(a)*dy);
    near(is[1].matrix[5]-is[0].matrix[5],Math.sin(a)*dx+Math.cos(a)*dy);
  });
  test('holes and tiny disconnected contours are never filtered or joined',async()=>{
    const commands=[...square,{type:'M',values:[20,20]},{type:'L',values:[20,45]},{type:'L',values:[45,45]},{type:'L',values:[45,20]},{type:'Z',values:[]},
      {type:'M',values:[101,101]},{type:'L',values:[101.001,101]},{type:'L',values:[101.001,101.001]},{type:'Z',values:[]}];
    const a=fake({createFontSource:async()=>({shapeRun:t=>{const s=fakeShape(t);s.glyphs[0].outline=commands;return s;}})});
    const r=await a.prepare(textCommand(fakeEntry,{text:'a'}),current()),p=r.geometry.paths[0].commands;
    equal(p.filter(c=>c.type==='M').length,3);equal(p.length,commands.length);near(p.at(-2).values[0],1.01001);
  });
  test('actual font axes override falsely widened catalog ranges',async()=>{
    const entry=structuredClone(inter);entry.axes.wght.max=1000;
    await rejects(()=>make().prepare(textCommand(entry,{variations:{wght:999}}),current()),'INVALID_VARIATION');
  });
  test('four-font cache ceiling is enforced without unbounded eviction/reload',async()=>{
    const a=fake();
    for(let i=0;i<4;i++)await a.prepare(textCommand({...fakeEntry,id:'f'+i},{text:'a'}),current());
    equal(a.stats().cachedFonts,4);equal(a.stats().cachedBytes,12);
    await rejects(()=>a.prepare(textCommand({...fakeEntry,id:'fifth'},{text:'a'}),current()),'RESOURCE_LIMIT');
  });
  test('unknown collection and catalog glyph mismatch fail explicitly',async()=>{
    await rejects(()=>adapter.prepare(emojiCommand(data,'😀','COLRv1',{collectionId:'system-font'}),current()),'UNKNOWN_COLLECTION');
    const list=structuredClone(data.collections),item=list[0].items.find(i=>i.emoji==='😀');item.glyphs[data.entries.colr.id]++;
    const a=make({collections:list});
    await rejects(()=>a.prepare(emojiCommand(data),current()),'CATALOG_GLYPH_MISMATCH');
  });
  if(buildSvg)test('generated Vietnamese SVG accepted by existing kernel parser/extruder',async()=>{
    const r=await adapter.prepare(textCommand(inter,{text:'Việt O'}),current()),out=await buildSvg(r.svg);
    assert(out.bytes>64);assert(out.metadata.importLedger);equal(out.metadata.totalErrorBoundMm,null);
  });
  for(const {name,fn} of tests){
    const start=performance.now();
    try{await fn();results.push({name,ok:true,ms:Math.round((performance.now()-start)*10)/10});}
    catch(e){results.push({name,ok:false,error:e.message+'\n'+(e.stack??'')});}
    onResult(results.at(-1));
  }
  return results;
}
