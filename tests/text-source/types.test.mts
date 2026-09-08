import {VERSION,createTextSourceAdapter,createNativeColorRenderer, type FontSource,type FontCatalogEntry,type TextCommand,type Collection,type PreparedSource} from '../../src/input/index.mjs';
declare const font:FontCatalogEntry;
declare const factory:(bytes:Uint8Array,entry:FontCatalogEntry)=>Promise<FontSource>;
declare const collections:Collection[];
const source=createTextSourceAdapter({readBytes:async()=>new Uint8Array([1]),createFontSource:factory,collections,renderer:createNativeColorRenderer({engine:'chromium',version:'153.0.8010.12'})});
const command:TextCommand={version:VERSION,kind:'text',id:'job',expected:{sourceId:'s',revision:0},text:'Việt',font,size:{value:12,unit:'pt'},placement:{xMm:2},variations:{wght:600}};
const prepared:PreparedSource=await source.prepare(command,{isCurrent:t=>t.revision===0});
if(prepared.kind==='paths'){
  const d:number[]=prepared.geometry.paths[0].commands[0].values;
  const bytes:Uint8Array|null=prepared.svg;void d;void bytes;
}
if(prepared.kind==='color-source'&&prepared.preview.status==='ready'&&prepared.proposalHash){
  const confirmed=await source.confirm({id:prepared.id,expected:prepared.expected,proposalHash:prepared.proposalHash,decision:'accept-source-conversion'},{isCurrent:()=>true});
  const rgba:Uint8Array=confirmed.rasterInput.rgba;void rgba;
}
// @ts-expect-error Unit requires an explicit supported source size.
command.size={value:2,unit:'px'};
// @ts-expect-error Caller must provide a revision conflict check.
await source.prepare(command,{});
// @ts-expect-error Color is bytes, never arbitrary SVG/CSS markup.
command.color='url(javascript:alert(1))';
// @ts-expect-error Approval must accept the exact source-conversion proposal.
await source.confirm({id:'a',expected:command.expected,proposalHash:'h',decision:'automatic'},{isCurrent:()=>true});

const bridgeModule=await import('../../src/input/index.mjs');
declare const port:MessagePort;
const client=bridgeModule.createColorRendererClient(port,{deadlineMs:5000});
const endpoint=bridgeModule.attachMainThreadColorRenderer(port,{engine:'webkit',version:'26.6',sources:[font],isCurrent:t=>t.revision===0});
client.dispose();endpoint.dispose();
// @ts-expect-error A main endpoint must receive the host revision check.
bridgeModule.attachMainThreadColorRenderer(port,{engine:'webkit',version:'26.6',sources:[font]});