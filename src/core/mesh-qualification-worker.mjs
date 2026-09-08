import {qualifyMesh,MESH_QUALIFIER_VERSION} from './mesh-qualification.mjs';
self.onmessage=({data})=>{
 if(!data||data.version!==MESH_QUALIFIER_VERSION||typeof data.id!=='string'||!(data.bytes instanceof Uint8Array))return;
 const result=qualifyMesh(data.bytes,{format:data.format,limits:data.limits});
 self.postMessage({version:MESH_QUALIFIER_VERSION,id:data.id,result});
};