/** GEO-04 operation selection only; no units/materials/targets are guessed. */
export function meshOperationForParameters(impOp){
 const options={them:{operation:'import-as-part',materialPolicy:'requireDisjointMaterials',requiresTarget:false},
  han:{operation:'union',materialPolicy:'keepSelectedTargetMaterial',requiresTarget:true},
  tru:{operation:'difference',materialPolicy:'keepSelectedTargetMaterial',requiresTarget:true}};
 const selected=Object.hasOwn(options,impOp)?options[impOp]:null;
 if(!selected)throw Object.assign(new Error('MESH_OPERATION_PARAMETER'),{code:'MESH_OPERATION_PARAMETER'});
 return Object.freeze({...selected});
}
