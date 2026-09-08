/** Coalesce immutable state/settings changes. This schedules the controller's
 * ordinary cancellable job; it does not create a second native-job scheduler. */
export function scheduleApplicationPreparation(controller){
 let disposed=false,queued=false,running=false,last=null;
 const identity=()=>controller.doc&&controller.editingAllowed()&&controller.session.user
  ?[controller.epoch,controller.projectContextGeneration,controller.projectId,controller.doc.state,controller.remote?.settings,controller.visible?.lease??null]:null;
 const same=(a,b)=>a===b||!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 function changed(){
  if(disposed||queued||running||controller.job||controller.pendingOperation||controller.pendingChange)return;
  const key=identity();if(!key){last=null;return;}if(same(key,last))return;
  queued=true;queueMicrotask(async()=>{
   queued=false;if(disposed||running||controller.job||controller.pendingOperation||controller.pendingChange)return;
   const current=identity();if(!current||same(current,last))return;
   last=current;running=true;
   try{await controller.prepareCurrent();}
   catch(error){
    // A superseded job is already represented by the current state. Reporting
    // its late error would attach a previous account/project failure to this one.
    if(!disposed&&same(current,identity())&&!['CANCELLED','STALE_JOB','ACCESS_CHANGED','PROJECT_LOCKED'].includes(error?.code))controller.report(error);
   }finally{running=false;changed();}
  });
 }
 const unsubscribe=controller.subscribe(changed);changed();
 return ()=>{disposed=true;unsubscribe();};
}
