import * as domain from '../../src/domain/index.mjs';
import {createMechanicsDomainAdapter} from '../../src/kernel/mechanics/src/domain-adapter.mjs';
import {packProductRequest} from '../../src/core/product-operations.mjs';
export const source='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><path id="left" fill="#e04444" fill-rule="evenodd" d="M0 0H20V30H0Z M5 6H9V10H5Z"/><path id="right" fill="#3388ee" d="M20 0H40V30H20Z"/></svg>';
export const products=['keychain','clicky','strap','lego','charm'],artModes=['noi','chim','phang','phang2'];
export const materials=Array.from({length:9},(_,role)=>({role,rgba:[0x30353bff,0xe04444ff,0xffffffff,0x30353bff,0x30353bff,0x548687ff,0x30353bff,0xffffffff,0x30353bff][role],slot:role===1?2:1,origin:0,provenanceId:BigInt(3000+role)}));
export const regions=[{sourceIndex:0,semanticId:9007199254741101n,provenanceId:2001n,material:{role:1,rgba:0xe04444ff,slot:2,origin:1,provenanceId:4001n}},
 {sourceIndex:1,semanticId:9007199254741102n,provenanceId:2002n,material:{role:1,rgba:0x3388eeff,slot:3,origin:1,provenanceId:4002n}}];
export function makeRequest(product,artMode,{sourceHash,headHash,changes=[],schedule,...options}){
 let project=domain.createProject({product,sourceKind:'svg',...(schedule?{schedule:domain.createSchedule(schedule)}:{})});
 if(artMode!==null||changes.length){
  const preview=domain.previewCommand(project,{id:'parameters.set',args:{changes:[...(artMode===null?[]:[{id:'artMode',value:artMode}]),...changes]}});
  if(!preview.ok)throw Error('DOMAIN '+JSON.stringify(preview));project=domain.commitPreview(project,preview).state;
 }
 const a=createMechanicsDomainAdapter(domain)(project);
 const provenance={kind:'product-runtime-test-fixture/1',regionSources:regions.map(r=>({sourceIndex:r.sourceIndex,sourceKey:r.sourceIndex===0?'left':'right',semanticId:r.semanticId.toString()})),materials:[...materials,...regions.map(r=>r.material)].map((m,i)=>({...m,id:'explicit-material-'+m.provenanceId})),notes:'Synthetic authored SVG; default product parameter records unchanged except explicit art-mode selection.'};
 return {project,record:a,packed:packProductRequest({domainRecord:a,headHash,sourceHash,sourceId:9007199254741099n,provenanceId:2000n,regions,materials,upstreamBindings:a.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId),provenance,...options})};
}

export function rasterFixture(){
 const rgba=new Uint8Array(64*48*4);
 for(let y=0;y<48;y++)for(let x=0;x<64;x++){if(x>=8&&x<14&&y>=9&&y<16)continue;rgba.set(x<32?[224,68,68,255]:[51,136,238,255],4*(y*64+x));}
 const options=new Uint8Array(200),d=new DataView(options.buffer);
 [2,200,2,2,360,0,0,0,0,0,0,0,0,0,0,0].forEach((v,i)=>d.setUint32(i*4,v,true));d.setFloat64(64,40,true);
 return {kind:'rgba',bytes:rgba,width:64,height:48,options};
}
export function makeRasterRequest(product,art,{sourceHash,headHash}){
 const r=makeRequest(product,art,{sourceHash,headHash,changes:[
 {id:'k',value:2},{id:'res',value:'360'},{id:'smooth',value:0},{id:'minA',value:0},{id:'denoise',value:0},{id:'eps',value:0},{id:'tension',value:0}]});
 const n=new DataView(r.packed.buffer).getUint32(40,true),provenance=JSON.parse(new TextDecoder().decode(r.packed.slice(-n)));
 provenance.regionSources[0].sourceKey='raster-region:0';provenance.regionSources[1].sourceKey='raster-region:1';
 return {...r,packed:packProductRequest({domainRecord:r.record,headHash,sourceHash,sourceId:9007199254741099n,provenanceId:2000n,
  regions,materials,provenance,upstreamBindings:r.record.records.filter(r=>r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)})};
}
