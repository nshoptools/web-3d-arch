export const VERSION: 'arch-raster-edit/1';
export const LIMITS: Readonly<{
  maxEdge:number; maxPixels:number; maxPoints:number; maxSeeds:number; maxSegments:number;
  maxCoordinate:number; maxWidth:number; maxGap:number; maxBoundaryColors:number;
  maxWork:number; checkpointWork:number; maxMemoryBytes:number; maxMetadataBytes:number;
}>;
export class EditError extends Error { code:string; details:Record<string,unknown>; constructor(code:string,message:string,details?:Record<string,unknown>); }
export type Color = readonly [number,number,number] | readonly [number,number,number,number];
export interface Point { x:number; y:number; pressure?:number; }
export interface RasterImage {
  width:number; height:number; data:Uint8Array | Uint8ClampedArray; colorSpace:'srgb'; alphaMode:'straight';
}
export interface Source {
  id:string; hash:string; adapterId:string; adapterVersion:string;
}
export interface RevisionToken {
  readonly sourceId:string; readonly sourceHash:string; readonly originalHash:string;
  readonly revision:number; readonly hash:string;
}
export interface Bounds { x:number; y:number; width:number; height:number; }
export interface Progress {
  phase:string; work:number; maxWork:number; completed:number|null; total:number|null;
}
export interface Control {
  signal?:AbortSignal; onProgress?:(progress:Progress)=>void;
  /** Worker scheduler override; default yields a task using setTimeout. Do not override with microtasks in production. */
  yieldControl?:()=>Promise<void>;
  maxWork?:number; checkpointWork?:number;
}
interface Common { version:typeof VERSION; id:string; expected:RevisionToken; opacity?:number; }
interface Stroke { points:readonly Point[]; width?:number; brush?:'round'|'square'; snap?:'none'|'45'; }
interface DestructiveMode { mode?:'hole'|'merge'; color?:Color|'auto'; }
export type GestureCommand = Common & (
  {tool:'paint'; seeds:readonly Point[]; color:Color; tolerance?:number; connectivity?:4|8; blend?:'replace'|'source-over'} |
  ({tool:'line'|'curve'; color:Color; blend?:'replace'|'source-over'} & Stroke) |
  ({tool:'erase'|'cut'} & Stroke & DestructiveMode) |
  ({tool:'crop'; from:Point; to:Point; shape?:'rectangle'|'ellipse'; keep?:'inside'|'outside'; square?:boolean} & DestructiveMode) |
  {tool:'heal'; method?:'region'; seeds:readonly Point[]; allowExterior?:boolean; color?:Color|'auto'} |
  ({tool:'heal'; method:'brush'; color?:Color|'auto'} & Stroke) |
  {tool:'heal'; method:'all-gaps'; maxGapPx:number; pixelSizeMm:number; color?:Color|'auto'}
);
export interface UndoPayload {
  version:typeof VERSION; id:string; width:number; height:number; base:RevisionToken; afterHash:string;
  changedBounds:Bounds; changedPixels:number; command:GestureCommand; before:Uint8Array; after:Uint8Array;
}
export interface PreparedEdit {
  version:typeof VERSION; status:'prepared'; id:string; expected:RevisionToken; hash:string;
  image:RasterImage; changedBounds:Bounds|null; changedPixels:number; undoBytes:number;
}
export interface EditResult {
  version:typeof VERSION; status:'committed'|'unchanged'; id:string; token:RevisionToken;
  image:RasterImage; changedBounds:Bounds|null; changedPixels:number; undo:UndoPayload|null; direction?:'undo'|'redo';
}
export interface Snapshot { version:typeof VERSION; source:Source; token:RevisionToken; image:RasterImage; }
export interface OriginalSnapshot { version:typeof VERSION; source:Source; hash:string; image:RasterImage; }
export interface EditorInput { source:Source; image:RasterImage; revision?:number; }
export class RasterEditor {
  private constructor();
  static create(input:EditorInput):Promise<RasterEditor>;
  readonly busy:boolean;
  token():RevisionToken;
  snapshot():Snapshot;
  original():OriginalSnapshot;
  prepare(command:GestureCommand,control?:Control):Promise<PreparedEdit>;
  /** Required token must be the controller's CURRENT source/revision, not a cached preview token. */
  commit(id:string,currentToken:RevisionToken):EditResult;
  /** Convenience only when this editor is the authoritative source/revision owner. */
  apply(command:GestureCommand,control?:Control):Promise<EditResult>;
  cancel(id:string):boolean;
  replay(payload:UndoPayload,direction:'undo'|'redo',expected:RevisionToken,control?:Control):Promise<EditResult>;
}
export function createEditor(input:EditorInput):Promise<RasterEditor>;
export function normalizeCommand(command:GestureCommand):GestureCommand;
export function encodeUndo(payload:UndoPayload):Uint8Array;
export function decodeUndo(encoded:Uint8Array|Uint8ClampedArray):UndoPayload;
export function undoByteLength(payload:UndoPayload):number;
export function pressureScale(pressure?:number):number;
export function snap45(start:Point,end:Point):Point;
export type Affine = [number,number,number,number,number,number];
export function imageToDevice(point:Point,matrix:Affine):Point;
export function deviceToImage(point:Point,matrix:Affine):Point;
export function gapFromDesign(maxGapMm:number,pixelSizeMm:number):{maxGapPx:number;pixelSizeMm:number;resolvedGapMm:number};
export type WorkerRequest = {requestId:string} & (
  {type:'init';input:EditorInput} | {type:'snapshot';original?:boolean} |
  {type:'prepare'|'apply';command:GestureCommand;control?:Pick<Control,'maxWork'|'checkpointWork'>} |
  {type:'commit';gestureId:string;expected:RevisionToken} | {type:'cancel';gestureId:string} |
  {type:'replay';payload:UndoPayload;direction:'undo'|'redo';expected:RevisionToken;control?:Pick<Control,'maxWork'|'checkpointWork'>}
);
export type WorkerResponse =
  {type:'progress';requestId:string;progress:Progress} |
  {type:'error';requestId:string|null;error:{code:string;message:string;details:Record<string,unknown>}} |
  {type:'result';requestId:string;result:PreparedEdit|EditResult|Snapshot|OriginalSnapshot|{cancelled:boolean}|{version:typeof VERSION;limits:typeof LIMITS;token:RevisionToken}};
