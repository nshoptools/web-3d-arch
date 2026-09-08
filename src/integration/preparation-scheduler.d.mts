export function scheduleApplicationPreparation(controller:{
 doc:{state:unknown}|null;epoch:number;projectContextGeneration:number;projectId:string;
 session:{user:unknown};remote?:{settings:unknown};visible?:{lease:unknown}|null;
 job:unknown;pendingOperation?:unknown;pendingChange?:unknown;
 editingAllowed():boolean;subscribe(listener:()=>void):()=>void;
 prepareCurrent():Promise<void>;report(error:unknown):unknown;
}):()=>void;
