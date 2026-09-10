export type SourceFrameRequest = Readonly<{
 version:'arch-source-frame/1'; sourceHash:string;
 /** x'=a*x+c*y+tx; y'=b*x+d*y+ty. Signed permutation + translation only. */
 matrix:readonly [number,number,number,number,number,number];
}>;
export type SourceFrameMetadata = Readonly<{
 version:'arch-source-frame/1'; requestedMatrix:readonly number[];
 linearMatrix:readonly number[]; translationGrid:readonly [number,number];
 gridScalePerMm:1000000; rounding:'binary64-exact-nearest-ties-even/1';
 translationErrorUpperMmPerAxis:0.0000005; sourceSnapshotId:number;
 sourceSnapshotGeneration:number; sourceSnapshotSha256:string;
 sourceMetadataSha256:string; geometrySha256:string; requestSha256:string;
 domainCornersGrid:readonly (readonly [number,number])[]; totalErrorBoundMm:null;
}>;
export type RasterFrameMetadata = Readonly<{
 version:'arch-raster-frame/1'; widthPx:number;heightPx:number;
 processedWidthPx:number;processedHeightPx:number;widthMm:number;heightMm:number;
 mmPerPixelX:number;mmPerPixelY:number;axis:'x-right-y-down';
 originMm:readonly [0,0];source:'sealed-RASP/2';
}>;
export interface SourceFrameLease{
 readonly id:number;readonly generation:number;readonly epoch:number;
 readonly byteLength:number;readonly metadata:Record<string,unknown>&{sourceFrame:SourceFrameMetadata};
 bytes():Uint8Array;release():void;
}
/** A registered raster source context (rasterOperation 'buildSourceContext'),
 * addressed by its registry token; the Worker resolves it to its snapshot. */
export type RasterContextToken = Readonly<{kind:'raster-token';token:string;epoch:number}>;
export interface SourceFrameClient{
 sourceFrame(source:Readonly<{id:number;generation:number;epoch:number;bytes():Uint8Array;release():void}>|RasterContextToken,
  request:SourceFrameRequest,options:{generation:number}):Promise<SourceFrameLease>;
}
export class SourceFrameError extends Error{readonly code:string;constructor(code:string);}
export function checkSourceFrameRequest(request:SourceFrameRequest):SourceFrameRequest;
export function encodeSourceFrame(snapshotId:number,snapshotGeneration:number,request:SourceFrameRequest):Uint8Array;
export function applySourceFrame(module:Record<string,any>,snapshotId:number,snapshotGeneration:number,request:SourceFrameRequest,generation:number):number;
/** The one reflection that places a parsed SVG or raster context (X right, Y
 * down) into the manufacturing frame (X right, Y up): y' = heightMm - y, the
 * translation fixed in whole nanometres so the result grid can be checked. */
export const MANUFACTURING_LINEAR:readonly [1,0,0,-1];
export function manufacturingFrame(input:Readonly<{sourceHash:string;heightMm:number}>):Readonly<{
 request:SourceFrameRequest;linearMatrix:readonly [1,0,0,-1];translationNm:readonly [string,string];
}>;

