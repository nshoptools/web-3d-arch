import {exportOptionsSnapshot} from '../app/export-configuration.mjs';
/** The one session key every authority of the application publishes. The printing adapters compare the
 * key of the settings authority with the key of the project context strictly; publishing the bare epoch
 * on one side and epoch:generation on the other made every 3MF path fail with PRINTING_CONTEXT_STALE
 * (audit F-01). The project navigation counter stays in the key so A -> B -> A borrows are retired. */
export function applicationSessionKey(controller){return controller.epoch+':'+controller.projectContextGeneration;}
/** The signed-in account's settings authority, keyed like the project context. */
export function applicationSettings(controller){
 return controller?.session.user?{userId:controller.session.user.id,sessionKey:applicationSessionKey(controller),settings:controller.remote.settings}:null;
}
/** One authority for source, model validation and export. The project navigation
 * counter also retires A -> B -> A borrows with identical final head bytes. */
export function applicationContext(controller){
 if(!controller?.doc||!controller.session.user||!controller.editingAllowed())return null;
 const state=controller.doc.state;
 return {state,userId:controller.session.user.id,projectId:controller.projectId,
  sessionKey:applicationSessionKey(controller),headHash:controller.doc.history.current.stateHash,
  model:controller.visible?.lease??null,assetsMap:new Map([...controller.assets].map(([hash,asset])=>[hash,asset.bytes])),exportOptions:exportOptionsSnapshot(state)};
}
