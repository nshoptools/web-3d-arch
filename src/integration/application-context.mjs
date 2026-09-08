import {exportOptionsSnapshot} from '../app/export-configuration.mjs';
/** One authority for source, model validation and export. The project navigation
 * counter also retires A -> B -> A borrows with identical final head bytes. */
export function applicationContext(controller){
 if(!controller?.doc||!controller.session.user||!controller.editingAllowed())return null;
 const state=controller.doc.state;
 return {state,userId:controller.session.user.id,projectId:controller.projectId,
  sessionKey:controller.epoch+':'+controller.projectContextGeneration,headHash:controller.doc.history.current.stateHash,
  model:controller.visible?.lease??null,assetsMap:new Map([...controller.assets].map(([hash,asset])=>[hash,asset.bytes])),exportOptions:exportOptionsSnapshot(state)};
}
