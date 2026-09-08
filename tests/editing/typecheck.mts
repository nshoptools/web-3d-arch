import {VERSION,createEditor,encodeUndo,decodeUndo,deviceToImage,type GestureCommand,type WorkerRequest} from '../../src/editing/index.mjs';
const editor=await createEditor({
  source:{id:'source/1',hash:'a'.repeat(64),adapterId:'confirmed-raster',adapterVersion:'1'},
  image:{width:1,height:1,data:new Uint8Array(4),colorSpace:'srgb',alphaMode:'straight'},
});
const command:GestureCommand={
  version:VERSION,id:'gesture/1',expected:editor.token(),tool:'line',
  points:[deviceToImage({x:2,y:2},[2,0,0,2,1,1])],color:[255,0,0],width:1,
};
const prepared=await editor.prepare(command);
const budget:number=prepared.undoBytes;
if(budget>=0){
  const result=editor.commit(prepared.id,editor.token());
  if(result.undo)await editor.replay(decodeUndo(encodeUndo(result.undo)),'undo',editor.token());
}
const request:WorkerRequest={type:'prepare',requestId:'request/1',command};
void request;
// @ts-expect-error A region heal has seeds; all-gaps requires a physical pixel scale.
const missingScale:GestureCommand={version:VERSION,id:'gesture/2',expected:editor.token(),tool:'heal',method:'all-gaps',maxGapPx:3};
void missingScale;
