import type {SceneContext,ProductInspection,GateState} from './final-scene-evidence.mjs';
export const FINAL_SCENE_GATES_VERSION:'arch-final-scene-gates/1';
export class FinalSceneGateError extends Error {code:string;constructor(code:string)}
/** Requires actual private APMS3/source2 inspector metadata. Unknown/unbound gates throw. */
export function finalSceneGateState(context:SceneContext,inspection:ProductInspection):Readonly<GateState>;
