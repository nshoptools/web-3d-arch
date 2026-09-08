import {materializeSourceLibrary,checkedLibraryPath,SourceLibraryError} from '../../src/integration/source-library.mjs';
import type {SourceDeployment,ArtworkLibrary} from '../../src/integration/source-library.mjs';
import type {SourceCatalogRecord,AssetURL} from '../../docs/text-app/API.mjs';
declare const catalog:SourceCatalogRecord;
declare const manifest:SourceDeployment;
const configured=materializeSourceLibrary({catalog,manifest,origin:'https://app.example',basePath:'/arch/'});
const urls:AssetURL[]=configured.assetURLs;
const path:string=checkedLibraryPath('source-assets/file.png');
const errorCode:string=new SourceLibraryError('LIBRARY_PATH').code;
declare const art:ArtworkLibrary;
const status:'separate-artwork-adapter-required'=art.items[0].selection.status;
void [urls,path,errorCode,status];
// @ts-expect-error Module/runtime creation is not part of materialization
materializeSourceLibrary({catalog,manifest,origin:'https://app.example',Module:{}});
// @ts-expect-error exact manifest version
const bad:SourceDeployment={...manifest,version:'arch-source-deployment/2'};
void bad;

import type {SourceLibraryCatalog,MonoPreview,FontVariantCoverage,SourceLibraryBuildReceipt,CLDRSourceLock} from '../../src/integration/source-library.mjs';
declare const libraryCatalog:SourceLibraryCatalog;
const catalogConfig=materializeSourceLibrary({catalog:libraryCatalog,manifest,origin:'https://app.example'});
declare const preview:MonoPreview;
const coords:[number,number,number,number,number,number]=preview.fontToPixel;
declare const cov:FontVariantCoverage;declare const receipt:SourceLibraryBuildReceipt;declare const cldr:CLDRSourceLock;
void [catalogConfig,coords,cov.bindings[0].unsupported,receipt.inputs,cldr.commit];
