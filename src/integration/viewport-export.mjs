import {assert,canonicalJSON} from '../app/common.mjs';
/** Bind presentation frames to current private access; never use the camera as export pose. */
export function createViewportExportProvider({viewport,context}){
 const identity=c=>c&&typeof c.userId==='string'&&c.userId&&c.projectId&&c.state?{userId:c.userId,projectId:c.projectId,revision:c.state.revision,headHash:c.headHash,sessionKey:c.sessionKey}:null;
 const unavailable=()=>({status:'disabled',reasonCode:'PNG_VIEWPORT_UNAVAILABLE',reason:'Cần dự án hiện hành và khung 3D hoạt động.'});
 return {
  describe(c){const live=identity(context()),requested=identity(c);if(!live||!requested||live.sessionKey!==requested.sessionKey||live.userId!==requested.userId||live.projectId!==requested.projectId||live.headHash!==requested.headHash||live.revision!==requested.revision)return unavailable();return viewport.describeFrame();},
  async capture(descriptor,control){
   const initial=identity(context());assert(initial,'ACCESS_CHANGED');
   const check=()=>{const live=identity(context());assert(live&&live.sessionKey===initial.sessionKey&&live.userId===initial.userId&&live.projectId===initial.projectId&&live.revision===initial.revision&&live.headHash===initial.headHash,'ACCESS_CHANGED');
    assert(control.context?.sessionKey===live.sessionKey&&control.context?.userId===live.userId&&control.context?.projectId===live.projectId&&control.context?.revision===live.revision&&control.context?.headHash===live.headHash,'PNG_FRAME_STALE');
    assert(!control.signal.aborted,'CANCELLED');assert(canonicalJSON(viewport.describeFrame())===canonicalJSON(descriptor),'PNG_FRAME_STALE');};
   check();const captured=await viewport.capturePNG(descriptor,control);check();return captured;
  }
 };
}
