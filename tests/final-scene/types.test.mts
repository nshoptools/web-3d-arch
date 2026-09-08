import {createFinalSceneEvidence,type FinalSceneBindings,type FinalSceneEvidence} from '../../src/integration/final-scene-evidence.mjs';
import type {Control,ModelLease} from '../../src/app/adapters.mjs';
import type {ExportBindings} from '../../src/integration/export-adapters.mjs';
import {materialSourceIdsFromState} from '../../src/integration/material-source-ledger.mjs';
import {finalSceneGateState} from '../../src/integration/final-scene-gates.mjs';
declare const bindings:FinalSceneBindings;
declare const model:ModelLease;
declare const control:Control;
const provider=createFinalSceneEvidence(bindings);
const persistedMappingProvider=createFinalSceneEvidence({...bindings,materialSourceIds:materialSourceIdsFromState,gateState:finalSceneGateState});void persistedMappingProvider;
const ohm:Pick<ExportBindings,'finalScene'>={finalScene:provider.describe};void ohm;
const reply=await provider.qualify({model,control});
const e:Readonly<FinalSceneEvidence>=reply.evidence;
const verdict:'pass'|'fail'|'unverified'=e.meshVerdict;
void verdict;await provider.reset();
// @ts-expect-error model is a lease, not a serialized JSON mesh
void provider.qualify({model:{vertices:[],triangles:[]},control});
// @ts-expect-error no inferred true material or gate fallback
createFinalSceneEvidence({...bindings,materialSourceIds:()=>[{materialId:'color-red',materialSourceId:'guessed'}]});
