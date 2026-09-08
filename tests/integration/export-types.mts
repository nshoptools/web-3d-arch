import type {ExportAdapter,AppAdapters} from '../../src/app/adapters.mjs';
import {createExportAdapters,type ExportBindings,type ApplicationArtifact,type FormatOptions} from '../../src/integration/export-adapters.mjs';
declare const bindings:ExportBindings;
const created=createExportAdapters(bindings);
const adapter:ExportAdapter=created;
const composition:AppAdapters={exporter:adapter};
const options:FormatOptions['svg-section']={filename:'Mặt cắt.svg',inspection:false,errorMm:.004,pose:{kind:'manufacturing',restOnBed:false},section:{mode:'single',zMm:1.7,side:'back',color:'material',units:'in'}};
// @ts-expect-error Neither a camera matrix nor scale is an export pose kind.
const invalid:FormatOptions['stl-union']={filename:'bad.stl',inspection:false,errorMm:.004,pose:{kind:'camera',restOnBed:false}};
declare const artifact:ApplicationArtifact;
const metadata=artifact.metadata;
void [composition,options,invalid,metadata];
