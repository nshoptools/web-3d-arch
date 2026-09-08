import type {SceneContext,ProductInspection} from './final-scene-evidence.mjs';
export const MATERIAL_SOURCE_LEDGER_VERSION:'arch-material-source-ledger/1';
export const MATERIAL_SOURCE_PLAN_VERSION:'arch-material-source-plan/1';
export interface MaterialSourceBinding {materialId:string;materialSourceId:number}
export interface MaterialSourceLedger {
 version:typeof MATERIAL_SOURCE_LEDGER_VERSION;projectId:string;allocationRevision:number;nextId:number;
 /** SHA-256 of canonical JSON of all fields except digest, with entries in ordinal full-ID order. Integrity only, never authorization. */
 digest:string;
 entries:MaterialSourceBinding[];
 provenance:{algorithm:'full-id-sorted-monotonic-u32/1';ordering:'ordinal-utf16-nfc';identity:'full-material-id';retiredEntries:'retained'};
}
export interface MaterialSourcePlan {version:typeof MATERIAL_SOURCE_PLAN_VERSION;ledger:MaterialSourceLedger;bindings:MaterialSourceBinding[];requiresPersistence:boolean}
export class MaterialSourceLedgerError extends Error {code:string;constructor(code:string)}
export function planMaterialSourceIds(input:{projectId:string;materialIds:readonly string[];ledger?:unknown}):Readonly<MaterialSourcePlan>;
export function resolveMaterialSourceIds(input:{projectId:string;materialIds:readonly string[];ledger:unknown}):readonly MaterialSourceBinding[];
export function materialSourceIdsFromState(context:SceneContext,inspection:ProductInspection):readonly MaterialSourceBinding[];
