import type {ModelLease} from '../app/adapters.mjs';
import type {PrinterView} from '../contracts/app-bridge.js';
import type {ApplicationContext,FinalSceneEvidence,KernelRecord,PrintingDescriptor,PrintingProvider,Unavailable,VendorId,Data} from './export-adapters.mjs';
export const PRINTING_APP_VERSION:'arch-app-adapters/1';
export const PRINTING_LIMITS:Readonly<{profiles:50;jsonBytes:number;nodes:100000;depth:24;parts:128;materials:64}>;
export interface SealedProfile {payload:Data & {schemaVersion:1;id:string;adapterId:VendorId};sha256:string}
export interface SettingsContext {
 userId:string;
 /** Opaque authority identity, replaced at every auth/access reset. Never reuse. */
 sessionKey:unknown;
 settings:null|{schemaVersion:1;revision:number;values:{printerProfiles?:SealedProfile[];[key:string]:unknown};[key:string]:unknown};
}
export interface PrintingRuntimeEvidence {
 version:'arch-printing-runtime/1';status:'ready';key:string;
 client:KernelRecord['client'];epoch:number;runtimeABI:2;printingABI:1;kernelPrintingABI:2;
 moduleSha256:string;wasmSha256:string;evidenceId:string;
}
export interface PrintingBindings {
 settings():SettingsContext|null;
 context():ApplicationContext|null;
 kernelLeases:WeakMap<ModelLease,KernelRecord>;
 finalScene?(record:KernelRecord,context:ApplicationContext):FinalSceneEvidence|Unavailable;
 runtime?(record:KernelRecord,context:ApplicationContext):PrintingRuntimeEvidence|Unavailable;
}
export interface PrintingDiagnostic {readonly index:number;readonly id:string|null;readonly reasonCode:string;readonly reason:string}
export interface PrintingPreparation {
 readonly version:'arch-printing-app/1';readonly printers:PrinterView[];
 readonly diagnostics:PrintingDiagnostic[];readonly selection:PrintingDescriptor|Unavailable;
}
export interface PrintingAdapters extends PrintingProvider {
 readonly version:'arch-app-adapters/1';readonly capabilities:{id:string;available:boolean;reason?:string}[];
 list(options?:{signal?:AbortSignal}):Promise<PrinterView[]>;
 refresh(options?:{signal?:AbortSignal}):Promise<PrintingPreparation>;
 describe(adapterId:VendorId,context:ApplicationContext):PrintingDescriptor|Unavailable;
 reset():void;dispose():void;
}
export class PrintingAdapterError extends Error {readonly code:string;constructor(code:string)}
export function createPrintingAdapters(bindings:PrintingBindings):PrintingAdapters;
