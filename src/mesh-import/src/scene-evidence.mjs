import {canonicalJSON} from '../../storage/common.mjs';
const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{code:c});};
export function captureMeshSceneSemantics(root,inspection){
 const m=root.metadata;
 need(inspection.version==='arch-mesh-model-state/1'&&m?.version==='arch-derived-mesh-scene/1'&&m.kind==='mesh-scene','SCENE_DERIVED_METADATA');
 need(m.applied===true&&m.publication==='confirmed-root-snapshot'&&!m.exportBlocked&&m.postCsgGates?.verdict===0&&!m.postCsgGates.exportBlocked,'SCENE_DERIVED_GATES');
 need(m.mechanicsSemantics===3&&m.sourceSemantics===2&&m.headHash===inspection.head.headHash&&m.revision===inspection.head.revision,'SCENE_DERIVED_HEAD');
 need(m.postCsgGates.version==='arch-mesh-post-csg-gates/1','SCENE_DERIVED_GATES');
 return canonicalJSON(m);
}
export function verifyMeshSceneSemantics(root,stamp){need(canonicalJSON(root.metadata)===stamp,'SCENE_DERIVED_METADATA_CHANGED');}
