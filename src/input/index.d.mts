export const VERSION: 'arch-text-source/1';
export const LIMITS: Readonly<{
  fontBytes:16000000;assetBytes:16000000;cacheBytes:64000000;fonts:4;graphemes:500;textCodeUnits:16000;
  lines:64;runs:128;glyphs:4096;pathCommands:100000;paintOperations:65536;paintDepth:32;gradientStops:2048;
  maxEdge:1280;maxPixels:1638400;maxCoordinateMm:10000;svgBytes:1048576;maxJobs:256;maxWork:5000000;
}>;
export class SourceError extends Error {code:string;details:Record<string,unknown>;constructor(code:string,message:string,details?:Record<string,unknown>);}
export type Matrix=[number,number,number,number,number,number];
export type RGBA=[number,number,number,number];
export interface RevisionToken {sourceId:string;revision:number}
export interface AssetRef {id?:string;path?:string;sha256:string;bytes:number;[metadata:string]:unknown}
export interface FontCatalogEntry extends AssetRef {
  id:string;unitsPerEm:number;glyphCount:number;color?:boolean;colorFormat?:'COLRv1'|'CBDT/CBLC';
  axes?:Record<string,{min:number;default:number;max:number}>;defaultVariation?:Record<string,number>;
}
export interface Size {value:number;unit:'mm'|'pt'}
export interface Placement {xMm?:number;yMm?:number;rotationDegrees?:number}
export interface PathCommand {type:'M'|'L'|'Q'|'C'|'Z';values:number[]}
export interface ShapeOptions {language?:string;script?:string;direction?:'ltr'|'rtl';variations?:Record<string,number>}
export interface Glyph {
  glyphId:number;cluster:number;flags:number;x:number;y:number;xOffset:number;yOffset:number;
  xAdvance:number;yAdvance:number;outline?:PathCommand[];
}
export interface ShapedRun {
  id:string;sha256:string;unitsPerEm:number;coordinates:'font-units-y-up';shaper:string;originalText:string;text:string;
  normalization:'NFC';clusterUnit:'utf16-code-unit';language:string;direction:'ltr'|'rtl';variations:Record<string,number>;
  glyphs:Glyph[];advanceX:number;advanceY:number;geometryKind:'outline'|'COLRv1'|'CBDT/CBLC';
}
export interface PaintColor {red:number;green:number;blue:number;alpha:number}
export interface ColorLine {extend:0|1|2;colorStops:{offset:number;isForeground:boolean;color:PaintColor}[]}
export type PaintOperation=
  |{op:'pushTransform';matrix:Matrix}|{op:'popTransform'}
  |{op:'pushClipOutline';glyphId:number;outline:PathCommand[]}
  |{op:'pushClipRectangle';rectangle:[number,number,number,number]}|{op:'popClip'}
  |{op:'solid';isForeground:boolean;color:PaintColor}
  |{op:'linearGradient';colorLine:ColorLine;points:[number,number,number,number,number,number]}
  |{op:'radialGradient';colorLine:ColorLine;circles:[number,number,number,number,number,number]}
  |{op:'sweepGradient';colorLine:ColorLine;center:[number,number];angles:[number,number]}
  |{op:'pushGroup'}|{op:'popGroup';mode:number};
export interface ColorPaint {
  id:string;sha256:string;unitsPerEm:number;coordinates:'font-units-y-up';shaper:string;
  glyphId:number;variations:Record<string,number>;paletteIndex:number;foreground:PaintColor;
  geometryKind:'COLRv1-paint-operations';operations:PaintOperation[];
}
export interface BitmapSource {
  id:string;sha256:string;unitsPerEm:number;coordinates:'font-units-y-up';shaper:string;glyphId:number;
  geometryKind:'bitmap';mimeType:'image/png';bytes:Uint8Array;
  extents:{xBearing:number;yBearing:number;width:number;height:number};
}
export interface FontSource {
  shapeRun(text:string,options?:ShapeOptions):ShapedRun;
  colorPaint(glyphId:number,options?:{variations?:Record<string,number>;paletteIndex?:number;foreground?:PaintColor}):ColorPaint;
  bitmap(glyphId:number):BitmapSource;
}
export interface RunPlan extends ShapeOptions {start:number;end:number;font?:FontCatalogEntry}
export interface LinePlan {runs:RunPlan[];visualOrder:number[]}
export interface CommandBase {version:typeof VERSION;id:string;expected:RevisionToken;size:Size;placement?:Placement}
export interface TextCommand extends CommandBase,ShapeOptions {
  kind:'text';text:string;font:FontCatalogEntry;lineSpacing?:number;letterSpacingMm?:number;
  align?:'left'|'center'|'right';bendDegrees?:number;color?:RGBA;layout?:LinePlan[];
}
export type EmojiSourceSelection={kind:'outline'|'COLRv1'|'CBDT/CBLC';font:FontCatalogEntry}|{kind:'svg';asset:AssetRef};
export interface EmojiCommand extends CommandBase {
  kind:'emoji';collectionId:string;text:string;source:EmojiSourceSelection;variations?:Record<string,number>;
  paletteIndex?:number;foreground?:RGBA;raster?:{width:number;height:number};
}
export interface EmojiItem {
  id:string;emoji:string;glyphId?:number;glyphs?:Record<string,number>;
  vectors?:{path:string;sha256:string;viewBox:string;externalReferences?:string[];[metadata:string]:unknown}[];
  [metadata:string]:unknown;
}
export interface Collection {
  id:string;style:'color'|'monochrome';defaultFontId?:string;fontHash?:string;fonts?:FontCatalogEntry[];
  items:EmojiItem[];aliases?:{emoji:string;canonicalId:string}[];components?:EmojiItem[];[metadata:string]:unknown;
}
export interface Progress {phase:string;work:number;maxWork:number}
export interface Control {
  isCurrent:(expected:RevisionToken)=>boolean;signal?:AbortSignal;onProgress?:(progress:Progress)=>void;
  yieldControl?:()=>Promise<void>;maxWork?:number;
}
export interface RendererWork {expected:RevisionToken;check():void;step(work:number,phase:string):Promise<void>}
export interface Bounds {minX:number;minY:number;maxX:number;maxY:number;width:number;height:number;kind?:string}
export interface RendererIdentity {id:string;engine:string;version:string;colorSpace:string;storage:string}
export interface RasterPreview {
  status:'ready';width:number;height:number;rgba:Uint8Array;sha256:string;renderer:RendererIdentity;
  pixelToSourceMm:Matrix;sampling:Record<string,unknown>;metrics:Record<string,number>|null;
}
export interface RendererGap {status:'renderer-gap';code:'RENDERER_GAP';message:string;details?:Record<string,unknown>}
export type RendererInput=(
  {kind:'COLRv1';text:string;fontHash:string;fontBytes:Uint8Array;paint:ColorPaint;variations:Record<string,number>;emMm:number;unitsPerEm:number;advanceMm:number}
  |{kind:'CBDT/CBLC';fontHash:string;pngHash:string;pngBytes:Uint8Array;pngWidth:number;pngHeight:number;bitmapBoxMm:Bounds}
)&{bounds:Bounds;width:number;height:number};
export interface ColorRenderer {provenance?:RendererIdentity;render(input:RendererInput,work:RendererWork):Promise<Omit<RasterPreview,'status'>>}
export interface TextMapping {
  originalText:string;text:string;normalization:'NFC+line-breaks-LF';graphemes:number;
  mapping:{originalStart:number;originalEnd:number;start:number;end:number}[];
}
export interface Geometry {
  coordinateSpace:{unit:'mm';yAxis:'up';origin:string};
  paths:{id:string;fillRule:'nonzero';fontId:string;fontHash:string;glyphId:number;variations:Record<string,number>;commands:PathCommand[]}[];
  instances:{id:string;pathId:string;matrix:Matrix;line:number;run:number;glyphId:number;
    cluster:{start:number;end:number;unit:'utf16-code-unit-NFC';original:{start:number;end:number}};
    shaping:Omit<Glyph,'glyphId'|'cluster'|'flags'|'outline'>;bendAnchorMm:number;bendAngle:number}[];
  bounds:Bounds|null;text:TextMapping;
  lineMetrics:{line:number;start:number;text:string;baselineY:number;advanceMm:number;clusters:number}[];
  shapedRuns:(ShapedRun&{line:number;run:number})[];
  options:Required<Omit<TextCommand,'version'|'kind'|'id'|'expected'|'text'|'font'|'layout'>>&{emMm:number};
}
export interface SourceAsset {record:AssetRef;bytes:Uint8Array}
export interface Claims {sourceBoundVerified:false;fitVerified:false;meshVerified:false}
export interface Selection {
  collectionId:string;style:'color'|'monochrome';item:EmojiItem;originalText:string;canonicalText:string;
  sourceKind:'outline'|'svg'|'COLRv1'|'CBDT/CBLC';
}
export interface ConversionProposal {
  requiresConfirmation:true;kind:'source-to-rgba8';status:'proposed'|'confirmed';sourceKind:string;
  sourceHashes:string[];raster:{width:number;height:number;sha256:string;pixelToSourceMm:Matrix;renderer:RendererIdentity};
  losses:string[];colorReduction:{status:'not-applied';requiresSeparateHostProposal:true};retained:string[];claims:Claims;
}
export interface PreparedBase {
  version:typeof VERSION;id:string;expected:RevisionToken;artifactHash:string;sourceAssets:SourceAsset[];
  claims:Claims;provenance:{adapter:typeof VERSION;shaper:string;sourcePreserved:true};
}
export interface PreparedPaths extends PreparedBase {
  kind:'paths';geometry:Geometry;svg:Uint8Array|null;selection?:Selection;conversion:null;
  svgExport:{status:'ready';parserViewportToSourceMm:Matrix;expandedSegmentLimit:number}
    |{status:'empty';parserViewportToSourceMm:null}|{status:'resource-limit';code:string;message:string;route:'shared-prepared-curves'};
}
export interface PreparedSvg extends PreparedBase {
  kind:'svg';selection:Selection;originalSvg:Uint8Array;sourceToMm:Matrix;bounds:Bounds;conversion:null;
  coordinateSpace:{unit:'mm';yAxis:'up';origin:string};
  svgContract:{route:'existing-validated-svg-parser';viewBox:[number,number,number,number];features:Record<string,unknown>;notSanitized:true};
}
export interface PreparedColor extends PreparedBase {
  kind:'color-source';selection:Selection;shape:ShapedRun;emMm:number;placement:Matrix;localBounds:Bounds;bounds:Bounds;
  coordinateSpace:{unit:'mm';yAxis:'up';origin:string};
  source:{paint:ColorPaint;paintToSourceMm:Matrix}|{bitmap:BitmapSource&{pngSha256:string;pngWidth:number;pngHeight:number};bitmapBoxMm:Bounds};
  preview:RasterPreview|RendererGap;conversion?:ConversionProposal;proposalHash?:string;
}
export type PreparedSource=PreparedPaths|PreparedSvg|PreparedColor;
export interface Approval {id:string;expected:RevisionToken;proposalHash:string;decision:'accept-source-conversion'}
export interface ConfirmedConversion {
  version:typeof VERSION;id:string;expected:RevisionToken;proposalHash:string;artifactHash:string;
  conversion:ConversionProposal;rasterInput:RasterPreview;
  originalSource:Pick<PreparedColor,'selection'|'source'|'sourceAssets'|'shape'>;
}
export interface TextSourceAdapter {
  prepare(command:TextCommand|EmojiCommand,control:Control):Promise<PreparedSource>;
  confirm(approval:Approval,control:Control):Promise<ConfirmedConversion>;
  cancel(id:string):boolean;
  stats():{cachedFonts:number;cachedBytes:number;jobs:number;active:string|null;pending:string|null};
}
export function createTextSourceAdapter(options:{
  readBytes:(record:AssetRef,options:{signal?:AbortSignal})=>Promise<Uint8Array|ArrayBuffer>;
  createFontSource:(bytes:Uint8Array,entry:FontCatalogEntry)=>Promise<FontSource>;
  collections?:Collection[];renderer?:ColorRenderer;
}):TextSourceAdapter;
export function createNativeColorRenderer(runtime:{engine:string;version:string}):ColorRenderer;
export function artifactHash(value:unknown):Promise<string>;
export function normalizeText(originalText:string):TextMapping;
export function geometryToSvg(geometry:Geometry,fill?:RGBA):Uint8Array|null;

/** Explicit Worker↔main endpoint; does not change the Worker-only capability result. */
export const COLOR_BRIDGE_VERSION:'arch-color-render-bridge/1';
export const COLOR_BRIDGE_LIMITS:Readonly<{
  maxEdge:512;maxPixels:262144;fontBytes:8000000;pngBytes:1048576;decodedPixels:1048576;
  paintOperations:4096;deadlineMs:10000;pollMs:16;
}>;
export interface ColorRendererClient extends ColorRenderer {dispose():void}
export function createColorRendererClient(port:MessagePort,options?:{deadlineMs?:number}):ColorRendererClient;
export interface BridgeTiming {requestId:number;phase:string;ms?:number;elapsedMs?:number;budgetKind?:'font-setup'|'render';limitMs?:number;fontSetupSpentMs?:number}
export function attachMainThreadColorRenderer(port:MessagePort,options:{
  engine:string;version:string;sources:FontCatalogEntry[];isCurrent:(expected:RevisionToken)=>boolean;
  onTiming?:(timing:BridgeTiming)=>void;maxSyncMs?:number;maxFontSetupMs?:number;deadlineMs?:number;
}):{dispose():void;stats():{active:number|null;disposed:boolean;qualifiedSources:number;cachedFonts:number;cachedBytes:number}};