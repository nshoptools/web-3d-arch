import type {FinalFloatClient,RootReader,FinalExportOptions,FloatConditioningOptions,FloatProposal,SceneGeometryRequest,SceneGeometryMetadata} from '../../src/kernel/final-scene-export/float-runtime.mjs';
declare const client:FinalFloatClient;
declare const reader:RootReader;
declare const options:FinalExportOptions;
const policy:FloatConditioningOptions={version:1,maximumDisplacementMm:0.00001,workLimit:50_000_000};
async function consentFlow(accept:(p:FloatProposal)=>Promise<boolean>){
 const p=await client.prepareFinalFloat(reader,options,policy,{generation:2});
 try{const positions:Float64Array=p.view(3),triangles:Uint32Array=p.view(4);void positions;void triangles;
  if(await accept(p))return await client.confirmFinalFloat(p,{...p.confirmation},{generation:3});
  return null;
 }finally{client.releaseFinalFloat(p);}
}
type RequiredSceneClient={finalSceneGeometry(root:RootReader,request:SceneGeometryRequest,control:{generation:number}):Promise<{bytes:Uint8Array;metadata:{version:'arch-final-scene-geometry/1';sourceSnapshotSha256:string;sourceSnapshotId:number;sourceSnapshotGeneration:number;revision:string;format:'ARCH/1';geometry:'material-union'}}>};
const compatible:RequiredSceneClient=client;void compatible;void consentFlow;
