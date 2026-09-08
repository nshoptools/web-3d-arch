import {createTextAdapters,normalizeTextEdit,collectTextAssets} from '../../src/integration/text-adapters.mjs';
import {createSourceCatalog,APP_VERSION,sameTicket} from '../../src/integration/source-catalog.mjs';
import {hash} from '../../src/input/source-contract.mjs';
import {createSourceContext,sourceConfirmation,sourceReceipt} from '../../src/app/source-approval.mjs';
export const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m);};
export const equal=(a,b,m='Not equal')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+'\n'+JSON.stringify(a)+'\n'+JSON.stringify(b));};
export async function rejects(fn,code){try{await fn();}catch(e){if(code)assert(e.code===code,'Expected '+code+', received '+e.code+': '+e.message);return;}throw Error('Expected failure '+code);}
export async function runSuite({fixture,assetURLs,origin,invoke,reset,readFixture,capabilities,onResult=()=>{}}){
  let state=structuredClone(fixture.initialState),assetsMap=new Map(),serial=0,current=null;
  const original=await readFixture(fixture.entries.inter.sha256),originalHash=await hash(original);
  const library=createSourceCatalog({catalog:fixture.catalog,assetURLs,origin});
  const app=createTextAdapters({catalog:library,invoke,context:()=>({state,assetsMap})});
  const control=(onProgress=()=>{},operation='import')=>{
    const abort=new AbortController();const ticket={id:'job-'+(++serial),userId:'user-fixture',projectId:'project-fixture',revision:state.revision,generation:1000+serial};
    const previous=state.content.app.source;
    current={version:APP_VERSION,ticket,signal:abort.signal,onProgress,abort,sourceContext:createSourceContext(operation,previous)};return current;
  };
  const edit=patch=>{state=structuredClone(state);state.content.app.text={...state.content.app.text,...patch};state.revision++;};
  const retainFont=(result)=>{
    const f=result.metadata.font;assetsMap.set(f.sha256,new Uint8Array(original));state=structuredClone(state);
    state.content.app.fontAssets=[...new Set([...(state.content.app.fontAssets??[]),f.sha256])];
    state.provenance.inputFonts={...(state.provenance.inputFonts??{}),[f.sha256]:structuredClone(result.metadata)};state.revision++;return f;
  };
  async function retainSelection(chosen){
    const raw=await hash(chosen.file.bytes);assetsMap.set(raw,new Uint8Array(chosen.file.bytes));const hashes=[raw];
    for(const a of chosen.result.assets??[]){const h=await hash(a.bytes);assetsMap.set(h,new Uint8Array(a.bytes));hashes.push(h);}
    state=structuredClone(state);state.revision++;state.sourceKind=chosen.result.kind;
    state.content.app.source={id:chosen.result.metadata.sourceContext.id,name:chosen.file.name,mediaType:chosen.file.mediaType,kind:chosen.result.kind,raw:{hash:raw,byteLength:chosen.file.bytes.length},revision:0,
      assetHashes:[...new Set(hashes)],metadata:structuredClone(chosen.result.metadata)};
  }
  const candidateFor=async proposal=>{
    const source={...structuredClone(state.content.app.source),id:proposal.result.metadata.sourceContext.id,revision:proposal.result.metadata.sourceContext.revision,metadata:structuredClone(proposal.result.metadata)},map=new Map(assetsMap),r=proposal.result.raster;
    const add=async bytes=>{const h=await hash(bytes);map.set(h,new Uint8Array(bytes));return h;};
    for(const a of proposal.result.assets)await add(a.bytes);
    const rgba=await add(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength)),png=await add(r.preview);
    source.raster={width:r.width,height:r.height,pixelSizeMm:r.pixelSizeMm,rgba,preview:png,originalPreview:png};
    source.assetHashes=[...new Set([...source.assetHashes,...proposal.result.metadata.sourceConversion.assets.map(a=>a.sha256)])];
    return {source,assets:map};
  };
  const tests=[],results=[],test=(name,fn)=>tests.push({name,fn});let imported,selected,converted,firstText;
  test('catalog exposes all original text families/styles with stable IDs',async()=>{
    const fonts=await app.queryFonts('');equal(fonts.length,fixture.catalog.fonts.filter(f=>!f.color).length);
    assert(fonts.some(f=>f.id==='inter'));assert(fonts.every(f=>f.label&&f.style&&f.family));assert(!fonts.some(f=>f.id===fixture.entries.colr.id));
    assert((await app.queryFonts('INTER')).some(f=>f.id==='inter'));fonts[0].label='changed';assert(!(await app.queryFonts('')).some(f=>f.label==='changed'));
  });
  test('Vietnamese search folds accents with versioned label provenance',async()=>{
    const a=await app.queryEmoji('mặt cười'),b=await app.queryEmoji('mat cuoi');equal(a,b);equal(a.entries[0].text,'😀');equal(a.entries[0].verdict,'unverified');
    assert(a.entries[0].previewUrl.startsWith(origin+'/library/'));assert(!a.entries[0].previewUrl.includes('/src/'));
  });
  test('emoji hex/flag/ZWJ queries preserve exact sequence and collection metadata',async()=>{
    const r=await app.queryEmoji('1F600');equal(r.entries[0].id,'1f600');equal(r.collections.length,2);
    const family=await app.queryEmoji('👩🏽‍💻');assert(family.entries.some(x=>x.text==='👩🏽‍💻'));
    const flags=await app.queryEmoji('Flags');assert(flags.total>=200);
  });
  test('emoji pagination has stable total and disjoint 64-entry pages',async()=>{
    const first=await app.queryEmoji(''),next=await app.queryEmoji('',undefined,64);equal(first.entries.length,64);equal(first.total,next.total);
    assert(!next.entries.some(n=>first.entries.some(f=>f.id===n.id)));
  });
  test('explicit mono thumbnail is actual derived source artwork',async()=>{
    const r=await app.queryEmoji('1f600','noto-emoji-monochrome');equal(r.entries.length,1);
    const meta=fixture.catalog.previews.find(p=>p.collectionId==='noto-emoji-monochrome'&&p.itemId==='1f600');
    assert(meta?.sourceKind==='parent-HarfBuzz-mono-planar-preview');assert(meta.sourceHash===fixture.entries.mono.sha256);
  });
  test('default Vietnamese text uses current controller text state and actual parent PNG',async()=>{
    edit({text:'Tiếng Việt\nĐặng',fontId:'inter',asSource:true,sizeMm:'10',lineSpacing:'1.2'});
    const c=control();firstText=await app.prepareText(c);equal(firstText.ticket,c.ticket);equal(firstText.prepared.geometry.text.originalText,state.content.app.text.text);
    assert(firstText.prepared.geometry.paths.length>0&&firstText.prepared.svg instanceof Uint8Array);
    assert(firstText.preview.png[0]===137&&firstText.preview.data.some(v=>v));equal(firstText.assembly.status,'requires-product-assembly');
  });
  test('text edit changes real geometry and retains line/cluster provenance',async()=>{
    const before=firstText.prepared.artifactHash;edit({text:'A\u0308\u0323\nO',xMm:'3.5',yMm:'-2',letterSpacing:'0.25',bend:'30'});
    const next=await app.prepareText(control());assert(next.prepared.artifactHash!==before);
    equal(next.prepared.geometry.text.originalText,'A\u0308\u0323\nO');equal(next.prepared.geometry.lineMetrics.length,2);
    assert(next.prepared.geometry.instances.every(i=>i.cluster.original));equal(next.parameters.coordinateSpace,'mm-y-up');
  });
  test('explicit text group identity survives edit; glyph IDs never become semantic IDs',async()=>{
    state=structuredClone(state);state.provenance.textSourceOptions={groupBinding:{textId:'9007199254740993',sourceId:'18446744073709551615',provenanceId:'52'}};state.revision++;
    const first=await app.prepareText(control());equal(first.preparedGroups.texts[0].id,'9007199254740993');equal(first.preparedGroups.texts[0].sourceId,'18446744073709551615');
    assert(first.preparedGroups.texts[0].geometry.paths.length);equal(first.preparedGroups.regions,[]);
    edit({text:'OO',bend:'0'});const second=await app.prepareText(control());equal(first.preparedGroups.texts[0].id,second.preparedGroups.texts[0].id);
    assert(first.preparedGroups.texts[0].artifactHash!==second.preparedGroups.texts[0].artifactHash);
    const before=state;state=structuredClone(state);state.provenance.textSourceOptions.groupBinding.textId=9;state.revision++;
    await rejects(()=>app.prepareText(control()),'PRODUCT_PERSISTENT_ID');state=structuredClone(before);delete state.provenance.textSourceOptions.groupBinding;state.revision++;
  });
  test('display unit switch preserves canonical mm and source em',async()=>{
    const t=normalizeTextEdit(state.content.app.text,{sizeUnit:'pt'});equal(t.sizeMm,'10');assert(Math.abs(Number(t.sizeDisplay)-10*72/25.4)<1e-6);
    edit(t);const p=await app.prepareText(control());equal(p.prepared.geometry.options.emMm,10);
    const pointEdit=normalizeTextEdit(t,{sizeDisplay:'72'});equal(pointEdit.sizeMm,'25.4');
    edit(pointEdit);equal((await app.prepareText(control())).prepared.geometry.options.emMm,25.4);
  });
  test('font import inspects actual TTF and returns exact owned metadata',async()=>{
    const c=control();const reply=await app.ingest({...c,purpose:'font',file:{name:'Personal Inter.ttf',mediaType:'font/ttf',bytes:original}});
    equal(reply.ticket,c.ticket);equal(reply.kind,'text');imported=retainFont(reply);
    equal(imported.id,'imported:'+originalHash);equal(imported.unitsPerEm,fixture.entries.inter.unitsPerEm);equal(imported.sha256,originalHash);
    assert(imported.axes.wght&&imported.source.originalFileName==='Personal Inter.ttf');assert(reply.metadata.sample.commands>0);
  });
  test('imported font selection uses assetsMap and saved axes after reopen',async()=>{
    app.reset();edit({fontId:imported.id,text:'Đặng Ánh',bend:'0',sizeMm:'12'});
    assert((await app.queryFonts('Personal')).length===0);assert((await app.queryFonts('Inter')).some(f=>f.id===imported.id));
    const p=await app.prepareText(control());equal(p.prepared.sourceAssets[0].record.sha256,originalHash);equal(p.prepared.sourceAssets[0].record.source.originalFileName,'Personal Inter.ttf');
    equal(p.prepared.geometry.shapedRuns[0].variations.wght,imported.axes.wght.default);
  });
  test('stored variable font axes reach shaping and outlines',async()=>{
    state=structuredClone(state);state.provenance.textSourceOptions={variationsByFont:{[imported.id]:{wght:900,opsz:24}}};state.revision++;
    const heavy=await app.prepareText(control());equal(heavy.prepared.geometry.shapedRuns[0].variations.wght,900);
    state.provenance.textSourceOptions.variationsByFont[imported.id].wght=100;state.revision++;
    const light=await app.prepareText(control());assert(heavy.prepared.artifactHash!==light.prepared.artifactHash);
    assert(JSON.stringify(heavy.prepared.geometry.paths)!==JSON.stringify(light.prepared.geometry.paths));
  });
  test('font import accepts actual static metadata with optional name records absent',async()=>{
    const f=fixture.catalog.fonts.find(f=>!f.color&&!f.variable&&f.id!=='inter');assert(f,'Static catalog fixture required');
    const r=await app.ingest({...control(),purpose:'font',state:structuredClone(state),file:{name:'Original.ttf',mediaType:'font/ttf',bytes:await readFixture(f.sha256)}});
    equal(r.metadata.font.sha256,f.sha256);assert(r.metadata.font.family&&r.metadata.sample.commands>0);
  });
  test('ingest uses the supplied frozen controller state snapshot',async()=>{
    const supplied=structuredClone(state);supplied.content.app.text.sizeMm='7';
    const r=await app.ingest({...control(),purpose:'source',state:supplied,file:{name:'snapshot.txt',mediaType:'text/plain',bytes:new TextEncoder().encode('OO')}});
    equal(r.metadata.parameters.sizeMm,7);assert(state.content.app.text.sizeMm!=='7');
  });
  for(const token of fixture.selected)test('monochrome collection selection retains original outlines '+token,async()=>{
    const item=fixture.catalog.collections[1].items.find(x=>x.emoji===token),r=await app.selectEmoji({...control(),id:item.id,collectionId:'noto-emoji-monochrome'});
    equal(r.result.kind,'emoji');equal(r.result.metadata.selection.sourceKind,'outline');
    equal(r.result.metadata.sourceRecords[0].sha256,fixture.entries.mono.sha256);
    assert(r.result.metadata.numericSvgHash);assert(!r.result.raster);assert(!r.result.metadata.rendererGap);
  });
  test('variation alias original token survives selection descriptor and retained source',async()=>{
    const r=await app.selectEmoji({...control(),id:'❤',collectionId:'noto-color-emoji'});
    equal(r.result.metadata.originalText,'❤');equal(JSON.parse(new TextDecoder().decode(r.file.bytes)).originalText,'❤');
    await retainSelection(r);edit({asSource:false});const p=await app.prepareSource(control());
    equal(p.prepared.selection.originalText,'❤');equal(p.prepared.selection.canonicalText,'❤️');
  });
  for(const token of fixture.selected)test('color emoji selection produces exact original source '+token,async()=>{
    if(token==='😀'){state=structuredClone(state);state.provenance.textSourceOptions.groupBinding={textId:'8',sourceId:'9',provenanceId:'10'};state.revision++;}
    const item=fixture.catalog.collections[0].items.find(x=>x.emoji===token),c=control();
    const r=await app.selectEmoji({...c,id:item.id,collectionId:'noto-color-emoji'});equal(r.result.ticket,c.ticket);
    equal(r.result.metadata.originalText,token);equal(r.result.metadata.selection.sourceKind,'COLRv1');
    const font=r.result.assets.find(a=>a.bytes.length===fixture.entries.colr.bytes);assert(font&&await hash(font.bytes)===fixture.entries.colr.sha256);
    if(capabilities.realColor)assert(r.result.preview?.png[0]===137);else assert(r.result.metadata.rendererGap?.status==='renderer-gap');
    assert(!r.result.raster,'Selection cannot publish unconfirmed editable raster');selected=r;
    if(token==='😀'){state=structuredClone(state);delete state.provenance.textSourceOptions.groupBinding;state.revision++;}
  });
  test('selected emoji descriptor and original assets round-trip into source preparation',async()=>{
    await retainSelection(selected);edit({asSource:false,bend:'0',xMm:'0',yMm:'0'});
    const p=await app.prepareSource(control());equal(p.prepared.selection.originalText,'👨‍👩‍👧‍👦');
    equal(p.prepared.sourceAssets[0].record.sha256,fixture.entries.colr.sha256);assert(p.prepared.source.paint.operations.length>0);
  });
  if(capabilities.realColor)test('emoji approval consumes native color proposal and echoes only the bounded generic receipt',async()=>{
    const c=control(undefined,'convert'),proposal=await app.convert({...c,target:'raster',state:structuredClone(state),source:structuredClone(state.content.app.source),assets:new Map(assetsMap)});
    equal(proposal.confirmation.kind,'emoji');const candidate=await candidateFor(proposal),originalCandidate=JSON.stringify(candidate.source);
    const accepted=await app.acceptProposal({...c,...candidate,confirmation:proposal.confirmation,acceptedAtRevision:c.ticket.revision+1});
    equal(Object.keys(accepted).sort(),['confirmation','receipt','ticket','version']);equal(accepted.confirmation,proposal.confirmation);
    equal(sourceReceipt(accepted,{control:c,confirmation:proposal.confirmation,source:candidate.source,acceptedAtRevision:c.ticket.revision+1}),accepted.receipt);
    equal(accepted.receipt.kind,'emoji');equal(accepted.receipt.rgbaHash,candidate.source.raster.rgba);equal(JSON.stringify(candidate.source),originalCandidate);
    equal(await hash(candidate.assets.get(fixture.entries.colr.sha256)),fixture.entries.colr.sha256);
  });
  test('text source file import preserves UTF-8 original and curves',async()=>{
    const bytes=new TextEncoder().encode('Đặng\nA\u0308\u0323'),c=control();
    const result=await app.ingest({...c,purpose:'source',file:{name:'source.txt',mediaType:'text/plain',bytes}});
    equal(result.kind,'text');equal(result.metadata.originalText,'Đặng\nA\u0308\u0323');assert(result.metadata.numericSvgHash&&result.preview.png[0]===137);
    await retainSelection({file:{name:'source.txt',mediaType:'text/plain',bytes},result});
    const p=await app.prepareSource(control());equal(p.prepared.geometry.text.originalText,'Đặng\nA\u0308\u0323');
  });
  test('source conversion is an exact proposal with a real raster and preserved font bytes',async()=>{
    const c=control(undefined,'convert');converted=await app.convert({...c,target:'raster',state:structuredClone(state),source:structuredClone(state.content.app.source),assets:new Map(assetsMap)});
    equal(converted.status,'proposal');assert(converted.result.raster.data.some(v=>v));equal(converted.result.metadata.sourceConversion.status,'proposal');
    assert(converted.result.metadata.claims.meshVerified===false);equal(converted.result.raster.preview[0],137);
  });
  test('approval hook verifies exact descriptor, candidate bytes and returns only a receipt',async()=>{
    const c={...control(),ticket:converted.result.ticket,sourceContext:structuredClone(converted.result.metadata.sourceContext)};
    const candidate=await candidateFor(converted),frozen=JSON.stringify(candidate.source);
    const input={...c,confirmation:converted.confirmation,...candidate,acceptedAtRevision:c.ticket.revision+1};
    await rejects(()=>app.acceptProposal({...input,confirmation:{...input.confirmation,kind:'emoji'}}),'CONFIRMATION_REQUIRED');
    await rejects(()=>app.acceptProposal({...input,confirmation:{...input.confirmation,version:'other'}}),'CONFIRMATION_REQUIRED');
    await rejects(()=>app.acceptProposal({...input,confirmation:{...input.confirmation,approvalHash:'0'.repeat(64)}}),'CONFIRMATION_REQUIRED');
    await rejects(()=>app.acceptProposal({...input,ticket:{...c.ticket,generation:c.ticket.generation+1}}),'CONFIRMATION_TICKET');
    await rejects(()=>app.acceptProposal({...input,acceptedAtRevision:c.ticket.revision+2}),'CONFIRMATION_REVISION');
    const corrupt=new Map(candidate.assets);corrupt.set(candidate.source.raster.rgba,new Uint8Array(converted.result.raster.data.length));
    await rejects(()=>app.acceptProposal({...input,assets:corrupt}),'CONFIRMATION_ASSET_CHANGED');
    await rejects(()=>app.acceptProposal({...input,source:{...candidate.source,id:'wrong-id'}}),'CONFIRMATION_SOURCE');
    await rejects(()=>app.acceptProposal({...input,source:{...candidate.source,revision:candidate.source.revision+1}}),'CONFIRMATION_SOURCE');
    await rejects(()=>app.acceptProposal({...input,sourceContext:{...input.sourceContext,revision:0}}),'CONFIRMATION_CONTEXT');
    const result=await app.acceptProposal(input);
    equal(sourceConfirmation(converted.confirmation),converted.confirmation);
    equal(sourceReceipt(result,{control:c,confirmation:converted.confirmation,source:candidate.source,acceptedAtRevision:input.acceptedAtRevision}),result.receipt);
    equal(Object.keys(result).sort(),['confirmation','receipt','ticket','version']);equal(result.ticket,c.ticket);equal(result.confirmation,input.confirmation);
    equal(result.receipt.acceptedAtRevision,input.acceptedAtRevision);equal(result.receipt.rgbaHash,candidate.source.raster.rgba);
    equal(result.receipt.version,'arch-source-confirmation-receipt/1');equal(JSON.stringify(candidate.source),frozen);
    assert(JSON.stringify(result.receipt).length<2048);await rejects(()=>app.acceptProposal(input),'NO_PROPOSAL');
  });

  test('controller context preserves source identity across edited and repeated conversion',async()=>{
    state=structuredClone(state);state.content.app.source.revision=3;state.revision++;
    const originalId=state.content.app.source.id,raw=state.content.app.source.raw.hash;
    for(const revision of [4,5]){
      const c=control(undefined,'convert');
      equal(c.sourceContext.id,originalId);equal(c.sourceContext.revision,revision);equal(c.sourceContext.predecessor.revision,revision-1);
      const proposal=await app.convert({...c,target:'raster',state:structuredClone(state),source:structuredClone(state.content.app.source),assets:new Map(assetsMap)});
      const candidate=await candidateFor(proposal);
      equal(candidate.source.id,originalId);equal(candidate.source.revision,revision);equal(candidate.source.raw.hash,raw);
      const result=await app.acceptProposal({...c,...candidate,confirmation:proposal.confirmation,acceptedAtRevision:c.ticket.revision+1});
      equal(sourceReceipt(result,{control:c,confirmation:proposal.confirmation,source:candidate.source,acceptedAtRevision:c.ticket.revision+1}),result.receipt);
      equal(result.receipt.sourceRevision,revision);equal(result.receipt.acceptedAtRevision,c.ticket.revision+1);
      state=structuredClone(state);state.revision=c.ticket.revision+1;state.content.app.source=candidate.source;
      state.content.app.source.metadata.confirmationReceipt=structuredClone(result.receipt);assetsMap=candidate.assets;
    }
    const c=control(undefined,'convert'),input={...c,target:'raster',state:structuredClone(state),source:structuredClone(state.content.app.source),assets:new Map(assetsMap)};
    await rejects(()=>app.convert({...input,sourceContext:undefined}),'SOURCE_CONTEXT_REQUIRED');
    await rejects(()=>app.convert({...input,sourceContext:{...c.sourceContext,revision:0}}),'SOURCE_CONTEXT_SUCCESSOR');
    await rejects(()=>app.convert({...input,sourceContext:{...c.sourceContext,predecessor:{...c.sourceContext.predecessor,revision:0}}}),'SOURCE_CONTEXT_PREDECESSOR');
    await rejects(()=>app.convert({...input,sourceContext:{...c.sourceContext,id:'invented-replacement'}}),'SOURCE_CONTEXT_SUCCESSOR');
  });
  test('cancel during prepare is atomic across actual transport messages',async()=>{
    const c=control(p=>{if(p.stage==='shape-run')c.abort.abort();});await rejects(()=>app.prepareText(c),'CANCELLED');
  });
  test('changed state revision invalidates a pending operation',async()=>{
    let changed=false;const c=control(p=>{if(!changed&&p.stage==='shape-run'){changed=true;state=structuredClone(state);state.revision++;}});
    await rejects(()=>app.prepareText(c),'STALE_JOB');
  });
  test('reset invalidates proposal and returns no stale approval',async()=>{
    const proposal=await app.convert({...control(undefined,'convert'),target:'raster',state:structuredClone(state),source:structuredClone(state.content.app.source),assets:new Map(assetsMap)});
    await reset();app.reset();await rejects(()=>app.acceptProposal({...control(),confirmation:proposal.confirmation}),'NO_PROPOSAL');
  });
  test('original font bytes unchanged after editing, import and reset',async()=>{equal(await hash(original),originalHash);equal(await hash(await readFixture(originalHash)),originalHash);});
  test('same-Module identity and parent native generation remain separate',async()=>{assert(capabilities.moduleFactories===1);const r=await app.prepareText(control());assert(r.ticket.generation>=1000);equal(r.version,APP_VERSION);equal(r.prepared.version,'arch-text-source/1');});
  test('asset slicing excludes unrelated history/mesh bytes',async()=>{
    const h='f'.repeat(64),all=new Map(assetsMap);all.set(h,new Uint8Array([1,2,3]));assert(!collectTextAssets(state,all).has(h));
  });
  test('missing imported font reference never fetches a fallback',async()=>{
    const before=state;state=structuredClone(state);state.content.app.fontAssets=[];state.revision++;
    await rejects(()=>app.prepareText(control()),'FONT_PROJECT_REFERENCE');state=before;
  });
  test('font import rejects WOFF2/TTC/invalid SFNT instead of inventing a font',async()=>{
    for(const magic of [[0x77,0x4f,0x46,0x32],[0x74,0x74,0x63,0x66],[0,0,0,0]]){
      const bytes=new Uint8Array(64);bytes.set(magic);
      await rejects(()=>app.ingest({...control(),purpose:'font',file:{name:'bad.ttf',mediaType:'font/ttf',bytes}}),'FONT_FORMAT_UNSUPPORTED');
    }
  });
  test('font import rejects malformed table bounds before native parsing',async()=>{
    const bytes=new Uint8Array(original);new DataView(bytes.buffer).setUint32(20,0xffffffff);
    await rejects(()=>app.ingest({...control(),purpose:'font',file:{name:'bad.ttf',mediaType:'font/ttf',bytes}}),'FONT_TABLE_BOUNDS');
  });
  test('font import rejects file resource ceiling',async()=>{await rejects(()=>app.ingest({...control(),purpose:'font',file:{name:'big.ttf',mediaType:'font/ttf',bytes:new Uint8Array(16000001)}}),'RESOURCE_LIMIT');});
  test('font import refuses color sources as monochrome text',async()=>{
    await rejects(async()=>app.ingest({...control(),purpose:'font',file:{name:'color.ttf',mediaType:'font/ttf',bytes:await readFixture(fixture.entries.colr.sha256)}}),'COLOR_FONT_IMPORT_UNSUPPORTED');
  });
  test('catalog URL mapping rejects foreign origins, duplicate URLs and missing assets',async()=>{
    await rejects(async()=>createSourceCatalog({catalog:fixture.catalog,origin,assetURLs:[...assetURLs,{...assetURLs[0],sha256:'a'.repeat(64),url:'https://outside.invalid/x'}]}),'ASSET_URL');
    await rejects(async()=>createSourceCatalog({catalog:fixture.catalog,origin,assetURLs:[...assetURLs,assetURLs[0]]}),'ASSET_MAPPING_DUPLICATE');
    await rejects(()=>app.queryEmoji('😀','unknown'),'UNKNOWN_COLLECTION');await rejects(()=>app.queryEmoji('',undefined,-1),'INVALID_INPUT');
  });
  test('foreign adapter ticket cannot be published',async()=>{
    const bad=createTextAdapters({catalog:library,context:()=>({state,assetsMap}),invoke:async r=>({version:APP_VERSION,ticket:{...r.ticket,generation:r.ticket.generation+1}})});
    await rejects(()=>bad.prepareText(control()),'ADAPTER_TICKET');bad.dispose();
  });
  test('nonfinite text, invalid axes and unsupported commands fail explicitly',async()=>{
    let before=state;state=structuredClone(state);state.content.app.text.sizeMm='NaN';state.revision++;
    await rejects(()=>app.prepareText(control()));state=before;state=structuredClone(state);state.provenance.textSourceOptions.variationsByFont[imported.id].wght=99999;state.revision++;
    await rejects(()=>app.prepareText(control()),'INVALID_VARIATION');state=before;
  });
  test('disposed main adapter rejects access and clears private imports',async()=>{app.dispose();await rejects(()=>app.queryFonts(''),'TEXT_ADAPTER_DISPOSED');});
  for(const t of tests){
    const start=performance.now();let r;
    try{await t.fn();r={name:t.name,ok:true,ms:performance.now()-start};}catch(e){r={name:t.name,ok:false,error:e.stack??String(e)};}
    results.push(r);onResult(r);
  }
  return {results,total:results.length,passed:results.filter(r=>r.ok).length,originalFontHash:originalHash};
}
