import {createPrintingAdapters} from '../../src/integration/printing-adapters.mjs';
import type {AppAdapters} from '../../src/app/adapters.mjs';
import type {ExportBindings} from '../../src/integration/export-adapters.mjs';
const printing=createPrintingAdapters({settings:()=>null,context:()=>null,kernelLeases:new WeakMap()});
const app:AppAdapters['printing']=printing;
const exporter:ExportBindings['printing']=printing;
void app;void exporter;
