import type {SourceCatalogRecord,AssetURL} from '../../docs/text-app/API.mjs';
export class SourceLibraryError extends Error {constructor(code:string);code:string}
export interface DeploymentAsset {
 sha256:string;bytes:number;mediaType:'image/png'|'image/svg+xml'|'font/ttf'|'text/plain'|'application/json';
 /** Repository-relative original/derived source; never a machine path. */
 file:string;
 /** Safe relative deployment URL, materialized by the explicit origin/basePath. */
 url:string;originalFiles:string[];roles:string[];
}
export interface SourceDeployment {version:'arch-source-deployment/1';records:DeploymentAsset[];totalUniqueBytes:number;sourceFileCount:number}
export interface ArtworkLibrary {
 version:'arch-source-artwork-library/1';source:{catalog:string;sha256:string};
 items:{id:string;kind:'original-artwork';file:string;bytes:number;sha256:string;emojiIds:string[];
  license:{file:string;sha256:string;bytes:number};
  selection:{status:'separate-artwork-adapter-required';reason:string};[key:string]:unknown}[];
}
export function checkedLibraryPath(value:string):string;
export function materializeSourceLibrary(input:{catalog:SourceCatalogRecord;manifest:SourceDeployment;origin:string;basePath?:string}):{catalog:SourceCatalogRecord;assetURLs:AssetURL[];origin:string};
export interface CheckedFile {file:string;bytes:number;sha256:string}
export interface CLDRSourceLock {
 version:'arch-cldr-source-lock/1';project:string;release:string;repository:string;tag:string;commit:string;releaseReference:string;license:'Unicode-3.0';
 files:(CheckedFile & {sourcePath:string;url:string})[];
}
export interface CLDRSearchLabels {
 version:string;source:string;license:{spdx:'Unicode-3.0';file:string};
 entries:{collectionId:string;itemId:string;vi:string;keywords:string[];cldrKey:string;sourceFile:string;match:'exact'|'qualified-token-without-FE0F'}[];
 coverage:{total:number;translated:number;missingCount:number;missing:{collectionId:string;itemId:string;originalName:string}[]};
}
export type SourceLibraryCatalog = SourceCatalogRecord & {libraryVersion:'arch-source-library/1';labels:CLDRSearchLabels};
export interface MonoPreview {
 itemId:string;emoji:string;glyphId:number;fontId:string;fontSha256:string;variations:Record<string,number>;
 /** Unicode codepoint indices, not UTF-8 byte or UTF-16 offsets. */
 shape:{glyphId:number;clusterCodepoints:number;xAdvance:number;yAdvance:number;xOffset:number;yOffset:number}[];
 outlineSha256:string;svgSha256:string;commands:number;contours:number;controlBounds:[number,number,number,number];
 /** Font-unit coordinates to PNG pixels, Y down. Apply recorded shaping offsets too. */
 fontToPixel:[number,number,number,number,number,number];
 file:string;sha256:string;bytes:number;width:128;height:128;alphaBounds:[number,number,number,number];visiblePixels:number;rgbaSha256:string;
}
export interface FontVariantCoverage {
 version:'arch-library-font-coverage/1';harfbuzz:string;direction:'ltr';script:'Zyyy';language:'und';
 bindings:{fontId:string;fontSha256:string;glyphs:Record<string,number>;supportedCount:number;unsupportedCount:number;
 unsupported:{itemId:string;reason:'missing-glyph'|'not-one-glyph';glyphCount:number}[]}[];
}
export interface SourceLibraryBuildReceipt {
 version:'arch-source-library-build/1';generatorFiles:{file:string;sha256:string}[];nativeToolsSha256:string;
 sourceLocks:CheckedFile[];cldrCommit:string;counts:Record<string,number>;inputs:CheckedFile[];outputs:CheckedFile[];
}
